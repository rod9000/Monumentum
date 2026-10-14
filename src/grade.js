/* ============================================================================
   SISTEMA DE GRADE (regras de caminhada na matriz 3D) — lógica pura, sem Three.js
   ----------------------------------------------------------------------------
   Pontes de câmera (`pontes` do nível): { a: {x,y,z}, b: {x,y,z}, angulo: 0..3 }
   As células entre as pontas viram PLACAS (tipo 'ponte'): andáveis passo a passo
   só quando a câmera está assentada no quadrante `angulo` (0 = inicial, 1 = +90°,
   ...). Fora dele, a placa não existe para a caminhada e cair é a regra.
   ============================================================================ */

/** Um elevador só aceita embarque/desembarque quando está PARADO em uma ponta.
    Sem estado de movimento (`t` ausente, ex.: dados de validação), conta como parado. */
export const elevadorParado = b => !!b.elev && (b.elev.t === undefined || b.elev.t === 0 || b.elev.t === 1);

export const TIPOS_ANDAVEIS = new Set(['chao', 'moeda', 'spawn', 'elevador', 'pulo']);
const HORIZONTAIS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// arredonda as coordenadas: os elevadores ficam em posições fracionárias
// enquanto se movem, e a grade continua consultando por células inteiras
export const chave = (x, y, z) => `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
const mesmaCelula = (a, b) => !!a && !!b && chave(a.x, a.y, a.z) === chave(b.x, b.y, b.z);

/** Células do vão de uma ponte (sem as pontas): são as placas. */
export function placasDaPonte(p) {
  const dx = Math.sign(p.b.x - p.a.x), dz = Math.sign(p.b.z - p.a.z);
  const passos = Math.abs(p.b.x - p.a.x) + Math.abs(p.b.z - p.a.z);
  const y = Math.round((p.a.y + p.b.y) / 2);
  const saida = [];
  for (let i = 1; i < passos; i++) saida.push({ x: p.a.x + dx * i, y, z: p.a.z + dz * i });
  return saida;
}

/** Quadrante da câmera (0..3) quando o giro já assentou; null enquanto gira. */
export function quadranteAssentado(giroAtual, giroAlvo) {
  if (Math.abs(giroAlvo - giroAtual) >= 0.001) return null;
  return ((Math.round(giroAlvo / (Math.PI / 2)) % 4) + 4) % 4;
}

/** Quadrante (0..3) para onde o giro está indo, mesmo enquanto ainda gira. */
export function quadranteAlvo(giroAlvo) {
  return ((Math.round(giroAlvo / (Math.PI / 2)) % 4) + 4) % 4;
}

/** Giro mínimo do quadrante atual até `angulo`: quantos cliques e para que lado.
    lado: 'direita' (E) ou 'esquerda' (Q). Quadrante igual -> vezes 0. */
export function giroNecessario(quadranteAtual, angulo) {
  const diff = ((angulo - quadranteAtual) % 4 + 4) % 4;   // 0..3 passos à direita
  if (diff === 0) return { vezes: 0, lado: null };
  if (diff === 2) return { vezes: 2, lado: 'direita' };
  if (diff === 1) return { vezes: 1, lado: 'direita' };
  return { vezes: 1, lado: 'esquerda' };                  // diff 3 = um passo à esquerda
}

export class Grade {
  /** @param {object[]} blocos  @param {object[]} [pontes]  pontes de câmera do nível */
  constructor(blocos, pontes = []) {
    this.lista = [...blocos];
    this.mapa = new Map();          // "x|y|z" -> bloco (busca O(1))
    for (const b of this.lista) {
      this.mapa.set(chave(b.x, b.y, b.z), b);
    }
    // placas das pontes: células próprias, só andáveis com a câmera alinhada
    for (const p of pontes) {
      for (const c of placasDaPonte(p)) {
        const k = chave(c.x, c.y, c.z);
        if (this.mapa.has(k)) continue;
        const placa = { x: c.x, y: c.y, z: c.z, tipo: 'ponte', ponte: p, malha: null, moeda: null };
        this.lista.push(placa);
        this.mapa.set(k, placa);
      }
    }
    this.pontes = pontes;
    this.quadrante = null;          // ângulo assentado da câmera (null = girando)
    this.pontesLivres = false;      // validadores: trata todas as pontes como ativas
  }

  obter(x, y, z) { return this.mapa.get(chave(x, y, z)) || null; }
  tem(x, y, z)  { return this.mapa.has(chave(x, y, z)); }

  /** Um bloco é caminhável se o jogador consegue ficar em cima dele:
      precisa ser de tipo 'chao'/'moeda'/'spawn' (ou uma placa de ponte com a
      câmera alinhada) e ter o espaço imediatamente acima LIVRE. */
  andavel(b) {
    if (!b) return false;
    if (b.tipo === 'ponte') return this.ponteAtiva(b.ponte) && !this.tem(b.x, b.y + 1, b.z);
    if (!TIPOS_ANDAVEIS.has(b.tipo)) return false;
    return !this.tem(b.x, b.y + 1, b.z);
  }

  /** A ponte só vale com a câmera no ângulo dela e assentada. */
  ponteAtiva(p) {
    return this.pontesLivres || this.quadrante === p.angulo;
  }

  /** Pontas das pontes que começam em `b` (ativas ou não). Usado para medir
      distâncias e alcance: a ponte liga as duas pontas. */
  extremosDePonte(b) {
    const saida = [];
    for (const p of this.pontes) {
      if (mesmaCelula(b, p.a)) saida.push(this.obter(p.b.x, p.b.y, p.b.z));
      else if (mesmaCelula(b, p.b)) saida.push(this.obter(p.a.x, p.a.y, p.a.z));
    }
    return saida.filter(Boolean);
  }

  /** REGRA DE MOVIMENTO: 1 passo na horizontal (X ou Z) com no máximo
      1 bloco de desnível (sobe/desce escadas e quinas). As placas de ponte
      são células comuns: só existem para a caminhada quando a câmera está alinhada. */
  podeMover(de, para) {
    if (!this.andavel(para)) return false;
    // elevador só aceita embarque/desembarque quando está PARADO em uma ponta
    if (para.elev && !elevadorParado(para)) return false;
    if (de && de.elev && !elevadorParado(de)) return false;
    const dx = Math.abs(para.x - de.x);
    const dz = Math.abs(para.z - de.z);
    const dy = Math.abs(para.y - de.y);
    if (dx + dz !== 1) return false;   // precisa ser vizinho na horizontal
    if (dy > 1) return false;          // no máximo 1 de desnível
    return true;
  }

  /** Blocos vizinhos alcançáveis em um passo. */
  vizinhos(b) {
    const viz = [];
    for (const [dx, dz] of HORIZONTAIS) {
      for (const dy of [0, 1, -1]) {
        const alvo = this.obter(b.x + dx, b.y + dy, b.z + dz);
        if (this.podeMover(b, alvo)) viz.push(alvo);
      }
    }
    return viz;
  }

  /** Se o destino só é alcançável com pontes e alguma placa do caminho está
      inativa agora, devolve o ângulo dessa ponte (senão, null). */
  anguloPonteBloqueante(de, para) {
    const rota = this.rotaSobPontes(de, para);
    if (!rota) return null;
    const placa = rota.find(b => b.tipo === 'ponte' && !this.ponteAtiva(b.ponte));
    return placa ? placa.ponte.angulo : null;
  }

  /** Rota como se todas as pontes estivessem ativas (o personagem pode tentar
      atravessar uma ponte errada e cair no vão). */
  rotaSobPontes(de, para) {
    const livres = this.pontesLivres;
    this.pontesLivres = true;
    try { return this.rota(de, para); } finally { this.pontesLivres = livres; }
  }

  /** Busca em largura (BFS): devolve a lista de blocos do caminho até o
      destino (sem incluir o bloco de origem), ou null se não houver rota. */
  rota(de, para) {
    if (de === para || !this.andavel(para)) return null;
    const anterior = new Map([[chave(de.x, de.y, de.z), null]]);
    const fila = [de];
    while (fila.length) {
      const atual = fila.shift();
      if (atual === para) {
        const caminho = [];
        let p = atual;
        while (p) { caminho.unshift(p); p = anterior.get(chave(p.x, p.y, p.z)); }
        return caminho.slice(1);
      }
      for (const v of this.vizinhos(atual)) {
        const k = chave(v.x, v.y, v.z);
        if (!anterior.has(k)) { anterior.set(k, atual); fila.push(v); }
      }
    }
    return null;
  }
}

/** Alcance do pulo: até o próximo bloco de pulo na direção (sem limite curto). */
export const ALCANCE_PULO = 12;
export function alvoDoPulo(grade, de, ix, iz) {
  for (let k = 2; k <= ALCANCE_PULO; k++) {
    const alvo = grade.obter(de.x + ix * k, de.y, de.z + iz * k);
    if (alvo && alvo.tipo === 'pulo') return alvo;
  }
  return null;
}

/** Distância (em passos) de cada bloco até o spawn, considerando que um
    elevador LIGA sua posição inicial ao seu destino e que uma ponte liga as
    duas pontas (a câmera gira livremente) — usado pelo sorteio de moedas,
    para que elas também possam cair "do outro lado" do vão. */
export function distanciasComElevador(grd, spawn) {
  const nos = new Map();                       // células transitáveis
  for (const b of grd.lista) if (grd.andavel(b)) nos.set(chave(b.x, b.y, b.z), b);
  const destinos = new Map();                  // células virtuais (destino do elevador)
  for (const b of grd.lista) {
    if (!b.elev) continue;
    const p = b.elev.para;
    destinos.set(chave(p.x, p.y, p.z), { x: p.x, y: p.y, z: p.z });
  }

  const dist = new Map([[chave(spawn.x, spawn.y, spawn.z), 0]]);
  const fila = [{ b: spawn, d: 0 }];
  while (fila.length) {
    const { b: atual, d } = fila.shift();
    const empurrar = (alvo) => {
      const k = chave(alvo.x, alvo.y, alvo.z);
      if (dist.has(k)) return;
      dist.set(k, d + 1);
      fila.push({ b: alvo, d: d + 1 });
    };

    for (const [dx, dz] of HORIZONTAIS) {
      for (const dy of [0, 1, -1]) {
        const viz = nos.get(chave(atual.x + dx, atual.y + dy, atual.z + dz));
        if (viz) empurrar(viz);                       // células de destino NÃO
      }                                               // são alcançáveis a pé
    }
    for (const alvo of grd.extremosDePonte(atual)) {  // ponte: pontas ligadas
      if (grd.andavel(alvo)) empurrar(alvo);
    }
    if (atual.elev) {                                 // ...só pelo elevador
      const p = destinos.get(chave(atual.elev.para.x, atual.elev.para.y, atual.elev.para.z));
      if (p) empurrar({ ...p, elev: null });
    }
    const p2 = grd.lista.find(b => b.elev &&
      chave(b.elev.inicio.x, b.elev.inicio.y, b.elev.inicio.z) === chave(atual.x, atual.y, atual.z));
    if (p2) empurrar(p2);                             // volta pelo elevador
  }
  return dist;
}

/** Alcance tratando elevadores e pontes como arestas (sem checar o estado de
    movimento). Devolve Map "x|y|z" -> passos desde `de`. */
export function alcancaveis(grade, de) {
  const dist = new Map([[chave(de.x, de.y, de.z), 0]]);
  const nos = new Map();
  for (const b of grade.lista) if (grade.andavel(b)) nos.set(chave(b.x, b.y, b.z), b);
  const elevadores = grade.lista.filter(b => b.elev);
  const fila = [{ b: de, d: 0 }];
  while (fila.length) {
    const { b: atual, d } = fila.shift();
    const empurrar = alvo => {
      const k = chave(alvo.x, alvo.y, alvo.z);
      if (dist.has(k)) return;
      dist.set(k, d + 1);
      fila.push({ b: alvo, d: d + 1 });
    };
    for (const [dx, dz] of HORIZONTAIS) {
      for (const dy of [0, 1, -1]) {
        const viz = nos.get(chave(atual.x + dx, atual.y + dy, atual.z + dz));
        if (viz) empurrar(viz);
      }
    }
    for (const alvo of grade.extremosDePonte(atual)) {
      if (grade.andavel(alvo)) empurrar(alvo);
    }
    if (atual.tipo === 'pulo') {                         // pulo: até o próximo bloco de pulo
      for (const [ix, iz] of HORIZONTAIS) {
        const t = alvoDoPulo(grade, atual, ix, iz);
        if (t) empurrar(t);
      }
    }
    for (const e of elevadores) {
      // sobe no elevador (a partir da posição inicial dele)
      if (chave(e.x, e.y, e.z) === chave(atual.x, atual.y, atual.z)) empurrar(e.elev.para);
      // desce do elevador (a partir do destino dele)
      if (chave(e.elev.para.x, e.elev.para.y, e.elev.para.z) === chave(atual.x, atual.y, atual.z)) empurrar(e);
    }
  }
  return dist;
}
