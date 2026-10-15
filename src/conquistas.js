/* ============================================================================
   CONQUISTAS — regras puras: dadas as estatísticas do progresso, quais
   conquistas passam a valer. O desenho/aviso fica com a interface.
   Cada conquista: { id, nome, quanto: descrição, ok: estado => boolean }.
   ============================================================================ */
export const CONQUISTAS = [
  { id: 'primeira-fase', nome: 'Primeiro Passo', quanto: 'Conclua a primeira fase', ok: e => e.fasesConcluidas >= 1 },
  { id: 'cinco-sem-cair', nome: 'Pé de Chumbo', quanto: 'Conclua uma fase sem cair no vão', ok: e => Object.values(e.quedas).some(q => q === 0) },
  { id: 'tres-estrelas-3', nome: 'Caçador de Ouro', quanto: 'Ganhe 3 estrelas em uma fase', ok: e => e.tresEstrelas >= 1 },
  { id: 'tres-estrelas-10', nome: 'Perfeccionista', quanto: 'Ganhe 3 estrelas em 10 fases', ok: e => e.tresEstrelas >= 10 },
  { id: 'usou-tudo', nome: 'Explorador', quanto: 'Use pulo, ponte e elevador', ok: e => e.usouTudo },
  { id: 'semana-do-diario', nome: 'Semana Perfeita', quanto: 'Conclua 7 dias seguidos de desafio do dia', ok: e => e.sequenciaDoDia >= 7 },
  { id: 'mes-do-diario', nome: 'Rotina de Herói', quanto: 'Conclua 30 dias seguidos de desafio do dia', ok: e => e.sequenciaDoDia >= 30 },
  { id: 'primeira-skin', nome: 'Estilizado', quanto: 'Compre uma skin na loja', ok: e => e.skinsCompradas >= 1 },
  { id: 'colecionador', nome: 'Colecionador', quanto: 'Compre 3 skins na loja', ok: e => e.skinsCompradas >= 3 }
];

const USOS = ['pulo', 'ponte', 'elevador', 'portal'];

/** Quais conquistas ainda não foram dadas e passaram a valer. */
export function verificarConquistas(estado = {}) {
  const dadas = new Set(estado.conquistas || []);
  const cheio = {
    ...estado,
    usouTudo: USOS.every(nome => Object.values(estado.usos || {}).some(u => u[nome]))
  };
  return CONQUISTAS.filter(c => !dadas.has(c.id) && c.ok(cheio)).map(c => c.id);
}
