import {
  adminLogin,
  closeRoom as closeRoomApi,
  countParticipants,
  createDraw as createDrawApi,
  createRoom as createRoomApi,
  fetchLatestDraw,
  fetchRevealedCards,
  fetchRevealedResults,
  fetchRooms,
  finishDraw as finishDrawApi,
  revealAll as revealAllApi,
  revealCard as revealCardApi,
  revealNext as revealNextApi,
} from "./api.js";
import { CONFIG } from "./config.js";
import { renderDrawStage, renderResultsList } from "./drawRenderer.js";
import { subscribeDraw, subscribeRoom, unsubscribe } from "./realtime.js";
import {
  $,
  createSparkles,
  setButtonLoading,
  setMessage,
  sleep,
  statusLabel,
  toIsoFromLocalInput,
} from "./utils.js";

const SESSION_KEY = "instant_draw_admin_session";

const state = {
  session: null,
  rooms: [],
  room: null,
  draw: null,
  results: [],
  cards: [],
  roomChannel: null,
  drawChannel: null,
  countTimer: null,
  drawTimer: null,
  autoRevealRunning: false,
};

const els = {
  adminStateBadge: $("#adminStateBadge"),
  adminLoginForm: $("#adminLoginForm"),
  adminIdInput: $("#adminIdInput"),
  adminPasswordInput: $("#adminPasswordInput"),
  adminLoginButton: $("#adminLoginButton"),
  adminLoginMessage: $("#adminLoginMessage"),
  createRoomForm: $("#createRoomForm"),
  roomTitleInput: $("#roomTitleInput"),
  newRoomCodeInput: $("#newRoomCodeInput"),
  startsAtInput: $("#startsAtInput"),
  endsAtInput: $("#endsAtInput"),
  createRoomButton: $("#createRoomButton"),
  createRoomMessage: $("#createRoomMessage"),
  roomSelect: $("#roomSelect"),
  adminParticipantCount: $("#adminParticipantCount"),
  adminRoomStatus: $("#adminRoomStatus"),
  refreshRoomsButton: $("#refreshRoomsButton"),
  closeRoomButton: $("#closeRoomButton"),
  shareEntryLink: $("#shareEntryLink"),
  createDrawForm: $("#createDrawForm"),
  winnerCountSelect: $("#winnerCountSelect"),
  customWinnerCountInput: $("#customWinnerCountInput"),
  drawModeSelect: $("#drawModeSelect"),
  createDrawButton: $("#createDrawButton"),
  revealNextButton: $("#revealNextButton"),
  revealAllButton: $("#revealAllButton"),
  finishDrawButton: $("#finishDrawButton"),
  drawAdminMessage: $("#drawAdminMessage"),
  adminDrawStage: $("#adminDrawStage"),
  adminResultList: $("#adminResultList"),
};

function toDateTimeLocalValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function loadSession() {
  try {
    state.session = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    state.session = null;
  }
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  renderAdminState();
}

function adminPayload() {
  if (!state.session?.admin_session_token) {
    throw new Error("관리자 로그인이 필요합니다.");
  }

  return {
    admin_session_token: state.session.admin_session_token,
  };
}

function renderAdminState() {
  if (state.session?.admin_session_token) {
    els.adminStateBadge.className = "status-pill open";
    els.adminStateBadge.textContent = "로그인";
    return;
  }

  els.adminStateBadge.className = "status-pill";
  els.adminStateBadge.textContent = "로그아웃";
}

function renderRoomOptions() {
  if (state.rooms.length === 0) {
    els.roomSelect.innerHTML = `<option value="">이벤트 없음</option>`;
    return;
  }

  els.roomSelect.innerHTML = state.rooms
    .map(
      (room) =>
        `<option value="${room.id}">${room.code} · ${room.title} · ${statusLabel(room.status)}</option>`,
    )
    .join("");

  if (state.room) {
    els.roomSelect.value = state.room.id;
  }
}

function renderRoom() {
  const room = state.room;

  if (!room) {
    els.adminParticipantCount.textContent = "0";
    els.adminRoomStatus.textContent = "대기";
    els.shareEntryLink.href = "./index.html";
    els.shareEntryLink.textContent = "참여 링크";
    els.closeRoomButton.disabled = true;
    els.createDrawButton.disabled = true;
    els.revealNextButton.disabled = true;
    els.revealAllButton.disabled = true;
    els.finishDrawButton.disabled = true;
    renderAdminState();
    return;
  }

  els.adminRoomStatus.textContent = statusLabel(room.status);
  const entryUrl = new URL("./index.html", window.location.href);
  entryUrl.searchParams.set("room", room.code);
  els.shareEntryLink.href = entryUrl.href;
  els.shareEntryLink.textContent = `${room.code} 참여 링크`;
  els.closeRoomButton.disabled = room.status !== "open";
  els.createDrawButton.disabled = room.status !== "closed";
  els.revealNextButton.disabled = !state.draw || state.draw.status === "finished";
  els.revealAllButton.disabled = !state.draw || state.draw.status === "finished";
  els.finishDrawButton.disabled = !state.draw || state.draw.status === "finished";
}

function renderDraw() {
  renderDrawStage(els.adminDrawStage, {
    draw: state.draw,
    results: state.results,
    cards: state.cards,
    onCardClick:
      state.draw?.draw_mode === "card" && state.draw?.status !== "finished"
        ? handleCardClick
        : null,
  });
  renderResultsList(els.adminResultList, state.results);
  renderRoom();
}

async function refreshParticipantCount() {
  if (!state.room) return;
  const count = await countParticipants(state.room.id);
  els.adminParticipantCount.textContent = String(count);
}

async function refreshDrawData() {
  if (!state.draw) {
    state.results = [];
    state.cards = [];
    renderDraw();
    return;
  }

  const [results, cards] = await Promise.all([
    fetchRevealedResults(state.draw.id),
    state.draw.draw_mode === "card" ? fetchRevealedCards(state.draw.id) : Promise.resolve([]),
  ]);

  const previousResultCount = state.results.length;
  state.results = results;
  state.cards = cards;
  renderDraw();

  if (results.length > previousResultCount) {
    createSparkles(els.adminDrawStage);
  }
}

function subscribeToDraw(drawId) {
  if (state.drawChannel) {
    unsubscribe(state.drawChannel);
  }

  state.drawChannel = subscribeDraw(drawId, {
    onResult: () => refreshDrawData().catch(console.error),
    onCard: () => refreshDrawData().catch(console.error),
  });
}

async function refreshLatestDraw() {
  if (!state.room) return;
  const draw = await fetchLatestDraw(state.room.id);
  const changed = draw?.id && draw.id !== state.draw?.id;
  state.draw = draw;

  if (changed) {
    subscribeToDraw(draw.id);
  }

  await refreshDrawData();
}

function startPolling() {
  window.clearInterval(state.countTimer);
  window.clearInterval(state.drawTimer);
  state.countTimer = window.setInterval(() => {
    refreshParticipantCount().catch(console.error);
  }, CONFIG.PARTICIPANT_COUNT_REFRESH_MS);
  state.drawTimer = window.setInterval(() => {
    refreshLatestDraw().catch(console.error);
  }, CONFIG.DRAW_REFRESH_MS);
}

async function selectRoom(roomId) {
  state.room = state.rooms.find((room) => room.id === roomId) || null;
  state.draw = null;
  state.results = [];
  state.cards = [];
  renderRoom();
  renderDraw();

  if (state.roomChannel) {
    unsubscribe(state.roomChannel);
  }

  if (!state.room) return;

  state.roomChannel = subscribeRoom(state.room.id, {
    onRoom: (updatedRoom) => {
      state.room = { ...state.room, ...updatedRoom };
      const index = state.rooms.findIndex((room) => room.id === state.room.id);

      if (index >= 0) {
        state.rooms[index] = state.room;
      }

      renderRoomOptions();
      renderRoom();
      refreshLatestDraw().catch(console.error);
    },
    onDraw: () => refreshLatestDraw().catch(console.error),
  });

  await Promise.all([refreshParticipantCount(), refreshLatestDraw()]);
  startPolling();
}

async function loadRooms(selectedRoomId = null) {
  state.rooms = await fetchRooms();
  renderRoomOptions();

  const nextRoomId = selectedRoomId || state.room?.id || state.rooms[0]?.id || "";
  els.roomSelect.value = nextRoomId;
  await selectRoom(nextRoomId);
}

function getWinnerCount() {
  if (els.winnerCountSelect.value === "custom") {
    return Number(els.customWinnerCountInput.value);
  }

  return Number(els.winnerCountSelect.value);
}

async function runAutoReveal(drawId, winnerCount) {
  if (state.autoRevealRunning) return;

  state.autoRevealRunning = true;

  try {
    for (let i = 0; i < winnerCount; i += 1) {
      await sleep(CONFIG.AUTO_REVEAL_DELAY_MS);
      const response = await revealNextApi({
        ...adminPayload(),
        draw_id: drawId,
      });
      await refreshLatestDraw();

      if (!response.winner || response.remaining_count <= 0) {
        break;
      }
    }
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    state.autoRevealRunning = false;
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  setButtonLoading(els.adminLoginButton, true, "로그인 중");

  try {
    const session = await adminLogin(els.adminIdInput.value, els.adminPasswordInput.value);
    saveSession(session);
    setMessage(els.adminLoginMessage, "로그인되었습니다.", "success");
    await loadRooms();
  } catch (error) {
    setMessage(els.adminLoginMessage, error.message, "error");
  } finally {
    setButtonLoading(els.adminLoginButton, false);
  }
}

async function handleCreateRoom(event) {
  event.preventDefault();
  setButtonLoading(els.createRoomButton, true, "생성 중");

  try {
    const payload = {
      ...adminPayload(),
      title: els.roomTitleInput.value,
      ends_at: toIsoFromLocalInput(els.endsAtInput.value),
    };

    const startsAt = toIsoFromLocalInput(els.startsAtInput.value);
    const code = els.newRoomCodeInput.value.trim();

    if (startsAt) payload.starts_at = startsAt;
    if (code) payload.code = code;

    const response = await createRoomApi(payload);
    setMessage(els.createRoomMessage, `${response.room.code} 이벤트가 열렸습니다.`, "success");
    els.createRoomForm.reset();
    setDefaultDates();
    await loadRooms(response.room.id);
  } catch (error) {
    setMessage(els.createRoomMessage, error.message, "error");
  } finally {
    setButtonLoading(els.createRoomButton, false);
  }
}

async function handleCloseRoom() {
  if (!state.room) return;
  setButtonLoading(els.closeRoomButton, true, "마감 중");

  try {
    await closeRoomApi({
      ...adminPayload(),
      room_id: state.room.id,
    });
    state.room.status = "closed";
    renderRoom();
    setMessage(els.drawAdminMessage, "응모를 마감했습니다.", "success");
    await loadRooms(state.room.id);
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    setButtonLoading(els.closeRoomButton, false);
  }
}

async function handleCreateDraw(event) {
  event.preventDefault();

  if (!state.room) return;

  setButtonLoading(els.createDrawButton, true, "추첨 중");

  try {
    const revealMode = $("input[name='reveal_mode']:checked", els.createDrawForm).value;
    const response = await createDrawApi({
      ...adminPayload(),
      room_id: state.room.id,
      winner_count: getWinnerCount(),
      draw_mode: els.drawModeSelect.value,
      reveal_mode: revealMode,
    });

    setMessage(
      els.drawAdminMessage,
      revealMode === "auto"
        ? "추첨 결과가 서버에서 확정되었습니다. 자동 공개를 시작합니다."
        : "추첨 결과가 서버에서 확정되었습니다. 다음 공개를 눌러 결과를 공개하세요.",
      "success",
    );
    state.room.status = "drawing";
    await loadRooms(state.room.id);

    if (response.reveal_mode === "auto") {
      runAutoReveal(response.draw_id, response.winner_count);
    }
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    setButtonLoading(els.createDrawButton, false);
  }
}

async function handleRevealNext() {
  if (!state.draw) return;
  setButtonLoading(els.revealNextButton, true, "공개 중");

  try {
    const response = await revealNextApi({
      ...adminPayload(),
      draw_id: state.draw.id,
    });
    await refreshLatestDraw();
    setMessage(
      els.drawAdminMessage,
      response.winner ? `${response.winner.rank}등 ${response.winner.name}` : "모두 공개되었습니다.",
      "success",
    );
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    setButtonLoading(els.revealNextButton, false);
  }
}

async function handleCardClick(position) {
  if (!state.draw) return;

  try {
    const response = await revealCardApi({
      ...adminPayload(),
      draw_id: state.draw.id,
      position,
    });
    await refreshLatestDraw();
    setMessage(
      els.drawAdminMessage,
      response.card.is_winner
        ? `${response.card.winner_rank}등 ${response.card.participant_name}`
        : `${position}번 카드 공개`,
      response.card.is_winner ? "success" : "",
    );

    if (response.card.is_winner) {
      createSparkles(els.adminDrawStage);
    }
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  }
}

async function handleRevealAll() {
  if (!state.draw) return;
  setButtonLoading(els.revealAllButton, true, "공개 중");

  try {
    await revealAllApi({
      ...adminPayload(),
      draw_id: state.draw.id,
    });
    await refreshLatestDraw();
    createSparkles(els.adminDrawStage, 28);
    setMessage(els.drawAdminMessage, "전체 공개되었습니다.", "success");
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    setButtonLoading(els.revealAllButton, false);
  }
}

async function handleFinishDraw() {
  if (!state.draw) return;
  setButtonLoading(els.finishDrawButton, true, "종료 중");

  try {
    await finishDrawApi({
      ...adminPayload(),
      draw_id: state.draw.id,
    });
    state.draw.status = "finished";
    state.room.status = "finished";
    renderRoom();
    renderDraw();
    setMessage(els.drawAdminMessage, "추첨이 종료되었습니다.", "success");
    await loadRooms(state.room.id);
  } catch (error) {
    setMessage(els.drawAdminMessage, error.message, "error");
  } finally {
    setButtonLoading(els.finishDrawButton, false);
  }
}

function setDefaultDates() {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  els.startsAtInput.value = toDateTimeLocalValue(now);
  els.endsAtInput.value = toDateTimeLocalValue(oneHourLater);
}

function bindEvents() {
  els.adminLoginForm.addEventListener("submit", handleAdminLogin);
  els.createRoomForm.addEventListener("submit", handleCreateRoom);
  els.refreshRoomsButton.addEventListener("click", () => {
    loadRooms(state.room?.id).catch((error) => setMessage(els.drawAdminMessage, error.message, "error"));
  });
  els.roomSelect.addEventListener("change", () => {
    selectRoom(els.roomSelect.value).catch((error) => setMessage(els.drawAdminMessage, error.message, "error"));
  });
  els.closeRoomButton.addEventListener("click", handleCloseRoom);
  els.createDrawForm.addEventListener("submit", handleCreateDraw);
  els.revealNextButton.addEventListener("click", handleRevealNext);
  els.revealAllButton.addEventListener("click", handleRevealAll);
  els.finishDrawButton.addEventListener("click", handleFinishDraw);
  els.winnerCountSelect.addEventListener("change", () => {
    els.customWinnerCountInput.disabled = els.winnerCountSelect.value !== "custom";
  });
}

function init() {
  loadSession();
  bindEvents();
  setDefaultDates();
  renderAdminState();
  renderRoom();
  renderDraw();
  els.customWinnerCountInput.disabled = true;

  if (state.session?.admin_session_token) {
    loadRooms().catch((error) => setMessage(els.drawAdminMessage, error.message, "error"));
  }
}

init();
