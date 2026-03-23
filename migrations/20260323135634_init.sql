-- Add migration script here
--
CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        phase INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
