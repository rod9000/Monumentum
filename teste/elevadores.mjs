/* Teste de integração dos ELEVADORES.
   Executa o módulo real do jogo (mock de THREE + DOM) e verifica:
     - o elevador vaia entre as duas pontas e volta;
     - o personagem embarca só quando ele está parado;
     - é carregado junto durante a travessia (e não pode andar);
     - desembarca do outro lado / no topo;
     - o sorteio de moedas alcança o "outro lado" (ponte do elevador).      */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');

/* ---------- mock do DOM ---------- */
class El {
  constructor(id) {
    this.id = id; this.textContent = ''; this.style = {}; this._c = new Set(); this._l = {}; this.children = [];
    const s = this;
    this.classList = { add: (...x) => x.forEach(y => s._c.add(y)), remove: (...x) => x.forEach(y => s._c.delete(y)), contains: x => s._c.has(x) };
  }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  disparar(t, e = {}) { (this._l[t] || []).forEach(f => f(e)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  appendChild(filho) { this.children.push(filho); return filho; }
  removeChild(filho) { const i = this.children.indexOf(filho); if (i >= 0) this.children.splice(i, 1); return filho; }
  remove() { this.__removido = true; }
}
const elementos = new Map();
globalThis.document = {
  getElementById: id => { if (!elementos.has(id)) elementos.set(id, new El(id)); return elementos.get(id); },
  createElement: () => new El('popup'),
  body: new El('body')
};
let raf = null;
globalThis.requestAnimationFrame = f => { raf = f; };
globalThis.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {} };

const html = fs.readFileSync(path.join(raiz, 'diorama-puzzle.html'), 'utf8');
let codigo = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/import \* as THREE from 'three';/, "import * as THREE from './mock-three.mjs';")
  .replace('window.__DIORAMA_PRONTO__ = true;',
    `window.__DIORAMA_PRONTO__ = true;
     export { grade, estado, personagem, NIVEIS, carregarNivel, indiceNivel, CONFIG, canvas as canvasJogo };`);
fs.writeFileSync(path.join(aqui, 'jogo-teste.mjs'), codigo);

const mod = await import('./jogo-teste.mjs');
let agora = performance.now();
const frame = () => { agora += 16; const f = raf; raf = null; if (!f) throw new Error('raf sumiu'); f(agora); };
const frames = n => { for (let i = 0; i < n; i++) frame(); };
const esperarParar = (max = 1200) => { let n = 0; while (n++ < max && (mod.estado.passo || mod.estado.filа?.length || mod.estado.fila.length)) frame(); };
const irPara = b => { globalThis.__PROXIMO_BLOCO = b; mod.canvasJogo.disparar('click', { clientX: 640, clientY: 360 }); esperarParar(); };
const pos = b => `(${b.x},${b.y},${b.z})`;

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) falhas++; };

const nivel = (i) => mod.NIVEIS[i];
const indicePorNome = n => mod.NIVEIS.findIndex(f => f.nome.includes(n));
// mesma regra do jogo: está parado quando t é 0 ou 1 (ponta)
const elevadorParado = b => !!b.elev && (b.elev.t === 0 || b.elev.t === 1);

/* ================= FASE 6 — elevador HORIZONTAL ================= */
console.log('\n=== FASE 6 — ELEVADOR HORIZONTAL ===');
mod.carregarNivel(indicePorNome('Dois Mundos'));
frames(3);

const g6 = mod.grade;
const elev6 = g6.lista.find(b => b.elev);
ok(!!elev6 && elev6.elev.eixo === 'x', `elevador horizontal em ${pos(elev6)} -> ${pos(elev6.elev.para)}`);
ok(Math.abs(elev6.x - 4) < 1e-9, 'o elevador começa na ponta do mundo A (x=4)');

const embarque6 = g6.obter(3, 0, 2);          // beirada do mundo A
ok(!!embarque6 && mod.grade.podeMover(embarque6, elev6), 'dá para embarcar pela beirada do mundo A (3,0,2)');
const outroLado6 = g6.obter(7, 0, 2);          // beirada do mundo B
ok(mod.grade.rota(embarque6, outroLado6) === null, 'sem o elevador, NÃO dá para atravessar o vão a pé');

// embarca e viaja
irPara(elev6);
ok(mod.estado.blocoAtual === elev6, 'personagem subiu no elevador');
const xAntes = elev6.x;
frames(6);
ok(elev6.x > xAntes, `o elevador começou a andar (${xAntes.toFixed(2)} -> ${elev6.x.toFixed(2)})`);
ok(Math.abs(mod.personagem.position.x - elev6.x) < 1e-6, 'o personagem é carregado junto com a plataforma');

// enquanto viaja, não dá para andar
const avisoAntes = document.getElementById('aviso').textContent;
globalThis.__PROXIMO_BLOCO = g6.obter(0, 0, 0);
mod.canvasJogo.disparar('click', { clientX: 640, clientY: 360 });
esperarParar();
ok(mod.estado.blocoAtual === elev6, 'clicar durante a travessia não tira o personagem do elevador');
ok(document.getElementById('aviso').textContent.includes('elevador'), 'aparece o aviso "espera o elevador"');

// espera a travessia completa (3 células a 1,15/s + pausas)
let tentativas = 0;
while (!elevadorParado(elev6) && tentativas++ < 400) frame();
ok(elevadorParado(elev6) && Math.abs(elev6.x - 6) < 0.01,
   `o elevador chegou e PAROU na outra ponta (x = ${elev6.x.toFixed(2)})`);
ok(mod.estado.blocoAtual === elev6, 'o personagem continua no elevador, do outro lado');

// desembarca no mundo B
irPara(outroLado6);
ok(mod.estado.blocoAtual === outroLado6, 'desembarcou no mundo B (7,0,2)');

// e agora o mundo B é caminhável a pé
const longe6 = g6.obter(8, 0, 4);
ok(mod.grade.rota(outroLado6, longe6) && mod.grade.rota(outroLado6, longe6).length > 0,
   'do outro lado, já dá para andar a pé pelo mundo B');

/* ================= FASE 7 — elevador VERTICAL ================= */
console.log('\n=== FASE 7 — ELEVADOR VERTICAL ===');
mod.carregarNivel(indicePorNome('Poço'));
frames(3);

const g7 = mod.grade;
const elev7 = g7.lista.find(b => b.elev);
ok(!!elev7 && elev7.elev.eixo === 'y', `elevador vertical em ${pos(elev7)} -> ${pos(elev7.elev.para)}`);
ok(Math.abs(elev7.y - 1) < 1e-9, 'o elevador começa no nível de embarque (y=1)');

const embarque7 = g7.obter(1, 0, 0);          // célula ao lado do elevador
ok(mod.grade.podeMover(embarque7, elev7), 'dá para embarcar por (1,0,0) subindo 1 bloco');
const patamar7 = g7.obter(0, 4, 1);            // topo
ok(mod.grade.rota(embarque7, patamar7) === null, 'sem o elevador, o patamar de cima é inalcançável');

irPara(elev7);
ok(mod.estado.blocoAtual === elev7, 'personagem subiu no elevador vertical');
const yAntes = elev7.y;
frames(6);
ok(elev7.y > yAntes, `o elevador subiu (${yAntes.toFixed(2)} -> ${elev7.y.toFixed(2)})`);
ok(Math.abs(mod.personagem.position.y - (elev7.y + 0.82)) < 1e-6, 'o personagem sobe junto com a plataforma');

tentativas = 0;
while (!elevadorParado(elev7) && tentativas++ < 400) frame();
ok(elevadorParado(elev7) && Math.abs(elev7.y - 4) < 0.01,
   `o elevador chegou e PAROU no topo (y = ${elev7.y.toFixed(2)})`);

irPara(patamar7);
ok(mod.estado.blocoAtual === patamar7, 'desembarcou no patamar de cima (0,4,1)');
ok(Math.abs(mod.personagem.position.y - 4.82) < 1e-6, 'o personagem está no nível mais alto');

// o elevador volta sozinho (vaivém) para buscar o próximo
tentativas = 0;
while (!elevadorParado(elev7) || Math.abs(elev7.y - 1) > 0.01) { frame(); if (tentativas++ > 500) break; }
ok(Math.abs(elev7.y - 1) < 0.01, `depois de desembarcar, o elevador volta sozinho (y = ${elev7.y.toFixed(2)})`);

/* ================= SORTEIO DE MOEDAS DO OUTRO LADO ================= */
console.log('\n=== MOEDAS DO OUTRO LADO DO VÃO ===');
// O sorteio precisa considerar a ponte do elevador, senão as moedas nunca
// chegariam ao mundo B. Uma moeda é válida se dá para alcançá-la A PÉ do
// spawn (lado de cá) ou a pé do destino do elevador (lado de lá).
const chave = (x, y, z) => `${x}|${y}|${z}`;
function alcancaAPe(g, de, celula) {
  const alvo = chave(celula.x, celula.y, celula.z);
  const vistos = new Set([chave(de.x, de.y, de.z)]);
  const fila = [de];
  while (fila.length) {
    const a = fila.shift();
    if (chave(a.x, a.y, a.z) === alvo) return true;
    for (const v of g.vizinhos(a)) {
      const k = chave(v.x, v.y, v.z);
      if (!vistos.has(k)) { vistos.add(k); fila.push(v); }
    }
  }
  return false;
}

const viuOutroLado = new Set();
let invalidas = 0;
for (let i = 0; i < 60; i++) {
  mod.carregarNivel(indicePorNome('Dois Mundos'));
  frames(2);
  const g = mod.grade;
  const spawn = g.lista.find(b => b.tipo === 'spawn');
  const elev = g.lista.find(b => b.elev);
  for (const m of g.lista.filter(b => b.tipo === 'moeda')) {
    viuOutroLado.add(pos(m));
    const peloChao = alcancaAPe(g, spawn, m);
    const peloElevador = alcancaAPe(g, elev.elev.para, m);
    if (!peloChao && !peloElevador) invalidas++;
  }
}
const alemDoVao = [...viuOutroLado].filter(k => Number(k.split(/[(,)]+/)[1]) >= 7).length;
ok(invalidas === 0, `todas as moedas são alcançáveis (${invalidas} inválidas em 60 sorteios)`);
ok(alemDoVao > 0, `moedas também aparecem no mundo B (${alemDoVao} células em 60 sorteios)`);

// clicar numa moeda do outro lado deve mandar o personagem para o embarque
console.log('\n=== CLIQUE DO OUTRO LADO DO VÃO ===');
mod.carregarNivel(indicePorNome('Dois Mundos'));
frames(3);
{
  const g = mod.grade;
  const spawn = g.lista.find(b => b.tipo === 'spawn');
  const elev = g.lista.find(b => b.elev);
  // bloco caminhável do mundo B (a base do terraço tem bloco em cima: não serve)
  const doOutroLado = g.lista.find(b => b.x >= 7 && g.andavel(b) && b !== elev);
  ok(!!doOutroLado && g.rota(spawn, doOutroLado) === null, 'há blocos no mundo B sem rota a pé');

  globalThis.__PROXIMO_BLOCO = doOutroLado;
  mod.canvasJogo.disparar('click', { clientX: 640, clientY: 360 });
  // verifica NA HORA (antes dos frames), senão o aviso é substituído pelo
  // "elevador em movimento" e o elevador já mudou de ponta
  const avisoImediato = document.getElementById('aviso').textContent;
  // a rota inteira = passo atual + fila; o ÚLTIMO item é o destino final
  const rotaInteira = [...mod.estado.fila];
  if (mod.estado.passo) rotaInteira.unshift(mod.estado.passo.bloco);
  const beirada = g.lista.find(b => b.x === 3 && b.z === 2 && g.andavel(b));
  ok(rotaInteira.length > 1 && rotaInteira[rotaInteira.length - 1] === beirada,
     `clicar no mundo B traça uma rota até a beirada de embarque ${pos(beirada)}`);
  ok(avisoImediato.includes('elevador'), 'aparece o aviso de que só dá de elevador');
  esperarParar();
  ok(mod.estado.blocoAtual === beirada, 'o personagem chega na beirada do mundo A');
}

console.log('\n' + (falhas === 0 ? '>>> ELEVADORES OK' : `>>> ${falhas} FALHA(S)`));
process.exit(falhas === 0 ? 0 : 1);
