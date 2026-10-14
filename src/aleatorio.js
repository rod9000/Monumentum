/* ============================================================================
   ALEATORIEDADE DETERMINÍSTICA — mesma semente, mesma sequência
   ============================================================================ */

/** Gerador mulberry32: devolve uma função que produz números em [0, 1). */
export function semente(valor) {
  let a = valor >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Embaralha `lista` no lugar (Fisher–Yates) usando o RNG `rnd`. */
export function embaralhar(lista, rnd) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
}
