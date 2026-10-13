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
* tipos: `'chao'`, `'parede'`, `'moeda'`, `'spawn'`
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

O gerador dessas fases (com validação de conectividade embutida) está em
`gerar-fases.mjs`: `node gerar-fases.mjs` valida e imprime os arrays prontos.

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

Requer Node.js. Duas suítes independentes:

```bash
node validar.js              # sintaxe do módulo + sanidade dos dados da fase
node teste/testar-jogo.mjs   # smoke test: roda o jogo com mock do THREE/DOM
```

`validar.js` confere conectividade (todas as moedas alcançáveis a partir do
spawn, nenhum bloco isolado, sem coordenadas duplicadas).
`testar-jogo.mjs` executa o módulo real do jogo com mocks de Three.js e do DOM
e verifica inicialização, giro de 90° da câmera, movimento por clique e teclado,
coleta de moedas, conclusão da fase, bloqueios e reinício.

## Requisitos técnicos atendidos

* Canvas único em 100% da tela; `OrthographicCamera` na elevação isométrica
  clássica (35,26°), cenário sempre centralizado.
* Luz direcional com *shadow maps* suaves + luz ambiente (visual cartoon).
* Giro do cenário em passos fixos de 90° com interpolação matemática.
* Movimento *grid-based* com raycast na face superior dos blocos, validação de
  adjacência na grade XYZ e coleta de moedas com animação.
* Fases 100% orientadas a dados (matriz de coordenadas) para escalar.
