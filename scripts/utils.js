export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function setMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text || "";
  element.className = `message ${type}`.trim();
}

export function setButtonLoading(button, isLoading, loadingText = "처리 중") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function toIsoFromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function statusLabel(status) {
  const labels = {
    open: "응모중",
    closed: "마감",
    drawing: "추첨중",
    finished: "종료",
  };

  return labels[status] || "대기";
}

export function updateStatusBadge(element, status) {
  if (!element) return;
  element.className = `status-pill ${status || ""}`.trim();
  element.textContent = statusLabel(status);
}

export function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomUnit() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0xffffffff;
}

export function createSparkles(container, amount = 18) {
  if (!container) return;

  for (let i = 0; i < amount; i += 1) {
    const sparkle = document.createElement("span");
    sparkle.className = "sparkle";
    sparkle.style.left = `${10 + randomUnit() * 80}%`;
    sparkle.style.top = `${35 + randomUnit() * 45}%`;
    sparkle.style.background = i % 2 === 0 ? "var(--yellow)" : "var(--pink-strong)";
    container.append(sparkle);
    window.setTimeout(() => sparkle.remove(), 950);
  }
}

export function safeText(value) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}
