import {
  h, esc, topbar, backBtn, spinner, toast, toastError, confirmSheet, dayKey,
} from "../ui.js";
import { icon } from "../icons.js";
import * as store from "../store.js";
import { navigate } from "../router.js";
import { compress } from "../image.js";
import {
  DEFAULT_RULES, mealsOf, cuisinesOf, eventsOf,
  stampIcon, formatPoints, pointsLabel, platePoints,
} from "../food.js";

/* ============================================================
   Regras do desafio (só o dono)

   Tudo que era constante no código passa a morar no documento do
   desafio: quanto vale cada refeição, quais selos existem, e eventos
   que dão bônus por juntar selos.

   O que já foi publicado não muda de valor por causa de uma edição
   aqui — cada prato guarda por qual motor ele é pontuado, e os pratos
   anteriores a esta tela ficam com o valor que ganharam na época.
   ============================================================ */

const ABAS = [
  { id: "pontos", label: "Pontos" },
  { id: "refeicoes", label: "Refeições" },
  { id: "selos", label: "Selos" },
  { id: "eventos", label: "Eventos" },
];

/** Id estável a partir do nome, com sufixo pra nunca colidir com outro. */
function novoId(rotulo, existentes) {
  const base = String(rotulo || "item")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 24) || "item";
  if (!existentes.includes(base)) return base;
  for (let i = 2; i < 99; i++) if (!existentes.includes(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

export async function challengeRulesView({ cid }) {
  const challenge = await store.getChallenge(cid);
  if (!challenge) return { el: h(`<div class="empty"><strong>Desafio não encontrado</strong></div>`) };
  if (challenge.ownerUid !== store.uid()) {
    return {
      el: h(`<div class="screen">
        ${topbar({ left: backBtn(`#/c/${cid}/detalhes`), title: "Regras" })}
        <div class="screen-body no-tabbar"><div class="empty" style="padding:50px 30px">
          <div class="big">🔒</div><strong>Só o dono do desafio configura isto</strong>
          Peça pra quem criou o desafio.
        </div></div>
      </div>`),
    };
  }

  /* O rascunho é uma cópia solta: dá pra mexer à vontade e só o botão
     Salvar encosta no Firestore. `meals` e `cuisines` começam com o padrão
     quando o desafio nunca foi configurado — assim a tela abre já com as
     cinco refeições e os 24 selos que o app sempre teve. */
  const draft = {
    rules: { ...DEFAULT_RULES, ...(challenge.rules || {}) },
    meals: mealsOf(challenge).map((m) => ({ ...m, weight: m.weight ?? 1 })),
    cuisines: cuisinesOf(challenge).map((c) => ({ ...c })),
    events: eventsOf(challenge).map((e) => ({ ...e, cuisineIds: [...(e.cuisineIds || [])] })),
  };
  let aba = "pontos";
  let sujo = false;

  const el = h(`
    <div class="screen">
      ${topbar({
        left: `<button class="topbar-btn" data-sair>${icon("back")}</button>`,
        title: "Regras do desafio",
        right: `<button class="topbar-action" data-salvar>Salvar</button>`,
      })}
      <div class="screen-body no-tabbar" data-body>${spinner()}</div>
      <input type="file" accept="image/*" hidden data-file>
    </div>`);

  const body = el.querySelector("[data-body]");
  const fileInput = el.querySelector("[data-file]");
  let seloDaImagem = null;   // qual selo está esperando a imagem

  const marcarSujo = () => { sujo = true; };

  /* ---------- campos numéricos ----------
     Escrevem direto no rascunho e NÃO redesenham: redesenhar a cada
     tecla tiraria o foco do campo no meio da digitação. */
  const num = (rotulo, caminho, { passo = "0.5", min = "0", dica = "" } = {}) => `
    <label class="field">
      <span class="field-label">${rotulo}</span>
      <input type="number" inputmode="decimal" step="${passo}" min="${min}"
             data-num="${caminho}" value="${esc(String(lerCaminho(caminho)))}">
      ${dica ? `<span class="pref-hint">${dica}</span>` : ""}
    </label>`;

  function lerCaminho(caminho) {
    return caminho.split(".").reduce((o, k) => o?.[k], draft) ?? "";
  }
  function gravarCaminho(caminho, valor) {
    const partes = caminho.split(".");
    const alvo = partes.slice(0, -1).reduce((o, k) => o[k], draft);
    alvo[partes[partes.length - 1]] = valor;
  }

  /* ---------- aba: pontos ---------- */

  function abaPontos() {
    const r = draft.rules;
    return `
      <div class="section-label left">Quanto vale um prato</div>
      <div class="card">
        ${num("🛒 Comprado", "rules.bought")}
        ${num("👨‍🍳 Cozinhado", "rules.homemade")}
      </div>
      <div class="pad hint-row">
        O peso de cada refeição multiplica estes valores. É lá que se resolve
        o whey: uma refeição "pré/pós treino" com peso 0,25 faz um shake
        cozinhado valer ${esc(pointsLabel(r.homemade * 0.25))} em vez de ${esc(pointsLabel(r.homemade))}.
      </div>

      <div class="section-label left">Sequência</div>
      <div class="card">
        ${num("🔥 Bônus a partir de quantos dias seguidos", "rules.streakFrom", { passo: "1", min: "1" })}
        ${num("Multiplicador", "rules.streakMultiplier", { passo: "0.1", min: "1" })}
      </div>

      <div class="section-label left">Refeição repetida no mesmo dia</div>
      <div class="card">
        ${num("Quanto vale a segunda igual", "rules.repeatMeal", {
          dica: "0 = pode postar e a galera chuta, mas não soma ponto de novo",
        })}
      </div>

      <div class="section-label left">Cravar</div>
      <div class="card">
        ${num("💸 Cravou o preço", "rules.guessPrice")}
        ${num("Margem, em reais", "rules.tolPrice", { passo: "0.5" })}
        ${num("🔥 Cravou as calorias", "rules.guessKcal")}
        ${num("Margem, em kcal", "rules.tolKcal", { passo: "5" })}
      </div>
      <div class="pad hint-row">
        Cravar é acertar, não chegar mais perto que os outros — o troféu de
        quem chegou mais perto continua existindo e não vale ponto.
        Com margem 0, acertar caloria na unidade é quase impossível;
        algo como 25 kcal faz o prêmio realmente sair de vez em quando.
        O ponto vai pra quem chutou, no dia do chute.
      </div>

      <div class="section-label left">Simulação</div>
      <div class="card breakdown">
        ${draft.meals.map((m) => `
          <div class="bd-row">
            <span class="bd-label">${m.emoji || "🍽️"} ${esc(m.label)}
              <div class="bd-conta">peso ×${formatPoints(m.weight ?? 1)}</div>
            </span>
            <span class="bd-valor">${esc(pointsLabel(platePoints({ homemade: false, mealType: m.id }, draft)))}
              / ${esc(pointsLabel(platePoints({ homemade: true, mealType: m.id }, draft)))}</span>
          </div>`).join("")}
        <div class="bd-row total">
          <span class="bd-label">comprado / cozinhado</span>
          <span class="bd-valor">por refeição</span>
        </div>
      </div>
      <div class="gap"></div>`;
  }

  /* ---------- aba: refeições ---------- */

  function abaRefeicoes() {
    return `
      <div class="pad hint-row" style="padding-top:14px">
        O peso multiplica os pontos do prato. Apagar uma refeição não apaga
        os pratos que já a usaram — eles continuam lá, só somem da lista de
        opções e passam a contar com peso 1.
      </div>
      ${draft.meals.map((m, i) => `
        <div class="card cfg-item">
          <div class="cfg-linha">
            <input class="cfg-emoji" data-campo="meals.${i}.emoji" value="${esc(m.emoji || "")}"
                   maxlength="4" placeholder="🍽️" aria-label="Emoji">
            <input class="cfg-nome" data-campo="meals.${i}.label" value="${esc(m.label || "")}"
                   maxlength="24" placeholder="Nome da refeição">
            <button class="cfg-x" data-apagar-meal="${i}" aria-label="Apagar">${icon("trash", 18)}</button>
          </div>
          <div class="cfg-linha">
            <span class="cfg-rotulo">Peso</span>
            <input class="cfg-peso" type="number" inputmode="decimal" step="0.25" min="0"
                   data-campo="meals.${i}.weight" value="${esc(String(m.weight ?? 1))}">
            <span class="cfg-valor" data-previa="${i}">
              ${esc(pointsLabel(platePoints({ homemade: false, mealType: m.id }, draft)))}
              / ${esc(pointsLabel(platePoints({ homemade: true, mealType: m.id }, draft)))}
            </span>
          </div>
        </div>`).join("")}
      <div class="pad"><button class="btn btn-white" data-nova-meal>
        ${icon("plus", 18)} Adicionar refeição
      </button></div>
      <div class="gap"></div>`;
  }

  /* ---------- aba: selos ---------- */

  function abaSelos() {
    return `
      <div class="pad hint-row" style="padding-top:14px">
        Selo não vale ponto sozinho — carimba o passaporte e alimenta os
        eventos. Dá pra usar um emoji ou subir uma imagem (ela é reduzida
        pra caber no desafio). Apagar um selo não some dos pratos antigos.
      </div>
      <div class="card"><div class="selo-grade">
        ${draft.cuisines.map((c, i) => `
          <div class="selo-item">
            <button class="selo-foto" data-imagem="${i}" aria-label="Trocar imagem de ${esc(c.label)}">
              ${stampIcon(c, 30)}
            </button>
            <input class="selo-nome" data-campo="cuisines.${i}.label" value="${esc(c.label || "")}"
                   maxlength="20" placeholder="Nome">
            <input class="selo-emoji" data-campo="cuisines.${i}.emoji" value="${esc(c.emoji || "")}"
                   maxlength="4" placeholder="emoji">
            <button class="cfg-x" data-apagar-selo="${i}" aria-label="Apagar">${icon("trash", 16)}</button>
          </div>`).join("")}
      </div></div>
      <div class="pad">
        <button class="btn btn-white" data-novo-selo>${icon("plus", 18)} Criar selo</button>
      </div>
      <div class="pad hint-row">
        ${draft.cuisines.length} ${draft.cuisines.length === 1 ? "selo" : "selos"} no passaporte.
        Toque na figura pra subir uma imagem; deixe o emoji vazio se usar imagem.
      </div>
      <div class="gap"></div>`;
  }

  /* ---------- aba: eventos ---------- */

  function abaEventos() {
    const hoje = dayKey();
    return `
      <div class="pad hint-row" style="padding-top:14px">
        Um evento é uma missão com selo: "Mês alemão — coma 3 destes selos e
        leve 2 pontos". O bônus entra uma vez só, no dia em que a pessoa
        fecha a conta, e some se ela apagar os pratos que valeram.
      </div>
      ${draft.events.length ? draft.events.map((ev, i) => {
        const janela = !ev.from && !ev.to ? "sempre valendo"
          : `${ev.from || "sempre"} → ${ev.to || "sem fim"}`;
        const fechado = (ev.from && hoje < ev.from) || (ev.to && hoje > ev.to);
        return `
        <div class="card cfg-item">
          <div class="cfg-linha">
            <input class="cfg-emoji" data-campo="events.${i}.emoji" value="${esc(ev.emoji || "")}"
                   maxlength="4" placeholder="🎯" aria-label="Emoji">
            <input class="cfg-nome" data-campo="events.${i}.name" value="${esc(ev.name || "")}"
                   maxlength="40" placeholder="Nome do evento">
            <button class="cfg-x" data-apagar-evento="${i}" aria-label="Apagar">${icon("trash", 18)}</button>
          </div>
          <div class="cfg-linha">
            <span class="cfg-rotulo">De</span>
            <input type="date" class="cfg-data" data-campo="events.${i}.from" value="${esc(ev.from || "")}">
            <span class="cfg-rotulo">até</span>
            <input type="date" class="cfg-data" data-campo="events.${i}.to" value="${esc(ev.to || "")}">
          </div>
          <div class="cfg-linha">
            <span class="cfg-rotulo">Precisa de</span>
            <input class="cfg-peso" type="number" step="1" min="1"
                   data-campo="events.${i}.need" value="${esc(String(ev.need ?? 3))}">
            <span class="cfg-rotulo">selos · vale</span>
            <input class="cfg-peso" type="number" step="0.5" min="0"
                   data-campo="events.${i}.bonus" value="${esc(String(ev.bonus ?? 2))}">
            <span class="cfg-rotulo">pts</span>
          </div>
          <div class="cfg-selos">
            ${draft.cuisines.map((c) => `
              <button class="chip ${ev.cuisineIds.includes(c.id) ? "active" : ""}"
                      data-evento-selo="${i}" data-selo="${esc(c.id)}">
                ${stampIcon(c, 16)} ${esc(c.label)}
              </button>`).join("")}
          </div>
          <div class="hint-row" style="padding-bottom:4px">
            ${janela}${fechado ? " · fora da janela hoje" : ""} ·
            ${ev.cuisineIds.length} ${ev.cuisineIds.length === 1 ? "selo escolhido" : "selos escolhidos"}
            ${ev.cuisineIds.length && ev.cuisineIds.length < (Number(ev.need) || 1)
              ? " — menos selos do que o evento exige, ninguém consegue fechar" : ""}
          </div>
        </div>`;
      }).join("") : `<div class="empty" style="padding:30px">
        <div class="big">🎯</div><strong>Nenhum evento</strong>
        Crie um pra dar um objetivo curto pro grupo.
      </div>`}
      <div class="pad"><button class="btn btn-white" data-novo-evento>
        ${icon("plus", 18)} Criar evento
      </button></div>
      <div class="gap"></div>`;
  }

  /* ---------- montagem ---------- */

  function desenhar() {
    body.innerHTML = `
      <div class="segmented compact" data-abas>
        ${ABAS.map((a) => `<button data-aba="${a.id}" class="${a.id === aba ? "active" : ""}">${a.label}</button>`).join("")}
      </div>
      ${aba === "pontos" ? abaPontos()
        : aba === "refeicoes" ? abaRefeicoes()
        : aba === "selos" ? abaSelos() : abaEventos()}`;
    ligar();
  }

  function ligar() {
    body.querySelector("[data-abas]").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-aba]");
      if (!btn || btn.dataset.aba === aba) return;
      aba = btn.dataset.aba;
      desenhar();
    });

    // Números da aba Pontos: gravam sem redesenhar.
    body.querySelectorAll("[data-num]").forEach((input) => {
      input.addEventListener("input", () => {
        const v = Number(input.value);
        gravarCaminho(input.dataset.num, isFinite(v) ? v : 0);
        marcarSujo();
      });
    });

    // Campos das listas: mesmo princípio, mas o caminho tem índice.
    body.querySelectorAll("[data-campo]").forEach((input) => {
      input.addEventListener("input", () => {
        const [lista, i, campo] = input.dataset.campo.split(".");
        const item = draft[lista][Number(i)];
        if (!item) return;
        item[campo] = input.type === "number" ? Number(input.value) : input.value;
        marcarSujo();
        atualizarPrevia();
      });
    });

    body.querySelectorAll("[data-evento-selo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = draft.events[Number(btn.dataset.eventoSelo)];
        const id = btn.dataset.selo;
        const i = ev.cuisineIds.indexOf(id);
        if (i >= 0) ev.cuisineIds.splice(i, 1);
        else ev.cuisineIds.push(id);
        marcarSujo();
        desenhar();
      });
    });

    body.querySelector("[data-nova-meal]")?.addEventListener("click", () => {
      draft.meals.push({
        id: novoId("refeicao", draft.meals.map((m) => m.id)),
        label: "", emoji: "🍽️", weight: 1,
      });
      marcarSujo();
      desenhar();
    });

    body.querySelector("[data-novo-selo]")?.addEventListener("click", () => {
      draft.cuisines.push({
        id: novoId("selo", draft.cuisines.map((c) => c.id)),
        label: "", emoji: "🏅",
      });
      marcarSujo();
      desenhar();
    });

    body.querySelector("[data-novo-evento]")?.addEventListener("click", () => {
      draft.events.push({
        id: novoId("evento", draft.events.map((e) => e.id)),
        name: "", emoji: "🎯", from: "", to: "", need: 3, bonus: 2, cuisineIds: [],
      });
      marcarSujo();
      desenhar();
    });

    const apagar = (attr, lista, pergunta) => {
      body.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = Number(btn.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())]);
          const item = draft[lista][i];
          if (!await confirmSheet(pergunta(item), "Apagar")) return;
          draft[lista].splice(i, 1);
          marcarSujo();
          desenhar();
        });
      });
    };
    apagar("apagar-meal", "meals", (m) =>
      `Apagar "${m?.label || "essa refeição"}"? Os pratos que já a usaram continuam lá.`);
    apagar("apagar-selo", "cuisines", (c) =>
      `Apagar o selo "${c?.label || "sem nome"}"? Quem já carimbou continua com ele no passaporte.`);
    apagar("apagar-evento", "events", (e) =>
      `Apagar o evento "${e?.name || "sem nome"}"? O bônus de quem já fechou some no próximo recálculo.`);

    body.querySelectorAll("[data-imagem]").forEach((btn) => {
      btn.addEventListener("click", () => {
        seloDaImagem = Number(btn.dataset.imagem);
        fileInput.click();
      });
    });
  }

  /** Só o número da prévia muda; redesenhar tiraria o foco do campo. */
  function atualizarPrevia() {
    body.querySelectorAll("[data-previa]").forEach((span) => {
      const m = draft.meals[Number(span.dataset.previa)];
      if (!m) return;
      span.textContent = `${pointsLabel(platePoints({ homemade: false, mealType: m.id }, draft))}`
        + ` / ${pointsLabel(platePoints({ homemade: true, mealType: m.id }, draft))}`;
    });
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    const selo = draft.cuisines[seloDaImagem];
    if (!file || !selo) return;
    try {
      /* 64 px e ~3 KB: o selo aparece num chip de 18 px e num quadrado de
         30 px. Guardar mais que isso encheria o documento do desafio, que
         tem teto de 1 MiB e já carrega a capa. */
      selo.image = await compress(file, { maxEdge: 64, maxBytes: 3200, square: true });
      marcarSujo();
      desenhar();
      toast("Imagem do selo trocada. Salve pra valer.");
    } catch {
      toastError("Não consegui usar essa imagem.");
    }
  });

  /* ---------- salvar ---------- */

  function validar() {
    const semNome = [
      ...draft.meals.filter((m) => !String(m.label).trim()).map(() => "refeição"),
      ...draft.cuisines.filter((c) => !String(c.label).trim()).map(() => "selo"),
      ...draft.events.filter((e) => !String(e.name).trim()).map(() => "evento"),
    ];
    if (semNome.length) return `Tem ${semNome[0]} sem nome.`;
    if (!draft.meals.length) return "Deixe pelo menos uma refeição.";
    if (!draft.cuisines.length) return "Deixe pelo menos um selo.";
    const r = draft.rules;
    if (!(r.streakFrom >= 1)) return "A sequência tem que começar em pelo menos 1 dia.";
    if (!(r.streakMultiplier >= 1)) return "O multiplicador não pode diminuir os pontos.";
    return "";
  }

  el.querySelector("[data-salvar]").addEventListener("click", async (e) => {
    const erro = validar();
    if (erro) return toastError(erro);

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      await store.updateChallenge(cid, {
        rules: { ...draft.rules },
        meals: draft.meals.map((m) => ({
          id: m.id, label: String(m.label).trim(), emoji: m.emoji || "", weight: Number(m.weight) || 0,
        })),
        cuisines: draft.cuisines.map((c) => ({
          id: c.id, label: String(c.label).trim(), emoji: c.emoji || "", ...(c.image ? { image: c.image } : {}),
        })),
        events: draft.events.map((ev) => ({
          id: ev.id, name: String(ev.name).trim(), emoji: ev.emoji || "",
          from: ev.from || "", to: ev.to || "",
          need: Math.max(1, Number(ev.need) || 1), bonus: Number(ev.bonus) || 0,
          cuisineIds: [...ev.cuisineIds],
        })),
      });

      /* Refaz o placar na sequência: mexer nas regras sem recalcular
         deixaria a tela dizendo uma coisa e o ranking outra até alguém
         postar. Só pega os pratos publicados sob a regra nova — os
         antigos guardam o valor que ganharam. */
      btn.textContent = "Recalculando…";
      const n = await store.recalcStandings(cid);
      sujo = false;
      toast(`Regras salvas. Placar refeito para ${n} ${n === 1 ? "pessoa" : "pessoas"}.`);
      navigate(`/c/${cid}/detalhes`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Salvar";
      store.registrarErro("regras-desafio", err, { etapa: "salvar" });
      toastError(err?.code === "permission-denied"
        ? "O Firestore recusou — só o dono do desafio configura isto."
        : "Não deu pra salvar.");
    }
  });

  el.querySelector("[data-sair]").addEventListener("click", async () => {
    if (sujo && !await confirmSheet("Sair sem salvar as regras?", "Sair sem salvar")) return;
    navigate(`/c/${cid}/detalhes`);
  });

  desenhar();
  return { el };
}
