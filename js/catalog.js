// Catálogo de acabamentos e móveis. Texturas são desenhadas em canvas (sem arquivos externos).

// size = quantos metros a textura cobre (para repetir em escala real)
export const FLOORS = {
  contrapiso: { name: 'Contrapiso (obra)', color: '#9a978f', size: 2, draw: (g, s) => concrete(g, s, '#9a978f', 26) },
  cimento_queimado: { name: 'Cimento queimado', color: '#8d9194', size: 3, draw: (g, s) => concrete(g, s, '#8f9396', 14, true) },
  porcelanato_claro: { name: 'Porcelanato claro 60×60', color: '#e7e3dc', size: 1.2, draw: (g, s) => tiles(g, s, 2, 2, '#e9e5de', '#cfcac2', 10) },
  porcelanato_cinza: { name: 'Porcelanato cinza 90×90', color: '#b8b6b2', size: 1.8, draw: (g, s) => tiles(g, s, 2, 2, '#bab8b4', '#9e9c98', 10) },
  porcelanato_escuro: { name: 'Porcelanato grafite 60×60', color: '#55575a', size: 1.2, draw: (g, s) => tiles(g, s, 2, 2, '#57595c', '#3e4043', 8) },
  marmore: { name: 'Mármore branco 60×120', color: '#eeece8', size: 2.4, draw: (g, s) => marble(g, s) },
  madeira_clara: { name: 'Madeira clara (tábuas)', color: '#c9a77c', size: 1.6, draw: (g, s) => planks(g, s, ['#cfae84', '#c6a273', '#d4b68e', '#bf9b6c']) },
  madeira_media: { name: 'Madeira média (tábuas)', color: '#a0714a', size: 1.6, draw: (g, s) => planks(g, s, ['#a5754d', '#9a6a43', '#ad7d55', '#946540']) },
  madeira_escura: { name: 'Madeira escura (tábuas)', color: '#5e4330', size: 1.6, draw: (g, s) => planks(g, s, ['#644733', '#5a3f2c', '#6b4d38', '#533a29']) },
  vinilico_cinza: { name: 'Vinílico cinza amadeirado', color: '#a7a29a', size: 1.6, draw: (g, s) => planks(g, s, ['#aca79f', '#a29d95', '#b3aea6', '#9b968e']) },
  ceramica_hex: { name: 'Ladrilho hexagonal', color: '#d9d4cb', size: 0.6, draw: (g, s) => hexes(g, s, '#dcd7ce', '#b8b2a8') },
  ladrilho_hidraulico: { name: 'Ladrilho hidráulico', color: '#c5b9a6', size: 0.6, draw: (g, s) => hydraulic(g, s) },
};

export const WALL_TILES = {
  azulejo_branco: { name: 'Azulejo branco 30×60', color: '#f4f4f2', size: 1.2, draw: (g, s) => tiles(g, s, 2, 4, '#f5f5f3', '#d6d6d2', 4, true) },
  metro_branco: { name: 'Metrô branco 10×20', color: '#f1f0ec', size: 0.6, draw: (g, s) => brick(g, s, 3, 6, '#f2f1ed', '#cfcdc6') },
  metro_verde: { name: 'Metrô verde 10×20', color: '#6f8f7b', size: 0.6, draw: (g, s) => brick(g, s, 3, 6, '#71917d', '#55705f') },
  porcelanato_parede: { name: 'Porcelanato 60×120', color: '#dcd8d1', size: 2.4, draw: (g, s) => tiles(g, s, 2, 2, '#ddd9d2', '#c3beb6', 6) },
  marmore_parede: { name: 'Mármore', color: '#eeece8', size: 2.4, draw: (g, s) => marble(g, s) },
  tijolinho: { name: 'Tijolinho aparente', color: '#a5553a', size: 1.0, draw: (g, s) => brick(g, s, 4, 14, '#a8583c', '#d9d2c5', true) },
  ripado: { name: 'Painel ripado madeira', color: '#9b6c45', size: 0.6, draw: (g, s) => slats(g, s) },
};

export const PAINTS = [
  ['Branco neve', '#f7f6f2'], ['Off-white', '#ece6da'], ['Areia', '#ddcfb8'], ['Cinza claro', '#d3d3cf'],
  ['Cinza urbano', '#9fa19f'], ['Grafite', '#4b4e52'], ['Verde sálvia', '#a9b59c'], ['Verde musgo', '#5f6b4c'],
  ['Azul névoa', '#b9c7d0'], ['Azul petróleo', '#2f5560'], ['Terracota', '#c06d4e'], ['Rosa queimado', '#c99a8f'],
  ['Amarelo mostarda', '#d3a23f'], ['Preto', '#26272a'],
];

export const ITEM_COLORS = ['#e8e4dc', '#b9b4aa', '#6d6a66', '#2f3033', '#c9a77c', '#8a5b3a', '#5f6b4c', '#2f5560', '#b85c48', '#d3a23f'];

export const ITEMS = [
  // Sala de estar
  { group: 'Sala', kind: 'sofa', name: 'Sofá 2 lugares', w: 1.6, d: 0.9, h: 0.85, color: '#8f8a83' },
  { group: 'Sala', kind: 'sofa', name: 'Sofá 3 lugares', w: 2.1, d: 0.9, h: 0.85, color: '#8f8a83' },
  { group: 'Sala', kind: 'sofa', name: 'Sofá retrátil 2,30 m', w: 2.3, d: 1.0, h: 0.95, color: '#6d6a66' },
  { group: 'Sala', kind: 'sofa_l', name: 'Sofá com chaise (L)', w: 2.4, d: 1.6, h: 0.85, color: '#b9b4aa' },
  { group: 'Sala', kind: 'armchair', name: 'Poltrona', w: 0.8, d: 0.8, h: 0.85, color: '#b85c48' },
  { group: 'Sala', kind: 'stool', name: 'Puff', w: 0.5, d: 0.5, h: 0.42, color: '#d3a23f' },
  { group: 'Sala', kind: 'table', name: 'Mesa de centro', w: 1.0, d: 0.6, h: 0.4, color: '#8a5b3a' },
  { group: 'Sala', kind: 'table_round', name: 'Mesa lateral', w: 0.45, d: 0.45, h: 0.55, color: '#2f3033' },
  { group: 'Sala', kind: 'cabinet', name: 'Rack 1,80 m', w: 1.8, d: 0.45, h: 0.5, color: '#c9a77c' },
  { group: 'Sala', kind: 'panel', name: 'Painel de TV ripado', w: 2.0, d: 0.04, h: 2.4, color: '#8a5b3a' },
  { group: 'Sala', kind: 'tv', name: 'TV 50"', w: 1.12, d: 0.06, h: 0.65, elev: 1.0, color: '#1c1c1e' },
  { group: 'Sala', kind: 'tv', name: 'TV 55"', w: 1.24, d: 0.06, h: 0.72, elev: 1.0, color: '#1c1c1e' },
  { group: 'Sala', kind: 'tv', name: 'TV 65"', w: 1.45, d: 0.06, h: 0.84, elev: 0.95, color: '#1c1c1e' },
  { group: 'Sala', kind: 'shelf', name: 'Estante 1,0 m', w: 1.0, d: 0.35, h: 1.8, color: '#c9a77c' },
  { group: 'Sala', kind: 'cabinet', name: 'Aparador / buffet', w: 1.4, d: 0.4, h: 0.8, color: '#8a5b3a' },
  { group: 'Sala', kind: 'rug', name: 'Tapete 1,60 × 2,30', w: 2.3, d: 1.6, h: 0.01, color: '#d8cfc0' },
  { group: 'Sala', kind: 'rug', name: 'Tapete 2,00 × 3,00', w: 3.0, d: 2.0, h: 0.01, color: '#d8cfc0' },
  { group: 'Sala', kind: 'lamp', name: 'Luminária de piso', w: 0.35, d: 0.35, h: 1.6, color: '#2f3033' },
  // Jantar
  { group: 'Jantar', kind: 'table', name: 'Mesa de jantar 4 lugares', w: 1.2, d: 0.8, h: 0.75, color: '#8a5b3a' },
  { group: 'Jantar', kind: 'table', name: 'Mesa de jantar 6 lugares', w: 1.8, d: 0.9, h: 0.75, color: '#8a5b3a' },
  { group: 'Jantar', kind: 'table_round', name: 'Mesa redonda Ø 0,90', w: 0.9, d: 0.9, h: 0.75, color: '#e8e4dc' },
  { group: 'Jantar', kind: 'chair', name: 'Cadeira', w: 0.45, d: 0.5, h: 0.9, color: '#2f3033' },
  { group: 'Jantar', kind: 'stool', name: 'Banqueta alta', w: 0.4, d: 0.4, h: 0.75, color: '#2f3033' },
  // Quarto
  { group: 'Quarto', kind: 'bed', name: 'Cama solteiro', w: 0.88, d: 1.88, h: 0.5, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'bed', name: 'Cama casal', w: 1.38, d: 1.88, h: 0.55, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'bed', name: 'Cama queen', w: 1.58, d: 1.98, h: 0.55, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'bed', name: 'Cama king', w: 1.93, d: 2.03, h: 0.55, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'bunk', name: 'Beliche', w: 0.95, d: 1.95, h: 1.6, color: '#c9a77c' },
  { group: 'Quarto', kind: 'cabinet', name: 'Criado-mudo', w: 0.5, d: 0.4, h: 0.55, color: '#c9a77c' },
  { group: 'Quarto', kind: 'cabinet', name: 'Cômoda', w: 1.2, d: 0.45, h: 0.85, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'wardrobe', name: 'Guarda-roupa 1,50 m', w: 1.5, d: 0.6, h: 2.3, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'wardrobe', name: 'Guarda-roupa 2,00 m', w: 2.0, d: 0.6, h: 2.4, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'wardrobe', name: 'Armário planejado 2,60 m', w: 2.6, d: 0.6, h: 2.6, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'cabinet', name: 'Sapateira', w: 0.8, d: 0.35, h: 1.1, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'table', name: 'Escrivaninha', w: 1.2, d: 0.6, h: 0.75, color: '#c9a77c' },
  { group: 'Quarto', kind: 'chair', name: 'Cadeira de escritório', w: 0.6, d: 0.6, h: 1.0, color: '#2f3033' },
  { group: 'Quarto', kind: 'table', name: 'Penteadeira', w: 1.0, d: 0.45, h: 0.78, color: '#e8e4dc' },
  { group: 'Quarto', kind: 'panel', name: 'Espelho de parede', w: 0.6, d: 0.02, h: 1.6, elev: 0.2, color: '#c9d6dc' },
  // Cozinha
  { group: 'Cozinha', kind: 'counter', name: 'Bancada c/ armário 1 m', w: 1.0, d: 0.6, h: 0.9, color: '#e8e4dc' },
  { group: 'Cozinha', kind: 'counter', name: 'Bancada c/ armário 2 m', w: 2.0, d: 0.6, h: 0.9, color: '#e8e4dc' },
  { group: 'Cozinha', kind: 'cabinet', name: 'Armário aéreo 1 m', w: 1.0, d: 0.35, h: 0.7, elev: 1.5, color: '#e8e4dc' },
  { group: 'Cozinha', kind: 'wardrobe', name: 'Torre quente (forno + micro)', w: 0.6, d: 0.6, h: 2.2, color: '#e8e4dc' },
  { group: 'Cozinha', kind: 'counter', name: 'Ilha 1,6 m', w: 1.6, d: 0.9, h: 0.9, color: '#2f3033' },
  { group: 'Cozinha', kind: 'fridge', name: 'Geladeira', w: 0.7, d: 0.72, h: 1.85, color: '#c9cccf' },
  { group: 'Cozinha', kind: 'fridge', name: 'Geladeira inverse/duplex 0,80', w: 0.8, d: 0.75, h: 1.9, color: '#c9cccf' },
  { group: 'Cozinha', kind: 'appliance', name: 'Fogão 4 bocas', w: 0.6, d: 0.6, h: 0.9, color: '#3a3b3d' },
  { group: 'Cozinha', kind: 'appliance', name: 'Lava-louça', w: 0.6, d: 0.6, h: 0.85, color: '#c9cccf' },
  { group: 'Cozinha', kind: 'box', name: 'Micro-ondas', w: 0.5, d: 0.4, h: 0.3, elev: 0.9, color: '#2f3033' },
  // Banheiro
  { group: 'Banheiro', kind: 'toilet', name: 'Vaso sanitário', w: 0.38, d: 0.65, h: 0.4, color: '#f7f7f7' },
  { group: 'Banheiro', kind: 'counter', name: 'Gabinete c/ pia 0,6 m', w: 0.6, d: 0.45, h: 0.85, color: '#c9a77c' },
  { group: 'Banheiro', kind: 'counter', name: 'Gabinete c/ pia 0,8 m', w: 0.8, d: 0.48, h: 0.85, color: '#c9a77c' },
  { group: 'Banheiro', kind: 'shower', name: 'Box 0,9×0,9', w: 0.9, d: 0.9, h: 1.9, color: '#bfe0e8' },
  { group: 'Banheiro', kind: 'shower', name: 'Box 1,2×0,9', w: 1.2, d: 0.9, h: 1.9, color: '#bfe0e8' },
  { group: 'Banheiro', kind: 'bathtub', name: 'Banheira', w: 1.6, d: 0.75, h: 0.55, color: '#f7f7f7' },
  { group: 'Banheiro', kind: 'panel', name: 'Espelho do banheiro', w: 0.6, d: 0.02, h: 0.8, elev: 1.1, color: '#c9d6dc' },
  // Terraço / área técnica
  { group: 'Terraço e área técnica', kind: 'appliance', name: 'Máquina de lavar', w: 0.6, d: 0.65, h: 0.85, color: '#f2f2f2' },
  { group: 'Terraço e área técnica', kind: 'appliance', name: 'Lava e seca', w: 0.6, d: 0.65, h: 0.85, color: '#c9cccf' },
  { group: 'Terraço e área técnica', kind: 'counter', name: 'Tanque', w: 0.55, d: 0.5, h: 0.85, color: '#f2f2f2' },
  { group: 'Terraço e área técnica', kind: 'box', name: 'Condensadora do ar', w: 0.8, d: 0.3, h: 0.55, color: '#e8e8e6' },
  { group: 'Terraço e área técnica', kind: 'table_round', name: 'Mesa bistrô', w: 0.6, d: 0.6, h: 0.75, color: '#2f3033' },
  { group: 'Terraço e área técnica', kind: 'chair', name: 'Cadeira de área externa', w: 0.5, d: 0.55, h: 0.85, color: '#5f6b4c' },
  { group: 'Terraço e área técnica', kind: 'counter', name: 'Churrasqueira elétrica / bancada', w: 1.2, d: 0.55, h: 0.9, color: '#3a3b3d' },
  // Mezanino
  { group: 'Mezanino / andar de cima', kind: 'mezzanine', name: 'Mezanino (laje + guarda-corpo)', w: 3.0, d: 2.5, h: 2.6, color: '#7a4fd0' },
  { group: 'Mezanino / andar de cima', kind: 'stairs', name: 'Escada reta', w: 0.8, d: 2.6, h: 2.6, color: '#8a5b3a' },
  { group: 'Mezanino / andar de cima', kind: 'stairs', name: 'Escada compacta (degraus alternados)', w: 0.6, d: 1.5, h: 2.6, color: '#2f3033' },
  { group: 'Mezanino / andar de cima', kind: 'bed', name: 'Colchão no piso (mezanino)', w: 1.58, d: 1.98, h: 0.3, color: '#e8e4dc' },
  // Decoração e outros
  { group: 'Decoração e outros', kind: 'plant', name: 'Planta (vaso)', w: 0.45, d: 0.45, h: 1.2, color: '#5f6b4c' },
  { group: 'Decoração e outros', kind: 'panel', name: 'Quadro', w: 0.9, d: 0.03, h: 0.6, elev: 1.3, color: '#b85c48' },
  { group: 'Decoração e outros', kind: 'curtain', name: 'Cortina 2,00 m', w: 2.0, d: 0.08, h: 2.6, color: '#ece6da' },
  { group: 'Decoração e outros', kind: 'box', name: 'Caixa genérica (medida livre)', w: 1.0, d: 0.5, h: 1.0, color: '#b9b4aa' },
  { group: 'Decoração e outros', kind: 'column', name: 'Pilar 30×30', w: 0.3, d: 0.3, h: 2.7, color: '#d3d3cf' },
];

// ---------- geração de texturas ----------
const cache = new Map();
export function textureCanvas(kind, key) {
  const id = kind + ':' + key;
  if (cache.has(id)) return cache.get(id);
  const def = (kind === 'floor' ? FLOORS : WALL_TILES)[key];
  if (!def) return null;
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  def.draw(g, s);
  cache.set(id, c);
  return c;
}

function rng(seed) {
  let x = seed || 123456789;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function noise(g, s, amount, count, r) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(r() * amount * 2 - amount);
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    const sz = 1 + r() * 3;
    g.fillRect(r() * s, r() * s, sz, sz);
  }
}

function concrete(g, s, base, amt, smooth) {
  const r = rng(7);
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    const x = r() * s, y = r() * s, rad = 30 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = (smooth ? 0.05 : 0.08) * r();
    gr.addColorStop(0, r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
  noise(g, s, amt, smooth ? 3000 : 9000, r);
}

function tiles(g, s, nx, ny, base, grout, vary, glossy) {
  const r = rng(11);
  const tw = s / nx, th = s / ny, gw = 3;
  g.fillStyle = grout; g.fillRect(0, 0, s, s);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    g.fillStyle = shade(base, Math.round((r() - 0.5) * vary));
    g.fillRect(i * tw + gw / 2, j * th + gw / 2, tw - gw, th - gw);
    if (glossy) {
      const gr = g.createLinearGradient(i * tw, j * th, i * tw + tw, j * th + th);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(i * tw + gw / 2, j * th + gw / 2, tw - gw, th - gw);
    }
  }
  noise(g, s, 6, 3000, r);
}

function planks(g, s, colors) {
  const r = rng(5);
  const rows = 8, ph = s / rows;
  for (let j = 0; j < rows; j++) {
    let x = -r() * s * 0.6;
    while (x < s) {
      const len = s * (0.45 + r() * 0.5);
      const c = colors[Math.floor(r() * colors.length)];
      g.fillStyle = c; g.fillRect(x, j * ph, len, ph);
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        const yy = j * ph + r() * ph;
        g.beginPath(); g.moveTo(x, yy);
        g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 6, x + len * 0.6, yy + (r() - 0.5) * 6, x + len, yy + (r() - 0.5) * 4);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, j * ph, 2, ph);
      x += len;
    }
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, j * ph, s, 2);
  }
  // emenda contínua na borda direita/esquerda
  g.drawImage(g.canvas, 0, 0, 4, s, s - 4, 0, 4, s);
}

function marble(g, s) {
  const r = rng(3);
  g.fillStyle = '#efede9'; g.fillRect(0, 0, s, s);
  for (let k = 0; k < 14; k++) {
    g.strokeStyle = `rgba(110,110,115,${0.08 + r() * 0.18})`;
    g.lineWidth = 0.5 + r() * 2;
    let x = r() * s, y = 0;
    g.beginPath(); g.moveTo(x, y);
    while (y < s) { x += (r() - 0.5) * 40; y += 10 + r() * 25; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = '#d8d5cf'; g.lineWidth = 2;
  g.strokeRect(1, 1, s / 2 - 2, s - 2); g.strokeRect(s / 2 + 1, 1, s / 2 - 2, s - 2);
}

function hexes(g, s, base, grout) {
  g.fillStyle = grout; g.fillRect(0, 0, s, s);
  const n = 4, R = s / (n * Math.sqrt(3));
  const h = Math.sqrt(3) * R;
  const r = rng(9);
  for (let i = -1; i <= n * 2; i++) for (let j = -1; j <= n + 1; j++) {
    const cx = i * 1.5 * R, cy = j * h + (i % 2 ? h / 2 : 0);
    g.fillStyle = shade(base, Math.round((r() - 0.5) * 10));
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const px = cx + (R - 2) * Math.cos(a), py = cy + (R - 2) * Math.sin(a);
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.fill();
  }
}

function hydraulic(g, s) {
  const n = 3, t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * t, y = j * t;
    g.fillStyle = '#e9e2d4'; g.fillRect(x, y, t, t);
    g.fillStyle = '#3f6470';
    g.beginPath(); g.moveTo(x + t / 2, y + 8); g.lineTo(x + t - 8, y + t / 2); g.lineTo(x + t / 2, y + t - 8); g.lineTo(x + 8, y + t / 2); g.fill();
    g.fillStyle = '#c0704f';
    g.beginPath(); g.arc(x + t / 2, y + t / 2, t * 0.18, 0, Math.PI * 2); g.fill();
    for (const [cx, cy] of [[x, y], [x + t, y], [x, y + t], [x + t, y + t]]) {
      g.beginPath(); g.arc(cx, cy, t * 0.16, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#b9b0a0'; g.lineWidth = 2; g.strokeRect(x, y, t, t);
  }
}

function brick(g, s, cols, rows, base, grout, rough) {
  const r = rng(13);
  g.fillStyle = grout; g.fillRect(0, 0, s, s);
  const bw = s / cols, bh = s / rows, gw = rough ? 5 : 3;
  for (let j = 0; j < rows; j++) {
    const off = j % 2 ? bw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      g.fillStyle = shade(base, Math.round((r() - 0.5) * (rough ? 40 : 8)));
      g.fillRect(i * bw + off + gw / 2, j * bh + gw / 2, bw - gw, bh - gw);
    }
  }
  if (rough) noise(g, s, 20, 6000, r);
}

function slats(g, s) {
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) {
    const gr = g.createLinearGradient(i * w, 0, i * w + w, 0);
    gr.addColorStop(0, '#7d5435'); gr.addColorStop(0.15, '#a3734b'); gr.addColorStop(0.85, '#9b6c45'); gr.addColorStop(1, '#6e4a2e');
    g.fillStyle = gr; g.fillRect(i * w, 0, w, s);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < n; i++) g.fillRect(i * w, 0, 3, s);
}
