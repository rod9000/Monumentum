/* Testes dos CONTROLES DE TOQUE.
   1) funções puras (src/toque.js): gestos, direção, bloco mais próximo, dispositivo.
   2) D-pad ligado ao jogo: anda e pula com as mesmas regras do teclado.
   Os gestos reais (dedos na tela) não rodam no Node: ficam para o celular. */
import { classificarGesto, fatorDePinca, direcaoDoMundo, maisProximoDoToque, ehDispositivoDeToque } from '../src/toque.js';
import { NIVEIS } from '../src/dados/niveis.js';
import { carregarJogo } from './carregar-jogo.mjs';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/* ---------- 1. funções puras ---------- */
console.log('--- gestos ---');
ok(classificarGesto({ dx: 3, dy: 2 }) === 'toque', 'deslocamento pequeno é toque (anda)');
ok(classificarGesto({ dx: 90, dy: 10, ms: 200 }) === 'arraste-h', 'arraste horizontal rápido gira a câmera');
ok(classificarGesto({ dx: 90, dy: 10, ms: 900 }) === 'arraste', 'arraste lento não gira (não é gesto de giro)');
ok(classificarGesto({ dx: 4, dy: 80, ms: 200 }) === 'arraste', 'arraste vertical não gira');
ok(classificarGesto({ dedos: 2, distIni: 100, distFim: 140 }) === 'pinca', 'dois dedos com distância variando é pinça');
ok(classificarGesto({ dedos: 2, distIni: 100, distFim: 102 }) === 'toque', 'dois dedos parados não é pinça');
ok(Math.abs(fatorDePinca(100, 150) - 1.5) < 1e-9, 'fator da pinça: 150 / 100 = 1,5');
ok(fatorDePinca(0, 50) === 1, 'fator da pinça sem distância anterior é 1');

console.log('--- direção (D-pad e teclado) ---');
// a conta antiga do teclado, para garantir que a função nova dá o mesmo resultado
const antigo = (dir, yaw) => {
  const frenteX = -Math.cos(yaw), frenteZ = -Math.sin(yaw);
  const dirX = Math.sin(yaw), dirZ = -Math.cos(yaw);
  const mx = dirX * dir[0] + frenteX * dir[1];
  const mz = dirZ * dir[0] + frenteZ * dir[1];
  const ix = Math.abs(mx) >= Math.abs(mz) ? Math.sign(mx) : 0;
  const iz = Math.abs(mx) >= Math.abs(mz) ? 0 : Math.sign(mz);
  return { ix, iz };
};
let iguais = true;
for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 3 * Math.PI / 2]) {
  for (const dir of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const a = antigo(dir, yaw), b = direcaoDoMundo(dir, yaw);
    if (a.ix !== b.ix || a.iz !== b.iz) iguais = false;
  }
}
ok(iguais, 'direção de tela -> grade igual à do teclado para todos os giros');
const sentidos = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(yaw => {
  const { ix, iz } = direcaoDoMundo([-1, 0], yaw);
  return Math.abs(ix) + Math.abs(iz);
});
ok(sentidos.every(n => n === 1), 'cada seta vira exatamente um passo na grade (eixo dominante)');

console.log('--- bloco mais próximo do toque ---');
const cands = [
  { sx: 100, sy: 100, bloco: 'A' },
  { sx: 130, sy: 100, bloco: 'B' },
  { sx: 300, sy: 300, bloco: 'C' }
];
ok(maisProximoDoToque(cands, 105, 104) === 'A', 'toque errado por pouco pega o bloco mais próximo');
ok(maisProximoDoToque(cands, 124, 100) === 'B', 'entre dois blocos, pega o mais perto');
ok(maisProximoDoToque(cands, 600, 600) === null, 'toque longe de tudo não pega bloco');

console.log('--- dispositivo de toque ---');
ok(ehDispositivoDeToque({ matchMedia: () => ({ matches: true }) }) === true, 'ponteiro grosso (dedo) é toque');
ok(ehDispositivoDeToque({ matchMedia: () => ({ matches: false }) }) === false, 'mouse não é toque');
ok(ehDispositivoDeToque({ ontouchstart: null }) === true, 'suporte a touch events conta como toque');
ok(ehDispositivoDeToque({}) === false, 'sem nada disso, não é toque');
ok(ehDispositivoDeToque(undefined) === false, 'sem janela (Node), não é toque');

/* ---------- 2. D-pad ligado ao jogo ---------- */
console.log('--- D-pad no jogo ---');
const elementos = new Map();
class El {
  constructor(id) { this.id = id; this.textContent = ''; this.style = {}; this._l = {}; this.children = []; this.classes = new Set(); }
  classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c) };
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  disparar(t, e = {}) { (this._l[t] || []).forEach(f => f(e)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 844 }; }
  appendChild(f) { this.children.push(f); return f; }
  removeChild(f) { return f; }
  remove() {}
}
globalThis.document = {
  getElementById: id => { if (!elementos.has(id)) elementos.set(id, new El(id)); return elementos.get(id); },
  createElement: () => new El('popup'),
  body: new El('body')
};
let raf = null;
globalThis.requestAnimationFrame = f => { raf = f; };
globalThis.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 1, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const mod = await carregarJogo(['grade', 'estado', 'carregarNivel', 'NIVEIS', 'indiceNivel']);
let agora = performance.now();
const frames = n => { for (let i = 0; i < n; i++) { agora += 16; const f = raf; raf = null; f(agora); } };
const apertar = id => elementos.get(id).disparar('click');

// fase de teste: um corredor no eixo Z (com a câmera em 0°, "esquerda" da tela é +Z)
mod.NIVEIS.push({ nome: 'Teste D-pad', moedas: 0, blocos: [
  { x: 0, y: 0, z: 0, tipo: 'spawn' }, { x: 0, y: 0, z: 1, tipo: 'chao' }, { x: 0, y: 0, z: 2, tipo: 'chao' }
] });
mod.carregarNivel(mod.NIVEIS.length - 1);
frames(3);
apertar('btn-dpad-esq');
frames(120);
ok(mod.estado.blocoAtual.z === 1, 'D-pad para a esquerda anda um passo (mesma seta do teclado)');

// fase com pulo: duas setas seguidas no bloco de pulo atravessam até o próximo
mod.NIVEIS.push({ nome: 'Teste pulo D-pad', moedas: 0, blocos: [
  { x: 0, y: 0, z: 0, tipo: 'pulo' }, { x: 0, y: 0, z: 2, tipo: 'pulo' }, { x: 0, y: 0, z: 3, tipo: 'chao' }
] });
mod.carregarNivel(mod.NIVEIS.length - 1);
frames(3);
apertar('btn-dpad-esq');
apertar('btn-dpad-esq');
frames(400);
ok(mod.estado.blocoAtual.z === 2, 'duas toques no D-pad sobre o bloco de pulo: pula até o próximo');

console.log(falhas === 0 ? '\n>>> TOQUE OK' : `\n>>> ${falhas} FALHA(S) EM TOQUE`);
process.exit(falhas === 0 ? 0 : 1);
