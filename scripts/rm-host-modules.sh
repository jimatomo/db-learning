#!/bin/sh
# ホストに誤って作られた node_modules を削除（開発は Docker 前提）
set -e
cd "$(dirname "$0")/.."
rm -rf node_modules apps/server/node_modules apps/web/node_modules packages/db/node_modules
echo "Removed host node_modules under $(pwd)"
