/* Teste da GERAÇÃO PROCEDURAL (fases infinitas).
   1) pura: 500 fases são válidas (piso e moedas alcançáveis), o mesmo n dá o
      mesmo mapa, nenhuma cai no fallback e a dificuldade cresce com n.
   2) integração: o jogo carrega a primeira fase procedural e a completa. */
import { gerarFase, parametros } from '../src/procedural.js';
import { Grade, alcancaveis, chave } from '../src/grade.js';
import { clonarBloco, iniciarElevador } from '../src/elevadores.js';
import { sortearMoedas } from '../src/moedas.js';
import { NIVEIS } from '../src/dados/niveis.js';
import { carregarJogo } from './carregar-jogo.mjs';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/* ---------- 1. regras puras ---------- */
console.log('--- geração pura (500 fases) ---');
const N = 500;
let invalidas = 0, sala = 0, semMoedasCertas = 0;
let comPulo = 0, comAndares = 0, ilhasComAndar = 0, ilhasSemAndar = 0, comPonte = 0, comElevadorVertical = 0, comElevadorHorizontal = 0, ilhas = 0, labirintos = 0;
const t0 = Date.now();
for (let n = 0; n < N; n++) {
  const f = gerarFase(n);
  if (f.origem === 'sala') sala++;
  if (f.origem === 'ilhas') ilhas++;
  if (f.origem === 'labirinto') labirintos++;
  if (f.blocos.some(b => b.y >= 2)) comAndares++;
  if (f.blocos.some(b => b.tipo === 'pulo')) comPulo++;
  if (f.origem === 'ilhas') {
    if (f.blocos.some(b => b.y >= 2)) ilhasComAndar++; else ilhasSemAndar++;
  }
  if (f.pontes.length) comPonte++;
  if (f.blocos.some(b => b.elev && b.elev.eixo === 'y')) comElevadorVertical++;
  if (f.blocos.some(b => b.elev && b.elev.eixo !== 'y')) comElevadorHorizontal++;
  // cópia como no jogo: elevadores com estado inicial e pontes no grade
  const g = new Grade(f.blocos.map(clonarBloco), f.pontes);
  for (const b of g.lista) iniciarElevador(b);
  g.pontesLivres = true;
  const spawn = g.lista.find(b => b.tipo === 'spawn');
  sortearMoedas(f, g);
  const moedas = g.lista.filter(b => b.tipo === 'moeda');
  if (moedas.length !== f.moedas) semMoedasCertas++;
  const dist = alcancaveis(g, spawn);
  const pisoIsolado = g.lista.some(b => g.andavel(b) && !dist.has(chave(b.x, b.y, b.z)));
  const moedaIsolada = moedas.some(m => !dist.has(chave(m.x, m.y, m.z)));
  if (!spawn || pisoIsolado || moedaIsolada) invalidas++;
}
console.log(`  (${N} fases em ${Date.now() - t0} ms)`);
ok(invalidas === 0, `todas as ${N} fases são válidas (piso e moedas alcançáveis)`);
ok(semMoedasCertas === 0, 'todas têm exatamente o número de moedas pedido');
ok(sala === 0, 'nenhuma caiu no fallback de sala aberta');
console.log(`  (labirintos: ${labirintos}, ilhas: ${ilhas}, com andares: ${comAndares}, com ponte: ${comPonte}, elevador vertical: ${comElevadorVertical}, elevador horizontal: ${comElevadorHorizontal})`);
ok(ilhas > 0 && labirintos > 0, 'as duas famílias aparecem (labirinto e ilhas)');
const fracao = ilhasComAndar / (ilhasComAndar + ilhasSemAndar);
ok(ilhasComAndar > 0 && ilhasSemAndar > 0, 'há ilhas com andar e ilhas sem andar');
ok(fracao > 0.35 && fracao < 0.65, `andar é sorteado por fase (${(fracao * 100).toFixed(0)}% das ilhas com andar)`);
ok(comElevadorVertical > 0, 'há elevadores verticais (trocar de andar)');
ok(comPulo > 0, 'há blocos de pulo (pares que voltam um ao outro)');
ok(comPonte > 0 && comElevadorHorizontal > 0, 'há pontes e elevadores horizontais');

const a = JSON.stringify(gerarFase(37));
const b = JSON.stringify(gerarFase(37));
ok(a === b, 'o mesmo n gera sempre o mesmo mapa');
ok(JSON.stringify(gerarFase(38)) !== a, 'n diferente gera mapa diferente');

const pequena = gerarFase(0).blocos.length;
const grande = gerarFase(60).blocos.length;
ok(grande > pequena, `a dificuldade cresce: ${pequena} blocos na fase 1, ${grande} na fase 61`);
ok(parametros(1000).lado === 13 && parametros(1000).moedas === 8, 'os parâmetros têm teto (mapa 13x13, 8 moedas)');
ok(parametros(0).atalhos > parametros(40).atalhos, 'menos atalhos com o tempo (mais difícil)');

/* ---------- 2. integração com o jogo ---------- */
console.log('--- integração com o jogo ---');
const elementos = new Map();
class El {
  constructor(id) { this.id = id; this.textContent = ''; this.style = {}; this._l = {}; this.children = []; }
  classList = { add: () => {}, remove: () => {}, contains: () => false };
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  disparar(t, e = {}) { (this._l[t] || []).forEach(f => f(e)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
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
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const mod = await carregarJogo(['grade', 'estado', 'carregarNivel', 'definirRota', 'indiceNivel', 'CONFIG']);
let agora = performance.now();
const frames = n => { for (let i = 0; i < n; i++) { agora += 16; const f = raf; raf = null; f(agora); } };

const indice = NIVEIS.length;                 // primeira fase procedural
mod.carregarNivel(indice);
frames(3);
const esperada = gerarFase(indice);
ok(mod.indiceNivel === indice, `carregou a fase procedural ${indice + 1}`);
ok(elementos.get('nome-fase').textContent.startsWith(esperada.nome), `HUD mostra "${esperada.nome}"`);
ok(elementos.get('nome-fase').textContent.includes('/∞'), 'HUD mostra o total como ∞');
ok(elementos.get('contador-moedas').textContent === `🪙 0/${esperada.moedas}`,
   `contador de moedas: 0/${esperada.moedas}`);

// completa uma fase de labirinto (só a pé): o jogo conclui sozinho ao pegar as moedas.
// Fases de ilhas exigem o elevador, que o clique resolve (celulaDeEmbarque) — coberto
// em teste/testar-jogo.mjs com as fases manuais.
mod.CONFIG.pontesSempreAtivas = true;
let indiceLabirinto = indice;
while (gerarFase(indiceLabirinto).origem !== 'labirinto') indiceLabirinto++;
mod.carregarNivel(indiceLabirinto);
frames(3);
for (let k = 0; k < 40 && !mod.estado.concluido; k++) {
  const g = mod.grade;
  const alvo = g.lista.find(b => b.tipo === 'moeda');
  if (!alvo) break;
  const rota = g.rota(mod.estado.blocoAtual, alvo);
  if (!rota) { ok(false, 'moeda sem rota na fase procedural'); break; }
  mod.estado.fila = [];
  mod.definirRota(rota);
  frames(rota.length * 20 + 20);
}
ok(mod.estado.concluido === true, 'a fase procedural (labirinto) é concluída coletando as moedas');
elementos.get('btn-proxima').disparar('click');
frames(3);
ok(mod.indiceNivel === indiceLabirinto + 1, 'próxima fase leva à procedural seguinte');

console.log(falhas === 0 ? '\n>>> PROCEDURAL OK' : `\n>>> ${falhas} FALHA(S) EM PROCEDURAL`);
process.exit(falhas === 0 ? 0 : 1);
