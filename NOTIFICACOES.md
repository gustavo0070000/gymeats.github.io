# Notificações — passo a passo

O app já tem toda a parte do celular pronta. Falta ligar as duas peças
que só você pode ligar: a **chave do Web Push** e o **deploy das funções**.

Ordem: passo 1 → 2 → 3 → 4. Leva uns 15 minutos.

---

## 1. Gerar a chave do Web Push (2 min)

No console do Firebase:

**Configurações do projeto** (engrenagem) → aba **Cloud Messaging** →
seção **Configuração da Web** → **Certificados push da Web** →
**Gerar par de chaves**.

Vai aparecer uma chave longa começando com `B...`. Copie e cole em
[`src/js/config.js`](src/js/config.js), no lugar do `COLE_AQUI`:

```js
export const VAPID_PUBLIC_KEY = "BEl62iUYgUiv...";
```

Só a chave **pública** vai no código. A privada fica guardada com o
Firebase e nunca sai de lá.

---

## 2. Publicar as regras do Firestore (1 min)

Firestore Database → aba **Regras** → cole o
[`firestore.rules`](firestore.rules) → **Publicar**.

Elas ganharam a permissão dos registros de notificação
(`users/{uid}/pushTokens`), sem a qual o app não consegue guardar o
aparelho.

---

## 3. Subir as funções (10 min, uma vez só)

Precisa do Node 20+ instalado. No terminal, dentro da pasta do projeto:

```bash
npm install -g firebase-tools     # só na primeira vez
firebase login                    # abre o navegador pra você entrar
firebase deploy --only functions
```

Na primeira vez o Firebase pede pra ativar algumas APIs (Cloud Functions,
Cloud Build, Artifact Registry, Cloud Scheduler). Responda **sim** a todas.

No fim aparece a lista das seis funções:

| Função | Quando dispara |
|---|---|
| `aoPostarPrato` | alguém posta → avisa todo mundo do desafio |
| `aoComentar` | comentaram → avisa quem postou |
| `aoDarNota` | deram nota → avisa quem postou |
| `recapSemanal` | domingo 20h → avisa quem venceu a semana |
| `recapMensal` | dia 1º às 20h → vencedor do mês |
| `recapAnual` | 1º de janeiro às 20h → vencedor do ano |

Tudo no fuso de Brasília e na região `southamerica-east1`.

---

## 4. Ligar no celular (30 s por pessoa)

Cada um abre o app → **Minha conta** → **Notificações** →
**Ligar notificações** → aceita a permissão do navegador.

Na mesma tela dá pra escolher o que receber: pratos novos, comentários,
notas e recaps, cada um com seu liga/desliga.

### iPhone

Notificação web no iPhone só funciona com **iOS 16.4 ou mais novo** e
**apenas com o app instalado na Tela de Início** (compartilhar →
Adicionar à Tela de Início). Aberto no Safari comum não chega nada.
O app avisa isso na tela quando detecta a situação.

No Android funciona direto, instalado ou no navegador.

---

## Quanto custa

**R$ 0.** As contas do free tier, para um grupo de 8 pessoas:

| Recurso | Free tier | Uso estimado |
|---|---|---|
| Envio de mensagens (FCM) | ilimitado | — |
| Invocações de função | 2.000.000/mês | ~6.000/mês |
| Cloud Scheduler | 3 jobs | 3 jobs |
| Artifact Registry | 0,5 GB | ~0,2 GB |

O plano Blaze cobra só o que passa do free tier, e o uso de vocês fica
uma ordem de grandeza abaixo. Ainda assim, duas travas foram deixadas no
código: `maxInstances: 5` por função, para um bug nunca virar conta.

Se quiser dormir tranquilo, dá pra pôr um teto no Google Cloud:
**Faturamento → Orçamentos e alertas → Criar orçamento** → R$ 5 com
alerta por e-mail.

---

## Se algo não chegar

1. **Confira a chave** — sem o passo 1 o botão de ligar recusa e diz o porquê.
2. **Veja os logs** — `firebase functions:log` mostra cada envio, quantos
   foram entregues e quantos tokens mortos foram limpos.
3. **Permissão bloqueada** — cadeado ao lado do endereço → Notificações →
   Permitir.
4. **iPhone** — confira o iOS 16.4+ e o app na Tela de Início.
5. **Não notifica você mesmo** — de propósito: quem posta não recebe aviso
   do próprio prato, e quem comenta no próprio prato também não.
