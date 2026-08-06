import { h, esc } from "./ui.js";
import { APP_VERSION, APP_NAME } from "./config.js";

/* ============================================================
   Notas de versão

   O app se atualiza sozinho: o service worker troca a versão e recarrega
   sem perguntar nada. O efeito colateral é que ninguém sabe o que mudou —
   e uma mudança em REGRA DE PONTO que ninguém percebeu vira discussão no
   grupo. Este modal aparece uma vez por versão e some com um toque.

   Cada item começa com um emoji porque a lista é lida no celular, rolando
   rápido, e o emoji é o que separa "ganhei uma coisa" de "mudou a regra".
   ============================================================ */

const VISTO = "gymeats:notas-vistas";

export const NOTAS = [
  {
    versao: "v27",
    data: "2026-08-06",
    titulo: "Regras na mão do dono",
    itens: [
      "🕵️ As notas voltaram a ser anônimas de verdade: a notificação não diz mais quem deu, nem quanto foi. Antes desta versão o aviso trazia o nome e a nota — inclusive no histórico em Editar desafio → Notificações enviadas, que continua lá do jeito que saiu.",
      "🎯 Cravar o preço ou as calorias de um prato dos outros agora vale ponto. Chegar mais perto que a galera continua rendendo só o troféu.",
      "⚖️ O dono do desafio escolhe quanto vale cada refeição. Dá pra criar \"pré/pós treino\" com peso 0,25 e o whey deixa de valer o mesmo que um almoço.",
      "🔁 Segundo prato da mesma refeição no mesmo dia não pontua de novo. Pode postar do mesmo jeito — a galera chuta preço e caloria nele.",
      "🏅 Os selos do passaporte agora são configuráveis: dá pra criar novos, trocar o nome, usar emoji ou subir uma imagem.",
      "🗓️ Eventos: \"Mês alemão — junte 3 selos e leve 2 pontos\". O bônus entra sozinho quando a pessoa fecha a conta.",
      "🧾 Prato publicado antes desta versão mantém o valor que já tinha. A regra nova vale daqui pra frente.",
    ],
  },
];

/** A versão mais nova que a pessoa já leu. Vazio na primeira vez. */
const jaViu = () => {
  try { return localStorage.getItem(VISTO) || ""; } catch { return ""; }
};

const marcarVisto = (versao) => {
  try { localStorage.setItem(VISTO, versao); } catch { /* modo anônimo */ }
};

/**
 * O que mostrar agora.
 * Quem nunca abriu o app vê só a nota mais recente — despejar o histórico
 * inteiro na primeira sessão seria ruído, não novidade.
 */
export function novidadesPendentes() {
  const visto = jaViu();
  if (!NOTAS.length) return [];
  if (!visto) return NOTAS.slice(0, 1);
  const i = NOTAS.findIndex((n) => n.versao === visto);
  return i === -1 ? NOTAS.slice(0, 1) : NOTAS.slice(0, i);
}

function modal(notas, { titulo = "O que mudou", aoFechar } = {}) {
  const root = document.getElementById("modal-root");
  const node = h(`
    <div class="sheet-backdrop notas-backdrop">
      <div class="notas">
        <div class="notas-topo">
          <div class="notas-tag">${esc(APP_NAME)} ${esc(notas[0]?.versao || APP_VERSION)}</div>
          <div class="notas-titulo">${esc(titulo)}</div>
        </div>
        <div class="notas-corpo">
          ${notas.map((n) => `
            ${notas.length > 1 ? `<div class="notas-versao">${esc(n.versao)}${n.titulo ? ` · ${esc(n.titulo)}` : ""}</div>` : ""}
            ${n.titulo && notas.length === 1 ? `<div class="notas-sub">${esc(n.titulo)}</div>` : ""}
            <ul class="notas-lista">
              ${n.itens.map((i) => `<li>${esc(i)}</li>`).join("")}
            </ul>`).join("")}
        </div>
        <div class="notas-pe">
          <button class="btn btn-primary" data-notas-ok>Entendi</button>
        </div>
      </div>
    </div>`);

  const fechar = () => { node.remove(); aoFechar?.(); };
  // Fora do card não fecha de propósito: fechar sem querer é o mesmo que
  // não ter lido, e a nota não volta mais.
  node.querySelector("[data-notas-ok]").addEventListener("click", fechar);
  root.appendChild(node);
  return node;
}

/** Chamado no boot. Não faz nada quando não há novidade. */
export function mostrarNovidades() {
  const pendentes = novidadesPendentes();
  if (!pendentes.length) return null;
  return modal(pendentes, { aoFechar: () => marcarVisto(NOTAS[0].versao) });
}

/** Reabrir pelo menu, mesmo já tendo lido. */
export function abrirNovidades() {
  if (!NOTAS.length) return null;
  return modal(NOTAS, { titulo: "Novidades" });
}
