-- Enable RLS
-- Players table (linked to auth.users)
create table if not exists players (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text unique not null,
  is_commissioner boolean default false,
  created_at timestamptz default now()
);

-- Rounds
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  course_name text not null,
  course_par integer not null default 72,
  date date not null default current_date,
  status text not null default 'in_progress',
  created_by uuid references players(id),
  created_at timestamptz default now()
);

-- Round participants
create table if not exists round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  player_id uuid references players(id),
  handicap_at_round numeric(4,1) default 0,
  total_score integer,
  unique(round_id, player_id)
);

-- Hole scores (18 holes per player per round)
create table if not exists hole_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  player_id uuid references players(id),
  hole_number integer not null check (hole_number between 1 and 18),
  score integer,
  par integer not null default 4,
  updated_at timestamptz default now(),
  unique(round_id, player_id, hole_number)
);

-- Bets
create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id) on delete cascade,
  type text not null,
  amount numeric(10,2) not null,
  description text,
  created_by uuid references players(id),
  is_settled boolean default false,
  created_at timestamptz default now()
);

-- Bet participants
create table if not exists bet_players (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid references bets(id) on delete cascade,
  player_id uuid references players(id),
  team integer default 1,
  result text default 'pending',
  amount_won_lost numeric(10,2) default 0
);

-- RLS Policies
alter table players enable row level security;
alter table rounds enable row level security;
alter table round_players enable row level security;
alter table hole_scores enable row level security;
alter table bets enable row level security;
alter table bet_players enable row level security;

-- Drop existing policies before recreating (safe to re-run)
drop policy if exists "Players are viewable by all authenticated users" on players;
drop policy if exists "Players can update own profile" on players;
drop policy if exists "Players can insert own profile" on players;

drop policy if exists "Rounds viewable by authenticated" on rounds;
drop policy if exists "Rounds insertable by authenticated" on rounds;
drop policy if exists "Rounds updatable by creator" on rounds;

drop policy if exists "Round players viewable by authenticated" on round_players;
drop policy if exists "Round players insertable by authenticated" on round_players;
drop policy if exists "Round players updatable by authenticated" on round_players;

drop policy if exists "Hole scores viewable by authenticated" on hole_scores;
drop policy if exists "Hole scores insertable by player" on hole_scores;
drop policy if exists "Hole scores updatable by player" on hole_scores;

drop policy if exists "Bets viewable by authenticated" on bets;
drop policy if exists "Bets insertable by authenticated" on bets;
drop policy if exists "Bets updatable by creator" on bets;

drop policy if exists "Bet players viewable by authenticated" on bet_players;
drop policy if exists "Bet players insertable by authenticated" on bet_players;
drop policy if exists "Bet players updatable by authenticated" on bet_players;

-- Recreate all policies
create policy "Players are viewable by all authenticated users" on players for select using (auth.role() = 'authenticated');
create policy "Players can update own profile" on players for update using (auth.uid() = id);
create policy "Players can insert own profile" on players for insert with check (auth.uid() = id);

create policy "Rounds viewable by authenticated" on rounds for select using (auth.role() = 'authenticated');
create policy "Rounds insertable by authenticated" on rounds for insert with check (auth.role() = 'authenticated');
create policy "Rounds updatable by creator" on rounds for update using (auth.uid() = created_by);

create policy "Round players viewable by authenticated" on round_players for select using (auth.role() = 'authenticated');
create policy "Round players insertable by authenticated" on round_players for insert with check (auth.role() = 'authenticated');
create policy "Round players updatable by authenticated" on round_players for update using (auth.role() = 'authenticated');

create policy "Hole scores viewable by authenticated" on hole_scores for select using (auth.role() = 'authenticated');
create policy "Hole scores insertable by player" on hole_scores for insert with check (auth.uid() = player_id);
create policy "Hole scores updatable by player" on hole_scores for update using (auth.uid() = player_id);

create policy "Bets viewable by authenticated" on bets for select using (auth.role() = 'authenticated');
create policy "Bets insertable by authenticated" on bets for insert with check (auth.role() = 'authenticated');
create policy "Bets updatable by creator" on bets for update using (auth.uid() = created_by);

create policy "Bet players viewable by authenticated" on bet_players for select using (auth.role() = 'authenticated');
create policy "Bet players insertable by authenticated" on bet_players for insert with check (auth.role() = 'authenticated');
create policy "Bet players updatable by authenticated" on bet_players for update using (auth.role() = 'authenticated');
