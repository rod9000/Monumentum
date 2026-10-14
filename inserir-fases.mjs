/* ============================================================================
   INSERSOR DE FASES — lê fases-geradas.json e recompõe o array NIVEIS no HTML
   ----------------------------------------------------------------------------
   Idempotente: pode ser rodado várias vezes seguidas sem corromper o arquivo.
   A Fase 1 é preservada (blocos e configuração lidos do HTML); as demais fases
   vêm do JSON gerado por gerar-fases.mjs.

   Uso:  node gerar-fases.mjs && node inserir-fases.mjs
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(aqui, 'diorama-puzzle.html');
const jsonPath = path.join(aqui, 'fases-geradas.json');

const html = fs.readFileSync(htmlPath, 'utf8');

let fases;
try {
  fases = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (e) {
  console.error('não foi possível ler fases-geradas.json:', e.message);
  process.exit(1);
}
if (!Array.isArray(fases) || !fases.length) {
  console.error('fases-geradas.json vazio ou inválido');
  process.exit(1);
}

/* ---------- 1. lê a Fase 1 do HTML atual (por parsing, não por recorte) ---------- */
const i1 = html.indexOf("nome: 'Fase 1");
const i2 = html.indexOf("nome: 'Fase 2");
if (i1 < 0 || i2 < 0) { console.error('não achei as fases no HTML'); process.exit(1); }
const seg = html.slice(i1, i2);

// casa o começo do bloco (o `}` pode vir depois, no caso dos elevadores)
const RE_BLOCO = /\{\s*x: (-?\d+),\s*y: (-?\d+),\s*z: (-?\d+),\s*tipo: '(\w+)'/g;
const blocosFase1 = [...seg.matchAll(RE_BLOCO)]
  .map(m => ({ x: +m[1], y: +m[2], z: +m[3], tipo: m[4] }));
if (blocosFase1.length < 5) { console.error('não consegui ler os blocos da Fase 1'); process.exit(1); }

const fase1 = {
  nome: /nome: '([^']+)'/.exec(seg)?.[1] || 'Fase 1',
  moedas: Number(/moedas: (\d+)/.exec(seg)?.[1] ?? 0),
  distanciaMoedas: Number(/distanciaMoedas: (\d+)/.exec(seg)?.[1] ?? 3),
  blocos: blocosFase1
};

/* ---------- 2. formata todas as fases como código JS ---------- */
function blocoParaTexto(b, recuo) {
  const base = `${recuo}{ x: ${b.x}, y: ${b.y}, z: ${b.z}, tipo: '${b.tipo}'`;
  if (!b.elev) return base + ' },';
  return `${base},\n${recuo}  elev: { eixo: '${b.elev.eixo}', para: { x: ${b.elev.para.x}, y: ${b.elev.para.y}, z: ${b.elev.para.z} } } },`;
}

function faseParaTexto(f) {
  const linhas = [];
  let zAtual = null;
  for (const b of f.blocos) {
    if (b.z !== zAtual) { linhas.push(`        /* ---- z = ${b.z} ---- */`); zAtual = b.z; }
    linhas.push(blocoParaTexto(b, '        '));
  }
  const config = [`moedas: ${f.moedas ?? 0}`];
  if (f.distanciaMoedas != null) config.push(`distanciaMoedas: ${f.distanciaMoedas}`);
  if (f.seed != null) config.push(`seed: ${f.seed}`);
  if (f.moedasFixas) config.push('moedasFixas: true');

  return `    {
      nome: '${f.nome}',
      ${config.join(', ')},
      blocos: [
${linhas.join('\n')}
      ]
    }`;
}

const todas = [fase1, ...fases];
const novoNiveis = `const NIVEIS = [
${todas.map(faseParaTexto).join(',\n\n')}
  ];`;

/* ---------- 3. substitui o bloco inteiro no HTML ---------- */
const inicio = html.indexOf('const NIVEIS = [');
const fim = html.indexOf('let indiceNivel = 0;');
if (inicio < 0 || fim < 0) { console.error('limites de NIVEIS não encontrados'); process.exit(1); }

const novoHtml = html.slice(0, inicio) + novoNiveis + '\n\n  ' + html.slice(fim);

/* ---------- 4. sanidade antes de gravar ---------- */
const totalFases = todas.length;
const totalBlocos = todas.reduce((s, f) => s + f.blocos.length, 0);
const blocosNoArquivo = (novoHtml.slice(novoHtml.indexOf('const NIVEIS = ['),
  novoHtml.indexOf('let indiceNivel = 0;')).match(RE_BLOCO) || []).length;

if (blocosNoArquivo !== totalBlocos) {
  console.error(`contagem de blocos inesperada: ${blocosNoArquivo} (esperado ${totalBlocos})`);
  process.exit(1);
}
if (/(nome: 'Fase[^']*'\s*,\s*(moedas|blocos))/.test(novoHtml) === false) {
  console.error('formato das fases parece quebrado');
  process.exit(1);
}

fs.writeFileSync(htmlPath, novoHtml);
console.log(`NIVEIS recomposto via JSON: ${totalFases} fases, ${totalBlocos} blocos`);
console.log('  ' + todas.map(f => `${f.nome} (${f.blocos.length})`).join(' · '));
