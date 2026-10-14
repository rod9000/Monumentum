/* Testes do PAR da fase (cálculo de passos até cada moeda) e das estrelas pelo par.
   Os mapas são pequenos e os números esperados saem de contas feitas à mão. */
import { Grade } from '../src/grade.js';
import { calcularPar, estrelasDoPar } from '../src/par.js';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/** Monta uma grade a partir de uma linha de células: cada item é [x, y, z, tipo, extra?]. */
const grade = blocos => new Grade(blocos.map(([x, y, z, tipo, extra]) => ({ x, y, z, tipo, ...(extra || {}) })));

console.log('--- passos até cada moeda (caminho reto) ---');
{
  // corredor de 0 a 20; spawn em 0; moedas em 6, 12 e 20
  const blocos = [];
  for (let x = 0; x <= 20; x++) blocos.push([x, 0, 0, x === 0 ? 'spawn' : ([6, 12, 20].includes(x) ? 'moeda' : 'chao')]);
  const r = calcularPar(grade(blocos));
  ok(r.par === 20, `3 moedas em linha reta (6, 12, 20): par = ${r.par} passos (esperado 20)`);
  ok(JSON.stringify(r.passosPorMoeda) === '[6,12,20]', `passos até cada moeda: ${JSON.stringify(r.passosPorMoeda)} (esperado [6,12,20])`);
}
{
  // a moeda mais perto é a 2; o caminho certo é 0 -> 2 -> 4 (4 passos), não 0 -> 4 -> 2
  const blocos = [[0, 0, 0, 'spawn'], [1, 0, 0, 'chao'], [2, 0, 0, 'moeda'], [3, 0, 0, 'chao'], [4, 0, 0, 'moeda']];
  const r = calcularPar(grade(blocos));
  ok(r.par === 4, `a ordem importa: par = ${r.par} (esperado 4: primeiro a moeda do 2, depois a do 4)`);
}

console.log('--- elevador: a viagem não conta como passo ---');
{
  // 0,1,2 chão | 3 elevador (sobe para 5) | 4 vão | 5 destino do elevador | 6 chão | 7 moeda
  const blocos = [
    [0, 0, 0, 'spawn'], [1, 0, 0, 'chao'], [2, 0, 0, 'chao'],
    [3, 0, 0, 'elevador', { elev: { eixo: 'x', para: { x: 5, y: 0, z: 0 } } }],
    [6, 0, 0, 'chao'], [7, 0, 0, 'moeda']
  ];
  const r = calcularPar(grade(blocos));
  // passos: 0->1, 1->2, 2->elevador (entrar), [viagem grátis], destino->6, 6->7 = 5
  ok(r.par === 5, `moeda do outro lado do elevador: par = ${r.par} (esperado 5: entrar, sair, andar)`);
}

console.log('--- pulo: um passo para atravessar o vão ---');
{
  // ilha A (0..2) e ilha B (6..8) ligadas por dois blocos de pulo (2 e 6)
  const blocos = [
    [0, 0, 0, 'spawn'], [1, 0, 0, 'chao'], [2, 0, 0, 'pulo'],
    [6, 0, 0, 'pulo'], [7, 0, 0, 'chao'], [8, 0, 0, 'moeda']
  ];
  const r = calcularPar(grade(blocos));
  // 0->1, 1->2 (pulo), pulo 2->6 (1), 6->7, 7->8 = 5
  ok(r.par === 5, `moeda do outro lado do vão, com pulo: par = ${r.par} (esperado 5)`);
}

console.log('--- moeda inalcançável ---');
{
  const blocos = [[0, 0, 0, 'spawn'], [1, 0, 0, 'chao'], [5, 0, 0, 'moeda']];
  const r = calcularPar(grade(blocos));
  ok(r.par === null && r.passosPorMoeda[0] === null, 'moeda sem caminho: par desconhecido (null)');
}

console.log('--- estrelas pelo par ---');
ok(estrelasDoPar(24, 20) === 3, 'par 20: 24 passos dá 3 estrelas (menos que 25)');
ok(estrelasDoPar(25, 20) === 2, 'par 20: 25 passos dá 2 estrelas');
ok(estrelasDoPar(30, 20) === 2, 'par 20: 30 passos dá 2 estrelas');
ok(estrelasDoPar(31, 20) === 1, 'par 20: 31 passos dá 1 estrela (passou de 30)');
ok(estrelasDoPar(20, 20) === 3, 'fazer o par (20 passos) dá 3 estrelas');
ok(estrelasDoPar(50, 40) === 2 && estrelasDoPar(49, 40) === 3 && estrelasDoPar(61, 40) === 1,
   'a regra escala com o tamanho da fase (par 40: 3 até 49, 2 até 60, 1 acima)');
ok(estrelasDoPar(10, null) === 1, 'sem par conhecido, a conclusão vale 1 estrela');

console.log(falhas === 0 ? '\n>>> PAR OK' : `\n>>> ${falhas} FALHA(S) NO PAR`);
process.exit(falhas === 0 ? 0 : 1);
