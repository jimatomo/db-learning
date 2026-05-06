ALTER TABLE statuses ADD COLUMN color TEXT DEFAULT '#6b7280';

UPDATE statuses
SET color = CASE name
  WHEN 'inbox' THEN '#6b7280'
  WHEN 'todo' THEN '#4a7bd1'
  WHEN 'doing' THEN '#d4662c'
  WHEN 'review' THEN '#8f5bd6'
  WHEN 'waiting' THEN '#b28704'
  WHEN 'done' THEN '#2f8f83'
  ELSE COALESCE(color, '#6b7280')
END
WHERE color IS NULL OR color = '#6b7280';
