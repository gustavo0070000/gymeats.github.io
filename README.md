# GymEats 🍽️

Um clone do **GymRats**, mas pra comida. Todo dia cada pessoa do grupo posta a foto
de um prato; quem posta mais dias lidera a tabela. Tem feed, comentários,
reações, bate-papo, calendário e placar semanal.

É um **PWA**: roda no navegador e instala como app no celular.
Roda inteiro no **free tier** — GitHub Pages + Firebase plano Spark.
**Nenhum cartão de crédito é necessário.**

---

## Como está montado

| Camada | O quê | Custo |
|---|---|---|
| Hospedagem | GitHub Pages (arquivos estáticos) | grátis |
| Login | Firebase Auth com Google | grátis, ilimitado |
| Banco | Cloud Firestore (plano Spark) | grátis até 1 GiB |
| Fotos | comprimidas no navegador e guardadas em base64 no Firestore | grátis |

Sem build, sem `npm install`, sem bundler: é HTML + CSS + JavaScript com ES modules.
Editou um arquivo, deu push, está no ar.

### Por que as fotos vão pro Firestore e não pro Storage

O Firebase Storage exige o plano Blaze (com cartão) em projetos novos. Então as
fotos são comprimidas no próprio celular (WebP, lado maior de 1080px, teto de
700 KB) e viram base64 dentro de um documento do Firestore, que aceita até 1 MiB
por documento.

Cada post guarda **duas** versões:

- uma **miniatura** de ~5 KB embutida no próprio post, que é o que o feed carrega;
- a **foto cheia** numa coleção separada (`photos`), baixada só quando alguém
  abre o prato.

Assim o feed fica leve e as leituras diárias ficam bem abaixo do limite gratuito.

**Quanto cabe:** ~200 KB por foto em 1 GiB dá mais ou menos **5.000 pratos**.
Com 8 pessoas postando 1x por dia, isso é quase **2 anos**. Se um dia encher, é
só apagar posts antigos ou baixar o `PHOTO.maxEdge` em `src/js/config.js`.

---

## Configurando o Firebase (uma vez, ~5 min)

1. Acesse **console.firebase.google.com** → **Criar projeto** → nome `gymeats`
   → pode **desativar** o Google Analytics → Criar.

2. Na home do projeto, clique no ícone **`</>`** (Web) → apelido `gymeats-web`
   → **não** marque "Firebase Hosting" → Registrar.

3. Copie o objeto `firebaseConfig` que aparece e cole em
   [`src/js/config.js`](src/js/config.js), no lugar dos `COLE_AQUI`.
   Essas chaves são públicas por design — quem protege os dados são as regras
   do passo 6.

4. Menu lateral → **Authentication** → Começar → aba **Sign-in method**
   → **Google** → ativar → escolher um e-mail de suporte → Salvar.

5. Ainda em Authentication → aba **Settings** → **Domínios autorizados**
   → Adicionar domínio → `SEU-USUARIO.github.io`.

6. Menu lateral → **Firestore Database** → Criar banco → região
   **`southamerica-east1` (São Paulo)** → modo **produção** → Ativar.
   Depois abra a aba **Regras**, cole o conteúdo de
   [`firestore.rules`](firestore.rules) e clique em **Publicar**.

7. Firestore → aba **Índices** → crie este índice composto (o app avisa no
   console do navegador se faltar; o link do erro já cria pra você):

   | Coleção | Campos | Escopo |
   |---|---|---|
   | `posts` | `uid` (cresc.), `dayKey` (cresc.) | Grupo de coleções |

---

## Publicando no GitHub Pages

No repositório: **Settings** → **Pages** → em *Build and deployment*, escolha
**Deploy from a branch**, branch `main`, pasta `/ (root)` → Save.

Em um ou dois minutos o app está em `https://SEU-USUARIO.github.io/`.

O arquivo `.nojekyll` existe pra o GitHub Pages não ignorar nada — não apague.

---

## Instalando no celular

- **Android (Chrome):** abra o site → menu `⋮` → *Instalar app* / *Adicionar à tela inicial*.
- **iPhone (Safari):** abra o site → botão de compartilhar → *Adicionar à Tela de Início*.

Instalado, ele abre em tela cheia, sem barra de navegador, com ícone próprio.

---

## Como usar

1. Entre com o Google.
2. **Criar desafio** — dê um nome, escolha as datas e uma foto de capa.
3. Você recebe um **código de convite** de 6 letras. Manda no grupo.
4. Quem chegar depois usa **Entrar com código**.
5. Todo dia, toque no **+**, tire a foto do prato, dê um título e publique.
6. **Classificações** mostra quem tem mais dias ativos na semana / mês / ano.

Cada **dia** com pelo menos um post vale 1 ponto — postar cinco vezes no mesmo
dia continua valendo 1. Empates dividem a mesma posição, igual no GymRats.
Quem termina a semana em primeiro ganha uma "vitória semanal".

---

## Estrutura

```
index.html                 casco do app
manifest.webmanifest       metadados do PWA
sw.js                      service worker (offline + instalação)
firestore.rules            regras de segurança do banco
src/css/app.css            design system inteiro
src/js/
  config.js                chaves do Firebase e limites de compressão
  firebase.js              inicialização do SDK e login
  store.js                 toda a camada de dados e o cálculo do placar
  router.js                roteador por hash
  image.js                 compressão de imagem no navegador
  ui.js                    helpers de DOM, datas em pt-BR, toasts, sheets
  icons.js                 ícones SVG
  views/                   uma tela por arquivo
```

## Rodando na sua máquina

Precisa ser servido por HTTP (ES modules não funcionam via `file://`):

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

Para o login funcionar em `localhost`, adicione `localhost` nos
**Domínios autorizados** do Firebase Auth.
