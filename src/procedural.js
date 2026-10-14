/* ============================================================================
   GERAÇÃO PROCEDURAL — fases infinitas, determinísticas por número
   ----------------------------------------------------------------------------
   gerarFase(n) (n = índice da fase, 0-based) devolve SEMPRE o mesmo mapa para o
   mesmo n. Duas famílias de mapa, sorteadas pelo próprio n:

     - labirinto: labirinto perfeito com atalhos (gerarLabirinto);
     - ilhas: ilhas de piso ligadas por PONTES de câmera (ângulo sorteado),
       ELEVADORES e PASSARELAS que sobem um degrau; às vezes com paredes dentro
       das ilhas. É a mesma linguagem das fases manuais.

   Todo mapa é validado antes de ser entregue: todo piso caminhável e todas as
   moedas precisam ser alcançáveis a partir do spawn (pontes e elevadores contam
   como arestas). Se uma tentativa falhar, tenta a seguinte (outra semente); se
   todas falharem, cai numa sala aberta fixa (válida por construção).

   A dificuldade cresce com n: mais ilhas, mais moedas e labirintos maiores.
   ============================================================================ */
import { semente } from './aleatorio.js';
import { gerarLabirinto } from './dados/geradores.js';
import { Grade, alcancaveis, chave, alvoDoPulo } from './grade.js';
import { sortearMoedas } from './moedas.js';
import { clonarBloco, iniciarElevador } from './elevadores.js';
import { criarRuido } from './ruido.js';

const TENTATIVAS = 12;
const VAO = 3;                                       // células entre duas ilhas
const DIRECOES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Parâmetros da fase n: mais ilhas, labirinto maior e mais moedas com o tempo. */
export function parametros(n) {
  return {
    lado: Math.min(5 + 2 * Math.floor(n / 4), 13),      // ímpar: labirinto precisa
    atalhos: Math.max(0.05, 0.3 - n * 0.01),
    ilhas: Math.min(3 + Math.floor(n / 3), 9),
    moedas: Math.min(2 + Math.floor(n / 5), 8)
  };
}

/** Labirinto: chão em toda a grade e parede elevada (y=1) nas células de parede. */
function montarLabirinto(p, rnd) {
  const paredes = gerarLabirinto(p.lado, rnd, p.atalhos);
  const blocos = [];
  for (let x = 0; x < p.lado; x++) {
    for (let z = 0; z < p.lado; z++) {
      blocos.push({ x, y: 0, z, tipo: 'chao' });
      if (paredes.has(`${x},${z}`)) blocos.push({ x, y: 1, z, tipo: 'parede' });
    }
  }
  // a célula (1,1) é sempre sala aberta no labirinto (ver gerarLabirinto)
  blocos.find(b => b.x === 1 && b.y === 0 && b.z === 1).tipo = 'spawn';
  return { blocos, pontes: [] };
}

/** Ilhas em grade, em andares (0 e 2). Ligações: ponte, elevador horizontal ou
    passarela (sobe 1 andar); e o andar de cima ligado por ELEVADOR VERTICAL que
    sai de uma célula do térreo. O espaço entre os andares fica livre, então o
    térreo continua andável. */
function montarIlhas(p, rnd) {
  const S = rnd() < 0.5 ? 3 : 4;                       // lado da ilha
  // sorteio independente por fase: com andares (um andar de cima, e passarelas) ou tudo no térreo
  const comAndares = rnd() < 0.5;
  const passo = S + VAO;
  const ilhas = [{ i: 0, j: 0, y: 0 }];
  const colunas = new Set(['0,0']);                     // (i,j) ocupados no plano
  const andares = new Set(['0,0,0']);                   // (i,j,y) ocupados
  const ligacoes = [];                                  // { a, b, dir } horizontais
  const verticais = [];                                 // { a, b } andar de cima
  const ligadas = new Set();

  while (ilhas.length < p.ilhas) {
    const ia = Math.floor(rnd() * ilhas.length);
    const A = ilhas[ia];
    // com andares, ao menos um andar de cima (senão a fase sairia sem andar)
    const precisaAndar = comAndares && verticais.length === 0 && ilhas.length === p.ilhas - 1;
    if (comAndares && A.y === 0 && (precisaAndar || rnd() < 0.3) && !andares.has(`${A.i},${A.j},2`)) {
      ilhas.push({ i: A.i, j: A.j, y: 2 });             // andar de cima: mesma coluna
      andares.add(`${A.i},${A.j},2`);
      verticais.push({ a: ia, b: ilhas.length - 1 });
      continue;
    }
    const dir = DIRECOES[Math.floor(rnd() * 4)];
    const i = A.i + dir[0], j = A.j + dir[1];
    if (colunas.has(`${i},${j}`)) continue;
    colunas.add(`${i},${j}`);
    const y = comAndares && A.y === 0 && rnd() < 0.3 ? 1 : A.y;   // passarela sobe 1 andar
    ilhas.push({ i, j, y });
    andares.add(`${i},${j},${y}`);
    const b = ilhas.length - 1;
    ligacoes.push({ a: ia, b, dir });
    ligadas.add(`${Math.min(ia, b)}-${Math.max(ia, b)}`);
  }
  // laços extras entre ilhas vizinhas do mesmo andar: rotas alternativas
  for (let a = 0; a < ilhas.length; a++) {
    for (let b = a + 1; b < ilhas.length; b++) {
      const di = ilhas[b].i - ilhas[a].i, dj = ilhas[b].j - ilhas[a].j;
      if (Math.abs(di) + Math.abs(dj) !== 1) continue;
      if (ligadas.has(`${a}-${b}`) || ilhas[a].y !== ilhas[b].y) continue;
      if (rnd() < 0.25) ligacoes.push({ a, b, dir: [di, dj], pulo: rnd() < 0.5 });
    }
  }

  // poços dos elevadores verticais: célula do térreo (nunca a da partida)
  const poços = new Map();                               // "x,z" -> { x, z }
  for (const v of verticais) {
    const T = ilhas[v.a];
    const cx = Math.floor(rnd() * S), cz = Math.floor(rnd() * S);
    const x = T.i * passo + cx, z = T.j * passo + cz;
    if (x === 0 && z === 0) { v.poço = null; continue; }
    poços.set(`${x},${z}`, { x, z });
    v.poço = { x, z };
  }
  const poçoEm = (x, y, z) => y === 0 && poços.has(`${x},${z}`);

  // fileira de cada ligação (nunca sobre um poço); nos pares de pulo, as duas células de pulo
  const pulos = new Set();
  for (const l of ligacoes) {
    const A = ilhas[l.a], B = ilhas[l.b];
    const eixoX = l.dir[0] !== 0;
    const d = eixoX ? l.dir[0] : l.dir[1];
    const oxA = A.i * passo, ozA = A.j * passo;
    const borda = eixoX ? (d > 0 ? oxA + S - 1 : oxA) : (d > 0 ? ozA + S - 1 : ozA);
    let off = 0, x1 = 0, z1 = 0, bx = 0, bz = 0;
    for (let t = 0; t < 20; t++) {
      off = Math.floor(rnd() * S);
      x1 = eixoX ? borda : oxA + off; z1 = eixoX ? ozA + off : borda;
      bx = eixoX ? borda + d * (VAO + 1) : oxA + off;
      bz = eixoX ? ozA + off : borda + d * (VAO + 1);
      if (!poçoEm(x1, A.y, z1) && !poçoEm(bx, B.y, bz)) break;
    }
    Object.assign(l, { eixoX, d, borda, off });
    if (l.pulo) { pulos.add(chave(x1, A.y, z1)); pulos.add(chave(bx, B.y, bz)); }
  }

  const blocos = [];
  const chaves = new Set();
  const poe = (bloco) => {
    const k = chave(bloco.x, bloco.y, bloco.z);
    if (chaves.has(k)) return;
    chaves.add(k);
    blocos.push(bloco);
  };
  const pontes = [];

  // ilhas: piso (com o poço no térreo), paredes internas
  for (const ilha of ilhas) {
    const ox = ilha.i * passo, oz = ilha.j * passo;
    for (let x = ox; x < ox + S; x++) {
      for (let z = oz; z < oz + S; z++) {
        const partida = x === 0 && z === 0 && ilha.y === 0;
        if (poçoEm(x, ilha.y, z)) {
          poe({ x, y: 0, z, tipo: 'elevador', elev: { eixo: 'y', para: { x, y: 2, z } } });
          continue;
        }
        poe({ x, y: ilha.y, z, tipo: partida ? 'spawn' : pulos.has(chave(x, ilha.y, z)) ? 'pulo' : 'chao' });
        if (ilha.y === 1) poe({ x, y: 0, z, tipo: 'parede' });   // suporte da ilha elevada
        const interna = x > ox && x < ox + S - 1 && z > oz && z < oz + S - 1;
        if (interna && !partida && !poçoEm(x, ilha.y + 1, z) && rnd() < 0.2) {
          poe({ x, y: ilha.y + 1, z, tipo: 'parede' });
        }
      }
    }
  }

  // ligações horizontais: a borda de A e a de B ficam na mesma fileira
  for (const l of ligacoes) {
    if (l.pulo) continue;                                // par de pulo: já montado acima
    const A = ilhas[l.a], B = ilhas[l.b];
    const { eixoX, d, borda, off } = l;
    const linha = { p: eixoX ? A.j * passo + off : A.i * passo + off };
    const pos = c => eixoX ? { x: c, z: linha.p } : { x: linha.p, z: c };
    const tipo = rnd();

    if (A.y !== B.y) {                                   // passarela: sobe um andar
      for (let k = 1; k <= VAO; k++) {
        const c = pos(borda + d * k);
        poe({ x: c.x, y: A.y, z: c.z, tipo: 'parede' });           // suporte
        poe({ x: c.x, y: B.y, z: c.z, tipo: 'chao' });             // passarela
      }
    } else if (tipo < 0.4) {                             // ponte: vão sem blocos
      pontes.push({
        a: { ...pos(borda), y: A.y },
        b: { ...pos(borda + d * (VAO + 1)), y: B.y },
        angulo: Math.floor(rnd() * 4)
      });
    } else {                                             // elevador na 1ª célula do vão
      const c = pos(borda + d);
      poe({
        x: c.x, y: A.y, z: c.z, tipo: 'elevador',
        elev: { eixo: eixoX ? 'x' : 'z', para: { ...pos(borda + d * VAO), y: A.y } }
      });
    }
  }

  return { blocos, pontes };
}

/** Valida: spawn, piso caminhável e moedas todos alcançáveis (pontes e elevadores
    contam como arestas) e nenhuma coordenada repetida. */
export function validaFase(fase) {
  // cópia como no jogo: os elevadores ganham o estado inicial (inicio, t, para)
  const g = new Grade(fase.blocos.map(clonarBloco), fase.pontes);
  for (const b of g.lista) iniciarElevador(b);
  g.pontesLivres = true;                               // alcance: pontes são arestas
  const spawn = g.lista.find(b => b.tipo === 'spawn');
  if (!spawn) return false;
  const vistas = new Set(fase.blocos.map(b => chave(b.x, b.y, b.z)));
  if (vistas.size !== fase.blocos.length) return false;
  sortearMoedas(fase, g);
  const moedas = g.lista.filter(b => b.tipo === 'moeda');
  if (moedas.length !== fase.moedas) return false;
  const dist = alcancaveis(g, spawn);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // cada bloco de pulo precisa de outro que, pulando de volta, retorna a ele
  for (const pb of g.lista.filter(b => b.tipo === 'pulo')) {
    const volta = DIRS.some(([ix, iz]) => {
      const t = alvoDoPulo(g, pb, ix, iz);
      return t && DIRS.some(([jx, jz]) => alvoDoPulo(g, t, jx, jz) === pb);
    });
    if (!volta) return false;
  }
  return g.lista.every(b => !g.andavel(b) || dist.has(chave(b.x, b.y, b.z)));
}

/** Relevo orgânico: o ruído define a altura de cada célula (vazio, térreo ou um
    andar acima) e onde há paredes. A altura muda no máximo 1 andar entre vizinhos,
    então dá para andar por toda parte. A validação confere o resto. */
export function montarRelevo(n, rnd) {
  const G = Math.min(7 + Math.floor(n / 5), 11);      // lado da grade de células
  const altura = criarRuido(Math.floor(rnd() * 1e9));
  const paredes = criarRuido(Math.floor(rnd() * 1e9));
  const nivel = [];
  for (let x = 0; x < G; x++) {
    nivel.push([]);
    for (let z = 0; z < G; z++) {
      const v = altura(x * 0.45, z * 0.45);
      nivel[x].push(v < 0.38 ? null : v < 0.58 ? 0 : 1);   // null = vazio
    }
  }
  // partida: célula de térreo mais perto do centro (sem parede, decidido abaixo)
  const c = (G - 1) / 2;
  let spawn = null, melhor = Infinity;
  for (let x = 0; x < G; x++) {
    for (let z = 0; z < G; z++) {
      if (nivel[x][z] !== 0) continue;
      const d = Math.abs(x - c) + Math.abs(z - c);
      if (d < melhor) { melhor = d; spawn = { x, z }; }
    }
  }
  const blocos = [];
  if (!spawn) return { blocos, pontes: [] };
  for (let x = 0; x < G; x++) {
    for (let z = 0; z < G; z++) {
      const L = nivel[x][z];
      if (L === null) continue;
      const eSpawn = x === spawn.x && z === spawn.z;
      blocos.push({ x, y: L, z, tipo: eSpawn ? 'spawn' : 'chao' });
      if (L === 1) blocos.push({ x, y: 0, z, tipo: 'parede' });        // sustento do andar de cima
      if (!eSpawn && paredes(x * 0.9, z * 0.9) > 0.68) blocos.push({ x, y: L + 1, z, tipo: 'parede' });
    }
  }
  return { blocos, pontes: [] };
}

/** Sala aberta 5x5: último recurso, válida por construção. */
function salaAberta(n) {
  const blocos = [];
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) blocos.push({ x, y: 0, z, tipo: 'chao' });
  blocos[0].tipo = 'spawn';
  return { nome: `Fase ${n + 1}`, moedas: 2, distanciaMoedas: 2, seed: n + 1, origem: 'sala', blocos, pontes: [] };
}

/** Gera a fase n (0-based). Mesmo n, mesmo resultado. */
export function gerarFase(n) {
  const p = parametros(n);
  for (let t = 0; t < TENTATIVAS; t++) {
    const rnd = semente(((n + 1) * 2654435761 + t * 40503) >>> 0);
    const sorteio = rnd();
    const familia = sorteio < 0.25 ? 'labirinto' : sorteio < 0.6 ? 'ilhas' : 'relevo';
    const mapa = familia === 'labirinto' ? montarLabirinto(p, rnd)
      : familia === 'ilhas' ? montarIlhas(p, rnd)
      : montarRelevo(n, rnd);
    const fase = {
      nome: `Fase ${n + 1}`,
      moedas: p.moedas,
      distanciaMoedas: 2,
      seed: ((n + 1) * 1009 + t) >>> 0,        // semente do sorteio de moedas
      origem: familia,
      blocos: mapa.blocos,
      pontes: mapa.pontes
    };
    if (validaFase(fase)) return fase;
  }
  return salaAberta(n);
}
