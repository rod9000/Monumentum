/* Testes ESTÁTICOS da entrega: título, zoom do navegador, app para celular (manifest
   e ícone), jogo sem CDN (Three.js embutido) e elementos novos no HTML gerado. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lerRaiz = nome => fs.readFileSync(path.join(raiz, nome), 'utf8');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

console.log('--- modelo (index.template.html) ---');
const modelo = lerRaiz('index.template.html');
ok(modelo.includes('<title>Diorama Puzzle</title>'), 'título da página é "Diorama Puzzle"');
ok(!modelo.includes('maximum-scale'), 'o zoom do navegador não é bloqueado (acessibilidade)');
ok(modelo.includes('rel="manifest"') && modelo.includes('rel="icon"'), 'tem manifest e favicon');
ok(!/cdn\.jsdelivr|importmap|erro-cdn/.test(modelo), 'sem CDN, importmap ou aviso de CDN');
ok(modelo.includes('--tecla: clamp('), 'tamanho do D-pad se ajusta à altura da tela');

console.log('--- app para celular (manifest e ícone) ---');
const manifest = JSON.parse(lerRaiz('manifest.webmanifest'));
ok(manifest.name === 'Diorama Puzzle' && manifest.display === 'standalone', 'manifest: nome e modo tela cheia');
ok(manifest.start_url && manifest.icons?.length >= 1, 'manifest: página inicial e ícone');
ok(fs.existsSync(path.join(raiz, 'icone.svg')), 'ícone icone.svg existe');

console.log('--- HTML gerado (diorama-puzzle.html) ---');
const gerado = lerRaiz('diorama-puzzle.html');
ok((gerado.match(/<script type="module">/g) || []).length === 1, 'um único módulo embutido (funciona com duplo clique)');
ok(!/cdn\.jsdelivr|importmap/.test(gerado), 'o Three.js está dentro do arquivo (sem CDN)');
ok(gerado.length < 1_500_000, `tamanho razoável (${(gerado.length / 1024).toFixed(0)} KB)`);
for (const id of ['btn-menu', 'btn-som', 'passos', 'menu-fases', 'grade-fases', 'estatisticas', 'btn-dpad-cima']) {
  ok(gerado.includes(`id="${id}"`), `elemento #${id} presente`);
}
ok(gerado.includes('<title>Diorama Puzzle</title>'), 'HTML gerado tem o título novo');

console.log(falhas === 0 ? '\n>>> ESTRUTURA OK' : `\n>>> ${falhas} FALHA(S) NA ESTRUTURA`);
process.exit(falhas === 0 ? 0 : 1);
