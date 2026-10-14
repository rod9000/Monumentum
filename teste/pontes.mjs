/* Teste das PONTES DE CÂMERA.
   1) regras puras (src/grade.js): a ponte só existe com a câmera no ângulo dela
      e assentada; girar não quebra a ponte já atravessada.
   2) integração (jogo real, mock de THREE + DOM): com ângulo errado o personagem
      não atravessa; com o certo atravessa; girar no meio da rota faz cair. */
import { Grade, quadranteAssentado, quadranteAlvo, giroNecessario } from '../src/grade.js';
import { NIVEIS } from '../src/dados/niveis.js';
import { carregarJogo } from './carregar-jogo.mjs';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/* ---------- 1. regras puras ---------- */
console.log('--- regras puras (Fase 16 e 17) ---');
const f16 = NIVEIS.find(n => n.nome.startsWith('Fase 16'));
const f17 = NIVEIS.find(n => n.nome.startsWith('Fase 17'));
const alvoM = { x: 6, y: 0, z: 1 };          // ilha do meio (Fase 16)

{
  const g = new Grade(f16.blocos, f16.pontes);
  const spawn = f16.blocos.find(b => b.tipo === 'spawn');
  const destino = g.obter(alvoM.x, alvoM.y, alvoM.z);
  ok(g.rota(spawn, destino) === null, 'girando (quadrante null): ponte não existe');
  g.quadrante = 0;
  ok(g.rota(spawn, destino) === null, 'ângulo 0 (errado): não atravessa');
  g.quadrante = 1;
  const rota = g.rota(spawn, destino);
  ok(rota !== null, 'ângulo 1 (certo): atravessa');
  ok(rota && rota.some(b => b.x === 2 && b.z === 1) && rota.at(-1) === destino, 'rota passa pela ponte e chega ao destino');
}
{ // o aviso precisa dizer qual ângulo abre a ponte
  const g = new Grade(f16.blocos, f16.pontes);
  const spawn = f16.blocos.find(b => b.tipo === 'spawn');
  const destino = g.obter(6, 0, 1);
  g.quadrante = 0;
  ok(g.anguloPonteBloqueante(spawn, destino) === 1, 'com ângulo 0, a ponte bloqueante pede o ângulo 1');
  g.quadrante = 1;
  ok(g.anguloPonteBloqueante(spawn, destino) === null, 'com ângulo 1, nada bloqueia');
  g.quadrante = 0;
  ok(g.anguloPonteBloqueante(spawn, g.obter(1, 0, 0)) === null, 'destino sem ponte: nada a sinalizar');
}
{
  const g = new Grade(f17.blocos, f17.pontes);
  const spawn = f17.blocos.find(b => b.tipo === 'spawn');
  const meio = g.obter(6, 0, 1);
  const fim = g.obter(7, 0, 7);
  g.quadrante = 1;
  ok(g.rota(spawn, meio) !== null, 'Fase 17: ponte 1 (ângulo 1) leva à ilha do meio');
  ok(g.rota(spawn, fim) === null, 'Fase 17: sem a ponte 2 (ângulo 3), não chega à última ilha');
  g.quadrante = 3;
  ok(g.rota(spawn, fim) === null, 'Fase 17: com ângulo 3, a ponte 2 sozinha não basta (falta a ponte 1)');
  g.pontesLivres = true;
  ok(g.rota(spawn, fim) !== null, 'validação (pontesLivres): todas as pontes contam');
}
{
  const assentado = [
    [quadranteAssentado(0, 0), 0],
    [quadranteAssentado(Math.PI / 2, Math.PI / 2), 1],
    [quadranteAssentado(-Math.PI / 2, -Math.PI / 2), 3],
    [quadranteAssentado(Math.PI, Math.PI), 2],
    [quadranteAssentado(Math.PI / 2 + 0.5, Math.PI / 2), null],
  ];
  ok(assentado.every(([obtido, esperado]) => obtido === esperado), 'quadranteAssentado: 0..3 quando assentado, null enquanto gira');
}

/* ---------- 2. integração com o jogo ---------- */
console.log('--- integração com o jogo ---');
const elementos = new Map();
class El {
  constructor(id) { this.id = id; this.textContent = ''; this.style = {}; this._c = new Set(); this._l = {}; this.children = []; }
  classList = { add: () => {}, remove: () => {}, contains: () => false };
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
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

const mod = await carregarJogo(['grade', 'estado', 'personagem', 'carregarNivel', 'girar', 'definirRota', 'pressionarSeta', 'indiceNivel', 'NIVEIS']);
let agora = performance.now();
const frames = n => { for (let i = 0; i < n; i++) { agora += 16; const f = raf; raf = null; f(agora); } };
const pos = b => `(${b.x},${b.y},${b.z})`;

/** Estado de cada teste começa do zero: carrega a Fase 16 e assenta a câmera. */
function novaPartida() {
  mod.carregarNivel(15);
  mod.estado.giroAtual = 0; mod.estado.giroAlvo = 0;
  frames(2);                                 // a grade pega o quadrante 0 no quadro
}

{ // com o ângulo certo, atravessa
  novaPartida();
  mod.girar(1);
  frames(180);                               // câmera assenta em 90°
  ok(mod.grade.quadrante === 1, 'câmera assentada em 90° (quadrante 1)');
  const destino = mod.grade.obter(6, 0, 1);
  const rota = mod.grade.rota(mod.estado.blocoAtual, destino);
  mod.definirRota(rota);
  frames(400);
  ok(mod.estado.blocoAtual === destino && mod.estado.passo === null, `com ângulo certo, chega à ilha do meio ${pos(destino)}`);
}
{ // com o ângulo errado, a ponte não existe para a rota (nem é tentada)
  novaPartida();
  const destino = mod.grade.obter(6, 0, 1);
  ok(mod.grade.rota(mod.estado.blocoAtual, destino) === null, 'com ângulo errado, não há rota até a ilha do meio');
  frames(200);
  ok(mod.estado.blocoAtual !== destino && mod.estado.passo === null, 'sem rota, o personagem fica parado');
}
{ // girar no meio da rota: a ponte deixa de estar alinhada e o personagem cai
  novaPartida();
  mod.girar(1);
  frames(180);
  const destino = mod.grade.obter(6, 0, 1);
  mod.definirRota(mod.grade.rota(mod.estado.blocoAtual, destino));
  // a câmera sai do alinhamento antes de o personagem chegar à ponte
  mod.estado.giroAtual = 0; mod.estado.giroAlvo = 0;
  frames(400);
  ok(mod.indiceNivel === 15 && mod.estado.blocoAtual.x === 0 && mod.estado.blocoAtual.z === 0,
     'girar antes da ponte: cai no vão e a fase reinicia no spawn');
  ok(mod.estado.caindo === false, 'após reiniciar, o personagem volta a poder andar');
  ok(mod.estado.fila.length === 0, 'a fila de passos é descartada');
  const aviso = [...elementos.values()].some(el => String(el.textContent).includes('Caiu no vão'));
  ok(aviso, 'aparece o aviso "Caiu no vão"');
}
{ // clicar em uma ilha atravessando a ponte errada também faz cair
  novaPartida();
  const spawn = mod.estado.blocoAtual;
  const destino = mod.grade.obter(6, 0, 1);
  mod.definirRota(mod.grade.rotaSobPontes(spawn, destino));
  frames(400);
  ok(mod.estado.blocoAtual.x === 0 && mod.estado.blocoAtual.z === 0 && mod.indiceNivel === 15,
     'tentar a ponte com ângulo errado: cai e a fase reinicia');
  ok(mod.estado.caindo === false, 'queda termina e libera o jogo');
}

{ // girar e clicar logo em seguida (sem esperar o giro assentar): atravessa
  novaPartida();
  mod.girar(1);
  const destino = mod.grade.obter(6, 0, 1);
  mod.definirRota(mod.grade.rotaSobPontes(mod.estado.blocoAtual, destino));
  frames(400);
  ok(mod.estado.blocoAtual === destino && mod.indiceNivel === 15,
     'girar e clicar logo depois: espera a câmera alinhar e atravessa (não cai)');
}
{ // girar para o lado errado e clicar: cai, mesmo esperando
  novaPartida();
  mod.girar(-1);
  const destino = mod.grade.obter(6, 0, 1);
  mod.definirRota(mod.grade.rotaSobPontes(mod.estado.blocoAtual, destino));
  frames(400);
  ok(mod.estado.blocoAtual.x === 0 && mod.indiceNivel === 15, 'girar para o lado errado: cai e reinicia');
}
{ // funções puras do giro
  ok(quadranteAlvo(-Math.PI / 2) === 3 && quadranteAlvo(Math.PI) === 2, 'quadranteAlvo acompanha o destino do giro');
  const g1 = giroNecessario(0, 1), g3 = giroNecessario(0, 3), g2 = giroNecessario(0, 2);
  ok(g1.vezes === 1 && g1.lado === 'direita', 'da câmera 0 para 90°: 1× à direita (E)');
  ok(g3.vezes === 1 && g3.lado === 'esquerda', 'da câmera 0 para 270°: 1× à esquerda (Q)');
  ok(g2.vezes === 2, 'da câmera 0 para 180°: 2×');
  ok(giroNecessario(1, 1).vezes === 0, 'já alinhado: nenhum giro');
}

{ // placas são andáveis só com a câmera alinhada
  novaPartida();
  const placa = mod.grade.obter(3, 0, 1);
  ok(!mod.grade.andavel(placa), 'placa da ponte não é andável com a câmera fora do ângulo');
  mod.girar(1);
  frames(180);
  ok(mod.grade.andavel(placa), 'com a câmera no ângulo da ponte, a placa é andável');
}
{ // andar por cima: a rota passa pelas placas, uma a uma
  novaPartida();
  mod.girar(1);
  frames(180);
  const destino = mod.grade.obter(6, 0, 1);
  const rota = mod.grade.rota(mod.estado.blocoAtual, destino);
  ok(rota && rota.filter(b => b.tipo === 'ponte').length === 3, 'a rota atravessa as 3 placas, uma a uma');
  mod.definirRota(rota);
  frames(500);
  ok(mod.estado.blocoAtual === destino, 'andando por cima das placas chega à outra ilha');
}
{ // pulo: vai até o próximo bloco de pulo na direção, e volta pelo par
  const alvoDoPuloTest = (await import('../src/grade.js')).alvoDoPulo;
  const bl = [
    { x: 0, y: 0, z: 0, tipo: 'pulo' },
    { x: 2, y: 0, z: 0, tipo: 'pulo' },
    { x: 3, y: 0, z: 0, tipo: 'chao' },
    { x: 6, y: 0, z: 0, tipo: 'pulo' }
  ];
  const g = new Grade(bl);
  const p0 = g.obter(0, 0, 0), p2 = g.obter(2, 0, 0);
  ok(alvoDoPuloTest(g, p0, 1, 0) === p2, 'alvoDoPulo: vai até o próximo bloco de pulo na direção');
  ok(alvoDoPuloTest(g, p2, -1, 0) === p0, 'alvoDoPulo: o par volta para o bloco de origem');
  ok(alvoDoPuloTest(g, p0, -1, 0) === null, 'alvoDoPulo: sem bloco de pulo na direção, não há destino');
  mod.NIVEIS.push({ nome: 'Teste pulo', moedas: 0, blocos: bl });
  const idx = mod.NIVEIS.length - 1;
  mod.carregarNivel(idx);
  frames(3);
  ok(mod.estado.blocoAtual.tipo === 'pulo', 'o personagem começa num bloco de pulo');
  mod.pressionarSeta(1, 0);
  mod.pressionarSeta(1, 0);
  frames(400);
  ok(mod.estado.blocoAtual.x === 2 && mod.indiceNivel === idx, 'duas setas pulam até o próximo bloco de pulo');
  mod.pressionarSeta(-1, 0);
  mod.pressionarSeta(-1, 0);
  frames(400);
  ok(mod.estado.blocoAtual.x === 0 && mod.indiceNivel === idx, 'duas setas no sentido contrário voltam pelo par');
}
{ // uma seta só num bloco de pulo não pula
  mod.carregarNivel(mod.NIVEIS.length - 1);
  frames(3);
  mod.pressionarSeta(1, 0);
  await new Promise(r => setTimeout(r, 450));
  frames(60);
  ok(mod.estado.blocoAtual.x === 0, 'uma seta só num bloco de pulo: não pula');
}
{ // pulo sem bloco de pulo do outro lado: cai no vão
  mod.carregarNivel(mod.NIVEIS.length - 1);
  frames(3);
  mod.pressionarSeta(-1, 0);
  mod.pressionarSeta(-1, 0);
  frames(400);
  ok([...elementos.values()].some(el => String(el.textContent).includes('Caiu no vão')),
     'pulo sem bloco de pulo do outro lado: cai no vão');
}
console.log(falhas === 0 ? '\n>>> PONTES OK' : `\n>>> ${falhas} FALHA(S) EM PONTES`);
process.exit(falhas === 0 ? 0 : 1);
