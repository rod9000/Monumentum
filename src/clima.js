/* ============================================================================
   CLIMA DA FASE — cor do céu e luz do sol por fase (sem Three.js).
   Cada fase cai em um clima pelo número; a sequência se repete.
   ============================================================================ */

export const CLIMAS = [
  { nome: 'Dia claro',  ceu: 0xbfe3f2, sol: 0xfff3dd, intensidadeSol: 1.55 },
  { nome: 'Entardecer', ceu: 0xf6b38a, sol: 0xffc58a, intensidadeSol: 1.30 },
  { nome: 'Nublado',    ceu: 0xc9d3d9, sol: 0xe6e9ec, intensidadeSol: 0.95 },
  { nome: 'Noite',      ceu: 0x1d2b4f, sol: 0xa9bcff, intensidadeSol: 0.70 },
  { nome: 'Amanhecer',  ceu: 0xf4c6d6, sol: 0xffe2c2, intensidadeSol: 1.20 }
];

/** Clima da fase `indice` (0 = Fase 1). Determinístico: mesmo número, mesmo clima. */
export function climaDaFase(indice) {
  const i = Math.max(0, Math.floor(indice) || 0);
  return CLIMAS[i % CLIMAS.length];
}
