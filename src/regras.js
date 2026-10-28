/* ============================================================================
   REGRAS DE FIM DE PARTIDA — conclusão da fase, pontuação, recomeço e
   avanço. Chamadas pelo movimento (moeda coletada) e pelos botões da interface.
   ============================================================================ */
import { CONFIG } from './config.js';
import { estado } from './estado.js';
import { som, progresso, ultimaTentativa, TOQUE } from './sessao.js';
import { avisar, popupMoeda, mostrarConclusao } from './hud.js';
import { textoEstrelas } from './progresso.js';
import { tween, cancelarTweens } from './tweens.js';
import { MATERIAL } from './cena.js';
import { grade, indiceNivel, moedasDaTentativa, carregarNivel, carregarPorDados, metaDaFase, avisarEventoTutorial } from './fase.js';
import { RECOMPENSA_DIARIA } from './diario.js';

/** Coleta a moeda do bloco: some animada, conta na tentativa e pode concluir. */
export function coletarMoeda(b) {
  b.tipo = 'chao';                       // o piso continua lá, sem a moeda
  b.malha.material = MATERIAL.chao;

  const malha = b.moeda;
  b.moeda = null;
  cancelarTweens(malha);                 // interrompe o "surgir", se ainda rolando
  malha.scale.setScalar(1);

  // animação: a moeda sobe, gira e desaparece
  tween(0.45, p => {
    malha.position.y = 0.78 + p * 1.2;
    malha.rotation.y += 0.35;
    malha.scale.setScalar(Math.max(0.001, 1 - p));
    malha.material.opacity = 1 - p;
  }, () => {
    malha.parent.remove(malha);
    malha.material.dispose();
  });

  progresso.registrarUso(indiceNivel, 'moeda');
  som.tocar('moeda');
  popupMoeda(b);                         // "+1" sobe da moeda
  avisarEventoTutorial('pegou-moeda');
  return moedasDaTentativa() >= totalDeMoedas();
}

/** Total de moedas da fase (a grade já sem as coletadas). */
function totalDeMoedas() {
  return grade.lista.filter(b => b.tipo === 'moeda').length + moedasDaTentativa();
}

/** Linha da pontuação: passos, recorde, tempo, estrelas e moedas ganhas. */
function textoEstatisticas(r, tempo, extra = '') {
  const recorde = r.primeira ? 'primeiro recorde!'
    : r.novoRecorde ? `novo recorde! (antes: ${r.recordeAnterior})`
    : `recorde: ${r.passosRecorde}`;
  const ganho = r.ganho ? ` · +${r.ganho} 🪙` : '';
  const meta = r.par === null || r.par === undefined ? '' : ` (meta ${r.par})`;
  return `Passos: ${r.passos}${meta} · ${recorde} · Tempo: ${tempo.toFixed(0)} s · ${textoEstrelas(r.estrelas)}${ganho}${extra}`;
}

/** Fase concluída: confirma as moedas no total (progresso salvo) e mostra a pontuação. */
export function concluirFase() {
  estado.concluido = true;
  estado.fila = [];
  estado.passo = null;
  estado.aguardandoPonte = null;
  const tempo = (performance.now() - estado.inicioMs) / 1000;
  const par = metaDaFase() ? metaDaFase().par : null;
  const moedas = moedasDaTentativa();
  avisarEventoTutorial('concluiu');

  if (estado.diario) {
    concluirDesafio(tempo, par, moedas);
    return;
  }

  const r = progresso.concluir(indiceNivel, { moedas, passos: estado.passos, tempo, par });  som.tocar('fase');
  if (CONFIG.usarAlertaNativo) alert('Fase Concluída!');
  mostrarConclusao({
    titulo: 'Fase Concluída!',
    texto: `Você coletou todas as moedas. Prepare-se para: ${proximoNome()}`,
    estatisticas: textoEstatisticas(r, tempo),
    proximo: 'Próxima Fase ▶',
    total: `Saldo 🪙 ${progresso.saldo} moedas`
  });
}

/** Conclusão do desafio do dia: recompensa de 5 🪙 uma única vez. */
function concluirDesafio(tempo, par, moedas) {
  som.tocar('fase');
  const chave = ultimaTentativa.dados?.nome?.replace('Desafio do dia — ', '') || '';
  const jaPago = chave && progresso.recompensaDoDia(chave);
  const linhas = [`Passos: ${estado.passos}${par === null ? '' : ` (meta ${par})`}`, `Tempo: ${tempo.toFixed(0)} s`, `Moedas: ${moedas}`];
  if (jaPago) linhas.push('Recompensa de hoje já foi coletada ✔');
  else {
    progresso.concluirDesafioDoDia(chave, RECOMPENSA_DIARIA);
    linhas.push(`Recompensa: +${RECOMPENSA_DIARIA} 🪙`);
  }
  mostrarConclusao({
    titulo: 'Desafio do dia concluído!',
    texto: 'Volte amanhã para um mapa novo.',
    estatisticas: linhas.join(' · '),
    proximo: 'Voltar às fases ▶',
    total: `Saldo 🪙 ${progresso.saldo} moedas`
  });
}

/** Nome da próxima fase (para o texto da tela de conclusão). */
function proximoNome() {
  return nomeDaProximaFase(indiceNivel + 1);
}

import { nomeCurto as nomeDaProximaFase } from './fase.js';

/** Recomeça a fase: a tentativa é descartada e o total volta ao de antes da fase. */
export function reiniciar() {
  if (estado.diario && ultimaTentativa.dados) {
    carregarPorDados(ultimaTentativa.dados);
  } else {
    carregarNivel(indiceNivel);
  }
  avisar('Fase reiniciada ↺');
}

/** Avança para a próxima fase (a partir da última manual, vem a primeira procedural). */
export function proximaFase() {
  if (estado.diario) {
    carregarNivel(Math.max(0, progresso.maiorConcluida() + 1));
    avisar('De volta às fases');
    return;
  }
  carregarNivel(indiceNivel + 1);
  avisar(`Fase ${indiceNivel + 1}`);
}
