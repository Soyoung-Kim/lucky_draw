begin;
alter table public.nds_lucky_100_events drop constraint if exists nds_lucky_100_events_max_slots_check;
alter table public.nds_lucky_100_events add constraint nds_lucky_100_events_max_slots_check check(max_slots between 2 and 150);
alter table public.nds_lucky_100_participants drop constraint if exists nds_lucky_100_participants_slot_number_check;
alter table public.nds_lucky_100_participants add constraint nds_lucky_100_participants_slot_number_check check(slot_number between 1 and 150);
alter table public.nds_lucky_100_events drop constraint if exists nds_lucky_100_events_winner_limit_check;
alter table public.nds_lucky_100_events add constraint nds_lucky_100_events_winner_limit_check check(winner_limit between 1 and 10);
alter table public.nds_lucky_100_winners drop constraint if exists nds_lucky_100_winners_prize_rank_check;
alter table public.nds_lucky_100_winners add constraint nds_lucky_100_winners_prize_rank_check check(prize_rank between 1 and 10);
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
    return jsonb_build_object('is_registered',p.id is not null,'own_slot',p.slot_number,'event_status',e.status);
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

create or replace function public.nds_lucky_100_admin(p_action text, p_event uuid, p_actor text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.nds_lucky_100_events%rowtype; p public.nds_lucky_100_participants%rowtype;
  v_name text; v_count integer; v_limit integer; v_ids uuid[]; v_results jsonb;
begin
  if p_action='create' then
    insert into public.nds_lucky_100_events(title,max_slots) values(btrim(p_data->>'title'),coalesce((p_data->>'max_slots')::integer,100)) returning * into e;
  else
    select * into e from public.nds_lucky_100_events where id=p_event for update;
    if not found then return jsonb_build_object('error','EVENT_NOT_FOUND'); end if;
    if p_action='board' then
      return jsonb_build_object('event',to_jsonb(e),'participants',
        (select coalesce(jsonb_agg(to_jsonb(t) order by t.slot_number),'[]') from public.nds_lucky_100_participants t where event_id=e.id),
        'winners',(select coalesce(jsonb_agg(jsonb_build_object('prize_rank',w.prize_rank,'participant_id',participant_row.id,'slot_number',participant_row.slot_number,'display_name',participant_row.display_name) order by w.prize_rank),'[]')
          from public.nds_lucky_100_winners w join public.nds_lucky_100_participants participant_row on participant_row.id=w.participant_id where w.event_id=e.id));
    elsif p_action='add_slots' then
      if e.status not in ('registration','closed') then return jsonb_build_object('error','DRAW_ALREADY_STARTED'); end if;
      v_count := (p_data->>'amount')::integer;
      if v_count is null or v_count < 1 or e.max_slots + v_count > 150 then return jsonb_build_object('error','INVALID_SLOT_AMOUNT'); end if;
      p_data := p_data || jsonb_build_object('previous_max_slots',e.max_slots);
      update public.nds_lucky_100_events set max_slots=max_slots+v_count where id=e.id returning * into e;
    elsif p_action='close' then
      if e.status='registration' then
        select count(*) into v_count from public.nds_lucky_100_participants where event_id=e.id;
        update public.nds_lucky_100_events set status='closed',closed_at=clock_timestamp(),closed_participant_count=v_count where id=e.id returning * into e;
      else return jsonb_build_object('event',to_jsonb(e)); end if;
    elsif p_action='reopen' then
      if e.status='registration' then return jsonb_build_object('event',to_jsonb(e)); end if;
      if e.status<>'closed' or exists(select 1 from public.nds_lucky_100_winners where event_id=e.id) then
        return jsonb_build_object('error','DRAW_ALREADY_STARTED');
      end if;
      p_data := p_data || jsonb_build_object('previous_closed_at',e.closed_at,'previous_closed_participant_count',e.closed_participant_count);
      update public.nds_lucky_100_events set status='registration',closed_at=null,closed_participant_count=null where id=e.id returning * into e;
    elsif p_action in ('update','delete') then
      if e.status <> 'registration' then return jsonb_build_object('error','CLOSED'); end if;
      select * into p from public.nds_lucky_100_participants where event_id=e.id and id=(p_data->>'participant_id')::uuid;
      if not found then return jsonb_build_object('error','PARTICIPANT_NOT_FOUND'); end if;
      if p_action='delete' then delete from public.nds_lucky_100_participants where id=p.id;
      else
        v_name := public.nds_lucky_100_normalize(p_data->>'name');
        if v_name is null or char_length(v_name) not between 1 and 30 then return jsonb_build_object('error','INVALID_NAME'); end if;
        if exists(select 1 from public.nds_lucky_100_participants where event_id=e.id and normalized_name=lower(v_name) and id<>p.id) then return jsonb_build_object('error','ALREADY_NAME'); end if;
        update public.nds_lucky_100_participants set display_name=v_name,normalized_name=lower(v_name) where id=p.id;
      end if;
      p_data := p_data || jsonb_build_object('before',to_jsonb(p));
    elsif p_action='draw' then
      if e.status in ('drawing','completed') then
        return jsonb_build_object('event',to_jsonb(e),'winners',(select jsonb_agg(to_jsonb(w) order by prize_rank) from public.nds_lucky_100_winners w where event_id=e.id));
      end if;
      if e.status <> 'closed' then return jsonb_build_object('error','NOT_CLOSED'); end if;
      v_limit := (p_data->>'winner_count')::integer;
      if v_limit is null or v_limit not between 1 and 10 then return jsonb_build_object('error','INVALID_WINNER_COUNT'); end if;
      select count(*) into v_count from public.nds_lucky_100_participants where event_id=e.id;
      if v_count < v_limit then return jsonb_build_object('error','NOT_ENOUGH_PARTICIPANTS'); end if;
      if jsonb_typeof(p_data->'candidate_ids') is distinct from 'array'
        or jsonb_array_length(p_data->'candidate_ids') <> v_count
        or (select count(distinct value::uuid) from jsonb_array_elements_text(p_data->'candidate_ids')) <> v_count
        or exists(select id from public.nds_lucky_100_participants where event_id=e.id
          except select value::uuid from jsonb_array_elements_text(p_data->'candidate_ids')) then
        return jsonb_build_object('error','CANDIDATES_CHANGED');
      end if;
      select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(p_data->'participant_ids');
      if coalesce(cardinality(v_ids),0) <> v_limit or (select count(distinct x) from unnest(v_ids) x) <> v_limit
        or (select count(*) from public.nds_lucky_100_participants where event_id=e.id and id=any(v_ids)) <> v_limit then
        return jsonb_build_object('error','INVALID_CANDIDATES');
      end if;
      insert into public.nds_lucky_100_winners(event_id,participant_id,prize_rank) select e.id,x,ordinality::integer from unnest(v_ids) with ordinality as t(x,ordinality);
      update public.nds_lucky_100_events set status='drawing',winner_limit=v_limit where id=e.id returning * into e;
    elsif p_action='finish' then
      if e.status='completed' then return jsonb_build_object('event',to_jsonb(e)); end if;
      if e.status<>'drawing' then return jsonb_build_object('error','NOT_DRAWING'); end if;
      update public.nds_lucky_100_events set status='completed' where id=e.id returning * into e;
    else return jsonb_build_object('error','INVALID_ACTION'); end if;
  end if;
  insert into public.nds_lucky_100_audit_logs(event_id,actor,action,details) values(e.id,p_actor,p_action,p_data);
  select coalesce(jsonb_agg(to_jsonb(w) order by prize_rank),'[]') into v_results from public.nds_lucky_100_winners w where event_id=e.id;
  return jsonb_build_object('event',to_jsonb(e),'winners',v_results);
end; $$;
commit;
