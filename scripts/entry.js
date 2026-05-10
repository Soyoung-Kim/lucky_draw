import {
  countParticipants,
  fetchLatestDraw,
  fetchRevealedCards,
  fetchRevealedResults,
  fetchRoomByCode,
  submitEntry,
} from "./api.js";
import { CONFIG } from "./config.js";
import { renderDrawStage, renderResultsList } from "./drawRenderer.js";
import { subscribeDraw, subscribeRoom, unsubscribe } from "./realtime.js";
import {
  $,
  createSparkles,
  formatDateTime,
  getQueryParam,
  setButtonLoading,
  setMessage,
  statusLabel,
  updateStatusBadge,
} from "./utils.js";

const state = {
  room: null,
  draw: null,
  results: [],
  cards: [],
  roomChannel: null,
  drawChannel: null,
  countTimer: null,
  drawTimer: null,
  loadRequestId: 0,
};

const els = {
  appShell: $("#appShell"),
  roomCodeInput: $("#roomCodeInput"),
  loadRoomButton: $("#loadRoomButton"),
  roomStatusBadge: $("#roomStatusBadge"),
  eventTitle: $("#eventTitle"),
  participantCount: $("#participantCount"),
  eventStateText: $("#eventStateText"),
  eventPeriod: $("#eventPeriod"),
  roomLoaderSection: $("#roomLoaderSection"),
  roomLoadedSection: $("#roomLoadedSection"),
  backButton: $("#backButton"),
  eventInfoSection: $("#eventInfoSection"),
  entryForm: $("#entryForm"),
  nameInput: $("#nameInput"),
  submitEntryButton: $("#submitEntryButton"),
  entryMessage: $("#entryMessage"),
  drawPanel: $("#drawPanel"),
  drawStage: $("#drawStage"),
  resultList: $("#resultList"),
};

function setEntryEnabled(enabled) {
  els.nameInput.disabled = !enabled;
  els.submitEntryButton.disabled = !enabled;
}

function pushRoomUrl(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);
  window.history.pushState({ room: code }, "", url.toString());
}

function clearRoomUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  // index.html로 URL 복원 (쿼리스트링 제거)
  window.history.pushState({}, "", url.pathname);
}

function showRoomLoaded() {
  els.roomLoaderSection.classList.add("is-hidden");
  els.roomLoadedSection.classList.remove("is-hidden");
  els.eventInfoSection.classList.remove("is-hidden");
}

function showRoomLoader() {
  els.roomLoadedSection.classList.add("is-hidden");
  els.roomLoaderSection.classList.remove("is-hidden");
  els.eventInfoSection.classList.add("is-hidden");

  // URL을 index.html (쿼리 없음)으로 복원
  clearRoomUrl();

  // 상태 초기화
  if (state.roomChannel) {
    unsubscribe(state.roomChannel);
    state.roomChannel = null;
  }
  if (state.drawChannel) {
    unsubscribe(state.drawChannel);
    state.drawChannel = null;
  }
  window.clearInterval(state.countTimer);
  window.clearInterval(state.drawTimer);
  state.room = null;
  state.draw = null;
  state.results = [];
  state.cards = [];
  localStorage.removeItem("instant_draw_room_code");
  els.roomCodeInput.value = "";
  setMessage(els.entryMessage, "");
  renderRoom();
  renderDraw();
}

function canShowDrawPanel() {
  return ["closed", "drawing", "finished"].includes(state.room?.status);
}

function renderDrawPanelVisibility() {
  const shouldShow = canShowDrawPanel();
  els.drawPanel.classList.toggle("is-hidden", !shouldShow);
  els.appShell.classList.toggle("app-shell-single", !shouldShow);
}

function renderRoom() {
  const room = state.room;

  if (!room) {
    els.participantCount.textContent = "0";
    els.eventStateText.textContent = "대기";
    els.eventPeriod.textContent = "";
    updateStatusBadge(els.roomStatusBadge, "");
    setEntryEnabled(false);
    renderDrawPanelVisibility();
    return;
  }

  els.eventTitle.textContent = room.title;
  els.eventStateText.textContent = statusLabel(room.status);
  els.eventPeriod.textContent = `${formatDateTime(room.starts_at)} - ${formatDateTime(room.ends_at)}`;
  updateStatusBadge(els.roomStatusBadge, room.status);
  setEntryEnabled(room.status === "open");
  renderDrawPanelVisibility();
}

async function refreshParticipantCount() {
  if (!state.room) return;
  const count = await countParticipants(state.room.id);
  els.participantCount.textContent = String(count);
}

function renderDraw() {
  renderDrawStage(els.drawStage, {
    draw: state.draw,
    results: state.results,
    cards: state.cards,
  });
  renderResultsList(els.resultList, state.results);
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

  const previousCount = state.results.length + state.cards.filter((card) => card.is_winner).length;
  state.results = results;
  state.cards = cards;
  renderDraw();

  const currentCount = results.length + cards.filter((card) => card.is_winner).length;
  if (currentCount > previousCount) {
    createSparkles(els.drawStage);
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

async function loadRoom(code) {
  const requestId = (state.loadRequestId += 1);
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    setMessage(els.entryMessage, "이벤트 코드를 입력해 주세요.", "error");
    return;
  }

  setButtonLoading(els.loadRoomButton, true, "입장 중");
  setMessage(els.entryMessage, "이벤트를 확인하는 중입니다.");

  try {
    const room = await fetchRoomByCode(normalizedCode);

    if (requestId !== state.loadRequestId) {
      return;
    }

    if (!room) {
      setMessage(els.entryMessage, "이벤트를 찾을 수 없습니다.", "error");
      state.room = null;
      renderRoom();
      renderDraw();
      return;
    }

    state.room = room;
    localStorage.setItem("instant_draw_room_code", room.code);
    els.roomCodeInput.value = room.code;
    // URL을 ?room=CODE로 업데이트
    pushRoomUrl(room.code);
    renderRoom();
    showRoomLoaded();
    setMessage(els.entryMessage, `${room.code} 이벤트에 입장했습니다.`, "success");

    if (state.roomChannel) {
      unsubscribe(state.roomChannel);
    }

    state.roomChannel = subscribeRoom(room.id, {
      onRoom: (updatedRoom) => {
        state.room = { ...state.room, ...updatedRoom };
        renderRoom();
        refreshLatestDraw().catch(console.error);
      },
      onDraw: () => refreshLatestDraw().catch(console.error),
    });

    const settled = await Promise.allSettled([refreshParticipantCount(), refreshLatestDraw()]);
    const failed = settled.find((result) => result.status === "rejected");

    if (requestId !== state.loadRequestId) {
      return;
    }

    if (failed) {
      console.error(failed.reason);
      setMessage(
        els.entryMessage,
        `${room.code} 이벤트에 입장했습니다. 일부 현황은 잠시 후 다시 갱신됩니다.`,
        "success",
      );
    }

    startPolling();
  } catch (error) {
    if (requestId !== state.loadRequestId) {
      return;
    }

    setMessage(els.entryMessage, error.message, "error");
  } finally {
    if (requestId === state.loadRequestId) {
      setButtonLoading(els.loadRoomButton, false);
    }
  }
}

async function handleEntrySubmit(event) {
  event.preventDefault();

  if (!state.room) {
    setMessage(els.entryMessage, "먼저 이벤트에 입장해 주세요.", "error");
    return;
  }

  setButtonLoading(els.submitEntryButton, true, "응모 중");

  try {
    const response = await submitEntry({
      room_code: state.room.code,
      name: els.nameInput.value,
    });

    els.participantCount.textContent = String(response.current_count);
    els.entryForm.reset();
    setMessage(els.entryMessage, "응모가 완료되었습니다.", "success");
  } catch (error) {
    setMessage(els.entryMessage, error.message, "error");
  } finally {
    setButtonLoading(els.submitEntryButton, false);
    setEntryEnabled(state.room?.status === "open");
  }
}

function bindEvents() {
  els.loadRoomButton.addEventListener("click", () => loadRoom(els.roomCodeInput.value));
  els.roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadRoom(els.roomCodeInput.value);
    }
  });
  els.backButton.addEventListener("click", showRoomLoader);
  els.entryForm.addEventListener("submit", handleEntrySubmit);

  // 브라우저 뒤로가기/앞으로가기 처리
  window.addEventListener("popstate", (event) => {
    if (event.state?.room) {
      // 앞으로가기: 해당 room 재로드
      loadRoom(event.state.room);
    } else {
      // 뒤로가기: 코드 입력 화면으로
      showRoomLoader();
    }
  });
}

function init() {
  bindEvents();
  renderRoom();
  renderDraw();

  const initialCode =
    getQueryParam("room") ||
    getQueryParam("code") ||
    localStorage.getItem("instant_draw_room_code") ||
    "";

  if (initialCode) {
    els.roomCodeInput.value = initialCode;
    loadRoom(initialCode);
  }
}

init();
