-- Run: wrangler d1 execute portfolio-db --file=schema.sql
 
-- ── USERS (Discord OAuth accounts) ──
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT    NOT NULL UNIQUE,
  username      TEXT    NOT NULL,
  avatar        TEXT,
  email         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── SESSIONS ──
CREATE TABLE IF NOT EXISTS sessions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  token                 TEXT    NOT NULL UNIQUE,
  discord_id            TEXT    NOT NULL,
  expires_at            TEXT    NOT NULL,
  discord_access_token  TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── GUILDS (servers registered via bot) ──
CREATE TABLE IF NOT EXISTS guilds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL UNIQUE,
  guild_name    TEXT,
  guild_icon    TEXT,
  owner_id      TEXT,
  registered_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── DEI CONFIG ──
CREATE TABLE IF NOT EXISTS dei_config (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id          TEXT    NOT NULL UNIQUE,
  name              TEXT    DEFAULT 'Dei',
  full_name         TEXT    DEFAULT 'Deivon Talvyrvei',
  avatar_url        TEXT    DEFAULT '',
  color             TEXT    DEFAULT 'c4b0f5',
  bio               TEXT    DEFAULT 'An alien woman living on Earth, doing her best.',
  personality_notes TEXT    DEFAULT '',
  response_style    TEXT    DEFAULT 'default',
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── RESPONSE RULES ──
CREATE TABLE IF NOT EXISTS response_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'general',
  keywords      TEXT    NOT NULL,  -- JSON array of trigger words
  responses     TEXT    NOT NULL,  -- JSON array of possible replies
  is_vent       INTEGER NOT NULL DEFAULT 0,  -- 1 = vent channel only
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── MOD LOGS ──
CREATE TABLE IF NOT EXISTS mod_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  action      TEXT    NOT NULL,
  moderator   TEXT    NOT NULL,
  target      TEXT,
  reason      TEXT,
  guild_id    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── CHANNEL CONFIG ──
CREATE TABLE IF NOT EXISTS channel_config (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id         TEXT    NOT NULL UNIQUE,
  log_channel      TEXT    DEFAULT NULL,
  welcome_channel  TEXT    DEFAULT NULL,
  birthday_channel TEXT    DEFAULT NULL,
  vent_channels    TEXT    DEFAULT '[]',
  active_channels  TEXT    DEFAULT '[]'
);
 
-- ── REACTION ROLES ──
CREATE TABLE IF NOT EXISTS reaction_roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  role_id     TEXT NOT NULL,
  role_name   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- ── WARNINGS ──
CREATE TABLE IF NOT EXISTS warnings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  username    TEXT,
  reason      TEXT NOT NULL,
  moderator   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- ── BIRTHDAYS ──
CREATE TABLE IF NOT EXISTS birthdays (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL UNIQUE,
  username    TEXT,
  month       INTEGER NOT NULL,
  day         INTEGER NOT NULL
);
 
-- ── EMBEDS ──
CREATE TABLE IF NOT EXISTS embeds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  title       TEXT,
  description TEXT,
  color       TEXT DEFAULT 'blurple',
  footer      TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- ── FILTER OVERRIDES ──
CREATE TABLE IF NOT EXISTS filter_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  category    TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  added_by    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
 
-- ── SERVER STATS ──
CREATE TABLE IF NOT EXISTS server_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT    NOT NULL UNIQUE,
  member_count    INTEGER DEFAULT 0,
  messages_today  INTEGER DEFAULT 0,
  actions_today   INTEGER DEFAULT 0,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── SITE THEME ──
CREATE TABLE IF NOT EXISTS site_theme (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,
  value         TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── LEVELING CONFIG ──
CREATE TABLE IF NOT EXISTS level_config (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL UNIQUE,
  enabled       INTEGER DEFAULT 1,
  xp_per_msg    INTEGER DEFAULT 15,
  xp_cooldown   INTEGER DEFAULT 60,
  announce_channel TEXT DEFAULT NULL,
  announce_msg  TEXT    DEFAULT 'Congratulations {user}, you reached level {level}!',
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── LEVEL ROLES ──
CREATE TABLE IF NOT EXISTS level_roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL,
  level         INTEGER NOT NULL,
  role_id       TEXT    NOT NULL,
  role_name     TEXT
);
 
-- ── GIVEAWAYS ──
CREATE TABLE IF NOT EXISTS giveaways (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL,
  channel_id    TEXT    NOT NULL,
  message_id    TEXT,
  prize         TEXT    NOT NULL,
  winners       INTEGER DEFAULT 1,
  ends_at       TEXT    NOT NULL,
  host          TEXT,
  status        TEXT    DEFAULT 'active',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── ANNOUNCEMENTS ──
CREATE TABLE IF NOT EXISTS announcements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id      TEXT    NOT NULL,
  channel_id    TEXT    NOT NULL,
  title         TEXT,
  content       TEXT    NOT NULL,
  color         TEXT    DEFAULT 'lavender',
  ping_everyone INTEGER DEFAULT 0,
  sent_at       TEXT    DEFAULT NULL,
  scheduled_at  TEXT    DEFAULT NULL,
  status        TEXT    DEFAULT 'draft',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── SOCIAL ALERTS ──
CREATE TABLE IF NOT EXISTS social_alerts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id            TEXT    NOT NULL,
  platform            TEXT    NOT NULL, -- twitch | youtube | twitter | instagram | tiktok
  enabled             INTEGER DEFAULT 1,
  target_username     TEXT,             -- creator's username/handle
  target_id           TEXT,             -- platform-specific user/channel ID
  discord_channel_id  TEXT    NOT NULL, -- Discord channel ID to post in
  discord_webhook_url TEXT,             -- Discord webhook URL (for Cloudflare-side posting)
  last_post_id        TEXT,             -- polling: last seen post ID
  last_checked        TEXT,             -- polling: last check timestamp
  custom_message      TEXT,             -- optional custom message prefix
  include_preview     INTEGER DEFAULT 1,-- show embed preview
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── TWITCH SUBSCRIPTIONS ──
CREATE TABLE IF NOT EXISTS twitch_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT    NOT NULL,
  alert_id        INTEGER NOT NULL,
  broadcaster_id  TEXT    NOT NULL,
  subscription_id TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── CLIENT ACCOUNTS ──
CREATE TABLE IF NOT EXISTS client_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── CLIENT SESSIONS ──
CREATE TABLE IF NOT EXISTS client_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── PROJECT MESSAGES ──
CREATE TABLE IF NOT EXISTS project_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id   INTEGER NOT NULL,
  sender_type  TEXT    NOT NULL, -- 'client' | 'admin'
  sender_name  TEXT,
  content      TEXT    NOT NULL,
  read         INTEGER DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- ── PROJECT FILES ──
CREATE TABLE IF NOT EXISTS project_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id   INTEGER NOT NULL,
  name         TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  file_type    TEXT    DEFAULT 'deliverable', -- 'deliverable'|'invoice'|'reference'
  uploaded_by  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
 
-- Add client_user_id to inquiries (links inquiry to account)
-- Run this separately if table already exists:
-- ALTER TABLE inquiries ADD COLUMN client_user_id INTEGER DEFAULT NULL;
-- ALTER TABLE inquiries ADD COLUMN project_status TEXT DEFAULT 'inquiry';
