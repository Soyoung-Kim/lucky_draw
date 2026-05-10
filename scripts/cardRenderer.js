import { safeText } from "./utils.js";

export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  const revealedByPosition = new Map(cards.map((card) => [card.position, card]));
  const total = draw?.participant_count || Math.max(cards.length, 1);
  const nodes = [];

  const statusClasses = {
    unrevealed: "",
    revealed: "revealed",
    absent: "revealed absent",
    claimed: "revealed claimed",
    withdrawn: "revealed withdrawn",
  };

  for (let position = 1; position <= total; position += 1) {
    const card = revealedByPosition.get(position);
    const status = card?.card_status || "unrevealed";
    const isClickable = onCardClick && status === "unrevealed";
    const disabled = isClickable ? "" : "disabled";
    const isWinner = Boolean(card?.is_winner);

    nodes.push(`
      <button class="flip-card ${statusClasses[status]} ${isWinner ? "winner" : ""}" data-position="${position}" data-status="${status}" ${disabled} type="button">
        <span class="flip-perspective">
          <span class="flip-inner">
            <span class="flip-front">${position}</span>
            <span class="flip-back">
              ${card ? safeText(card.participant_name) : ""}
            </span>
          </span>
        </span>
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
        onCardClick(Number(cardButton.dataset.position));
      });
    });
  }
}
