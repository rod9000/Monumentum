/* ============================================================================
   SESSÃO DO NAVEGADOR — serviços do jogo inteiro: som, progresso salvo e
   dispositivo (toque ou não). Também guarda o "contexto da partida": o índice
   em jogo e os dados quando a fase não é numerada (desafio do dia / teste do
   editor), para que qualquer módulo possa recomeçar a tentativa atual.
   ============================================================================ */
import { criarSom } from './som.js';
import { criarProgresso } from './progresso.js';
import { ehDispositivoDeToque } from './toque.js';

export const TOQUE = ehDispositivoDeToque();   // celular/tablet: D-pad, gestos e layout compacto
export const som = criarSom();
export const progresso = criarProgresso();

/** Contexto da partida (módulo). */
export const ultimaTentativa = {
  indice: 0,    // índice da fase em jogo (-1 = dados soltos: diário/teste do editor)
  dados: null   // dados materializados quando indice === -1
};

/** Marca qual fase está em jogo (chamado por fase.js ao carregar). */
export function informarIndice(indice, dados = null) {
  ultimaTentativa.indice = indice;
  ultimaTentativa.dados = dados;
}
