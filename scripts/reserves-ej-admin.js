import { invokeFunction } from './api.js';
import { escapeHTML as esc, dateLabel, koreaDay } from './reserves-ej-core.mjs';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('ej_admin_session') || '', requests = [], days = new Map(), filter = 'pending', busy = false;
const statusNames = { pending: '승인 대기', approved: '확정', rejected: '거절', cancelled: '취소' };
function message(text, success = false) { $('message').textContent = text; $('message').classList.toggle('success', success); }
function showSession() { $('loginPanel').hidden = !!token; $('dashboard').hidden = !token; $('logout').hidden = !token; }
function logout() { token = ''; sessionStorage.removeItem('ej_admin_session'); requests = []; days.clear(); $('requests').replaceChildren(); showSession(); }
async function call(action, data = {}) {
  try { return await invokeFunction('reserves-ej', { action, ...data, admin_session_token: token }); }
  catch (error) {
    if (/session|login is required|다시 로그인/i.test(error.message)) { logout(); throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.'); }
    throw error;
  }
}
function render() {
  const rows = requests.filter(r => filter === 'all' || r.status === filter);
  $('listTitle').textContent = `${filter === 'pending' ? '기다리는 약속' : filter === 'approved' ? '확정된 약속' : '모든 약속'} · ${rows.length}`;
  $('requests').innerHTML = rows.length ? rows.map(r => `<article class="request-card"><div class="request-head"><h3>${esc(r.requester)}</h3><span class="badge">${statusNames[r.status]}</span></div><p class="request-date">${esc(r.day)} · ${dateLabel(r.day)}</p><p class="request-reason">${esc(r.reason)}</p><div class="options">${[1, 2].map(rank => `<button data-id="${r.id}" data-action="approve" data-choice="${rank}" class="${r.choice === rank ? 'selected' : ''}" ${r.status !== 'pending' || busy ? 'disabled' : ''}>${rank}순위 ${r[`start${rank}`].slice(0, 5)}–${r[`end${rank}`].slice(0, 5)}${r.status === 'pending' ? ' 승인' : r.choice === rank ? ' ✓' : ''}</button>`).join('')}${r.status === 'pending' ? `<button data-id="${r.id}" data-action="reject" class="danger" ${busy ? 'disabled' : ''}>거절</button>` : ''}${r.status === 'approved' ? `<button data-id="${r.id}" data-action="cancel" class="danger" ${busy ? 'disabled' : ''}>예약 취소</button>` : ''}</div></article>`).join('') : '<div class="empty-state">아직 이곳에 약속이 없어요.<br><small>새로운 약속이 도착하면 여기에서 확인하세요.</small></div>';
}
function fillDay() {
  const form = $('dayForm'), info = days.get(form.elements.day.value);
  form.elements.is_open.value = String(info?.is_open ?? true);
  form.elements.holiday.value = info?.holiday || ''; form.elements.note.value = info?.note || '';
  $('saveDay').disabled = !info;
  $('dayHelp').textContent = info ? '' : '아직 등록되지 않은 날짜입니다. 먼저 해당 월을 추가해 주세요.';
}
async function refresh() {
  const [list, calendar] = await Promise.all([call('list'), call('calendar')]);
  if (!token) return;
  requests = list.requests; days = new Map(calendar.days.map(d => [d.day, d])); render();
  const sorted = [...days.keys()].sort();
  dayForm.elements.day.min = sorted[0] || '';
  dayForm.elements.day.max = sorted.at(-1) || '';
  if (!days.has(dayForm.elements.day.value)) dayForm.elements.day.value = sorted.find(d => d >= koreaDay()) || sorted.at(-1) || '';
  $('calendarRange').textContent = sorted.length ? `${sorted[0]} ~ ${sorted.at(-1)} · ${sorted.length}일 등록` : '등록된 날짜가 없습니다.';
  if (!monthForm.elements.year.value) {
    const next = sorted.length ? new Date(`${sorted.at(-1).slice(0,7)}-01T12:00:00Z`) : new Date();
    if (sorted.length) next.setUTCMonth(next.getUTCMonth()+1);
    monthForm.elements.year.value = next.getUTCFullYear(); monthForm.elements.month.value = next.getUTCMonth()+1;
  }
}
$('loginForm').onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const result = await call('login', Object.fromEntries(new FormData(event.target)));
    token = result.admin_session_token; sessionStorage.setItem('ej_admin_session', token);
    event.target.reset(); showSession(); await refresh(); fillDay(); message('');
  } catch (error) { message(error.message); }
  finally { button.disabled = false; }
};
$('logout').onclick = () => { logout(); message('로그아웃했어요.'); };
$('refresh').onclick = async () => { try { await refresh(); message('새로운 요청을 확인했어요.', true); } catch (e) { message(e.message); } };
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button)); render();
});
$('requests').onclick = async event => {
  const button = event.target.closest('[data-action]'); if (!button || busy) return;
  const { id, action, choice } = button.dataset;
  if (action === 'cancel' && !confirm('확정된 약속을 취소할까요? 공개 달력에서도 사라집니다.')) return;
  busy = true; render();
  try {
    await call(action, { id, choice: Number(choice) });
    await refresh(); message(action === 'approve' ? '승인했어요. 공개 달력에 일정이 표시됩니다.' : action === 'reject' ? '요청을 거절했어요.' : '예약을 취소했어요.', true);
  } catch (error) { message(error.message); }
  finally { busy = false; render(); }
};
const dayForm = $('dayForm');
dayForm.elements.day.value = koreaDay();
dayForm.elements.day.onchange = fillDay;
dayForm.onsubmit = async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const data = Object.fromEntries(new FormData(dayForm)); data.is_open = data.is_open === 'true';
  try { await call('day', data); await refresh(); message('날짜 설정을 저장했어요.', true); }
  catch (error) { message(error.message); }
  finally { button.disabled = false; }
};
const monthForm = $('monthForm');
let previewedMonth = '', importing = false;
const monthValue = () => `${monthForm.elements.year.value}-${monthForm.elements.month.value}`;
monthForm.oninput = () => { previewedMonth = ''; $('addMonth').disabled = true; $('monthPreview').replaceChildren(); };
monthForm.onsubmit = async event => {
  event.preventDefault(); if (importing) return;
  importing = true; const requestedMonth = monthValue(); previewedMonth = ''; $('addMonth').disabled = true;
  $('previewMonth').disabled = true; $('monthMessage').textContent = '공휴일 자료를 불러오는 중이에요…';
  try {
    const data = await call('preview_month',{year:Number(monthForm.elements.year.value),month:Number(monthForm.elements.month.value)});
    if (requestedMonth !== monthValue()) return;
    $('monthPreview').innerHTML = `<p>${data.holidays.length ? data.holidays.map(h => `${esc(h.day)} · ${esc(h.holiday)}`).join('<br>') : '이 달에는 등록된 공휴일이 없어요.'}</p><p class="small muted">${esc(data.notice)}</p><a class="small" href="${esc(data.source)}" target="_blank" rel="noopener noreferrer">한국천문연구원 자료 확인 ↗</a>`;
    previewedMonth = requestedMonth; $('addMonth').disabled = false; $('monthMessage').textContent = '확인 후 추가하면 이 달의 예약이 열립니다. 기존 날짜의 설정은 유지돼요.';
  } catch(error) { $('monthMessage').textContent = error.message; }
  finally { importing = false; $('previewMonth').disabled = false; }
};
$('addMonth').onclick = async () => {
  if (importing || previewedMonth !== monthValue()) return;
  importing = true; $('addMonth').disabled = true; $('previewMonth').disabled = true;
  try {
    const data = await call('add_month',{year:Number(monthForm.elements.year.value),month:Number(monthForm.elements.month.value)});
    $('monthMessage').textContent = `${data.inserted}일을 추가했어요. 기존 ${data.existing}일은 그대로 유지했습니다.`;
    previewedMonth = ''; await refresh(); fillDay();
  } catch(error) { $('monthMessage').textContent = error.message; $('addMonth').disabled = previewedMonth !== monthValue(); }
  finally { importing = false; $('previewMonth').disabled = false; }
};
showSession();
if (token) refresh().then(fillDay).catch(e => message(e.message));
