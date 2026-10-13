import { safeText } from "./utils.js";

// Preserve card nodes so realtime refreshes do not interrupt the flip animation.
export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  const byPosition = new Map(cards.map((card) => [card.position, card]));
  const total = draw?.participant_count || Math.max(cards.length, 1);
  let board = container.querySelector(".card-board");
  if (!board || board.dataset.drawId !== String(draw?.id ?? "")) {
    container.innerHTML = '<div class="draw-mode-title">Card Draw</div><div class="card-board"></div>';
    board = container.querySelector(".card-board");
    board.dataset.drawId = String(draw?.id ?? "");
  }
  for (let position = 1; position <= total; position++) {
    const card = byPosition.get(position);
    const status = card?.card_status ?? (card?.is_revealed ? "revealed" : "unrevealed");
    const revealed = status !== "unrevealed";
    let el = board.querySelector(`[data-position="${position}"]`);
    if (!el) {
      el = document.createElement("div");
      el.className = "flip-card";
      el.dataset.position = position;
      el.setAttribute("role", "button");
      el.innerHTML = `<div class="flip-inner"><div class="flip-front">${position}</div><div class="flip-back"><span class="card-name"></span></div></div>`;
      el.addEventListener("click", () => el._onClick?.(position));
      el.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && el._onClick) {
          event.preventDefault(); el._onClick(position);
        }
      });
      board.append(el);
    }
    el.querySelector(".card-name").textContent = card ? safeText(card.participant_name) : "";
    el.dataset.status = status;
    el.classList.toggle("revealed", revealed);
    el.classList.toggle("winner", Boolean(card?.is_winner));
    for (const value of ["absent", "claimed", "withdrawn"]) el.classList.toggle(value, status === value);
    el._onClick = !revealed ? onCardClick : null;
    el.setAttribute("aria-disabled", String(!el._onClick));
    el.setAttribute("tabindex", el._onClick ? "0" : "-1");
    el.setAttribute("aria-label", revealed ? `${position}번 ${safeText(card.participant_name)}` : `${position}번 카드`);
  }
  board.querySelectorAll(".flip-card").forEach((el) => {
    if (Number(el.dataset.position) > total) el.remove();
  });
}
