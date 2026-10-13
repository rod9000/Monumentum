/* Smoke test: executa o módulo real do jogo (com mock do THREE + DOM)
   e verifica bordas, sorteio de moedas, movimento, câmera, zoom e fim de fase.

   ATENÇÃO: `grade` é reatribuído a cada carregamento de fase, por isso o teste
   acessa `mod.grade` sempre atual (um destructuring de `await import()` tiraria
   uma "foto" do valor e olharíamos a grade antiga). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(aqui, '..');

/* ---------- 1. mock do DOM (precisa existir ANTES de importar o jogo) ---------- */
class El {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.style = {};
    this._classes = new Set();
    this._l = {};
    this.__el = true;
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => self._classes.add(x)),
      remove: (...c) => c.forEach(x => self._classes.delete(x)),
      contains: c => self._classes.has(c)
    };
  }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  disparar(t, e = {}) { (this._l[t] || []).forEach(f => f(e)); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
}

const elementos = new Map();
globalThis.document = { getElementById: id => {
  if (!elementos.has(id)) elementos.set(id, new El(id));
  return elementos.get(id);
} };

let ultimoRaf = null;
globalThis.requestAnimationFrame = f => { ultimoRaf = f; };

const listenersJanela = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  addEventListener: (t, f) => { (listenersJanela[t] = listenersJanela[t] || []).push(f); }
};

let agora = performance.now();
function frame() {
  agora += 16;
  const f = ultimoRaf;
  if (!f) throw new Error('requestAnimationFrame não foi chamado pelo jogo');
  ultimoRaf = null;
  f(agora);
}
function frames(n) { for (let i = 0; i < n; i++) frame(); }
function esperarParar(maxFrames = 900) {
  let n = 0;
  while (n++ < maxFrames && (mod.estado.passo || mod.estado.fila.length)) frame();
  return n - 1;
}

/* ---------- 2. extrai o módulo do HTML e aponta o THREE para o mock ---------- */
const html = fs.readFileSync(path.join(raiz, 'diorama-puzzle.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('módulo não encontrado no HTML'); process.exit(1); }

let codigo = m[1].replace(
  /import \* as THREE from 'three';/,
  "import * as THREE from './mock-three.mjs';"
);
if (codigo === m[1]) { console.error('não foi possível substituir o import do THREE'); process.exit(1); }

// expõe o estado interno para o teste (apenas no arquivo gerado)
codigo = codigo.replace(
  'window.__DIORAMA_PRONTO__ = true;',
  `window.__DIORAMA_PRONTO__ = true;
   export { personagem, camera, grade, estado, alvoCentro, coletadas, totalMoedas, CONFIG, NIVEIS, indiceNivel, carregarNivel, canvas as canvasJogo };`
);
fs.writeFileSync(path.join(aqui, 'jogo-teste.mjs'), codigo);

/* ---------- 3. importa o jogo ---------- */
const mod = await import('./jogo-teste.mjs');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) falhas++; };

// atalhos (bindings vivos via mod.<nome>)
const grade = () => mod.grade;
const estado = () => mod.estado;
const CONFIG = mod.CONFIG;
const personagem = mod.personagem;     // referência estável
const camera = mod.camera;             // referência estável
const alvoCentro = mod.alvoCentro;     // referência estável
const canvasJogo = mod.canvasJogo;     // referência estável

const emCimaDe = b => Math.abs(personagem.position.x - b.x) < 1e-6 &&
                      Math.abs(personagem.position.z - b.z) < 1e-6 &&
                      Math.abs(personagem.position.y - (b.y + 0.5 + 0.30 + 0.02)) < 1e-6;
const spawnAtual = () => grade().lista.find(b => b.tipo === 'spawn');
const blocoEm = (x, y, z) => grade().obter(x, y, z);
const moedasAtuais = () => grade().lista.filter(b => b.tipo === 'moeda');
const posicao = b => `(${b.x},${b.y},${b.z})`;
const reiniciar = () => { document.getElementById('btn-reiniciar').disparar('click'); frames(3); };
const irPara = (b) => {
  globalThis.__PROXIMO_BLOCO = b;
  canvasJogo.disparar('click', { clientX: 640, clientY: 360 });
  esperarParar();
};

/* ---------- 4. testes para cada fase ---------- */
const niveis = mod.NIVEIS;
console.log(`\nCarregadas ${niveis.length} fases: ${niveis.map(n => n.nome).join(' | ')}`);
ok(mod.NIVEIS.length === 5, 'há 5 fases cadastradas');

for (let i = 0; i < niveis.length; i++) {
  const nome = niveis[i].nome;
  console.log(`\n=== ${nome} ===`);
  mod.carregarNivel(i);
  frames(3);

  // --- bordas em todos os blocos ---
  const blocos = grade().lista;
  const comBorda = blocos.filter(b => b.malha && b.malha.children.some(f => f.isLineSegments));
  const esperado = CONFIG.mostrarBordas ? blocos.length : 0;
  ok(comBorda.length === esperado, `${blocos.length} blocos, ${comBorda.length} com borda (contorno)`);
  const totalSegmentos = comBorda.reduce((s, b) => s + b.malha.children.filter(f => f.isLineSegments).length, 0);
  ok(totalSegmentos === comBorda.length, 'cada bloco tem exatamente uma borda');

  // --- sorteio de moedas ---
  const desejadas = niveis[i].moedas ?? 0;
  const moedas = moedasAtuais();
  ok(moedas.length === desejadas, `sorteio gerou ${moedas.length} moedas (pedido: ${desejadas})`);
  const malhasDeMoeda = moedas.filter(b => b.moeda && b.moeda.$tipo === 'cilindro');
  ok(moedas.every(m => !!m.moeda), 'cada moeda sorteada tem sua malha 3D flutuando');
  const distSpawn = moedas.every(m => grade().rota(spawnAtual(), m) && grade().rota(spawnAtual(), m).length >= (niveis[i].distanciaMoedas ?? 3));
  ok(moedas.every(m => grade().rota(spawnAtual(), m)), 'todas as moedas são alcançáveis a partir do spawn');
  ok(distSpawn, 'as moedas respeitam a distância mínima do spawn');
  const espacadas = moedas.every((m, idx) => moedas.slice(idx + 1)
    .every(o => Math.abs(m.x - o.x) + Math.abs(m.y - o.y) + Math.abs(m.z - o.z) >= 2));
  ok(espacadas, 'as moedas respeitam a distância mínima entre si');

  // --- HUD e personagem ---
  ok(document.getElementById('nome-fase').textContent.includes(String(i + 1)), 'HUD mostra o nome da fase');
  ok(document.getElementById('contador-moedas').textContent === `🪙 0/${desejadas}`, `HUD mostra 0/${desejadas}`);
  ok(emCimaDe(spawnAtual()), `personagem no spawn ${posicao(spawnAtual())}`);

  // --- coleta: anda até cada moeda e confere ---
  for (const moeda of moedas.slice()) {
    irPara(moeda);
    if (moeda.tipo !== 'chao') continue;               // coletada no caminho
  }
  const restantes = moedasAtuais().length;
  ok(document.getElementById('contador-moedas').textContent === `🪙 ${desejadas}/${desejadas}`,
     `todas as ${desejadas} moedas coletadas (HUD ${document.getElementById('contador-moedas').textContent})`);
  ok(restamZeradas(), 'nenhuma moeda restou no mapa');
  ok(document.getElementById('tela-conclusao').classList.contains('visivel'), `tela "Fase Concluída!" aparece`);
  ok(estado().concluido === true, 'estado marcado como concluído');

  function restamZeradas() {
    // após concluir, as moedas coletadas viraram 'chao'; conta as que sobraram
    return grade().lista.filter(b => b.tipo === 'moeda').length === 0;
  }

  // --- reiniciar traz as moedas de volta ---
  reiniciar();
  frames(3);
  ok(moedasAtuais().length === desejadas, 'reiniciar re-sorteia as moedas');
  ok(document.getElementById('contador-moedas').textContent === `🪙 0/${desejadas}`, 'reiniciar zera o contador');
  ok(estado().concluido === false, 'reiniciar limpa a conclusão');

  // --- bloqueio: parede ---
  const parede = grade().lista.find(b => b.tipo === 'parede');
  if (parede) {
    const posAntes = { x: personagem.position.x, y: personagem.position.y, z: personagem.position.z };
    globalThis.__PROXIMO_BLOCO = parede;
    canvasJogo.disparar('click', { clientX: 10, clientY: 10 });
    esperarParar();
    ok(personagem.position.x === posAntes.x && personagem.position.z === posAntes.z && personagem.position.y === posAntes.y,
       'clicar em parede não move o personagem');
  }

  // --- teclado relativo à câmera ---
  const s = spawnAtual();
  const leste = blocoEm(s.x + 1, s.y, s.z);
  if (leste && grade().podeMover(s, leste)) {
    document.getElementById('btn-girar-dir').disparar('click');
    frames(120);
    (listenersJanela['keydown'] || []).forEach(f => f({ key: 'ArrowRight', preventDefault() {} }));
    esperarParar();
    ok(estado().blocoAtual === leste, 'com a câmera girada, seta >> anda para +X');
    // volta a câmera e o personagem
    document.getElementById('btn-girar-esq').disparar('click');
    frames(120);
  }
}

console.log('\n=== ALEATORIEDADE DAS MOEDAS ===');
// sem `seed`, cada carregamento deve sortear posições diferentes
const sorteios = [];
for (let i = 0; i < 6; i++) {
  mod.carregarNivel(0);
  frames(2);
  sorteios.push(moedasAtuais().map(m => `${m.x},${m.y},${m.z}`).join(' '));
}
const iguais = sorteios.every(s => s === sorteios[0]);
ok(!iguais, `6 carregamentos geraram ${new Set(sorteios).size} combinações diferentes de moedas`);
sorteios.slice(0, 3).forEach((s, i) => console.log(`      sorteio ${i + 1}: ${s}`));
// ...e todas continuam alcançáveis
ok(sorteios.length === 6, 'nenhum sorteio ficou sem moedas');

// com semente fixa, o sorteio passa a ser reproduzível
CONFIG.sementeFixa = 42;
const comSemente = [];
for (let i = 0; i < 3; i++) { mod.carregarNivel(0); frames(2); comSemente.push(moedasAtuais().map(m => `${m.x},${m.y},${m.z}`).join(' ')); }
ok(comSemente.every(s => s === comSemente[0]), 'com CONFIG.sementeFixa definida, o sorteio é reproduzível');
CONFIG.sementeFixa = null;

console.log('\n=== ANIMAÇÃO DE SURGIMENTO DAS MOEDAS ===');
mod.carregarNivel(0);
frames(2);
const escalasIniciais = moedasAtuais().map(m => m.moeda.scale.x);
ok(escalasIniciais.every(s => s <= 1.001), 'moedas começam pequenas/invisíveis e vão surgindo');
frames(150);   // deixa todas as animações terminarem (atraso + duração)
const escalasFinais = moedasAtuais().map(m => m.moeda.scale.x);
ok(escalasFinais.every(s => Math.abs(s - 1) < 0.01), 'todas as moedas terminam em escala 1 (pop completo)');

console.log('\n=== BOTÃO DE GIRAR (controle de câmera) ===');
const posAntesGiro = { x: camera.position.x, z: camera.position.z };
const giroAntes = estado().giroAlvo;
document.getElementById('btn-girar-dir').disparar('click');
ok(Math.abs(estado().giroAlvo - (giroAntes + Math.PI / 2)) < 1e-9, 'botão "Girar p/ Direita" muda o alvo em +90°');
frames(150);
ok(estado().giroAtual === estado().giroAlvo, 'a câmera interpolou até o novo ângulo');
ok(Math.abs(camera.position.x - posAntesGiro.x) > 1 || Math.abs(camera.position.z - posAntesGiro.z) > 1,
   'a posição da câmera mudou após o giro');
document.getElementById('btn-girar-esq').disparar('click');
frames(150);
ok(Math.abs(estado().giroAlvo - giroAntes) < 1e-9, 'botão "Girar p/ Esquerda" volta o alvo');
ok(Math.abs(camera.position.x - posAntesGiro.x) < 1e-3 && Math.abs(camera.position.z - posAntesGiro.z) < 1e-3,
   'a câmera volta à posição original');

console.log('\n=== GIRO PELO TECLADO (Q / E) ===');
mod.carregarNivel(0);
frames(3);
const girar = (tecla) => (listenersJanela['keydown'] || [])
  .forEach(f => f({ key: tecla, preventDefault() {} }));

const giroBase = estado().giroAlvo;
girar('e');
ok(Math.abs(estado().giroAlvo - (giroBase + Math.PI / 2)) < 1e-9, 'tecla E gira para a direita (+90°)');
girar('q');
ok(Math.abs(estado().giroAlvo - giroBase) < 1e-9, 'tecla Q gira para a esquerda (volta ao ângulo original)');
frames(150);
ok(estado().giroAtual === estado().giroAlvo, 'a câmera acompanha o giro pelo teclado');

// Q/E continuam funcionando com a fase concluída
for (const moeda of moedasAtuais().slice()) irPara(moeda);
const giroConcluido = estado().giroAlvo;
girar('e');
ok(Math.abs(estado().giroAlvo - (giroConcluido + Math.PI / 2)) < 1e-9,
   'Q/E funcionam mesmo com a fase concluída (dá para apreciar o diorama)');

console.log('\n=== PROGRESSÃO ENTRE FASES ===');
mod.carregarNivel(0);
frames(3);

// coleta tudo na Fase 1 e usa "Próxima Fase"
const f1 = mod.NIVEIS[0];
for (const moeda of moedasAtuais().slice()) irPara(moeda);
ok(document.getElementById('tela-conclusao').classList.contains('visivel'), 'Fase 1 concluída');
ok(document.getElementById('titulo-conclusao').textContent === 'Fase Concluída!',
   `título "${document.getElementById('titulo-conclusao').textContent}" (não é a última fase)`);
ok(document.getElementById('btn-proxima').textContent.includes('Próxima Fase'),
   'botão "Próxima Fase ▶" disponível');
ok(document.getElementById('texto-conclusao').textContent.includes(mod.NIVEIS[1].nome),
   'o texto já anuncia a próxima fase');

document.getElementById('btn-proxima').disparar('click');
frames(3);
ok(mod.indiceNivel === 1, `avançou para o índice 1 (${mod.NIVEIS[mod.indiceNivel].nome})`);
ok(estado().concluido === false, 'a Fase 2 começa sem o estado de conclusão');
ok(document.getElementById('contador-moedas').textContent === `🪙 0/${mod.NIVEIS[1].moedas ?? 0}`,
   'contador de moedas zerado na Fase 2');
ok(document.getElementById('nome-fase').textContent.includes('2/5'), 'indicador mostra "2/5"');

// avança por todas as fases consecutivas
for (let i = 1; i < mod.NIVEIS.length; i++) {
  for (const moeda of moedasAtuais().slice()) irPara(moeda);
  document.getElementById('btn-proxima').disparar('click');
  frames(3);
  const esperado = (i + 1) % mod.NIVEIS.length;
  ok(mod.indiceNivel === esperado, `Fase ${i + 1} concluída → foi para a Fase ${esperado + 1}`);
}
ok(mod.indiceNivel === 0, 'depois da última fase, volta para a Fase 1');

// na última fase o texto muda
mod.carregarNivel(mod.NIVEIS.length - 1);
frames(3);
for (const moeda of moedasAtuais().slice()) irPara(moeda);
ok(document.getElementById('titulo-conclusao').textContent === 'Todas as Fases Concluídas!',
   `na última fase o título é "${document.getElementById('titulo-conclusao').textContent}"`);
ok(document.getElementById('btn-proxima').textContent.includes('Voltar à Fase 1'),
   'na última fase o botão vira "Voltar à Fase 1"');

// navegação livre pelo HUD
mod.carregarNivel(0);
frames(3);
document.getElementById('btn-fase-proxima').disparar('click');
frames(3);
ok(mod.indiceNivel === 1, 'botão ▶ do HUD vai para a fase seguinte');
document.getElementById('btn-fase-anterior').disparar('click');
frames(3);
ok(mod.indiceNivel === 0, 'botão ◀ do HUD volta para a fase anterior');

console.log('\n' + (falhas === 0 ? '>>> SMOKE TEST OK' : `>>> ${falhas} FALHA(S)`));
process.exit(falhas === 0 ? 0 : 1);
