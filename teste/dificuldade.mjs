/* Testes da NOTA DE DIFICULDADE (média do par sobre sorteios de moedas) e das faixas.
   - a mesma fase dá a mesma nota, e a nota fica entre o mínimo e o máximo;
   - a nota não altera os dados da fase (procedural e manual);
   - fase com moedas fixas ou com semente própria usa uma conta só;
   - as faixas seguem os limites; todas as fases manuais e as procedurais têm nota. */
import { gerarFase } from '../src/procedural.js';
import { NIVEIS } from '../src/dados/niveis.js';
import { notaDeDificuldade, faixaDeDificuldade, LIMITE_FACIL, LIMITE_DIFICIL, SORTEIOS_DA_NOTA } from '../src/par.js';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

/** Campos da fase manual como `materializarNivel` os passa para a nota. */
const manual = n => ({
  moedas: n.moedas,
  distanciaMoedas: n.distanciaMoedas ?? 3,
  distanciaEntreMoedas: n.distanciaEntreMoedas,
  moedasFixas: n.moedasFixas,
  seed: n.seed,
  pontes: n.pontes || [],
  blocos: n.blocos
});

console.log('--- estabilidade ---');
{
  const a = notaDeDificuldade(gerarFase(25));
  const b = notaDeDificuldade(gerarFase(25));
  ok(a.media === b.media && a.min === b.min && a.max === b.max, `a mesma fase dá a mesma nota (${a.media.toFixed(1)})`);
  ok(a.amostras === SORTEIOS_DA_NOTA, `fase sorteada usa ${SORTEIOS_DA_NOTA} sorteios`);
  ok(a.min <= a.media && a.media <= a.max, 'a média fica entre o mínimo e o máximo');
}

console.log('--- não altera os dados da fase ---');
{
  const fase = gerarFase(40);
  const antes = JSON.stringify(fase);
  notaDeDificuldade(fase);
  ok(JSON.stringify(fase) === antes, 'procedural: blocos e moedas continuam iguais');
  const nivel = manual(NIVEIS[3]);
  const antesManual = JSON.stringify(nivel);
  notaDeDificuldade(nivel);
  ok(JSON.stringify(nivel) === antesManual, 'manual: a fase em NIVEIS não é alterada');
}

console.log('--- moedas fixas ou semente própria: uma conta só ---');
{
  // corredor de 0 a 6; spawn em 0; moedas fixas em 3 e 6 => par = 6 passos
  const blocos = [];
  for (let x = 0; x <= 6; x++) blocos.push({ x, y: 0, z: 0, tipo: x === 0 ? 'spawn' : x === 3 || x === 6 ? 'moeda' : 'chao' });
  const fixa = notaDeDificuldade({ moedas: 2, moedasFixas: true, blocos, pontes: [] });
  ok(fixa.amostras === 1 && fixa.media === 6, `moedas fixas: 1 conta, par = ${fixa.media} (esperado 6)`);

  const semMoedas = blocos.map(b => ({ ...b, tipo: b.tipo === 'moeda' ? 'chao' : b.tipo }));
  const comSemente = notaDeDificuldade({ moedas: 2, seed: 7, distanciaMoedas: 1, blocos: semMoedas, pontes: [] });
  ok(comSemente.amostras === 1 && comSemente.media !== null, 'semente própria da fase: 1 conta');
}

console.log('--- faixas ---');
ok(LIMITE_FACIL < LIMITE_DIFICIL, `os limites estão em ordem (${LIMITE_FACIL} < ${LIMITE_DIFICIL})`);
ok(faixaDeDificuldade(LIMITE_FACIL - 1) === 'fácil', `nota ${LIMITE_FACIL - 1} = fácil`);
ok(faixaDeDificuldade((LIMITE_FACIL + LIMITE_DIFICIL) / 2) === 'médio', 'nota no meio = médio');
ok(faixaDeDificuldade(LIMITE_DIFICIL + 1) === 'difícil', `nota ${LIMITE_DIFICIL + 1} = difícil`);
ok(faixaDeDificuldade(null) === null, 'sem nota, sem faixa');

console.log('--- todas as fases têm nota ---');
{
  const notasManuais = NIVEIS.map(n => notaDeDificuldade(manual(n)).media);
  ok(notasManuais.every(m => m !== null && m > 0),
     `as ${NIVEIS.length} fases manuais têm nota (de ${Math.min(...notasManuais).toFixed(1)} a ${Math.max(...notasManuais).toFixed(1)})`);
  const notasProcedurais = [];
  for (let n = NIVEIS.length; n < NIVEIS.length + 40; n++) notasProcedurais.push(notaDeDificuldade(gerarFase(n)).media);
  ok(notasProcedurais.every(m => m !== null), 'as 40 primeiras fases procedurais têm nota');
}

console.log(falhas === 0 ? '\n>>> DIFICULDADE OK' : `\n>>> ${falhas} FALHA(S) NA DIFICULDADE`);
process.exit(falhas === 0 ? 0 : 1);
