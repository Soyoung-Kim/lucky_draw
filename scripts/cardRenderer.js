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
  const nodes = [];

  for (let position = 1; position <= total; position += 1) {
    const card = revealedByPosition.get(position);
    const status = card?.card_status || "unrevealed";
    const isClickable = onCardClick && status === "unrevealed";
    const disabled = isClickable ? "" : "disabled";
    const isWinner = Boolean(card?.is_winner);
    const extraClass = statusClasses[status] + (isWinner ? " winner" : "");

    nodes.push(`
      <button
        class="flip-card ${extraClass}"
        data-position="${position}"
        data-status="${status}"
        ${disabled}
        type="button"
      >
        <span class="flip-face flip-face-front">${position}</span>
        <span class="flip-face flip-face-back">${card ? safeText(card.participant_name) : ""}</span>
      </button>
    `);
  }

  container.innerHTML = `
    <div class="draw-mode-title">Card Draw</div>
    <div class="card-board">${nodes.join("")}</div>
  `;

  if (onCardClick) {
    container.querySelectorAll(".flip-card:not([disabled])").forEach((cardButton) => {
      cardButton.addEventListener("click", () => {
        const position = Number(cardButton.dataset.position);
        cardButton.disabled = true; // 중복 클릭 방지
        onCardClick(position);
      });
    });
  }
}

/**
 * 서버 응답 후 해당 카드만 뒤집기 애니메이션 실행.
 * @keyframes card-flip 의 40%(200ms) 지점에 .revealed 를 붙여
 * 납작해진 순간 앞면→뒷면으로 교체.
 * 애니메이션(500ms) 완료 후 onDone() 호출 → 그 후에 전체 재렌더.
 */
export function flipCardInPlace(container, position, { isWinner, participantName, onDone }) {
  const ANIM_MS = 500;        // card-flip 총 길이
  const REVEAL_MS = 200;      // 40% 지점 = scaleX(0) 순간

  const cardEl = container.querySelector(`.flip-card[data-position="${position}"]`);
  if (!cardEl) {
    // DOM에 없으면 그냥 동기화만
    if (onDone) onDone();
    return;
  }

  // 뒷면 텍스트 미리 세팅 (납작해지기 전에 값은 넣어두되 opacity:0 상태)
  const backEl = cardEl.querySelector(".flip-face-back");
  if (backEl) backEl.textContent = participantName;
  if (isWinner) cardEl.classList.add("winner");

  // 애니메이션 시작
  cardEl.classList.add("flipping");

  // 40% 지점: 납작해진 순간 revealed 추가 → 뒷면이 보이기 시작
  const revealTimer = setTimeout(() => {
    cardEl.classList.add("revealed");
  }, REVEAL_MS);

  // 500ms 후 flipping 제거 → 카드가 최종 뒤집힌 상태로 고정
  const doneTimer = setTimeout(() => {
    cardEl.classList.remove("flipping");
    if (onDone) onDone();
  }, ANIM_MS);

  // animationend 로도 보험 처리 (혹시 타이머보다 먼저 끝나면)
  cardEl.addEventListener("animationend", () => {
    clearTimeout(revealTimer);
    clearTimeout(doneTimer);
    cardEl.classList.add("revealed");
    cardEl.classList.remove("flipping");
    if (onDone) onDone();
  }, { once: true });
}
