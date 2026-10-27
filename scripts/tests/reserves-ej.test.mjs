import test from 'node:test';
import assert from 'node:assert/strict';
import { koreaDay, canRequest, overlaps, validateRequest, monthCells, escapeHTML } from '../reserves-ej-core.mjs';
const now = new Date('2026-10-26T10:00:00+09:00');
const data = {day:'2026-10-26',start1:'12:00',end1:'13:00',start2:'18:00',end2:'20:00',requester:'친구',reason:'밥 먹자'};
test('KST midnight closes yesterday, independent of browser timezone', () => {
 assert.equal(koreaDay(new Date('2026-10-26T14:59:59Z')), '2026-10-26');
 assert.equal(koreaDay(new Date('2026-10-26T15:00:00Z')), '2026-10-27');
 assert.equal(canRequest('2026-10-26','2026-10-27'), false);
 assert.equal(canRequest('2027-05-31','2026-10-26'), true);
 assert.equal(canRequest('2027-06-01','2026-10-26'), false);
 assert.equal(canRequest('2026-10-25','2026-10-25'), false);
 assert.equal(canRequest('2026-10-27','2026-10-26',false), false);
});
test('both distinct preferences, nonempty name/reason, and future valid ranges are required', () => {
 assert.equal(validateRequest(data,[],now),'');
 for (const change of [{requester:' '},{reason:' '},{start1:'09:00'},{end1:'11:00'},{start2:'12:00',end2:'13:00'},{end1:'24:00'},{day:'2027-06-01'}]) {
   assert.ok(validateRequest({...data,...change},[],now), JSON.stringify(change));
 }
});
test('overlaps include enclosing ranges but allow adjacent meetings', () => {
 assert.equal(overlaps('12:00','13:00','13:00','14:00'),false);
 assert.equal(overlaps('12:00','15:00','13:00','14:00'),true);
 assert.ok(validateRequest(data,[{day:data.day,start:'18:30:00',end:'19:00:00'}],now));
 assert.equal(validateRequest(data,[{day:data.day,start:'13:00:00',end:'14:00:00'}],now),'');
});
test('Korean Sunday-first calendar pads complete weeks across year boundary', () => {
 const october = monthCells('2026-10'); assert.equal(october[4],'2026-10-01');
 assert.equal(october.filter(Boolean).length,31); assert.equal(october.length % 7,0);
 assert.equal(monthCells('2027-02').filter(Boolean).length,28);
 assert.equal(monthCells('2027-05').filter(Boolean).at(-1),'2027-05-31');
});
test('public notes and request content are escaped', () => {
 assert.equal(escapeHTML('<img onerror="alert(1)">'), '&lt;img onerror=&quot;alert(1)&quot;&gt;');
});
