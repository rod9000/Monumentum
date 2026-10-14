/* Testes das regras PURAS de progresso, estrelas e som (sem DOM).
   - moedas só entram no total ao concluir, e cada fase conta uma vez;
   - migração do progresso antigo (chaves de versões anteriores);
   - estrelas pelo par da fase, recorde de passos; mudo salvo; sons com e sem contexto. */
import { criarProgresso, textoEstrelas } from '../src/progresso.js';
import { criarSom, NOTAS } from '../src/som.js';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/** Armazenamento em memória com a mesma forma do localStorage. */
const memoria = (inicial = {}) => {
  const d = { ...inicial };
  return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, dados: d };
};

console.log('--- moedas: só valem ao concluir ---');
{
  const arm = memoria();
  const p = criarProgresso(arm);
  ok(p.total === 0, 'começa sem moedas');
  const r1 = p.concluir(0, { moedas: 3, passos: 12, tempo: 20, par: 12 });
  ok(p.total === 3 && r1.ganho === 3, 'concluir a fase 1 com 3 moedas soma 3 ao total');
  const r2 = p.concluir(0, { moedas: 3, passos: 12, tempo: 19, par: 12 });
  ok(p.total === 3 && r2.ganho === 0, 'refazer a fase 1 não soma as mesmas moedas de novo');
  ok(JSON.parse(arm.dados['diorama-progresso-v2']).total === 3, 'o total fica salvo no navegador');
}

console.log('--- migração do progresso antigo ---');
{
  const arm = memoria({ 'diorama-total-moedas': '7', 'diorama-progresso': '2' });
  const p = criarProgresso(arm);
  ok(p.total === 7, 'migra o total de moedas da versão antiga');
  ok(p.concluida(0) && p.concluida(1) && !p.concluida(2), 'migra as fases concluídas (0 e 1)');
  const r = p.concluir(0, { moedas: 3, passos: 9, tempo: 10, par: 9 });
  ok(r.ganho === 0 && p.total === 7, 'fase já concluída antes da migração não rende moedas de novo');
  ok(p.maiorConcluida() === 1 && p.aberta(2) && !p.aberta(3), 'fases abertas: até a próxima depois da maior concluída');
}
{
  const arm = memoria({ 'diorama-progresso-v2': '{"total": "x", "fases": null}' });
  const p = criarProgresso(arm);
  ok(p.total === 0 && p.maiorConcluida() === -1, 'dado salvo corrompido não quebra: começa do zero');
}

console.log('--- estrelas pelo par da fase ---');
{
  const p = criarProgresso(memoria());
  const a = p.concluir(4, { moedas: 3, passos: 20, tempo: 30, par: 20 });
  ok(a.estrelas === 3 && a.par === 20 && a.primeira && a.passosRecorde === 20,
     'fazer o par (20 passos de meta 20): 3 estrelas e primeiro recorde');
  const b = p.concluir(4, { moedas: 3, passos: 25, tempo: 40, par: 20 });
  ok(b.estrelas === 2 && b.passosRecorde === 20, '25 passos com meta 20: 2 estrelas (recorde continua 20)');
  const c = p.concluir(4, { moedas: 3, passos: 31, tempo: 50, par: 20 });
  ok(c.estrelas === 1, '31 passos com meta 20: 1 estrela (passou de 30)');
  ok(p.recorde(4).estrelas === 3, 'guarda a melhor quantidade de estrelas da fase');
}
{
  const p = criarProgresso(memoria());
  const a = p.concluir(2, { moedas: 2, passos: 20, tempo: 30, par: null });
  ok(a.estrelas === 1 && a.par === null, 'sem meta conhecida, a conclusão vale 1 estrela');
}
{
  const p = criarProgresso(memoria());
  p.concluir(4, { moedas: 2, passos: 20, tempo: 30, par: 20 });
  const b = p.concluir(4, { moedas: 2, passos: 15, tempo: 40, par: 20 });
  ok(b.novoRecorde && b.recordeAnterior === 20 && b.passosRecorde === 15, 'tentativa com menos passos: novo recorde (15)');
  const c = p.concluir(4, { moedas: 2, passos: 17, tempo: 25, par: 20 });
  ok(!c.novoRecorde && c.passosRecorde === 15, 'tentativa com mais passos: recorde mantido');
}
ok(textoEstrelas(2) === '⭐⭐☆' && textoEstrelas(3) === '⭐⭐⭐', 'texto das estrelas com 3 posições');

console.log('--- som ---');
{
  const arm = memoria();
  const s = criarSom(arm, () => null);             // sem contexto de áudio (Node)
  ok(s.mudo === false, 'começa com som');
  ok(s.alternarMudo() === true && arm.dados['diorama-mudo'] === '1', 'alternar liga o mudo e salva');
  s.tocar('moeda');                                  // sem contexto: não pode dar erro
  ok(criarSom(arm, () => null).mudo === true, 'o mudo salvo vale na próxima vez');
  ok(s.alternarMudo() === false && arm.dados['diorama-mudo'] === '0', 'desligar o mudo volta ao som');
}
{
  const chamadas = [];
  const fakeCtx = {
    currentTime: 0, state: 'running', destination: {},
    createOscillator: () => { chamadas.push('osc'); return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, start() {}, stop() {} }; },
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} })
  };
  const s = criarSom(memoria(), () => fakeCtx);
  s.tocar('moeda');                                  // antes de desbloquear: nada
  ok(chamadas.length === 0, 'sem desbloquear (sem gesto do jogador), não toca');
  s.desbloquear();
  s.tocar('moeda');
  ok(chamadas.length === NOTAS.moeda.length, `tocar a moeda cria ${NOTAS.moeda.length} notas`);
  s.alternarMudo();
  chamadas.length = 0;
  s.tocar('moeda');
  ok(chamadas.length === 0, 'no mudo, nenhum som é criado');
}
ok(['passo', 'moeda', 'pulo', 'queda', 'giro', 'ponte', 'fase', 'erro'].every(n => NOTAS[n]?.length),
   'todos os efeitos existem e têm notas');

console.log(falhas === 0 ? '\n>>> PROGRESSO E SOM OK' : `\n>>> ${falhas} FALHA(S) EM PROGRESSO E SOM`);
process.exit(falhas === 0 ? 0 : 1);
