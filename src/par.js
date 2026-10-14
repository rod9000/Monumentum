/* ============================================================================
   PAR DA FASE — o menor número de passos para pegar TODAS as moedas.
   ----------------------------------------------------------------------------
   Conta do mesmo jeito que o contador 👣 do jogo:
   - cada passo para uma célula vizinha = 1 (inclusive entrar e sair do elevador,
     e cada placa de ponte);
   - um pulo (duas setas no bloco de pulo) = 1;
   - a viagem do elevador = 0 (o personagem é levado; só conta o embarque e o desembarque);
   - giros da câmera não contam (o par assume todas as pontes alinhadas).
   A ordem das moedas é a de menor total (programação dinâmica sobre os conjuntos).
   ============================================================================ */
import { chave, TIPOS_ANDAVEIS, ALCANCE_PULO } from './grade.js';

const DIRECOES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const LIMITE_DP = 14;        // acima disso usa a ordem gulosa (rápido, quase ótimo)

/** Estrelas pelo par. Com par 20: 3 estrelas com menos de 25 passos (até 24),
    2 estrelas de 25 a 30, 1 estrela acima de 30. Escala com o tamanho da fase. */
export function estrelasDoPar(passos, par) {
  if (par === null || par === undefined) return 1;
  if (passos < par * 1.25) return 3;
  if (passos <= par * 1.5) return 2;
  return 1;
}

/** Grafo de passos da fase, com as regras que o personagem segue. */
function montarGrafo(grade) {
  const nos = new Map();          // chave -> { x, y, z, tipo }
  const arestas = new Map();      // chave -> [[destino, custo]]
  const ligar = (a, b, custo) => {
    if (!arestas.has(a)) arestas.set(a, []);
    arestas.get(a).push([b, custo]);
  };

  // nós: células andáveis (as placas de ponte contam: o par assume as pontes alinhadas)
  for (const b of grade.lista) {
    if (b.tipo === 'parede') continue;
    const andavel = (TIPOS_ANDAVEIS.has(b.tipo) || b.tipo === 'ponte') && !grade.tem(b.x, b.y + 1, b.z);
    if (andavel) nos.set(chave(b.x, b.y, b.z), { x: b.x, y: b.y, z: b.z, tipo: b.tipo });
  }
  // o elevador leva até o ponto de destino: esse ponto também é um nó
  const elevadores = grade.lista.filter(b => b.elev);
  for (const e of elevadores) {
    const p = e.elev.para;
    const k = chave(p.x, p.y, p.z);
    if (!nos.has(k)) nos.set(k, { x: p.x, y: p.y, z: p.z, tipo: 'elevador' });
  }

  // passo: 1 célula na horizontal, subindo ou descendo no máximo 1 andar
  for (const [k, u] of nos) {
    for (const [dx, dz] of DIRECOES) {
      for (const dy of [0, 1, -1]) {
        const v = chave(u.x + dx, u.y + dy, u.z + dz);
        if (nos.has(v)) ligar(k, v, 1);
      }
    }
  }

  // pulo: do bloco de pulo até o próximo bloco de pulo na direção (custo 1)
  for (const [k, u] of nos) {
    if (u.tipo !== 'pulo') continue;
    for (const [dx, dz] of DIRECOES) {
      for (let s = 2; s <= ALCANCE_PULO; s++) {
        const alvo = grade.obter(u.x + dx * s, u.y, u.z + dz * s);
        if (alvo && alvo.tipo === 'pulo') {
          const v = chave(alvo.x, alvo.y, alvo.z);
          if (nos.has(v)) ligar(k, v, 1);
          break;
        }
      }
    }
  }

  // elevador: a viagem é de graça (custo 0), nos dois sentidos
  for (const e of elevadores) {
    const ini = e.elev.inicio || e;
    const a = chave(ini.x, ini.y, ini.z);
    const p = e.elev.para;
    const b = chave(p.x, p.y, p.z);
    if (nos.has(a) && nos.has(b)) { ligar(a, b, 0); ligar(b, a, 0); }
  }
  return { nos, arestas };
}

/** Menor custo de `origem` até cada nó alcançável (Dijkstra; o grafo da fase é pequeno). */
function distancias(grafo, origem) {
  const dist = new Map();
  if (!grafo.nos.has(origem)) return dist;
  dist.set(origem, 0);
  const aberto = new Set([origem]);
  const feitos = new Set();
  while (aberto.size) {
    let atual = null, melhor = Infinity;
    for (const k of aberto) {
      const d = dist.get(k);
      if (d < melhor) { melhor = d; atual = k; }
    }
    aberto.delete(atual);
    feitos.add(atual);
    for (const [v, custo] of grafo.arestas.get(atual) || []) {
      const novo = melhor + custo;
      if (novo < (dist.has(v) ? dist.get(v) : Infinity)) {
        dist.set(v, novo);
        if (!feitos.has(v)) aberto.add(v);
      }
    }
  }
  return dist;
}

/** Par da fase: o menor total de passos para pegar todas as moedas, a partir da
    partida, e a distância (em passos) até cada moeda saindo da partida.
    `par` é null se alguma moeda não puder ser alcançada. */
export function calcularPar(grade) {
  const partida = grade.lista.find(b => b.tipo === 'spawn') || grade.lista[0];
  const moedas = grade.lista.filter(b => b.tipo === 'moeda');
  if (!partida || !moedas.length) return { par: 0, passosPorMoeda: [] };

  const grafo = montarGrafo(grade);
  const chaveDe = b => chave(b.x, b.y, b.z);
  const daPartida = distancias(grafo, chaveDe(partida));
  const passosPorMoeda = moedas.map(m => daPartida.get(chaveDe(m)) ?? null);
  const dasMoedas = moedas.map(m => distancias(grafo, chaveDe(m)));
  const custoInicio = i => passosPorMoeda[i] ?? Infinity;
  const custoEntre = (i, j) => dasMoedas[i].get(chaveDe(moedas[j])) ?? Infinity;
  const k = moedas.length;
  let total;

  if (k <= LIMITE_DP) {
    // dp[conjunto][última moeda]: menor caminho que pega o conjunto e termina nessa moeda
    const cheio = 1 << k;
    const dp = Array.from({ length: cheio }, () => new Array(k).fill(Infinity));
    for (let i = 0; i < k; i++) dp[1 << i][i] = custoInicio(i);
    for (let m = 1; m < cheio; m++) {
      for (let i = 0; i < k; i++) {
        if (!(m & (1 << i)) || dp[m][i] === Infinity) continue;
        for (let j = 0; j < k; j++) {
          if (m & (1 << j)) continue;
          const nm = m | (1 << j);
          const c = dp[m][i] + custoEntre(i, j);
          if (c < dp[nm][j]) dp[nm][j] = c;
        }
      }
    }
    total = Math.min(...dp[cheio - 1]);
  } else {
    // muitas moedas: sempre a mais perto da posição atual
    const feitas = new Set();
    let atual = null;
    total = 0;
    for (let t = 0; t < k; t++) {
      let melhor = Infinity, escolhida = -1;
      for (let j = 0; j < k; j++) {
        if (feitas.has(j)) continue;
        const c = atual === null ? custoInicio(j) : custoEntre(atual, j);
        if (c < melhor) { melhor = c; escolhida = j; }
      }
      if (escolhida < 0 || melhor === Infinity) { total = Infinity; break; }
      total += melhor;
      feitas.add(escolhida);
      atual = escolhida;
    }
  }
  return { par: Number.isFinite(total) ? total : null, passosPorMoeda };
}
