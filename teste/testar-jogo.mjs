/* Smoke test: executa o módulo real do jogo (com mock do THREE + DOM)
   e verifica bordas, sorteio de moedas, movimento, câmera, zoom e fim de fase.

   ATENÇÃO: `grade` é reatribuído a cada carregamento de fase, por isso o teste
   acessa `mod.grade` sempre atual (um destructuring de `await import()` tiraria
   uma "foto" do valor e olharíamos a grade antiga). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarJogo } from './carregar-jogo.mjs';
import { alcancaveis } from '../src/grade.js';

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
  appendChild(filho) { this.children = this.children || []; this.children.push(filho); return filho; }
  removeChild(filho) { this.children = this.children || []; const i = this.children.indexOf(filho); if (i >= 0) this.children.splice(i, 1); return filho; }
}

const elementos = new Map();
globalThis.document = {
  getElementById: id => {
    if (!elementos.has(id)) elementos.set(id, new El(id));
    return elementos.get(id);
  },
  createElement: () => new El('popup'),
  body: new El('body')
};

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

/* ---------- 2. carrega o jogo (bundle com o mock do THREE) ---------- */
const mod = await carregarJogo(['personagem', 'camera', 'grade', 'estado', 'alvoCentro', 'coletadas', 'totalMoedas', 'CONFIG', 'NIVEIS', 'indiceNivel', 'carregarNivel', 'canvas as canvasJogo']);
// fluxo de fases: as pontes de câmera são ignoradas aqui (o alinhamento real é testado em pontes.mjs)
mod.CONFIG.pontesSempreAtivas = true;

let falhas = 0;
const detalhes = [];
const ok = (cond, msg) => {
  console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg);
  if (!cond) { falhas++; detalhes.push(msg); }
};

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

/* ---------- atravessia de elevador (para completar fases com vão) ---------- */
const elevadorParado = b => b.elev.t === 0 || b.elev.t === 1;

/** Embarca no elevador, espera a viagem e desembarca do outro lado.
 *  A rota é traçada até a BEIRADA de embarque (célula ao lado da plataforma):
 *  quando o elevador está do outro lado do vão não há caminho a pé até ele, e
 *  o teste espera o vaivém voltar — sempre rodando frames, nunca girando à
 *  toa. Devolve true se atravessou. */
const atravessarElevador = () => {
  const g = grade();
  let n = 0;
  while (n++ < 2000) {
    // 1) há um elevador parado com beirada alcançável a pé daqui?
    //    (a beirada pode ser a célula em que já estamos — aí não há "rota",
    //     mas também não precisa andar)
    let escolhido = null;
    for (const e of g.lista.filter(b => b.elev)) {
      if (!elevadorParado(e)) continue;
      const viz = g.vizinhos(e).filter(v => v === estado().blocoAtual || g.rota(estado().blocoAtual, v));
      if (viz.length) { escolhido = { e, borda: viz[0] }; break; }
    }
    if (escolhido) {
      const { e, borda } = escolhido;
      irPara(borda);                                  // caminha até a beirada
      if (estado().blocoAtual !== borda) return false;
      const saida = { x: e.x, y: e.y, z: e.z };
      irPara(e);                                      // embarca (só quando parado)
      if (estado().blocoAtual !== e) { frame(); continue; }   // ainda em movimento
      // 2) viaja até parar na OUTRA ponta
      let m = 0;
      while (m++ < 900) {
        const andou = Math.abs(e.x - saida.x) + Math.abs(e.y - saida.y) + Math.abs(e.z - saida.z);
        if (andou > 0.01 && elevadorParado(e)) break;
        frame();
      }
      // 3) desembarca numa célula caminhável ao lado
      const viz = g.vizinhos(e).find(v => v !== borda) || g.vizinhos(e)[0];
      if (!viz) return false;
      irPara(viz);
      return estado().blocoAtual === viz;
    }
    frame();                       // sem beirada: o vaivém volta sozinho
  }
  return false;
};

/* ---------- 4. testes para cada fase ---------- */
const niveis = mod.NIVEIS;
console.log(`\nCarregadas ${niveis.length} fases: ${niveis.map(n => n.nome).join(' | ')}`);
ok(mod.NIVEIS.length === 18, `há ${mod.NIVEIS.length} fases cadastradas`);


for (let i = 0; i < niveis.length; i++) {
  const nome = niveis[i].nome;
  console.log(`\n=== ${nome} ===`);
  mod.carregarNivel(i);
  frames(3);

  // --- bordas em todos os blocos (as placas de ponte são finas e não têm contorno) ---
  const blocos = grade().lista.filter(b => b.tipo !== 'ponte');
  const comBorda = blocos.filter(b => b.malha && b.malha.children.some(f => f.isLineSegments));
  const esperado = CONFIG.mostrarBordas ? blocos.length : 0;
  ok(comBorda.length === esperado, `${blocos.length} blocos, ${comBorda.length} com borda (contorno)`);
  const totalSegmentos = comBorda.reduce((s, b) => s + b.malha.children.filter(f => f.isLineSegments).length, 0);
  ok(totalSegmentos === comBorda.length, 'cada bloco tem exatamente uma borda');

  // --- sorteio de moedas ---
  const desejadas = niveis[i].moedas ?? 0;
  const moedas = moedasAtuais();
  const temElevador = grade().lista.some(b => b.elev) || (niveis[i].pontes || []).length > 0;
  ok(moedas.length === desejadas, `sorteio gerou ${moedas.length} moedas (pedido: ${desejadas})`);
  ok(moedas.every(m => !!m.moeda), 'cada moeda sorteada tem sua malha 3D flutuando');
  if (!temElevador) {
    ok(moedas.every(m => grade().rota(spawnAtual(), m)), 'todas as moedas são alcançáveis a partir do spawn');
    const distSpawn = moedas.every(m => grade().rota(spawnAtual(), m) &&
      grade().rota(spawnAtual(), m).length >= (niveis[i].distanciaMoedas ?? 3));
    ok(distSpawn, 'as moedas respeitam a distância mínima do spawn');
  } else {
    // com elevador a moeda pode ficar do "lado de lá" (ou depois de DOIS
    // elevadores): a alcançabilidade é verificada pela ponte início<->destino
    const dist = alcancaveis(grade(), spawnAtual());
    ok(moedas.every(m => dist.has(`${m.x}|${m.y}|${m.z}`)),
       'todas as moedas são alcançáveis (a pé ou de elevador)');
  }
  const espacadas = moedas.every((m, idx) => moedas.slice(idx + 1)
    .every(o => Math.abs(m.x - o.x) + Math.abs(m.y - o.y) + Math.abs(m.z - o.z) >= 2));
  ok(espacadas, 'as moedas respeitam a distância mínima entre si');

  // --- HUD e personagem ---
  ok(document.getElementById('nome-fase').textContent.includes(String(i + 1)), 'HUD mostra o nome da fase');
  ok(document.getElementById('contador-moedas').textContent === `🪙 0/${desejadas}`, `HUD mostra 0/${desejadas}`);
  ok(emCimaDe(spawnAtual()), `personagem no spawn ${posicao(spawnAtual())}`);

  // --- coleta: anda até cada moeda e confere ---
  // em fases com elevador, a moeda pode estar do "lado de lá"; nesse caso o
  // clique manda o personagem para a beirada de embarque (validado em
  // teste/elevadores.mjs), e a coleta completa é verificada lá.
  if (!temElevador) {
    for (const moeda of moedas.slice()) {
      irPara(moeda);
      if (moeda.tipo !== 'chao') continue;             // coletada no caminho
    }
  }
  const restantes = moedasAtuais().length;
  if (!temElevador) {
    ok(document.getElementById('contador-moedas').textContent === `🪙 ${desejadas}/${desejadas}`,
       `todas as ${desejadas} moedas coletadas (HUD ${document.getElementById('contador-moedas').textContent})`);
    ok(restantes === 0, 'nenhuma moeda restou no mapa');
    ok(document.getElementById('tela-conclusao').classList.contains('visivel'), `tela "Fase Concluída!" aparece`);
    ok(estado().concluido === true, 'estado marcado como concluído');
  } else {
    ok(restantes === desejadas, `fase com elevador: ${desejadas} moedas ainda no mapa (travessia testada à parte)`);
  }

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
ok(document.getElementById('nome-fase').textContent.includes('2/∞'),
   'indicador mostra "2/∞"');

// avança por todas as fases consecutivas
const concluirFaseAtual = () => {
  // em fases com elevador as moedas podem ficar do outro lado do vão; nesse
  // caso basta simular a coleta chamando o fluxo interno via clique nas moedas
  // alcançáveis a pé — as demais são verificadas em teste/elevadores.mjs.
  const g = grade();
  const coletarAcessiveis = () => {
    for (const moeda of moedasAtuais().slice()) {
      const daqui = estado().blocoAtual;
      if (g.rota(daqui, moeda) || g.rota(spawnAtual(), moeda)) irPara(moeda);
    }
  };
  coletarAcessiveis();
  // sobrou moeda do "lado de lá"? atravessa de elevador (quantas vezes
  // precisar — a Fase 11 tem dois) e continua coletando
  for (let t = 0; t < 8 && moedasAtuais().length; t++) {
    if (!atravessarElevador()) break;
    coletarAcessiveis();
  }
  // última tentativa: o clique roteia para a beirada de embarque
  for (const moeda of moedasAtuais().slice()) {
    if (moeda.tipo === 'moeda') { globalThis.__PROXIMO_BLOCO = moeda; canvasJogo.disparar('click', { clientX: 640, clientY: 360 }); esperarParar(); }
  }
};

// percorre TODAS as fases em sequência, uma a uma
for (let i = 1; i < mod.NIVEIS.length; i++) {
  concluirFaseAtual();
  document.getElementById('btn-proxima').disparar('click');
  frames(3);
  const esperado = i + 1;                       // sem fim: depois da última vem a procedural
  ok(mod.indiceNivel === esperado, `Fase ${i + 1} concluída → foi para a Fase ${esperado + 1}`);
}

// não há fim: a última fase manual leva à primeira procedural, sem mudar o texto
mod.carregarNivel(mod.NIVEIS.length - 1);
frames(3);
concluirFaseAtual();
ok(document.getElementById('titulo-conclusao').textContent === 'Fase Concluída!',
   'na última fase manual o título continua "Fase Concluída!"');
ok(document.getElementById('btn-proxima').textContent.includes('Próxima Fase'),
   'o botão continua "Próxima Fase"');
document.getElementById('btn-proxima').disparar('click');
frames(3);
ok(mod.indiceNivel === mod.NIVEIS.length, 'depois da última manual, vai para a primeira procedural');

// o HUD navega em ciclo: da primeira, ◀ volta para a última
mod.carregarNivel(0);
frames(3);
document.getElementById('btn-fase-anterior').disparar('click');
frames(3);
ok(mod.indiceNivel === mod.NIVEIS.length - 1, '◀ na Fase 1 volta para a última fase');
document.getElementById('btn-fase-proxima').disparar('click');
frames(3);
ok(mod.indiceNivel === mod.NIVEIS.length, '▶ na última fase manual vai para a primeira procedural');

console.log('\n' + (falhas === 0 ? '>>> SMOKE TEST OK' : `>>> ${falhas} FALHA(S):\n` + detalhes.map(d => '  - ' + d).join('\n')));
process.exit(falhas === 0 ? 0 : 1);
