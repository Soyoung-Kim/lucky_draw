-- Korean calendar: https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027
create table public.ej_calendar (
  day date primary key check (day between '2026-10-26' and '2027-05-31'),
  holiday text not null default '' check (char_length(holiday) <= 40),
  is_open boolean not null default true,
  note text not null default '' check (char_length(note) <= 100)
);
insert into public.ej_calendar(day)
select d::date from generate_series(date '2026-10-26', date '2027-05-31', interval '1 day') d;
update public.ej_calendar c set holiday = h.name from (values
 ('2026-12-25'::date, '성탄절'), ('2027-01-01'::date, '신정'),
 ('2027-02-06'::date, '설날 연휴'), ('2027-02-07'::date, '설날'),
 ('2027-02-08'::date, '설날 연휴'), ('2027-02-09'::date, '대체공휴일'),
 ('2027-03-01'::date, '삼일절'), ('2027-05-01'::date, '노동절'),
 ('2027-05-03'::date, '대체공휴일'), ('2027-05-05'::date, '어린이날'),
 ('2027-05-13'::date, '부처님오신날')
) h(day,name) where c.day=h.day;

create table public.ej_requests (
 id uuid primary key default gen_random_uuid(),
 day date not null references public.ej_calendar,
 requester text not null check (char_length(btrim(requester)) between 1 and 30),
 reason text not null check (char_length(btrim(reason)) between 1 and 500),
 start1 time not null, end1 time not null, start2 time not null, end2 time not null,
 status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
 choice integer check (choice in (1,2)),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 check (start1 < end1 and start2 < end2 and end1 < time '24:00' and end2 < time '24:00'),
 check (start1 <> start2 or end1 <> end2),
 check ((status='approved') = (choice is not null))
);
create index ej_requests_day_status on public.ej_requests(day,status);
alter table public.ej_calendar enable row level security;
alter table public.ej_requests enable row level security;
revoke all on public.ej_calendar, public.ej_requests from anon, authenticated;
grant all on public.ej_calendar, public.ej_requests to service_role;

-- All mutations lock the calendar day first: approvals, submissions, and day closures serialize.
-- This RPC is reachable only by the authenticated Edge Function's service role.
create function public.ej_action(p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
 v_day date; v_cal public.ej_calendar; v_req public.ej_requests;
 v_start time; v_end time; v_choice integer;
 v_now timestamp := clock_timestamp() at time zone 'Asia/Seoul';
 v_id uuid;
begin
 if p_action='calendar' then
   return jsonb_build_object('today',v_now::date,'now',v_now,
    'days',(select coalesce(jsonb_agg(c order by day),'[]') from public.ej_calendar c),
    'bookings',(select coalesce(jsonb_agg(jsonb_build_object('day',day,
      'start',case choice when 1 then start1 else start2 end,
      'end',case choice when 1 then end1 else end2 end) order by day,start1),'[]')
      from public.ej_requests where status='approved'));
 elsif p_action='list' then
   return jsonb_build_object('requests',(select coalesce(jsonb_agg(r order by day,created_at),'[]') from public.ej_requests r));
 end if;
 if p_action in ('approve','reject','cancel') then
   select day into v_day from public.ej_requests where id=(p_data->>'id')::uuid;
 else v_day := (p_data->>'day')::date;
 end if;
 select * into v_cal from public.ej_calendar where day=v_day for update;
 if not found then raise exception '예약 가능 기간의 날짜를 선택해 주세요.'; end if;
 -- A queued transaction must recheck the date/time after acquiring the lock.
 v_now := clock_timestamp() at time zone 'Asia/Seoul';
 if p_action='day' then
   update public.ej_calendar set is_open=(p_data->>'is_open')::boolean,
     note=btrim(p_data->>'note'), holiday=btrim(p_data->>'holiday') where day=v_day;
   return jsonb_build_object('success',true);
 end if;
 if p_action in ('approve','reject','cancel') then
   select * into v_req from public.ej_requests where id=(p_data->>'id')::uuid for update;
   if p_action='cancel' then
     if v_req.status <> 'approved' then raise exception '확정된 예약만 취소할 수 있습니다.'; end if;
     update public.ej_requests set status='cancelled',choice=null,decided_at=now() where id=v_req.id;
     return jsonb_build_object('success',true);
   end if;
   if v_req.status <> 'pending' then raise exception '이미 처리된 요청입니다.'; end if;
   if p_action='reject' then
     update public.ej_requests set status='rejected',decided_at=now() where id=v_req.id;
     return jsonb_build_object('success',true);
   end if;
 end if;
 if v_day < v_now::date or not v_cal.is_open then raise exception '지난 날짜이거나 예약이 닫힌 날짜입니다.'; end if;
 if p_action='request' then
   if v_day+(p_data->>'start1')::time <= v_now or v_day+(p_data->>'start2')::time <= v_now then
     raise exception '이미 지난 시간은 신청할 수 없습니다.';
   end if;
   if exists(select 1 from public.ej_requests where day=v_day and status='approved' and
      ((case choice when 1 then start1 else start2 end < (p_data->>'end1')::time and
        case choice when 1 then end1 else end2 end > (p_data->>'start1')::time) or
       (case choice when 1 then start1 else start2 end < (p_data->>'end2')::time and
        case choice when 1 then end1 else end2 end > (p_data->>'start2')::time))) then
     raise exception '확정된 일정과 겹칩니다. 다른 시간을 선택해 주세요.';
   end if;
   insert into public.ej_requests(day,requester,reason,start1,end1,start2,end2)
     values(v_day,btrim(p_data->>'requester'),btrim(p_data->>'reason'),
       (p_data->>'start1')::time,(p_data->>'end1')::time,(p_data->>'start2')::time,(p_data->>'end2')::time)
     returning id into v_id;
   return jsonb_build_object('success',true,'id',v_id);
 elsif p_action='approve' then
   v_choice := (p_data->>'choice')::integer;
   if v_choice is null or v_choice not in (1,2) then raise exception '승인할 순위를 선택해 주세요.'; end if;
   v_start := case v_choice when 1 then v_req.start1 else v_req.start2 end;
   v_end := case v_choice when 1 then v_req.end1 else v_req.end2 end;
   if v_day+v_start <= v_now then raise exception '이미 지난 시간은 승인할 수 없습니다.'; end if;
   if exists(select 1 from public.ej_requests where day=v_day and status='approved'
     and case choice when 1 then start1 else start2 end < v_end
     and case choice when 1 then end1 else end2 end > v_start) then
     raise exception '이미 확정된 일정과 겹칩니다.';
   end if;
   update public.ej_requests set status='approved',choice=v_choice,decided_at=now() where id=v_req.id;
   return jsonb_build_object('success',true);
 end if;
 raise exception '지원하지 않는 요청입니다.';
end; $$;
revoke all on function public.ej_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.ej_action(text,jsonb) to service_role;

create table public.ej_request_limits (
 key_hash text primary key, window_start timestamptz not null, requests integer not null
);
alter table public.ej_request_limits enable row level security;
revoke all on public.ej_request_limits from anon, authenticated;
create function public.ej_rate_limit(p_key text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count integer; v_now timestamptz := clock_timestamp();
begin
 delete from public.ej_request_limits where window_start < v_now - interval '1 day';
 insert into public.ej_request_limits as r values(p_key,v_now,1)
 on conflict(key_hash) do update set
 requests=case when r.window_start <= v_now-interval '1 minute' then 1 else r.requests+1 end,
 window_start=case when r.window_start <= v_now-interval '1 minute' then v_now else r.window_start end
 returning requests into v_count;
 return v_count <= p_limit;
end; $$;
revoke all on function public.ej_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.ej_rate_limit(text,integer) to service_role;
