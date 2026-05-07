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
make test
make clean-host-modules
```

ホストで npm 経由にする場合: API＋Vite の起動は **`npm run dev`**（内部で `docker compose`）、コンテナ内だけが使うのは **`dev:app`**（`dev-entrypoint.sh` から実行）。

### Dev Container（Cursor / VS Code）

`[.devcontainer/devcontainer.json](.devcontainer/devcontainer.json)` から `docker-compose.dev.yml` の `dev` サービスに接続できます。

### ホストに残った node_modules を消す

過去にホストで `bun install` 等した場合:

```sh
chmod +x scripts/rm-host-modules.sh
./scripts/rm-host-modules.sh
```

## シード（Docker）

```sh
docker compose -f docker-compose.dev.yml run --rm --entrypoint bun dev run --cwd apps/server scripts/seed.ts
# または
npm run seed
```

## テスト（Docker）

```sh
# ユニット（DB / migration）
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


SQL 断片: `[packages/db/lessons/](packages/db/lessons/)` と `[packages/db/patterns/README.md](packages/db/patterns/README.md)`

## API 概要

- `GET /api/meta/lesson` … 有効な lesson
- `GET|POST|PATCH|DELETE` `/api/todos` `/api/labels` `/api/iterations`
- `GET /api/statuses` … lesson A では既存 TODO 由来 + 既定列
- `GET /api/insights/iterations/:id` … ラベル件数・イベント種別集計
- `GET /api/insights/iterations/:id/replay` … `todo_events` 時系列（lesson c）
- `GET /api/lessons/:lessonId/health` … マイグレーション件数など
