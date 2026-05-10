import { safeText } from "./utils.js";

const statusClasses = {
  unrevealed: "",
  revealed: "revealed",
  absent: "revealed absent",
  claimed: "revealed claimed",
  withdrawn: "revealed withdrawn",
};

/**
 * 카드 한 장을 flipping 클래스로 뒤집습니다.
 * CSS:
 *   .flipping .flip-face-front → scaleX(0) in 220ms
 *   .flipping .flip-face-back  → scaleX(1) in 220ms, delay 220ms
 * 총 440ms 후 .flipping 제거 → .revealed 유지
 */
function flipCard(cardEl, isWinner, name) {
  if (cardEl.classList.contains("flipping") || cardEl.classList.contains("revealed")) return;

  const backEl = cardEl.querySelector(".flip-face-back");
  if (backEl) backEl.textContent = name;
  if (isWinner) cardEl.classList.add("winner");

  cardEl.disabled = true;
  cardEl.classList.add("flipping");

  setTimeout(() => {
    cardEl.classList.remove("flipping");
    cardEl.classList.add("revealed");
  }, 460); // 220 + 220 + 여유 20ms
}

/**
 * 카드 보드를 렌더합니다.
 *
 * ① 최초 / draw 교체 시: innerHTML 전체 교체
 * ② 이후 갱신 (realtime·polling): 기존 DOM 유지
 *    - 새로 뒤집힌 카드만 flipCard() 호출
 *    - 이미 revealed/flipping 카드는 절대 건드리지 않음
 */
export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  if (!draw) return;

  const revealedByPosition = new Map(cards.map((c) => [c.position, c]));
  const total = draw.participant_count || Math.max(cards.length, 1);

  const board = container.querySelector(".card-board");
  const isFirstRender = !board || Number(board.dataset.drawId) !== draw.id || board.children.length !== total;

  // ── ① 최초 렌더 ──────────────────────────────────────────────────
  if (isFirstRender) {
    const nodes = [];
    for (let pos = 1; pos <= total; pos++) {
      const card = revealedByPosition.get(pos);
      const status = card?.card_status || "unrevealed";
      const isWinner = Boolean(card?.is_winner);
      const alreadyRevealed = status !== "unrevealed";
      const extraClass = (statusClasses[status] || "") + (isWinner ? " winner" : "");

      nodes.push(`
        <button
          class="flip-card ${extraClass}"
          data-position="${pos}"
          data-status="${status}"
          ${alreadyRevealed || !onCardClick ? "disabled" : ""}
          type="button"
        >
          <span class="flip-face flip-face-front">${pos}</span>
          <span class="flip-face flip-face-back">${card ? safeText(card.participant_name) : ""}</span>
        </button>
      `);
    }

    container.innerHTML = `
      <div class="draw-mode-title">Card Draw</div>
      <div class="card-board" data-draw-id="${draw.id}">${nodes.join("")}</div>
    `;

    if (onCardClick) {
      container.querySelectorAll(".flip-card:not([disabled])").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          onCardClick(Number(btn.dataset.position));
        });
      });
    }
    return;
  }

  // ── ② 증분 업데이트: 새로 뒤집힌 카드만 처리 ──────────────────
  for (let pos = 1; pos <= total; pos++) {
    const card = revealedByPosition.get(pos);
    if (!card) continue; // 아직 미공개

    const cardEl = board.querySelector(`.flip-card[data-position="${pos}"]`);
    if (!cardEl) continue;

    // 이미 처리 완료된 카드는 건드리지 않음
    if (cardEl.classList.contains("revealed") || cardEl.classList.contains("flipping")) continue;

    const prevStatus = cardEl.dataset.status || "unrevealed";
    if (prevStatus !== "unrevealed") continue; // 이미 상태 반영됨

    // 새로 뒤집힌 카드 → 애니메이션
    cardEl.dataset.status = card.card_status;
    flipCard(cardEl, Boolean(card.is_winner), card.participant_name);
  }
}
