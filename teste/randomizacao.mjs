/* Verificação estatística da randomização das moedas.
   Roda dezenas de sorteios por fase e confere que:
     - sempre saem exatamente N moedas;
     - TODAS são alcançáveis a partir do spawn (nunca uma fase impossível);
     - as posições variam (não fica preso em um único resultado);
     - nenhuma moeda cai em buraco, parede ou bloco não caminhável.          */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarJogo } from './carregar-jogo.mjs';
import { alcancaveis } from '../src/grade.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');

/* ---------- mock do DOM (antes de importar o jogo) ---------- */
class El {
  constructor(id) {
    this.id = id; this.textContent = ''; this.style = {}; this._c = new Set(); this._l = {};
    const s = this;
    this.classList = { add: (...x) => x.forEach(y => s._c.add(y)), remove: (...x) => x.forEach(y => s._c.delete(y)), contains: x => s._c.has(x) };
  }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  disparar(t, e = {}) { (this._l[t] || []).forEach(f => f(e)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
}
const els = new Map();
globalThis.document = { getElementById: id => { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); } };
let raf = null;
globalThis.requestAnimationFrame = f => { raf = f; };
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };

const mod = await carregarJogo(['grade', 'estado', 'NIVEIS', 'carregarNivel', 'sortearMoedas', 'Grade', 'iniciarElevador', 'CONFIG']);
let agora = performance.now();
const frames = n => { for (let i = 0; i < n; i++) { agora += 16; const f = raf; raf = null; f(agora); } };

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

const SORTEIOS = 120;
const chave = (x, y, z) => `${x}|${y}|${z}`;

console.log(`\n=== RANDOMIZAÇÃO DAS MOEDAS (${SORTEIOS} sorteios por fase) ===`);

for (let i = 0; i < mod.NIVEIS.length; i++) {
  const nivel = mod.NIVEIS[i];
  const quantidade = nivel.moedas ?? 0;
  console.log(`\n--- ${nivel.nome} ---`);

  const combinacoes = new Set();
  const blocosSorteados = new Map();     // célula -> quantas vezes foi moeda
  let sempreAlcancaveis = true;
  let sempreQuantidadeCerta = true;
  let sempreEmBlocoValido = true;

  for (let n = 0; n < SORTEIOS; n++) {
    // Grade nova a partir dos dados da fase (mesma cópia que o jogo faz)
    const g = new mod.Grade(nivel.blocos.map(b => ({ ...b })), nivel.pontes);
    g.pontesLivres = true;                 // alcance: pontes contam como arestas
    // os elevadores precisam do estado inicial (t/para/inicio), como no jogo
    for (const b of g.lista) {
      if (b.elev) {
        b.elev = { ...b.elev, para: { ...b.elev.para } };
        mod.iniciarElevador(b);
      }
    }
    mod.sortearMoedas(nivel, g);

    const moedas = g.lista.filter(b => b.tipo === 'moeda');
    if (moedas.length !== quantidade) sempreQuantidadeCerta = false;

    const spawn = g.lista.find(b => b.tipo === 'spawn');
    // alcançabilidade: a MESMA função do validador (elevadores e pontes como arestas)
    const dist = alcancaveis(g, spawn);
    for (const m of moedas) {
      if (!dist.has(chave(m.x, m.y, m.z))) sempreAlcancaveis = false;
      if (!g.andavel(m)) sempreEmBlocoValido = false;      // buraco/parede/teto
      const k = chave(m.x, m.y, m.z);
      blocosSorteados.set(k, (blocosSorteados.get(k) || 0) + 1);
    }
    combinacoes.add(moedas.map(m => chave(m.x, m.y, m.z)).sort().join(' '));

    // nenhuma moeda pode nascer onde já existia moeda fixa indevida
    if (g.lista.some(b => b.tipo !== 'moeda' && b.moedaFixa)) sempreEmBlocoValido = false;
  }

  ok(sempreQuantidadeCerta, `sempre ${quantidade} moedas (nunca mais, nunca menos)`);
  ok(sempreAlcancaveis, 'todas as moedas sempre alcançáveis a partir do spawn');
  ok(sempreEmBlocoValido, 'nenhuma moeda em buraco, parede ou blco coberto');
  if (nivel.seed != null) {
    // fase com semente fixa: o sorteio é PARA SER o mesmo sempre
    ok(combinacoes.size === 1, `semente fixa (${nivel.seed}): mesmo sorteio em todas as partidas`);
  } else {
    ok(combinacoes.size > 1, `posições variam: ${combinacoes.size} combinações diferentes em ${SORTEIOS} sorteios`);
    ok(blocosSorteados.size >= Math.min(quantidade * 2, 8),
       `as moedas se espalham: ${blocosSorteados.size} blocos diferentes já receberam moeda`);
  }

  // distribuição: nenhum bloco deve dominar (sinal de viés)
  const contagens = [...blocosSorteados.values()].sort((a, b) => b - a);
  const maior = contagens[0], total = SORTEIOS * quantidade;
  const fatia = maior / total;
  ok(fatia < 0.34, `sem bloco "viciado": o mais frequente apareceu em ${(fatia * 100).toFixed(1)}% das moedas`);
}

console.log('\n=== FASE 3 EM DESTAQUE ===');
const f3 = mod.NIVEIS[2];
const candidatosF3 = f3.blocos.filter(b => b.tipo === 'chao' && b.y === 0).length;
console.log(`  Fase 3: ${f3.blocos.length} blocos, ${candidatosF3} candidatos a moeda, buracos no mapa`);
const posicoesF3 = new Set();
for (let n = 0; n < 300; n++) {
  const g = new mod.Grade(f3.blocos.map(b => ({ ...b })));
  for (const b of g.lista) if (b.elev) { b.elev = { ...b.elev, para: { ...b.elev.para } }; mod.iniciarElevador(b); }
  mod.sortearMoedas(f3, g);
  g.lista.filter(b => b.tipo === 'moeda').forEach(m => posicoesF3.add(chave(m.x, m.y, m.z)));
}
console.log(`  em 300 sorteios, as moedas apareceram em ${posicoesF3.size} células (semente fixa)`);
ok(posicoesF3.size === f3.moedas, 'a Fase 3 tem semente fixa: as mesmas moedas em todas as partidas');

console.log('\n' + (falhas === 0 ? '>>> RANDOMIZAÇÃO OK' : `>>> ${falhas} FALHA(S)`));
process.exit(falhas === 0 ? 0 : 1);
