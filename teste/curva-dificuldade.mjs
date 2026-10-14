/* Curva de dificuldade: a nota (média do par sobre 30 sorteios) de cada fase procedural,
   a tabela por faixa de 50 fases e os limites dos terços (LIMITE_FACIL e LIMITE_DIFICIL
   em src/par.js saem daqui). Leva uns 30 s, então não entra no `npm test`.
   Uso: npm run curva-dificuldade */
import { gerarFase } from '../src/procedural.js';
import { NIVEIS } from '../src/dados/niveis.js';
import { notaDeDificuldade, faixaDeDificuldade, LIMITE_FACIL, LIMITE_DIFICIL } from '../src/par.js';

const TOTAL = 500;                 // fases procedurais medidas, a partir da primeira
const FAIXA = 50;                  // fases por linha da tabela
const INICIO = NIVEIS.length;      // índice da primeira fase procedural

const media = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (g, f) => Math.round(100 * g.filter(f).length / g.length);

const fases = [];
for (let n = INICIO; n < INICIO + TOTAL; n++) {
  const dados = gerarFase(n);
  fases.push({ fase: n + 1, origem: dados.origem, ...notaDeDificuldade(dados) });
}

console.log(`Fases procedurais ${fases[0].fase} a ${fases[fases.length - 1].fase} (nota = média do par sobre 30 sorteios)\n`);
for (let i = 0; i < fases.length; i += FAIXA) {
  const g = fases.slice(i, i + FAIXA);
  const notas = g.map(x => x.media);
  console.log(
    `fases ${g[0].fase}-${g[g.length - 1].fase}: nota média ${media(notas).toFixed(1)} ` +
    `(${Math.min(...notas).toFixed(1)} a ${Math.max(...notas).toFixed(1)}), ` +
    `labirinto ${pct(g, x => x.origem === 'labirinto')}%, ilhas ${pct(g, x => x.origem === 'ilhas')}%, ` +
    `relevo ${pct(g, x => x.origem === 'relevo')}%`
  );
}

const ordenadas = fases.map(x => x.media).sort((a, b) => a - b);
const limiteFacil = ordenadas[Math.floor(ordenadas.length / 3)];
const limiteDificil = ordenadas[Math.floor((2 * ordenadas.length) / 3)];
console.log(`\nLimites dos terços: LIMITE_FACIL ≈ ${limiteFacil.toFixed(1)}, LIMITE_DIFICIL ≈ ${limiteDificil.toFixed(1)}`);

const manuais = NIVEIS.map(n => notaDeDificuldade({
  moedas: n.moedas,
  distanciaMoedas: n.distanciaMoedas ?? 3,
  distanciaEntreMoedas: n.distanciaEntreMoedas,
  moedasFixas: n.moedasFixas,
  seed: n.seed,
  pontes: n.pontes || [],
  blocos: n.blocos
}).media);
console.log(`Fases manuais (${NIVEIS.length}): nota de ${Math.min(...manuais).toFixed(1)} a ${Math.max(...manuais).toFixed(1)}`);

const contar = (notas, faixa) => notas.filter(n => faixaDeDificuldade(n) === faixa).length;
const procedurais = fases.map(x => x.media);
console.log(`\nCom LIMITE_FACIL = ${LIMITE_FACIL} e LIMITE_DIFICIL = ${LIMITE_DIFICIL}:`);
console.log(`  procedurais: fácil ${contar(procedurais, 'fácil')}, médio ${contar(procedurais, 'médio')}, difícil ${contar(procedurais, 'difícil')}`);
console.log(`  manuais: fácil ${contar(manuais, 'fácil')}, médio ${contar(manuais, 'médio')}, difícil ${contar(manuais, 'difícil')}`);
