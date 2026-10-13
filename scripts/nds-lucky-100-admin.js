import { CONFIG, isConfigured } from "./config.js";
const $ = (id) => document.getElementById(id);
const labels = { registration: "접수 중", closed: "접수 마감", drawing: "추첨 진행", completed: "종료" };
let token = "", eventId = new URLSearchParams(location.search).get("event") ?? "", snapshot = null, busy = false, editing = null, animating = false;
const sessionKey = "nds_lucky_100_admin_session";
let expiresAt = 0;
let syncTask = null;
let revealedCount = 0;
let inlineEditing = null;
function rememberReveal() {
  try { sessionStorage.setItem(`nds_reveal_${eventId}`, String(revealedCount)); } catch { /* Presentation still works without storage. */ }
}
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
function message(text = "") { $("message").textContent = text; $("stageMessage").textContent = text; }
function controls() {
  document.querySelectorAll("button,select").forEach((element) => { element.disabled = busy; });
  const status = snapshot?.event.status;
  $("close").disabled = busy || !["registration", "closed"].includes(status);
  $("close").textContent = status === "closed" ? "접수 재개" : "접수 마감";
  $("close").className = status === "closed" ? "secondary" : "danger";
  $("draw").disabled = busy || status !== "closed" || (snapshot?.participants.length ?? 0) < Number($("winnerCount").value);
  $("stageDraw").disabled = $("draw").disabled;
  $("stageDraw").hidden = status !== "closed";
  const canReveal = status === "drawing" && revealedCount < (snapshot?.winners.length ?? 0);
  $("nextWinner").disabled = busy || !canReveal;
  $("popupNext").disabled = busy || !canReveal;
  $("nextWinner").hidden = status !== "drawing";
  $("popupNext").hidden = !canReveal;
  $("revealProgress").textContent = snapshot?.winners.length ? `${revealedCount} / ${snapshot.winners.length}명 공개` : "당첨 인원은 운영 화면에서 선택합니다.";
  $("winnerCount").disabled = busy || status !== "closed";
  $("finish").disabled = busy || status !== "drawing" || canReveal;
  $("csv").disabled = busy || !snapshot?.winners.length || canReveal;
  $("seedButton").disabled = busy || status !== "registration";
  $("testCount").disabled = busy || status !== "registration";
  $("seedButton").textContent = busy && seeding ? "넣는 중…" : "넣기";
  const full = (snapshot?.participants.length ?? 0) >= 100;
  $("seedButton").disabled ||= full;
  $("testReopen").hidden = status !== "closed";
  $("testReopen").disabled = busy;
  $("testHelp").textContent = status === "closed"
    ? "접수가 마감되어 추가할 수 없습니다. 아래 ‘접수 재개’를 누른 뒤 테스트 참가자를 넣어 주세요."
    : ["drawing", "completed"].includes(status)
      ? "추첨이 시작된 행사는 참가자를 추가할 수 없습니다. 테스트하려면 새 행사를 생성해 주세요."
      : full ? "100개 번호가 모두 등록되었습니다. 참가자를 삭제하거나 새 행사를 생성해 주세요."
        : "1~100명 · 빈 번호에 중복 없는 세 글자 이름을 무작위로 등록합니다. 실제 추첨 대상에 포함됩니다.";
  document.querySelectorAll(".slot-main,.slot-delete").forEach((button) => { button.disabled = busy || status !== "registration"; });
}
function logout() {
  clearSession();
  token = ""; snapshot = null; editing = null;
  if ($("editDialog").open) $("editDialog").close();
  document.body.classList.remove("presenting");
  $("dashboard").hidden = true; $("loginPanel").hidden = false; $("logout").hidden = true;
  $("eventPanel").hidden = true; $("exitPresentation").hidden = true;
  $("board").replaceChildren(); $("winners").replaceChildren(); $("announcement").textContent = "";
  $("winnerPopup").hidden = true;
}
async function api(action, payload = {}) {
  if (action !== "login" && (!token || expiresAt <= Date.now())) {
    logout(); throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  }
  if (!isConfigured()) throw new Error("Supabase 연결 설정을 확인해 주세요.");
  let response;
  try { response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/nds-lucky-100-admin`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action, event_id: eventId, admin_session_token: token, ...payload }), signal: AbortSignal.timeout(action === "seed" ? 120000 : 20000),
  }); } catch { throw new Error("연결에 실패했습니다. 작업이 처리되었을 수 있으니 기존 행사 ID로 새로고침해 확인해 주세요."); }
  const data = await response.json().catch(() => ({}));
  if (data.error === "DRAW_ALREADY_STARTED") throw new Error("추첨이 시작된 이후에는 접수를 재개할 수 없습니다. 새로고침해 주세요.");
  if (data.error === "CANDIDATES_CHANGED") throw new Error("접수 재개로 참가 명단이 변경되었습니다. 새로고침 후 다시 추첨해 주세요.");
  if (data.error === "NOT_ENOUGH_SLOTS") throw new Error(`빈 번호가 부족합니다. 현재 ${data.available_slots}명까지 추가할 수 있습니다.`);
  if (data.error === "INVALID_ACTION") throw new Error("서버 API 또는 DB 함수에 이 기능이 반영되지 않았습니다. 최신 접수 재개 SQL 적용과 관리자 API 배포를 확인해 주세요.");
  if (data.error === "DB_UPDATE_REQUIRED") throw new Error("DB의 접수 재개 함수가 구버전입니다. 최신 접수 재개 SQL을 적용해 주세요.");
  if (data.error === "SLOT_TAKEN") throw new Error("다른 참가자가 먼저 등록한 번호입니다. 새로고침 후 빈 번호를 선택해 주세요.");
  if (data.details?.db_code === "23514") throw new Error("DB 제약조건이 당첨 인원 1~10명을 허용하지 않고 있습니다. 최신 repair-nds-admin.sql을 적용해 주세요.");
  if (!response.ok || data.success !== true) {
    if (response.status === 401 && action !== "login") logout();
    const errors = { CLOSED: "접수 마감 이후에는 수정하거나 삭제할 수 없습니다.", NOT_CLOSED: "접수를 먼저 마감해 주세요.", NOT_DRAWING: "추첨을 먼저 시작해 주세요.", ALREADY_NAME: "이미 등록된 이름입니다.", NOT_ENOUGH_PARTICIPANTS: "참가자가 당첨 인원보다 적습니다.", EVENT_NOT_FOUND: "행사를 찾을 수 없습니다. 행사 ID를 확인해 주세요.", INVALID_NAME: "이름은 1~30자로 입력해 주세요.", TOO_MANY_REQUESTS: "요청이 많습니다. 1분 후 다시 시도해 주세요." };
    throw new Error(errors[data.error] ?? (response.status === 401 ? "ID와 비밀번호 또는 로그인 만료 여부를 확인해 주세요." : response.status === 404 ? "관리자 API가 아직 배포되지 않았습니다." : `요청을 처리하지 못했습니다. (${data.error ?? response.status}${data.details?.db_code ? ` / DB ${data.details.db_code}` : ""})`));
  }
  return data;
}
async function run(task) {
  if (busy) return;
  busy = true; controls(); message();
  try {
    // A click during a background refresh must wait, rather than be silently discarded.
    if (syncTask) await syncTask;
    await task();
  } catch (error) { message(error.message); if ($("editDialog").open) $("editMessage").textContent = error.message; }
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
    const tile = document.createElement("div"); tile.className = `admin-slot${p ? " filled" : ""}`; tile.dataset.slot = n;
    const button = document.createElement("button"); button.type = "button"; button.className = "slot-main";
    const number = document.createElement("strong"); number.textContent = n; const name = document.createElement("span"); name.textContent = p?.display_name ?? "—"; button.append(number, name);
    tile.append(button);
    if (p) {
      tile.dataset.participant = p.id; button.addEventListener("click", () => edit(p));
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "slot-delete"; remove.textContent = "×";
      remove.setAttribute("aria-label", `${n}번 ${p.display_name} 삭제`);
      remove.addEventListener("click", () => {
        if (busy || snapshot.event.status !== "registration") return;
        if (!confirm(`${n}번 ${p.display_name} 님을 삭제하시겠습니까?`)) return;
        run(async () => { await api("delete", { participant_id: p.id }); await refresh(); });
      });
      if (event.status === "registration") tile.append(remove);
    } else {
      button.setAttribute("aria-label", `${n}번 빈 번호. 더블클릭하거나 Enter를 눌러 등록`);
      button.addEventListener("dblclick", () => beginInline(tile, n));
      button.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); beginInline(tile, n); } });
    }
    if (winners.some((w) => w.prize_rank <= revealedCount && w.participant_id === p?.id)) tile.classList.add("winner");
    $("board").append(tile);
  }
  renderWinners(); controls();
}
function beginInline(tile, slot) {
  if (busy || inlineEditing || snapshot?.event.status !== "registration") return;
  const input = document.createElement("input"); input.className = "slot-input"; input.maxLength = 30; input.placeholder = "이름 입력";
  input.setAttribute("aria-label", `${slot}번 참가자 이름`);
  inlineEditing = input; tile.classList.add("editing"); tile.append(input); input.focus();
  let finished = false;
  function finish(cancel = false) {
    if (finished) return; finished = true;
    const name = input.value.trim().replace(/\s+/g, " "); inlineEditing = null;
    if (cancel || !name || !confirm(`${slot}번에 ${name} 님을 등록하시겠습니까?`)) { render(); return; }
    run(async () => {
      try { await api("register", { name, slot_number: slot }); await refresh(); message(`${slot}번에 ${name} 님을 등록했습니다.`); }
      catch (error) { render(); throw error; }
    });
  }
  input.addEventListener("blur", () => finish());
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); finish(); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(true); }
  });
}
function renderWinners() {
  $("winners").replaceChildren();
  for (const winner of [...snapshot.winners].sort((a, b) => a.prize_rank - b.prize_rank)) {
    if (winner.prize_rank > revealedCount) continue;
    const p = snapshot.participants.find((row) => row.id === winner.participant_id);
    const item = document.createElement("li"); const number = document.createElement("strong"); number.textContent = `${p?.slot_number ?? winner.slot_number}번`;
    const text = document.createElement("span"); text.textContent = `${winner.prize_rank}번째 당첨 · ${p?.display_name ?? winner.display_name}`; item.append(number, text); $("winners").append(item);
  }
  $("announcement").textContent = revealedCount ? "✦ 당첨을 축하합니다!" : snapshot.winners.length ? "결과가 확정되었습니다. 한 명씩 공개해 주세요." : "";
}
async function refresh(id = eventId) {
  const data = validate(await api("board", { event_id: id }));
  if (snapshot?.event.id !== data.event.id || !snapshot?.winners.length && data.winners.length) {
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(`nds_reveal_${data.event.id}`)) || 0; } catch { /* Start from first winner. */ }
    revealedCount = data.event.status === "completed" ? data.winners.length : Math.max(0, Math.min(saved, data.winners.length));
  }
  const changed = JSON.stringify(snapshot) !== JSON.stringify(data);
  eventId = data.event.id; snapshot = data;
  if (changed && !inlineEditing) render();
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
let seeding = false;
$("testReopen").addEventListener("click", () => $("close").click());
$("seedForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const count = Number($("testCount").value);
  if (!Number.isInteger(count) || count < 1 || count > 100) { message("테스트 인원은 1~100명으로 입력해 주세요."); return; }
  const available = 100 - (snapshot?.participants.length ?? 100);
  if (count > available) { message(`빈 번호가 부족합니다. 현재 ${available}명까지 추가할 수 있습니다.`); return; }
  run(async () => {
    seeding = true; controls();
    let response;
    try { response = await api("seed", { count }); }
    catch (error) {
      // Some inserts can commit before a network timeout. Restore the actual board first.
      if (token) { try { await refresh(); } catch { /* Preserve the original failure. */ } }
      throw error;
    }
    finally { seeding = false; }
    await refresh();
    message(response.inserted_count === count ? `테스트 참가자 ${count}명을 등록했습니다.` : `${count}명 중 ${response.inserted_count}명을 등록했습니다. 접수 상태와 남은 번호를 확인해 주세요.`);
  });
});
$("close").addEventListener("click", () => {
  const reopen = snapshot?.event.status === "closed";
  if (!confirm(reopen ? "접수를 재개하면 신규 참가와 정보 수정이 다시 허용됩니다. 접수를 재개하시겠습니까?" : "지금 마감하면 이후 신규 참여가 불가능합니다. 마감하시겠습니까?")) return;
  run(async () => {
    const response = await api(reopen ? "reopen" : "close");
    if (response.event && snapshot) {
      snapshot = { ...snapshot, event: response.event };
      render();
    }
    await refresh();
    const expected = reopen ? "registration" : "closed";
    if (snapshot?.event.status !== expected) {
      throw new Error(reopen ? "서버에서 접수 재개가 확인되지 않았습니다. DB 함수 적용 상태를 확인해 주세요." : "서버에서 접수 마감이 확인되지 않았습니다. 현재 행사 상태를 확인해 주세요.");
    }
    message(reopen ? "접수를 재개했습니다. ‘접수 마감’과 테스트 참가자 넣기를 사용할 수 있습니다." : "접수를 마감했습니다. 추첨 전에는 다시 재개할 수 있습니다.");
  });
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
async function revealWinner() {
  const winner = [...snapshot.winners].sort((a, b) => a.prize_rank - b.prize_rank)[revealedCount];
  if (!winner) return;
  const participant = snapshot.participants.find((p) => p.id === winner.participant_id);
  if (!participant) throw new Error("당첨자 정보를 확인하지 못했습니다. 새로고침해 주세요.");
  animating = true;
  $("winnerPopup").hidden = false;
  $("winnerPopup").classList.remove("celebrate");
  $("popupTitle").textContent = `${revealedCount + 1}번째 행운의 주인공은?`;
  $("popupName").textContent = "두근두근…";
  $("popupProgress").textContent = `${revealedCount + 1} / ${snapshot.winners.length}명`;
  const disclosed = new Set(snapshot.winners.filter((w) => w.prize_rank <= revealedCount).map((w) => w.participant_id));
  const candidates = snapshot.participants.filter((p) => !disclosed.has(p.id));
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 5500;
  const start = performance.now();
  try {
    await new Promise((resolve) => {
      function frame(now) {
        const elapsed = now - start;
        $("board").querySelectorAll(".highlight").forEach((node) => node.classList.remove("highlight"));
        if (elapsed >= duration) { resolve(); return; }
        // Numbers are visual effects only; the actual winner is already saved on the server.
        const index = Math.floor(35 * Math.log1p(elapsed / 400)) % candidates.length;
        const candidate = candidates[index];
        $("popupNumber").textContent = candidate.slot_number;
        $("board").querySelector(`[data-slot="${candidate.slot_number}"]`)?.classList.add("highlight");
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    $("popupNumber").textContent = participant.slot_number;
    $("popupName").textContent = participant.display_name;
    $("popupTitle").textContent = "✦ 당첨을 축하합니다!";
    $("winnerPopup").classList.add("celebrate");
    revealedCount++; rememberReveal();
  } finally { animating = false; render(); }
}
$("draw").addEventListener("click", () => {
  const count = Number($("winnerCount").value);
  if (!confirm(`${count}명을 추첨하시겠습니까? 확정된 결과는 변경할 수 없습니다.`)) return;
  run(async () => {
    await api("draw", { winner_count: count });
    await refresh();
    await revealWinner();
  });
});
$("stageDraw").addEventListener("click", () => $("draw").click());
$("nextWinner").addEventListener("click", () => run(revealWinner));
$("popupNext").addEventListener("click", () => run(revealWinner));
$("popupClose").addEventListener("click", () => { $("winnerPopup").hidden = true; $("nextWinner").focus(); });
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
  // Poll only while attendees can register. Quiet refreshes do not flash loading controls.
  if (!token || !eventId || snapshot?.event.status !== "registration" || busy || syncTask || inlineEditing || document.hidden || $("editDialog").open) return;
  syncTask = refresh().catch((error) => message(error.message));
  try { await syncTask; }
  finally { syncTask = null; controls(); }
}
setInterval(sync, 5000); window.addEventListener("online", sync); document.addEventListener("visibilitychange", sync);
$("eventInput").value = eventId; controls();
restoreSession();
