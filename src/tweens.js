/* ============================================================================
   TWEENS — animações com duração (surgir e coletar moedas, queda do vão).
   aoAtualizar recebe o progresso p (0..1); aoTerminar roda ao chegar em 1.
   ============================================================================ */
const tweens = [];

export function tween(duracao, aoAtualizar, aoTerminar = null, atraso = 0, alvo = null) {
  tweens.push({ t: -atraso, duracao, aoAtualizar, aoTerminar, alvo });
}

/** Cancela animações pendentes de um objeto (ex.: moeda que foi coletada). */
export function cancelarTweens(alvo) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    if (tweens[i].alvo === alvo) tweens.splice(i, 1);
  }
}

export function atualizarTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    if (tw.t < 0) continue;                 // ainda no atraso inicial
    const p = Math.min(tw.t / tw.duracao, 1);
    tw.aoAtualizar(p);
    if (p >= 1) {
      tweens.splice(i, 1);
      if (tw.aoTerminar) tw.aoTerminar();
    }
  }
}
