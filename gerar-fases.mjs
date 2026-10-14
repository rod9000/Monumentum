/* ============================================================================
   GERADOR DE FASES — 14 fases: horizontais, verticais, labirintos e elevadores
   ----------------------------------------------------------------------------
   Constrói os arrays de blocos, VALIDA cada fase e escreve o JSON que o
   insersor usa para recompor o NIVEIS no HTML.

   Validação inclui elevadores: a plataforma é tratada como uma PONTE entre sua
   posição inicial e seu destino (o jogador embarca, espera e desembarca).

   Uso:  node gerar-fases.mjs && node inserir-fases.mjs
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/* ---------- mesma lógica do jogo ---------- */
const TIPOS_ANDAVEIS = new Set(['chao', 'moeda', 'spawn', 'elevador']);
const chave = (x, y, z) => `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
const HORIZONTAIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Grade {
  constructor(blocos) {
    this.lista = blocos;
    this.mapa = new Map();
    for (const b of blocos) this.mapa.set(chave(b.x, b.y, b.z), b);
  }
  obter(x, y, z) { return this.mapa.get(chave(x, y, z)) || null; }
  tem(x, y, z) { return this.mapa.has(chave(x, y, z)); }
  andavel(b) {
    if (!b || !TIPOS_ANDAVEIS.has(b.tipo)) return false;
    return !this.tem(b.x, b.y + 1, b.z);
  }
  podeMover(de, para) {
    if (!this.andavel(para)) return false;
    const dx = Math.abs(para.x - de.x);
    const dz = Math.abs(para.z - de.z);
    const dy = Math.abs(para.y - de.y);
    return dx + dz === 1 && dy <= 1;
  }
  vizinhos(b) {
    const v = [];
    for (const [dx, dz] of HORIZONTAIS) {
      for (const dy of [0, 1, -1]) {
        const alvo = this.obter(b.x + dx, b.y + dy, b.z + dz);
        if (this.podeMover(b, alvo)) v.push(alvo);
      }
    }
    return v;
  }
  /** BFS tratando elevadores como ponte entre início e destino. */
  alcancaveis(de) {
    const dist = new Map([[chave(de.x, de.y, de.z), 0]]);
    const nos = new Map();
    for (const b of this.lista) if (this.andavel(b)) nos.set(chave(b.x, b.y, b.z), b);
    const destinos = new Map();
    for (const b of this.lista) {
      if (b.elev) destinos.set(chave(b.elev.para.x, b.elev.para.y, b.elev.para.z), b);
    }
    const fila = [{ b: de, d: 0 }];
    while (fila.length) {
      const { b: atual, d } = fila.shift();
      const empurrar = (alvo) => {
        const k = chave(alvo.x, alvo.y, alvo.z);
        if (dist.has(k)) return;
        dist.set(k, d + 1);
        fila.push({ b: alvo, d: d + 1 });
      };
      for (const [dx, dz] of HORIZONTAIS) {
        for (const dy of [0, 1, -1]) {
          const viz = nos.get(chave(atual.x + dx, atual.y + dy, atual.z + dz));
          if (viz) empurrar(viz);                    // destino do elevador NÃO
        }                                            // é alcançável a pé
      }
      const elev = destinos.get(chave(atual.x, atual.y, atual.z));
      if (elev) empurrar(elev);                      // sobe no elevador
      if (atual.elev) {
        const k = chave(atual.elev.para.x, atual.elev.para.y, atual.elev.para.z);
        if (!dist.has(k)) {
          dist.set(k, d + 1);
          fila.push({ b: { x: atual.elev.para.x, y: atual.elev.para.y, z: atual.elev.para.z }, d: d + 1 });
        }
      }
    }
    return dist;
  }
  rota(de, para) {
    if (de === para || !this.andavel(para)) return null;
    const ant = new Map([[chave(de.x, de.y, de.z), null]]);
    const fila = [de];
    while (fila.length) {
      const a = fila.shift();
      if (a === para) {
        const c = []; let p = a;
        while (p) { c.unshift(p); p = ant.get(chave(p.x, p.y, p.z)); }
        return c.slice(1);
      }
      for (const v of this.vizinhos(a)) {
        const k = chave(v.x, v.y, v.z);
        if (!ant.has(k)) { ant.set(k, a); fila.push(v); }
      }
    }
    return null;
  }
}

/* ---------- validação ---------- */
function validar(nome, blocos) {
  const erros = [];
  const g = new Grade(blocos);
  const vistas = new Set();
  for (const b of blocos) {
    for (const c of ['x', 'y', 'z', 'tipo']) if (!(c in b)) erros.push(`bloco mal formado: ${JSON.stringify(b)}`);
    if (!TIPOS_ANDAVEIS.has(b.tipo) && b.tipo !== 'parede') erros.push(`tipo inválido: ${b.tipo}`);
    const k = chave(b.x, b.y, b.z);
    if (vistas.has(k)) erros.push(`coordenada duplicada ${k}`);
    vistas.add(k);
  }
  const spawn = blocos.find(b => b.tipo === 'spawn');
  const temElevador = blocos.some(b => b.elev);
  if (!spawn) erros.push('sem spawn');
  else {
    // blocos caminháveis isolados A PÉ (só é erro em fases sem elevador —
    // com elevador, ficar do outro lado do vão é justamente o objetivo)
    if (!temElevador) {
      for (const b of blocos) {
        if (g.andavel(b) && b !== spawn && !g.rota(spawn, b)) {
          erros.push(`bloco caminhável isolado em ${chave(b.x, b.y, b.z)}`);
        }
      }
    }
    // tudo alcançável considerando os elevadores
    const dist = g.alcancaveis(spawn);
    const inalcancaveis = blocos.filter(b => g.andavel(b) && b !== spawn && !dist.has(chave(b.x, b.y, b.z)));
    if (inalcancaveis.length) {
      erros.push(`inalcançáveis mesmo com elevador: ${inalcancaveis.map(b => chave(b.x, b.y, b.z)).join(' ')}`);
    }
    // elevadores: as duas pontas precisam encostar em algo caminhável
    for (const e of blocos.filter(b => b.elev)) {
      for (const [rot, cel] of [['início', { x: e.x, y: e.y, z: e.z }], ['destino', e.elev.para]]) {
        const vizinhos = HORIZONTAIS.flatMap(([dx, dz]) => [0, 1, -1].map(dy =>
          g.obter(cel.x + dx, cel.y + dy, cel.z + dz))).filter(v => g.andavel(v));
        if (!vizinhos.length) erros.push(`elevador sem apoio na ponta ${rot}`);
      }
    }
  }
  const contagem = {};
  for (const b of blocos) contagem[b.tipo] = (contagem[b.tipo] || 0) + 1;
  return { erros, contagem, tamanho: blocos.length };
}

/* ---------- utilidades de geração ---------- */
function rndSeed(v) {
  let a = v >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const embaralhar = (l, r) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } };

/** Remove células de um mapa plano até sobrar `lacunas`, sem nunca isolar blocos. */
function furar(grade, maxLacunas, rnd) {
  const candidatos = grade.lista.filter(b => b.tipo !== 'spawn');
  embaralhar(candidatos, rnd);
  let feitas = 0;
  for (const c of candidatos) {
    if (feitas >= maxLacunas) break;
    const backup = grade.lista.slice();
    grade.lista = grade.lista.filter(b => b !== c);
    grade.mapa = new Map(grade.lista.map(b => [chave(b.x, b.y, b.z), b]));
    const spawn = grade.lista.find(b => b.tipo === 'spawn');
    const ok = grade.lista.every(b => !grade.andavel(b) || b === spawn || grade.rota(spawn, b));
    if (ok) feitas++;
    else { grade.lista = backup; grade.mapa = new Map(grade.lista.map(b => [chave(b.x, b.y, b.z), b])); }
  }
  return grade.lista;
}

/* ============================================================================
   HELPERS DE LAYOUT
   ============================================================================ */

/** Labirinto perfeito (recursive backtracker) numa grade `lado x lado`.
 *  As salas ficam nas coordenadas ímpares; a borda é sempre parede.
 *  Devolve um Set com as chaves "x,z" das células que são PAREDE. */
function gerarLabirinto(lado, rnd, chanceAtalho = 0.2) {
  const salas = (lado - 1) / 2;
  const k = (x, z) => `${x},${z}`;
  const paredes = new Set();
  for (let x = 0; x < lado; x++) for (let z = 0; z < lado; z++) paredes.add(k(x, z));
  const visitadas = new Set([k(0, 0)]);
  paredes.delete(k(1, 1));
  const pilha = [[0, 0]];
  while (pilha.length) {
    const [cx, cz] = pilha[pilha.length - 1];
    const opcoes = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => [cx + dx, cz + dz])
      .filter(([nx, nz]) => nx >= 0 && nz >= 0 && nx < salas && nz < salas && !visitadas.has(k(nx, nz)));
    if (!opcoes.length) { pilha.pop(); continue; }
    const [nx, nz] = opcoes[Math.floor(rnd() * opcoes.length)];
    visitadas.add(k(nx, nz));
    paredes.delete(k(nx * 2 + 1, nz * 2 + 1));          // sala nova
    paredes.delete(k(cx + nx + 1, cz + nz + 1));        // parede entre as duas salas
    pilha.push([nx, nz]);
  }
  // atalhos: abre paredes internas para criar ciclos (labirinto com rotas alternativas)
  const internas = [...paredes].filter(s => {
    const [x, z] = s.split(',').map(Number);
    return x > 0 && z > 0 && x < lado - 1 && z < lado - 1;
  });
  embaralhar(internas, rnd);
  for (const s of internas) if (rnd() < chanceAtalho) paredes.delete(s);
  return paredes;
}

/** Células de uma espiral quadrada (anéis concêntricos, de fora para dentro),
 *  em ordem de visita: cada célula é adjacente à seguinte. Serve de rota para
 *  rampas/escadas em espiral. */
function gerarEspiral(lado) {
  const cel = [];
  let x0 = 0, z0 = 0, x1 = lado - 1, z1 = lado - 1;
  while (x0 <= x1 && z0 <= z1) {
    for (let x = x0; x <= x1; x++) cel.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) cel.push([x1, z]);
    for (let x = x1 - 1; x >= x0; x--) cel.push([x, z1]);
    for (let z = z1 - 1; z > z0; z--) cel.push([x0, z]);
    x0++; z0++; x1--; z1--;
  }
  return cel;
}

/** Escada reta: cada degrau sobe 1 em Y e anda 1 em Z (x fixo), sempre em
 *  coluna (x,z) distinta — um degrau NUNCA pode ficar acima de outro, porque
 *  a célula de cima tamparia a de baixo e ela deixaria de ser caminhável.
 *  Os vãos abaixo de cada degrau são preenchidos com 'parede' (e 'chao' no
 *  piso) até encostar em algo que já exista. */
function escadaReta(x0, z0, y0, passos, dz, existe) {
  const blocos = [];
  for (let i = 0; i < passos; i++) {
    const x = x0, y = y0 + i, z = z0 + dz * i;
    for (let k = y - 1; k >= 0 && !existe(x, k, z); k--) {
      blocos.push({ x, y: k, z, tipo: k === 0 ? 'chao' : 'parede' });
    }
    if (!existe(x, y, z)) blocos.push({ x, y, z, tipo: 'chao' });
  }
  return blocos;
}

/* ============================================================================
   FASE 2 — HORIZONTAL: "O Salão" (labirinto de paredes em 6x6)
   Paredes elevadas (y=1) sobre um piso, como na Fase 1.
   ============================================================================ */
const PAREDES_F2 = [[3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [1, 3], [3, 3], [4, 3], [1, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 1]];
const f2 = [];
for (let z = 0; z < 6; z++) {
  for (let x = 0; x < 6; x++) {
    const parede = PAREDES_F2.some(([px, pz]) => px === x && pz === z);
    if (parede) {
      f2.push({ x, y: 0, z, tipo: 'chao' });
      f2.push({ x, y: 1, z, tipo: 'parede' });
    } else {
      f2.push({ x, y: 0, z, tipo: x === 0 && z === 5 ? 'spawn' : 'chao' });
    }
  }
}
f2.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 3 — HORIZONTAL: "A Travessia" (7x5: paredes + pontes sobre o vazio)
   ============================================================================ */
const PAREDES_F3 = [[3, 0], [3, 2], [3, 4]];
const f3 = [];
for (let z = 0; z < 5; z++) {
  for (let x = 0; x < 7; x++) {
    const parede = PAREDES_F3.some(([px, pz]) => px === x && pz === z);
    f3.push({ x, y: 0, z, tipo: parede ? 'parede' : (x === 0 && z === 0 ? 'spawn' : 'chao') });
  }
}
{
  const g = new Grade(f3);
  const restantes = furar(g, 9, rndSeed(20240));   // seed só das LACUNAS (não das moedas)
  f3.length = 0; f3.push(...restantes);
}

/* ============================================================================
   FASE 4 — VERTICAL: "A Escada" (6x6, escada na borda leste + mirante)
   ============================================================================ */
const ELEVADOS_F4 = [
  [5, 1, 5], [5, 2, 4], [5, 3, 3], [5, 4, 2],
  [5, 4, 1], [4, 4, 1], [3, 4, 1]
];
const f4 = [];
for (let z = 0; z < 6; z++) for (let x = 0; x < 6; x++) f4.push({ x, y: 0, z, tipo: 'chao' });
const bloco4 = (x, y, z) => f4.find(b => b.x === x && b.y === y && b.z === z);
for (const [x, y, z] of ELEVADOS_F4) {
  for (let k = 0; k < y; k++) {
    const abaixo = bloco4(x, k, z);
    if (abaixo) abaixo.tipo = 'parede';
    else f4.push({ x, y: k, z, tipo: 'parede' });
  }
  const topo = bloco4(x, y, z);
  if (topo) topo.tipo = 'chao';
  else f4.push({ x, y, z, tipo: 'chao' });
}
bloco4(0, 0, 5).tipo = 'spawn';
f4.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 5 — VERTICAL: "O Zigurate" (pirâmide de 5 andares, 6x6)
   ============================================================================ */
const f5 = [];
for (let andar = 0; andar <= 4; andar++) {
  const lado = 6 - andar;
  for (let z = 0; z < lado; z++) {
    for (let x = 0; x < lado; x++) {
      const coberto = andar < 4 && (x < lado - 1 && z < lado - 1);
      const borda = x === lado - 1 || z === lado - 1;
      f5.push({ x, y: andar, z, tipo: coberto ? 'parede' : (borda ? 'chao' : 'parede') });
    }
  }
}
{
  const s = f5.find(b => b.x === 5 && b.y === 0 && b.z === 5);
  if (s) s.tipo = 'spawn';
}

/* ============================================================================
   FASE 6 — "DOIS MUNDOS" (elevador HORIZONTAL atravessando um vão)
   ----------------------------------------------------------------------------
   Duas ilhas separadas por um vão de 3 células. O elevador vaia entre as duas
   pontas: o jogador embarca, ESPERA a travessia e desembarca do outro lado.
   ============================================================================ */
const f6 = [];
for (let z = 0; z < 5; z++) for (let x = 0; x <= 3; x++) {          // mundo A
  f6.push({ x, y: 0, z, tipo: x === 0 && z === 4 ? 'spawn' : 'chao' });
}
for (let z = 0; z < 5; z++) for (let x = 7; x <= 8; x++) {          // mundo B
  f6.push({ x, y: 0, z, tipo: 'chao' });
}
f6.push({ x: 7, y: 1, z: 0, tipo: 'chao' }, { x: 8, y: 1, z: 0, tipo: 'chao' });  // terraço
f6.push({ x: 4, y: 0, z: 2, tipo: 'elevador', elev: { eixo: 'x', para: { x: 6, y: 0, z: 2 } } });

/* ============================================================================
   FASE 7 — "O POÇO" (elevador VERTICAL subindo até uma plataforma)
   ----------------------------------------------------------------------------
   O elevador sobe pela borda oeste da base. O jogador embarca por uma única
   célula (1,0,0), ESPERA a subida e desembarca no patamar de cima.
   O maciço que sustenta o patamar fica em z=1, longe do ponto de embarque.
   ============================================================================ */
const f7 = [];
for (let z = 0; z < 5; z++) {                                       // base 5x5
  for (let x = 0; x < 5; x++) {
    f7.push({ x, y: 0, z, tipo: x === 3 && z === 3 ? 'spawn' : 'chao' });
  }
}
// elevador vertical: sobe 3 células pela borda oeste
f7.push({ x: 0, y: 1, z: 0, tipo: 'elevador', elev: { eixo: 'y', para: { x: 0, y: 4, z: 0 } } });
// patamar de topo (3 células em y=4) + maciço de sustentação em z=1
for (const [x, z] of [[0, 1], [1, 1], [2, 1]]) {
  f7.push({ x, y: 4, z, tipo: 'chao' });
  for (let k = 1; k < 4; k++) f7.push({ x, y: k, z, tipo: 'parede' });
}
f7.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 8 — HORIZONTAL: "O LABIRINTO" (9x9 de paredes marrons em y=1)
   ----------------------------------------------------------------------------
   Labirinto de verdade (recursive backtracker com alguns atalhos), gerado com
   seed fixa. As moedas caem nos becos — o jogador precisa explorar.
   ============================================================================ */
const LADO_F8 = 9;
const paredesF8 = gerarLabirinto(LADO_F8, rndSeed(80808), 0.15);
const f8 = [];
for (let z = 0; z < LADO_F8; z++) {
  for (let x = 0; x < LADO_F8; x++) {
    const parede = paredesF8.has(`${x},${z}`);
    f8.push({ x, y: 0, z, tipo: (x === 1 && z === 1) ? 'spawn' : 'chao' });
    if (parede) f8.push({ x, y: 1, z, tipo: 'parede' });
  }
}
f8.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 9 — HORIZONTAL: "A PONTE ESTREITA" (ponte de 1 célula sobre o vazio)
   ----------------------------------------------------------------------------
   Duas ilhas ligadas por uma pinguela de UMA célula de largura, com becos sem
   saída nas laterais e uma elevação no meio (sobe 1, desce 1). Um passo em
   falso leva a um beco — e a moeda costuma ficar lá.
   ============================================================================ */
const f9 = [];
for (let z = 0; z < 3; z++) for (let x = 0; x < 4; x++) {           // ilha A
  f9.push({ x, y: 0, z, tipo: x === 0 && z === 1 ? 'spawn' : 'chao' });
}
const PONTE_F9 = [                                                 // 1 célula de largura
  [4, 0, 1], [5, 0, 1], [6, 0, 1], [7, 0, 1], [8, 0, 1],             // sobe...
  [9, 1, 1], [10, 1, 1], [11, 1, 1], [12, 1, 1],                     // ...e desce
  [13, 0, 1]
];
for (const [x, y, z] of PONTE_F9) f9.push({ x, y, z, tipo: 'chao' });
for (const [x, y, z] of [[6, 0, 0], [6, 0, 2], [10, 1, 0], [10, 1, 2]]) {
  f9.push({ x, y, z, tipo: 'chao' });                               // becos sem saída
}
for (let z = 0; z < 3; z++) for (let x = 14; x <= 16; x++) {        // ilha B
  f9.push({ x, y: 0, z, tipo: 'chao' });
}
f9.push({ x: 15, y: 1, z: 0, tipo: 'chao' }, { x: 16, y: 1, z: 0, tipo: 'chao' });  // terraço
f9.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 10 — VERTICAL: "A ESPIRAL" (rampa em espiral subindo 5 andares)
   ----------------------------------------------------------------------------
   A rota é uma espiral quadrada (anéis concêntricos); cada bloco da rota é
   um degrau e tudo abaixo dele é maciço de sustentação. Sobe 1 a cada ~11
   passos — o jogador contorna o diorama inteiro a cada andar.
   ============================================================================ */
const LADO_F10 = 7;
const rotaF10 = gerarEspiral(LADO_F10);
const f10 = [];
for (const [x, z] of rotaF10) {
  const i = rotaF10.findIndex(([rx, rz]) => rx === x && rz === z);
  const y = Math.min(4, Math.floor(i / 11));
  f10.push({ x, y, z, tipo: (x === 0 && z === 0) ? 'spawn' : 'chao' });
  for (let k = y - 1; k >= 0; k--) f10.push({ x, y: k, z, tipo: 'parede' });
}
f10.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 11 — ELEVADORES: "DOIS ELEVADORES" (duas travessias em sequência)
   ----------------------------------------------------------------------------
   Três ilhas e DOIS vãos. O jogador pega o elevador, espera, atravessa, pega
   o outro, espera de novo. A ponte a pé não existe em nenhum dos vãos.
   ============================================================================ */
const f11 = [];
for (let z = 0; z < 4; z++) for (let x = 0; x <= 3; x++) {          // ilha A
  f11.push({ x, y: 0, z, tipo: x === 0 && z === 0 ? 'spawn' : 'chao' });
}
for (let z = 0; z < 4; z++) for (let x = 7; x <= 10; x++) {         // ilha B (meio)
  f11.push({ x, y: 0, z, tipo: 'chao' });
}
for (let z = 0; z < 4; z++) for (let x = 14; x <= 16; x++) {        // ilha C (destino)
  f11.push({ x, y: 0, z, tipo: 'chao' });
}
f11.push({ x: 15, y: 1, z: 0, tipo: 'chao' }, { x: 16, y: 1, z: 0, tipo: 'chao' });
f11.push({ x: 4, y: 0, z: 1, tipo: 'elevador', elev: { eixo: 'x', para: { x: 6, y: 0, z: 1 } } });
f11.push({ x: 11, y: 0, z: 1, tipo: 'elevador', elev: { eixo: 'x', para: { x: 13, y: 0, z: 1 } } });
f11.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 12 — ELEVADOR + LABIRINTO: "O ELEVADOR SECRETO"
   ----------------------------------------------------------------------------
   O elevador sobe até um labirinto suspenso. Desembarcar é fácil; sair de
   dentro do labirinto (com as moedas nos becos) é que é o desafio.
   A coluna z=1 do labirinto é aberta à força para servir de entrada.
   ============================================================================ */
const LADO_F12 = 5;
const paredesF12 = gerarLabirinto(LADO_F12, rndSeed(121212), 0.25);
for (let x = 0; x < LADO_F12 - 1; x++) paredesF12.delete(`${x},0`);  // corredor de entrada
const f12 = [];
{
  const tem = (x, y, z) => f12.some(b => b.x === x && b.y === y && b.z === z);
  for (let z = 0; z <= LADO_F12; z++) {                             // base (z=0 é o pátio)
    for (let x = 0; x < LADO_F12; x++) {
      if (!tem(x, 0, z)) f12.push({ x, y: 0, z, tipo: (x === 1 && z === 0) ? 'spawn' : 'chao' });
    }
  }
  f12.push({ x: 0, y: 1, z: 0, tipo: 'elevador', elev: { eixo: 'y', para: { x: 0, y: 3, z: 0 } } });
  for (let zp = 0; zp < LADO_F12; zp++) {                           // labirinto em y=3
    for (let x = 0; x < LADO_F12; x++) {
      const z = zp + 1;                                             // deslocado 1 em z (como a Fase 7)
      f12.push({ x, y: 1, z, tipo: 'parede' }, { x, y: 2, z, tipo: 'parede' });  // maciço
      f12.push({ x, y: 3, z, tipo: 'chao' });
      if (paredesF12.has(`${x},${zp}`)) f12.push({ x, y: 4, z, tipo: 'parede' });
    }
  }
}

/* ============================================================================
   FASE 13 — ESCOLHA: "DUAS ROTAS" (elevador curto x escada longa)
   ----------------------------------------------------------------------------
   Dois caminhos para o mesmo terraço: o elevador (sobe 3 de uma vez, mas
   vaia e é preciso ESPERAR) e a escada pela borda leste (longa, porém sempre
   disponível). O jogador escolhe — e aprende a ler o estado do elevador.
   ============================================================================ */
const f13 = [];
{
  for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {          // base 8x8
    f13.push({ x, y: 0, z, tipo: (x === 1 && z === 0) ? 'spawn' : 'chao' });
  }
  const tem = (x, y, z) => f13.some(b => b.x === x && b.y === y && b.z === z);
  // elevador: sobe 3 pela borda oeste, coluna (0,0) livre até o destino
  f13.push({ x: 0, y: 1, z: 0, tipo: 'elevador', elev: { eixo: 'y', para: { x: 0, y: 4, z: 0 } } });
  // terraço em y=4: faixa z=5 (todo x) + coluna x=0 (z=1..4) — maciço abaixo
  const terraco = [];
  for (let x = 0; x < 8; x++) terraco.push([x, 5]);
  for (let z = 1; z <= 4; z++) terraco.push([0, z]);
  for (const [x, z] of terraco) {
    f13.push({ x, y: 4, z, tipo: 'chao' });
    for (let y = 1; y <= 3; y++) if (!tem(x, y, z)) f13.push({ x, y, z, tipo: 'parede' });
  }
  // passagem de serviço: o maciço tem um vão em (3,1,5) e (3,2,5) — por ele
  // se atravessa a base de z<5 para z>5 sem precisar subir no elevador
  f13.splice(0, f13.length, ...f13.filter(b => !(b.x === 3 && b.z === 5 && (b.y === 1 || b.y === 2))));
  // rota longa: escada pela borda leste (x=7), subindo 1 por passo em z
  f13.push(...escadaReta(7, 2, 1, 4, 1, tem));
}
f13.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   FASE 14 — VERTICAL: "O LABIRINTO VERTICAL" (dois labirintos + escada)
   ----------------------------------------------------------------------------
   Labirinto embaixo (y=0, paredes em y=1) e labirinto em cima (y=3, paredes
   em y=4), ligados por uma escada de 3 degraus no pátio. Achar a escada é
   metade do desafio.
   ============================================================================ */
const f14 = [];
{
  const LADO_A = 5;
  const paredesA = gerarLabirinto(LADO_A, rndSeed(141414), 0.2);
  for (const x of [1, 2, 3]) paredesA.delete(`${x},${LADO_A - 1}`);  // saída para o pátio
  const tem = (x, y, z) => f14.some(b => b.x === x && b.y === y && b.z === z);
  const push = b => { if (!tem(b.x, b.y, b.z)) f14.push(b); };
  for (let z = 0; z < LADO_A; z++) for (let x = 0; x < LADO_A; x++) {
    push({ x, y: 0, z, tipo: (x === 1 && z === 1) ? 'spawn' : 'chao' });
    if (paredesA.has(`${x},${z}`)) push({ x, y: 1, z, tipo: 'parede' });
  }
  for (let x = 0; x < LADO_A; x++) push({ x, y: 0, z: 5, tipo: 'chao' });   // pátio
  // escada de 3 degraus subindo em z (x=0), do pátio até y=3
  for (const b of escadaReta(0, 5, 1, 3, 1, tem)) push(b);
  // labirinto de cima em y=3 (deslocado 3 em z), com entrada forçada em z=8
  const LADO_B = 5;
  const paredesB = gerarLabirinto(LADO_B, rndSeed(141415), 0.2);
  for (const x of [0, 1, 2]) paredesB.delete(`${x},0`);
  for (let zp = 0; zp < LADO_B; zp++) for (let x = 0; x < LADO_B; x++) {
    const z = zp + 8;
    push({ x, y: 3, z, tipo: 'chao' });
    if (paredesB.has(`${x},${zp}`)) push({ x, y: 4, z, tipo: 'parede' });
    // maciço de sustentação até o chão
    for (let y = 2; y >= 0; y--) push({ x, y, z, tipo: y === 0 ? 'chao' : 'parede' });
  }
}

/* ============================================================================
   FASE 15 — FINAL: "O GRAND TOUR" (labirinto, ponte, elevador e escada)
   ----------------------------------------------------------------------------
   Uma única fase que usa tudo: entra num labirinto, atravessa uma pinguela
   com becos, pega um elevador horizontal para a ilha final e sobe a escada
   até o terraço das últimas moedas.
   ============================================================================ */
const f15 = [];
{
  const LADO = 5;
  const paredes = gerarLabirinto(LADO, rndSeed(151515), 0.15);
  for (const x of [1, 2, 3]) paredes.delete(`${x},${LADO - 1}`);   // saída do labirinto
  const tem = (x, y, z) => f15.some(b => b.x === x && b.y === y && b.z === z);
  const push = b => { if (!tem(b.x, b.y, b.z)) f15.push(b); };

  // --- setor 1: labirinto de entrada (x 0..4, z 0..4) ---
  for (let z = 0; z < LADO; z++) for (let x = 0; x < LADO; x++) {
    push({ x, y: 0, z, tipo: (x === 1 && z === 1) ? 'spawn' : 'chao' });
    if (paredes.has(`${x},${z}`)) push({ x, y: 1, z, tipo: 'parede' });
  }
  // --- setor 2: ponte de transição (z=5) ---
  for (let x = 0; x < LADO; x++) push({ x, y: 0, z: 5, tipo: 'chao' });

  // --- setor 3: pinguela estreita com becos (z=6..8), com uma elevação ---
  for (const [x, y, z] of [[2, 0, 6], [2, 0, 7], [2, 0, 8]]) push({ x, y, z, tipo: 'chao' });
  for (const [x, y, z] of [[2, 1, 6], [2, 1, 7], [2, 1, 8]]) push({ x, y, z, tipo: 'chao' });
  for (const [x, z] of [[1, 6], [3, 6], [1, 7], [3, 7]]) push({ x, y: 0, z, tipo: 'chao' });

  // --- setor 4: ilha A + vão + ilha B (z=9..11) ---
  for (let z = 9; z <= 11; z++) for (let x = 0; x <= 3; x++) push({ x, y: 0, z, tipo: 'chao' });
  push({ x: 4, y: 0, z: 10, tipo: 'elevador', elev: { eixo: 'x', para: { x: 6, y: 0, z: 10 } } });
  for (let z = 9; z <= 11; z++) for (let x = 7; x <= 9; x++) push({ x, y: 0, z, tipo: 'chao' });
  for (let x = 7; x <= 9; x++) push({ x, y: 0, z: 12, tipo: 'chao' });   // piso da escada

  // --- setor 5: escada final e terraço do topo (y=3) ---
  // a escada sobe por x=9 (longe do apoio (7,0,10) do elevador, que precisa
  // continuar livre para o desembarque)
  for (const b of escadaReta(9, 12, 1, 3, -1, tem)) push(b);
  push({ x: 8, y: 3, z: 10, tipo: 'chao' });                        // beirada do topo
  for (let y = 2; y >= 1; y--) push({ x: 8, y, z: 10, tipo: 'parede' });
}
f15.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   VALIDAÇÃO E IMPRESSÃO
   ============================================================================ */
const fases = [
  { nome: 'Fase 2 — O Salão', bloco: f2, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 3 — A Travessia', bloco: f3, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 4 — A Escada', bloco: f4, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 5 — O Zigurate', bloco: f5, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 6 — Dois Mundos', bloco: f6, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 7 — O Poço', bloco: f7, moedas: 3, distanciaMoedas: 2 },
  { nome: 'Fase 8 — O Labirinto', bloco: f8, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 9 — A Ponte Estreita', bloco: f9, moedas: 3, distanciaMoedas: 2 },
  { nome: 'Fase 10 — A Espiral', bloco: f10, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 11 — Dois Elevadores', bloco: f11, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 12 — O Elevador Secreto', bloco: f12, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 13 — Duas Rotas', bloco: f13, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 14 — O Labirinto Vertical', bloco: f14, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 15 — O Grand Tour', bloco: f15, moedas: 5, distanciaMoedas: 2 }
];

let falhas = 0;
for (const f of fases) {
  const r = validar(f.nome, f.bloco);
  console.log(`\n=== ${f.nome} — ${r.tamanho} blocos ${JSON.stringify(r.contagem)} ===`);
  if (r.erros.length) { falhas += r.erros.length; r.erros.slice(0, 10).forEach(e => console.log('  ✘ ' + e)); }
  else console.log('  ✔ válida (spawn alcança tudo, a pé ou de elevador)');
}

console.log('\n' + (falhas ? `>>> ${falhas} PROBLEMA(S)` : '>>> TODAS AS FASES VÁLIDAS'));

/* ---------- impressão: JSON (fonte da verdade para o insersor) ---------- */
const fasesJson = fases.map(f => ({
  nome: f.nome,
  moedas: f.moedas,
  distanciaMoedas: f.distanciaMoedas,
  blocos: f.bloco
}));

const destino = path.join(aqui, 'fases-geradas.json');
fs.writeFileSync(destino, JSON.stringify(fasesJson, null, 2) + '\n');
console.log(`\nArrays gerados em: ${path.relative(process.cwd(), destino)} (${fasesJson.length} fases)`);

// mapa ASCII de cada fase para conferência visual
for (const f of fases) {
  const g = new Grade(f.bloco);
  const minX = Math.min(...f.bloco.map(b => b.x)), maxX = Math.max(...f.bloco.map(b => b.x));
  const minZ = Math.min(...f.bloco.map(b => b.z)), maxZ = Math.max(...f.bloco.map(b => b.z));
  const minY = Math.min(...f.bloco.map(b => b.y)), maxY = Math.max(...f.bloco.map(b => b.y));
  console.log(`\n--- ${f.nome} (${maxX - minX + 1}x${maxZ - minZ + 1}, altura ${maxY - minY + 1}) ---`);
  for (let y = maxY; y >= minY; y--) {
    let linha = `  y=${y} `;
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const b = g.obter(x, y, z);
        const sim = !b ? '.' : b.tipo === 'parede' ? '##' : b.tipo === 'spawn' ? 'SP'
          : b.tipo === 'elevador' ? 'EL' : '[]';
        linha += sim + ' ';
      }
      linha += '| ';
    }
    console.log(linha);
  }
}

if (falhas) process.exit(1);
