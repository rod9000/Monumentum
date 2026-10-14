/* Testes das SKINS da bola (sem DOM):
   - catálogo: a inicial é grátis e há 5 skins pagas de 50 moedas cada;
   - saldo = moedas ganhas menos o gasto; não compra sem saldo nem duas vezes;
   - comprar já equipa; equipar só vale para skin comprada;
   - persistência no navegador e migração de saves antigos. */
import { criarProgresso } from '../src/progresso.js';
import { SKINS, SKIN_PADRAO, PRECO_SKIN } from '../src/skins.js';
import { PADROES, desenharPadrao } from '../src/padroes.js';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/** Armazenamento em memória com a mesma forma do localStorage. */
const memoria = (inicial = {}) => {
  const d = { ...inicial };
  return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, dados: d };
};

console.log('--- catálogo ---');
const pagas = SKINS.filter(s => s.id !== SKIN_PADRAO);
ok(SKINS.length === 6 && pagas.length === 5, '6 aparências: a inicial e 5 pagas');
ok(SKINS[0].id === SKIN_PADRAO && SKINS[0].preco === 0, 'a inicial vem primeiro e é grátis');
ok(PRECO_SKIN === 50 && pagas.every(s => s.preco === 50), 'cada skin paga custa 50 moedas');
ok(new Set(SKINS.map(s => s.id)).size === SKINS.length, 'ids das skins são únicos');
ok(SKINS.every(s => /^#[0-9a-f]{6}$/i.test(s.cor) && /^#[0-9a-f]{6}$/i.test(s.emissiva)), 'cores em formato #rrggbb');

console.log('--- saldo e compra ---');
{
  const arm = memoria();
  const p = criarProgresso(arm);
  ok(p.skinAtual === SKIN_PADRAO && p.possui(SKIN_PADRAO) && p.saldo === 0, 'começa com a skin inicial e saldo 0');
  ok(p.comprar('oceano', 50) === false && !p.possui('oceano'), 'sem moedas, não compra');
  p.concluir(0, { moedas: 30, passos: 10, tempo: 5, par: 10 });
  ok(p.saldo === 30 && p.total === 30, 'concluir a fase com 30 moedas: saldo 30');
  ok(p.comprar('oceano', 50) === false && !p.possui('oceano'), 'com 30 moedas não compra skin de 50');
  p.concluir(1, { moedas: 25, passos: 10, tempo: 5, par: 10 });
  ok(p.saldo === 55, 'segunda fase soma: saldo 55');
  ok(p.comprar('oceano', 50) === true && p.possui('oceano') && p.saldo === 5, 'com 55 compra a skin de 50 e sobra 5');
  ok(p.skinAtual === 'oceano', 'comprar já equipa a skin');
  ok(p.comprar('oceano', 50) === false && p.saldo === 5, 'não compra a mesma skin duas vezes (não gasta de novo)');
  ok(p.total === 55, 'gastar não diminui o total ganho');
  ok(JSON.parse(arm.dados['diorama-progresso-v2']).gasto === 50, 'o gasto fica salvo no navegador');
}

console.log('--- equipar ---');
{
  const p = criarProgresso(memoria());
  p.concluir(0, { moedas: 120, passos: 10, tempo: 5, par: 10 });
  p.comprar('gelo', 50);
  p.comprar('dourada', 50);
  ok(p.saldo === 20, 'comprou duas skins: saldo 20');
  ok(p.equipar('gelo') === true && p.skinAtual === 'gelo', 'equipa uma skin já comprada');
  ok(p.equipar('floresta') === false && p.skinAtual === 'gelo', 'não equipa skin que ainda não comprou');
  ok(p.equipar(SKIN_PADRAO) === true && p.skinAtual === SKIN_PADRAO, 'volta para a skin inicial');
}

console.log('--- persistência e saves antigos ---');
{
  const arm = memoria();
  const p = criarProgresso(arm);
  p.concluir(0, { moedas: 60, passos: 10, tempo: 5, par: 10 });
  p.comprar('cosmica', 50);
  const q = criarProgresso(arm);          // simula recarregar a página
  ok(q.possui('cosmica') && q.skinAtual === 'cosmica' && q.saldo === 10,
     'skin comprada, equipada e saldo sobrevivem a recarregar');
}
{
  const arm = memoria({ 'diorama-progresso-v2': '{"total": 10, "fases": {}}' });
  const p = criarProgresso(arm);
  ok(p.saldo === 10 && p.possui(SKIN_PADRAO) && p.skinAtual === SKIN_PADRAO,
     'save sem campos de skin: saldo igual ao total e skin inicial');
}
{
  const arm = memoria({ 'diorama-progresso-v2': '{"total": 10, "gasto": 0, "fases": {}, "skins": ["x"], "skinAtual": "naoexiste"}' });
  const p = criarProgresso(arm);
  ok(p.possui('x') && p.skinAtual === SKIN_PADRAO, 'skin equipada que não existe volta para a inicial');
}
{
  const arm = memoria({ 'diorama-total-moedas': '7', 'diorama-progresso': '0' });
  const p = criarProgresso(arm);
  ok(p.saldo === 7 && p.skinAtual === SKIN_PADRAO, 'migração da versão antiga também traz o saldo e a skin inicial');
}
{
  const arm = memoria({ 'diorama-progresso-v2': '{"total": 10, "gasto": 99, "fases": {}}' });
  const p = criarProgresso(arm);
  ok(p.saldo === 0, 'gasto maior que o total nunca deixa o saldo negativo');
}

console.log('--- padrões (desenho em canvas, sem navegador) ---');
{
  const hex = /^#[0-9a-f]{6}$/i;
  ok(SKINS.every(s => PADROES.includes(s.padrao)), 'cada skin usa um padrão conhecido');
  ok(SKINS.filter(s => s.padrao !== 'liso').every(s => hex.test(s.detalhe)), 'padrões têm cor de detalhe válida');
  ok(new Set(SKINS.map(s => s.padrao)).size >= 4, 'as skins têm padrões diferentes entre si');

  /** Contexto 2D falso: conta retângulos e círculos desenhados. */
  const gravar = () => {
    const c = { retangulos: 0, circulos: 0, fillStyle: null };
    c.fillRect = () => { c.retangulos++; };
    c.beginPath = () => {};
    c.arc = () => { c.circulos++; };
    c.fill = () => {};
    return c;
  };
  const base = { cor: '#000000', detalhe: '#ffffff' };
  const desenhar = padrao => { const c = gravar(); desenharPadrao(c, 512, 256, { ...base, padrao }); return c; };
  const liso = desenhar('liso');
  ok(liso.retangulos === 1 && liso.circulos === 0, 'liso: só o fundo');
  ok(desenhar('faixas').retangulos === 5, 'faixas: fundo + 4 faixas');
  ok(desenhar('gomos').retangulos === 5, 'gomos: fundo + 4 gomos');
  ok(desenhar('xadrez').retangulos === 33, 'xadrez: fundo + 32 quadrados (metade do tabuleiro de 8x8)');
  ok(desenhar('bolinhas').circulos === 64, 'bolinhas: 8x8 = 64 círculos');
  ok(desenhar('padrao-inexistente').circulos === 0 && desenhar('padrao-inexistente').retangulos === 1,
     'padrão desconhecido cai para a cor lisa');
}

console.log(falhas === 0 ? '\n>>> SKINS OK' : `\n>>> ${falhas} FALHA(S) EM SKINS`);
process.exit(falhas === 0 ? 0 : 1);
