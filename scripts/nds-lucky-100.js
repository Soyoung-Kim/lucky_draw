import { CONFIG, isConfigured } from "./config.js";

// Dedicated Edge Functions: lookup {is_registered, own_slot, event_status},
// board {occupied_slots: number[], event_status}, register {own_slot, event_status}.
// Every request includes event_id. The server owns validation and registration.
const $ = (id) => document.getElementById(id);
const eventId = new URLSearchParams(location.search).get("event");
const state = { name: "", selected: null, occupied: new Set(), status: null, busy: false, registered: false, fresh: false };
const slots = [];
let maxSlots = 100;

function message(value = "") { $("message").textContent = value; }
function busy(value) {
  state.busy = value;
  $("lookupButton").disabled = value;
  $("nameInput").disabled = value;
  $("lookupButton").textContent = value ? "확인 중…" : "내 번호 선택하기 →";
  renderBoard();
}
async function request(action, payload = {}) {
  if (!eventId) throw new Error("행사 링크를 확인해 주세요. 행사에서 제공한 QR 코드로 다시 접속해 주세요.");
  if (!isConfigured()) throw new Error("참가 서비스를 준비 중입니다. 운영자에게 문의해 주세요.");
  let response;
  try {
    response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/nds-lucky-100-${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ event_id: eventId, ...payload }), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요."); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false || data.error) {
    const code = data.code ?? data.error?.code ?? data.error;
    const error = new Error(({ SLOT_TAKEN: "다른 참가자가 먼저 선택한 번호입니다. 다른 번호를 골라 주세요.", CLOSED: "접수가 마감되었습니다.", ALREADY_NAME: "이미 참가한 이름입니다. 내 번호를 다시 확인해 주세요.", TOO_MANY_REQUESTS: "요청이 많습니다. 1분 후 다시 시도해 주세요.", INVALID_NAME: "이름은 1~30자로 입력해 주세요." })[code] ?? (response.status === 404 ? "참가 서비스를 준비 중이거나 행사 링크가 올바르지 않습니다. 운영자에게 문의해 주세요." : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    error.code = code;
    throw error;
  }
  return data;
}
function validateStatus(status) {
  if (!["registration", "closed", "drawing", "completed"].includes(status)) throw new Error("행사 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
  return status;
}
function showResult(slot, status) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 150) throw new Error("등록 번호를 확인하지 못했습니다. 다시 조회해 주세요.");
  state.registered = true;
  $("boardSection").hidden = true;
  $("closedSection").hidden = true;
  $("resultSection").hidden = false;
  $("resultName").textContent = state.name;
  $("ownSlot").textContent = slot;
  $("resultHelp").textContent = status === "registration" ? "번호를 기억하고, 추첨 시간을 기다려 주세요." : "접수가 마감되었습니다. 내 참가 번호는 그대로 유지됩니다.";
}
function renderBoard() {
  for (const button of slots) {
    const n = Number(button.dataset.slot);
    const taken = state.occupied.has(n);
    button.disabled = state.busy || !state.fresh || state.status !== "registration" || taken || state.registered;
    button.setAttribute("aria-pressed", String(state.selected === n));
    button.setAttribute("aria-label", `${n}번${taken ? ", 참가 완료" : ", 선택 가능"}`);
  }
  $("count").textContent = `${state.occupied.size} / ${maxSlots}`;
  $("selectionText").textContent = state.selected ? `${state.selected}번을 선택했습니다.` : "번호를 선택해 주세요.";
  $("registerButton").disabled = state.busy || !state.fresh || !state.selected || state.status !== "registration" || state.registered;
}
async function refreshBoard() {
  const data = await request("board");
  const status = validateStatus(data.event_status);
  const capacity = data.max_slots ?? 100;
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 150 || !Array.isArray(data.occupied_slots) || data.occupied_slots.some((n) => !Number.isInteger(n) || n < 1 || n > capacity)) throw new Error("번호판을 불러오지 못했습니다. 다시 시도해 주세요.");
  maxSlots = capacity;
  buildBoard();
  state.status = status;
  state.occupied = new Set(data.occupied_slots);
  state.fresh = true;
  if (state.occupied.has(state.selected)) state.selected = null;
  $("boardSection").hidden = status !== "registration" || state.registered;
  $("closedSection").hidden = status === "registration" || state.registered;
  renderBoard();
}
async function lookup() {
  $("participantName").textContent = state.name;
  const data = await request("lookup", { name: state.name });
  state.status = validateStatus(data.event_status);
  if (typeof data.is_registered !== "boolean") throw new Error("참가 여부를 확인하지 못했습니다. 다시 시도해 주세요.");
  if (data.is_registered) showResult(data.own_slot, state.status);
  else if (state.status !== "registration") $("closedSection").hidden = false;
  else { $("participantName").textContent = state.name; await refreshBoard(); }
}
function buildBoard() {
  if (slots.length === maxSlots) return;
  slots.length = 0; $("board").replaceChildren();
  $("board").setAttribute("aria-label", `1부터 ${maxSlots}까지 번호 선택`);
  $("board").style.gridTemplateColumns = `repeat(${Math.min(10, maxSlots)}, minmax(0, 1fr))`;
for (let n = 1; n <= maxSlots; n++) {
  const button = document.createElement("button");
  button.type = "button"; button.className = "slot"; button.dataset.slot = n; button.textContent = n;
  button.addEventListener("click", () => { state.selected = n; renderBoard(); });
  slots.push(button); $("board").append(button);
}
}
buildBoard();
$("nameInput").addEventListener("input", () => {
  state.name = ""; state.selected = null; state.registered = false; state.fresh = false;
  for (const id of ["boardSection", "resultSection", "closedSection"]) $(id).hidden = true;
  message(); renderBoard();
});
$("nameForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const name = $("nameInput").value.trim().replace(/\s+/g, " ");
  if (!name || [...name].length > 30) { message("이름은 1~30자로 입력해 주세요."); return; }
  state.name = name; state.selected = null; state.registered = false; state.fresh = false;
  for (const id of ["boardSection", "resultSection", "closedSection"]) $(id).hidden = true;
  message(); busy(true);
  try { await lookup(); } catch (error) { message(error.message); } finally { busy(false); }
});
$("registerButton").addEventListener("click", async () => {
  if (state.busy || !state.fresh || !state.selected || state.status !== "registration" || state.registered) return;
  busy(true); message();
  try {
    const data = await request("register", { name: state.name, slot_number: state.selected });
    showResult(data.own_slot, validateStatus(data.event_status));
  } catch (error) {
    message(error.message);
    state.fresh = false; state.selected = null;
    // A lost response can still mean the server committed registration.
    try { await lookup(); } catch { message(`${error.message} 이름을 다시 확인해 주세요.`); }
  } finally { busy(false); }
});
async function sync() {
  if (document.hidden || state.busy || !state.name || state.registered) return;
  busy(true);
  try { await refreshBoard(); message(); } catch (error) { state.fresh = false; message(error.message); } finally { busy(false); }
}
setInterval(sync, 5000);
window.addEventListener("online", sync);
document.addEventListener("visibilitychange", sync);
renderBoard();
if (!eventId) message("행사에서 제공한 QR 코드나 참가 링크로 접속해 주세요.");
