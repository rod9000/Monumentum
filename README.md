# Diorama Puzzle — protótipo 3D (Three.js)

Protótipo de jogo de puzzle 3D em estilo **diorama** (Captain Toad / Mekorama),
rodando direto no navegador com **HTML + CSS + JavaScript** e **Three.js embutido**
(sem CDN). Um único arquivo: [`diorama-puzzle.html`](./diorama-puzzle.html).

## Como jogar

Abra `diorama-puzzle.html` no navegador (duplo clique — não precisa de servidor
nem de internet: o Three.js já vem dentro do arquivo). No celular, também funciona
pelo link do GitHub Pages.

| Ação | Como fazer |
|---|---|
| Andar | Clicar na face de cima de um bloco ao lado do personagem |
| Andar (teclado) | `W A S D` ou setas — a direção é relativa à câmera |
| **Girar a tela** | Botões **⟲ / ⟳** ou teclas **Q** (esquerda) e **E** (direita) |
| Zoom | Roda do mouse ou botões **＋ / −** (limitado, para não perder o mapa de vista) |
| Trocar de fase | Botões **◀ ▶** no painel, ou **Próxima Fase ▶** ao concluir |
| Reiniciar a fase | Botão **↺** |
| Objetivo | Coletar as moedas do diorama |

O progresso é salvo no navegador (`localStorage`) — ao reabrir, você continua na
última fase desbloqueada. `Enter`/`Espaço` avançam de fase na tela de conclusão.

### Sobre mapas maiores e a orientação do personagem

* **Mapas complexos:** o enquadramento é **automático**. O jogo calcula o centro
  e o raio da esfera que envolve o mapa e dimensiona a câmera ortográfica, a
  área de sombra e o plinto a partir disso — um mapa 10×10 com 3 andares entra
  na tela sem nenhuma alteração no código (verificado no smoke test). Só não
  existe *scroll* livre da câmera: use o zoom para aproximar.
* **O personagem mantém a direção** em que andou por último (não fica girando
  para a câmera enquanto está parado). Se preferir o comportamento "olha para o
  jogador quando parado", mude `CONFIG.personagemEncaraACamera` para `true`.

## Progresso, pontuação, som e menu

* **Moedas:** as moedas de uma tentativa só entram no total salvo quando a fase é
  **concluída**. Cair no vão, apertar ↺ ou sair da fase descarta as moedas da
  tentativa. Cada fase conta suas moedas uma vez (refazer não rende de novo).
* **Meta e estrelas (pontuação):** cada fase tem uma **meta**: o menor número de passos
  para pegar todas as moedas, calculado pelo próprio jogo (`src/par.js`). O contador 👣
  mostra os passos e a meta (ex.: `👣 12 · meta 20`). Cada passo para uma célula vizinha
  conta 1, e o pulo também conta 1. A viagem de elevador não conta (só entrar e sair), e
  os giros da câmera também não contam.
  - ⭐⭐⭐ com menos de 1,25 × meta (com meta 20: até 24 passos);
  - ⭐⭐ de 1,25 × meta até 1,5 × meta (com meta 20: de 25 a 30 passos);
  - ⭐ acima de 1,5 × meta (com meta 20: mais de 30 passos).
  As moedas são sorteadas a cada tentativa (em todas as fases), então a meta também muda
  de tentativa para tentativa. Na conclusão aparecem passos, meta, recorde da fase e tempo.
* **Menu ☰:** lista as fases abertas, com as concluídas marcadas e as estrelas. As
  travadas aparecem desabilitadas (abrem ao concluir a anterior).
* **Som 🔊/🔇:** efeitos sintetizados (passo, moeda, pulo, queda, giro, fase). O som
  começa depois do primeiro toque ou tecla. O mudo fica salvo no navegador.
* **Dicas:** ao entrar numa fase com pontes ou com blocos de pulo, o jogo explica a
  mecânica por alguns segundos.
* Progresso salvo em `localStorage` (chave `diorama-progresso-v2`). Versões antigas
  são migradas automaticamente.

## Criar a Fase 2 (e a 3, a 4…)

Toda a fase é **dados**. As fases manuais ficam em `src/dados/niveis.js`
(array `NIVEIS`). Para criar uma fase, copie o objeto do nível e desenhe um
novo array (ou use o pipeline de geração descrito mais abaixo):

```js
const NIVEIS = [
  {
    nome: 'Fase 1 — Primeiros Passos',
    moedas: 3, distanciaMoedas: 3, seed: 3,   // sorteio de moedas (veja abaixo)
    blocos: [
      { x: 0, y: 0, z: 4, tipo: 'spawn' },
      { x: 1, y: 0, z: 4, tipo: 'chao'  },
      { x: 2, y: 1, z: 4, tipo: 'parede' },
      { x: 4, y: 1, z: 0, tipo: 'moeda' }      // igual funciona: vira fixa
    ]
  },
  {                                    // <<< Fase 2
    nome: 'Fase 2 — A Travessia',
    moedas: 4, distanciaMoedas: 2,
    blocos: [ /* ... */ ]
  }
];
```

* `x` → leste(+)/oeste(-), `y` → altura, `z` → sul(+)/norte(−)
* tipos: `'chao'`, `'parede'`, `'moeda'`, `'spawn'` e `'elevador'`
  (plataforma que vaia entre a posição escrita e `elev.para` — veja "Elevadores")
* a câmera se enquadra sozinha no tamanho do mapa — nada mais precisa mudar.

### Moedas: sorteio padronizado

Cada fase declara **quantas** moedas ter (`moedas`) e o jogo sorteia as posições
com uma regra única, igual para todas as fases:

1. só entram blocos realmente caminháveis (nada em cima, tipo válido);
2. só entram blocos **alcançáveis** a partir do spawn — a fase nunca fica
   impossível de terminar;
3. respeitam `distanciaMoedas` passos de distância do spawn;
4. ficam a pelo menos 2 passos umas das outras;
5. as moedas **surgem animadas** (pop escalonado pela distância do spawn).

Sem `seed` no nível, o sorteio é **aleatório a cada partida** — as moedas aparecem
em lugares novos sempre que você entra ou reinicia a fase. Para travar um layout
reprodutível, use `seed: 7` na fase (ou `CONFIG.sementeFixa = 7` para valer para
todas). Quer moedas em posições específicas? Escreva os blocos `tipo: 'moeda'` no
array e use `moedasFixas: true` na fase.

### Regras de caminhada implementadas

Um bloco é **caminhável** quando seu tipo é `chao`/`moeda`/`spawn` **e** o
espaço imediatamente acima dele está livre. O personagem se move **1 passo na
horizontal (X ou Z) com no máximo 1 bloco de desnível** — é assim que se sobem
escadas e quinas. Clicar em um bloco distante faz o personagem percorrer a rota
automaticamente (busca em largura na grade); para exigir apenas cliques em
blocos adjacentes, mude `permitirCliqueDistante` para `false` em `CONFIG`.

### Fases incluídas

| Fase | Estilo | O que tem |
|---|---|---|
| 1 — Primeiros Passos | plano + terraço | pracinha 5×5, quina de 2 blocos |
| 2 — O Salão | horizontal 6×6 | labirinto de paredes |
| 3 — A Travessia | horizontal 9×9 | três ilhas ligadas por **blocos de pulo**: duas setas seguidas sobre o vão, e o par do outro lado volta |
| 4 — A Escada | **vertical** | escada de 4 andares na borda + mirante no topo |
| 5 — O Zigurate | **vertical** | pirâmide de 5 andares em espiral |
| 6 — Dois Mundos | **elevador horizontal** | duas ilhas separadas por um vão de 3 células; tem de pegar o elevador e **esperar** a travessia |
| 7 — O Poço | **elevador vertical** | o elevador sobe 3 blocos pela borda; embarque, **espere** a subida e desembarque no patamar |
| 8 — O Labirinto | horizontal 9×9 | labirinto de verdade (gerado com recursive backtracker + atalhos); as moedas caem nos becos |
| 9 — A Ponte Estreita | horizontal 17×3 | pinguela de **1 célula** de largura, com becos sem saída e uma elevação no meio |
| 10 — A Espiral | **vertical** 7×7 | rampa em espiral (anéis concêntricos) subindo 5 andares; cada degrau fica em coluna diferente |
| 11 — Dois Elevadores | 2 travessias | três ilhas e **dois** vaivéns em sequência — pega um, espera, atravessa, pega o outro |
| 12 — O Elevador Secreto | elevador + labirinto | o elevador sobe até um labirinto suspenso; desembarcar é fácil, sair de lá com as moedas é o desafio |
| 13 — Duas Rotas | escolha | dois caminhos para o mesmo terraço: o elevador (rápido, mas precisa **esperar**) ou a escada (longa, sempre Disponível) |
| 14 — O Labirinto Vertical | labirinto em 2 andares | labirinto embaixo e labirinto em cima (3 blocos mais alto), ligados por uma escada no pátio |
| 15 — O Grand Tour | usa tudo | labirinto, pinguela, elevador horizontal e escada final até o terraço das últimas moedas |
| 16 — Ilusão de Ótica | **ponte de câmera** | duas ilhas separadas por um vão; a ponte só existe com a câmera girada 90° |
| 17 — Dois Ângulos | **duas pontes** | pontes em ângulos diferentes, em sequência (girar 90° e depois 270°) |
| 18 — Ponte e Elevador | ponte + elevador | elevador entre as ilhas e uma ponte que só aparece com a câmera em 180° |
| 19 — Relevo Ondulado | **relevo** (ruído) | mapa orgânico com platôs e vales, semente fixa |
| 20 — Platôs | **relevo** (ruído) | mais andares e paredes em platôs |
| 21 — Vales | **relevo** (ruído) | o maior mapa de relevo, com vales e paredes |
| 22 em diante | **procedural** | labirintos, ilhas e relevo gerados a partir do número da fase (ver abaixo) |

Na 13 a graça é **ler o estado do elevador**: se ele acabou de sair, compensa mais subir a escada.

### Elevadores

Um bloco `'elevador'` é uma plataforma que vaia entre a posição em que foi
escrita no mapa e `elev.para`:

```js
{ x: 4, y: 0, z: 2, tipo: 'elevador',
  elev: { eixo: 'x', para: { x: 6, y: 0, z: 2 } } }
```

* o personagem só sobe/desce quando ela está **parada** em uma das pontas;
* enquanto ela se move, ele é **carregado junto** e não consegue andar
  (aparece "🛗 Espera o elevador chegar…");
* ela para ~1,1s em cada ponta (tempo de embarque) e depois volta sozinha;
* `eixo` é só documentação — o que vale é `para`;
* `CONFIG.velocidadeElevador` e `CONFIG.esperaElevador` ajustam o ritmo.

Como a rota (busca em largura) não conhece o elevador, clicar num bloco do
outro lado do vão manda o personagem até a beirada de embarque e avisa
"🛗 Só dá de elevador".

O sorteio de moedas **ignora o bloco do elevador** (a plataforma não pode virar
moeda) e atravessa o vão pelas pontas — por isso moedas também aparecem do
outro lado.

O pipeline das fases manuais é `node gerar-fases.mjs` (valida + escreve
`fases-geradas.json`) seguido de `node inserir-fases.mjs` (recompõe o `NIVEIS`
em `src/dados/niveis.js`, preservando a Fase 1). O JSON é a fonte da verdade
das fases 2 a 18. Depois, `npm run build` gera o `diorama-puzzle.html` (um
bundle inline, que funciona com duplo clique).

### Pontes de câmera

Uma ponte liga duas pontas distantes **só quando a câmera está no ângulo dela**
(0 = inicial, 1 = +90°, 2 = 180°, 3 = -90°). Enquanto a câmera está alinhada, as
placas quadradas finas no vão ficam sólidas e **dá para andar por cima delas**
(clique ou setas, uma placa de cada vez). Fora do alinhamento, ficam apagadas.

O **pulo** é uma mecânica separada, com o bloco `'pulo'` (quadrado com círculo):
nele, **duas setas seguidas** (até 0,4 s entre elas) na mesma direção pulam até o
próximo bloco de pulo nessa direção (até 12 células, por cima do que houver no meio).
Sem bloco de pulo na direção, cai. As fases procedurais criam pares de pulo que
voltam um ao outro (é sempre possível pular de volta).
Uma seta só anda normalmente. Não depende da câmera nem da ponte.

Se o personagem tentar pisar numa placa fora do alinhamento, ou pular com a
câmera errada, ele **cai no vão e a fase reinicia**. Se a câmera já está
girando para o ângulo certo, ele espera a ponte acender (até 2 s) em vez de cair;
os avisos dizem quantos giros e qual tecla (Q/E) usar. As placas são células da
grade (tipo 'ponte') e só existem para a caminhada com a câmera alinhada. Os dados
ficam em `pontes` do nível:

```js
pontes: [{ a: { x: 2, y: 0, z: 1 }, b: { x: 6, y: 0, z: 1 }, angulo: 1 }]
```

A ponte precisa ser reta (horizontal ou vertical).

### Controles de toque

No celular e no tablet (detectado pelo ponteiro de toque), o jogo mostra um **D-pad**
(▲ ▼ ◀ ▶) que usa as mesmas regras das setas do teclado; duas toques seguidos na
mesma direção sobre um bloco de pulo fazem o pulo. Gestos no canvas: **arraste
horizontal** gira a câmera em 90° (rápido), **pinça** com dois dedos dá zoom, e um
**toque curto** anda até o bloco tocado (se o toque não acertar um bloco, vai para o
mais próximo). Os botões Q/E e +/− continuam na tela. A lógica está em `src/toque.js`
(testada em `teste/toque.mjs`).

### Fases procedurais

Depois das fases manuais, o jogo não termina: `src/procedural.js` gera a fase
`n` a partir do próprio número. O mesmo `n` sempre dá o mesmo mapa, e cada mapa
é validado (piso e moedas alcançáveis) antes de ser usado. Há duas famílias de mapa:

* **labirinto**: labirinto perfeito com atalhos;
* **relevo**: mapa orgânico. Um ruído de Perlin com semente (`src/ruido.js`) define a
  altura das células (vazio, térreo ou um andar acima) e onde ficam as paredes.
* **ilhas em andares**: 3 ou mais ilhas (2 andares), ligadas por pontes de câmera,
  elevadores horizontais, passarelas que sobem um andar e **elevadores verticais**
  que levam do térreo ao andar de cima.

A dificuldade cresce
com `n`: mais ilhas, labirinto de até 13×13, menos atalhos e mais moedas (até 8).
O HUD mostra o total como `N/∞`.

## Estrutura do código

| Arquivo | O que faz |
|---|---|
| `src/main.js` | regras do jogo: construção da fase, movimentação, pulo, queda, moedas, conclusão e loop |
| `src/cena.js` | 3D: renderer, câmera isométrica, luzes e materiais |
| `src/hud.js` | textos do HUD, avisos, popup de moeda e tela de conclusão |
| `src/menu.js` | menu de fases (☰) |
| `src/som.js` | efeitos sonoros (WebAudio) e mudo salvo |
| `src/progresso.js` | moedas, fases concluídas, recordes e estrelas (salvos no navegador) |
| `src/par.js` | meta da fase: menor número de passos até todas as moedas, e as estrelas pela meta |
| `src/estado.js` | estado da partida compartilhado |
| `src/toque.js` | gestos de toque, D-pad e bloco mais próximo do toque |
| `src/dados/niveis.js` | dados das fases manuais (`NIVEIS`) |
| `src/dados/geradores.js` | labirinto, espiral e escada usados pelos geradores |
| `src/grade.js` | `Grade` (caminhada, elevadores e pontes), alcance e distâncias — lógica pura |
| `src/elevadores.js` | dados e movimentação dos elevadores |
| `src/moedas.js` | sorteio padronizado de moedas |
| `src/procedural.js` | fases infinitas determinísticas |
| `src/config.js` | `CONFIG` (ajustes finos) |
| `src/aleatorio.js` | RNG determinístico (semente) |
| `index.template.html` + `build.mjs` | template e build que geram `diorama-puzzle.html` (com o Three.js dentro) |
| `manifest.webmanifest`, `icone.svg` | app para celular (tela cheia e ícone ao adicionar à tela inicial) |

Ajustes finos ficam no objeto `CONFIG` (`src/config.js`): duração do passo,
altura do pulo e da ponte, suavidade do giro, margem de enquadramento etc.


## Testes (opcional)

Requer Node.js. `npm install` uma vez (instala o esbuild) e depois:

```bash
npm run build                # gera diorama-puzzle.html a partir de src/
npm test                     # roda todas as suítes abaixo (rápidas)
npm run test:e2e             # testes no navegador de verdade (Edge), celular e desktop
```

```bash
node validar.js              # sanidade dos dados das fases manuais
node teste/randomizacao.mjs  # sorteio de moedas: 120+300 sorteios por fase
node teste/elevadores.mjs    # embarque, travessia, desembarque e moedas do vão
node teste/pontes.mjs        # pontes de câmera: ângulo certo/errado e queda no vão
node teste/procedural.mjs    # 500 fases procedurais válidas e fluxo de jogo
node teste/toque.mjs        # gestos, D-pad e bloco mais próximo do toque
node teste/par.mjs         # meta da fase (passos até cada moeda), elevador, pulo e estrelas
node teste/progresso.mjs    # moedas por conclusão, migração, recordes, estrelas pelo par e som
node teste/fluxo.mjs        # moedas ao reiniciar, pontuação, menu, dicas e botão de som
node teste/estrutura.mjs    # título, manifest, sem CDN e elementos do HTML gerado
node teste/testar-jogo.mjs  # smoke test: bordas, sorteio, câmera, zoom, Q/E, progressão
```

Os testes de ponta a ponta (`e2e/jogo.spec.mjs`) abrem o HTML gerado no Microsoft Edge
(instalado no Windows; `channel: 'msedge'`): toque, arraste, pinça, D-pad, menu, som e
layout de celular. Para inspecionar o estado durante um teste, abra o jogo com `?debug`
na URL (expõe `window.__DIORAMA_DEBUG__`).

Os testes carregam `src/main.js` via esbuild (`teste/carregar-jogo.mjs`), com o
Three.js substituído por `teste/mock-three.mjs`.

`validar.js` confere conectividade (todas as moedas alcançáveis a partir do
spawn, nenhum bloco isolado, sem coordenadas duplicadas, apoio nas duas pontas
de cada elevador).
`testar-jogo.mjs` executa o módulo real do jogo com mocks de Three.js e do DOM
e verifica inicialização, giro de 90° da câmera, movimento por clique e teclado,
coleta de moedas, conclusão da fase, bloqueios, reinício e a progressão por
**todas** as fases (inclusive a volta para a Fase 1 depois da última).
Nas fases com vão, o teste atravessa de elevador de verdade (beirada → embarque
→ viagem → desembarque), então a conclusão não depende de sorteio.

## Requisitos técnicos atendidos

* Canvas único em 100% da tela; `OrthographicCamera` na elevação isométrica
  clássica (35,26°), cenário sempre centralizado.
* Luz direcional com *shadow maps* suaves + luz ambiente (visual cartoon).
* Giro do cenário em passos fixos de 90° com interpolação matemática.
* Movimento *grid-based* com raycast na face superior dos blocos, validação de
  adjacência na grade XYZ e coleta de moedas com animação.
* Fases 100% orientadas a dados (matriz de coordenadas) para escalar.
