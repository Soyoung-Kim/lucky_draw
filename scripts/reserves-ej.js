import { invokeFunction } from './api.js';
import { FIRST_DAY, koreaDay, canRequest, validateRequest, monthCells, registeredMonths, nearestMonth, escapeHTML as esc, dateLabel } from './reserves-ej-core.mjs';
const $ = id => document.getElementById(id);
const form = $('requestForm');
let days = new Map(), bookings = [], months = [], offset = 0, loaded = false, refreshing = false;
const now = () => new Date(Date.now() + offset);
const currentMonth = () => koreaDay(now()).slice(0, 7);
let month = currentMonth();
let lastToday = koreaDay(now());
function message(text, success = false) { $('message').textContent = text; $('message').classList.toggle('success', success); }
function render() {
  const today = koreaDay(now());
  const [year, number] = month.split('-');
  $('monthTitle').textContent = `${year}년 ${Number(number)}월`;
  $('prevMonth').disabled = !loaded || months.indexOf(month) <= 0;
  $('nextMonth').disabled = !loaded || months.indexOf(month) >= months.length - 1;
  $('monthSelect').innerHTML = months.map(m => `<option value="${m}">${m.slice(0,4)}년 ${Number(m.slice(5))}월</option>`).join('');
  $('monthSelect').value = month; $('monthSelect').disabled = !loaded;
  $('openRange').textContent = loaded && days.size ? `등록된 ${months.length}개 월 · ${[...days.keys()].sort().at(-1).replaceAll('-', '.')}까지` : '예약 가능한 달을 확인해 주세요';
  $('calendar').innerHTML = monthCells(month).map((day, i) => {
    if (!day) return '<div class="day empty" aria-hidden="true"></div>';
    const info = days.get(day), past = day < today || day < FIRST_DAY, available = loaded && info && canRequest(day, today, info.is_open);
    const events = bookings.filter(b => b.day === day).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="day ${past ? 'past' : ''} ${info && !info.is_open ? 'closed' : ''} ${today === day ? 'today' : ''} ${i % 7 === 0 ? 'sun' : i % 7 === 6 ? 'sat' : ''} ${info?.holiday ? 'holiday' : ''}" aria-label="${day}${today === day ? ' 오늘' : ''}"><div class="day-head"><span class="day-number">${Number(day.slice(-2))}</span>${available ? `<button class="add" data-day="${day}" aria-label="${dateLabel(day)} 예약 신청">+</button>` : ''}</div>${info?.holiday ? `<div class="holiday-label">${esc(info.holiday)}</div>` : ''}${events.map(b => `<div class="booking"><span class="booking-time">${esc(b.start.slice(0, 5))}</span><span class="booking-range">–</span><span class="booking-time">${esc(b.end.slice(0, 5))}</span><strong>확정</strong></div>`).join('')}${info && !info.is_open ? '<div class="day-note">예약 쉬는 날</div>' : ''}${info?.note ? `<div class="day-note">${esc(info.note)}</div>` : ''}</div>`;
  }).join('');
}
async function refresh(silent = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    const result = await invokeFunction('reserves-ej', { action: 'calendar' });
    offset = new Date(`${result.now}+09:00`).getTime() - Date.now();
    days = new Map(result.days.map(d => [d.day, d])); bookings = result.bookings; loaded = true;
    months = registeredMonths([...days.keys()]); month = nearestMonth(month, months);
    if (!silent || $('message').dataset.failed) message('');
    delete $('message').dataset.failed;
    render();
  } catch {
    loaded = false; render();
    message('달력을 불러오지 못했어요. 잠시 후 새로고침해 주세요. 계속되면 관리자에게 문의해 주세요.');
    $('message').dataset.failed = 'true';
  } finally { refreshing = false; }
}
for (const [id, direction] of [['prevMonth', -1], ['nextMonth', 1]]) $(id).onclick = () => {
  month = months[months.indexOf(month) + direction] || month; render();
};
$('todayButton').onclick = () => { month = nearestMonth(currentMonth(), months); render(); };
$('monthSelect').onchange = event => { month = event.target.value; render(); };
$('refresh').onclick = () => refresh();
$('calendar').onclick = event => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  const day = button.dataset.day;
  if (!loaded || !days.has(day) || !canRequest(day, koreaDay(now()), days.get(day).is_open)) return;
  form.reset(); form.elements.day.value = day;
  $('dialogTitle').textContent = dateLabel(day);
  $('formMessage').textContent = '';
  const events = bookings.filter(b => b.day === day);
  $('dayBookings').textContent = events.length ? `이미 있는 약속: ${events.map(b => `${b.start.slice(0, 5)}–${b.end.slice(0, 5)}`).join(', ')}` : '아직 확정된 약속이 없는 날이에요.';
  $('requestDialog').showModal();
};
$('closeDialog').onclick = () => $('requestDialog').close();
form.onsubmit = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (!loaded || !days.has(data.day) || !days.get(data.day).is_open) { $('formMessage').textContent = '현재 예약 가능한 날짜인지 다시 확인해 주세요.'; return; }
  const invalid = validateRequest(data, bookings, now());
  if (invalid) { $('formMessage').textContent = invalid; return; }
  $('submitRequest').disabled = true; $('closeDialog').disabled = true;
  $('formMessage').textContent = '은지에게 신청을 보내고 있어요…';
  try {
    await invokeFunction('reserves-ej', { action: 'request', ...data });
    $('requestDialog').close();
    await refresh();
    if (loaded) message('약속 신청을 보냈어요! 은지가 승인하면 이 달력에 확정 시간이 표시됩니다.', true);
  } catch (error) { $('formMessage').textContent = error.message; }
  finally { $('submitRequest').disabled = false; $('closeDialog').disabled = false; }
};
$('requestDialog').addEventListener('cancel', event => { if ($('submitRequest').disabled) event.preventDefault(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
setInterval(() => { if (!document.hidden) refresh(true); }, 30000);
setInterval(() => {
  const today = koreaDay(now());
  if (today !== lastToday) {
    lastToday = today; render();
    if ($('requestDialog').open && form.elements.day.value < today) {
      $('requestDialog').close(); message('날짜가 바뀌었어요. 오늘 이후 날짜로 다시 신청해 주세요.');
    }
  }
}, 1000);
render(); refresh();
