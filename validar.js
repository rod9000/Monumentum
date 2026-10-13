// Validador do protótipo: extrai o módulo do HTML, checa a sintaxe
// e simula a Grade + a Fase 1 (conectividade/rota até cada moeda).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const arquivo = path.join(__dirname, 'diorama-puzzle.html');
const html = fs.readFileSync(arquivo, 'utf8');

// 1) extrai o <script type="module">
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('FALHA: módulo não encontrado'); process.exit(1); }
const modulo = path.join(__dirname, 'jogo.extraido.mjs');
fs.writeFileSync(modulo, m[1]);
// limpa o arquivo temporário ao sair (mesmo em caso de erro)
process.on('exit', () => { try { fs.unlinkSync(modulo); } catch { /* já removido */ } });
console.log('módulo extraído:', m[1].length, 'caracteres');

// 2) checagem de sintaxe
try {
  execFileSync(process.execPath, ['--check', modulo], { stdio: 'pipe' });
  console.log('SINTAXE: OK');
} catch (e) {
  console.error('SINTAXE: FALHOU\n' + e.stderr.toString());
  process.exit(1);
}

// 3) simula a Grade + nível 1
//    (extrai NIVEIS do módulo sem executar o Three.js)
const src = m[1];
const ini = src.indexOf('const NIVEIS = [');
const fim = src.indexOf('let indiceNivel');
const codigoNiveis = src.slice(ini, fim).replace('const NIVEIS =', 'return');
const NIVEIS = new Function(codigoNiveis)();

const TIPOS_ANDAVEIS = new Set(['chao', 'moeda', 'spawn']);
const chave = (x, y, z) => `${x}|${y}|${z}`;

class Grade {
  constructor(blocos) {
    this.lista = blocos;
    this.mapa = new Map();
    for (const b of blocos) this.mapa.set(chave(b.x, b.y, b.z), b);
  }
  obter(x, y, z) { return this.mapa.get(chave(x, y, z)) || null; }
  tem(x, y, z) { return this.mapa.has(chave(x, y, z)); }
  andavel(b) {
    if (!b || !TIPOS_ANDAVEIS.has(b.tipo)) return false;
    return !this.tem(b.x, b.y + 1, b.z);
  }
  podeMover(de, para) {
    if (!this.andavel(para)) return false;
    const dx = Math.abs(para.x - de.x);
    const dz = Math.abs(para.z - de.z);
    const dy = Math.abs(para.y - de.y);
    if (dx + dz !== 1) return false;
    if (dy > 1) return false;
    return true;
  }
  vizinhos(b) {
    const v = [];
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]])
      for (const dy of [0,1,-1]) {
        const alvo = this.obter(b.x+dx, b.y+dy, b.z+dz);
        if (this.podeMover(b, alvo)) v.push(alvo);
      }
    return v;
  }
  rota(de, para) {
    if (de === para || !this.andavel(para)) return null;
    const ant = new Map([[chave(de.x,de.y,de.z), null]]);
    const fila = [de];
    while (fila.length) {
      const a = fila.shift();
      if (a === para) {
        const c = []; let p = a;
        while (p) { c.unshift(p); p = ant.get(chave(p.x,p.y,p.z)); }
        return c.slice(1);
      }
      for (const v of this.vizinhos(a)) {
        const k = chave(v.x,v.y,v.z);
        if (!ant.has(k)) { ant.set(k, a); fila.push(v); }
      }
    }
    return null;
  }
}

let falhas = 0;
for (const nivel of NIVEIS) {
  console.log('\n=== ' + nivel.nome + ' ===');
  const g = new Grade(nivel.blocos);
  const spawn = g.lista.find(b => b.tipo === 'spawn');
  const moedas = g.lista.filter(b => b.tipo === 'moeda');
  const contagem = {};
  g.lista.forEach(b => contagem[b.tipo] = (contagem[b.tipo] || 0) + 1);

  console.log('blocos:', g.lista.length, JSON.stringify(contagem));
  if (!spawn) { console.log('  X sem spawn!'); falhas++; }
  else console.log('  spawn em', `(${spawn.x}, ${spawn.y}, ${spawn.z})`);

  // moedas: se a fase tem moedas fixas, todas precisam ser alcançáveis;
  // se a fase sorteia (dados.moedas), o sorteio só pode escolher blocos
  // caminháveis alcançáveis — logo basta que TODOS os caminháveis sejam alcançáveis.
  let alcancaveis = 0;
  for (const md of moedas) {
    const r = g.rota(spawn, md);
    if (r) {
      alcancaveis++;
      console.log(`  moeda (${md.x},${md.y},${md.z}) -> rota de ${r.length} passos`);
    } else {
      console.log(`  X moeda (${md.x},${md.y},${md.z}) INALCANÇAVEL`);
      falhas++;
    }
  }

  // nenhum bloco andável isolado?
  const isolados = g.lista
    .filter(b => g.andavel(b) && b !== spawn && !g.rota(spawn, b))
    .map(b => `(${b.x},${b.y},${b.z})`);
  if (isolados.length) { console.log('  X blocos andáveis isolados:', isolados.join(' ')); falhas++; }
  else console.log('  todos os blocos caminháveis são alcançáveis a partir do spawn');

  // config de moedas: precisa caber na quantidade de candidatos disponíveis
  const candidatos = g.lista.filter(b => TIPOS_ANDAVEIS.has(b.tipo) && b !== spawn).length;
  const desejadas = nivel.moedas ?? 0;
  if (desejadas > candidatos) {
    console.log(`  X a fase pede ${desejadas} moedas, mas só há ${candidatos} candidatos`);
    falhas++;
  } else if (desejadas) {
    console.log(`  sorteio de ${desejadas} moedas entre ${candidatos} candidatos`);
  }

  // sanidade: nenhuma coordenada duplicada
  const vistas = new Set();
  for (const b of g.lista) {
    const k = chave(b.x, b.y, b.z);
    if (vistas.has(k)) { console.log('  X bloco duplicado em', k); falhas++; }
    vistas.add(k);
  }
  // sanidade: todo bloco tem os 4 campos
  for (const b of g.lista) {
    if (!['x','y','z','tipo'].every(c => c in b)) { console.log('  X bloco mal formado:', JSON.stringify(b)); falhas++; }
  }
}

console.log('\n' + (falhas === 0 ? '>>> VALIDAÇÃO OK' : `>>> ${falhas} FALHA(S)`));
process.exit(falhas === 0 ? 0 : 1);
