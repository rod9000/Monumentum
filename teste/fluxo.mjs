/* Testes de FLUXO do jogo (com o DOM simulado):
   1) moedas: reiniciar volta ao total de antes da fase; concluir confirma; refazer não rende de novo;
   2) pontuação: passos e estatísticas na tela de conclusão;
   3) trocar de fase no meio de uma espera de seta não move o personagem;
   4) no bloco de pulo com chão à frente, a seta anda na hora (sem esperar a 2ª seta);
   5) dica do bloco de pulo aparece ao entrar na fase;
   6) menu de fases: abre, mostra as fases e escolhe uma;
   7) botão de som: liga e desliga o mudo e troca o ícone. */
import { carregarJogo } from './carregar-jogo.mjs';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };
const dormir = ms => new Promise(r => setTimeout(r, ms));

/* ---------- DOM e armazenamento simulados (antes de importar o jogo) ---------- */
const elementos = new Map();
class El {
  constructor(id) {
    this.id = id; this.textContent = ''; this.style = {}; this._l = {}; this.children = [];
    this.classes = new Set(); this.disabled = false; this.title = ''; this.className = '';
  }
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
  createElement: () => new El('criado'),
  body: new El('body')
};
const el = id => elementos.get(id) ?? document.getElementById(id);
let raf = null;
globalThis.requestAnimationFrame = f => { raf = f; };
globalThis.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 1, addEventListener() {} };
const armazenamento = (() => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, dados: d }; })();
globalThis.localStorage = armazenamento;

const mod = await carregarJogo(['grade', 'estado', 'carregarNivel', 'NIVEIS', 'indiceNivel', 'progresso', 'som', 'coletadas', 'totalMoedas', 'pressionarSeta', 'definirRota']);
let agora = performance.now();
const frames = n => { for (let i = 0; i < n; i++) { agora += 16; const f = raf; raf = null; f(agora); } };
const esperarPasso = () => frames(60);          // um passo leva ~0,26 s de jogo

/* ---------- fases de teste (no fim da lista, para não mexer nas do jogo) ---------- */
mod.NIVEIS.push({ nome: 'Teste moedas', moedas: 2, moedasFixas: true, blocos: [
  { x: 0, y: 0, z: 0, tipo: 'spawn' }, { x: 0, y: 0, z: 1, tipo: 'moeda' },
  { x: 0, y: 0, z: 2, tipo: 'moeda' }, { x: 0, y: 0, z: 3, tipo: 'chao' }
] });
const iMoedas = mod.NIVEIS.length - 1;
mod.NIVEIS.push({ nome: 'Teste pulo', moedas: 0, blocos: [
  { x: 0, y: 0, z: 0, tipo: 'pulo' }, { x: 0, y: 0, z: 2, tipo: 'pulo' }
] });
const iPulo = mod.NIVEIS.length - 1;
mod.NIVEIS.push({ nome: 'Teste passo', moedas: 0, blocos: [
  { x: 0, y: 0, z: 0, tipo: 'pulo' }, { x: 0, y: 0, z: 1, tipo: 'chao' }, { x: 0, y: 0, z: 2, tipo: 'chao' }
] });
const iPasso = mod.NIVEIS.length - 1;

const totalNaTela = () => el('total-moedas').textContent;
const contadorNaTela = () => el('contador-moedas').textContent;

console.log('--- 1) moedas: reiniciar volta ao que era antes ---');
mod.carregarNivel(iMoedas); frames(3);
const totalAntes = mod.progresso.total;
ok(totalNaTela() === `Total 🪙 ${totalAntes}`, `ao entrar na fase, o total mostra ${totalAntes}`);
mod.definirRota([mod.grade.obter(0, 0, 1)]); esperarPasso(); frames(20);
ok(mod.coletadas === 1 && totalNaTela() === `Total 🪙 ${totalAntes + 1}`, 'coletar 1 moeda: o total mostra +1 (em jogo)');
el('btn-reiniciar-hud').disparar('click'); frames(3);
ok(totalNaTela() === `Total 🪙 ${totalAntes}` && contadorNaTela() === '🪙 0/2',
   'reiniciar: o total volta ao de antes e o contador zera');
ok(mod.progresso.total === totalAntes, 'a moeda da tentativa anulada não foi para o total salvo');

console.log('--- 2) concluir confirma as moedas e a pontuação ---');
mod.definirRota([mod.grade.obter(0, 0, 1), mod.grade.obter(0, 0, 2)]);
esperarPasso(); esperarPasso(); esperarPasso(); esperarPasso(); frames(20);
ok(mod.estado.concluido === true, 'coletar as 2 moedas conclui a fase');
ok(mod.progresso.total === totalAntes + 2, 'as 2 moedas entram no total salvo');
ok(el('tela-conclusao').classList.contains('visivel'), 'a tela de conclusão aparece');
const est = el('estatisticas').textContent;
ok(est.includes('Passos: 2') && est.includes('primeiro recorde!'), `estatísticas da primeira vez: "${est}"`);
ok(est.includes('⭐⭐⭐'), 'primeira conclusão vale 3 estrelas');

console.log('--- 2b) refazer a fase concluída não rende moedas de novo ---');
el('btn-reiniciar').disparar('click'); frames(3);
mod.definirRota([mod.grade.obter(0, 0, 1), mod.grade.obter(0, 0, 2)]);
esperarPasso(); esperarPasso(); esperarPasso(); esperarPasso(); frames(20);
ok(mod.estado.concluido && mod.progresso.total === totalAntes + 2,
   'refazer a mesma fase: o total continua o mesmo (cada fase conta uma vez)');

console.log('--- 3) trocar de fase no meio da espera não move o personagem ---');
mod.carregarNivel(iPulo); frames(3);
mod.pressionarSeta(0, 1);                       // 1ª seta: começa a esperar a 2ª (sem chão à frente)
mod.carregarNivel(iMoedas); frames(3);          // muda de fase antes do prazo acabar
await dormir(450);
frames(60);
ok(mod.coletadas === 0 && mod.estado.blocoAtual.z === 0 && mod.indiceNivel === iMoedas,
   'a seta pendente da fase anterior não anda na fase nova');

console.log('--- 4) no bloco de pulo com chão à frente, a seta anda na hora ---');
mod.carregarNivel(iPasso); frames(3);
mod.pressionarSeta(0, 1);                       // 1 seta, sem esperar
esperarPasso();
ok(mod.estado.blocoAtual.z === 1, 'uma seta com chão à frente anda um passo na hora');

console.log('--- 5) dica do bloco de pulo ao entrar na fase ---');
mod.carregarNivel(iPulo); frames(3);
await dormir(350);
ok(el('aviso').textContent.includes('Bloco de pulo'), `a dica aparece: "${el('aviso').textContent}"`);

console.log('--- 6) menu de fases ---');
el('btn-menu').disparar('click');
const grade = el('grade-fases');
ok(el('menu-fases').classList.contains('visivel') && grade.children.length >= 3,
   `o menu abre com as fases (${grade.children.length} botões)`);
const iConcluida = grade.children[iMoedas];
ok(iConcluida && iConcluida.className === 'fase-concluida', 'fase concluída aparece marcada no menu');
grade.children[0].disparar('click');
ok(!el('menu-fases').classList.contains('visivel') && mod.indiceNivel === 0,
   'escolher uma fase no menu fecha o menu e carrega a fase');
mod.carregarNivel(0); frames(3);

console.log('--- 7) botão de som ---');
el('btn-som').disparar('click');
ok(mod.som.mudo === true && el('btn-som').textContent === '🔇', 'o botão desliga o som e mostra 🔇');
ok(armazenamento.dados['diorama-mudo'] === '1', 'o mudo fica salvo no navegador');
el('btn-som').disparar('click');
ok(mod.som.mudo === false && el('btn-som').textContent === '🔊', 'o botão liga o som de novo e mostra 🔊');

console.log('--- 8) meta de passos e estrelas pelo par ---');
{
  // o HUD mostra a meta: 2 moedas seguidas = 2 passos
  mod.carregarNivel(iMoedas); frames(3);
  ok(el('passos').textContent === '👣 0 · meta 2', `o HUD mostra a meta da fase: "${el('passos').textContent}"`);

  // corredor de 0 a 20 com 3 moedas (6, 12 e 20): o par é 20 passos
  const corredor = nome => {
    const bl = [];
    for (let x = 0; x <= 20; x++) bl.push({ x, y: 0, z: 0, tipo: x === 0 ? 'spawn' : ([6, 12, 20].includes(x) ? 'moeda' : 'chao') });
    return { nome, moedas: 3, moedasFixas: true, blocos: bl };
  };
  mod.NIVEIS.push(corredor('Corredor direto'), corredor('Corredor com volta'));
  const iDireto = mod.NIVEIS.length - 2, iVolta = mod.NIVEIS.length - 1;
  const trilha = passos => passos.map(x => mod.grade.obter(x, 0, 0));

  mod.carregarNivel(iDireto); frames(3);
  mod.definirRota(trilha(Array.from({ length: 20 }, (_, i) => i + 1)));
  frames(700);
  const estDireto = el('estatisticas').textContent;
  ok(mod.estado.concluido && mod.estado.passos === 20, `caminho direto: 20 passos e fase concluída (passos=${mod.estado.passos})`);
  ok(estDireto.includes('(meta 20)') && estDireto.includes('⭐⭐⭐'), `caminho direto: 3 estrelas com meta 20 ("${estDireto}")`);

  mod.carregarNivel(iVolta); frames(3);
  // ida e volta de 3 passos (0 -> 3 -> 0) antes de seguir até o 20: 26 passos no total
  mod.definirRota(trilha([1, 2, 3, 2, 1, 0, ...Array.from({ length: 20 }, (_, i) => i + 1)]));
  frames(900);
  const estVolta = el('estatisticas').textContent;
  ok(mod.estado.concluido && mod.estado.passos === 26, `caminho com volta: 26 passos (passos=${mod.estado.passos})`);
  ok(estVolta.includes('(meta 20)') && estVolta.includes('⭐⭐☆'), `caminho com volta: 2 estrelas com meta 20 ("${estVolta}")`);
}

console.log(falhas === 0 ? '\n>>> FLUXO OK' : `\n>>> ${falhas} FALHA(S) NO FLUXO`);
process.exit(falhas === 0 ? 0 : 1);
