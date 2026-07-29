# Notificações — passo a passo

O app já tem toda a parte do celular pronta. Falta ligar as duas peças
que só você pode ligar: a **chave do Web Push** e o **deploy das funções**.

Ordem: passo 1 → 2 → 3 → 4. Leva uns 15 minutos.

---

## 1. Chave do Web Push — já está feito ✅

A chave pública já está em [`src/js/config.js`](src/js/config.js). Ela é
pública por design: identifica o projeto, não dá acesso a nada. A privada
fica guardada com o Firebase e nunca sai de lá.

Se um dia precisar gerar outra: **Configurações do projeto** → aba
**Cloud Messaging** → **Certificados push da Web** → **Gerar par de chaves**.

---

## 2. Publicar as regras do Firestore

**Automático.** A action [`Publicar regras do Firestore`](.github/workflows/deploy-rules.yml)
roda sozinha sempre que o `firestore.rules` muda no `main`, e também dá pra
disparar na mão: aba **Actions** → **Publicar regras do Firestore** →
**Run workflow**. Usa o mesmo secret `FIREBASE_SERVICE_ACCOUNT` do deploy
das funções.

Isso existe porque as regras ficarem atrás do repositório já custou caro: o
app gravava o registro do aparelho, o Firestore recusava com
`permission-denied`, e a tela não mostrava nada — ninguém recebia
notificação e não havia sinal do porquê.

**Na mão**, se preferir: Firestore Database → aba **Regras** → cole o
[`firestore.rules`](firestore.rules) → **Publicar**.

---

## 3. Subir as funções

Três caminhos. Os dois primeiros funcionam **inteiros pelo celular**.

### a) Cloud Shell — o mais simples pelo celular

O Google dá um terminal Linux no navegador, já logado na sua conta.
Não precisa instalar nada nem configurar credencial.

1. Abra **shell.cloud.google.com** no navegador do celular
2. Espere a máquina subir e digite:

```bash
git clone https://github.com/gustavo0070000/gymeats.github.io
cd gymeats.github.io/functions && npm install && cd ..
npm install -g firebase-tools
firebase deploy --only functions --project ogusamaaisa
```

O `npm install` dentro de `functions/` é obrigatório: a pasta
`node_modules` não vai pro Git, e o Firebase CLI precisa dela pra ler o
código e descobrir quais funções existem. Sem isso ele reclama de
"Couldn't find firebase-functions package".

Na primeira vez ele pede pra ativar algumas APIs (Cloud Functions,
Cloud Build, Artifact Registry, Cloud Scheduler) — responda **sim** a todas.

Digitar em terminal no celular é chato, mas são quatro linhas e só
acontece uma vez. Dá pra colar tudo de uma vez.

### b) Botão no GitHub — chato uma vez, fácil pra sempre

Depois de configurado, publicar vira um toque na aba **Actions**.
A configuração é uma vez só:

1. **Firebase Console** → engrenagem → **Configurações do projeto** →
   aba **Contas de serviço** → **Gerar nova chave privada**.
   Baixa um arquivo `.json` — funciona no celular.

2. Essa conta precisa de permissão pra publicar. No
   **console.cloud.google.com** → **IAM e administrador** → **IAM**,
   ache a conta `firebase-adminsdk-...` e adicione estes papéis:

   - Administrador do Cloud Functions
   - Usuário da conta de serviço
   - **Administrador do Cloud Scheduler** (`roles/cloudscheduler.admin`)
   - Leitor do Artifact Registry

   O de Scheduler precisa ser **Administrador**, não Editor: publicar um
   recap exige `cloudscheduler.jobs.update`, que só vem no papel de
   administrador. Com o papel errado, as três funções de gatilho publicam
   normalmente e só os recaps falham com HTTP 403.

3. **GitHub** → repositório → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
   - Nome: `FIREBASE_SERVICE_ACCOUNT`
   - Valor: o conteúdo inteiro do `.json`

4. Aba **Actions** → **Publicar funções** → **Run workflow**

Daí em diante, toda mudança em `functions/` publica sozinha.

### c) Do computador, quando tiver um

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only functions
```

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

## Ver o que foi disparado

Dentro do app: **Editar desafio → Notificações enviadas**. Cada envio
aparece com o texto que foi mandado e quantos aparelhos receberam, além
de um resumo de hoje e do total.

"Aparelhos" conta celulares e navegadores registrados, não pessoas —
quem usa o app no celular e no computador conta duas vezes.

Envio com **"nenhum destinatário"** quer dizer que ninguém elegível tinha
notificação ligada: ou ainda não ligaram, ou desligaram aquele tipo.

Pelo terminal, o mesmo dado em formato técnico:

```bash
firebase functions:log --project ogusamaaisa
```

Cada disparo sai como `enviadas 3/4, limpos 1`.

E no console do Firebase: **Functions** → aba **Registros** mostra a mesma
coisa com filtro por função; **Analytics do Messaging** traz números
agregados de entrega, com um dia de atraso.

## Se algo não chegar

1. **Confira a chave** — sem o passo 1 o botão de ligar recusa e diz o porquê.
2. **Veja os logs** — `firebase functions:log` mostra cada envio, quantos
   foram entregues e quantos tokens mortos foram limpos.
3. **Permissão bloqueada** — cadeado ao lado do endereço → Notificações →
   Permitir.
4. **iPhone** — confira o iOS 16.4+ e o app na Tela de Início.
5. **Não notifica você mesmo** — de propósito: quem posta não recebe aviso
   do próprio prato, e quem comenta no próprio prato também não.
