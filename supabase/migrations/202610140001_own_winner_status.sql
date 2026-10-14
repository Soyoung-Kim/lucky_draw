-- Requires replacement draw migration. Exposes only the looked-up participant's active winner status.
create or replace function public.nds_lucky_100_public(p_action text, p_event uuid, p_name text default null, p_slot integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.nds_lucky_100_events%rowtype; p public.nds_lucky_100_participants%rowtype;
  v_name text; v_normal text;
begin
  if p_action = 'register' then
    select * into e from public.nds_lucky_100_events where id=p_event for update;
  else
    select * into e from public.nds_lucky_100_events where id=p_event;
  end if;
  if not found then return jsonb_build_object('error','EVENT_NOT_FOUND'); end if;
  if p_action = 'board' then
    return jsonb_build_object('event_status',e.status,'max_slots',e.max_slots,'occupied_slots',
      (select coalesce(jsonb_agg(slot_number order by slot_number),'[]'::jsonb) from public.nds_lucky_100_participants where event_id=p_event));
  end if;
  if p_action not in ('lookup','register') then return jsonb_build_object('error','INVALID_ACTION'); end if;
  v_name := public.nds_lucky_100_normalize(p_name); v_normal := lower(v_name);
  if v_name is null or char_length(v_name) not between 1 and 30 then return jsonb_build_object('error','INVALID_NAME'); end if;
  select * into p from public.nds_lucky_100_participants where event_id=p_event and normalized_name=v_normal;
  if p_action = 'lookup' then
    return jsonb_build_object('is_registered',p.id is not null,'own_slot',p.slot_number,'event_status',e.status,'is_winner',exists(select 1 from public.nds_lucky_100_winners w where w.event_id=e.id and w.participant_id=p.id and w.status='active'));
  end if;
  if e.status <> 'registration' then return jsonb_build_object('error','CLOSED'); end if;
  if p.id is not null then return jsonb_build_object('error','ALREADY_NAME'); end if;
  if p_slot is null or p_slot not between 1 and e.max_slots then return jsonb_build_object('error','INVALID_SLOT'); end if;
  if exists(select 1 from public.nds_lucky_100_participants where event_id=p_event and slot_number=p_slot) then
    return jsonb_build_object('error','SLOT_TAKEN');
  end if;
  insert into public.nds_lucky_100_participants(event_id,slot_number,display_name,normalized_name)
    values(p_event,p_slot,v_name,v_normal);
  return jsonb_build_object('own_slot',p_slot,'event_status',e.status);
end; $$;
