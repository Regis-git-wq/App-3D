// Editor 2D da planta em <canvas>, com toque (arrastar, pinça) e mouse.
import {
  getPoint, wallEnds, wallLength, projectOnSegment, findPointNear, roomPoints, polygonCentroid,
  roomArea, pointInPolygon, addPoint, addWall, addRoom, splitWall, clampOpenings, addOpening, round, detectRooms, weldPlan,
} from './model.js';
import { FLOORS } from './catalog.js';

const GRID = 0.05; // encaixe de 5 cm
const COLORS = {
  bg: '#f4f2ee', grid: '#e4e0d8', gridMajor: '#d3cec4',
  wall: '#3a3c40', wallNew: '#2e8f5a', wallDemo: '#d2463c',
  sel: '#2f6fed', text: '#2a2b2e', dim: '#6a6c70',
};

export class Plan2D {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.app = app;
    this.scale = 60; this.ox = 40; this.oy = 40;
    this.pointers = new Map();
    this.chain = []; // ids dos pontos do traçado atual (ferramenta parede)
    this.preview = null;
    this.drag = null;
    this.guides = [];
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  get plan() { return this.app.plan; }

  // ---------- coordenadas ----------
  toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
  toScreen(x, y) { return { x: x * this.scale + this.ox, y: y * this.scale + this.oy }; }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // mantém o centro da vista quando o espaço muda (ex.: painel abrindo)
    if (this.w && this.h && r.width && r.height) { this.ox += (r.width - this.w) / 2; this.oy += (r.height - this.h) / 2; }
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.dpr = dpr;
    if (!this.fitted && r.width > 0) { this.fit(); this.fitted = true; }
    this.draw();
  }

  fit() {
    const pts = this.plan.points;
    if (!pts.length || !this.w) { this.scale = 60; this.ox = this.w / 2 - 120; this.oy = this.h / 2 - 120; this.draw(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const pad = 48;
    const sw = Math.max(1, maxX - minX), sh = Math.max(1, maxY - minY);
    this.scale = Math.min((this.w - pad * 2) / sw, (this.h - pad * 2) / sh, 160);
    this.ox = (this.w - sw * this.scale) / 2 - minX * this.scale;
    this.oy = (this.h - sh * this.scale) / 2 - minY * this.scale;
    this.draw();
  }

  viewCenter() {
    return this.toWorld(this.w / 2, this.h / 2);
  }

  // ---------- encaixe (snap) ----------
  snap(wp, { from = null, exclude = null } = {}) {
    const tolPt = 16 / this.scale;
    const pt = findPointNear(this.plan, wp.x, wp.y, tolPt);
    if (pt && pt.id !== exclude) return { x: pt.x, y: pt.y, pointId: pt.id };
    let x = wp.x, y = wp.y;
    this.guides = [];
    if (from) {
      const dx = x - from.x, dy = y - from.y;
      const ang = Math.atan2(dy, dx);
      const q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(ang - q) < (8 * Math.PI) / 180) {
        const len = Math.round(Math.hypot(dx, dy) / 0.01) * 0.01;
        x = from.x + Math.cos(q) * len; y = from.y + Math.sin(q) * len;
        x = Math.abs(Math.cos(q)) < 1e-6 ? from.x : x;
        y = Math.abs(Math.sin(q)) < 1e-6 ? from.y : y;
      }
    }
    // alinhamento com outros pontos
    const tolA = 10 / this.scale;
    for (const p of this.plan.points) {
      if (p.id === exclude || (from && p.id === from.id)) continue;
      // só ajusta a coordenada que não quebra a ortogonalidade do segmento
      if (Math.abs(p.x - x) < tolA && (!from || Math.abs(from.y - y) < 1e-6)) {
        x = p.x; this.guides.push({ x1: p.x, y1: p.y, x2: x, y2: y });
      }
      if (Math.abs(p.y - y) < tolA && (!from || Math.abs(from.x - x) < 1e-6)) {
        y = p.y; this.guides.push({ x1: p.x, y1: p.y, x2: x, y2: y });
      }
    }
    // sobre uma parede
    const tolW = 12 / this.scale;
    for (const w of this.plan.walls) {
      if (exclude && (w.a === exclude || w.b === exclude)) continue;
      const [a, b] = wallEnds(this.plan, w);
      const pr = projectOnSegment({ x, y }, a, b);
      if (pr.dist < tolW && pr.t > 0.02 && pr.t < 0.98) return { x: pr.x, y: pr.y, wall: w, t: pr.t };
    }
    if (!from || this.guides.length === 0) {
      const onAxis = from && (Math.abs(from.x - x) < 1e-6 || Math.abs(from.y - y) < 1e-6);
      if (!onAxis) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
      else if (from) {
        // mantém alinhado ao eixo e arredonda o comprimento a 5 cm
        if (Math.abs(from.x - x) < 1e-6) y = from.y + Math.round((y - from.y) / GRID) * GRID;
        else x = from.x + Math.round((x - from.x) / GRID) * GRID;
      }
    }
    return { x: round(x), y: round(y) };
  }

  resolveSnap(s) {
    if (s.pointId) return getPoint(this.plan, s.pointId);
    if (s.wall) return splitWall(this.plan, s.wall, s.t);
    return addPoint(this.plan, s.x, s.y);
  }

  // ---------- ferramenta parede ----------
  wallTap(s) {
    this.app.beginEdit();
    const plan = this.plan;
    const p = this.resolveSnap(s);
    const last = this.chain.length ? this.chain[this.chain.length - 1] : null;
    if (last === p.id) { this.endChain(); this.app.changed(); return; }
    const before = new Set(plan.rooms.map((r) => r.id));
    if (last) addWall(plan, last, p.id, { status: this.app.defaultWallStatus() });
    const closing = this.chain.length >= 3 && p.id === this.chain[0];
    detectRooms(plan);
    if (closing && !plan.rooms.some((r) => r.pts.length === this.chain.length && this.chain.every((id) => r.pts.includes(id)))) {
      // contorno que não forma face simples (raro): cria o cômodo mesmo assim
      addRoom(plan, this.chain);
    }
    const created = plan.rooms.filter((r) => !before.has(r.id));
    if (created.length) this.app.toast(created.map((r) => `${r.name}: ${roomArea(plan, r).toFixed(2).replace('.', ',')} m²`).join(' · '));
    if (closing) this.endChain(); else this.chain.push(p.id);
    this.app.changed();
  }

  // segmento digitado: comprimento em metros, direção em graus (0 = direita, 90 = baixo)
  addSegment(len, deg) {
    const lastId = this.chain[this.chain.length - 1];
    const last = lastId && getPoint(this.plan, lastId);
    if (!last) return false;
    const a = (deg * Math.PI) / 180;
    const x = round(last.x + Math.cos(a) * len), y = round(last.y + Math.sin(a) * len);
    const s = this.snapExact(x, y);
    this.wallTap(s);
    return true;
  }

  snapExact(x, y) {
    const pt = findPointNear(this.plan, x, y, 0.02);
    if (pt) return { x: pt.x, y: pt.y, pointId: pt.id };
    for (const w of this.plan.walls) {
      const [a, b] = wallEnds(this.plan, w);
      const pr = projectOnSegment({ x, y }, a, b);
      if (pr.dist < 0.02 && pr.t > 0.001 && pr.t < 0.999) return { x, y, wall: w, t: pr.t };
    }
    return { x, y };
  }

  startChainAt(x, y) {
    this.chain = [];
    this.wallTap(this.snapExact(x, y));
  }

  closeChain() {
    if (this.chain.length >= 3) {
      const first = getPoint(this.plan, this.chain[0]);
      this.wallTap({ x: first.x, y: first.y, pointId: first.id });
    } else this.endChain();
  }

  endChain() {
    this.chain = []; this.preview = null; this.guides = [];
    this.app.chainChanged?.();
    this.draw();
  }

  // ---------- seleção / hit test ----------
  hit(wp) {
    const plan = this.plan;
    const tol = 14 / this.scale;
    const sel = this.app.selection;
    // pontos (só visíveis quando parede/cômodo selecionado)
    if (sel && (sel.type === 'wall' || sel.type === 'room' || sel.type === 'point')) {
      const ids = this.selectedPointIds();
      for (const id of ids) {
        const p = getPoint(plan, id);
        if (p && Math.hypot(p.x - wp.x, p.y - wp.y) < tol) return { type: 'point', id };
      }
    }
    // aberturas
    for (const w of plan.walls) {
      const [a, b] = wallEnds(plan, w);
      const L = wallLength(plan, w) || 1;
      const pr = projectOnSegment(wp, a, b);
      if (pr.dist > (w.thickness / 2) + tol) continue;
      const off = pr.t * L;
      for (const o of w.openings) if (Math.abs(off - o.offset) < o.width / 2) return { type: 'opening', id: o.id };
    }
    // móveis (de cima para baixo)
    for (let i = plan.items.length - 1; i >= 0; i--) {
      const it = plan.items[i];
      const a = (-it.rot * Math.PI) / 180;
      const dx = wp.x - it.x, dy = wp.y - it.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= it.w / 2 + tol / 3 && Math.abs(ly) <= it.d / 2 + tol / 3) return { type: 'item', id: it.id };
    }
    // paredes
    let best = null, bd = Infinity;
    for (const w of plan.walls) {
      const [a, b] = wallEnds(plan, w);
      const pr = projectOnSegment(wp, a, b);
      if (pr.dist < w.thickness / 2 + tol * 0.7 && pr.dist < bd) { bd = pr.dist; best = w; }
    }
    if (best) return { type: 'wall', id: best.id };
    // cômodos (o menor que contém o ponto)
    let room = null, ra = Infinity;
    for (const r of plan.rooms) {
      const pts = roomPoints(plan, r);
      if (pts.length >= 3 && pointInPolygon(wp, pts)) {
        const a = roomArea(plan, r);
        if (a < ra) { ra = a; room = r; }
      }
    }
    if (room) return { type: 'room', id: room.id };
    return null;
  }

  selectedPointIds() {
    const sel = this.app.selection;
    if (!sel) return [];
    if (sel.type === 'wall') { const w = this.plan.walls.find((w) => w.id === sel.id); return w ? [w.a, w.b] : []; }
    if (sel.type === 'room') { const r = this.plan.rooms.find((r) => r.id === sel.id); return r ? r.pts : []; }
    if (sel.type === 'point') {
      const ids = new Set([sel.id]);
      if (sel.parent) for (const id of this.selectedPointIdsFor(sel.parent)) ids.add(id);
      return [...ids];
    }
    return [];
  }

  selectedPointIdsFor(parent) {
    if (parent.type === 'wall') { const w = this.plan.walls.find((w) => w.id === parent.id); return w ? [w.a, w.b] : []; }
    if (parent.type === 'room') { const r = this.plan.rooms.find((r) => r.id === parent.id); return r ? r.pts : []; }
    return [];
  }

  // ---------- eventos ----------
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      this.zoomAt(e.offsetX, e.offsetY, f);
    }, { passive: false });
  }

  zoomAt(sx, sy, f) {
    const ns = Math.max(8, Math.min(600, this.scale * f));
    f = ns / this.scale;
    this.ox = sx - (sx - this.ox) * f;
    this.oy = sy - (sy - this.oy) * f;
    this.scale = ns;
    this.draw();
  }

  pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // começa pinça: cancela qualquer ação de um dedo
      if (this.drag?.started && this.drag.kind !== 'pan') this.app.changed();
      this.drag = null; this.preview = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      this.draw();
      return;
    }
    if (this.pointers.size > 2) return;
    const wp = this.toWorld(p.x, p.y);
    const tool = this.app.tool;
    this.downAt = p;

    if (tool === 'wall') {
      const lastId = this.chain[this.chain.length - 1];
      this.preview = this.snap(wp, { from: lastId ? getPoint(this.plan, lastId) : null });
      this.drag = { kind: 'wallpreview', start: p };
      this.draw();
      return;
    }
    if (tool === 'door' || tool === 'window' || tool === 'passage') {
      this.drag = { kind: 'opening-place', start: p };
      return;
    }
    // seleção
    const h = this.hit(wp);
    const sel = this.app.selection;
    if (h && sel && h.type === sel.type && h.id === sel.id || (h && h.type === 'point')) {
      this.drag = { kind: h.type, id: h.id, start: p, startW: wp, last: wp, started: false };
      if (h.type === 'point') this.drag.parent = sel?.type === 'point' ? sel.parent : sel;
    } else {
      this.drag = { kind: 'tap-or-pan', hit: h, start: p, ox: this.ox, oy: this.oy, started: false };
    }
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.ox += cx - this.pinch.cx; this.oy += cy - this.pinch.cy;
      this.zoomAt(cx, cy, d / (this.pinch.d || d));
      this.pinch = { d, cx, cy };
      return;
    }
    const d = this.drag;
    if (!d) return;
    const wp = this.toWorld(p.x, p.y);
    const moved = Math.hypot(p.x - d.start.x, p.y - d.start.y) > 6;

    if (d.kind === 'wallpreview') {
      const lastId = this.chain[this.chain.length - 1];
      this.preview = this.snap(wp, { from: lastId ? getPoint(this.plan, lastId) : null });
      this.draw();
      return;
    }
    if (d.kind === 'tap-or-pan') {
      if (moved || d.started) {
        d.started = true;
        this.ox = d.ox + (p.x - d.start.x); this.oy = d.oy + (p.y - d.start.y);
        this.draw();
      }
      return;
    }
    if (d.kind === 'opening-place') return;
    if (!d.started && !moved) return;
    if (!d.started) { d.started = true; this.app.beginEdit(); }
    this.dragTo(d, wp);
    d.last = wp;
    this.draw();
    this.app.liveChanged?.();
  }

  dragTo(d, wp) {
    const plan = this.plan;
    if (d.kind === 'point') {
      const pt = getPoint(plan, d.id);
      // encaixa em relação a um vizinho para manter ortogonalidade
      const nb = plan.walls.filter((w) => w.a === d.id || w.b === d.id).map((w) => getPoint(plan, w.a === d.id ? w.b : w.a));
      let s = this.snap(wp, { exclude: d.id });
      if (!s.pointId && nb.length) {
        let bx = s.x, by = s.y;
        for (const n of nb) {
          if (Math.abs(wp.x - n.x) < 10 / this.scale) bx = n.x;
          if (Math.abs(wp.y - n.y) < 10 / this.scale) by = n.y;
        }
        s = { x: bx, y: by };
      }
      // encostar num outro canto: posiciona em cima; a solda une ao soltar
      pt.x = round(s.x); pt.y = round(s.y);
      for (const w of plan.walls) if (w.a === d.id || w.b === d.id) clampOpenings(plan, w);
    } else if (d.kind === 'item') {
      const it = plan.items.find((i) => i.id === d.id);
      it.x = round(it.x + (wp.x - d.last.x)); it.y = round(it.y + (wp.y - d.last.y));
    } else if (d.kind === 'opening') {
      for (const w of plan.walls) {
        const o = w.openings.find((o) => o.id === d.id);
        if (!o) continue;
        const [a, b] = wallEnds(plan, w);
        const L = wallLength(plan, w);
        const pr = projectOnSegment(wp, a, b);
        o.offset = Math.round(pr.t * L * 100) / 100;
        clampOpenings(plan, w);
      }
    } else if (d.kind === 'room' || d.kind === 'wall') {
      d.acc = d.acc || { x: 0, y: 0 };
      const tot = { x: wp.x - d.startW.x, y: wp.y - d.startW.y };
      let ids;
      if (d.kind === 'room') ids = plan.rooms.find((r) => r.id === d.id).pts;
      else {
        const w = plan.walls.find((w) => w.id === d.id);
        ids = [w.a, w.b];
        const [a, b] = wallEnds(plan, w);
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
        const k = tot.x * nx + tot.y * ny;
        tot.x = nx * k; tot.y = ny * k;
      }
      const sx = Math.round(tot.x / GRID) * GRID, sy = Math.round(tot.y / GRID) * GRID;
      const ddx = sx - d.acc.x, ddy = sy - d.acc.y;
      if (ddx || ddy) {
        for (const id of ids) { const p = getPoint(plan, id); p.x = round(p.x + ddx); p.y = round(p.y + ddy); }
        d.acc = { x: sx, y: sy };
        for (const w of plan.walls) clampOpenings(plan, w);
      }
    }
  }

  onUp(e, cancel) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
    const d = this.drag;
    this.drag = null;
    if (!d || cancel) { this.preview = null; this.draw(); return; }
    const p = this.pos(e);
    const wp = this.toWorld(p.x, p.y);

    if (d.kind === 'wallpreview') {
      const lastId = this.chain[this.chain.length - 1];
      const s = this.snap(wp, { from: lastId ? getPoint(this.plan, lastId) : null });
      this.preview = null; this.guides = [];
      this.wallTap(s);
      this.app.chainChanged?.();
      return;
    }
    if (d.kind === 'opening-place') {
      const tool = this.app.tool;
      const near = this.nearestWall(wp, 24 / this.scale);
      if (!near) { this.app.toast('Toque sobre uma parede'); return; }
      this.app.beginEdit();
      const L = wallLength(this.plan, near.wall);
      const o = addOpening(this.plan, near.wall, tool, near.proj.t * L);
      this.app.setTool('select');
      this.app.select({ type: 'opening', id: o.id });
      this.app.changed();
      return;
    }
    if (d.kind === 'tap-or-pan') {
      if (!d.started) this.app.select(d.hit ? (d.hit.type === 'point' ? { ...d.hit } : d.hit) : null);
      return;
    }
    if (d.started) {
      if (d.kind === 'room' || d.kind === 'point' || d.kind === 'wall') {
        const before = this.plan.rooms.length;
        weldPlan(this.plan);
        if (this.plan.rooms.length !== before) this.app.toast('Cômodos unidos às paredes vizinhas');
      }
      this.app.changed();
      return;
    }
    // toque simples num elemento já selecionado
    if (d.kind === 'point') {
      this.app.select({ type: 'point', id: d.id, parent: d.parent });
    } else this.app.select({ type: d.kind, id: d.id });
  }

  nearestWall(wp, tol) {
    let best = null, bd = Infinity;
    for (const w of this.plan.walls) {
      const [a, b] = wallEnds(this.plan, w);
      const pr = projectOnSegment(wp, a, b);
      if (pr.dist < w.thickness / 2 + tol && pr.dist < bd) { bd = pr.dist; best = { wall: w, proj: pr }; }
    }
    return best;
  }

  // ---------- desenho ----------
  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
  }

  render() {
    const g = this.ctx, plan = this.plan;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = COLORS.bg; g.fillRect(0, 0, this.w, this.h);
    this.drawGrid(g);
    const sel = this.app.selection;
    const S = (x, y) => this.toScreen(x, y);

    // cômodos
    for (const r of plan.rooms) {
      const pts = roomPoints(plan, r);
      if (pts.length < 3) continue;
      g.beginPath();
      pts.forEach((p, i) => { const s = S(p.x, p.y); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); });
      g.closePath();
      g.fillStyle = (FLOORS[r.floor]?.color || '#ddd') + 'cc';
      g.fill();
      if (sel?.type === 'room' && sel.id === r.id) { g.strokeStyle = COLORS.sel; g.lineWidth = 3; g.setLineDash([8, 5]); g.stroke(); g.setLineDash([]); }
    }

    // móveis
    for (const it of plan.items) this.drawItem(g, it, sel?.type === 'item' && sel.id === it.id);

    // paredes
    for (const w of plan.walls) this.drawWall(g, w, sel);

    // rótulos dos cômodos
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of plan.rooms) {
      const pts = roomPoints(plan, r);
      if (pts.length < 3) continue;
      const c = polygonCentroid(pts);
      const s = S(c.x, c.y);
      const area = roomArea(plan, r);
      g.font = '600 13px -apple-system, system-ui, sans-serif';
      this.labelBg(g, r.name, s.x, s.y - 8);
      g.fillStyle = COLORS.text; g.fillText(r.name, s.x, s.y - 8);
      g.font = '12px -apple-system, system-ui, sans-serif';
      const at = area.toFixed(2).replace('.', ',') + ' m²';
      this.labelBg(g, at, s.x, s.y + 9);
      g.fillStyle = COLORS.dim; g.fillText(at, s.x, s.y + 9);
    }

    // cotas
    if (this.scale > 22) for (const w of plan.walls) this.drawDim(g, w);

    // pontos
    const showAll = this.app.tool === 'wall';
    const selPts = new Set(this.selectedPointIds());
    for (const p of plan.points) {
      if (!showAll && !selPts.has(p.id)) continue;
      const s = S(p.x, p.y);
      g.beginPath(); g.arc(s.x, s.y, selPts.has(p.id) ? 7 : 4, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill();
      g.lineWidth = 2; g.strokeStyle = sel?.type === 'point' && sel.id === p.id ? '#e8862a' : COLORS.sel; g.stroke();
    }

    // traçado atual + prévia
    if (this.app.tool === 'wall') {
      g.strokeStyle = COLORS.sel; g.lineWidth = 2;
      for (const id of this.chain) {
        const p = getPoint(plan, id); if (!p) continue;
        const s = S(p.x, p.y);
        g.beginPath(); g.arc(s.x, s.y, 6, 0, Math.PI * 2); g.stroke();
      }
      if (this.preview) {
        const pv = this.preview, sp = S(pv.x, pv.y);
        for (const gd of this.guides) {
          const a = S(gd.x1, gd.y1);
          g.strokeStyle = '#e8862a'; g.lineWidth = 1; g.setLineDash([4, 4]);
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(sp.x, sp.y); g.stroke(); g.setLineDash([]);
        }
        const lastId = this.chain[this.chain.length - 1];
        const last = lastId && getPoint(plan, lastId);
        if (last) {
          const sl = S(last.x, last.y);
          g.strokeStyle = COLORS.sel; g.lineWidth = Math.max(3, 0.15 * this.scale); g.globalAlpha = 0.5;
          g.beginPath(); g.moveTo(sl.x, sl.y); g.lineTo(sp.x, sp.y); g.stroke(); g.globalAlpha = 1;
          const len = Math.hypot(pv.x - last.x, pv.y - last.y);
          const txt = fmtLen(len);
          g.font = '600 15px -apple-system, system-ui, sans-serif';
          const mx = (sl.x + sp.x) / 2, my = (sl.y + sp.y) / 2 - 18;
          this.labelBg(g, txt, mx, my, '#2f6fed');
          g.fillStyle = '#fff'; g.fillText(txt, mx, my);
        }
        g.beginPath(); g.arc(sp.x, sp.y, pv.pointId ? 10 : 7, 0, Math.PI * 2);
        g.strokeStyle = pv.pointId ? '#2e8f5a' : pv.wall ? '#e8862a' : COLORS.sel; g.lineWidth = 2.5; g.stroke();
        // lupa: mostra a posição acima do dedo
        g.beginPath(); g.moveTo(sp.x, sp.y - 14); g.lineTo(sp.x, sp.y - 40); g.strokeStyle = 'rgba(47,111,237,.5)'; g.lineWidth = 1; g.stroke();
      }
    }
  }

  drawGrid(g) {
    const step = this.scale >= 40 ? 0.5 : this.scale >= 15 ? 1 : 5;
    const tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h);
    g.lineWidth = 1;
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(x * this.scale + this.ox) + 0.5;
      g.strokeStyle = Math.abs(x % 1) < 1e-6 || Math.abs((x % 1) - 1) < 1e-6 || Math.abs((x % 1) + 1) < 1e-6 ? COLORS.gridMajor : COLORS.grid;
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, this.h); g.stroke();
    }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
      const sy = Math.round(y * this.scale + this.oy) + 0.5;
      g.strokeStyle = Math.abs(y % 1) < 1e-6 || Math.abs((y % 1) - 1) < 1e-6 || Math.abs((y % 1) + 1) < 1e-6 ? COLORS.gridMajor : COLORS.grid;
      g.beginPath(); g.moveTo(0, sy); g.lineTo(this.w, sy); g.stroke();
    }
  }

  drawWall(g, w, sel) {
    const plan = this.plan;
    const [a, b] = wallEnds(plan, w);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) return;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const nx = -uy, ny = ux;
    const t = w.thickness, ht = t / 2;
    const color = w.status === 'new' ? COLORS.wallNew : w.status === 'demolish' ? COLORS.wallDemo : COLORS.wall;
    // partes sólidas
    const ops = [...w.openings].sort((p, q) => p.offset - q.offset);
    const parts = [];
    let cur = 0;
    for (const o of ops) {
      const s = Math.max(cur, o.offset - o.width / 2);
      if (s > cur) parts.push([cur, s]);
      cur = Math.max(cur, o.offset + o.width / 2);
    }
    if (cur < L) parts.push([cur, L]);
    const quad = (s0, s1, ext0, ext1) => {
      const p0 = { x: a.x + ux * (s0 - ext0), y: a.y + uy * (s0 - ext0) };
      const p1 = { x: a.x + ux * (s1 + ext1), y: a.y + uy * (s1 + ext1) };
      const c = [
        this.toScreen(p0.x + nx * ht, p0.y + ny * ht), this.toScreen(p1.x + nx * ht, p1.y + ny * ht),
        this.toScreen(p1.x - nx * ht, p1.y - ny * ht), this.toScreen(p0.x - nx * ht, p0.y - ny * ht),
      ];
      g.beginPath(); c.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath();
    };
    const isSel = sel?.type === 'wall' && sel.id === w.id;
    for (const [s0, s1] of parts) {
      quad(s0, s1, s0 === 0 ? ht : 0, s1 === L ? ht : 0);
      if (w.status === 'demolish') {
        g.fillStyle = 'rgba(210,70,60,0.18)'; g.fill();
        g.setLineDash([5, 4]); g.strokeStyle = color; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
      } else {
        g.fillStyle = color; g.fill();
      }
      if (isSel) { g.strokeStyle = COLORS.sel; g.lineWidth = 3; g.stroke(); }
    }
    // aberturas
    for (const o of w.openings) {
      const isOSel = sel?.type === 'opening' && sel.id === o.id;
      const s0 = o.offset - o.width / 2, s1 = o.offset + o.width / 2;
      const P = (s, k) => this.toScreen(a.x + ux * s + nx * k, a.y + uy * s + ny * k);
      g.lineWidth = 1.5; g.strokeStyle = isOSel ? COLORS.sel : '#55585d';
      if (o.type === 'window') {
        quad(s0, s1, 0, 0);
        g.fillStyle = '#cfe6f2'; g.fill(); g.stroke();
        g.beginPath(); const q0 = P(s0, 0), q1 = P(s1, 0); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke();
      } else if (o.type === 'door') {
        const side = o.swing >= 0 ? 1 : -1;
        const hingeAtStart = o.hinge !== 'R';
        const hs = hingeAtStart ? s0 : s1, fs = hingeAtStart ? s1 : s0;
        const hinge = P(hs, side * ht);
        const leafEnd = this.toScreen(a.x + ux * hs + nx * side * (ht + o.width), a.y + uy * hs + ny * side * (ht + o.width));
        g.beginPath(); g.moveTo(hinge.x, hinge.y); g.lineTo(leafEnd.x, leafEnd.y); g.lineWidth = 2.5; g.stroke();
        const ang0 = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);
        const fp = P(fs, side * ht);
        const ang1 = Math.atan2(fp.y - hinge.y, fp.x - hinge.x);
        g.beginPath();
        let da = ang1 - ang0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        g.arc(hinge.x, hinge.y, o.width * this.scale, ang0, ang1, da < 0);
        g.lineWidth = 1; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
        if (isOSel) { quad(s0, s1, 0, 0); g.strokeStyle = COLORS.sel; g.lineWidth = 2; g.stroke(); }
      } else {
        g.setLineDash([4, 3]);
        for (const k of [ht, -ht]) { g.beginPath(); const q0 = P(s0, k), q1 = P(s1, k); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.stroke(); }
        g.setLineDash([]);
        if (isOSel) { quad(s0, s1, 0, 0); g.strokeStyle = COLORS.sel; g.lineWidth = 2; g.stroke(); }
      }
    }
  }

  drawDim(g, w) {
    const [a, b] = wallEnds(this.plan, w);
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.2) return;
    const sa = this.toScreen(a.x, a.y), sb = this.toScreen(b.x, b.y);
    let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    const off = w.thickness / 2 * this.scale + 10;
    const mx = (sa.x + sb.x) / 2 + nx * off, my = (sa.y + sb.y) / 2 + ny * off;
    if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
    if (L * this.scale < 34) return;
    g.save(); g.translate(mx, my); g.rotate(ang);
    g.font = '11px -apple-system, system-ui, sans-serif';
    g.fillStyle = w.status === 'demolish' ? COLORS.wallDemo : COLORS.dim;
    g.fillText(fmtLen(L), 0, 0);
    g.restore();
  }

  drawItem(g, it, selected) {
    const s = this.toScreen(it.x, it.y);
    g.save(); g.translate(s.x, s.y); g.rotate((it.rot * Math.PI) / 180);
    const w = it.w * this.scale, d = it.d * this.scale;
    g.fillStyle = it.color + 'd0';
    g.strokeStyle = selected ? COLORS.sel : 'rgba(0,0,0,.45)';
    g.lineWidth = selected ? 2.5 : 1;
    g.beginPath(); g.rect(-w / 2, -d / 2, w, d); g.fill(); g.stroke();
    // marca da "frente" do móvel
    g.beginPath(); g.moveTo(-w / 2 + 3, d / 2 - 3); g.lineTo(w / 2 - 3, d / 2 - 3);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.stroke();
    if (w > 40 && d > 14) {
      g.font = '10px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = lum(it.color) > 0.55 ? '#333' : '#fff';
      g.fillText(clip(g, it.name, w - 6), 0, 0);
    }
    g.restore();
  }

  labelBg(g, text, x, y, color = 'rgba(255,255,255,.75)') {
    const m = g.measureText(text);
    const w = m.width + 10, h = 18;
    g.fillStyle = color;
    roundRect(g, x - w / 2, y - h / 2, w, h, 5); g.fill();
  }

  // imagem PNG da planta atual
  snapshot() {
    return this.canvas.toDataURL('image/png');
  }
}

export function fmtLen(m) {
  return m.toFixed(2).replace('.', ',') + ' m';
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function clip(g, t, max) {
  if (g.measureText(t).width <= max) return t;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
