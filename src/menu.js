/* ============================================================================
   MENU DE FASES — grade com todas as fases abertas: concluídas (com estrelas),
   a atual e as que ainda estão travadas. Só monta a tela; quem decide o estado
   de cada fase é o main.js (ele conhece o progresso).
   ============================================================================ */
import { textoEstrelas } from './progresso.js';

/** Monta o menu uma vez. `onEscolher(indice)` é chamado quando o jogador escolhe uma fase. */
export function montarMenu({ onEscolher }) {
  const painel = document.getElementById('menu-fases');
  const grade = document.getElementById('grade-fases');
  const fechar = () => painel.classList.remove('visivel');

  document.getElementById('btn-fechar-menu').addEventListener('click', fechar);
  painel.addEventListener('click', ev => { if (ev.target === painel) fechar(); });   // toque no fundo fecha
  window.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });

  return {
    /** `itens`: [{ indice, nome, estado: 'concluida' | 'atual' | 'aberta' | 'travada', estrelas }] */
    abrir(itens) {
      grade.textContent = '';
      for (const it of itens) {
        const b = document.createElement('button');
        b.className = `fase-${it.estado}`;
        b.title = it.nome;
        b.textContent = `${it.indice + 1}`;
        if (it.estado === 'travada') b.disabled = true;
        if (it.estrelas) {
          const s = document.createElement('small');
          s.textContent = textoEstrelas(it.estrelas);
          b.appendChild(s);
        }
        b.addEventListener('click', () => { fechar(); onEscolher(it.indice); });
        grade.appendChild(b);
      }
      painel.classList.add('visivel');
    },
    fechar,
    get aberto() { return painel.classList.contains('visivel'); }
  };
}
