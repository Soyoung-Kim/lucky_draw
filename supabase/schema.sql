create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  status text not null default 'open',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint rooms_status_check check (status in ('open', 'closed', 'drawing', 'finished')),
  constraint rooms_code_not_blank check (length(trim(code)) > 0),
  constraint rooms_title_not_blank check (length(trim(title)) > 0),
  constraint rooms_time_range_check check (ends_at >= starts_at)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint participants_name_not_blank check (length(trim(name)) > 0)
);

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  draw_mode text not null,
  reveal_mode text not null,
  winner_count int not null,
  participant_count int not null,
  algorithm_version text not null,
  seed_hash text not null,
  participant_snapshot_hash text not null,
  result_hash text not null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  constraint draws_draw_mode_check check (draw_mode in ('capsule', 'card', 'lotto')),
  constraint draws_reveal_mode_check check (reveal_mode in ('auto', 'manual')),
  constraint draws_status_check check (status in ('created', 'revealing', 'finished')),
  constraint draws_winner_count_check check (winner_count > 0),
  constraint draws_participant_count_check check (participant_count > 0),
  constraint draws_winner_count_lte_participant_count_check check (winner_count <= participant_count),
  constraint draws_algorithm_version_check check (algorithm_version = 'secure-fisher-yates-v1')
);

create table if not exists public.draw_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  rank int not null,
  is_revealed boolean not null default false,
  revealed_at timestamptz,
  constraint draw_results_rank_check check (rank > 0),
  unique (draw_id, rank),
  unique (draw_id, participant_id)
);

create table if not exists public.draw_cards (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  participant_id uuid not null references public.participants(id),
  position int not null,
  is_winner boolean not null default false,
  winner_rank int,
  is_revealed boolean not null default false,
  revealed_at timestamptz,
  constraint draw_cards_position_check check (position > 0),
  constraint draw_cards_winner_rank_check check (
    (is_winner = true and winner_rank is not null and winner_rank > 0)
    or
    (is_winner = false and winner_rank is null)
  ),
  unique (draw_id, position),
  unique (draw_id, participant_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  draw_id uuid references public.draws(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (length(trim(action)) > 0)
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_status_idx on public.rooms (status);

create index if not exists participants_room_id_created_at_idx
  on public.participants (room_id, created_at, id);

create unique index if not exists participants_room_id_name_unique_idx
  on public.participants (room_id, lower(btrim(name)));

create index if not exists draws_room_id_created_at_idx
  on public.draws (room_id, created_at desc);

create index if not exists draw_results_draw_id_rank_idx
  on public.draw_results (draw_id, rank);

create index if not exists draw_results_draw_id_revealed_rank_idx
  on public.draw_results (draw_id, is_revealed, rank);

create index if not exists draw_cards_draw_id_position_idx
  on public.draw_cards (draw_id, position);

create index if not exists draw_cards_draw_id_revealed_position_idx
  on public.draw_cards (draw_id, is_revealed, position);

create index if not exists audit_logs_room_id_created_at_idx
  on public.audit_logs (room_id, created_at desc);

create index if not exists audit_logs_draw_id_created_at_idx
  on public.audit_logs (draw_id, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
    ) then
      alter publication supabase_realtime add table public.rooms;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants'
    ) then
      alter publication supabase_realtime add table public.participants;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draws'
    ) then
      alter publication supabase_realtime add table public.draws;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draw_results'
    ) then
      alter publication supabase_realtime add table public.draw_results;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'draw_cards'
    ) then
      alter publication supabase_realtime add table public.draw_cards;
    end if;
  end if;
end $$;
