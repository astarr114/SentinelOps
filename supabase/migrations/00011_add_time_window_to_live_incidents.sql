-- Add time_window column to live_incidents (used by incident-analyze and UI)
ALTER TABLE live_incidents ADD COLUMN time_window text NOT NULL DEFAULT 'last_30m';