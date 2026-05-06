#!/bin/sh
set -e
cd /app
# ホストの bind mount で package.json が変わったときに追従（frozen は使わない）
bun install
exec bun run dev:app
