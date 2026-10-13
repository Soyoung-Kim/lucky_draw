begin;
do $$
declare e uuid; r jsonb; ids jsonb; winner_count integer; n integer;
begin
  for winner_count in 1..10 loop
    r := public.nds_lucky_100_admin('create',null,'test','{"title":"winner range test"}');
    e := (r->'event'->>'id')::uuid;
    for n in 1..10 loop
      r := public.nds_lucky_100_public('register',e,'name '||n,n);
      assert not(r ? 'error');
    end loop;
    r := public.nds_lucky_100_admin('close',e,'test');
    r := public.nds_lucky_100_admin('reopen',e,'test');
    assert r->'event'->>'status'='registration';
    assert r->'event'->>'closed_at' is null;
    r := public.nds_lucky_100_public('register',e,'extra',100);
    assert (r->>'own_slot')::integer=100, 'reopened registration failed';
    r := public.nds_lucky_100_admin('close',e,'test');
    assert (r->'event'->>'closed_participant_count')::integer=11;
    select jsonb_agg(id order by slot_number) into ids from public.nds_lucky_100_participants where event_id=e;
    r := public.nds_lucky_100_admin('draw',e,'test',jsonb_build_object('winner_count',winner_count,'candidate_ids','[]'::jsonb,'participant_ids',ids));
    assert r->>'error'='CANDIDATES_CHANGED';
    r := public.nds_lucky_100_admin('draw',e,'test',jsonb_build_object('winner_count',winner_count,'candidate_ids',ids,'participant_ids',
      (select jsonb_agg(value order by ordinality) from jsonb_array_elements(ids) with ordinality where ordinality<=winner_count)));
    assert jsonb_array_length(r->'winners')=winner_count, 'winner count mismatch';
    r := public.nds_lucky_100_admin('reopen',e,'test');
    assert r->>'error'='DRAW_ALREADY_STARTED';
    r := public.nds_lucky_100_admin('finish',e,'test');
    r := public.nds_lucky_100_admin('reopen',e,'test');
    assert r->>'error'='DRAW_ALREADY_STARTED';
  end loop;
end $$;
rollback;
