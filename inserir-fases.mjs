/* ============================================================================
   INSERSOR DE FASES — lê fases-geradas.json e recompõe o array NIVEIS no HTML
   ----------------------------------------------------------------------------
   A Fase 1 é preservada exatamente como está no HTML (blocos e configuração);
   as demais fases vêm do JSON gerado por gerar-fases.mjs.

   Uso:  node gerar-fases.mjs && node inserir-fases.mjs
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(aqui, 'diorama-puzzle.html');
const jsonPath = path.join(aqui, 'fases-geradas.json');

const html = fs.readFileSync(htmlPath, 'utf8');
const fases = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!Array.isArray(fases) || !fases.length) {
  console.error('fases-geradas.json vazio ou inválido');
  process.exit(1);
}

/* ---------- 1. extrai a Fase 1 do HTML atual ---------- */
const i1 = html.indexOf("nome: 'Fase 1");
const i2 = html.indexOf("nome: 'Fase 2");
if (i1 < 0 || i2 < 0) { console.error('não achei as fases no HTML'); process.exit(1); }
const fase1 = html.slice(i1, i2).trim().replace(/,\s*$/, '');   // remove a vírgula final

/* ---------- 2. formata as fases do JSON como código JS ---------- */
function blocoParaTexto(b, recuo) {
  const base = `${recuo}{ x: ${b.x}, y: ${b.y}, z: ${b.z}, tipo: '${b.tipo}'`;
  if (!b.elev) return base + ' },';
  return `${base},\n${recuo}  elev: { eixo: '${b.elev.eixo}', para: { x: ${b.elev.para.x}, y: ${b.elev.para.y}, z: ${b.elev.para.z} } } },`;
}

function faseParaTexto(f) {
  const linhas = f.blocos.map(b => blocoParaTexto(b, '        '));
  // agrupa por z com um comentário, para o arquivo continuar legível
  const comComentarios = [];
  let zAtual = null;
  for (const b of f.blocos) {
    if (b.z !== zAtual) { comComentarios.push(`        /* ---- z = ${b.z} ---- */`); zAtual = b.z; }
    comComentarios.push(blocoParaTexto(b, '        '));
  }
  const config = [`moedas: ${f.moedas ?? 0}`];
  if (f.distanciaMoedas != null) config.push(`distanciaMoedas: ${f.distanciaMoedas}`);
  if (f.seed != null) config.push(`seed: ${f.seed}`);
  if (f.moedasFixas) config.push('moedasFixas: true');

  return `    {
      nome: '${f.nome}',
      ${config.join(', ')},
      blocos: [
${comComentarios.join('\n')}
      ]
    }`;
}

const outras = fases.map(faseParaTexto).join(',\n\n');
const novoNiveis = `const NIVEIS = [
    {
    ${fase1}
    },

${outras}
  ];`;

/* ---------- 3. substitui o bloco inteiro no HTML ---------- */
const inicio = html.indexOf('const NIVEIS = [');
const fim = html.indexOf('let indiceNivel = 0;');
if (inicio < 0 || fim < 0) { console.error('limites de NIVEIS não encontrados'); process.exit(1); }

const novoHtml = html.slice(0, inicio) + novoNiveis + '\n\n  ' + html.slice(fim);

/* ---------- 4. sanidade antes de gravar ---------- */
const totalFases = (novoHtml.match(/nome: 'Fase/g) || []).length;
const totalBlocos = (novoHtml.match(/\{\s*x: -?\d+,\s*y: -?\d+,\s*z: -?\d+,\s*tipo: '(\w+)'/g) || []).length;
const esperadoBlocos = fases.reduce((s, f) => s + f.blocos.length, 0) + (html.slice(i1, i2).match(/\{\s*x: -?\d+,\s*y: -?\d+,\s*z: -?\d+,\s*tipo: '(\w+)'/g) || []).length;

if (totalFases !== fases.length + 1) {
  console.error(`esperava ${fases.length + 1} fases, encontrei ${totalFases}`);
  process.exit(1);
}
if (totalBlocos !== esperadoBlocos) {
  console.error(`contagem de blocos inesperada: ${totalBlocos} (esperado ${esperadoBlocos})`);
  process.exit(1);
}

fs.writeFileSync(htmlPath, novoHtml);
console.log(`NIVEIS recomposto: ${totalFases} fases, ${totalBlocos} blocos`);
