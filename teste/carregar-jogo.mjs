/* ============================================================================
   CARREGAR O JOGO PARA OS TESTES
   ----------------------------------------------------------------------------
   Bundla src/main.js (com esbuild) trocando o 'three' pelo mock e acrescentando
   um `export { ... }` com o estado interno que os testes precisam. O resultado
   vai para teste/jogo-teste.mjs (arquivo gerado, ignorado pelo git).

   Antes de chamar `carregarJogo`, os testes devem definir os mocks globais
   (window, requestAnimationFrame, document...), pois o módulo roda ao importar.
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const SAIDA = path.join(aqui, 'jogo-teste.mjs');

/** Gera o bundle de teste e devolve o módulo importado. `exportar` = nomes
    do escopo do jogo (ex.: ['grade', 'estado', 'carregarNivel']). */
export async function carregarJogo(exportar = []) {
  const resultado = await build({
    entryPoints: [path.join(raiz, 'src', 'main.js')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'teste-do-jogo',
      setup(b) {
        // o Three real não roda no Node: usa o mock
        b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(aqui, 'mock-three.mjs') }));
        // acrescenta o `export` com o estado interno, só no arquivo de teste
        b.onLoad({ filter: /src[\\/]main\.js$/ }, async args => {
          const codigo = await fs.promises.readFile(args.path, 'utf8');
          return {
            contents: codigo + `\nexport { ${exportar.join(', ')} };\n`,
            loader: 'js',
            resolveDir: path.dirname(args.path)
          };
        });
      }
    }]
  });
  fs.writeFileSync(SAIDA, resultado.outputFiles[0].text);
  return import(pathToFileURL(SAIDA).href);
}
