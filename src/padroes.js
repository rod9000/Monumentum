/* ============================================================================
   PADRÕES DAS SKINS — desenho em canvas 2D, sem Three.js (testável no Node).
   A textura cobre a esfera inteira: o eixo X é a volta em torno da bola e o
   eixo Y vai de polo a polo. Como os padrões param de repetir em 8 colunas
   (e linhas), a emenda da volta fica certinha.
   ============================================================================ */

export const PADROES = ['liso', 'faixas', 'gomos', 'bolinhas', 'xadrez'];

/** Desenha o padrão da skin no contexto 2D (fundo com `cor` e detalhes com `detalhe`). */
export function desenharPadrao(ctx, largura, altura, s) {
  ctx.fillStyle = s.cor;
  ctx.fillRect(0, 0, largura, altura);
  if (!PADROES.includes(s.padrao) || s.padrao === 'liso') return;

  const n = 8;                       // repetições ao longo da volta
  const passoX = largura / n;
  const passoY = altura / n;
  ctx.fillStyle = s.detalhe;

  if (s.padrao === 'faixas') {       // faixas horizontais (anéis em volta da bola)
    for (let r = 0; r < n; r += 2) ctx.fillRect(0, r * passoY, largura, passoY);
  } else if (s.padrao === 'gomos') { // gomos verticais, como uma bola de futebol antiga
    for (let c = 0; c < n; c += 2) ctx.fillRect(c * passoX, 0, passoX, altura);
  } else if (s.padrao === 'bolinhas') {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        ctx.beginPath();
        ctx.arc(c * passoX + passoX / 2, r * passoY + passoY / 2, passoX * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (s.padrao === 'xadrez') {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if ((r + c) % 2 === 0) ctx.fillRect(c * passoX, r * passoY, passoX, passoY);
      }
    }
  }
}
