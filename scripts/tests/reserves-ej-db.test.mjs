import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('reservation SQL: calendar, privacy, approval conflicts, closures, cancellation, and permissions', async () => {
  if (!process.env.EJ_PGLITE_MODULE) throw new Error('Set EJ_PGLITE_MODULE to the installed @electric-sql/pglite module path.');
  const { PGlite } = await import(pathToFileURL(process.env.EJ_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    // Freeze only the test database clock; production SQL always uses clock_timestamp().
    const sql = (await readFile(new URL('../../supabase/migrations/202610260001_reserves_ej.sql',import.meta.url),'utf8'))
      .replaceAll('clock_timestamp()', "timestamptz '2026-10-26 10:00:00+09'");
    await db.exec(sql);
    const call = async (action, data = {}) => (await db.query('select public.ej_action($1,$2::jsonb) as result',[action,JSON.stringify(data)])).rows[0].result;
    const calendar = await call('calendar');
    assert.equal(calendar.days.length,218); assert.equal(calendar.days[0].day,'2026-10-26');
    assert.equal(calendar.days.at(-1).day,'2027-05-31');
    assert.equal(calendar.days.find(d => d.day==='2027-05-03').holiday,'대체공휴일');
    const base = {day:'2026-10-27',requester:'친구',reason:'비공개 사유',start1:'12:00',end1:'13:00',start2:'18:00',end2:'19:00'};
    const a = await call('request',base), b = await call('request',{...base,requester:'다른 친구'});
    await call('approve',{id:a.id,choice:1});
    await assert.rejects(call('approve',{id:b.id,choice:1}),/겹칩니다/);
    await call('approve',{id:b.id,choice:2});
    const publicData = await call('calendar');
    assert.equal(publicData.bookings.length,2);
    assert.ok(!JSON.stringify(publicData).includes('친구'));
    assert.ok(!JSON.stringify(publicData).includes('비공개 사유'));
    await assert.rejects(call('request',base),/겹칩니다/);
    const adjacent = await call('request',{...base,start1:'13:00',end1:'14:00',start2:'19:00',end2:'20:00'});
    await call('approve',{id:adjacent.id,choice:1});
    await call('cancel',{id:a.id});
    assert.equal((await call('calendar')).bookings.length,2);
    const free = {...base,start2:'20:00',end2:'21:00'};
    const c = await call('request',free);
    await call('day',{day:base.day,is_open:false,note:'휴식',holiday:''});
    await assert.rejects(call('approve',{id:c.id,choice:1}),/닫힌/);
    await assert.rejects(call('request',base),/닫힌/);
    assert.equal((await call('calendar')).bookings.length,2);
    await call('reject',{id:c.id});
    await assert.rejects(call('approve',{id:c.id,choice:1}),/처리된/);
    await call('day',{day:base.day,is_open:true,note:'',holiday:''});
    await call('request',free);
    await assert.rejects(call('request',{...base,day:'2026-10-25'}),/예약 가능 기간/);
    await assert.rejects(call('request',{...base,day:'2027-06-01'}),/예약 가능 기간/);
    await assert.rejects(call('request',{...base,day:'2026-10-26',start1:'09:00'}),/지난 시간/);
    await assert.rejects(call('request',{...base,day:'2026-10-28',requester:' '}),/check constraint/);
    await assert.rejects(call('request',{...base,day:'2026-10-28',end1:'11:00'}),/check constraint/);
    await assert.rejects(call('request',{...base,day:'2026-10-28',start2:'12:00',end2:'13:00'}),/check constraint/);
    assert.ok((await call('list')).requests.every(r => r.requester));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.ej_requests'),/permission denied/);
    await assert.rejects(call('list'),/permission denied/);
    await assert.rejects(call('approve',{id:b.id,choice:1}),/permission denied/);
    await db.exec('reset role');
    await db.exec('set role service_role');
    assert.equal((await call('calendar')).days.length,218);
    const limit = async () => (await db.query("select public.ej_rate_limit('test',2) as ok")).rows[0].ok;
    assert.equal(await limit(),true); assert.equal(await limit(),true); assert.equal(await limit(),false);
  } finally { await db.close(); }
});
