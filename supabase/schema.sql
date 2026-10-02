-- =====================================================================
-- Ironhowl — full database schema
-- Run this whole file once on a fresh Postgres/Supabase database to
-- create every table the game needs. Kept up to date whenever a table
-- is added or changed.
-- =====================================================================

-- Shared helper: keeps updated_at current on every update.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ---------------------------------------------------------------------
-- match_results: one row per finished match (feeds the leaderboard).
-- Server-only: written and read by the game server.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blue_score INTEGER NOT NULL DEFAULT 0,
  red_score INTEGER NOT NULL DEFAULT 0,
  winner TEXT NOT NULL CHECK (winner IN ('blue','red')),
  player_team TEXT NOT NULL CHECK (player_team IN ('blue','red')),
  player_kills INTEGER NOT NULL DEFAULT 0,
  player_deaths INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.match_results TO service_role;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS match_results_created_at_idx ON public.match_results (created_at DESC);

-- ---------------------------------------------------------------------
-- player_profiles: each signed-in player's saved progress.
-- Players may READ their own row; only the game server writes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_profiles (
  user_id UUID PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Player',
  matches_played INTEGER NOT NULL DEFAULT 0,
  matches_won INTEGER NOT NULL DEFAULT 0,
  total_kills INTEGER NOT NULL DEFAULT 0,
  total_deaths INTEGER NOT NULL DEFAULT 0,
  best_headshots INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  shards INTEGER NOT NULL DEFAULT 0,
  alpha_pass_tier INTEGER NOT NULL DEFAULT 0,
  alpha_pass_xp INTEGER NOT NULL DEFAULT 0,
  alpha_pass_claimed INTEGER[] NOT NULL DEFAULT '{}',
  likes_received INTEGER NOT NULL DEFAULT 0,
  likes_given INTEGER NOT NULL DEFAULT 0,
  rank_points INTEGER NOT NULL DEFAULT 0,
  rank_tier TEXT NOT NULL DEFAULT 'Bronze V',
  character_progress JSONB NOT NULL DEFAULT '{}',
  loadout JSONB NOT NULL DEFAULT '{}',
  pet TEXT,
  owned_pets TEXT[] NOT NULL DEFAULT '{}',
  owned_skins TEXT[] NOT NULL DEFAULT '{}',
  equipped_skins JSONB NOT NULL DEFAULT '{}',
  owned_attachments TEXT[] NOT NULL DEFAULT '{}',
  equipped_attachments JSONB NOT NULL DEFAULT '{}',
  vault TEXT[] NOT NULL DEFAULT '{}',
  owned_dances TEXT[] NOT NULL DEFAULT '{}',
  car TEXT,
  owned_cars TEXT[] NOT NULL DEFAULT '{}',
  owned_characters TEXT[] NOT NULL DEFAULT '{}',
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.player_profiles TO authenticated;
GRANT ALL ON public.player_profiles TO service_role;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players view own profile" ON public.player_profiles;
CREATE POLICY "Players view own profile" ON public.player_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS update_player_profiles_updated_at ON public.player_profiles;
CREATE TRIGGER update_player_profiles_updated_at
  BEFORE UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Upgrade path for databases created before onboarding existed.
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS owned_characters TEXT[] NOT NULL DEFAULT '{}';
