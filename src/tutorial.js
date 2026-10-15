/* ============================================================================
   TUTORIAL GUIADO (fases 1 a 5) — passos que avançam com ações reais do
   jogador (nada de timer). Cada passo: { texto, ...condição }.

   É uma máquina de estados pura: `iniciar(indice)` devolve os passos da fase,
   `evento(tipo)` avança quando a condição do passo atual é satisfeita, e a
   interface só desenha o que esta máquina manda. Os testes exercitam a máquina
   sem DOM.
   ============================================================================ */
import { TOQUE } from './sessao.js';
import { estado } from './estado.js';

const IR = TOQUE ? 'toque' : 'clique';
const TECLA = TOQUE ? 'no D-pad' : 'com W A S D';

/** Cada passo: { texto, evento } — o passo conclui quando o evento acontece. */
const PASSOS = {
  0: () => [
    { texto: '🎯 Objetivo: pegar todas as moedas do diorama.', evento: 'andou' },
    { texto: `${IR} no bloco ao lado (ou use ${TECLA}) para andar até ele.`, evento: 'andou' },
    { texto: 'Gire a tela com Q/E (ou botões ⟲ ⟳) para ver os ângulos do mapa.', evento: 'girou' },
    { texto: 'Pise no bloco da moeda para coletá-la.', evento: 'pegou-moeda' }
  ],
  1: () => [
    { texto: '🚧 Parede: não dá para passar — você vai ter de dar a volta.', evento: 'andou' },
    { texto: `${IR} num bloco distante: a bola procura o caminho sozinha.`, evento: 'andou' }
  ],
  2: () => [
    { texto: '🦘 Bloco de pulo (quadrado com círculo): aperte a mesma direção 2× seguidas para saltar até o outro bloco.', evento: 'pulou' },
    { texto: 'Uma seta só anda um passo normal. O par de blocos sempre volta.', evento: 'andou' }
  ],
  3: () => [
    { texto: '🪜 Escada: dá para subir 1 bloco por passo. Suba até o mirante.', evento: 'andou' },
    { texto: 'Use ＋ − (ou a rodinha) para aproximar e conferir os detalhes.', evento: 'andou' }
  ],
  4: () => [
    { texto: '🌀 Espiral: cada andar fica numa coluna diferente — siga subindo.', evento: 'andou' },
    { texto: 'Errou? Aperte ↺ para recomeçar a fase quando quiser.', evento: 'andou' }
  ]
};

/** Fases com tutorial: as 5 primeiras manuais. */
export const FASES_COM_TUTORIAL = 5;

/** Cria o painel. Só lida com a máquina: quem desenha é a interface
    (`elementos` com painel, texto e botões). */
export function criarTutorial({ elementos, progressoTutorial }) {
  let passos = [];
  let atual = 0;
  let indice = -1;

  function desenhar() {
    if (!elementos || atual >= passos.length) {
      elementos?.painel?.classList.remove('visivel');
      return;
    }
    elementos?.painel?.classList.add('visivel');
    if (elementos?.texto) elementos.texto.textContent = passos[atual].texto;
    if (elementos?.contador) elementos.contador.textContent = `${atual + 1}/${passos.length}`;
  }

  function avancar() {
    atual++;
    progressoTutorial?.(atual);
    desenhar();
  }

  return {
    /** Começa (ou não) o tutorial da fase: só as 5 primeiras, e só enquanto
        o jogador não tiver visto todos os passos. */
    iniciar(i) {
      indice = i;
      const feitos = progressoTutorial?.vistos(i) || 0;
      passos = i >= 0 && i < FASES_COM_TUTORIAL ? PASSOS[i]() : [];
      atual = (feitos || 0) >= passos.length ? passos.length : feitos;
      desenhar();
      return this.ativo;
    },
    /** Evento do jogo: 'andou', 'girou', 'pulou', 'pegou-moeda', 'subiu',
        'concluiu', 'caiu'. */
    evento(tipo) {
      if (atual >= passos.length) return;
      if (passos[atual].evento !== tipo) return;
      avancar();
    },
    /** Pula o resto do tutorial (a fase fica marcada como vista). */
    cancelar() {
      if (!passos.length) return;
      progressoTutorial?.(passos.length);
      passos = passos.map(() => ({ evento: '-' }));     // não avisa mais
      atual = 0;
      if (elementos?.painel) elementos.painel.classList.remove('visivel');
    },
    /** Volta a mostrar o tutorial da fase atual (revisão, pelo menu). */
    rever() {
      passos = indice >= 0 && indice < FASES_COM_TUTORIAL ? PASSOS[indice]() : [];
      atual = 0;
      progressoTutorial?.(0);
      desenhar();
    },
    get ativo() { return atual < passos.length; },
    /** Passo atual (para os testes). */
    get passo() { return atual; },
    get total() { return passos.length; }
  };
}

/** Texto de ajuda de controle (usado pela interface). */
export function legendaControles() {
  return TOQUE
    ? 'Ande com o D-pad, arraste para girar e pinche para dar zoom.'
    : 'Ande com W A S D (ou clique), Q/E giram a tela.';
}

/** Recomeça o tutorial da fase atual, quando a painel foi definida. */
export function reiniciarTutorial(progresso) {
  // devolve uma função que o main/painel usa (mantido simples e sem DOM)
  return () => {};
}
