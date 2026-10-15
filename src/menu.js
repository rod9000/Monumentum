/* ============================================================================
   MENU DE FASES — grade com os itens abertos: o desafio do dia, as fases
   concluídas (com estrelas), a atual e as que ainda estão travadas. Só monta a
   tela; quem decide o estado de cada item é o main/menus.js.
   ============================================================================ */
import { textoEstrelas } from './progresso.js';

/** Mostra a faixa de dificuldade de uma fase no botão (e no tooltip). Sem faixa, não faz nada. */
function mostrarFaixa({ botao, nome, rotulo }, faixa) {
  if (!faixa) return;
  botao.title = `${nome} · ${faixa}`;
  rotulo.textContent = faixa;
}

/** Monta o menu uma vez. `onEscolher(item)` é chamado quando o jogador escolhe um item. */
export function montarMenu({ onEscolher }) {
  const painel = document.getElementById('menu-fases');
  const grade = document.getElementById('grade-fases');
  const fechar = () => painel.classList.remove('visivel');
  const botoes = new Map();                       // índice -> { botao, nome, rotulo } das fases desenhadas

  document.getElementById('btn-fechar-menu').addEventListener('click', fechar);
  painel.addEventListener('click', ev => { if (ev.target === painel) fechar(); });   // toque no fundo fecha
  window.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });

  return {
    /** `itens`: [{ indice, nome, estado, estrelas?, dificuldade?, extra?, recompensa? }] */
    abrir(itens) {
      grade.textContent = '';
      botoes.clear();
      for (const it of itens) {
        const b = document.createElement('button');
        b.title = it.nome;
        if (it.extra) {                                   // desafio do dia
          b.className = 'fase-desafio';
          b.textContent = '📅';
          b.disabled = false;
          const s = document.createElement('small');
          s.textContent = it.recompensa || 'Desafio do dia';
          b.appendChild(s);
          b.addEventListener('click', () => { fechar(); onEscolher(it); });
          grade.appendChild(b);
          continue;
        }
        b.className = `fase-${it.estado}`;
        b.textContent = `${it.indice + 1}`;
        if (it.estado === 'travada') b.disabled = true;
        if (it.estrelas) {
          const s = document.createElement('small');
          s.textContent = textoEstrelas(it.estrelas);
          b.appendChild(s);
        }
        const rotulo = document.createElement('small');     // faixa de dificuldade (vazia até a nota ficar pronta)
        rotulo.className = 'faixa';
        b.appendChild(rotulo);
        const item = { botao: b, nome: it.nome, rotulo };
        botoes.set(it.indice, item);
        mostrarFaixa(item, it.dificuldade);
        b.addEventListener('click', () => { fechar(); onEscolher(it); });
        grade.appendChild(b);
      }
      painel.classList.add('visivel');
    },
    /** Preenche a faixa de uma fase já desenhada (a nota é calculada depois de abrir o menu). */
    atualizarDificuldade(indice, faixa) {
      const item = botoes.get(indice);
      if (item) mostrarFaixa(item, faixa);
    },
    fechar,
    get aberto() { return painel.classList.contains('visivel'); }
  };
}
