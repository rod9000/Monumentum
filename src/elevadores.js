/* ============================================================================
   ELEVADORES (plataformas móveis) — dados e movimentação, sem Three.js
   ----------------------------------------------------------------------------
   Um bloco 'elevador' é uma plataforma que vaiva entre a posição em que foi
   escrito no mapa (`elev.inicio`) e `elev.para`:

      { x: 4, y: 0, z: 2, tipo: 'elevador',
        elev: { eixo: 'x', para: { x: 6, y: 0, z: 2 },
                velocidade: 1.1, espera: 1.0 } }

   * o personagem só sobe/desce quando ela está PARADA em uma das pontas;
   * enquanto ela se move, o personagem é carregado junto (e não pode andar);
   * `eixo` é só informativo (deixa os dados legíveis) — o que vale é `para`.
   A atualização por quadro (atualizarElevadores) fica em main.js, porque mexe
   no estado do personagem e na interface.
   ============================================================================ */
import { CONFIG } from './config.js';
import { chave } from './grade.js';

/** Cópia profunda de um bloco (o `elev` guarda estado que muda a cada frame).
    Também zera os campos preenchidos pela cena 3D (malha e moeda). */
export function clonarBloco(b) {
  const c = { ...b };
  if (b.elev) c.elev = { ...b.elev, para: { ...b.elev.para } };
  c.malha = null;
  c.moeda = null;
  return c;
}

export function iniciarElevador(b) {
  if (!b.elev) return;
  const ev = b.elev;
  ev.inicio = { x: b.x, y: b.y, z: b.z };      // onde ele foi escrito no mapa
  ev.t = 0;                                    // 0 = na posição inicial
  ev.dir = 1;                                  // 1 = indo para o destino
  ev.velocidade = ev.velocidade ?? CONFIG.velocidadeElevador;
  ev.espera = ev.espera ?? CONFIG.esperaElevador;
  ev.pausaAtual = ev.espera;                   // começa parado: dá tempo de embarcar
  ev.avisouParada = true;
  ev.distancia = Math.abs(ev.para.x - b.x) + Math.abs(ev.para.y - b.y) + Math.abs(ev.para.z - b.z);
}

/** Move um bloco no mundo e reposiciona sua célula na grade. */
export function moverBloco(grade, b, x, y, z) {
  grade.mapa.delete(chave(b.x, b.y, b.z));
  b.x = x; b.y = y; b.z = z;
  grade.mapa.set(chave(x, y, z), b);
  if (b.malha) b.malha.position.set(x, y, z);
}
