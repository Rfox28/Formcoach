-- FormCoach saved_analyses table.
--
-- No Supabase project exists yet for this app (still pending as of this
-- writing) — this file documents the schema to run once one is created, via
-- the Supabase SQL editor. Two image columns (start + bottom) rather than
-- one, matching the coach-guided frame selection flow: a saved analysis is
-- a before/after pair, not a single freeze frame.

create table saved_analyses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  cue text not null,
  passed boolean not null,
  start_frame_image text not null,
  bottom_frame_image text not null
);

alter table saved_analyses enable row level security;

create policy "coaches manage their own analyses" on saved_analyses
  for all
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);
