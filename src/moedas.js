/* ============================================================================
   SORTEIO PADRONIZADO DE MOEDAS — lógica pura (recebe o RNG e a semente)
   ============================================================================ */
import { semente, embaralhar } from './aleatorio.js';
import { CONFIG } from './config.js';
import { chave, distanciasComElevador } from './grade.js';

/* ============================================================================
   4.1) RANDOMIZAÇÃO PADRONIZADA DE MOEDAS
   ----------------------------------------------------------------------------
   Cada fase declara quantas moedas ter (`dados.moedas`). O sorteio segue
   sempre a mesma regra:
     1. só entram blocos caminháveis que não sejam o spawn;
     2. só entram blocos ALCANÇÁVEIS a partir do spawn (nunca fica impossível);
     3. respeitam uma distância mínima do spawn e umas das outras;
     4. com `dados.seed` fixo, o sorteio é reproduzível; sem ele, é aleatório.
   Use `dados.moedasFixas: true` para manter as moedas já escritas no array.
   ============================================================================ */
export function sortearMoedas(dados, grade, sementeFixa = CONFIG.sementeFixa) {
  if (dados.moedasFixas) return;              // fase com moedas posicionadas à mão: não mexe
  // limpa moedas de uma partida anterior
  for (const b of grade.lista) if (b.tipo === 'moeda') b.tipo = 'chao';

  const total = dados.moedas ?? 0;
  if (!total) return;

  // semente: `seed` da fase > `CONFIG.sementeFixa` > aleatório (padrão).
  // Sem semente, cada partida (e cada reinício) tem moedas em lugares novos.
  const sementeUsada = dados.seed ?? sementeFixa;
  const rnd = sementeUsada == null ? Math.random : semente(sementeUsada);
  const spawn = grade.lista.find(b => b.tipo === 'spawn') || grade.lista[0];
  const distMin = dados.distanciaMoedas ?? 3;        // passos mínimos do spawn
  const entreMin = dados.distanciaEntreMoedas ?? 2;  // passos mínimos entre moedas

  // distância (em passos) de cada bloco até o spawn, passando pelos elevadores
  const dist = distanciasComElevador(grade, spawn);

  // 1) só entram blocos realmente caminháveis (nada em cima, tipo válido);
  // 2) só entram blocos ALCANÇÁVEIS a partir do spawn (nunca fica impossível);
  // 3) NUNCA o bloco do elevador — ele viraria moeda e a plataforma sumiria
  //    (o elevador continua existindo na grade, mas a malha vira uma moeda)
  const candidatos = grade.lista.filter(b =>
    grade.andavel(b) && b.tipo !== 'ponte' && b.tipo !== 'pulo' && b !== spawn && !b.elev && (dist.get(chave(b.x, b.y, b.z)) ?? Infinity) >= distMin);
  embaralhar(candidatos, rnd);

  const escolhidas = [];
  for (const c of candidatos) {
    if (escolhidas.length >= total) break;
    const espacada = escolhidas.every(m =>
      Math.abs(m.x - c.x) + Math.abs(m.y - c.y) + Math.abs(m.z - c.z) >= entreMin);
    if (espacada) escolhidas.push(c);
  }
  // completa com as candidatas restantes se a distância mínima não permitiu
  // preencher tudo (moeda em bloco andável nunca bloqueia o caminho)
  for (const c of candidatos) {
    if (escolhidas.length >= total) break;
    if (!escolhidas.includes(c)) escolhidas.push(c);
  }

  for (const b of escolhidas) b.tipo = 'moeda';
}
