import { safeText } from "./utils.js";

export function renderCapsule(container, { draw, results = [] }) {
  const revealedByRank = new Map(results.map((result) => [result.rank, result]));
  const total = draw?.winner_count || Math.max(results.length, 1);
  const capsules = [];

  for (let rank = 1; rank <= total; rank += 1) {
    const result = revealedByRank.get(rank);
    capsules.push(`
      <div class="capsule ${result ? "revealed" : ""}">
        <span class="capsule-name">${result ? `${rank}. ${safeText(result.participant_name)}` : rank}</span>
      </div>
    `);
  }

  container.innerHTML = `
    <div class="draw-mode-title">Capsule Draw</div>
    <div class="capsule-grid">${capsules.join("")}</div>
  `;
}
