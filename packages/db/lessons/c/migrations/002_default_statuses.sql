-- シードを実行しなくても TODO 作成できるよう、既定のワークフロー列を保証する
INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('todo', 0);
INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('doing', 1);
INSERT OR IGNORE INTO statuses (name, sort_order) VALUES ('done', 2);
