-- Restores only rate-limit infrastructure. Event/participant/winner data is untouched.
begin;
create schema if not exists nds_lucky_private;
revoke all on schema nds_lucky_private from public, anon, authenticated;
create table if not exists nds_lucky_private.request_limits (
  key_hash text primary key,
  window_start timestamptz not null,
  requests integer not null
);
alter table nds_lucky_private.request_limits enable row level security;
revoke all on nds_lucky_private.request_limits from public, anon, authenticated;
create or replace function public.nds_lucky_100_rate_limit(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_now timestamptz := clock_timestamp();
begin
  if p_key is null or p_limit is null or p_limit < 1 then
    raise exception 'Invalid rate limit parameters' using errcode='22023';
  end if;
  delete from nds_lucky_private.request_limits where window_start < v_now - interval '1 day';
  insert into nds_lucky_private.request_limits as r values(p_key,v_now,1)
  on conflict(key_hash) do update set
    requests = case when r.window_start <= v_now - interval '1 minute' then 1 else r.requests + 1 end,
    window_start = case when r.window_start <= v_now - interval '1 minute' then v_now else r.window_start end
  returning requests into v_count;
  return v_count <= p_limit;
end; $$;
revoke all on function public.nds_lucky_100_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.nds_lucky_100_rate_limit(text,integer) to service_role;
notify pgrst, 'reload schema';
commit;

-- Verify with the same role used by the Edge Function; test counters are rolled back.
begin;
set local role service_role;
select public.nds_lucky_100_rate_limit('repair-verification',1) as first_call_allowed;
select public.nds_lucky_100_rate_limit('repair-verification',1) as second_call_blocked;
rollback;
