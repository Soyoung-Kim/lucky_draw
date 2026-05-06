import { renderCapsule } from "./capsuleRenderer.js";
import { renderCards } from "./cardRenderer.js";
import { renderLotto } from "./lottoRenderer.js";

export function renderDrawStage(container, state) {
  const { draw } = state;

  if (!container) return;

  if (!draw) {
    container.className = "draw-stage empty-state";
    container.textContent = "아직 추첨이 시작되지 않았습니다";
    return;
  }

  container.className = "draw-stage";

  if (draw.draw_mode === "card") {
    renderCards(container, state);
    return;
  }

  if (draw.draw_mode === "lotto") {
    renderLotto(container, state);
    return;
  }

  renderCapsule(container, state);
}

export function renderResultsList(container, results = []) {
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = results
    .map((result) => `<li>${result.rank}등 ${result.participant_name}</li>`)
    .join("");
}
