// Planta da Unidade 17 (a 18 é espelhada), lida da planta YHM-ARQ-LO-1007-PLA-TPO-R04.
// Medidas em metros pelo eixo das paredes, aproximadas a partir das cotas legíveis no print:
// dormitório 3,22 × 2,62; sala/cozinha 4,04 × 2,42; closet/circulação ~0,68; banho 2,44 × ~1,25;
// terraço social 1,66 de largura; janela do dormitório 1,60; porta de vidro da sala 1,80.
// Simplificação: as paredes inclinadas do corredor/closet foram desenhadas retas.
// O pé-direito NÃO aparece no print: 5,00 m é uma estimativa para caber o mezanino. Ajuste no menu.
import {
  emptyPlan, uid, addPoint, addWall, detectRooms, getPoint, wallEnds, wallLength, addMezzanine, round,
} from './model.js';

export function unit17Plan({ withMezzanine = false } = {}) {
  const plan = emptyPlan();
  plan.wallHeight = 5.0;
  const P = {};
  const pt = (k, x, y) => (P[k] = addPoint(plan, x, y).id);
  // interior
  pt('A', 0, 0); pt('B', 4.04, 0); pt('C', 4.04, 2.48); pt('D', 4.04, 5.15);
  pt('E', 0.76, 5.15); pt('F', 0, 5.15); pt('G', 0, 2.48); pt('H', 0.76, 2.48);
  // banho (à esquerda do closet)
  pt('I', -1.3, 2.48); pt('J', -1.3, 4.92); pt('K', 0, 4.92);
  // terraço social e área técnica (lado de fora, à direita)
  pt('T1', 5.7, 0); pt('T2', 5.7, 2.48); pt('T3', 5.7, 4.48); pt('T4', 4.04, 4.48);

  const W = {};
  const wall = (k, a, b, t = 0.15, extra = {}) => (W[k] = Object.assign(addWall(plan, P[a], P[b], { thickness: t }), extra));
  wall('cozinha', 'A', 'B', 0.19);          // parede com a unidade 18 (bancada da cozinha)
  wall('sala_terraco', 'B', 'C', 0.15);     // caixilho da sala para o terraço
  wall('dorm_tecnica', 'C', 'T4', 0.15);    // dormitório → área técnica (trecho com janela)
  wall('dorm_fachada_dir', 'T4', 'D', 0.15);
  wall('fachada', 'D', 'E', 0.19);
  wall('fachada_closet', 'E', 'F', 0.19);
  wall('entrada', 'F', 'K', 0.15);
  wall('banho_closet', 'K', 'G', 0.115);
  wall('entrada_sala', 'G', 'A', 0.15);
  wall('sala_dorm', 'H', 'C', 0.115);
  wall('sala_closet', 'G', 'H', 0.115);
  wall('closet_dorm', 'H', 'E', 0.115);
  wall('banho_topo', 'G', 'I', 0.115);
  wall('banho_esq', 'I', 'J', 0.15);
  wall('banho_baixo', 'J', 'K', 0.115);
  // terraço: guarda-corpo de 1,10 m
  const parapet = { height: 1.1 };
  wall('terraco_topo', 'B', 'T1', 0.15, parapet);
  wall('terraco_frente', 'T1', 'T2', 0.15, parapet);
  wall('tecnica_frente', 'T2', 'T3', 0.15, parapet);
  wall('tecnica_baixo', 'T3', 'T4', 0.15, parapet);
  wall('terraco_tecnica', 'C', 'T2', 0.15);

  const open = (k, type, offset, width, height, sill = 0, hinge = 'L', swing = 1) => {
    W[k].openings.push({ id: uid(), type, offset, width, height, sill, hinge, swing });
  };
  // porta de vidro de correr da sala para o terraço (1,80 × 2,30)
  open('sala_terraco', 'window', 1.21, 1.8, 2.3, 0);
  // janela do dormitório para a área técnica (1,60), a 35,5 cm da parede da sala
  open('dorm_tecnica', 'window', 1.155, 1.6, 1.4, 0.9);
  // porta de entrada (0,90) na parede da sala junto ao corredor
  open('entrada_sala', 'door', 1.8, 0.9, 2.1, 0, 'L', -1);
  // porta da sala para o closet/dormitório (PM03, 0,70)
  open('sala_closet', 'door', 0.38, 0.7, 2.1, 0, 'L', -1);
  // passagem do closet para o dormitório
  open('closet_dorm', 'passage', 0.5, 0.7, 2.1, 0);
  // porta do banho (0,70) a partir do closet
  open('banho_closet', 'door', 1.6, 0.7, 2.1, 0, 'R', 1);
  // porta da sala para o terraço ao lado da área técnica não existe; área técnica pelo terraço
  open('terraco_tecnica', 'passage', 0.83, 0.8, 2.1, 0);

  detectRooms(plan);
  const name = (x, y, n, floor, wallFin) => {
    for (const r of plan.rooms) {
      const pts = r.pts.map((id) => getPoint(plan, id));
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) { r.name = n; r.floor = floor; if (wallFin) r.wall = wallFin; }
    }
  };
  name(2, 1.2, 'Sala / Cozinha', 'contrapiso');
  name(2.4, 3.8, 'Dormitório', 'contrapiso');
  name(0.38, 3.8, 'Closet', 'contrapiso');
  name(-0.65, 3.7, 'Banho', 'contrapiso', { type: 'tile', tile: 'azulejo_branco', color: '#f7f6f2' });
  name(4.9, 1.2, 'Terraço social', 'contrapiso');
  name(4.9, 3.3, 'Área técnica', 'contrapiso');

  // cozinha linear existente (bancada com pia e cooktop)
  const item = (kind, nm, x, y, w, d, h, color, rot = 0, elev = 0) =>
    plan.items.push({ id: uid(), kind, name: nm, x: round(x), y: round(y), w, d, h, elev, rot, color });
  item('counter', 'Bancada cozinha (pia + cooktop)', 1.7, 0.4, 2.2, 0.6, 0.9, '#e8e4dc', 180);
  item('toilet', 'Vaso sanitário', -0.65, 4.5, 0.38, 0.65, 0.4, '#f7f7f7', 0);
  item('counter', 'Gabinete c/ pia', -1.0, 3.0, 0.6, 0.45, 0.85, '#e8e4dc', 90);
  item('shower', 'Box', -0.65, 3.55, 1.1, 0.8, 1.9, '#bfe0e8', 0);

  if (withMezzanine) mezzanineScenario(plan);
  return plan;
}

// Sugestão: mezanino sobre dormitório + closet, sala com pé-direito duplo.
function mezzanineScenario(plan) {
  const m = addMezzanine(plan, 2.02, 3.82, 4.04, 2.66, 2.6);
  m.name = 'Mezanino (quarto em cima)';
  m.rails = [true, false, false, false]; // guarda-corpo voltado para a sala; demais lados encostam em paredes
  // a divisória sala/dormitório (e sala/closet) passa a ir só até o mezanino; acima fica aberto
  for (const w of plan.walls) {
    const [p, q] = wallEnds(plan, w);
    if (Math.abs(p.y - 2.48) < 0.01 && Math.abs(q.y - 2.48) < 0.01 && Math.min(p.x, q.x) >= -0.01 && Math.max(p.x, q.x) <= 4.05) w.height = m.h;
  }
  const item = (kind, nm, x, y, w, d, h, color, rot = 0, elev = 0) =>
    plan.items.push({ id: uid(), kind, name: nm, x: round(x), y: round(y), w, d, h, elev, rot, color });
  const up = m.h;
  item('bed', 'Cama queen (mezanino)', 2.6, 4.15, 1.58, 1.98, 0.35, '#e8e4dc', 90, up);
  item('cabinet', 'Criado-mudo', 3.78, 3.1, 0.45, 0.4, 0.45, '#c9a77c', 90, up);
  item('wardrobe', 'Armário baixo', 0.75, 4.7, 1.2, 0.5, 1.2, '#e8e4dc', 180, up);
  // escada encostada na parede do dormitório, subindo em direção ao terraço e chegando na borda do mezanino
  item('stairs', 'Escada reta', 2.25, 2.03, 0.75, 2.6, 2.6, '#8a5b3a', 90, 0);
  // embaixo: dormitório vira home office + estar íntimo
  item('table', 'Escrivaninha', 3.65, 3.4, 1.2, 0.6, 0.75, '#c9a77c', 270);
  item('chair', 'Cadeira', 3.2, 3.4, 0.45, 0.5, 0.9, '#2f3033', 90);
  item('sofa', 'Sofá 2 lugares', 1.9, 4.65, 1.6, 0.85, 0.85, '#8f8a83', 0);
}

export function unit17Project() {
  const a = uid(), b = uid();
  const plan = unit17Plan();
  const reform = unit17Plan({ withMezzanine: true });
  // na reforma os acabamentos já sugerem um caminho
  for (const r of reform.rooms) {
    if (r.name === 'Sala / Cozinha' || r.name === 'Dormitório' || r.name === 'Closet') r.floor = 'madeira_clara';
    if (r.name === 'Terraço social' || r.name === 'Área técnica') r.floor = 'porcelanato_cinza';
    if (r.name === 'Banho') r.floor = 'porcelanato_claro';
  }
  return {
    version: 1,
    name: 'Apto Unidade 17',
    activeId: b,
    scenarios: [
      { id: a, name: 'Planta original', plan },
      { id: b, name: 'Mezanino (proposta)', plan: reform },
    ],
  };
}
