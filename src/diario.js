/* ============================================================================
   DESAFIO DO DIA — a mesma fase para todo mundo no mesmo dia (fuso local).
   ----------------------------------------------------------------------------
   Mesmo dia (na máquina do jogador) = mesma semente = mesmo mapa. A semente do
   dia entra na geração procedural, que já valida o mapa (piso e moedas
   alcançáveis). A recompensa (5 🪙) é paga uma única vez por dia, guardada no
   progresso pela chave da data.
   ============================================================================ */
import { gerarFase } from './procedural.js';
import { CONFIG } from './config.js';

/** Semente estável do dia: mutação simples de 'aaaa-mm-dd' (FNV-1a). */
export function sementeDoDia(dataISO) {
  let h = 0x811c9dc5;
  const s = `diario:${dataISO}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Dados da fase do dia. Determinístico: a mesma data devolve sempre a mesma
    fase (semente do dia nas tentativas do gerador procedural). */
export function desafioDoDia(dataISO) {
  const semente = sementeDoDia(dataISO);
  for (let t = 0; t < 24; t++) {
    const fase = gerarFase((semente + t * 7919) >>> 0);
    if (!fase || fase.origem === 'sala') continue;    // nada de sala aberta como desafio
    return {
      nome: `Desafio do dia — ${dataISO}`,
      moedas: fase.moedas ?? 3,
      distanciaMoedas: fase.distanciaMoedas ?? 2,
      moedasFixas: false,
      blocos: fase.blocos,
      pontes: fase.pontes || []
    };
  }
  return null;
}

/** Recompensa em moedas do desafio do dia (paga uma única vez por dia). */
export const RECOMPENSA_DIARIA = CONFIG.diarioRecompensa ?? 5;
