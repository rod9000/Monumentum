# Diorama Puzzle — protótipo 3D (Three.js)

Protótipo de jogo de puzzle 3D em estilo **diorama** (Captain Toad / Mekorama),
rodando direto no navegador com **HTML + CSS + JavaScript vanilla** e
**Three.js via CDN**. Um único arquivo: [`diorama-puzzle.html`](./diorama-puzzle.html).

## Como jogar

Abra `diorama-puzzle.html` no navegador (duplo clique — não precisa de servidor;
a única exigência é conexão com a internet, por causa da CDN do Three.js).

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

## Criar a Fase 2 (e a 3, a 4…)

Toda a fase é **dados**. No arquivo `diorama-puzzle.html`, seção
**1) DADOS DAS FASES**, copie o objeto do nível e desenhe um novo array:

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
| 3 — A Travessia | horizontal 7×5 | pontes sobre o vazio (lacunas) |
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
| 15 — O Grand Tour | **final** | usa tudo: labirinto, pinguela, elevador horizontal e escada final até o terraço das últimas moedas |

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

O pipeline agora é `node gerar-fases.mjs` (valida + escreve
`fases-geradas.json`) seguido de `node inserir-fases.mjs` (recompõe o `NIVEIS`
no HTML, preservando a Fase 1). O JSON é a fonte da verdade das fases 2 a 15.

## Estrutura do código (tudo no mesmo arquivo)

| Seção | O que faz |
|---|---|
| 1) Dados das fases | matriz `{x, y, z, tipo}` — onde se criam novas fases |
| 2) Sistema de grade | `Grade`, `andavel()`, `podeMover()`, `rota()` |
| 3) Cena, câmera e luzes | `OrthographicCamera` isométrica, sombras, ambiente |
| 4) Construção do nível | dados → malhas 3D, base/plinto, enquadramento automático |
| 5) Personagem | esfera com olhos, giro e animação de passo |
| 6) Controle de câmera | órbita de 90° interpolada (independente de FPS) |
| 7) Movimentação | raycast, validação na grade, tween do passo |
| 8) Interface | HUD, avisos, tela de conclusão |
| 9) Loop principal | `requestAnimationFrame` |

Ajustes finos ficam no objeto `CONFIG` (duração do passo, altura do pulo,
suavidade do giro, margem de enquadramento, alerta nativo etc.).

## Testes (opcional)

Requer Node.js. Quatro suítes independentes:

```bash
node validar.js              # sintaxe do módulo + sanidade dos dados das 15 fases
node teste/randomizacao.mjs  # sorteio de moedas: 120+300 sorteios por fase
node teste/elevadores.mjs    # embarque, travessia, desembarque e moedas do vão
node teste/testar-jogo.mjs   # smoke test: bordas, sorteio, câmera, zoom, Q/E, progressão
```

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
