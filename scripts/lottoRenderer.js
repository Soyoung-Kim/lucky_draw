import { safeText } from "./utils.js";

export function renderLotto(container, { draw, results = [] }) {
  const revealedByRank = new Map(results.map((result) => [result.rank, result]));
  const total = draw?.winner_count || Math.max(results.length, 1);
  const balls = [];

  for (let rank = 1; rank <= total; rank += 1) {
    const result = revealedByRank.get(rank);
    balls.push(`
      <div class="lotto-ball ${result ? "revealed" : ""}">
        <span>${result ? `${rank}. ${safeText(result.participant_name)}` : rank}</span>
      </div>
    `);
  }

  container.innerHTML = `
    <div class="draw-mode-title">Lotto Draw</div>
    <div class="lotto-lane">${balls.join("")}</div>
  `;
}
