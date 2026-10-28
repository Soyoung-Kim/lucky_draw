begin;
do $$
declare e uuid; r jsonb; ids jsonb; w1 uuid; w7 uuid; spare12 uuid; spare13 uuid; n integer;
begin
  r:=public.nds_lucky_100_admin('create',null,'test','{"title":"fixed prize test"}'); e:=(r->'event'->>'id')::uuid;
  for n in 1..13 loop
    r:=public.nds_lucky_100_public('register',e,'참가자 '||n,n);
  end loop;
  select jsonb_agg(id order by slot_number) into ids from public.nds_lucky_100_participants where event_id=e;
  select id into spare12 from public.nds_lucky_100_participants where event_id=e and slot_number=12;
  select id into spare13 from public.nds_lucky_100_participants where event_id=e and slot_number=13;
  r:=public.nds_lucky_100_admin('close',e,'test');
  r:=public.nds_lucky_100_admin('draw',e,'test',jsonb_build_object('winner_count',10));
  assert r->>'error'='INVALID_WINNER_COUNT';
  r:=public.nds_lucky_100_admin('draw',e,'test',jsonb_build_object('winner_count',11,'candidate_ids',ids,'participant_ids',
    (select jsonb_agg(value order by ordinality) from jsonb_array_elements(ids) with ordinality where ordinality<=11)));
  assert jsonb_array_length(r->'winners')=11;
  assert (select count(*)=6 from public.nds_lucky_100_winners where event_id=e and prize_name='티셔츠');
  assert (select count(*)=5 from public.nds_lucky_100_winners where event_id=e and prize_name='미니 가습기');
  select id into w1 from public.nds_lucky_100_winners where event_id=e and prize_rank=1;
  select id into w7 from public.nds_lucky_100_winners where event_id=e and prize_rank=7;
  r:=public.nds_lucky_100_admin('replace',e,'test',jsonb_build_object('winner_id',w1,'candidate_ids',jsonb_build_array(spare12,spare13),'participant_id',spare12));
  assert r->'replacement'->>'prize_name'='티셔츠';
  r:=public.nds_lucky_100_admin('replace',e,'test',jsonb_build_object('winner_id',w7,'candidate_ids',jsonb_build_array(spare13),'participant_id',spare13));
  assert r->'replacement'->>'prize_name'='미니 가습기';
  assert (select count(*)=6 from public.nds_lucky_100_winners where event_id=e and status='active' and prize_name='티셔츠');
  assert (select count(*)=5 from public.nds_lucky_100_winners where event_id=e and status='active' and prize_name='미니 가습기');
  assert (select count(*)=2 from public.nds_lucky_100_winners where event_id=e and status='absent');
end $$;
rollback;
