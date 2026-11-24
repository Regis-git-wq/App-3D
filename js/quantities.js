// Levantamento de quantitativos de um cenário (para orçamento).
import { FLOORS, WALL_TILES, PAINTS } from './catalog.js';
import { roomArea, roomPoints, wallLength, wallHeight, wallSideRooms } from './model.js';

const openingArea = (w) => w.openings.reduce((s, o) => s + o.width * Math.min(o.height, 99), 0);

export function computeQuantities(plan) {
  const q = {
    floorTotal: 0,
    rooms: [],
    floors: {},      // material -> m²
    paints: {},      // cor -> m²
    tiles: {},       // revestimento -> m²
    demolishArea: 0, demolishLength: 0,
    newArea: 0, newLength: 0,
    openings: { door: 0, window: 0, passage: 0 },
    items: {},
  };

  for (const r of plan.rooms) {
    const a = roomArea(plan, r);
    const pts = roomPoints(plan, r);
    let per = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], n = pts[(i + 1) % pts.length];
      per += Math.hypot(n.x - p.x, n.y - p.y);
    }
    q.rooms.push({ id: r.id, name: r.name, area: a, perimeter: per, floor: r.floor, wallArea: 0 });
    q.floorTotal += a;
    q.floors[r.floor] = (q.floors[r.floor] || 0) + a;
  }

  for (const w of plan.walls) {
    const L = wallLength(plan, w);
    const H = wallHeight(plan, w);
    const net = Math.max(0, L * H - openingArea(w));
    if (w.status === 'demolish') {
      q.demolishArea += net; q.demolishLength += L;
      continue;
    }
    if (w.status === 'new') { q.newArea += net; q.newLength += L; }
    for (const o of w.openings) q.openings[o.type]++;
    const sides = wallSideRooms(plan, w);
    for (const side of ['L', 'R']) {
      const room = sides[side];
      if (!room) continue;
      const rq = q.rooms.find((x) => x.id === room.id);
      if (rq) rq.wallArea += net;
      const fin = room.wall || { type: 'paint', color: '#f7f6f2' };
      if (fin.type === 'tile') q.tiles[fin.tile] = (q.tiles[fin.tile] || 0) + net;
      else q.paints[fin.color] = (q.paints[fin.color] || 0) + net;
    }
  }

  for (const it of plan.items) q.items[it.name] = (q.items[it.name] || 0) + 1;
  q.mezz = (plan.mezzanines || []).map((m) => ({
    name: m.name, area: m.w * m.d, floor: m.floor,
    rail: (m.rails || []).reduce((t, on, i) => t + (on ? (i % 2 ? m.d : m.w) : 0), 0),
  }));
  return q;
}

export const floorName = (k) => FLOORS[k]?.name || k;
export const tileName = (k) => WALL_TILES[k]?.name || k;
export const paintName = (hex) => PAINTS.find((p) => p[1].toLowerCase() === hex.toLowerCase())?.[0] || `Cor personalizada (${hex})`;

export const fmtM2 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
export const fmtM = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';
