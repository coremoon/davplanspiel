-- ============================================================
-- Versicherungsplanspiel – Supabase Schema v2.3
--
-- Fix v2.3: audit trigger functions run as SECURITY DEFINER
--           so they bypass RLS when writing to audit_log.
-- ============================================================

-- ── Drop old schema ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS groupadmin_data  CASCADE;
DROP TABLE IF EXISTS gamedata         CASCADE;
DROP TABLE IF EXISTS spiel_state      CASCADE;
DROP TABLE IF EXISTS gruppen          CASCADE;
DROP TABLE IF EXISTS spiele           CASCADE;

DROP TABLE IF EXISTS audit_log        CASCADE;
DROP TABLE IF EXISTS group_inputs     CASCADE;
DROP TABLE IF EXISTS game_results     CASCADE;
DROP TABLE IF EXISTS game_state       CASCADE;
DROP TABLE IF EXISTS groups           CASCADE;
DROP TABLE IF EXISTS games            CASCADE;

DROP FUNCTION IF EXISTS update_updated_at()        CASCADE;
DROP FUNCTION IF EXISTS check_group_capacity()     CASCADE;
DROP FUNCTION IF EXISTS check_game_id_available()  CASCADE;
DROP FUNCTION IF EXISTS log_game_event()           CASCADE;
DROP FUNCTION IF EXISTS log_group_event()          CASCADE;

-- ── games ─────────────────────────────────────────────────────────────────

CREATE TABLE games (
  id          TEXT        NOT NULL,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT '',
  config      JSONB       NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'setup'
                          CHECK (status IN ('setup', 'active', 'finished', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
);

-- Only one non-archived game per ID at a time
CREATE UNIQUE INDEX games_active_id_unique
  ON games (id)
  WHERE status != 'archived';

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── groups ────────────────────────────────────────────────────────────────

CREATE TABLE groups (
  game_id     TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, name)
);

-- ── Group capacity trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_group_capacity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  current_count INTEGER;
  max_groups    INTEGER;
BEGIN
  SELECT COUNT(*) INTO current_count
    FROM groups WHERE game_id = NEW.game_id;

  SELECT (config->>'anzahl_gruppen')::INTEGER INTO max_groups
    FROM games WHERE id = NEW.game_id AND status != 'archived'
    LIMIT 1;

  IF max_groups IS NULL THEN
    RAISE EXCEPTION 'Game not found: %', NEW.game_id
      USING ERRCODE = 'P0001';
  END IF;

  IF current_count >= max_groups THEN
    RAISE EXCEPTION 'Game is full: % of % groups registered',
      current_count, max_groups
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_group_capacity
  BEFORE INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION check_group_capacity();

-- ── group_inputs ──────────────────────────────────────────────────────────

CREATE TABLE group_inputs (
  game_id            TEXT    NOT NULL,
  group_name         TEXT    NOT NULL,
  premium_adjustment REAL    NOT NULL,
  dividend_payment   REAL    NOT NULL,
  round              INTEGER NOT NULL,
  PRIMARY KEY (game_id, group_name, round)
);

-- ── game_results ──────────────────────────────────────────────────────────

CREATE TABLE game_results (
  game_id     TEXT    NOT NULL,
  group_name  TEXT    NOT NULL,
  year        INTEGER NOT NULL,
  data        JSONB   NOT NULL,
  PRIMARY KEY (game_id, group_name, year)
);

-- ── game_state ────────────────────────────────────────────────────────────

CREATE TABLE game_state (
  game_id  TEXT  NOT NULL,
  key      TEXT  NOT NULL,
  value    JSONB NOT NULL,
  PRIMARY KEY (game_id, key)
);

-- ── audit_log ─────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  owner_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  game_id     TEXT,
  event       TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_log_owner_idx ON audit_log (owner_id, occurred_at DESC);
CREATE INDEX audit_log_game_idx  ON audit_log (game_id,  occurred_at DESC);
CREATE INDEX audit_log_event_idx ON audit_log (event,    occurred_at DESC);

-- ── Audit trigger: game events ─────────────────────────────────────────────
-- SECURITY DEFINER: runs as the function owner (postgres), bypasses RLS.

CREATE OR REPLACE FUNCTION log_game_event()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (owner_id, game_id, event, payload)
    VALUES (
      NEW.owner_id, NEW.id, 'game.created',
      jsonb_build_object('title', NEW.title, 'config', NEW.config)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'archived' AND OLD.status != 'archived' THEN
    INSERT INTO audit_log (owner_id, game_id, event, payload)
    VALUES (NEW.owner_id, NEW.id, 'game.archived',
            jsonb_build_object('previous_status', OLD.status));
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'finished' AND OLD.status != 'finished' THEN
    INSERT INTO audit_log (owner_id, game_id, event, payload)
    VALUES (NEW.owner_id, NEW.id, 'game.finished',
            jsonb_build_object('config', NEW.config));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_games
  AFTER INSERT OR UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION log_game_event();

-- ── Audit trigger: group events ────────────────────────────────────────────
-- SECURITY DEFINER: runs as the function owner (postgres), bypasses RLS.

CREATE OR REPLACE FUNCTION log_group_event()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id FROM games
    WHERE id = NEW.game_id AND status != 'archived' LIMIT 1;

  INSERT INTO audit_log (owner_id, game_id, event, payload)
  VALUES (v_owner_id, NEW.game_id, 'group.joined',
          jsonb_build_object('group_name', NEW.name));

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_groups
  AFTER INSERT ON groups
  FOR EACH ROW EXECUTE FUNCTION log_group_event();

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_inputs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

-- games
CREATE POLICY "games_read"   ON games FOR SELECT USING (true);
CREATE POLICY "games_insert" ON games FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "games_update" ON games FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "games_delete" ON games FOR DELETE USING (auth.uid() = owner_id);

-- groups
CREATE POLICY "groups_read"   ON groups FOR SELECT USING (true);
CREATE POLICY "groups_insert" ON groups FOR INSERT WITH CHECK (true);
CREATE POLICY "groups_delete" ON groups FOR DELETE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);

-- group_inputs
CREATE POLICY "group_inputs_read"   ON group_inputs FOR SELECT USING (true);
CREATE POLICY "group_inputs_insert" ON group_inputs FOR INSERT WITH CHECK (true);
CREATE POLICY "group_inputs_update" ON group_inputs FOR UPDATE USING (true);
CREATE POLICY "group_inputs_delete" ON group_inputs FOR DELETE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);

-- game_results
CREATE POLICY "game_results_read" ON game_results FOR SELECT USING (true);
CREATE POLICY "game_results_insert" ON game_results FOR INSERT WITH CHECK (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);
CREATE POLICY "game_results_update" ON game_results FOR UPDATE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);
CREATE POLICY "game_results_delete" ON game_results FOR DELETE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);

-- game_state
CREATE POLICY "game_state_read" ON game_state FOR SELECT USING (true);
CREATE POLICY "game_state_insert" ON game_state FOR INSERT WITH CHECK (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);
CREATE POLICY "game_state_update" ON game_state FOR UPDATE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);
CREATE POLICY "game_state_delete" ON game_state FOR DELETE USING (
  auth.uid() = (SELECT owner_id FROM games
    WHERE id = game_id AND status != 'archived' LIMIT 1)
);

-- audit_log: owner reads own entries; no client writes (triggers write via SECURITY DEFINER)
CREATE POLICY "audit_log_read" ON audit_log
  FOR SELECT USING (auth.uid() = owner_id);

-- ── Realtime ──────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE game_results;
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE group_inputs;
ALTER PUBLICATION supabase_realtime ADD TABLE groups;
