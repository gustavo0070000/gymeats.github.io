import { icon } from "./icons.js";

/* ---------- DOM ---------- */

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function on(root, selector, event, handler) {
  root.querySelectorAll(selector).forEach((el) => el.addEventListener(event, handler));
}

/* ---------- Avatar ---------- */

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatar(person, size = "md", extraClass = "") {
  const name = person?.name || person?.displayName || "?";
  const photo = person?.photo || person?.photoURL || "";
  const cls = `avatar ${size} ${extraClass}`.trim();
  if (photo) {
    return `<div class="${cls}"><img src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`;
  }
  return `<div class="${cls}">${esc(initials(name))}</div>`;
}

/* ---------- Datas (pt-BR) ---------- */

export const MONTHS = ["janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"];
export const DOW = ["dom.","seg.","ter.","qua.","qui.","sex.","sáb."];

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

/** Chave de dia no fuso local: "2026-07-28" */
export function dayKey(date = new Date()) {
  const d = toDate(date) || new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function timeLabel(date) {
  const d = toDate(date);
  if (!d) return "";
  let hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const suffix = hh >= 12 ? "pm" : "am";
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${suffix}`;
}

/** "Hoje", "Ontem" ou "28 de julho" */
export function dayLabel(key) {
  const today = dayKey();
  if (key === today) return "Hoje";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return "Ontem";
  const [Y, M, D] = key.split("-").map(Number);
  const now = new Date();
  const base = `${D} de ${MONTHS[M - 1]}`;
  return Y === now.getFullYear() ? base : `${base} de ${Y}`;
}

export function fullWhen(date) {
  const d = toDate(date);
  if (!d) return "";
  return `${dayLabel(dayKey(d))} às ${timeLabel(d)}`;
}

export function shortDate(date) {
  const d = toDate(date);
  if (!d) return "";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function rangeLabel(a, b) {
  const d1 = toDate(a), d2 = toDate(b);
  if (!d1 || !d2) return "";
  return `${MONTHS[d1.getMonth()]} ${d1.getDate()} - ${MONTHS[d2.getMonth()]} ${d2.getDate()}`;
}

export function relative(date) {
  const d = toDate(date);
  if (!d) return "";
  const secs = (Date.now() - d.getTime()) / 1000;
  if (secs < 60) return "agora";
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)} d`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message, kind = "") {
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast ${kind}">${esc(message)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (root.innerHTML = ""), 2600);
}

export const toastError = (msg) => toast(msg, "err");

/* ---------- Action sheet ---------- */

/**
 * options: [{ label, value, danger }]
 * Resolve com o `value` escolhido, ou null se cancelar.
 */
export function sheet(title, options) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    const items = options
      .map((o, i) => `<button class="sheet-item ${o.danger ? "danger" : ""}" data-i="${i}">${esc(o.label)}</button>`)
      .join("");
    const node = h(`
      <div class="sheet-backdrop">
        <div class="sheet">
          ${title ? `<div class="sheet-title">${esc(title)}</div>` : ""}
          <div class="sheet-group">${items}</div>
          <div class="sheet-group"><button class="sheet-item" data-cancel>Cancelar</button></div>
        </div>
      </div>`);

    const done = (val) => { node.remove(); resolve(val); };
    node.addEventListener("click", (e) => {
      if (e.target === node || e.target.hasAttribute("data-cancel")) return done(null);
      const btn = e.target.closest("[data-i]");
      if (btn) done(options[Number(btn.dataset.i)].value);
    });
    root.appendChild(node);
  });
}

export async function confirmSheet(title, confirmLabel, danger = true) {
  const res = await sheet(title, [{ label: confirmLabel, value: true, danger }]);
  return res === true;
}

/* ---------- Blocos reutilizáveis ---------- */

export function topbar({ left, title, right, big }) {
  return `
    <div class="topbar">
      ${left || '<div class="topbar-btn"></div>'}
      ${big ? '<div class="topbar-spacer"></div>' : `<div class="topbar-title">${esc(title || "")}</div>`}
      ${right || '<div class="topbar-btn"></div>'}
    </div>`;
}

export function backBtn(href = "#back") {
  return `<button class="topbar-btn" data-nav="${esc(href)}">${icon("back")}</button>`;
}

export function tabbar(active, challengeId) {
  const tabs = [
    { id: "details", label: "Detalhes", ico: "details", href: `#/c/${challengeId}/detalhes` },
    { id: "rankings", label: "Classificações", ico: "medal", href: `#/c/${challengeId}/classificacoes` },
    { id: "chat", label: "Bate-papo", ico: "chat", href: `#/c/${challengeId}/bate-papo` },
  ];
  return `<nav class="tabbar">${tabs.map((t) => `
    <button class="tab ${t.id === active ? "active" : ""}" data-nav="${t.href}">
      ${icon(t.ico, 25)}<span>${t.label}</span>
    </button>`).join("")}</nav>`;
}

export function emptyState(title, text, emoji = "🍽️") {
  return `<div class="empty"><div class="big">${emoji}</div><strong>${esc(title)}</strong>${esc(text)}</div>`;
}

export function spinner() {
  return `<div class="spinner"></div>`;
}
