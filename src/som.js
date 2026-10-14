/* ============================================================================
   SONS — efeitos sintetizados com WebAudio (sem arquivos de áudio).
   - O som só começa depois de um toque ou tecla do jogador (regra dos navegadores):
     `desbloquear()` é chamado nesses eventos.
   - O mudo fica salvo no navegador (chave 'diorama-mudo').
   - Sem WebAudio (Node, navegador antigo), tudo vira silêncio sem erro.
   ============================================================================ */

/** Cada efeito é uma lista de notas: f = frequência (Hz), t = início (s),
    d = duração (s), v = volume, tipo = forma de onda, varre = frequência final (opcional). */
export const NOTAS = {
  passo:  [{ f: 520, t: 0, d: 0.05, tipo: 'triangle', v: 0.10 }],
  moeda:  [{ f: 988, t: 0, d: 0.09, tipo: 'sine', v: 0.22 }, { f: 1319, t: 0.08, d: 0.14, tipo: 'sine', v: 0.22 }],
  pulo:   [{ f: 300, t: 0, d: 0.22, tipo: 'sawtooth', v: 0.08, varre: 780 }],
  queda:  [{ f: 420, t: 0, d: 0.55, tipo: 'sawtooth', v: 0.10, varre: 70 }],
  giro:   [{ f: 240, t: 0, d: 0.12, tipo: 'square', v: 0.05, varre: 360 }],
  ponte:  [{ f: 660, t: 0, d: 0.12, tipo: 'sine', v: 0.12 }],
  fase:   [{ f: 523, t: 0, d: 0.12, tipo: 'triangle', v: 0.20 },
           { f: 659, t: 0.12, d: 0.12, tipo: 'triangle', v: 0.20 },
           { f: 784, t: 0.24, d: 0.30, tipo: 'triangle', v: 0.22 }],
  erro:   [{ f: 180, t: 0, d: 0.18, tipo: 'square', v: 0.07 }]
};

const CHAVE_MUDO = 'diorama-mudo';

/** Cria o controle de som. `armazenamento` e `criarContexto` podem ser trocados nos testes. */
export function criarSom(armazenamento = globalThis.localStorage,
                         criarContexto = () => (globalThis.AudioContext ? new globalThis.AudioContext() : null)) {
  let mudo = false;
  try { mudo = armazenamento?.getItem(CHAVE_MUDO) === '1'; } catch { /* sem armazenamento: começa com som */ }
  let ctx = null;

  function salvarMudo() {
    try { armazenamento?.setItem(CHAVE_MUDO, mudo ? '1' : '0'); } catch { /* segue só nesta sessão */ }
  }

  return {
    get mudo() { return mudo; },

    alternarMudo() {
      mudo = !mudo;
      salvarMudo();
      return mudo;
    },

    /** Cria o contexto de áudio na primeira interação do jogador. */
    desbloquear() {
      if (!ctx) {
        try { ctx = criarContexto(); } catch { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
    },

    tocar(nome) {
      if (mudo || !ctx) return;
      const agora = ctx.currentTime;
      for (const n of NOTAS[nome] || []) {
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = n.tipo;
        osc.frequency.setValueAtTime(n.f, agora + n.t);
        if (n.varre) osc.frequency.exponentialRampToValueAtTime(n.varre, agora + n.t + n.d);
        ganho.gain.setValueAtTime(0.0001, agora + n.t);
        ganho.gain.exponentialRampToValueAtTime(n.v, agora + n.t + 0.01);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + n.t + n.d);
        osc.connect(ganho);
        ganho.connect(ctx.destination);
        osc.start(agora + n.t);
        osc.stop(agora + n.t + n.d + 0.02);
      }
    }
  };
}
