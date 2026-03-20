#!/usr/bin/env bash
set -euo pipefail

TLINK_BUILD_TARGETS=mac \
TLINK_BUILD_MAC_DMG_ONLY=1 \
TLINK_BUILD_MAC_ARCHES="x86_64 arm64" \
./build.sh

