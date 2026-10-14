/* ============================================================================
   LOJA DE SKINS — painel com as aparências da bola (botão 🎨 do HUD).
   Só monta a tela; quem decide o que pode ser comprado e equipado é o main.js
   (ele conhece o progresso e o saldo).
   ============================================================================ */

/** Monta a loja uma vez. `onEscolher(id)` é chamado quando o jogador toca numa skin. */
export function montarLoja({ onEscolher }) {
  const painel = document.getElementById('painel-skins');
  const grade = document.getElementById('grade-skins');
  const saldo = document.getElementById('saldo-skins');
  const fechar = () => painel.classList.remove('visivel');

  document.getElementById('btn-fechar-skins').addEventListener('click', fechar);
  painel.addEventListener('click', ev => { if (ev.target === painel) fechar(); });   // toque no fundo fecha
  window.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });

  return {
    /** `itens`: [{ id, nome, cor, preco, estado: 'equipada' | 'possui' | 'comprar' | 'sem-saldo', faltam }] */
    abrir(itens, saldoAtual) {
      saldo.textContent = `Saldo 🪙 ${saldoAtual}`;
      grade.textContent = '';
      for (const it of itens) {
        const b = document.createElement('button');
        b.className = `skin-${it.estado}`;
        b.title = it.nome;
        const bolinha = document.createElement('span');
        bolinha.className = 'skin-bolinha';
        bolinha.style.background = `radial-gradient(circle at 35% 30%, #ffffffcc 0, ${it.cor} 42%, #0b1220 150%)`;
        const nome = document.createElement('span');
        nome.className = 'skin-nome';
        nome.textContent = it.nome;
        const situacao = document.createElement('small');
        situacao.textContent = {
          equipada: '✓ equipada',
          possui: 'toque para equipar',
          comprar: `🪙 ${it.preco} · comprar`,
          'sem-saldo': `faltam ${it.faltam} 🪙`
        }[it.estado];
        b.appendChild(bolinha);
        b.appendChild(nome);
        b.appendChild(situacao);
        if (it.estado === 'sem-saldo') b.disabled = true;
        if (it.estado !== 'equipada') b.addEventListener('click', () => onEscolher(it.id));
        grade.appendChild(b);
      }
      painel.classList.add('visivel');
    },
    fechar,
    get aberto() { return painel.classList.contains('visivel'); }
  };
}
