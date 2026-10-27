import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKasiHolidays,validateMonth} from '../../supabase/functions/_shared/ej-calendar.ts';
const rows = [['신정','1월 1일 (금)'],['설날','2월 6일~ 2월 8일 (토,일,월)'],['대체공휴일(설날)','2월 9일 (화)'],['삼일절*','3월 1일 (월)'],['노동절','5월 1일 (토)'],['어린이날','5월 5일 (수)'],['부처님오신날','5월 13일 (목)'],['현충일','6월 6일 (일)'],['광복절*','8월 15일 (일)'],['추석','9월14일~ 9월16일 (화,수,목)'],['한글날*','10월 9일 (토)'],['기독탄신일','12월 25일 (토)']];
const page = pairs => `<h2 class="boardlist_tit">2027년 달력자료</h2><h2>국경일과 공휴일</h2><table>${pairs.map(([name,date])=>`<tr><td>${name}</td><td>${date}</td><td></td><td></td></tr>`).join('')}</table>`;
test('holiday table supports ranges, tags, replacement holidays, and excludes non-holidays', () => {
 const holidays=parseKasiHolidays(page([...rows,['비공휴일<span>**</span>','7월 17일 (토)']]),2027);
 assert.ok(holidays.some(h=>h.day==='2027-02-07'&&h.holiday==='설날'));
 assert.ok(holidays.some(h=>h.day==='2027-09-16'&&h.holiday==='추석'));
 assert.ok(holidays.some(h=>h.day==='2027-02-09'&&h.holiday==='대체공휴일(설날)'));
 assert.ok(!holidays.some(h=>h.day==='2027-07-17'));
});
test('missing years, missing tables, and changed or invalid dates fail closed', () => {
 assert.throws(()=>parseKasiHolidays(page(rows),2028),/아직 제공/);
 assert.throws(()=>parseKasiHolidays('<h2>2027년 달력자료</h2>',2027),/자료 형식/);
 assert.throws(()=>parseKasiHolidays(page([['신정','1월 1일']]),2027),/완전하지/);
 assert.throws(()=>parseKasiHolidays(page([...rows,['잘못된 날짜','2월 30일']]),2027));
 assert.throws(()=>parseKasiHolidays(page([...rows,['잘못된 형식','unknown']]),2027));
});
test('month input requires real integer year/month values', () => {
 assert.deepEqual(validateMonth(2028,2),{year:2028,month:2});
 for(const values of [[2028,13],[2028,0],[2028.5,2],['2028',2],[2100,1]]) assert.throws(()=>validateMonth(...values));
});
