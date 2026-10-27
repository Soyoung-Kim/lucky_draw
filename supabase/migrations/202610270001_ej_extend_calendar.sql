begin;
-- Retain the original opening date, but remove the fixed May 2027 closing date.
alter table public.ej_calendar drop constraint if exists ej_calendar_day_check;
alter table public.ej_calendar add constraint ej_calendar_day_check check (day >= date '2026-10-26' and day <= date '2099-12-31');

create or replace function public.ej_add_month(p_year integer, p_month integer, p_holidays jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
 v_first date; v_last date; v_inserted integer; v_total integer; v_holiday jsonb;
begin
 if p_year is null or p_month is null or p_year not between 2026 and 2099 or p_month not between 1 and 12 then
   raise exception '연도와 월을 확인해 주세요.';
 end if;
 v_first := make_date(p_year,p_month,1);
 v_last := (v_first + interval '1 month - 1 day')::date;
 if v_last < (clock_timestamp() at time zone 'Asia/Seoul')::date then
   raise exception '이미 지난 달은 추가할 수 없습니다.';
 end if;
 if p_holidays is null or jsonb_typeof(p_holidays) <> 'array' then raise exception '공휴일 자료를 확인해 주세요.'; end if;
 for v_holiday in select value from jsonb_array_elements(p_holidays) loop
   if jsonb_typeof(v_holiday) <> 'object' or not (v_holiday ? 'day' and v_holiday ? 'holiday') or
     (v_holiday->>'day')::date not between v_first and v_last or
     coalesce(char_length(btrim(v_holiday->>'holiday')),0) not between 1 and 40 then
     raise exception '공휴일 날짜와 이름을 확인해 주세요.';
   end if;
 end loop;
 -- Serialize duplicate requests for the same month. Existing rows are never overwritten.
 perform pg_advisory_xact_lock(20261027,p_year*100+p_month);
 insert into public.ej_calendar(day,holiday)
 select d::date,coalesce((select string_agg(distinct h->>'holiday',' · ')
   from jsonb_array_elements(p_holidays) h where (h->>'day')::date=d::date),'')
 from generate_series(greatest(v_first,date '2026-10-26'),v_last,interval '1 day') d
 on conflict(day) do nothing;
 get diagnostics v_inserted = row_count;
 select count(*) into v_total from public.ej_calendar where day between v_first and v_last;
 return jsonb_build_object('success',true,'inserted',v_inserted,'existing',v_total-v_inserted,'first_day',v_first,'last_day',v_last);
end; $$;
revoke all on function public.ej_add_month(integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ej_add_month(integer,integer,jsonb) to service_role;
commit;
