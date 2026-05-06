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
};

const els = {
  roomCodeInput: $("#roomCodeInput"),
  loadRoomButton: $("#loadRoomButton"),
  roomStatusBadge: $("#roomStatusBadge"),
  eventTitle: $("#eventTitle"),
  participantCount: $("#participantCount"),
  eventStateText: $("#eventStateText"),
  eventPeriod: $("#eventPeriod"),
  entryForm: $("#entryForm"),
  nameInput: $("#nameInput"),
  employeeNoInput: $("#employeeNoInput"),
  submitEntryButton: $("#submitEntryButton"),
  entryMessage: $("#entryMessage"),
  drawStage: $("#drawStage"),
  resultList: $("#resultList"),
};

function setEntryEnabled(enabled) {
  els.nameInput.disabled = !enabled;
  els.employeeNoInput.disabled = !enabled;
  els.submitEntryButton.disabled = !enabled;
}

function renderRoom() {
  const room = state.room;

  if (!room) {
    els.eventTitle.textContent = "이벤트 코드를 입력해 주세요";
    els.participantCount.textContent = "0";
    els.eventStateText.textContent = "대기";
    els.eventPeriod.textContent = "";
    updateStatusBadge(els.roomStatusBadge, "");
    setEntryEnabled(false);
    return;
  }

  els.eventTitle.textContent = room.title;
  els.eventStateText.textContent = statusLabel(room.status);
  els.eventPeriod.textContent = `${formatDateTime(room.starts_at)} - ${formatDateTime(room.ends_at)}`;
  updateStatusBadge(els.roomStatusBadge, room.status);
  setEntryEnabled(room.status === "open");
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
  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    setMessage(els.entryMessage, "이벤트 코드를 입력해 주세요.", "error");
    return;
  }

  setButtonLoading(els.loadRoomButton, true, "입장 중");

  try {
    const room = await fetchRoomByCode(normalizedCode);

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
    renderRoom();
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

    await Promise.all([refreshParticipantCount(), refreshLatestDraw()]);
    startPolling();
  } catch (error) {
    setMessage(els.entryMessage, error.message, "error");
  } finally {
    setButtonLoading(els.loadRoomButton, false);
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
      employee_no: els.employeeNoInput.value,
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
  els.entryForm.addEventListener("submit", handleEntrySubmit);
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
