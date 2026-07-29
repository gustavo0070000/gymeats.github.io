# AGENTS.md

## Projeto

GymEats é um app web/PWA para grupos de amigos acompanharem o hábito de comer e competir de forma leve e divertida. O foco é transformar o compartilhamento de refeições em um desafio social com feed diário, pontuação, rankings, avaliações e resumos.

## Propósito principal

- Registrar pratos postados por membros de um desafio.
- Gerar rankings por consistência, pontos e avaliações.
- Criar uma experiência gamificada ao redor de comida.
- Rodar como PWA no navegador e em celular, com suporte a notificações.

## Stack e arquitetura

- Front-end estático: HTML, CSS e JavaScript modular.
- Sem build step no app principal.
- Hospedagem prevista em GitHub Pages.
- Backend e autenticação com Firebase.
- Banco de dados: Firestore.
- Funções de notificação: Cloud Functions.
- Mapa: Leaflet (local no repositório).

## Estrutura relevante

- index.html: ponto de entrada do app.
- manifest.webmanifest: metadados do PWA.
- sw.js: service worker para offline/instalação.
- firestore.rules: regras de segurança do banco.
- src/js/: código principal do app.
  - app.js: inicialização e roteamento principal.
  - router.js: roteamento por hash.
  - firebase.js: integração com Firebase/Auth.
  - store.js: camada de dados e cálculo de placar.
  - ui.js: helpers de interface.
  - views/: telas do app.
- functions/: Cloud Functions para notificações.

## Funcionalidades principais

- Criação e entrada em desafios.
- Feed com fotos, títulos e posts diários.
- Comentários e reações.
- Sistema de pontuação com:
  - prato comprado vs. feito em casa
  - bônus de sequência
  - vale-faltas
  - multiplicadores por dias seguidos
- Rankings separados por dias, pontos e pratos.
- Avaliação de pratos de 1 a 10.
- Passaporte gastronômico.
- Palpite de preço.
- Guia do grupo com mapa.
- Recap semanal/mensal/anual.
- Notificações push.

## Como rodar localmente

O app principal não precisa de build. É necessário servir os arquivos por HTTP.

### Front-end

- Windows:
  - `py -m http.server 8080`
- Linux/macOS:
  - `python3 -m http.server 8080`

Depois abra:
- `http://localhost:8080`

> O app depende de Firebase configurado em src/js/config.js para funcionar corretamente.

### Functions

Para trabalhar com as Cloud Functions de notificações:

- `cd functions`
- `npm install`

## Configuração importante

- O Firebase precisa ser configurado em [src/js/config.js](src/js/config.js).
- O projeto usa regras de Firestore em [firestore.rules](firestore.rules).
- Para notificações, consulte [NOTIFICACOES.md](NOTIFICACOES.md).

## Regras para agentes

- Preserve a arquitetura estática do projeto.
- Evite introduzir bundlers ou build steps desnecessários.
- Priorize mudanças compatíveis com GitHub Pages e PWA.
- Quando mexer em Firebase/Firestore, respeitar as regras e o fluxo existente.
- Para alterações na UI, manter o estilo já presente no app.
- Se for modificar as funções do backend, preferir compatibilidade com o ambiente atual do projeto.
