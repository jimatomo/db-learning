CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_zone TEXT NOT NULL DEFAULT 'Asia/Tokyo' CHECK (time_zone IN ('UTC', 'Asia/Tokyo'))
);

INSERT OR IGNORE INTO app_settings (id, time_zone) VALUES (1, 'Asia/Tokyo');
