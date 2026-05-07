drop index if exists public.participants_room_id_employee_no_idx;

alter table public.participants
  drop constraint if exists participants_room_id_employee_no_key;

alter table public.participants
  drop constraint if exists participants_employee_no_not_blank;

alter table public.participants
  drop column if exists employee_no;

create unique index if not exists participants_room_id_name_unique_idx
  on public.participants (room_id, lower(btrim(name)));
