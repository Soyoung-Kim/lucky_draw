import { HttpError } from './http.ts';

export function validateMonth(year: unknown, month: unknown) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || Number(year) < 2026 || Number(year) > 2099 || Number(month) < 1 || Number(month) > 12) {
    throw new HttpError('연도와 월을 확인해 주세요. (2026~2099년)');
  }
  return { year: Number(year), month: Number(month) };
}
const clean = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
// Read only the dedicated holiday table. Reject unknown layouts rather than silently omitting holidays.
export function parseKasiHolidays(html: string, year: number) {
  const heading = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => clean(m[1]));
  if (!heading.includes(`${year}년 달력자료`)) throw new HttpError('선택한 연도의 달력자료가 아직 제공되지 않습니다.', 422);
  const table = html.match(/<h2\b[^>]*>\s*국경일과 공휴일\s*<\/h2>[\s\S]*?<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new HttpError('공휴일 자료 형식을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 502);
  const result = new Map<string, string>();
  const date = (month: number, day: number) => {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError('공휴일 날짜 형식을 확인할 수 없습니다.', 502);
    return parsed;
  };
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => clean(m[1]));
    if (!cells.length) continue;
    if (cells.length % 2) throw new HttpError('공휴일 표 형식이 변경되었습니다.', 502);
    for (let i = 0; i < cells.length; i += 2) {
      if (!cells[i] && !cells[i + 1]) continue;
      if (cells[i].includes('**')) continue; // KASI: national celebration, but not a public holiday.
      const name = cells[i].replace(/\*/g, '').trim();
      const value = cells[i + 1].match(/^(\d{1,2})월\s*(\d{1,2})일(?:\s*[~～]\s*(?:(\d{1,2})월\s*)?(\d{1,2})일)?\s*(?:\([^)]*\))?$/);
      if (!name || name.length > 40 || !value) throw new HttpError('공휴일 날짜 형식이 변경되었습니다.', 502);
      const start = date(Number(value[1]), Number(value[2]));
      const end = value[4] ? date(Number(value[3] || value[1]), Number(value[4])) : start;
      if (end < start || end.getTime() - start.getTime() > 6 * 86400000) throw new HttpError('공휴일 기간을 확인할 수 없습니다.', 502);
      for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
        const day = new Date(time).toISOString().slice(0, 10);
        const names = [...new Set([...(result.get(day)?.split(' · ') || []), name])].join(' · ');
        if (names.length > 40) throw new HttpError('공휴일 이름을 확인해 주세요.', 502);
        result.set(day, names);
      }
    }
  }
  if (!result.has(`${year}-01-01`) || !result.has(`${year}-12-25`) || result.size < 10) {
    throw new HttpError('해당 연도의 공휴일 자료가 완전하지 않습니다.', 502);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([day, holiday]) => ({day, holiday}));
}
export async function loadKoreanMonth(year: number, month: number) {
  validateMonth(year, month);
  const source = `https://astro.kasi.re.kr/kor/life/post/calendarData?year=${year}`;
  let response: Response;
  try { response = await fetch(source, {signal: AbortSignal.timeout(10000)}); }
  catch { throw new HttpError('한국천문연구원 달력자료에 연결하지 못했습니다. 다시 시도해 주세요.', 502); }
  if (!response.ok) throw new HttpError('한국천문연구원 달력자료를 불러오지 못했습니다.', 502);
  const html = await response.text();
  if (html.length > 2000000) throw new HttpError('달력자료 응답 형식을 확인할 수 없습니다.', 502);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const holidays = parseKasiHolidays(html, year).filter(h => h.day.startsWith(prefix));
  return {year, month, holidays, source, notice: '한국천문연구원 달력 참고자료입니다. 공식 월력요항 발표 및 임시공휴일 지정에 따라 달라질 수 있어요. 변경 사항은 날짜 관리에서 수정해 주세요.'};
}
