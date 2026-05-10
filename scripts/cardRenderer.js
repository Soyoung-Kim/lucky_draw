import { safeText } from "./utils.js";

const statusClasses = {
  unrevealed: "",
  revealed: "revealed",
  absent: "revealed absent",
  claimed: "revealed claimed",
  withdrawn: "revealed withdrawn",
};

/**
 * scaleX(0) → 콘텐츠 교체 → scaleX(1) 방식으로 카드를 뒤집습니다.
 * button 안에서 preserve-3d가 브라우저마다 무시되는 문제를 우회합니다.
 */
function animateFlip(cardEl, isWinner, participantName) {
  // 1단계: X축으로 납작하게 접기
  cardEl.classList.add("flipping-out");

  cardEl.addEventListener(
    "transitionend",
    () => {
      // 2단계: 접혀있는 동안 뒷면 콘텐츠 교체 & 클래스 적용
      cardEl.classList.remove("flipping-out");
      cardEl.classList.add("revealed");
      if (isWinner) cardEl.classList.add("winner");

      const backEl = cardEl.querySelector(".flip-face-back");
      if (backEl) backEl.textContent = participantName;

      // 3단계: 다시 펼치기
      // rAF 두 번으로 브라우저 paint 후 transition 트리거
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          cardEl.classList.add("flipping-in");
          cardEl.addEventListener(
            "transitionend",
            () => {
              cardEl.classList.remove("flipping-in");
            },
            { once: true },
          );
        });
      });
    },
    { once: true },
  );
}

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

    // 이미 뒤집힌 카드는 뒷면 바로 표시 (애니메이션 없이)
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
        // 클릭 즉시 disabled 처리해서 중복 클릭 방지
        cardButton.disabled = true;
        onCardClick(position);
      });
    });
  }
}

/**
 * 서버 응답 후 특정 카드를 애니메이션으로 뒤집습니다.
 * admin.js의 handleCardClick에서 호출합니다.
 */
export function flipCardInPlace(container, position, { isWinner, participantName }) {
  const cardEl = container.querySelector(`.flip-card[data-position="${position}"]`);
  if (!cardEl) return;
  animateFlip(cardEl, isWinner, participantName);
}
