/* ============================================================================
   BUILD — bundla src/main.js com esbuild e injeta o resultado no template
   ----------------------------------------------------------------------------
   Gera diorama-puzzle.html INLINE (um único <script type="module">), para que o
   jogo continue funcionando com duplo clique (file://). O Three.js continua
   vindo do importmap/CDN (external).

   Uso:  npm run build
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const MARCADOR = '<!--BUNDLE-->';

const template = fs.readFileSync(path.join(raiz, 'index.template.html'), 'utf8');
if (!template.includes(MARCADOR)) throw new Error(`marcador ${MARCADOR} não encontrado no template`);

const resultado = await build({
  entryPoints: [path.join(raiz, 'src', 'main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  external: ['three'],
  legalComments: 'none',
  write: false
});
const js = resultado.outputFiles[0].text.trimEnd();
if (/<\/script/i.test(js)) throw new Error('o bundle contém "</script" e quebraria o HTML');

const html = template.replace(MARCADOR, () => js);
fs.writeFileSync(path.join(raiz, 'diorama-puzzle.html'), html);
console.log(`diorama-puzzle.html gerado: ${html.length} caracteres (bundle ${js.length})`);
