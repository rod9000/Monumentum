/* ============================================================================
   GERADORES DE LAYOUT (funções puras, determinísticas com um RNG semeado)
   ----------------------------------------------------------------------------
   Usados pelo gerador de fases (gerar-fases.mjs) e pela geração procedural
   (src/procedural.js). Não dependem do Three.js nem do DOM.
   ============================================================================ */
import { embaralhar } from '../aleatorio.js';

/** Labirinto perfeito (recursive backtracker) numa grade `lado x lado`.
 *  As salas ficam nas coordenadas ímpares; a borda é sempre parede.
 *  Devolve um Set com as chaves "x,z" das células que são PAREDE. */
export function gerarLabirinto(lado, rnd, chanceAtalho = 0.2) {
  const salas = (lado - 1) / 2;
  const k = (x, z) => `${x},${z}`;
  const paredes = new Set();
  for (let x = 0; x < lado; x++) for (let z = 0; z < lado; z++) paredes.add(k(x, z));
  const visitadas = new Set([k(0, 0)]);
  paredes.delete(k(1, 1));
  const pilha = [[0, 0]];
  while (pilha.length) {
    const [cx, cz] = pilha[pilha.length - 1];
    const opcoes = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => [cx + dx, cz + dz])
      .filter(([nx, nz]) => nx >= 0 && nz >= 0 && nx < salas && nz < salas && !visitadas.has(k(nx, nz)));
    if (!opcoes.length) { pilha.pop(); continue; }
    const [nx, nz] = opcoes[Math.floor(rnd() * opcoes.length)];
    visitadas.add(k(nx, nz));
    paredes.delete(k(nx * 2 + 1, nz * 2 + 1));          // sala nova
    paredes.delete(k(cx + nx + 1, cz + nz + 1));        // parede entre as duas salas
    pilha.push([nx, nz]);
  }
  // atalhos: abre paredes internas para criar ciclos (labirinto com rotas alternativas)
  const internas = [...paredes].filter(s => {
    const [x, z] = s.split(',').map(Number);
    return x > 0 && z > 0 && x < lado - 1 && z < lado - 1;
  });
  embaralhar(internas, rnd);
  for (const s of internas) if (rnd() < chanceAtalho) paredes.delete(s);
  return paredes;
}

/** Células de uma espiral quadrada (anéis concêntricos, de fora para dentro),
 *  em ordem de visita: cada célula é adjacente à seguinte. Serve de rota para
 *  rampas/escadas em espiral. */
export function gerarEspiral(lado) {
  const cel = [];
  let x0 = 0, z0 = 0, x1 = lado - 1, z1 = lado - 1;
  while (x0 <= x1 && z0 <= z1) {
    for (let x = x0; x <= x1; x++) cel.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) cel.push([x1, z]);
    for (let x = x1 - 1; x >= x0; x--) cel.push([x, z1]);
    for (let z = z1 - 1; z > z0; z--) cel.push([x0, z]);
    x0++; z0++; x1--; z1--;
  }
  return cel;
}

/** Escada reta: cada degrau sobe 1 em Y e anda 1 em Z (x fixo), sempre em
 *  coluna (x,z) distinta — um degrau NUNCA pode ficar acima de outro, porque
 *  a célula de cima tamparia a de baixo e ela deixaria de ser caminhável.
 *  Os vãos abaixo de cada degrau são preenchidos com 'parede' (e 'chao' no
 *  piso) até encostar em algo que já exista. */
export function escadaReta(x0, z0, y0, passos, dz, existe) {
  const blocos = [];
  for (let i = 0; i < passos; i++) {
    const x = x0, y = y0 + i, z = z0 + dz * i;
    for (let k = y - 1; k >= 0 && !existe(x, k, z); k--) {
      blocos.push({ x, y: k, z, tipo: k === 0 ? 'chao' : 'parede' });
    }
    if (!existe(x, y, z)) blocos.push({ x, y, z, tipo: 'chao' });
  }
  return blocos;
}
