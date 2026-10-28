/* Mock mínimo do Three.js para executar o módulo do jogo no Node.
   Só implementa o que o jogo realmente usa. */
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  setScalar(s) { this.x = this.y = this.z = s; return this; }
  lerpVectors(a, b, t) {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }
  /** Projeção do mundo para a tela (mock: só precisa existir para o jogo rodar). */
  project(camera) { return this; }
}
class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
}

class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = new Vector3(1, 1, 1);
    this.userData = {};
    this.children = [];
    this.parent = null;
    this.visible = true;
  }
  add(...objs) { for (const o of objs) { o.parent = this; this.children.push(o); } return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); o.parent = null; return this; }
  traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); }
  lookAt() {}
}

class BoxGeometry { constructor(w, h, d) { this.tipo = 'box'; this.parametros = [w, h, d]; } rotateX() { return this; } }
class SphereGeometry { constructor(r) { this.tipo = 'esfera'; this.raio = r; } }
class CylinderGeometry { constructor(rt, rb, h, s) { this.tipo = 'cilindro'; } rotateX() { return this; } }
class EdgesGeometry { constructor(geo) { this.tipo = 'arestas'; this.origem = geo; } }

class Material {
  constructor(p = {}) { Object.assign(this, p); this.userData = {}; }
  dispose() { this.__disposed = true; }
}
class MeshStandardMaterial extends Material {
  // cor e brilho próprio são objetos com set(), como no Three.js (a skin da bola os altera)
  constructor(p = {}) { super(p); this.color = new Color(p.color ?? 0xffffff); this.emissive = new Color(p.emissive ?? 0); }
}
class MeshBasicMaterial extends Material {}
class LineBasicMaterial extends Material {}

class Mesh extends Object3D {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.isMesh = true; this.castShadow = false; this.receiveShadow = false; (globalThis.__MESHES ||= []).push(this); }
}
class Group extends Object3D { constructor() { super(); this.isGroup = true; (globalThis.__GRUPOS ||= []).push(this); } }

// linhas usadas nas bordas dos blocos
class LineSegments extends Object3D {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; this.isLineSegments = true; }
}

class Camera extends Object3D {
  constructor() { super(); this.top = 1; this.bottom = -1; this.left = -1; this.right = 1; this.near = 0.1; this.far = 100; }
  updateProjectionMatrix() {}
}
class OrthographicCamera extends Camera {}
class PerspectiveCamera extends Camera {}

class Scene extends Object3D {
  constructor() { super(); this.isScene = true; globalThis.__CENA = this; }
}

class Light extends Object3D { constructor(cor, i) { super(); this.color = cor; this.intensity = i; } }
class AmbientLight extends Light {}
class DirectionalLight extends Light {
  constructor(cor, i) {
    super(cor, i);
    this.target = new Object3D();
    this.shadow = {
      mapSize: { set() {} },
      camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0, updateProjectionMatrix() {} },
      bias: 0, normalBias: 0
    };
  }
}

class Color { constructor(c) { this.c = c; } copy(o) { this.c = o.c; return this; } set(c) { this.c = c; return this; } getHex() { return this.c; } }
class RingGeometry { constructor(ri, ro, seg) { this.tipo = 'anel'; this.parametros = [ri, ro, seg]; } }

class Raycaster {
  constructor() { this.ray = {}; }
  setFromCamera(p, c) { this.__pronto = true; }
  intersectObjects(objs) {
    // responde com o bloco que o teste pediu em __PROXIMO_BLOCO.
    // Procura de trás para frente: as malhas mais recentes são as do nível atual
    // (as antigas ficam em __MESHES por causa dos vários carregamentos de fase).
    const alvo = globalThis.__PROXIMO_BLOCO;
    if (!alvo) return [];
    const lista = globalThis.__MESHES || [];
    for (let i = lista.length - 1; i >= 0; i--) {
      if (lista[i].userData && lista[i].userData.bloco === alvo) {
        return [{ object: lista[i], face: { normal: { y: 1 } } }];
      }
    }
    return [];
  }
}

class WebGLRenderer {
  constructor(opts = {}) {
    this.domElement = opts.canvas || {};
    this.shadowMap = {};
    this.__renders = 0;
  }
  setPixelRatio() {} setSize() {}
  render(cena, camera) { this.__renders++; }
}

const PCFSoftShadowMap = 1;
class CanvasTexture { constructor(canvas) { this.image = canvas; this.needsUpdate = false; } }

export {
  Vector3, Vector2, Object3D, BoxGeometry, SphereGeometry, CylinderGeometry,
  Material, MeshStandardMaterial, MeshBasicMaterial,
  Mesh, Group, Camera, OrthographicCamera, PerspectiveCamera, Scene,
  Light, AmbientLight, DirectionalLight, Color, Raycaster, WebGLRenderer,
  PCFSoftShadowMap, CanvasTexture,
  EdgesGeometry, LineSegments, LineBasicMaterial, RingGeometry
};
