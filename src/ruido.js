/* ============================================================================
   RUÍDO COM SEMENTE — relevo orgânico para os mapas procedurais
   ----------------------------------------------------------------------------
   Ruído de valor 2D com interpolação suave e soma de oitavas (fBm). A mesma
   semente sempre dá o mesmo campo, então o mapa continua reproduzível.
   Devolve valores em [0, 1].
   ============================================================================ */
import { semente } from './aleatorio.js';

const TAM = 256;

/** Cria uma função ruido(x, z) -> [0, 1], determinística pela semente. */
export function criarRuido(seed) {
  const rnd = semente(seed);
  const tabela = new Float64Array(TAM);
  for (let i = 0; i < TAM; i++) tabela[i] = rnd();

  const valor = (x, z) => tabela[((x * 374761393 + z * 668265263) ^ (x >>> 1)) & (TAM - 1)];

  const base = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = x - xi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = valor(xi, zi), b = valor(xi + 1, zi);
    const c = valor(xi, zi + 1), d = valor(xi + 1, zi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };

  /** Soma de oitavas (fBm), normalizada para [0, 1]. */
  return (x, z, oitavas = 3) => {
    let soma = 0, amp = 1, freq = 1, total = 0;
    for (let o = 0; o < oitavas; o++) {
      soma += amp * base(x * freq, z * freq);
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return soma / total;
  };
}
