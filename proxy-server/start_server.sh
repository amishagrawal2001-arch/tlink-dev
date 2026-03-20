#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
    echo "Installing proxy-server dependencies..."
    if [ -f package-lock.json ]; then
        npm ci
    else
        npm install
    fi
fi
echo ""
echo "** http://localhost:3052/admin/?adminToken=TYLLINKNETSTRUCT"

npm start 2>&1 | tee server.log


