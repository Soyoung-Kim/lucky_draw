begin;
do $$
declare e uuid; r jsonb;
begin
  r := public.nds_lucky_100_admin('create',null,'test','{"title":"two slots","max_slots":2}');
  e := (r->'event'->>'id')::uuid;
  assert (r->'event'->>'max_slots')::integer=2;
  r := public.nds_lucky_100_public('register',e,'김민준',3);
  assert r->>'error'='INVALID_SLOT';
  r := public.nds_lucky_100_admin('add_slots',e,'test','{"amount":2}');
  assert (r->'event'->>'max_slots')::integer=4;
  r := public.nds_lucky_100_public('register',e,'김민준',4);
  assert (r->>'own_slot')::integer=4;
  r := public.nds_lucky_100_admin('add_slots',e,'test','{"amount":-1}');
  assert r->>'error'='INVALID_SLOT_AMOUNT';
  r := public.nds_lucky_100_admin('close',e,'test');
  r := public.nds_lucky_100_admin('add_slots',e,'test','{"amount":146}');
  assert (r->'event'->>'max_slots')::integer=150;
  r := public.nds_lucky_100_admin('add_slots',e,'test','{"amount":1}');
  assert r->>'error'='INVALID_SLOT_AMOUNT';
  r := public.nds_lucky_100_admin('reopen',e,'test');
  r := public.nds_lucky_100_public('register',e,'이서연',150);
  assert (r->>'own_slot')::integer=150;
  r := public.nds_lucky_100_public('board',e);
  assert (r->>'max_slots')::integer=150 and r->'occupied_slots'='[4,150]'::jsonb;
  r := public.nds_lucky_100_admin('create',null,'test','{"title":"default slots"}');
  assert (r->'event'->>'max_slots')::integer=100;
end $$;
rollback;
