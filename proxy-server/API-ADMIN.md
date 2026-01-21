# Tlink Agentic Admin & API Guide

**Auth**  
All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`. If configured, include OTP/TOTP via `x-admin-otp`.

**Base URLs**  
- Admin UI: `http://localhost:3052/admin`  
- Admin API: `http://localhost:3052/admin/api/*`  
- Public API: `http://localhost:3052/v1/*`

---

## Users
- `GET /admin/api/users?search=&page=&pageSize=` — list users.
- `GET /admin/api/users/:id?includeTokens=0|1` — fetch user (optional tokens).
- `POST /admin/api/users` — create; body supports:
  - `email`, `name`, `allowedProviders`, `allowedModels`, `deniedModels`
  - `allowedModelsByProvider`, `deniedModelsByProvider`
  - `preferredProvider`, `lockedProvider`
  - `rateLimit`, `rateLimitByProvider`
  - `billingLimits` (maxRequests, maxPromptTokens, maxCompletionTokens)
  Returns user + token + optional `verificationUrl`.
- `PATCH /admin/api/users/:id` — update fields above; `active` toggle.
- `POST /admin/api/users/:id/resend` — resend verification email (returns link if email isn’t configured).
- `POST /admin/api/users/:id/tokens` — issue a token; optional `expiresInDays`.
- `DELETE /admin/api/users/:id/tokens/:token` — revoke token.
- `POST /admin/api/users/:id/reset-usage` — reset usage counters.
- `POST /admin/api/users/:id/test` — provider/model routing test; returns provider, model, status, latency.

## Tokens (admin issuance)
- `POST /v1/tokens` — create a user + token in one call.

## Audit
- `GET /admin/api/audit?search=&provider=&status=&reason=&from=&to=&page=&pageSize=` — list audit events.
- `GET /admin/api/audit/export?format=csv` — full CSV export.

## Routing
- `GET /admin/api/routing` — current routing mode/rules (rules empty means built-in heuristics only).
- `POST /admin/api/routing` — set routing `{ "mode": "auto|off", "rules": [...] }`.
- `GET /admin/api/routing/builtins` — view built-in heuristic defaults (intents → provider/model).

## Usage
- `GET /admin/api/usage` — aggregated usage per user (requests/prompt/completion tokens, last provider/model).

## Provider Health
- `GET /admin/api/providers/health` — provider health snapshot.
- `POST /admin/api/providers/health/:provider/suppress` — `{ suppressed: true/false, reason? }`.

## Models (public)
- `GET /v1/models` — proxy-exposed models across providers.

## Self-service (no admin token)
- `POST /v1/self-service/request-token` — email a short-lived token link; always returns `verificationUrl`.
- `GET /v1/self-service/claim?token=&format=json` — claim short-lived token.

## Email Verification
- Links hit `GET /v1/verify-email?token=...`. Configure `SMTP_*` and `PUBLIC_BASE_URL` for real email; otherwise links are logged/returned.

## Headers Recap
- `Authorization: Bearer <ADMIN_TOKEN>`
- Optional: `x-admin-otp: <otp-or-totp-code>` if `ADMIN_OTP_SECRET` or `ADMIN_TOTP_SECRET` is set.

## cURL examples
Set your token first:
```
export ADMIN_TOKEN=YOUR_TOKEN
```

List users:
```
curl -s "http://localhost:3052/admin/api/users?search=&page=1&pageSize=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Create user:
```
curl -s -X POST http://localhost:3052/admin/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","name":"Alice","allowedProviders":["openai","groq"],"preferredProvider":"groq"}'
```

Audit search:
```
curl -s "http://localhost:3052/admin/api/audit?search=alice&provider=groq&page=1&pageSize=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Routing (get current):
```
curl -s http://localhost:3052/admin/api/routing \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Routing (set mode to auto with a custom code rule):
```
curl -s -X POST http://localhost:3052/admin/api/routing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"auto","rules":[{"intent":"code","provider":"openai","model":"gpt-4o"}]}'
```

Routing built-ins:
```
curl -s http://localhost:3052/admin/api/routing/builtins \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Routing (disable auto routing):
```
curl -s -X POST http://localhost:3052/admin/api/routing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"off"}'
```

Routing (set multiple rules):
```
curl -s -X POST http://localhost:3052/admin/api/routing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "mode":"auto",
        "rules":[
          {"intent":"code","provider":"openai","model":"gpt-4o"},
          {"intent":"translate","provider":"openai","model":"gpt-4o-mini"},
          {"intent":"default","provider":"groq","model":"llama-3.1-8b-instant"}
        ]
      }'
```

Provider health:
```
curl -s http://localhost:3052/admin/api/providers/health \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Self-service link (no admin token):
```
curl -s -X POST http://localhost:3052/v1/self-service/request-token \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
```

User tokens & intent examples (public API):

- Issue a token for an existing user (admin):
```
curl -s -X POST http://localhost:3052/admin/api/users/<userId>/tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttlDays":90}'
```

- Revoke a token for a user (admin):
```
curl -X DELETE http://localhost:3052/admin/api/users/<userId>/tokens/<tokenId> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

- Or create user + token in one call (admin):
```
curl -s -X POST http://localhost:3052/v1/tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"alice-2","name":"Alice 2","allowedProviders":["openai","groq"],"preferredProvider":null}'
```

- Use the returned `"token"` for client calls:
```
export USER_TOKEN=PASTE_TOKEN_HERE
```

- Chat (auto/default):
```
curl -s http://localhost:3052/v1/chat/completions \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}],"stream":false}'
```

- Chat with intents (router chooses provider/model):
```
# code/long
curl -s http://localhost:3052/v1/chat/completions \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"generate a python to deploy vnc on linux"}],"intent":"code/long","stream":false}'

# translate/summarize
curl -s http://localhost:3052/v1/chat/completions \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"summarize this request in one line"}],"intent":"translate/summarize","stream":false}'

# vision
curl -s http://localhost:3052/v1/chat/completions \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":[{"type":"text","text":"describe the image"},{"type":"image_url","image_url":{"url":"https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg"}}]}],"intent":"vision","stream":false}'

# audio/transcribe (whisper)
curl -s http://localhost:3052/v1/audio/transcriptions \
  -H "Authorization: Bearer $USER_TOKEN" \
  -F "file=@/path/to/sample.wav" \
  -F "intent=audio" -F "model=auto"
```
