// Roteador por hash — funciona no GitHub Pages sem nenhuma config de servidor.

const routes = [];
let current = null;      // { destroy }
let mountPoint = null;
let notFound = null;

function compile(pattern) {
  const names = [];
  const source = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:(\w+)/g, (_, name) => { names.push(name); return "([^/]+)"; });
  return { re: new RegExp(`^${source}$`), names };
}

export function route(pattern, view) {
  routes.push({ ...compile(pattern), view });
}

export function setNotFound(view) { notFound = view; }

export function path() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.split("?")[0];
}

export function navigate(to, { replace = false } = {}) {
  if (to === "#back" || to === "back") {
    if (history.length > 1) history.back();
    else navigate("/", { replace: true });
    return;
  }
  const hash = "#" + (to.startsWith("/") ? to : `/${to}`);
  if (location.hash === hash) return render();
  if (replace) location.replace(hash);
  else location.hash = hash;
}

let renderToken = 0;

export async function render() {
  const token = ++renderToken;
  const p = path();

  let matched = null;
  for (const r of routes) {
    const m = p.match(r.re);
    if (m) {
      const params = {};
      r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      matched = { view: r.view, params };
      break;
    }
  }

  const view = matched?.view || notFound;
  if (!view) return;

  try { current?.destroy?.(); } catch { /* ignora */ }
  current = null;

  const result = await view(matched?.params || {});
  if (token !== renderToken) { // navegou de novo enquanto carregava
    try { result?.destroy?.(); } catch { /* ignora */ }
    return;
  }

  current = result;
  mountPoint.innerHTML = "";
  mountPoint.appendChild(result.el || result);
  if (!result.keepScroll) window.scrollTo(0, 0);
}

export function startRouter(el) {
  mountPoint = el;
  addEventListener("hashchange", render);

  // qualquer elemento com data-nav="#/rota" navega
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-nav]");
    if (!trigger) return;
    e.preventDefault();
    navigate(trigger.getAttribute("data-nav").replace(/^#/, ""));
  });

  render();
}

export function refresh() { render(); }
