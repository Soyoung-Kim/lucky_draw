import { safeText } from "./utils.js";

/**
 * Render cards using incremental DOM update.
 *
 * WHY incremental?
 * Supabase Realtime fires onCard/onResult → refreshDrawData() → renderCards()
 * on every flip. If we do a full innerHTML replace each time, the CSS transition
 * on a card that was *just* clicked gets nuked mid-flight and the flip is
 * invisible. By keeping existing card elements and only touching newly-revealed
 * ones we let the CSS transition finish uninterrupted.
 *
 * WHY <div> not <button>?
 * Chrome/Safari refuse to honour transform-style: preserve-3d on children of
 * <button> elements, so the 3-D flip simply never works inside a <button>.
 * Using a <div role="button" tabindex="0"> sidesteps the browser bug entirely.
 */
export function renderCards(container, { draw, cards = [], onCardClick = null }) {
  const revealedByPosition = new Map(cards.map((c) => [c.position, c]));
  const total = draw?.participant_count || Math.max(cards.length, 1);

  // ── Find or create the board ─────────────────────────────────────────────
  let board = container.querySelector(".card-board");

  if (!board) {
    // First render: build the entire structure from scratch
    container.innerHTML = `<div class="draw-mode-title">Card Draw</div><div class="card-board"></div>`;
    board = container.querySelector(".card-board");
  }

  // ── Incremental update ───────────────────────────────────────────────────
  for (let position = 1; position <= total; position += 1) {
    const card = revealedByPosition.get(position);
    const isRevealed = Boolean(card);
    const isWinner = Boolean(card?.is_winner);
    const winnerLabel = isWinner && card.winner_rank ? `${card.winner_rank}등` : "";

    let el = board.querySelector(`.flip-card[data-position="${position}"]`);

    if (!el) {
      // Card doesn't exist yet — create it
      el = document.createElement("div");
      el.className = "flip-card";
      el.dataset.position = String(position);
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.innerHTML = `
        <div class="flip-inner">
          <div class="flip-front">${position}</div>
          <div class="flip-back"></div>
        </div>`;
      board.appendChild(el);
    }

    // Update revealed state — only touch cards that changed
    const wasRevealed = el.classList.contains("revealed");

    if (isRevealed && !wasRevealed) {
      // Fill back face content BEFORE adding .revealed so it's ready when
      // the card rotates around
      const back = el.querySelector(".flip-back");
      back.innerHTML = `${winnerLabel ? `<span class="winner-rank">${winnerLabel}</span>` : ""}<span class="card-name">${safeText(card.participant_name)}</span>`;

      el.classList.add("revealed");
      el.classList.toggle("winner", isWinner);
      el.removeAttribute("tabindex");
      el.setAttribute("aria-disabled", "true");
      el.removeEventListener("click", el._clickHandler);
      el.removeEventListener("keydown", el._keyHandler);
    }

    if (!isRevealed && !wasRevealed && onCardClick) {
      // Attach click handler (idempotent — only when not already revealed)
      if (!el._clickHandler) {
        el._clickHandler = () => onCardClick(Number(el.dataset.position));
        el._keyHandler = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            el._clickHandler();
          }
        };
        el.addEventListener("click", el._clickHandler);
        el.addEventListener("keydown", el._keyHandler);
      }
    }

    if (!onCardClick && !isRevealed) {
      // Admin view — no clicks allowed
      el.removeAttribute("tabindex");
    }
  }

  // Remove cards for positions that no longer exist (shouldn't happen, but safe)
  board.querySelectorAll(".flip-card").forEach((el) => {
    const pos = Number(el.dataset.position);
    if (pos > total) el.remove();
  });
}
