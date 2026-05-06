import { safeText } from "./utils.js";

export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  const revealedByPosition = new Map(cards.map((card) => [card.position, card]));
  const total = draw?.participant_count || Math.max(cards.length, 1);
  const nodes = [];

  for (let position = 1; position <= total; position += 1) {
    const card = revealedByPosition.get(position);
    const isRevealed = Boolean(card);
    const isWinner = Boolean(card?.is_winner);
    const disabled = !onCardClick || isRevealed ? "disabled" : "";
    const winnerLabel = isWinner && card.winner_rank ? `${card.winner_rank}등` : "";

    nodes.push(`
      <button class="flip-card ${isRevealed ? "revealed" : ""} ${isWinner ? "winner" : ""}" data-position="${position}" ${disabled} type="button">
        <span class="flip-inner">
          <span class="flip-front">${position}</span>
          <span class="flip-back">
            ${isRevealed ? `${winnerLabel}<br />${safeText(card.participant_name)}` : ""}
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
    container.querySelectorAll(".flip-card:not(.revealed)").forEach((cardButton) => {
      cardButton.addEventListener("click", () => {
        onCardClick(Number(cardButton.dataset.position));
      });
    });
  }
}
