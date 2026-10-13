import { CONFIG, isConfigured } from "./config.js";
const $ = (id) => document.getElementById(id);
const labels = { registration: "접수 중", closed: "접수 마감", drawing: "추첨 진행", completed: "종료" };
let token = "", eventId = new URLSearchParams(location.search).get("event") ?? "", snapshot = null, busy = false, editing = null, animating = false;
const sessionKey = "nds_lucky_100_admin_session";
let expiresAt = 0;
function clearSession() {
  expiresAt = 0;
  try { sessionStorage.removeItem(sessionKey); } catch { /* Storage can be blocked by browser settings. */ }
}
function saveSession(data) {
  token = data.admin_session_token;
  expiresAt = Date.parse(data.expires_at);
  if (typeof token !== "string" || !token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    logout(); throw new Error("로그인 세션을 확인하지 못했습니다. 다시 로그인해 주세요.");
  }
  try { sessionStorage.setItem(sessionKey, JSON.stringify({ token, expiresAt })); }
  catch { message("브라우저가 세션 저장을 차단하여 새로고침 시 재로그인이 필요합니다."); }
}
function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    if (typeof saved?.token === "string" && saved.token && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) {
      token = saved.token; expiresAt = saved.expiresAt;
      $("loginPanel").hidden = true; $("dashboard").hidden = false; $("logout").hidden = false;
      if (eventId) run(() => refresh());
      return;
    }
  } catch { /* Invalid saved sessions require a fresh login. */ }
  clearSession();
}
function message(text = "") { $("message").textContent = text; }
function controls() {
  document.querySelectorAll("button,select").forEach((element) => { element.disabled = busy; });
  const status = snapshot?.event.status;
  $("close").disabled = busy || !["registration", "closed"].includes(status);
  $("close").textContent = status === "closed" ? "접수 재개" : "접수 마감";
  $("close").className = status === "closed" ? "secondary" : "danger";
  $("draw").disabled = busy || status !== "closed" || (snapshot?.participants.length ?? 0) < Number($("winnerCount").value);
  $("winnerCount").disabled = busy || status !== "closed";
  $("finish").disabled = busy || status !== "drawing";
  $("csv").disabled = busy || !snapshot?.winners.length;
  document.querySelectorAll(".admin-slot").forEach((button) => { button.disabled = busy || status !== "registration" || !button.dataset.participant; });
}
function logout() {
  clearSession();
  token = ""; snapshot = null; editing = null;
  if ($("editDialog").open) $("editDialog").close();
  document.body.classList.remove("presenting");
  $("dashboard").hidden = true; $("loginPanel").hidden = false; $("logout").hidden = true;
  $("eventPanel").hidden = true; $("exitPresentation").hidden = true;
  $("board").replaceChildren(); $("winners").replaceChildren(); $("announcement").textContent = "";
}
async function api(action, payload = {}) {
  if (action !== "login" && (!token || expiresAt <= Date.now())) {
    logout(); throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!isConfigured()) throw new Error("Supabase 연결 설정을 확인해 주세요.");
  let response;
  try { response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/nds-lucky-100-admin`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action, event_id: eventId, admin_session_token: token, ...payload }), signal: AbortSignal.timeout(20000),
  }); } catch { throw new Error("연결에 실패했습니다. 작업이 처리되었을 수 있으니 기존 행사 ID로 새로고침해 확인해 주세요."); }
  const data = await response.json().catch(() => ({}));
  if (data.error === "DRAW_ALREADY_STARTED") throw new Error("추첨이 시작된 이후에는 접수를 재개할 수 없습니다. 새로고침해 주세요.");
  if (data.error === "CANDIDATES_CHANGED") throw new Error("접수 재개로 참가 명단이 변경되었습니다. 새로고침 후 다시 추첨해 주세요.");
  if (!response.ok || data.success !== true) {
    if (response.status === 401 && action !== "login") logout();
    const errors = { CLOSED: "접수 마감 이후에는 수정하거나 삭제할 수 없습니다.", NOT_CLOSED: "접수를 먼저 마감해 주세요.", NOT_DRAWING: "추첨을 먼저 시작해 주세요.", ALREADY_NAME: "이미 등록된 이름입니다.", NOT_ENOUGH_PARTICIPANTS: "참가자가 당첨 인원보다 적습니다.", EVENT_NOT_FOUND: "행사를 찾을 수 없습니다. 행사 ID를 확인해 주세요.", INVALID_NAME: "이름은 1~30자로 입력해 주세요.", TOO_MANY_REQUESTS: "요청이 많습니다. 1분 후 다시 시도해 주세요." };
    throw new Error(errors[data.error] ?? (response.status === 401 ? "ID와 비밀번호 또는 로그인 만료 여부를 확인해 주세요." : response.status === 404 ? "관리자 API가 아직 배포되지 않았습니다." : "요청을 처리하지 못했습니다. 서버 설정과 연결을 확인해 주세요."));
  }
  return data;
}
async function run(task) {
  if (busy) return;
  busy = true; controls(); message();
  try { await task(); } catch (error) { message(error.message); if ($("editDialog").open) $("editMessage").textContent = error.message; }
  finally { busy = false; controls(); }
}
function validate(data) {
  if (!data.event?.id || !labels[data.event.status] || !Array.isArray(data.participants) || !Array.isArray(data.winners)) throw new Error("행사 정보를 확인하지 못했습니다.");
  return data;
}
function render() {
  const { event, participants, winners } = snapshot;
  $("eventPanel").hidden = false; $("eventTitle").textContent = event.title; $("status").textContent = labels[event.status];
  $("participantCount").textContent = participants.length;
  $("closedInfo").textContent = event.closed_at ? `마감 ${new Date(event.closed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · ${event.closed_participant_count}명 확정` : "";
  const link = new URL("../nds_lucky_100/", location.href); link.searchParams.set("event", event.id); $("entryLink").value = link.href;
  $("eventInput").value = event.id;
  if (event.winner_limit) $("winnerCount").value = String(event.winner_limit);
  const url = new URL(location.href); url.searchParams.set("event", event.id); history.replaceState(null, "", url);
  $("board").replaceChildren();
  for (let n = 1; n <= 100; n++) {
    const p = participants.find((row) => row.slot_number === n);
    const button = document.createElement("button"); button.type = "button"; button.className = `admin-slot${p ? " filled" : ""}`; button.dataset.slot = n;
    const number = document.createElement("strong"); number.textContent = n; const name = document.createElement("span"); name.textContent = p?.display_name ?? "—"; button.append(number, name);
    if (p) { button.dataset.participant = p.id; button.addEventListener("click", () => edit(p)); }
    if (!animating && winners.some((w) => w.participant_id === p?.id)) button.classList.add("winner");
    $("board").append(button);
  }
  renderWinners(); controls();
}
function renderWinners() {
  $("winners").replaceChildren();
  if (animating) return;
  for (const winner of [...snapshot.winners].sort((a, b) => a.prize_rank - b.prize_rank)) {
    const p = snapshot.participants.find((row) => row.id === winner.participant_id);
    const item = document.createElement("li"); const number = document.createElement("strong"); number.textContent = `${p?.slot_number ?? winner.slot_number}번`;
    const text = document.createElement("span"); text.textContent = `${winner.prize_rank}번째 당첨 · ${p?.display_name ?? winner.display_name}`; item.append(number, text); $("winners").append(item);
  }
  $("announcement").textContent = snapshot.winners.length ? "✦ 당첨을 축하합니다!" : "";
}
async function refresh(id = eventId) {
  const data = validate(await api("board", { event_id: id }));
  eventId = data.event.id; snapshot = data; render();
}
function edit(participant) {
  if (busy || snapshot.event.status !== "registration") return;
  editing = participant; $("editSlot").textContent = participant.slot_number; $("editName").value = participant.display_name; $("editMessage").textContent = ""; $("editDialog").showModal();
}
$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault(); run(async () => {
    const data = await api("login", { admin_id: $("adminId").value.trim(), password: $("password").value });
    saveSession(data); $("password").value = ""; $("loginPanel").hidden = true; $("dashboard").hidden = false; $("logout").hidden = false;
    if (eventId) await refresh();
  });
});
$("logout").addEventListener("click", logout);
$("createForm").addEventListener("submit", (event) => {
  event.preventDefault(); const title = $("titleInput").value.trim(); if (!title) return;
  if (!confirm(`“${title}” 행사를 새로 생성하시겠습니까?`)) return;
  run(async () => { const data = await api("create", { title }); eventId = data.event.id; $("eventInput").value = eventId; const url = new URL(location.href); url.searchParams.set("event", eventId); history.replaceState(null, "", url); await refresh(); });
});
$("loadForm").addEventListener("submit", (event) => { event.preventDefault(); const id = $("eventInput").value.trim(); run(() => refresh(id)); });
$("refresh").addEventListener("click", () => run(() => refresh()));
$("winnerCount").addEventListener("change", controls);
$("close").addEventListener("click", () => {
  const reopen = snapshot?.event.status === "closed";
  if (!confirm(reopen ? "접수를 재개하면 신규 참가와 정보 수정이 다시 허용됩니다. 접수를 재개하시겠습니까?" : "지금 마감하면 이후 신규 참여가 불가능합니다. 마감하시겠습니까?")) return;
  run(async () => { await api(reopen ? "reopen" : "close"); await refresh(); });
});
$("editForm").addEventListener("submit", (event) => {
  event.preventDefault(); const p = editing;
  run(async () => { await api("update", { participant_id: p.id, name: $("editName").value.trim() }); $("editDialog").close(); await refresh(); });
});
$("deleteParticipant").addEventListener("click", () => {
  const p = editing; if (!confirm(`${p.slot_number}번 ${p.display_name} 님의 등록을 삭제하시겠습니까?`)) return;
  run(async () => { await api("delete", { participant_id: p.id }); $("editDialog").close(); await refresh(); });
});
$("cancelEdit").addEventListener("click", () => $("editDialog").close());
$("editDialog").addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
$("finish").addEventListener("click", () => { if (confirm("행사를 종료하고 결과를 보존하시겠습니까?")) run(async () => { await api("finish"); await refresh(); }); });
$("draw").addEventListener("click", () => {
  const count = Number($("winnerCount").value);
  if (!confirm(`${count}명을 추첨하시겠습니까? 확정된 결과는 변경할 수 없습니다.`)) return;
  run(async () => {
    animating = true;
    try {
      await api("draw", { winner_count: count }); await refresh();
      // Only registered numbers animate. Winners were already committed by the server.
      const candidates = [...$("board").querySelectorAll(".filled")];
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 6000;
      const start = performance.now();
      await new Promise((resolve) => {
        function frame(now) {
          candidates.forEach((node) => node.classList.remove("highlight"));
          if (now - start >= duration) { resolve(); return; }
          candidates[Math.floor((now - start) / 90) % candidates.length]?.classList.add("highlight");
          $("announcement").textContent = "행운의 주인공을 발표합니다…"; requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    } finally { animating = false; if (snapshot) render(); }
  });
});
$("copyLink").addEventListener("click", () => run(async () => {
  try { await navigator.clipboard.writeText($("entryLink").value); message("참가 링크를 복사했습니다."); }
  catch { $("entryLink").select(); message("참가 링크를 선택했습니다. 직접 복사해 주세요."); }
}));
function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
$("csv").addEventListener("click", () => {
  const rows = [["행사", "당첨 순서", "번호", "이름", "확정 시각"]];
  for (const w of snapshot.winners) { const p = snapshot.participants.find((p) => p.id === w.participant_id); rows.push([snapshot.event.title, w.prize_rank, p?.slot_number, p?.display_name, w.created_at]); }
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `nds-lucky-100-${eventId}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("presentation").addEventListener("click", () => { document.body.classList.add("presenting"); $("exitPresentation").hidden = false; });
function exitPresentation() { document.body.classList.remove("presenting"); $("exitPresentation").hidden = true; }
$("exitPresentation").addEventListener("click", exitPresentation);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") exitPresentation(); });
async function sync() {
  if (token && expiresAt <= Date.now()) { logout(); message("로그인이 만료되었습니다. 다시 로그인해 주세요."); return; }
  if (token && eventId && snapshot && !busy && !document.hidden && !$("editDialog").open) await run(() => refresh());
}
setInterval(sync, 5000); window.addEventListener("online", sync); document.addEventListener("visibilitychange", sync);
$("eventInput").value = eventId; controls();
restoreSession();
