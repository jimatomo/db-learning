# db-learning

SQLite（OLTP）と DuckDB（分析クエリの教材）を題材にした TODO アプリです。Bun + React（Vite）で実装し、`LESSON=a|b|c` で **同じ UI からスキーマ段階**を切り替えて体験できます。

## 前提

- [Docker](https://docs.docker.com/get-docker/) と Docker Compose v2
- **ホストに Bun / Playwright / Node は不要**（すべてコンテナ内）

## 開発（Docker）

```sh
# 初回・依存変更後はイメージをビルド
docker compose -f docker-compose.dev.yml up --build
```

- フロント: [http://localhost:5173](http://localhost:5173)（Vite がコンテナ内の API `:3000` にプロキシ）
- API をホストから直叩き: [http://localhost:3001](http://localhost:3001)（`docker-compose.dev.yml` の既定マッピング）

Lesson を変える例（DB ファイルも合わせる）:

```sh
make lesson-a
make lesson-b
make lesson-c
```

既定の `make dev` は Lesson C で起動します。任意の Lesson / DB パスを明示したい場合は次のようにも起動できます。

```sh
make dev LESSON=a DATABASE_PATH=/data/app-a.db
```

停止:

```sh
make dev-down
```

### Makefile（ホストに Node / Bun 不要）

```sh
make dev           # 開発サーバ起動
make lesson-a      # Lesson A に切り替えて起動
make lesson-b      # Lesson B に切り替えて起動
make lesson-c      # Lesson C に切り替えて起動
make dev-down
make seed
make seed-a        # Lesson A の DB にシード投入
make seed-b        # Lesson B の DB にシード投入
make seed-c        # Lesson C の DB にシード投入
make test
```

### Dev Container（Cursor / VS Code）

`[.devcontainer/devcontainer.json](.devcontainer/devcontainer.json)` から `docker-compose.dev.yml` の `dev` サービスに接続できます。

Dev Containerから DuckDB の UI 拡張機能を利用できます。

```sh
duckdb -ui
```

ブラウザで UI が開きます。アプリが使っている **SQLite ファイル**は `docker-compose.dev.yml` のボリューム `/data` 上にあり、既定では `DATABASE_PATH=/data/app-c.db`（`LESSON` が `a` / `b` のときは `app-a.db` / `app-b.db`）です。実際のパスはコンテナのシェルで `echo $DATABASE_PATH` とすると確実です。

SQLite を DuckDB から読むには、UI の SQL エディタで API と同様に **sqlite 拡張**を有効にしてから `sqlite_attach` します（パスは環境に合わせて置き換え）。

```sql
INSTALL sqlite;
LOAD sqlite;
CALL sqlite_attach('/data/app-c.db');
SHOW TABLES;
-- 例: SELECT * FROM todos LIMIT 10;
```

**注意:** 開発サーバが同じ DB を開いているとロックで失敗することがあります。その場合はアプリを止めるか、コピーしたファイルに対して `sqlite_attach` してください。

## シード（Docker）

```sh
docker compose -f docker-compose.dev.yml run --rm --entrypoint bun dev run --cwd apps/server scripts/seed.ts
# または
npm run seed
# Lesson 別に実行する場合
make seed-a
make seed-b
make seed-c
```

## テスト（Docker）

```sh
# ユニット（DB / schema）
make test
```

## インサイト / DuckDB

- 既定の API 実装は **SQLite 上で集計**。DuckDB 向けサンプルは `[packages/db/patterns/insights_duckdb.sql](packages/db/patterns/insights_duckdb.sql)`。
- DuckDB **CLI** がコンテナの PATH にあり、`INSIGHTS_ENGINE=duckdb_cli` のとき、`duckdb -json :memory:` + `sqlite_attach` で同じクエリを実行します（開発 compose の `environment` で指定）。

## 学習用スキーマ

**このリポジトリでいちばん読むべきドキュメント:** [Lesson A/B/C のデータモデルと実践ガイド](docs/data-modeling-lessons.md)（UI 操作の手順付き）

| Lesson | 内容                                    |
| ------ | ------------------------------------- |
| `a`    | `labels_csv` + 文字列 `status`（フラット）     |
| `b`    | `statuses` / `labels` / `todo_labels` |
| `c`    | `b` + 追記専用 `todo_events`（リプレイ・分析）     |


SQL: `[packages/db/lessons/](packages/db/lessons/)` と `[packages/db/patterns/README.md](packages/db/patterns/README.md)`

## API 概要

- `GET /api/meta/lesson` … 有効な lesson
- `GET|POST|PATCH|DELETE` `/api/todos` `/api/labels` `/api/iterations`
- `GET /api/statuses` … lesson A では既存 TODO 由来 + 既定列
- `GET /api/insights/iterations/:id` … ラベル件数・イベント種別集計
- `GET /api/insights/iterations/:id/replay` … `todo_events` 時系列（lesson c）
- `GET /api/lessons/:lessonId/health` … 有効 Lesson と TODO 件数
