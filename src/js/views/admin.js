import {
  h, esc, topbar, backBtn, spinner, relative, dayLabel, toast, toastError, confirmSheet,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { plateLink } from "./plates.js";
import { formatKcal } from "../food.js";

/* ============================================================
   Painel administrativo

   Existe por um motivo concreto: dois bugs seguidos apareceram só
   pra uma pessoa e só foram diagnosticados pedindo print. Aqui o
   erro de quem está do outro lado chega sozinho.

   O cadeado de verdade está nas regras do Firestore — esconder a
   tela no cliente não protege nada, já que o repositório é público.
   Se alguém que não é admin digitar a rota, vê a tela vazia e o
   Firestore recusa cada leitura.
   ============================================================ */

const ABAS = [
  { id: "visao", label: "Visão geral" },
  { id: "erros", label: "Erros" },
  { id: "ia", label: "IA" },
];

/** Barras simples em SVG — sem biblioteca, funciona offline e nos dois temas. */
function grafico(serie) {
  if (!serie.length) return "";
  const max = Math.max(1, ...serie.map((d) => d.n));
  const larg = 100 / serie.length;
  return `
    <div class="graf">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img"
           aria-label="Pratos por dia nos últimos ${serie.length} dias">
        ${serie.map((d, i) => {
          const alt = (d.n / max) * 34;
          return `<rect x="${i * larg + larg * 0.15}" y="${38 - alt}"
                        width="${larg * 0.7}" height="${Math.max(alt, d.n ? 1 : 0.4)}"
                        rx="0.6" class="${d.n ? "barra" : "barra vazia"}"></rect>`;
        }).join("")}
      </svg>
      <div class="graf-eixo">
        <span>${esc(dayLabel(serie[0].dia))}</span>
        <span>pico ${max}</span>
        <span>${esc(dayLabel(serie[serie.length - 1].dia))}</span>
      </div>
    </div>`;
}

export function adminView() {
  const el = h(`
    <div class="screen">
      ${topbar({ left: backBtn("#/conta"), title: "Painel" })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
    </div>`);

  const body = el.querySelector("[data-body]");
  let aba = "visao";
  let admin = null, metricas = null, logs = null, uso = null;
  let desafios = [], membros = [], posts = [];
  let paramos = false;
  const desinscrever = [];

  const celula = (v, k, sub = "") => `
    <div class="stat">
      <div class="v">${v ?? "—"}</div>
      <div class="k">${esc(k)}</div>
      ${sub ? `<div class="graf-sub">${esc(sub)}</div>` : ""}
    </div>`;

  const nomeDe = (uid) => membros.find((m) => m.uid === uid)?.name || uid?.slice(0, 8) || "?";

  /* ---------- visão geral ---------- */

  function desenharVisao() {
    if (!metricas) return spinner();
    const serie = store.pratosPorDia(posts, 14);
    const hoje = serie[serie.length - 1]?.n || 0;
    const total14 = serie.reduce((s, d) => s + d.n, 0);

    // Estimativa, não medição: somar o tamanho real leria centenas de MB.
    const mbFotos = metricas.fotos != null
      ? `~${Math.round((metricas.fotos * 350) / 1024)} MB` : "—";

    return `
      <div class="card"><div class="stats-row tight" style="padding:14px 6px">
        ${celula(membros.length, "pessoas")}
        ${celula(posts.length, "pratos")}
        ${celula(metricas.fotos, "fotos", mbFotos)}
        ${celula(metricas.alimentos, "na base")}
      </div></div>

      <div class="section-label left">Pratos por dia · últimos 14</div>
      <div class="card" style="padding:14px 12px 10px">
        ${grafico(serie)}
        <div class="graf-legenda">${total14} no período · ${hoje} hoje</div>
      </div>

      <div class="section-label left">Quem postou (todos os tempos)</div>
      <div class="card breakdown">
        ${[...membros].sort((a, b) => (b.total || 0) - (a.total || 0)).map((m) => `
          <button class="bd-row" data-nav="${plateLink(desafios[0]?.id || "", { periodo: "all", uid: m.uid })}">
            <span class="bd-label">${esc(m.name)}
              <div class="bd-conta">${(m.days || []).length} ${(m.days || []).length === 1 ? "dia" : "dias"} · id ${esc(String(m.uid).slice(0, 10))}…</div>
            </span>
            <span class="bd-valor">${m.total || 0}</span>
          </button>`).join("") || `<div class="empty" style="padding:22px">Sem membros.</div>`}
      </div>

      <div class="section-label left">Desafios</div>
      <div class="card breakdown">
        ${desafios.map((c) => `
          <button class="bd-row" data-nav="/c/${c.id}">
            <span class="bd-label">${esc(c.name)}
              <div class="bd-conta">${(c.memberUids || []).length} membros · código ${esc(c.code || "—")}</div>
            </span>
            <span class="bd-valor">${icon("chevron", 18)}</span>
          </button>`).join("") || `<div class="empty" style="padding:22px">Nenhum.</div>`}
      </div>
      <div class="gap"></div>`;
  }

  /* ---------- erros ---------- */

  function desenharErros() {
    if (logs === null) return spinner();
    if (!logs.length) {
      return `<div class="empty" style="padding:40px 30px">
        <div class="big">🎉</div><strong>Nenhum erro registrado</strong>
        Quando alguém esbarrar em algo, aparece aqui — com pessoa, aparelho e versão.
      </div>`;
    }

    // Agrupa por código: 8 vezes o mesmo erro é um problema, não oito.
    const porCodigo = new Map();
    logs.forEach((l) => {
      const k = `${l.tipo}·${l.codigo}`;
      if (!porCodigo.has(k)) porCodigo.set(k, []);
      porCodigo.get(k).push(l);
    });
    const grupos = [...porCodigo.entries()].sort((a, b) => b[1].length - a[1].length);

    return `
      <div class="card"><div class="stats-row tight" style="padding:14px 6px">
        ${celula(logs.length, "erros")}
        ${celula(grupos.length, "tipos")}
        ${celula(new Set(logs.map((l) => l.uid)).size, "pessoas")}
      </div></div>

      ${grupos.map(([chave, lista]) => {
        const primeiro = lista[0];
        const pessoas = [...new Set(lista.map((l) => l.uid))].map(nomeDe);
        return `
          <div class="card log-card">
            <div class="log-topo">
              <span class="log-tipo">${esc(primeiro.tipo)}</span>
              <span class="log-n">${lista.length}×</span>
            </div>
            <div class="log-codigo">${esc(primeiro.codigo)}</div>
            <div class="log-msg">${esc(primeiro.mensagem)}</div>
            <div class="log-meta">
              ${esc(pessoas.join(", "))} · ${esc(relative(primeiro.at))}
              ${primeiro.versao ? ` · ${esc(primeiro.versao)}` : ""}
              ${primeiro.etapa ? `<br>etapa: ${esc(primeiro.etapa)}` : ""}
              ${primeiro.rota ? `<br>${esc(primeiro.rota)}` : ""}
            </div>
            <details class="log-mais">
              <summary>Aparelho e ocorrências</summary>
              ${lista.slice(0, 8).map((l) => `
                <div class="log-oco">
                  <b>${esc(nomeDe(l.uid))}</b> · ${esc(relative(l.at))}
                  <div class="log-ua">${esc(l.ua || "")}</div>
                </div>`).join("")}
            </details>
            <button class="btn btn-white" data-limpar-grupo="${esc(chave)}">Resolvido, pode apagar</button>
          </div>`;
      }).join("")}
      <div class="gap"></div>`;
  }

  /* ---------- IA ---------- */

  function desenharIA() {
    if (uso === null) return spinner();
    const total = uso.reduce((s, u) => s + u.estimativas, 0);
    const comKcal = posts.filter((p) => p.kcal);
    const daBase = comKcal.filter((p) => p.kcalFonte === "base").length;
    const corrigidos = comKcal.filter((p) => p.kcalFonte === "manual").length;

    return `
      <div class="card"><div class="stats-row tight" style="padding:14px 6px">
        ${celula(total, "chamadas hoje", "teto 25/pessoa")}
        ${celula(metricas?.alimentos, "na base")}
        ${celula(comKcal.length, "pratos c/ kcal")}
        ${celula(corrigidos, "corrigidos")}
      </div></div>

      <div class="pad hint-row" style="padding-top:0">
        ${daBase} ${daBase === 1 ? "prato veio" : "pratos vieram"} da base sem gastar chamada.
        Cada correção de quem postou melhora a base pro grupo inteiro.
      </div>

      <div class="section-label left">Chamadas hoje, por pessoa</div>
      <div class="card breakdown">
        ${uso.map((u) => `
          <div class="bd-row">
            <span class="bd-label">${esc(nomeDe(u.uid))}</span>
            <span class="bd-valor" style="color:${u.estimativas >= 25 ? "var(--red)" : "inherit"}">
              ${u.estimativas}/25
            </span>
          </div>`).join("") || `<div class="empty" style="padding:22px">Ninguém usou hoje.</div>`}
      </div>

      <div class="section-label left">Maiores calorias registradas</div>
      <div class="card breakdown">
        ${[...comKcal].sort((a, b) => b.kcal - a.kcal).slice(0, 8).map((p) => `
          <button class="bd-row" data-nav="/c/${p.cid}/p/${p.id}">
            <span class="bd-label">${esc(p.title || "Sem título")}
              <div class="bd-conta">${esc(p.authorName || "")} · ${esc(p.kcalFonte || "")}</div>
            </span>
            <span class="bd-valor">${formatKcal(p.kcal)}</span>
          </button>`).join("") || `<div class="empty" style="padding:22px">Ninguém estimou ainda.</div>`}
      </div>
      <div class="gap"></div>`;
  }

  /* ---------- montagem ---------- */

  function desenhar() {
    if (admin === null) { body.innerHTML = spinner(); return; }

    if (!admin) {
      body.innerHTML = `
        <div class="empty" style="padding:50px 30px">
          <div class="big">🔒</div>
          <strong>Painel restrito</strong>
          Só quem administra o app entra aqui. Se deveria ser você, peça pro
          Gustavo te adicionar em <code>admins</code>.
        </div>`;
      return;
    }

    body.innerHTML = `
      <div class="segmented compact" data-abas>
        ${ABAS.map((a) => `<button data-aba="${a.id}" class="${a.id === aba ? "active" : ""}">${a.label}</button>`).join("")}
      </div>
      ${aba === "visao" ? desenharVisao() : aba === "erros" ? desenharErros() : desenharIA()}`;

    body.querySelector("[data-abas]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-aba]");
      if (!btn || btn.dataset.aba === aba) return;
      aba = btn.dataset.aba;
      desenhar();
    });

    body.querySelectorAll("[data-limpar-grupo]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const chave = btn.dataset.limparGrupo;
        const alvos = logs.filter((l) => `${l.tipo}·${l.codigo}` === chave);
        if (!await confirmSheet(`Apagar ${alvos.length} registro(s) desse erro?`, "Apagar")) return;
        btn.disabled = true;
        try {
          await Promise.all(alvos.map((l) => store.apagarLog(l.id)));
          toast("Apagado.");
        } catch {
          btn.disabled = false;
          toastError("Não deu pra apagar.");
        }
      });
    });
  }

  /* ---------- carga ---------- */

  (async () => {
    admin = await store.isAdmin();
    if (paramos) return;
    desenhar();
    if (!admin) return;

    desinscrever.push(store.watchLogs((lista) => { logs = lista; if (aba === "erros") desenhar(); }));

    metricas = await store.metricasGerais();
    if (paramos) return;

    desinscrever.push(store.watchMyChallenges(async (lista) => {
      desafios = lista;
      const cid = lista[0]?.id;
      if (!cid) { desenhar(); return; }

      desinscrever.push(store.watchMembers(cid, (m) => { membros = m; desenhar(); }));

      const { start, end } = store.periodRange("all", lista[0]);
      const todos = await store.periodPosts(cid, start, end).catch(() => []);
      posts = todos.map((p) => ({ ...p, cid }));
      uso = await store.usoDeIAHoje((lista[0].memberUids || []));
      if (!paramos) desenhar();
    }));
  })();

  return {
    el,
    destroy: () => { paramos = true; desinscrever.forEach((f) => { try { f(); } catch { /* ok */ } }); },
  };
}
