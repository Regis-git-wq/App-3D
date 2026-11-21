// Visualização 3D com three.js: maquete (órbita), modo caminhar e exportação USDZ para AR.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallEnds, wallHeight, wallSideRooms, roomPoints, roomArea, polygonCentroid } from './model.js';
import { FLOORS, WALL_TILES, textureCanvas } from './catalog.js';

const EYE = 1.6;

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9e6e0');
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
    this.camera.position.set(8, 10, 12);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xc9c1b4, 2.3);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#dcd8d0', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 60;

    this.mats = new Map();
    this.textures = new Map();
    this.walk = null;
    this.move = { x: 0, y: 0 };
    this.running = false;
    this.opts = { showDemolished: false };

    new ResizeObserver(() => this.resize()).observe(container);
    this.bindWalk();
    this.resize();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.renderer.domElement.style.width = r.width + 'px';
    this.renderer.domElement.style.height = r.height + 'px';
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.tick();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { this.running = false; }

  // ---------- materiais ----------
  mat(key, make) {
    if (!this.mats.has(key)) this.mats.set(key, make());
    return this.mats.get(key);
  }

  colorMat(hex, extra = {}) {
    return this.mat('c:' + hex + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, ...extra }));
  }

  texMat(kind, key) {
    const def = (kind === 'floor' ? FLOORS : WALL_TILES)[key];
    if (!def) return this.colorMat('#cccccc');
    return this.mat('t:' + kind + ':' + key, () => {
      const tex = new THREE.CanvasTexture(textureCanvas(kind, key));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1 / def.size, 1 / def.size);
      tex.anisotropy = 4;
      const glossy = /porcelanato|marmore|azulejo|metro/.test(key);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: glossy ? 0.35 : 0.8 });
    });
  }

  finishMat(room) {
    if (!room) return this.colorMat('#efede8');
    const f = room.wall || { type: 'paint', color: '#f7f6f2' };
    return f.type === 'tile' ? this.texMat('wall', f.tile) : this.colorMat(f.color, { roughness: 0.92 });
  }

  // ---------- construção da cena ----------
  build(plan, opts = {}) {
    Object.assign(this.opts, opts);
    this.plan = plan;
    this.disposeGroup(this.root);
    this.root.clear();
    const buckets = new Map(); // material -> geometrias (para mesclar)
    const push = (mat, geo, shadow = true) => {
      if (!buckets.has(mat)) buckets.set(mat, { geos: [], shadow });
      buckets.get(mat).geos.push(geo);
    };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of plan.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 4; }
    this.bounds = { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, size: Math.max(maxX - minX, maxY - minY, 2) };

    // pisos
    for (const room of plan.rooms) {
      const pts = roomPoints(plan, room);
      if (pts.length < 3) continue;
      const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.002, 0);
      push(this.texMat('floor', room.floor), geo, false);
      if (this.opts.ceiling) {
        const cg = new THREE.ShapeGeometry(shape);
        cg.rotateX(Math.PI / 2);
        // inverte a ordem para a face olhar para baixo
        cg.scale(1, 1, -1);
        cg.translate(0, plan.wallHeight, 0);
        push(this.colorMat('#f7f6f3', { side: THREE.DoubleSide }), cg, false);
      }
    }

    // paredes
    const coreMat = this.colorMat('#5b5d61');
    const demoMat = this.colorMat('#d2463c', { transparent: true, opacity: 0.28, depthWrite: false });
    for (const w of plan.walls) {
      const demolished = w.status === 'demolish';
      if (demolished && !this.opts.showDemolished) continue;
      const [a, b] = wallEnds(plan, w);
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 0.01) continue;
      const H = wallHeight(plan, w), t = w.thickness, ht = t / 2;
      const sides = demolished ? {} : wallSideRooms(plan, w);
      const matL = demolished ? demoMat : this.finishMat(sides.L);
      const matR = demolished ? demoMat : this.finishMat(sides.R);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const m = new THREE.Matrix4().makeRotationY(-ang).setPosition(a.x, 0, a.y);

      for (const pc of wallPieces(w, L, H)) {
        const s0 = pc.s0 - (pc.s0 <= 1e-6 ? ht : 0);
        const s1 = pc.s1 + (pc.s1 >= L - 1e-6 ? ht : 0);
        const len = s1 - s0, hh = pc.y1 - pc.y0;
        if (len <= 0.001 || hh <= 0.001) continue;
        const cx = (s0 + s1) / 2, cy = (pc.y0 + pc.y1) / 2;
        if (demolished) {
          const g = new THREE.BoxGeometry(len, hh, t); g.translate(cx, cy, 0); g.applyMatrix4(m); push(demoMat, g, false);
          continue;
        }
        const core = new THREE.BoxGeometry(len, hh, t - 0.004);
        core.translate(cx, cy, 0); core.applyMatrix4(m);
        push(coreMat, core);
        for (const [side, mat] of [[1, matL], [-1, matR]]) {
          const g = new THREE.PlaneGeometry(len, hh);
          worldUV(g, s0, pc.y0, len, hh, side);
          if (side < 0) g.rotateY(Math.PI);
          g.translate(cx, cy, side * ht);
          g.applyMatrix4(m);
          push(mat, g);
        }
      }
      if (demolished) continue;
      // portas e janelas
      for (const o of w.openings) {
        const om = (dx, y, z) => new THREE.Matrix4().makeTranslation(o.offset + dx, y, z).premultiply(m);
        if (o.type === 'door') {
          const g = new THREE.BoxGeometry(o.width - 0.02, o.height - 0.01, 0.04);
          g.applyMatrix4(om(0, o.height / 2, 0));
          push(this.colorMat('#d9cbb5', { roughness: 0.6 }), g);
          const fr = new THREE.BoxGeometry(o.width + 0.08, 0.05, t + 0.01);
          fr.applyMatrix4(om(0, o.height + 0.025, 0));
          push(this.colorMat('#f7f6f2'), fr);
        } else if (o.type === 'window') {
          const glass = new THREE.BoxGeometry(o.width, o.height, 0.012);
          glass.applyMatrix4(om(0, o.sill + o.height / 2, 0));
          push(this.mat('glass', () => new THREE.MeshStandardMaterial({ color: '#bcdbe8', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, depthWrite: false })), glass, false);
          const frameMat = this.colorMat('#4b4e52', { roughness: 0.5, metalness: 0.3 });
          for (const [dx, dy, w2, h2] of [
            [0, o.sill + 0.02, o.width, 0.04], [0, o.sill + o.height - 0.02, o.width, 0.04],
            [-o.width / 2 + 0.02, o.sill + o.height / 2, 0.04, o.height], [o.width / 2 - 0.02, o.sill + o.height / 2, 0.04, o.height],
            [0, o.sill + o.height / 2, 0.03, o.height],
          ]) {
            const f = new THREE.BoxGeometry(w2, h2, 0.06); f.applyMatrix4(om(dx, dy, 0)); push(frameMat, f);
          }
          if (o.sill > 0.05) {
            const sill = new THREE.BoxGeometry(o.width + 0.06, 0.03, t + 0.06);
            sill.applyMatrix4(om(0, o.sill - 0.015, 0)); push(this.colorMat('#e6e2da'), sill);
          }
        }
      }
    }

    // mescla por material
    for (const [mat, { geos, shadow }] of buckets) {
      const norm = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      norm.forEach((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
      const merged = mergeGeometries(norm.map((g) => {
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', g.attributes.position);
        out.setAttribute('normal', g.attributes.normal);
        out.setAttribute('uv', g.attributes.uv);
        return out;
      }));
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    // móveis
    for (const it of plan.items) this.root.add(this.buildItem(it));

    // luz do "sol" ajustada ao tamanho da planta
    const { cx, cy, size } = this.bounds;
    this.sun.position.set(cx + size * 0.6, size * 1.6 + 4, cy + size * 0.9);
    this.sun.target.position.set(cx, 0, cy);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -size; sc.right = sc.top = size; sc.near = 0.5; sc.far = size * 6 + 20;
    sc.updateProjectionMatrix();
    this.ground.position.x = cx; this.ground.position.z = cy;
  }

  buildItem(it) {
    const g = new THREE.Group();
    const m = this.colorMat(it.color, { roughness: 0.75 });
    const dark = this.colorMat('#2f3033');
    const white = this.colorMat('#f4f3f0');
    const box = (w, h, d, x, y, z, mat = m) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
    };
    const { w, d, h } = it;
    switch (it.kind) {
      case 'bed':
        box(w, h * 0.55, d, 0, h * 0.275, 0, this.colorMat('#8a6a4f'));
        box(w - 0.04, h * 0.45, d - 0.06, 0, h * 0.775, 0.02, m);
        box(w, 1.05, 0.08, 0, 0.525, -d / 2 + 0.04, this.colorMat('#8a6a4f'));
        box(w * 0.38, 0.14, 0.35, -w * 0.22, h + 0.07, -d / 2 + 0.3, white);
        box(w * 0.38, 0.14, 0.35, w * 0.22, h + 0.07, -d / 2 + 0.3, white);
        break;
      case 'sofa':
      case 'armchair': {
        const arm = Math.min(0.18, w * 0.12);
        box(w, 0.42, d, 0, 0.21, 0);
        box(w, h - 0.42, 0.2, 0, 0.42 + (h - 0.42) / 2, -d / 2 + 0.1);
        box(arm, 0.62, d, -w / 2 + arm / 2, 0.31, 0);
        box(arm, 0.62, d, w / 2 - arm / 2, 0.31, 0);
        break;
      }
      case 'table': {
        box(w, 0.04, d, 0, h - 0.02, 0);
        const lx = w / 2 - 0.06, lz = d / 2 - 0.06;
        for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) box(0.05, h - 0.04, 0.05, x, (h - 0.04) / 2, z);
        break;
      }
      case 'chair': {
        box(w, 0.04, d, 0, 0.45, 0);
        box(w, h - 0.47, 0.04, 0, 0.47 + (h - 0.47) / 2, -d / 2 + 0.02);
        const lx = w / 2 - 0.03, lz = d / 2 - 0.03;
        for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) box(0.03, 0.43, 0.03, x, 0.215, z);
        break;
      }
      case 'counter':
        box(w, h - 0.03, d - 0.03, 0, (h - 0.03) / 2, -0.015);
        box(w, 0.03, d, 0, h - 0.015, 0, this.colorMat('#d6d3cc', { roughness: 0.3 }));
        break;
      case 'toilet':
        box(w * 0.8, h, d * 0.65, 0, h / 2, d * 0.12, white);
        box(w, 0.38, 0.18, 0, h + 0.19, -d / 2 + 0.09, white);
        break;
      case 'shower': {
        const glass = this.mat('glass', () => new THREE.MeshStandardMaterial({ color: '#bcdbe8', transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
        box(w, 0.04, d, 0, 0.02, 0, this.colorMat('#e9e8e4'));
        box(w, h, 0.01, 0, h / 2, d / 2, glass);
        box(0.01, h, d, w / 2, h / 2, 0, glass);
        break;
      }
      case 'bathtub':
        box(w, h, d, 0, h / 2, 0, white);
        box(w - 0.12, 0.02, d - 0.12, 0, h - 0.005, 0, this.colorMat('#d8e8ee'));
        break;
      case 'plant': {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.25, 0.35, 16), this.colorMat('#b9a58a'));
        pot.position.y = 0.175; pot.castShadow = true; g.add(pot);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(w * 0.55, 16, 12), m);
        leaf.scale.y = (h - 0.35) / (w * 1.1); leaf.position.y = 0.35 + (h - 0.35) / 2; leaf.castShadow = true; g.add(leaf);
        break;
      }
      case 'fridge':
        box(w, h, d, 0, h / 2, 0);
        box(0.02, 0.4, 0.02, w / 2 - 0.08, h * 0.7, d / 2 + 0.01, dark);
        break;
      case 'appliance':
        box(w, h, d, 0, h / 2, 0);
        box(w - 0.05, 0.01, d - 0.05, 0, h + 0.005, 0, dark);
        break;
      case 'wardrobe':
        box(w, h, d, 0, h / 2, 0);
        for (let i = 1; i < Math.round(w / 0.5); i++) box(0.006, h - 0.02, 0.005, -w / 2 + (i * w) / Math.round(w / 0.5), h / 2, d / 2 + 0.002, dark);
        break;
      default:
        box(w, h, d, 0, h / 2, 0);
    }
    g.position.set(it.x, it.elev || 0, it.y);
    g.rotation.y = -(it.rot * Math.PI) / 180;
    g.userData.itemId = it.id;
    return g;
  }

  disposeGroup(group) {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  // ---------- câmera ----------
  frame() {
    if (!this.bounds) return;
    const { cx, cy, size } = this.bounds;
    this.controls.target.set(cx, 0.6, cy);
    this.camera.position.set(cx + size * 0.55, size * 1.05 + 2, cy + size * 1.0);
    this.controls.update();
  }

  topView() {
    const { cx, cy, size } = this.bounds;
    this.controls.target.set(cx, 0, cy);
    this.camera.position.set(cx, size * 1.6 + 3, cy + 0.01);
    this.controls.update();
  }

  // ---------- modo caminhar ----------
  setWalk(on) {
    if (on) {
      const plan = this.plan;
      let best = null, ba = 0;
      for (const r of plan.rooms) { const a = roomArea(plan, r); if (a > ba) { ba = a; best = r; } }
      const pts = best ? roomPoints(plan, best) : [];
      const c = best ? polygonCentroid(pts) : { x: this.bounds.cx, y: this.bounds.cy };
      // começa recuado, olhando para o canto mais distante do maior cômodo
      let far = { x: c.x + 1, y: c.y };
      for (const p of pts) if (Math.hypot(p.x - c.x, p.y - c.y) > Math.hypot(far.x - c.x, far.y - c.y)) far = p;
      const dx = far.x - c.x, dy = far.y - c.y;
      this.walk = { yaw: Math.atan2(dx, dy), pitch: -0.08 };
      this.camera.position.set(c.x - dx * 0.55, EYE, c.y - dy * 0.55);
      this.controls.enabled = false;
      this.camera.fov = 70; this.camera.updateProjectionMatrix();
      this.build(plan, { ceiling: true });
      this.applyLook();
    } else {
      this.walk = null;
      this.controls.enabled = true;
      this.camera.fov = 55; this.camera.updateProjectionMatrix();
      this.build(this.plan, { ceiling: false });
      this.frame();
    }
  }

  applyLook() {
    const { yaw, pitch } = this.walk;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  bindWalk() {
    const el = this.renderer.domElement;
    let last = null, id = null;
    el.addEventListener('pointerdown', (e) => { if (!this.walk || id !== null) return; id = e.pointerId; last = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointermove', (e) => {
      if (!this.walk || e.pointerId !== id) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.walk.yaw += dx * 0.005;
      this.walk.pitch = Math.max(-1.2, Math.min(1.2, this.walk.pitch + dy * 0.004));
      this.applyLook();
    });
    const up = (e) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  tick() {
    if (this.walk) {
      const { x, y } = this.move;
      if (x || y) {
        const sp = 0.045;
        const yaw = this.walk.yaw;
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        // frente = (fx, fz); direita = (-fz, fx); joystick: y negativo = andar para frente
        this.camera.position.x += (fx * -y - fz * x) * sp;
        this.camera.position.z += (fz * -y + fx * x) * sp;
        this.applyLook();
      }
    } else this.controls.update();
  }

  // ---------- exportação ----------
  async exportUSDZ() {
    const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
    const plan = this.plan;
    const wasWalk = !!this.walk;
    if (wasWalk || this.opts.ceiling) this.build(plan, { ceiling: false });
    const showDemo = this.opts.showDemolished;
    if (showDemo) this.build(plan, { showDemolished: false });
    const group = new THREE.Group();
    const clone = this.root.clone(true);
    clone.position.set(-this.bounds.cx, 0, -this.bounds.cy);
    group.add(clone);
    const exporter = new USDZExporter();
    const data = await exporter.parseAsync(group, { quickLookCompatible: true, ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } } });
    if (showDemo || wasWalk) this.build(plan, { showDemolished: showDemo, ceiling: wasWalk });
    return new Blob([data], { type: 'model/vnd.usdz+zip' });
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.92);
  }
}

// Divide a parede em peças sólidas considerando aberturas.
function wallPieces(w, L, H) {
  const ops = [...w.openings].map((o) => ({
    s0: Math.max(0, o.offset - o.width / 2), s1: Math.min(L, o.offset + o.width / 2),
    y0: Math.max(0, o.sill), y1: Math.min(H, o.sill + o.height),
  })).sort((a, b) => a.s0 - b.s0);
  const pieces = [];
  let cur = 0;
  for (const o of ops) {
    if (o.s0 > cur) pieces.push({ s0: cur, s1: o.s0, y0: 0, y1: H });
    const s0 = Math.max(cur, o.s0);
    if (o.s1 > s0) {
      if (o.y0 > 0) pieces.push({ s0, s1: o.s1, y0: 0, y1: o.y0 });
      if (o.y1 < H) pieces.push({ s0, s1: o.s1, y0: o.y1, y1: H });
    }
    cur = Math.max(cur, o.s1);
  }
  if (cur < L) pieces.push({ s0: cur, s1: L, y0: 0, y1: H });
  return pieces;
}

// UVs em metros para a textura repetir em escala real.
function worldUV(geo, s0, y0, len, hh, side) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (side < 0) u = 1 - u;
    uv.setXY(i, s0 + u * len, y0 + v * hh);
  }
}
