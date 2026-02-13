#!/usr/bin/env bash
set -euo pipefail

# Run dev mode with isolated profile by default so it can coexist with /Applications/Tlink.app.
TLINK_DEV_SEPARATE_PROFILE="${TLINK_DEV_SEPARATE_PROFILE:-1}" yarn start
