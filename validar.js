/* Validador do protótipo: extrai o módulo do HTML, checa a sintaxe e testa os
   dados de todas as fases — incluindo elevadores (a plataforma é uma PONTE
   entre sua posição inicial e seu destino). */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const arquivo = path.join(__dirname, 'diorama-puzzle.html');
const html = fs.readFileSync(arquivo, 'utf8');

/* ---------- 1. extrai o módulo ---------- */
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('FALHA: módulo não encontrado'); process.exit(1); }
const modulo = path.join(__dirname, 'jogo.extraido.mjs');
fs.writeFileSync(modulo, m[1]);
process.on('exit', () => { try { fs.unlinkSync(modulo); } catch { /* já removido */ } });
console.log('módulo extraído:', m[1].length, 'caracteres');

/* ---------- 2. sintaxe ---------- */
try {
  execFileSync(process.execPath, ['--check', modulo], { stdio: 'pipe' });
  console.log('SINTAXE: OK');
} catch (e) {
  console.error('SINTAXE: FALHOU\n' + e.stderr.toString());
  process.exit(1);
}

/* ---------- 3. dados das fases ---------- */
const src = m[1];
const ini = src.indexOf('const NIVEIS = [');
const fim = src.indexOf('let indiceNivel');
if (ini < 0 || fim < 0) { console.error('NIVEIS não encontrado'); process.exit(1); }
const codigoNiveis = src.slice(ini, fim).replace('const NIVEIS =', 'return');
const NIVEIS = new Function(codigoNiveis)();

/* ---------- 4. regras (as mesmas do jogo) ---------- */
const TIPOS_ANDAVEIS = new Set(['chao', 'moeda', 'spawn', 'elevador']);
const chave = (x, y, z) => `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
const HORIZONTAIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
    return dx + dz === 1 && dy <= 1;
  }
  vizinhos(b) {
    const v = [];
    for (const [dx, dz] of HORIZONTAIS) {
      for (const dy of [0, 1, -1]) {
        const alvo = this.obter(b.x + dx, b.y + dy, b.z + dz);
        if (this.podeMover(b, alvo)) v.push(alvo);
      }
    }
    return v;
  }
  rota(de, para) {
    if (de === para || !this.andavel(para)) return null;
    const ant = new Map([[chave(de.x, de.y, de.z), null]]);
    const fila = [de];
    while (fila.length) {
      const a = fila.shift();
      if (a === para) {
        const c = []; let p = a;
        while (p) { c.unshift(p); p = ant.get(chave(p.x, p.y, p.z)); }
        return c.slice(1);
      }
      for (const v of this.vizinhos(a)) {
        const k = chave(v.x, v.y, v.z);
        if (!ant.has(k)) { ant.set(k, a); fila.push(v); }
      }
    }
    return null;
  }
  /** Alcance tratando elevadores como ponte entre início e destino. */
  alcance(de) {
    const dist = new Map([[chave(de.x, de.y, de.z), 0]]);
    const nos = new Map();
    for (const b of this.lista) if (this.andavel(b)) nos.set(chave(b.x, b.y, b.z), b);
    const elevadores = this.lista.filter(b => b.elev);
    const fila = [{ b: de, d: 0 }];
    while (fila.length) {
      const { b: atual, d } = fila.shift();
      const empurrar = alvo => {
        const k = chave(alvo.x, alvo.y, alvo.z);
        if (dist.has(k)) return;
        dist.set(k, d + 1);
        fila.push({ b: alvo, d: d + 1 });
      };
      for (const [dx, dz] of HORIZONTAIS) {
        for (const dy of [0, 1, -1]) {
          const viz = nos.get(chave(atual.x + dx, atual.y + dy, atual.z + dz));
          if (viz) empurrar(viz);
        }
      }
      for (const e of elevadores) {
        // sobe no elevador (a partir da posição inicial dele)
        if (chave(e.x, e.y, e.z) === chave(atual.x, atual.y, atual.z)) empurrar(e.elev.para);
        // desce do elevador (a partir do destino dele)
        if (chave(e.elev.para.x, e.elev.para.y, e.elev.para.z) === chave(atual.x, atual.y, atual.z)) empurrar(e);
      }
    }
    return dist;
  }
}

/* ---------- 5. valida cada fase ---------- */
let falhas = 0;
for (const nivel of NIVEIS) {
  console.log(`\n=== ${nivel.nome} ===`);
  const g = new Grade(nivel.blocos);
  const spawn = nivel.blocos.find(b => b.tipo === 'spawn');
  const moedas = g.lista.filter(b => b.tipo === 'moeda');
  const temElevador = g.lista.some(b => b.elev);
  const contagem = {};
  g.lista.forEach(b => contagem[b.tipo] = (contagem[b.tipo] || 0) + 1);

  console.log('blocos:', g.lista.length, JSON.stringify(contagem));
  if (!spawn) { console.log('  X sem spawn!'); falhas++; }
  else console.log('  spawn em', `(${spawn.x}, ${spawn.y}, ${spawn.z})`);

  for (const md of moedas) {
    const r = g.rota(spawn, md);
    if (r) console.log(`  moeda (${md.x},${md.y},${md.z}) -> rota de ${r.length} passos`);
    else { console.log(`  X moeda (${md.x},${md.y},${md.z}) INALCANÇAVEL`); falhas++; }
  }

  // isoladas A PÉ — só é problema em fases sem elevador
  if (!temElevador) {
    const isolados = g.lista.filter(b => g.andavel(b) && b !== spawn && !g.rota(spawn, b))
      .map(b => `(${b.x},${b.y},${b.z})`);
    if (isolados.length) { console.log('  X blocos andáveis isolados:', isolados.join(' ')); falhas++; }
    else console.log('  todos os blocos caminháveis são alcançáveis a partir do spawn');
  } else {
    console.log('  fase com elevador: alcance verificado pela ponte inicio<->destino');
  }

  // tudo alcançável, a pé ou de elevador
  const dist = g.alcance(spawn);
  const inalcancaveis = g.lista.filter(b => g.andavel(b) && b !== spawn && !dist.has(chave(b.x, b.y, b.z)));
  if (inalcancaveis.length) {
    console.log('  X inalcançáveis mesmo com elevador:',
      inalcancaveis.map(b => chave(b.x, b.y, b.z)).join(' '));
    falhas++;
  } else {
    console.log('  todos os blocos caminháveis são alcançáveis (a pé ou de elevador)');
  }

  // elevadores: duas pontas precisam encostar em algo caminhável
  for (const e of g.lista.filter(b => b.elev)) {
    for (const [rot, cel] of [['início', { x: e.x, y: e.y, z: e.z }], ['destino', e.elev.para]]) {
      const viz = HORIZONTAIS.flatMap(([dx, dz]) => [0, 1, -1].map(dy => g.obter(cel.x + dx, cel.y + dy, cel.z + dz)))
        .filter(v => g.andavel(v));
      if (!viz.length) { console.log(`  X elevador sem apoio na ponta ${rot}`); falhas++; }
      else console.log(`  elevador (${e.x},${e.y},${e.z}) -> (${e.elev.para.x},${e.elev.para.y},${e.elev.para.z}): apoio nas duas pontas`);
    }
    if (!['x', 'y', 'z'].includes(e.elev.eixo)) { console.log('  X eixo do elevador inválido'); falhas++; }
    const deslocamento = Math.abs(e.elev.para.x - e.x) + Math.abs(e.elev.para.y - e.y) + Math.abs(e.elev.para.z - e.z);
    if (deslocamento < 1) { console.log('  X elevador com destino igual à origem'); falhas++; }
  }

  // config de moedas
  const candidatos = g.lista.filter(b => g.andavel(b) && b !== spawn && dist.has(chave(b.x, b.y, b.z))).length;
  const desejadas = nivel.moedas ?? 0;
  if (desejadas > candidatos) {
    console.log(`  X a fase pede ${desejadas} moedas, mas só há ${candidatos} candidatos`);
    falhas++;
  } else if (desejadas) {
    console.log(`  sorteio de ${desejadas} moedas entre ${candidatos} candidatos`);
  }

  // sanidade
  const vistas = new Set();
  for (const b of g.lista) {
    if (!['x', 'y', 'z', 'tipo'].every(c => c in b)) { console.log('  X bloco mal formado:', JSON.stringify(b)); falhas++; }
    const k = chave(b.x, b.y, b.z);
    if (vistas.has(k)) { console.log('  X bloco duplicado em', k); falhas++; }
    vistas.add(k);
  }
}

console.log('\n' + (falhas === 0 ? '>>> VALIDAÇÃO OK' : `>>> ${falhas} FALHA(S)`));
process.exit(falhas === 0 ? 0 : 1);
