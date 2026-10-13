/* ============================================================================
   GERADOR DE FASES — 2 horizontais + 2 verticais + 2 com elevador
   ----------------------------------------------------------------------------
   Constrói os arrays de blocos, VALIDA cada fase e imprime o JavaScript pronto
   para colar em NIVEIS.

   Validação inclui elevadores: a plataforma é tratada como uma PONTE entre sua
   posição inicial e seu destino (o jogador embarca, espera e desembarca).

   Uso:  node gerar-fases.mjs
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
   O elevador sobe por um poço aberto no meio da base. O jogador embarca no
   chão, ESPERA a subida e desembarca no patamar de cima.
   ============================================================================ */
const f7 = [];
for (let z = 0; z < 5; z++) {                                       // base 5x5
  for (let x = 0; x < 5; x++) {
    if (x === 2 && z === 2) continue;                               // vão do poço
    f7.push({ x, y: 0, z, tipo: x === 1 && z === 3 ? 'spawn' : 'chao' });
  }
}
f7.push({ x: 2, y: 1, z: 2, tipo: 'elevador', elev: { eixo: 'y', para: { x: 2, y: 4, z: 2 } } });
for (const [x, z] of [[1, 2], [3, 2], [2, 1], [2, 3]]) {            // patamar + maciço
  f7.push({ x, y: 4, z, tipo: 'chao' });
  for (let k = 1; k < 4; k++) f7.push({ x, y: k, z, tipo: 'parede' });
}
f7.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

/* ============================================================================
   VALIDAÇÃO E IMPRESSÃO
   ============================================================================ */
const fases = [
  { nome: 'Fase 2 — O Salão', bloco: f2, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 3 — A Travessia', bloco: f3, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 4 — A Escada', bloco: f4, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 5 — O Zigurate', bloco: f5, moedas: 4, distanciaMoedas: 2 },
  { nome: 'Fase 6 — Dois Mundos', bloco: f6, moedas: 3, distanciaMoedas: 3 },
  { nome: 'Fase 7 — O Poço', bloco: f7, moedas: 3, distanciaMoedas: 2 }
];

let falhas = 0;
for (const f of fases) {
  const r = validar(f.nome, f.bloco);
  console.log(`\n=== ${f.nome} — ${r.tamanho} blocos ${JSON.stringify(r.contagem)} ===`);
  if (r.erros.length) { falhas += r.erros.length; r.erros.slice(0, 10).forEach(e => console.log('  ✘ ' + e)); }
  else console.log('  ✔ válida (spawn alcança tudo, a pé ou de elevador)');
}

console.log('\n' + (falhas ? `>>> ${falhas} PROBLEMA(S)` : '>>> TODAS AS FASES VÁLIDAS'));

/* ---------- impressão do código para colar no HTML ---------- */
function imprimirBlocos(blocos, recuo = '      ') {
  const saida = [];
  let zAtual = null;
  for (const b of blocos) {
    if (b.z !== zAtual) { saida.push(`${recuo}/* ---- z = ${b.z} ---- */`); zAtual = b.z; }
    const extra = b.elev
      ? `,\n      elev: { eixo: '${b.elev.eixo}', para: { x: ${b.elev.para.x}, y: ${b.elev.para.y}, z: ${b.elev.para.z} } }`
      : '';
    saida.push(`${recuo}{ x: ${b.x}, y: ${b.y}, z: ${b.z}, tipo: '${b.tipo}'${extra} },`);
  }
  return saida.join('\n');
}

const partes = fases.map(f => {
  const extra = [
    `moedas: ${f.moedas}`,
    `distanciaMoedas: ${f.distanciaMoedas}`
  ].join(', ');
  return `    {
      nome: '${f.nome}',
      ${extra},
      blocos: [
${imprimirBlocos(f.bloco)}
      ]
    }`;
});

const destino = path.join(aqui, 'fases-geradas.txt');
fs.writeFileSync(destino, '\n' + partes.join(',\n\n') + '\n');
console.log(`\nArrays gerados em: ${path.relative(process.cwd(), destino)}`);

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
