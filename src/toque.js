/* ============================================================================
   CONTROLES DE TOQUE — funções puras (testáveis no Node, sem DOM)
   ----------------------------------------------------------------------------
   - classificarGesto: toque (anda), arraste horizontal (gira 90°), pinça (zoom)
   - direcaoDoMundo: seta da tela (D-pad ou teclado) -> direção na grade, conforme o giro
   - maisProximoDoToque: quando o toque não acerta um bloco, usa o mais próximo
   - ehDispositivoDeToque: mostra o D-pad e o layout de celular
   ============================================================================ */

export const TOQUE_MAX_PX = 12;        // até este deslocamento é toque (não arraste)
export const ARRASTE_MIN_PX = 60;      // deslocamento mínimo para virar arraste horizontal
export const ARRASTE_MAX_MS = 500;     // um arraste rápido gira a câmera
export const RAIO_TOQUE_PX = 24;       // tolerância para o bloco mais próximo
const DIST_PINCA_MIN_PX = 8;           // variação da distância entre dedos para contar como pinça

/** Classifica o gesto de um ou dois dedos. Devolve 'toque', 'arraste-h', 'arraste' ou 'pinca'. */
export function classificarGesto({ dx = 0, dy = 0, ms = 0, dedos = 1, distIni = 0, distFim = 0 }) {
  if (dedos >= 2) return Math.abs(distFim - distIni) >= DIST_PINCA_MIN_PX ? 'pinca' : 'toque';
  if (Math.hypot(dx, dy) <= TOQUE_MAX_PX) return 'toque';
  if (Math.abs(dx) >= ARRASTE_MIN_PX && Math.abs(dx) > Math.abs(dy) && ms <= ARRASTE_MAX_MS) return 'arraste-h';
  return 'arraste';
}

/** Fator de zoom de uma pinça: distância atual / distância anterior. */
export function fatorDePinca(distAnterior, distAtual) {
  return distAnterior > 0 ? distAtual / distAnterior : 1;
}

/** Direção da tela ([x, y], y para cima) -> direção na grade (ix, iz), conforme o
    giro da câmera (yaw). Reduz ao eixo dominante: o movimento fica alinhado. */
export function direcaoDoMundo(dir, yaw) {
  const frenteX = -Math.cos(yaw), frenteZ = -Math.sin(yaw);  // "fundo da tela"
  const dirX = Math.sin(yaw), dirZ = -Math.cos(yaw);         // "direita da tela"
  const mx = dirX * dir[0] + frenteX * dir[1];
  const mz = dirZ * dir[0] + frenteZ * dir[1];
  const ix = Math.abs(mx) >= Math.abs(mz) ? Math.sign(mx) : 0;
  const iz = Math.abs(mx) >= Math.abs(mz) ? 0 : Math.sign(mz);
  return { ix, iz };
}

/** Entre candidatos { sx, sy, bloco } (já na tela), o bloco mais perto do toque
    dentro do raio; null se nenhum estiver perto o bastante. */
export function maisProximoDoToque(candidatos, px, py, raio = RAIO_TOQUE_PX) {
  let melhor = null, distMelhor = raio;
  for (const c of candidatos) {
    const d = Math.hypot(c.sx - px, c.sy - py);
    if (d <= distMelhor) { distMelhor = d; melhor = c; }
  }
  return melhor ? melhor.bloco : null;
}

/** Dispositivo de toque: ponteiro grosso (dedo) ou suporte a toque. */
export function ehDispositivoDeToque(win = globalThis.window) {
  if (!win) return false;
  if (typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in win;
}
