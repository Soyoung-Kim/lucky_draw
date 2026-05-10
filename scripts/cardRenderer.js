import { safeText } from "./utils.js";

const statusClasses = {
  unrevealed: "",
  revealed: "revealed",
  absent: "revealed absent",
  claimed: "revealed claimed",
  withdrawn: "revealed withdrawn",
};

export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  const revealedByPosition = new Map(cards.map((card) => [card.position, card]));
  const total = draw?.participant_count || Math.max(cards.length, 1);

  const board = container.querySelector(".card-board");
  const isFirstRender = !board || Number(board.dataset.drawId) !== draw?.id || board.children.length !== total;

  // ── 최초 렌더 ──
  if (isFirstRender) {
    const nodes = [];

    for (let position = 1; position <= total; position += 1) {
      const card = revealedByPosition.get(position);
      const status = card?.card_status || "unrevealed";
      const isRevealed = status !== "unrevealed";
      const isWinner = Boolean(card?.is_winner);
      const extraClass = (statusClasses[status] || "") + (isWinner ? " winner" : "") + (isRevealed || !onCardClick ? " disabled" : "");

      nodes.push(`
        <div class="flip-card ${extraClass}" data-position="${position}" data-status="${status}">
          <div class="flip-inner">
            <div class="flip-front">${position}</div>
            <div class="flip-back">${isRevealed ? safeText(card.participant_name) : ""}</div>
          </div>
        </div>
      `);
    }

    container.innerHTML = `
      <div class="draw-mode-title">Card Draw</div>
      <div class="card-board" data-draw-id="${draw?.id}">${nodes.join("")}</div>
    `;

    if (onCardClick) {
      container.querySelectorAll(".flip-card:not(.disabled)").forEach((el) => {
        el.addEventListener("click", () => {
          if (el.classList.contains("disabled") || el.classList.contains("revealed")) return;
          el.classList.add("disabled");
          onCardClick(Number(el.dataset.position));
        });
      });
    }
    return;
  }

  // ── 증분 업데이트: 새로 뒤집힌 카드만 처리 ──
  for (let position = 1; position <= total; position += 1) {
    const card = revealedByPosition.get(position);
    if (!card) continue;

    const cardEl = board.querySelector(`.flip-card[data-position="${position}"]`);
    if (!cardEl) continue;

    if (cardEl.classList.contains("revealed")) continue;
    if (cardEl.dataset.status !== "unrevealed") continue;

    // 뒷면 이름 세팅
    const backEl = cardEl.querySelector(".flip-back");
    if (backEl) backEl.textContent = card.participant_name;
    if (card.is_winner) cardEl.classList.add("winner");

    cardEl.dataset.status = card.card_status;
    cardEl.classList.add("disabled");

    // rAF 두 번: 브라우저가 현재 상태를 paint한 뒤 revealed 추가 → transition 실행
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cardEl.classList.add("revealed");
      });
    });
  }
}
