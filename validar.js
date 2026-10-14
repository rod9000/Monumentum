/* Validador das fases: lê os dados de src/dados/niveis.js (os mesmos do jogo)
   e testa cada uma — alcance a pé e de elevador, moedas, elevadores e sorteio.
   A plataforma de elevador é tratada como uma PONTE entre sua posição inicial
   e seu destino. As regras de caminhada vêm de src/grade.js (mesmas do jogo). */
import { NIVEIS } from './src/dados/niveis.js';
import { Grade, chave, alcancaveis } from './src/grade.js';

const HORIZONTAIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ---------- valida cada fase ---------- */
let falhas = 0;
for (const nivel of NIVEIS) {
  console.log(`\n=== ${nivel.nome} ===`);
  const g = new Grade(nivel.blocos, nivel.pontes);
  g.pontesLivres = true;                 // alcance: todas as pontes contam como arestas
  const temPonte = (nivel.pontes || []).length > 0;
  const temPulo = nivel.blocos.some(b => b.tipo === 'pulo');
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

  // pontas de ponte precisam ser blocos caminháveis
  for (const p of nivel.pontes || []) {
    for (const ponta of [p.a, p.b]) {
      if (!g.andavel(g.obter(ponta.x, ponta.y, ponta.z))) { console.log(`  X ponte com ponta não caminhável em (${ponta.x},${ponta.y},${ponta.z})`); falhas++; }
    }
    if (![0, 1, 2, 3].includes(p.angulo)) { console.log(`  X ponte com ângulo inválido: ${p.angulo}`); falhas++; }
    if (p.a.x !== p.b.x && p.a.z !== p.b.z) { console.log('  X ponte não é reta (as placas são em linha)'); falhas++; }
  }

  // isoladas A PÉ — só é problema em fases sem elevador nem ponte
  if (!temElevador && !temPonte && !temPulo) {
    const isolados = g.lista.filter(b => g.andavel(b) && b !== spawn && !g.rota(spawn, b))
      .map(b => `(${b.x},${b.y},${b.z})`);
    if (isolados.length) { console.log('  X blocos andáveis isolados:', isolados.join(' ')); falhas++; }
    else console.log('  todos os blocos caminháveis são alcançáveis a partir do spawn');
  } else {
    console.log('  fase com elevador/ponte: alcance verificado pelas arestas especiais');
  }

  // tudo alcançável, a pé ou de elevador
  const dist = alcancaveis(g, spawn);
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
