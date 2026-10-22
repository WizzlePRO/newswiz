-- When an outlet refuses reader-view fetches (403, robots.txt), stop trying for a while and
-- link its articles straight to the publisher instead.
ALTER TABLE sources ADD COLUMN reader_blocked_until timestamptz;
