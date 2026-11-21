// Mapeamento de cômodo por foto.
// Uma folha (A4 ou outro retângulo de medida conhecida) no chão serve de régua: com os 4 cantos
// dela marcados na foto calculamos a homografia imagem → chão e convertemos os cantos do cômodo
// em metros. Se a folha não sair do lugar, várias fotos compartilham o mesmo sistema de coordenadas.
import { fmtLen } from './plan2d.js';

export const REFS = {
  a4: { name: 'Folha A4 (21 × 29,7 cm)', w: 0.297, h: 0.21 },
  carta: { name: 'Folha Carta (21,6 × 27,9 cm)', w: 0.279, h: 0.216 },
  a3: { name: 'Folha A3 (29,7 × 42 cm)', w: 0.42, h: 0.297 },
  custom: { name: 'Outro retângulo (piso, tapete, caixa…)', w: 0.6, h: 0.6 },
};

// ---------- matemática ----------
export function solveHomography(src, dst) {
  // src: 4 pontos da imagem, dst: 4 pontos no chão. Retorna H (8 coef., h33 = 1).
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], X = dst[i].x, Y = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

export function applyH(h, p) {
  const d = h[6] * p.x + h[7] * p.y + 1;
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
}

const signedArea = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

// Esquadrejar: alinha a parede mais longa ao eixo X e endireita paredes quase retas.
export function squareUp(pts, tolDeg = 14) {
  const n = pts.length;
  if (n < 3) return pts;
  let li = 0, ll = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L > ll) { ll = L; li = i; }
  }
  const a0 = pts[li], b0 = pts[(li + 1) % n];
  const th = -Math.atan2(b0.y - a0.y, b0.x - a0.x);
  const c = Math.cos(th), s = Math.sin(th);
  const r = pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const kind = [];
  for (let i = 0; i < n; i++) {
    const a = r[i], b = r[(i + 1) % n];
    let ang = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180;
    kind.push(ang < tolDeg || ang > 180 - tolDeg ? 'H' : Math.abs(ang - 90) < tolDeg ? 'V' : 'D');
  }
  const out = r.map((p) => ({ ...p }));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (kind[i] === 'H') { const y = (r[i].y + r[j].y) / 2; out[i].y = y; out[j].y = y; }
    if (kind[i] === 'V') { const x = (r[i].x + r[j].x) / 2; out[i].x = x; out[j].x = x; }
  }
  return out;
}

// ---------- interface ----------
export class PhotoMapper {
  constructor(app) {
    this.app = app;
  }

  open() {
    this.ref = { ...REFS.a4, key: 'a4' };
    this.photos = [];
    this.cur = -1;
    this.corners = []; // { photo, x, y } na ordem em que foram marcados
    this.step = 'intro';
    this.square = true;
    this.useTops = true; // marcar o alto de cada quina melhora muito a precisão
    this.scaleFix = 1;
    this.view = { s: 1, ox: 0, oy: 0 };
    this.build();
    this.renderStep();
  }

  close() {
    this.el?.remove();
    this.el = null;
    this.ro?.disconnect();
  }

  build() {
    const el = document.createElement('div');
    el.className = 'pm';
    el.innerHTML = `
      <header class="pm-top">
        <button class="btn small" id="pmClose">Fechar</button>
        <div class="pm-title" id="pmTitle"></div>
        <button class="btn small primary" id="pmNext">Próximo</button>
      </header>
      <div class="pm-stage" id="pmStage">
        <canvas id="pmCanvas"></canvas>
        <div class="pm-intro" id="pmIntro"></div>
      </div>
      <div class="pm-bottom" id="pmBottom"></div>
      <input type="file" id="pmCam" accept="image/*" capture="environment" hidden>
      <input type="file" id="pmGal" accept="image/*" hidden>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#pmCanvas');
    this.ctx = this.canvas.getContext('2d');
    el.querySelector('#pmClose').onclick = () => this.close();
    el.querySelector('#pmNext').onclick = () => this.next();
    for (const id of ['#pmCam', '#pmGal']) el.querySelector(id).onchange = (e) => this.loadPhoto(e.target.files[0], e.target);
    this.bindCanvas();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el.querySelector('#pmStage'));
  }

  $(s) { return this.el.querySelector(s); }

  // ---------- passos ----------
  renderStep() {
    const intro = this.$('#pmIntro'), bottom = this.$('#pmBottom'), next = this.$('#pmNext');
    intro.classList.toggle('hidden', this.step !== 'intro' && this.step !== 'preview');
    this.canvas.classList.toggle('hidden', this.step === 'intro' || this.step === 'preview');
    next.classList.remove('hidden');

    if (this.step === 'intro') {
      this.$('#pmTitle').textContent = 'Mapear por foto';
      next.classList.add('hidden');
      intro.innerHTML = `
        <div class="pm-card">
          <h2>Como funciona</h2>
          <ol class="pm-steps">
            <li>Coloque uma <b>folha A4 no chão</b>, a uns 2 metros de onde você vai fotografar. Faça um <b>X num dos cantos</b> da folha com caneta. Não mexa nela até terminar.</li>
            <li>Vá para um canto ou para a porta e tire uma foto com a câmera <b>1×</b> (não use 0,5×), segurando o celular na altura do peito e mostrando o chão. A folha e o máximo de cantos do cômodo devem aparecer.</li>
            <li>Na foto, arraste os 4 marcadores para os cantos da folha (o <b>1</b> vai no canto com X).</li>
            <li>Toque nos cantos do cômodo, <b>onde a parede encontra o chão</b>, em sequência, dando a volta no cômodo. Depois de cada canto, toque <b>mais acima na mesma quina</b> (a linha vertical onde as paredes se encontram): isso deixa as medidas bem mais precisas.</li>
            <li>Se algum canto não aparecer, tire outra foto de outro ponto, com a folha no mesmo lugar, e continue a sequência.</li>
          </ol>
          <h3>Referência no chão</h3>
          <div class="segctl pm-refs">
            ${Object.entries(REFS).map(([k, r]) => `<button data-ref="${k}" class="${this.ref.key === k ? 'on' : ''}">${r.name.split(' (')[0]}</button>`).join('')}
          </div>
          <div class="grid2 ${this.ref.key === 'custom' ? '' : 'hidden'}" id="pmCustom">
            <label class="field"><span>Lado maior (cm)</span><input type="number" inputmode="decimal" id="pmRw" value="${Math.round(this.ref.w * 1000) / 10}"></label>
            <label class="field"><span>Lado menor (cm)</span><input type="number" inputmode="decimal" id="pmRh" value="${Math.round(this.ref.h * 1000) / 10}"></label>
          </div>
          <p class="muted">Dica: quanto maior a referência, melhor a precisão. Um piso cerâmico de 60×60 ou duas folhas A4 lado a lado funcionam ainda melhor. No final, se você souber a medida de uma parede (trena ou app Medida), o app corrige a escala.</p>
          <div class="btn-row">
            <button class="btn dark" id="pmTake">Tirar foto</button>
            <button class="btn" id="pmPick">Escolher da galeria</button>
          </div>
        </div>`;
      intro.querySelectorAll('[data-ref]').forEach((b) => (b.onclick = () => {
        const k = b.dataset.ref;
        this.ref = { ...REFS[k], key: k };
        this.renderStep();
      }));
      const upd = () => {
        const w = parseFloat(this.$('#pmRw')?.value) / 100, h = parseFloat(this.$('#pmRh')?.value) / 100;
        if (w > 0 && h > 0) { this.ref.w = Math.max(w, h); this.ref.h = Math.min(w, h); }
      };
      this.$('#pmRw') && (this.$('#pmRw').onchange = upd, this.$('#pmRh').onchange = upd);
      this.$('#pmTake').onclick = () => { upd(); this.$('#pmCam').click(); };
      this.$('#pmPick').onclick = () => { upd(); this.$('#pmGal').click(); };
      bottom.innerHTML = '';
      return;
    }

    if (this.step === 'ref') {
      this.$('#pmTitle').textContent = `Foto ${this.cur + 1}: cantos da folha`;
      next.textContent = 'Próximo';
      bottom.innerHTML = `
        <p class="pm-msg">Arraste <b>1 2 3 4</b> para os cantos da referência, começando pelo canto com <b>X</b> e seguindo <b>no sentido horário</b>. Use dois dedos para aproximar.</p>
        <div class="btn-row"><button class="btn small" id="pmZoomRef">Zoom na folha</button><button class="btn small" id="pmZoomAll">Ver foto inteira</button></div>`;
      this.$('#pmZoomRef').onclick = () => this.zoomTo(this.photos[this.cur].ref, 0.55);
      this.$('#pmZoomAll').onclick = () => this.fitView();
    }

    if (this.step === 'corners') {
      this.$('#pmTitle').textContent = `Foto ${this.cur + 1}: cantos do cômodo`;
      next.textContent = 'Ver planta';
      next.disabled = this.corners.length < 3;
      const last = this.corners[this.corners.length - 1];
      const waitingTop = this.useTops && last && last.photo === this.cur && !last.top && !last.skipTop;
      bottom.innerHTML = `
        <p class="pm-msg">${waitingTop
          ? `Agora toque <b>bem mais acima na mesma quina</b>, perto do teto, do canto ${this.corners.length} (a linha onde as duas paredes se encontram), ou pule.`
          : `Toque no próximo <b>canto do chão</b>, dando a volta no cômodo. <b>${this.corners.length}</b> canto(s). Arraste um ponto para ajustar.`}</p>
        <div class="btn-row">
          ${waitingTop ? '<button class="btn small" id="pmSkip">Pular</button>' : ''}
          <button class="btn small" id="pmUndo" ${this.corners.length ? '' : 'disabled'}>Desfazer</button>
          <button class="btn small" id="pmMore">+ Outra foto</button>
          <button class="btn small" id="pmFixRef">Ajustar folha</button>
        </div>`;
      this.$('#pmUndo').onclick = () => {
        const c = this.corners[this.corners.length - 1];
        if (c?.top) delete c.top; else if (c?.skipTop) delete c.skipTop; else this.corners.pop();
        if (c) this.refit(c.photo);
        this.renderStep(); this.draw();
      };
      if (this.$('#pmSkip')) this.$('#pmSkip').onclick = () => { last.skipTop = true; this.renderStep(); };
      this.$('#pmMore').onclick = () => this.$('#pmCam').click();
      this.$('#pmFixRef').onclick = () => { this.step = 'ref'; this.renderStep(); this.draw(); };
    } else next.disabled = false;

    if (this.step === 'preview') this.renderPreview();
    this.draw();
  }

  next() {
    if (this.step === 'ref') {
      const ph = this.photos[this.cur];
      // garante sentido horário mantendo o canto 1
      if (signedArea(ph.ref) < 0) ph.ref = [ph.ref[0], ph.ref[3], ph.ref[2], ph.ref[1]];
      this.refit(this.cur);
      if (!ph.fit) { this.app.toast('Não consegui entender a perspectiva. Confira se os 4 marcadores estão nos cantos da folha.'); return; }
      this.step = 'corners';
      this.renderStep();
      return;
    }
    if (this.step === 'corners') { this.step = 'preview'; this.renderStep(); return; }
    if (this.step === 'preview') this.finish();
  }

  // ---------- foto ----------
  async loadPhoto(file, input) {
    input.value = '';
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      // reduz para no máx. 2400 px (memória do celular)
      const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const prev = this.photos[this.cur];
      const w = c.width, h = c.height;
      const ref = prev ? prev.ref.map((p) => ({ x: p.x / prev.img.width * w, y: p.y / prev.img.height * h })) : [
        { x: w * 0.4, y: h * 0.6 }, { x: w * 0.6, y: h * 0.6 }, { x: w * 0.62, y: h * 0.72 }, { x: w * 0.38, y: h * 0.72 },
      ];
      this.photos.push({ img: c, ref, fit: null });
      this.cur = this.photos.length - 1;
      this.step = 'ref';
      this.renderStep();
      this.fitView();
    } catch (e) {
      this.app.toast('Não foi possível abrir a foto');
    }
  }

  // ---------- canvas da foto ----------
  resize() {
    const r = this.$('#pmStage').getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.fitView();
  }

  fitView() {
    const ph = this.photos[this.cur];
    if (!ph || !this.w) return;
    const s = Math.min(this.w / ph.img.width, this.h / ph.img.height);
    this.view = { s, ox: (this.w - ph.img.width * s) / 2, oy: (this.h - ph.img.height * s) / 2 };
    this.draw();
  }

  zoomTo(pts, frac) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const bw = Math.max(60, Math.max(...xs) - Math.min(...xs)), bh = Math.max(60, Math.max(...ys) - Math.min(...ys));
    const s = Math.min(12, (Math.min(this.w, this.h) * frac) / Math.max(bw, bh));
    const cxm = (Math.max(...xs) + Math.min(...xs)) / 2, cym = (Math.max(...ys) + Math.min(...ys)) / 2;
    this.view = { s, ox: this.w / 2 - cxm * s, oy: this.h / 2 - cym * s };
    this.draw();
  }

  toImg(sx, sy) { return { x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s }; }
  toScr(p) { return { x: p.x * this.view.s + this.view.ox, y: p.y * this.view.s + this.view.oy }; }

  handles() {
    const ph = this.photos[this.cur];
    if (!ph) return [];
    if (this.step === 'ref') return ph.ref.map((p, i) => ({ p, i, kind: 'ref' }));
    if (this.step === 'corners') {
      const out = [];
      this.corners.forEach((c, i) => {
        if (c.photo !== this.cur) return;
        out.push({ c, i, kind: 'corner', p: c });
        if (c.top) out.push({ c, i, kind: 'top', p: c.top });
      });
      return out;
    }
    return [];
  }

  bindCanvas() {
    const c = this.canvas;
    const ptrs = new Map();
    let drag = null, pinch = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, pos(e));
      if (ptrs.size === 2) {
        drag = null; this.loupe = null;
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      const p = pos(e);
      let best = null, bd = 28;
      for (const h of this.handles()) {
        const s = this.toScr(h.p);
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < bd) { bd = d; best = h; }
      }
      drag = best ? { h: best, start: p, orig: { ...best.p }, moved: false } : { pan: true, start: p, ox: this.view.ox, oy: this.view.oy, moved: false };
      if (best) { this.loupe = best.p; this.draw(); }
    });
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = pos(e);
      ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const f = d / (pinch.d || d);
        const ns = Math.max(0.05, Math.min(12, this.view.s * f));
        const k = ns / this.view.s;
        this.view.ox = cx - (pinch.cx - this.view.ox) * k;
        this.view.oy = cy - (pinch.cy - this.view.oy) * k;
        this.view.s = ns;
        pinch = { d, cx, cy };
        this.draw();
        return;
      }
      if (!drag) return;
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 5) drag.moved = true;
      if (drag.h) {
        // movimento relativo: o dedo não cobre o ponto
        const nx = drag.orig.x + (p.x - drag.start.x) / this.view.s;
        const ny = drag.orig.y + (p.y - drag.start.y) / this.view.s;
        drag.h.p.x = nx; drag.h.p.y = ny;
        this.loupe = drag.h.p;
        this.draw();
      } else if (drag.moved) {
        this.view.ox = drag.ox + p.x - drag.start.x; this.view.oy = drag.oy + p.y - drag.start.y;
        this.draw();
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; return; }
      const d = drag; drag = null; this.loupe = null;
      if (d?.h && d.moved && this.step === 'corners') this.refit(this.cur);
      // toque rápido perto (mas não em cima) de um marcador conta como toque normal
      const tapNearHandle = d && d.h && !d.moved && Math.hypot(d.start.x - this.toScr(d.orig).x, d.start.y - this.toScr(d.orig).y) > 12;
      if (d && !d.moved && (d.pan || tapNearHandle) && this.step === 'corners') {
        const ip = this.toImg(d.start.x, d.start.y);
        const ph = this.photos[this.cur];
        if (ip.x >= 0 && ip.y >= 0 && ip.x <= ph.img.width && ip.y <= ph.img.height) {
          const last = this.corners[this.corners.length - 1];
          if (this.useTops && last && last.photo === this.cur && !last.top && !last.skipTop) last.top = { x: ip.x, y: ip.y };
          else this.corners.push({ photo: this.cur, x: ip.x, y: ip.y });
          this.refit(this.cur);
          this.renderStep();
        }
      }
      this.draw();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  draw() {
    if (!this.ctx || !this.w) return;
    const g = this.ctx, ph = this.photos[this.cur];
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#16171a'; g.fillRect(0, 0, this.w, this.h);
    if (!ph || this.step === 'preview' || this.step === 'intro') return;
    g.save();
    g.translate(this.view.ox, this.view.oy); g.scale(this.view.s, this.view.s);
    g.drawImage(ph.img, 0, 0);
    g.restore();

    // referência
    const R = ph.ref.map((p) => this.toScr(p));
    g.beginPath(); R.forEach((s, i) => (i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y))); g.closePath();
    g.fillStyle = 'rgba(232,134,42,.18)'; g.fill();
    g.strokeStyle = '#e8862a'; g.lineWidth = 2; g.stroke();

    // grade de 1 m projetada no chão (ajuda a ver se a perspectiva faz sentido)
    if (this.step === 'corners' && ph.fit) this.drawFloorGrid(g, ph);

    // polígono do cômodo nesta foto
    const mine = this.corners.map((c, i) => ({ ...c, i })).filter((c) => c.photo === this.cur);
    if (mine.length > 1) {
      g.strokeStyle = '#2f6fed'; g.lineWidth = 2.5; g.beginPath();
      for (let k = 0; k < mine.length - 1; k++) {
        if (mine[k + 1].i !== mine[k].i + 1) continue;
        const a = this.toScr(mine[k]), b = this.toScr(mine[k + 1]);
        g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        const fa = ph.fit?.toFloor(mine[k]), fb = ph.fit?.toFloor(mine[k + 1]);
        if (!fa || !fb) continue;
        const L = Math.hypot(fb.x - fa.x, fb.y - fa.y);
        g.save(); g.font = '600 13px -apple-system, system-ui'; g.textAlign = 'center';
        const t = fmtLen(L * this.scaleFix), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 10;
        const tw = g.measureText(t).width + 10;
        g.fillStyle = 'rgba(47,111,237,.9)'; g.fillRect(mx - tw / 2, my - 11, tw, 18);
        g.fillStyle = '#fff'; g.fillText(t, mx, my + 3); g.restore();
      }
      g.stroke();
    }

    // quinas: linha do canto ao toque no alto
    for (const c of this.corners) {
      if (c.photo !== this.cur || !c.top) continue;
      const a = this.toScr(c), b = this.toScr(c.top);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokeStyle = 'rgba(47,111,237,.85)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]);
    }
    // marcadores
    const H = this.handles();
    for (const h of H) {
      if (h.kind === 'top') {
        const s = this.toScr(h.p);
        g.beginPath(); g.arc(s.x, s.y, 9, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.9)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#2f6fed'; g.stroke();
        continue;
      }
      const s = this.toScr(h.p);
      const label = h.kind === 'ref' ? String(h.i + 1) : String(h.i + 1);
      g.beginPath(); g.arc(s.x, s.y, 11, 0, Math.PI * 2);
      g.fillStyle = h.kind === 'ref' ? '#e8862a' : '#2f6fed'; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.moveTo(s.x - 4, s.y); g.lineTo(s.x + 4, s.y); g.moveTo(s.x, s.y - 4); g.lineTo(s.x, s.y + 4);
      g.fillStyle = '#fff'; g.font = '700 11px -apple-system, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, s.x, s.y - 22 < 8 ? s.y + 24 : s.y - 22);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    }

    // lupa
    if (this.loupe) {
      const r = 64, z = 3.5, cx = 16 + r, cy = 16 + r;
      g.save();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#000'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      const s = this.view.s * z;
      g.translate(cx - this.loupe.x * s, cy - this.loupe.y * s); g.scale(s, s);
      g.drawImage(ph.img, 0, 0);
      g.restore();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 12);
      g.strokeStyle = '#ff3b30'; g.lineWidth = 1.5; g.stroke();
    }
  }

  drawFloorGrid(g, ph) {
    // grade de 1 m no chão, desenhada a partir do modelo de câmera
    g.save(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
    for (let k = -6; k <= 6; k++) {
      for (const horiz of [true, false]) {
        g.beginPath();
        let first = true;
        for (let t = -6; t <= 6; t += 0.25) {
          const f = horiz ? { x: t, y: k } : { x: k, y: t };
          const ip = ph.fit.toImage(f);
          if (!ip) { first = true; continue; }
          const s = this.toScr(ip);
          if (first) g.moveTo(s.x, s.y); else g.lineTo(s.x, s.y);
          first = false;
        }
        g.stroke();
      }
    }
    g.restore();
  }

  // ---------- resultado ----------
  floorPoints() {
    const raw = this.corners.map((c) => this.photos[c.photo].fit?.toFloor(c)).filter(Boolean);
    let pts = raw;
    if (this.square) pts = squareUp(raw);
    pts = pts.map((p) => ({ x: p.x * this.scaleFix, y: p.y * this.scaleFix }));
    // sentido horário na planta (y para baixo) e origem no canto superior esquerdo
    if (signedArea(pts) < 0) pts.reverse();
    const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
    return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  }

  renderPreview() {
    this.$('#pmTitle').textContent = 'Planta do cômodo';
    this.$('#pmNext').textContent = 'Adicionar';
    const pts = this.floorPoints();
    const W = Math.max(...pts.map((p) => p.x)), Hh = Math.max(...pts.map((p) => p.y));
    const pad = 0.6, vw = W + pad * 2, vh = Hh + pad * 2;
    const area = Math.abs(signedArea(pts));
    const edges = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return { i, L: Math.hypot(q.x - p.x, q.y - p.y), m: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } }; });
    const fs = Math.max(vw, vh) / 24;
    this.$('#pmIntro').innerHTML = `
      <div class="pm-card">
        <svg class="pm-plan" viewBox="${-pad} ${-pad} ${vw} ${vh}" style="width:100%;height:auto">
          <polygon points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="#d8d2c6" stroke="#3a3c40" stroke-width="${0.15}" stroke-linejoin="miter"/>
          ${edges.map((e) => `<text x="${e.m.x}" y="${e.m.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="#1f2023" stroke="#fff" stroke-width="${fs / 5}" paint-order="stroke">${fmtLen(e.L)}</text>`).join('')}
        </svg>
        <p class="muted">${pts.length} paredes · ${area.toFixed(2).replace('.', ',')} m²</p>
        <label class="field"><span>Nome do cômodo</span><input type="text" class="wide" id="pmName" value="${this.name || `Cômodo ${this.app.plan.rooms.length + 1}`}"></label>
        <label class="field"><span>Esquadrejar (cantos a 90°)</span><input type="checkbox" id="pmSquare" ${this.square ? 'checked' : ''}></label>
        <h3>Corrigir com uma medida conhecida</h3>
        <div class="pm-fix">
          <select id="pmEdge">${edges.map((e) => `<option value="${e.i}">Parede ${e.i + 1}: ${fmtLen(e.L)}</option>`).join('')}</select>
          <input type="number" inputmode="decimal" id="pmReal" placeholder="medida real (cm)">
          <button class="btn small" id="pmApply">Aplicar</button>
        </div>
        <p class="muted">Paredes numeradas na ordem em que você tocou. A precisão costuma ficar entre 2% e 5%; com uma medida de trena fica bem melhor. Depois de adicionar, arraste o cômodo até encostar nos outros: as paredes se unem sozinhas.</p>
        <div class="btn-row"><button class="btn" id="pmBack">Voltar às fotos</button></div>
      </div>`;
    this.$('#pmName').oninput = (e) => (this.name = e.target.value);
    this.$('#pmSquare').onchange = (e) => { this.square = e.target.checked; this.renderPreview(); };
    this.$('#pmApply').onclick = () => {
      const real = parseFloat(this.$('#pmReal').value) / 100;
      const e = edges[+this.$('#pmEdge').value];
      if (!(real > 0) || !e) return this.app.toast('Digite a medida em cm');
      this.scaleFix *= real / e.L;
      this.renderPreview();
      this.app.toast('Escala corrigida');
    };
    this.$('#pmBack').onclick = () => { this.step = 'corners'; this.renderStep(); };
    this.$('#pmBottom').innerHTML = '';
  }

  // Reestima a câmera da foto usando a folha e os cantos do cômodo marcados nela.
  refit(idx) {
    const ph = this.photos[idx];
    if (!ph) return;
    const n = this.corners.length, angles = [];
    for (let i = 0; i < n; i++) {
      const cyc = n >= 4;
      const a = this.corners[i - 1] || (cyc ? this.corners[n - 1] : null), b = this.corners[i], c = this.corners[i + 1] || (cyc ? this.corners[0] : null);
      if (a && c && a.photo === idx && b.photo === idx && c.photo === idx) angles.push([a, b, c]);
    }
    const verticals = this.corners.filter((c) => c.photo === idx && c.top).map((c) => [c, c.top]);
    ph.fit = fitCamera(ph.ref, angles, ph.img.width, ph.img.height, this.ref.w, this.ref.h, verticals);
  }

  finish() {
    const pts = this.floorPoints();
    if (pts.length < 3) return;
    this.app.addMappedRoom(pts, (this.name || '').trim());
    this.close();
  }
}

function invertH(h) {
  const m = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  const [a, b, c, d, e, f, g, hh, i] = m;
  const A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    A, -(b * i - c * hh), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * hh - b * g), a * e - b * d,
  ].map((v) => v / det);
  return inv.map((v) => v / inv[8]).slice(0, 8);
}

// ---------- modelo de câmera ----------
// Em vez de confiar só nos 4 cantos da folha (pequena na foto), estimamos inclinação, giro e
// distância focal da câmera usando: a folha é um retângulo com proporção conhecida, e os cantos
// do cômodo que parecem retos são de 90°. A folha então dá só a escala e a posição.
function rayToFloor(p, cam) {
  const { f, cx, cy, pitch, roll } = cam;
  let x = (p.x - cx) / f, y = -(p.y - cy) / f, z = 1;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // inclina para baixo: frente (z) ganha componente -y
  const yw = y * cp - z * sp, zw = y * sp + z * cp;
  if (yw >= -1e-6) return null; // acima do horizonte
  const t = -1 / yw; // altura da câmera = 1
  return { x: x * t, y: -zw * t }; // y da planta cresce para "trás" da câmera
}

function floorToImage(q, cam) {
  const { f, cx, cy, pitch, roll } = cam;
  const x = q.x, zw = -q.y, yw = -1;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y = yw * cp + zw * sp, z = -yw * sp + zw * cp;
  if (z <= 0.01) return null;
  const cr = Math.cos(-roll), sr = Math.sin(-roll);
  const xr = x * cr - y * sr, yr = x * sr + y * cr;
  return { x: cx + (f * xr) / z, y: cy - (f * yr) / z };
}

// ponto 3D (x, y da planta; h = altura em unidades da altura da câmera) → imagem
function pointToImage(q, cam) {
  const { f, cx, cy, pitch, roll } = cam;
  const x = q.x, zw = -q.y, yw = -1 + q.h;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y = yw * cp + zw * sp, z = -yw * sp + zw * cp;
  if (z <= 0.01) return null;
  const cr = Math.cos(-roll), sr = Math.sin(-roll);
  const xr = x * cr - y * sr, yr = x * sr + y * cr;
  return { x: cx + (f * xr) / z, y: cy - (f * yr) / z };
}

const angCos = (a, b, c) => {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) + 1e-12);
};

function nelderMead(fn, x0, steps, iters = 400) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += steps[i]; simplex.push(x); }
  let vals = simplex.map(fn);
  for (let it = 0; it < iters; it++) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = idx.map((i) => simplex[i]); vals = idx.map((i) => vals[i]);
    const c = Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) c[k] += simplex[i][k] / n;
    const w = simplex[n];
    const xr = c.map((v, k) => v + (v - w[k])), fr = fn(xr);
    if (fr < vals[0]) {
      const xe = c.map((v, k) => v + 2 * (v - w[k])), fe = fn(xe);
      if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
    else {
      const xc = c.map((v, k) => v + 0.5 * (w[k] - v)), fc = fn(xc);
      if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; }
      else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, k) => simplex[0][k] + 0.5 * (v - simplex[0][k])); vals[i] = fn(simplex[i]); }
      }
    }
    if (Math.abs(vals[n] - vals[0]) < 1e-12) break;
  }
  return { x: simplex[0], v: vals[0] };
}

// ref: 4 pontos da folha na imagem (sentido horário, 1º = canto com X)
// angles: lista de triplas [a, b, c] de pontos da imagem (canto b do cômodo e vizinhos)
// Retorna { toFloor(p) -> {x,y} em metros no sistema da folha, toImage(q) }
// verticals: lista de pares [base, topo] de quinas (base no chão, topo em qualquer altura da quina)
export function fitCamera(ref, angles, imgW, imgH, refW, refH, verticals = []) {
  const cx = imgW / 2, cy = imgH / 2;
  const f0 = 0.76 * Math.max(imgW, imgH); // câmera 1× do iPhone (~26 mm equivalentes)
  const make = ([pitch, roll, lf]) => ({ f: f0 * Math.exp(lf), cx, cy, pitch, roll });
  const minPx = Math.min(...ref.map((p, i) => Math.hypot(ref[(i + 1) % 4].x - p.x, ref[(i + 1) % 4].y - p.y)));
  const refConf = Math.min(1, (minPx / 80) ** 2) * (verticals.length >= 2 ? 1 : 4) + 0.05;
  const cost = (params) => {
    const cam = make(params);
    if (params[0] < 0.05 || params[0] > 1.5) return 1e9;
    const R = ref.map((p) => rayToFloor(p, cam));
    if (R.some((q) => !q)) return 1e9;
    let e = 0;
    // a forma da folha pesa menos quando ela aparece pequena/achatada na foto (toque impreciso)
    let re = 0;
    for (let i = 0; i < 4; i++) re += angCos(R[(i + 3) % 4], R[i], R[(i + 1) % 4]) ** 2;
    const side = (i) => Math.hypot(R[(i + 1) % 4].x - R[i].x, R[(i + 1) % 4].y - R[i].y);
    const asp = (side(0) + side(2)) / (side(1) + side(3));
    re += Math.log(asp / (refW / refH)) ** 2;
    e += re * refConf;
    for (const [a, b, c] of angles) {
      const A = rayToFloor(a, cam), B = rayToFloor(b, cam), C = rayToFloor(c, cam);
      if (!A || !B || !C) { e += 1; continue; }
      const k = angCos(A, B, C);
      if (Math.abs(k) < 0.42) e += 0.6 * k * k; // só cantos que já parecem retos (65°–115°)
    }
    for (const [bse, top] of verticals) {
      // a quina sobe na direção do ponto de fuga vertical; mede o desvio angular do toque
      const B = rayToFloor(bse, cam);
      if (!B) { e += 1; continue; }
      const p0 = floorToImage(B, cam), p1 = pointToImage({ x: B.x, y: B.y, h: 0.3 }, cam);
      if (!p0 || !p1) { e += 1; continue; }
      const dx = p1.x - p0.x, dy = p1.y - p0.y, L = Math.hypot(dx, dy) || 1;
      const tx = top.x - bse.x, ty = top.y - bse.y, Lt = Math.hypot(tx, ty) || 1;
      const sin = (dx * ty - dy * tx) / (L * Lt);
      e += 8 * sin * sin * Math.min(1, Lt / 150);
    }
    e += 0.02 * (params[2] / 0.12) ** 2; // distância focal perto da câmera 1×
    return e;
  };
  let best = null;
  for (const p0 of [0.35, 0.6, 0.9, 1.2]) {
    const r = nelderMead(cost, [p0, 0, 0], [0.15, 0.08, 0.08], 500);
    if (!best || r.v < best.v) best = r;
  }
  const r2 = nelderMead(cost, best.x, [0.03, 0.02, 0.02], 500);
  if (r2.v < best.v) best = r2;
  const cam = make(best.x);
  const R = ref.map((p) => rayToFloor(p, cam));
  if (R.some((q) => !q)) return null;
  // escala: lados ponderados pelo tamanho em pixels (lados vistos de frente são mais confiáveis
  // que os encurtados pela perspectiva)
  const side = (i) => Math.hypot(R[(i + 1) % 4].x - R[i].x, R[(i + 1) % 4].y - R[i].y);
  const px = (i) => Math.hypot(ref[(i + 1) % 4].x - ref[i].x, ref[(i + 1) % 4].y - ref[i].y);
  const real = [refW, refH, refW, refH];
  let sNum = 0, sDen = 0;
  for (let i = 0; i < 4; i++) { const w = px(i) ** 2; sNum += w * real[i]; sDen += w * side(i); }
  const s = sNum / sDen;
  // alinhamento rígido (Procrustes) da folha medida com o retângulo canônico
  const T = [{ x: 0, y: 0 }, { x: refW, y: 0 }, { x: refW, y: refH }, { x: 0, y: refH }];
  const S = R.map((q) => ({ x: q.x * s, y: q.y * s }));
  const mS = { x: S.reduce((t, q) => t + q.x, 0) / 4, y: S.reduce((t, q) => t + q.y, 0) / 4 };
  const mT = { x: refW / 2, y: refH / 2 };
  let num = 0, den = 0;
  for (let i = 0; i < 4; i++) {
    const a = { x: S[i].x - mS.x, y: S[i].y - mS.y }, b = { x: T[i].x - mT.x, y: T[i].y - mT.y };
    num += a.x * b.y - a.y * b.x; den += a.x * b.x + a.y * b.y;
  }
  const th = Math.atan2(num, den), c = Math.cos(th), sn = Math.sin(th);
  const toFloor = (p) => {
    const q = rayToFloor(p, cam);
    if (!q) return null;
    const x = q.x * s - mS.x, y = q.y * s - mS.y;
    return { x: x * c - y * sn + mT.x, y: x * sn + y * c + mT.y };
  };
  const toImage = (q) => {
    const x = q.x - mT.x, y = q.y - mT.y;
    const ux = x * c + y * sn + mS.x, uy = -x * sn + y * c + mS.y;
    return floorToImage({ x: ux / s, y: uy / s }, cam);
  };
  return { toFloor, toImage, cam, residual: best.v };
}
