alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.draws enable row level security;
alter table public.draw_results enable row level security;
alter table public.draw_cards enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "rooms are publicly readable" on public.rooms;
drop policy if exists "participants public limited read" on public.participants;
drop policy if exists "draws are publicly readable" on public.draws;
drop policy if exists "revealed draw results are publicly readable" on public.draw_results;
drop policy if exists "revealed draw cards are publicly readable" on public.draw_cards;

create policy "rooms are publicly readable"
on public.rooms
for select
to anon, authenticated
using (true);

create policy "participants public limited read"
on public.participants
for select
to anon, authenticated
using (true);

create policy "draws are publicly readable"
on public.draws
for select
to anon, authenticated
using (true);

create policy "revealed draw results are publicly readable"
on public.draw_results
for select
to anon, authenticated
using (is_revealed = true);

create policy "revealed draw cards are publicly readable"
on public.draw_cards
for select
to anon, authenticated
using (is_revealed = true);

grant usage on schema public to anon, authenticated;

revoke all on public.rooms from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.draws from anon, authenticated;
revoke all on public.draw_results from anon, authenticated;
revoke all on public.draw_cards from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select (
  id,
  code,
  title,
  status,
  starts_at,
  ends_at,
  created_at
) on public.rooms to anon, authenticated;

grant select (
  id,
  room_id,
  name,
  created_at
) on public.participants to anon, authenticated;

grant select (
  id,
  room_id,
  draw_mode,
  reveal_mode,
  winner_count,
  participant_count,
  algorithm_version,
  status,
  created_at
) on public.draws to anon, authenticated;

grant select (
  id,
  draw_id,
  participant_id,
  rank,
  is_revealed,
  revealed_at
) on public.draw_results to anon, authenticated;

grant select (
  id,
  draw_id,
  participant_id,
  position,
  is_winner,
  winner_rank,
  is_revealed,
  revealed_at
) on public.draw_cards to anon, authenticated;

-- No public policies or grants are created for audit_logs.
-- Admins should inspect audit_logs directly in Supabase using privileged DB access.
