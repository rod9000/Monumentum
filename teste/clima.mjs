/* Testes do CLIMA por fase (sem DOM e sem Three.js):
   - cada fase cai num clima válido, de forma determinística;
   - a sequência se repete e a Fase 1 começa no dia claro;
   - número inválido ou negativo não quebra. */
import { CLIMAS, climaDaFase } from '../src/clima.js';

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  [ok] ' : '  [FALHA] ') + msg); if (!cond) falhas++; };

console.log('--- clima por fase ---');
ok(CLIMAS.length >= 4, 'há pelo menos 4 climas');
ok(CLIMAS.every(c => Number.isInteger(c.ceu) && Number.isInteger(c.sol) && c.intensidadeSol > 0),
   'cada clima tem cores inteiras e sol com intensidade positiva');
ok(climaDaFase(0) === CLIMAS[0], 'Fase 1 (índice 0) começa no primeiro clima');
ok(climaDaFase(7) === climaDaFase(7), 'mesmo índice, mesmo clima (determinístico)');
ok(climaDaFase(CLIMAS.length) === CLIMAS[0], 'a sequência se repete depois do último clima');
ok(climaDaFase(-3) === CLIMAS[0] && climaDaFase(NaN) === CLIMAS[0], 'índice inválido cai no primeiro clima');
ok(new Set(CLIMAS.map(c => c.ceu)).size === CLIMAS.length, 'cores de céu são todas diferentes');

console.log(falhas === 0 ? '\n>>> CLIMA OK' : `\n>>> ${falhas} FALHA(S) EM CLIMA`);
process.exit(falhas === 0 ? 0 : 1);
