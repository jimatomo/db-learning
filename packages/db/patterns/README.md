# Modeling patterns (reference)

- **Pattern A (flat)**: `labels_csv`, `status` on `todos` — quick to start; renaming labels and consistent aggregates hurt.
- **Pattern B (normalized)**: `labels`, `statuses`, `todo_labels` — stable dimensions and M:N tagging.
- **Pattern C (events)**: `todo_events` — time-travel analytics and replay; write path pairs state update + event insert.

Run the app with `LESSON=a|b|c` to mount the corresponding schema (see root README).

詳細（初学者向けの説明・UI ハンズオン付き）: [docs/data-modeling-lessons.md](../../../docs/data-modeling-lessons.md)
