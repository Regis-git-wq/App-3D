// Modelo de dados da planta. Todas as medidas em metros.
// Coordenadas da planta: x para a direita, y para baixo (no 3D, y da planta = z do mundo).

export const uid = () => Math.random().toString(36).slice(2, 10);

export const OPENING_DEFAULTS = {
  door: { width: 0.8, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 1.0 },
  passage: { width: 0.9, height: 2.1, sill: 0 },
};

export const OPENING_NAMES = { door: 'Porta', window: 'Janela', passage: 'Vão livre' };
export const STATUS_NAMES = { existing: 'Existente', demolish: 'Demolir', new: 'Construir' };

export function emptyPlan() {
  return { wallHeight: 2.7, points: [], walls: [], rooms: [], items: [] };
}

export function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan));
}

// ---------- consultas ----------
export const getPoint = (plan, id) => plan.points.find((p) => p.id === id);
export const getWall = (plan, id) => plan.walls.find((w) => w.id === id);

export function wallEnds(plan, w) {
  return [getPoint(plan, w.a), getPoint(plan, w.b)];
}

export function wallLength(plan, w) {
  const [a, b] = wallEnds(plan, w);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallHeight(plan, w) {
  return w.height || plan.wallHeight;
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(pts) {
  let cx = 0, cy = 0, s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f; cy += (a.y + b.y) * f; s += f;
  }
  if (Math.abs(s) < 1e-9) {
    return { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
  }
  return { x: cx / (3 * s), y: cy / (3 * s) };
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function roomPoints(plan, room) {
  return room.pts.map((id) => getPoint(plan, id)).filter(Boolean);
}

export function roomArea(plan, room) {
  const pts = roomPoints(plan, room);
  return pts.length >= 3 ? polygonArea(pts) : 0;
}

// Projeção de um ponto num segmento: retorna t (0..1), distância e ponto projetado.
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + dx * t, y = a.y + dy * t;
  return { t, x, y, dist: Math.hypot(p.x - x, p.y - y) };
}

export function findPointNear(plan, x, y, tol) {
  let best = null, bd = tol;
  for (const p of plan.points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function findWallNear(plan, x, y, tol, { includeDemolished = true } = {}) {
  let best = null, bd = tol, bproj = null;
  for (const w of plan.walls) {
    if (!includeDemolished && w.status === 'demolish') continue;
    const [a, b] = wallEnds(plan, w);
    const pr = projectOnSegment({ x, y }, a, b);
    const lim = Math.max(bd, (w.thickness || 0.15) / 2);
    if (pr.dist < lim && pr.dist < bd + (w.thickness || 0.15) / 2) {
      if (!best || pr.dist < bd) { bd = pr.dist; best = w; bproj = pr; }
    }
  }
  return best ? { wall: best, proj: bproj } : null;
}

// Qual cômodo está de cada lado da parede. Lado "L" = normal (-dy, dx).
export function wallSideRooms(plan, w) {
  const [a, b] = wallEnds(plan, w);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const off = (w.thickness || 0.15) / 2 + 0.05;
  const res = { L: null, R: null };
  for (const room of plan.rooms) {
    const pts = roomPoints(plan, room);
    if (pts.length < 3) continue;
    if (!res.L && pointInPolygon({ x: mx + nx * off, y: my + ny * off }, pts)) res.L = room;
    if (!res.R && pointInPolygon({ x: mx - nx * off, y: my - ny * off }, pts)) res.R = room;
  }
  return res;
}

// ---------- edição ----------
export function addPoint(plan, x, y) {
  const p = { id: uid(), x: round(x), y: round(y) };
  plan.points.push(p);
  return p;
}

// Reaproveita um ponto existente; se cair sobre uma parede, divide a parede ali.
export function ensurePoint(plan, x, y, tol = 0.02) {
  const p = findPointNear(plan, x, y, tol);
  if (p) return p;
  for (const w of plan.walls) {
    const [a, b] = wallEnds(plan, w);
    const pr = projectOnSegment({ x, y }, a, b);
    if (pr.dist < tol && pr.t > 0.001 && pr.t < 0.999) return splitWall(plan, w, pr.t);
  }
  return addPoint(plan, x, y);
}

export function addWall(plan, aId, bId, opts = {}) {
  if (aId === bId) return null;
  const existing = plan.walls.find((w) => (w.a === aId && w.b === bId) || (w.a === bId && w.b === aId));
  if (existing) return existing;
  const w = { id: uid(), a: aId, b: bId, thickness: opts.thickness ?? 0.15, status: opts.status || 'existing', openings: [] };
  plan.walls.push(w);
  return w;
}

// Divide a parede em t (0..1). Retorna o novo ponto.
export function splitWall(plan, w, t) {
  const [a, b] = wallEnds(plan, w);
  const L = wallLength(plan, w);
  const p = addPoint(plan, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const cut = L * t;
  const w2 = { id: uid(), a: p.id, b: w.b, thickness: w.thickness, status: w.status, height: w.height, openings: [] };
  const keep = [];
  for (const o of w.openings) {
    if (o.offset > cut) { w2.openings.push({ ...o, offset: o.offset - cut }); } else keep.push(o);
  }
  w.openings = keep;
  w.b = p.id;
  plan.walls.push(w2);
  // atualiza cômodos que passam pela aresta a-b
  for (const room of plan.rooms) {
    const n = room.pts.length;
    for (let i = 0; i < n; i++) {
      const u = room.pts[i], v = room.pts[(i + 1) % n];
      if ((u === w.a && v === w2.b) || (u === w2.b && v === w.a)) {
        room.pts.splice(i + 1, 0, p.id);
        break;
      }
    }
  }
  return p;
}

// Ajusta o comprimento movendo o ponto B ao longo da direção atual.
export function setWallLength(plan, w, L) {
  const [a, b] = wallEnds(plan, w);
  const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  b.x = round(a.x + ((b.x - a.x) / cur) * L);
  b.y = round(a.y + ((b.y - a.y) / cur) * L);
  clampOpenings(plan, w);
}

export function clampOpenings(plan, w) {
  const L = wallLength(plan, w);
  for (const o of w.openings) {
    o.width = Math.min(o.width, Math.max(0.2, L - 0.02));
    o.offset = Math.max(o.width / 2, Math.min(L - o.width / 2, o.offset));
  }
}

export function addOpening(plan, w, type, offset) {
  const d = OPENING_DEFAULTS[type];
  const o = { id: uid(), type, offset, width: d.width, height: d.height, sill: d.sill, hinge: 'L', swing: 1 };
  w.openings.push(o);
  clampOpenings(plan, w);
  return o;
}

export function findOpening(plan, id) {
  for (const w of plan.walls) {
    const o = w.openings.find((o) => o.id === id);
    if (o) return { wall: w, opening: o };
  }
  return null;
}

export function deleteWall(plan, id) {
  plan.walls = plan.walls.filter((w) => w.id !== id);
  cleanup(plan);
}

export function deletePoint(plan, id) {
  plan.walls = plan.walls.filter((w) => w.a !== id && w.b !== id);
  for (const r of plan.rooms) r.pts = r.pts.filter((p) => p !== id);
  plan.rooms = plan.rooms.filter((r) => r.pts.length >= 3);
  cleanup(plan);
}

export function cleanup(plan) {
  const used = new Set();
  for (const w of plan.walls) { used.add(w.a); used.add(w.b); }
  for (const r of plan.rooms) r.pts.forEach((p) => used.add(p));
  plan.points = plan.points.filter((p) => used.has(p.id));
}

export function addRoom(plan, ptIds, name) {
  const room = {
    id: uid(),
    name: name || `Cômodo ${plan.rooms.length + 1}`,
    pts: ptIds.slice(),
    floor: 'contrapiso',
    wall: { type: 'paint', color: '#f7f6f2', tile: 'azulejo_branco' },
  };
  plan.rooms.push(room);
  return room;
}

export function addRectRoom(plan, x, y, w, d, name, status = 'existing') {
  const corners = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  const ids = corners.map(([cx, cy]) => ensurePoint(plan, cx, cy, 0.03).id);
  for (let i = 0; i < 4; i++) addWall(plan, ids[i], ids[(i + 1) % 4], { status });
  return addRoom(plan, ids, name);
}

export function addItem(plan, def, x, y) {
  const it = {
    id: uid(), kind: def.kind, name: def.name, x: round(x), y: round(y),
    w: def.w, d: def.d, h: def.h, elev: def.elev || 0, rot: 0, color: def.color,
  };
  plan.items.push(it);
  return it;
}

export function round(v) {
  return Math.round(v * 1000) / 1000;
}

// ---------- projeto / cenários ----------
export function samplePlan() {
  const plan = emptyPlan();
  addRectRoom(plan, 0, 0, 5.2, 4.0, 'Sala');
  addRectRoom(plan, 5.2, 0, 3.2, 4.0, 'Quarto');
  addRectRoom(plan, 0, 4.0, 3.0, 2.6, 'Cozinha');
  addRectRoom(plan, 3.0, 4.0, 2.2, 2.6, 'Banheiro');
  const findW = (x1, y1, x2, y2) => plan.walls.find((w) => {
    const [a, b] = wallEnds(plan, w);
    return (near(a, x1, y1) && near(b, x2, y2)) || (near(a, x2, y2) && near(b, x1, y1));
  });
  const put = (wall, type, pos, width) => {
    if (!wall) return;
    const [a] = wallEnds(plan, wall);
    // pos medido a partir do ponto de menor x/y para ficar previsível
    const L = wallLength(plan, wall);
    const fromA = a.x + a.y <= wallEnds(plan, wall)[1].x + wallEnds(plan, wall)[1].y;
    const o = addOpening(plan, wall, type, fromA ? pos : L - pos);
    if (width) { o.width = width; clampOpenings(plan, wall); }
  };
  put(findW(0, 0, 5.2, 0), 'window', 2.6, 2.4);
  put(findW(5.2, 0, 8.4, 0), 'window', 1.6, 1.5);
  put(findW(5.2, 0, 5.2, 4.0), 'door', 3.0);
  put(findW(0, 4.0, 3.0, 4.0), 'passage', 1.5, 1.2);
  put(findW(3.0, 4.0, 5.2, 4.0), 'door', 1.1, 0.7);
  put(findW(0, 0, 0, 4.0), 'door', 3.0, 0.9);
  put(findW(0, 6.6, 3.0, 6.6), 'window', 1.5, 1.0);
  put(findW(3.0, 6.6, 5.2, 6.6), 'window', 1.1, 0.6);
  const banho = plan.rooms.find((r) => r.name === 'Banheiro');
  for (const w of plan.walls) {
    for (const o of w.openings) if (o.type === 'window' && banho && wallSideRooms(plan, w).L === banho) { o.sill = 1.6; o.height = 0.6; }
  }
  return plan;
}

function near(p, x, y) {
  return Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
}

export function newProject(withSample = true) {
  const id = uid();
  return {
    version: 1,
    name: 'Meu apartamento',
    activeId: id,
    scenarios: [{ id, name: 'Atual (antes)', plan: withSample ? samplePlan() : emptyPlan() }],
  };
}

// ---------- detecção automática de cômodos ----------
// Encontra as faces fechadas formadas pelas paredes (ignorando as que serão demolidas)
// e sincroniza a lista de cômodos: divide cômodos cortados por paredes novas e une
// cômodos cuja parede divisória será demolida. Nome e acabamentos são herdados.
export function planarFaces(plan) {
  const walls = plan.walls.filter((w) => w.status !== 'demolish');
  const adj = new Map();
  const P = (id) => getPoint(plan, id);
  for (const w of walls) {
    if (!P(w.a) || !P(w.b) || w.a === w.b) continue;
    if (!adj.has(w.a)) adj.set(w.a, new Set());
    if (!adj.has(w.b)) adj.set(w.b, new Set());
    adj.get(w.a).add(w.b); adj.get(w.b).add(w.a);
  }
  const sorted = new Map();
  for (const [u, set] of adj) {
    const pu = P(u);
    sorted.set(u, [...set].sort((a, b) => Math.atan2(P(a).y - pu.y, P(a).x - pu.x) - Math.atan2(P(b).y - pu.y, P(b).x - pu.x)));
  }
  const seen = new Set();
  const faces = [];
  for (const [u, nbs] of sorted) {
    for (const v of nbs) {
      if (seen.has(u + '>' + v)) continue;
      const face = [];
      let a = u, b = v, guard = 0;
      while (!seen.has(a + '>' + b) && guard++ < 10000) {
        seen.add(a + '>' + b);
        face.push(a);
        const list = sorted.get(b);
        const i = list.indexOf(a);
        const next = list[(i - 1 + list.length) % list.length];
        a = b; b = next;
      }
      faces.push(face);
    }
  }
  const out = [];
  for (let f of faces) {
    // remove "espinhos" de paredes soltas (a, b, a)
    let changed = true;
    while (changed && f.length >= 3) {
      changed = false;
      for (let i = 0; i < f.length; i++) {
        const prev = f[(i - 1 + f.length) % f.length], next = f[(i + 1) % f.length];
        if (prev === next) { f.splice(i, 1); f.splice(f.indexOf(next), 1); changed = true; break; }
      }
    }
    if (f.length < 3 || new Set(f).size !== f.length) continue;
    const pts = f.map(P);
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
    // com esta regra de percurso, faces internas têm área assinada positiva; a externa, negativa
    if (s / 2 < 0.25) continue;
    out.push(f);
  }
  return out;
}

export function detectRooms(plan) {
  const faces = planarFaces(plan);
  const key = (ids) => [...ids].sort().join(',');
  const byKey = new Map(plan.rooms.map((r) => [key(r.pts), r]));
  const result = [];
  const used = new Set();
  const pending = [];
  for (const f of faces) {
    const r = byKey.get(key(f));
    if (r) { result.push(r); used.add(r.id); } else pending.push(f);
  }
  const consumed = new Set();
  const nameCount = {};
  const archive = plan.roomArchive || [];
  for (const f of pending.slice()) {
    // cômodo que já existiu com exatamente estes cantos (ex.: parede "desdemolida")
    const i = archive.findIndex((r) => key(r.pts) === key(f));
    if (i >= 0) {
      const r = archive.splice(i, 1)[0];
      result.push({ ...r, id: uid(), pts: f });
      pending.splice(pending.indexOf(f), 1);
      for (const o of plan.rooms) if (!used.has(o.id) && pointInPolygon(polygonCentroid(roomPoints(plan, o)), f.map((id) => getPoint(plan, id)))) consumed.add(o.id);
    }
  }
  for (const f of pending) {
    const fpts = f.map((id) => getPoint(plan, id));
    const fc = polygonCentroid(fpts);
    let parent = null, pa = Infinity;
    const absorbed = [];
    for (const r of plan.rooms) {
      if (used.has(r.id)) continue;
      const rp = roomPoints(plan, r);
      if (rp.length < 3) continue;
      if (pointInPolygon(fc, rp)) { const a = polygonArea(rp); if (a < pa) { pa = a; parent = r; } }
      if (pointInPolygon(polygonCentroid(rp), fpts)) absorbed.push(r);
    }
    if (!parent) parent = absorbed.sort((a, b) => roomArea(plan, b) - roomArea(plan, a))[0] || null;
    let name;
    if (parent) {
      nameCount[parent.id] = (nameCount[parent.id] || 0) + 1;
      name = nameCount[parent.id] === 1 ? parent.name : `${parent.name} (${nameCount[parent.id]})`;
      consumed.add(parent.id);
    }
    absorbed.forEach((r) => consumed.add(r.id));
    const room = {
      id: uid(),
      name: name || `Cômodo ${plan.rooms.length + result.length + 1}`,
      pts: f,
      floor: parent?.floor || 'contrapiso',
      wall: parent?.wall ? { ...parent.wall } : { type: 'paint', color: '#f7f6f2', tile: 'azulejo_branco' },
    };
    result.push(room);
  }
  // cômodos que não viraram face e não foram absorvidos continuam (ex.: paredes que se cruzam sem ponto)
  for (const r of plan.rooms) {
    if (!used.has(r.id) && !consumed.has(r.id)) result.push(r);
    else if (consumed.has(r.id)) archive.push(JSON.parse(JSON.stringify(r)));
  }
  plan.roomArchive = archive.slice(-30);
  const changed = result.length !== plan.rooms.length || result.some((r, i) => r !== plan.rooms[i]);
  plan.rooms = result;
  return changed;
}

// ---------- solda de cômodos encostados ----------
// Une cantos próximos, divide paredes onde um canto encosta nelas e remove paredes duplicadas.
// Usado depois de arrastar um cômodo até outro ou de adicionar um cômodo mapeado por foto.
export function weldPlan(plan, tol = 0.06) {
  const replace = (from, to) => {
    for (const w of plan.walls) { if (w.a === from) w.a = to; if (w.b === from) w.b = to; }
    for (const r of plan.rooms) r.pts = r.pts.map((p) => (p === from ? to : p)).filter((p, i, arr) => p !== arr[(i + 1) % arr.length] || arr.length === 1);
    plan.points = plan.points.filter((p) => p.id !== from);
  };
  // 1) cantos próximos
  for (let i = 0; i < plan.points.length; i++) {
    for (let j = i + 1; j < plan.points.length; j++) {
      const a = plan.points[i], b = plan.points[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < tol) { replace(b.id, a.id); j--; }
    }
  }
  // 2) canto encostado no meio de uma parede
  let guard = 0, changed = true;
  while (changed && guard++ < 200) {
    changed = false;
    outer: for (const p of plan.points) {
      for (const w of plan.walls) {
        if (w.a === p.id || w.b === p.id) continue;
        const [a, b] = wallEnds(plan, w);
        const pr = projectOnSegment(p, a, b);
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (pr.dist < tol && pr.t * L > tol && (1 - pr.t) * L > tol) {
          const q = splitWall(plan, w, pr.t);
          replace(q.id, p.id);
          changed = true;
          break outer;
        }
      }
    }
  }
  // 3) paredes duplicadas ou de comprimento zero
  const seen = new Map();
  const keep = [];
  for (const w of plan.walls) {
    if (w.a === w.b) continue;
    const k = [w.a, w.b].sort().join('|');
    const prev = seen.get(k);
    if (!prev) { seen.set(k, w); keep.push(w); continue; }
    const L = wallLength(plan, w);
    for (const o of w.openings) prev.openings.push(prev.a === w.a ? o : { ...o, offset: L - o.offset });
    if (prev.status === 'demolish' && w.status !== 'demolish') prev.status = w.status;
  }
  plan.walls = keep;
  plan.rooms = plan.rooms.filter((r) => new Set(r.pts).size >= 3);
  cleanup(plan);
  detectRooms(plan);
}

// Cria um cômodo a partir de um polígono (em metros), ex.: vindo do mapeamento por foto.
export function addPolygonRoom(plan, pts, name, status = 'existing') {
  const ids = pts.map((p) => addPoint(plan, p.x, p.y).id);
  for (let i = 0; i < ids.length; i++) addWall(plan, ids[i], ids[(i + 1) % ids.length], { status });
  const room = addRoom(plan, ids, name);
  return room;
}
