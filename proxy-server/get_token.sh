#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

PORT="${PORT:-3052}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
USER_ID="${1:-tyllink}"
USER_NAME="${2:-$USER_ID}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "ADMIN_TOKEN is not set. Add it to .env and restart the proxy server."
    exit 1
fi

create_payload="$(cat <<JSON
{"id":"${USER_ID}","name":"${USER_NAME}","allowedProviders":["openai","groq"],"preferredProvider":""}
JSON
)"

create_response="$(curl -sS -w $'\n%{http_code}' -X POST "http://localhost:${PORT}/v1/tokens" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${create_payload}")"
create_body="${create_response%$'\n'*}"
create_code="${create_response##*$'\n'}"

if [ "$create_code" = "201" ] || [ "$create_code" = "200" ]; then
    printf '%s\n' "$create_body"
    exit 0
fi

if [ "$create_code" = "409" ]; then
    user_response="$(curl -sS -w $'\n%{http_code}' "http://localhost:${PORT}/admin/api/users/${USER_ID}?includeTokens=true" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}")"
    user_body="${user_response%$'\n'*}"
    user_code="${user_response##*$'\n'}"
    if [ "$user_code" = "200" ]; then
        token="$(printf '%s' "$user_body" | node -e "const fs=require('fs');const raw=fs.readFileSync(0,'utf8');const data=JSON.parse(raw);const t=data?.user?.tokens?.[0]?.token||'';if(!t)process.exit(2);process.stdout.write(t);")" || true
        if [ -n "${token:-}" ]; then
            printf '{"token":"%s","user":{"id":"%s"},"source":"existing-user"}\n' "$token" "$USER_ID"
            exit 0
        fi
    fi
    echo "$create_body"
    echo "User exists, but could not fetch token via /admin/api/users/${USER_ID}. Check ADMIN_TOKEN/admin auth settings." >&2
    exit 1
fi

echo "$create_body"
exit 1
