export const FIRST_DAY = '2026-10-26';
export function koreaDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function canRequest(day, today, open = true) {
  return open && day >= FIRST_DAY && day <= '2099-12-31' && day >= today;
}
export function registeredMonths(days) {
  return [...new Set(days.map(day => day.slice(0, 7)))].sort();
}
export function nearestMonth(month, months) {
  return months.includes(month) ? month : months.find(value => value >= month) || months.at(-1) || month;
}
export function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && end > otherStart;
}
export function validateRequest(data, bookings = [], now = new Date()) {
  if (!canRequest(data.day, koreaDay(now))) return '예약 가능한 날짜를 선택해 주세요.';
  if (!data.requester?.trim() || data.requester.trim().length > 30) return '이름을 30자 이내로 입력해 주세요.';
  if (!data.reason?.trim() || data.reason.trim().length > 500) return '요청 사유를 500자 이내로 입력해 주세요.';
  for (const rank of [1, 2]) {
    const start = data[`start${rank}`], end = data[`end${rank}`];
    if (![start, end].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return '희망 시간을 모두 입력해 주세요.';
    if (start >= end) return '종료 시간은 시작 시간보다 늦어야 합니다. (같은 날짜 내에서 선택)';
    if (new Date(`${data.day}T${start}:00+09:00`) <= now) return '이미 지난 시간은 신청할 수 없습니다.';
    if (bookings.some(b => b.day === data.day && overlaps(start, end, b.start.slice(0, 5), b.end.slice(0, 5)))) return '확정된 일정과 겹칩니다. 다른 시간을 선택해 주세요.';
  }
  if (data.start1 === data.start2 && data.end1 === data.end2) return '1순위와 2순위는 서로 다른 시간대로 입력해 주세요.';
  return '';
}
export function monthCells(month) {
  const [year, number] = month.split('-').map(Number);
  const offset = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= count; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function dateLabel(day) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${day}T12:00:00+09:00`));
}
