/* ============================================================================
   ESTADO COMPARTILHADO DO JOGO — um único objeto, lido e alterado pelo main.js
   e pela cena (giro da câmera). Campos da partida atual (uma fase por vez).
   ============================================================================ */
export const estado = {
  giroAtual: 0,           // rotação atual da câmera (radianos)
  giroAlvo: 0,            // rotação desejada (sempre múltiplo de 90°)
  passo: null,            // passo em andamento { de, para, bloco, t, pulo }
  fila: [],               // próximos blocos do caminho
  blocoAtual: null,       // bloco onde o personagem está (ou está indo)
  concluido: false,       // fase concluída (tela de conclusão aberta)
  caindo: false,          // caiu no vão: a fase está reiniciando
  aguardandoPonte: null,  // { destino, ponte, t }: espera a câmera alinhar
  setaPulo: null,         // seta no bloco de pulo esperando a 2ª { t, timer, ix, iz }
  geracao: 0,             // muda a cada fase carregada: cancela esperas da fase anterior
  passos: 0,              // passos dados nesta tentativa (pontuação)
  inicioMs: 0             // quando esta tentativa começou (tempo da pontuação)
};
