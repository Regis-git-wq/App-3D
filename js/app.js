// Controlador principal do app Reforma 3D.
import {
  newProject, clonePlan, uid, getWall, getPoint, wallLength, setWallLength, clampOpenings, findOpening,
  deleteWall, deletePoint, cleanup, addRectRoom, addItem, roomArea, OPENING_DEFAULTS, OPENING_NAMES, detectRooms,
} from './model.js';
import { FLOORS, WALL_TILES, PAINTS, ITEMS, ITEM_COLORS, textureCanvas } from './catalog.js';
import { computeQuantities, floorName, tileName, paintName, fmtM2, fmtM } from './quantities.js';
import { Plan2D, fmtLen } from './plan2d.js';

const STORE_KEY = 'reforma3d.project.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cm = (m) => Math.round(m * 1000) / 10;
const num = (v) => parseFloat(String(v).replace(',', '.'));

class App {
  constructor() {
    this.project = this.load() || newProject(true);
    this.selection = null;
    this.tool = 'select';
    this.view = '2d';
    this.undoStack = [];
    this.redoStack = [];
    this.view3d = null;
    this.plan2d = new Plan2D($('#planCanvas'), this);
    this.bindUI();
    this.refreshAll();
    if (!localStorageGet('reforma3d.seenHelp')) {
      localStorageSet('reforma3d.seenHelp', '1');
      setTimeout(() => this.openHelp(), 400);
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ---------- estado ----------
  get scenario() { return this.project.scenarios.find((s) => s.id === this.project.activeId) || this.project.scenarios[0]; }
  get plan() { return this.scenario.plan; }
  get scenarioIndex() { return this.project.scenarios.indexOf(this.scenario); }

  defaultWallStatus() { return this.scenarioIndex > 0 ? 'new' : 'existing'; }

  beginEdit() {
    this.undoStack.push(JSON.stringify(this.plan));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    this.updateUndo();
  }

  changed() {
    this.validateSelection();
    this.save();
    this.plan2d.draw();
    this.renderProps();
    this.updateUndo();
    if (this.view === '3d') this.rebuild3d();
  }

  liveChanged() {
    // durante arrasto: só redesenha
    if (this.selection) this.renderPropsSoft();
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.plan));
    this.scenario.plan = JSON.parse(this.undoStack.pop());
    this.plan2d.endChain();
    this.changed();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.plan));
    this.scenario.plan = JSON.parse(this.redoStack.pop());
    this.changed();
  }

  updateUndo() {
    $('#btnUndo').disabled = !this.undoStack.length;
    $('#btnRedo').disabled = !this.redoStack.length;
  }

  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => localStorageSet(STORE_KEY, JSON.stringify(this.project)), 250);
  }

  load() {
    try {
      const raw = localStorageGet(STORE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p && p.scenarios?.length ? p : null;
    } catch { return null; }
  }

  validateSelection() {
    const s = this.selection;
    if (!s) return;
    const plan = this.plan;
    const ok = s.type === 'wall' ? getWall(plan, s.id)
      : s.type === 'point' ? getPoint(plan, s.id)
        : s.type === 'room' ? plan.rooms.find((r) => r.id === s.id)
          : s.type === 'item' ? plan.items.find((i) => i.id === s.id)
            : s.type === 'opening' ? findOpening(plan, s.id) : null;
    if (!ok) this.selection = null;
  }

  // ---------- UI geral ----------
  bindUI() {
    $('#btnUndo').onclick = () => this.undo();
    $('#btnRedo').onclick = () => this.redo();
    $('#btnMenu').onclick = () => this.openMenu();
    $('#btnScenario').onclick = () => this.openScenarios();
    $$('#viewSeg button').forEach((b) => (b.onclick = () => this.setView(b.dataset.view)));
    $$('#toolbar button').forEach((b) => (b.onclick = () => {
      const t = b.dataset.tool;
      if (t === 'room') return this.openRectRoom();
      if (t === 'item') return this.openCatalog();
      this.setTool(this.tool === t && t !== 'select' ? 'select' : t);
    }));
    $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) this.closeModal(); });
    $('#propsGrab').onclick = () => $('#props').classList.toggle('collapsed');

    // painel parede
    $('#wpOrigin').onclick = () => { this.plan2d.startChainAt(0, 0); this.chainChanged(); };
    $$('#wpChain .arrows button').forEach((b) => (b.onclick = () => {
      const v = num($('#wpLen').value);
      if (!(v > 0)) { this.toast('Digite a medida em cm'); $('#wpLen').focus(); return; }
      this.plan2d.addSegment(v / 100, +b.dataset.deg);
      $('#wpLen').value = '';
      this.chainChanged();
    }));
    $('#wpClose').onclick = () => { this.plan2d.closeChain(); this.chainChanged(); };
    $('#wpDone').onclick = () => { this.plan2d.endChain(); this.chainChanged(); };

    // 3D
    $('#btnFrame').onclick = () => { if (this.view3d?.walk) this.toggleWalk(); this.view3d?.frame(); };
    $('#btnTop').onclick = () => { if (this.view3d?.walk) this.toggleWalk(); this.view3d?.topView(); };
    $('#btnWalk').onclick = () => this.toggleWalk();
    $('#btnDemo').onclick = () => {
      this.showDemo = !this.showDemo;
      $('#btnDemo').classList.toggle('on', this.showDemo);
      this.rebuild3d();
      this.toast(this.showDemo ? 'Paredes a demolir em vermelho translúcido' : 'Mostrando o resultado final');
    };
    $('#btnAR').onclick = () => this.openAR();
    this.bindJoystick();

    $('#fileInput').onchange = (e) => this.importFile(e.target.files[0]);
  }

  setTool(t) {
    if (this.tool === 'wall' && t !== 'wall') this.plan2d.endChain();
    this.tool = t;
    $$('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    if (t !== 'select') this.select(null);
    const hints = {
      wall: 'Arraste e solte para marcar cada canto. Toque no 1º ponto para fechar o cômodo.',
      door: 'Toque numa parede para colocar a porta',
      window: 'Toque numa parede para colocar a janela',
      passage: 'Toque numa parede para abrir um vão',
    };
    this.setHint(hints[t]);
    $('#wallPanel').classList.toggle('hidden', t !== 'wall');
    this.chainChanged();
    this.plan2d.draw();
  }

  setHint(text) {
    this.hintText = text || '';
    $('#hint').textContent = this.hintText;
    $('#hint').classList.toggle('hidden', !this.hintText || this.view !== '2d');
  }

  chainChanged() {
    const has = this.plan2d.chain.length > 0;
    $('#wpStart').classList.toggle('hidden', has);
    $('#wpChain').classList.toggle('hidden', !has);
    $('#wpChainActions').classList.toggle('hidden', !has);
    if (has) {
      const p = getPoint(this.plan, this.plan2d.chain[this.plan2d.chain.length - 1]);
      $('#wpLen').placeholder = 'Medida a partir do último ponto';
      if (p) this.setHint(`Último ponto em x ${cm(p.x)} · y ${cm(p.y)} cm. Digite a medida e escolha a direção, ou arraste.`);
    } else if (this.tool === 'wall') {
      this.setHint('Arraste e solte para marcar cada canto. Toque no 1º ponto para fechar o cômodo.');
    }
  }

  select(sel) {
    this.selection = sel;
    $('#props').classList.remove('collapsed');
    this.renderProps();
    this.plan2d.draw();
  }

  setView(v) {
    this.view = v;
    $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#view2d').classList.toggle('hidden', v !== '2d');
    $('#view3d').classList.toggle('hidden', v !== '3d');
    $('#ctrl3d').classList.toggle('hidden', v !== '3d');
    $('#toolbar').classList.toggle('disabled', v !== '2d');
    $('#wallPanel').classList.toggle('hidden', v !== '2d' || this.tool !== 'wall');
    this.setHint(this.hintText);
    if (v === '3d') this.enter3d();
    else {
      this.view3d?.stop();
      if (this.view3d?.walk) this.toggleWalk();
      this.plan2d.resize();
    }
    this.renderProps();
  }

  async enter3d() {
    if (!this.view3d) {
      try {
        const { View3D } = await import('./view3d.js');
        this.view3d = new View3D($('#view3d'));
        this.rebuild3d();
        this.view3d.frame();
      } catch (err) {
        console.error(err);
        this.toast('Não foi possível iniciar o 3D neste navegador.');
        return;
      }
    } else this.rebuild3d();
    this.view3d.start();
  }

  rebuild3d() {
    if (!this.view3d) return;
    this.view3d.build(this.plan, { showDemolished: !!this.showDemo, ceiling: !!this.view3d.walk });
  }

  toggleWalk() {
    const v = this.view3d;
    if (!v) return;
    v.setWalk(!v.walk);
    if (this.showDemo) this.rebuild3d();
    $('#btnWalk').classList.toggle('on', !!v.walk);
    $('#joystick').classList.toggle('hidden', !v.walk);
    if (v.walk) this.toast('Arraste para olhar; use o controle para andar');
  }

  bindJoystick() {
    const j = $('#joystick'), knob = $('.knob', j);
    let id = null, c = null;
    const set = (x, y) => {
      const r = 45, d = Math.hypot(x, y), k = d > r ? r / d : 1;
      x *= k; y *= k;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      if (this.view3d) this.view3d.move = { x: x / r, y: y / r };
    };
    j.addEventListener('pointerdown', (e) => {
      id = e.pointerId; j.setPointerCapture(id);
      const r = j.getBoundingClientRect(); c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      set(e.clientX - c.x, e.clientY - c.y);
    });
    j.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - c.x, e.clientY - c.y); });
    const end = (e) => { if (e.pointerId === id) { id = null; set(0, 0); } };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  }

  refreshAll() {
    $('#scenarioName').textContent = this.scenario.name;
    this.updateUndo();
    this.plan2d.fitted = false;
    this.plan2d.resize();
    this.renderProps();
    if (this.view === '3d') { this.rebuild3d(); this.view3d?.frame(); }
  }

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  // ---------- painel de propriedades ----------
  renderPropsSoft() {
    // atualiza somente valores numéricos durante arrasto
    const s = this.selection;
    if (!s) return;
    if (s.type === 'wall') {
      const w = getWall(this.plan, s.id);
      const el = $('#pLen'); if (el && w && document.activeElement !== el) el.value = cm(wallLength(this.plan, w));
    }
  }

  renderProps() {
    const s = this.selection;
    const box = $('#props');
    if (!s || this.view !== '2d') { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const body = $('#propsBody');
    const plan = this.plan;
    let html = '';
    if (s.type === 'wall') {
      const w = getWall(plan, s.id);
      html = `
        <div class="head"><h2>Parede</h2><span class="muted">${fmtLen(wallLength(plan, w))}</span></div>
        <div class="segctl" data-act="status">
          ${['existing', 'demolish', 'new'].map((v) => `<button data-v="${v}" class="${w.status === v ? 'on' : ''}">${{ existing: 'Existente', demolish: 'Demolir', new: 'Construir' }[v]}</button>`).join('')}
        </div>
        <div class="grid2">
          <label class="field"><span>Comprimento</span><input id="pLen" type="number" inputmode="decimal" value="${cm(wallLength(plan, w))}" data-f="len"></label>
          <label class="field"><span>Espessura</span><input type="number" inputmode="decimal" value="${cm(w.thickness)}" data-f="thick"></label>
          <label class="field"><span>Altura</span><input type="number" inputmode="decimal" value="${cm(w.height || plan.wallHeight)}" data-f="height"></label>
        </div>
        <p class="muted">Medidas em cm. Mudar o comprimento move a ponta final da parede.</p>
        <div class="btn-row">
          <button class="btn small" data-act="door">+ Porta</button>
          <button class="btn small" data-act="window">+ Janela</button>
          <button class="btn small" data-act="passage">+ Vão</button>
        </div>
        <div class="btn-row"><button class="btn danger" data-act="del">Excluir parede</button></div>`;
    } else if (s.type === 'point') {
      const p = getPoint(plan, s.id);
      html = `
        <div class="head"><h2>Canto</h2></div>
        <div class="grid2">
          <label class="field"><span>X</span><input type="number" inputmode="decimal" value="${cm(p.x)}" data-f="px"></label>
          <label class="field"><span>Y</span><input type="number" inputmode="decimal" value="${cm(p.y)}" data-f="py"></label>
        </div>
        <p class="muted">Arraste o ponto para ajustar. Paredes ligadas acompanham.</p>
        <div class="btn-row"><button class="btn danger" data-act="del">Excluir canto (e paredes ligadas)</button></div>`;
    } else if (s.type === 'opening') {
      const { wall, opening: o } = findOpening(plan, s.id);
      const L = wallLength(plan, wall);
      html = `
        <div class="head"><h2>${OPENING_NAMES[o.type]}</h2><span class="muted">parede de ${fmtLen(L)}</span></div>
        <div class="segctl" data-act="otype">
          ${['door', 'window', 'passage'].map((v) => `<button data-v="${v}" class="${o.type === v ? 'on' : ''}">${OPENING_NAMES[v]}</button>`).join('')}
        </div>
        <div class="grid2">
          <label class="field"><span>Largura</span><input type="number" inputmode="decimal" value="${cm(o.width)}" data-f="ow"></label>
          <label class="field"><span>Altura</span><input type="number" inputmode="decimal" value="${cm(o.height)}" data-f="oh"></label>
          ${o.type === 'window' ? `<label class="field"><span>Peitoril</span><input type="number" inputmode="decimal" value="${cm(o.sill)}" data-f="os"></label>` : ''}
          <label class="field"><span>Do início</span><input type="number" inputmode="decimal" value="${cm(o.offset - o.width / 2)}" data-f="oo"></label>
        </div>
        ${o.type === 'door' ? `<div class="btn-row"><button class="btn small" data-act="hinge">Trocar dobradiça</button><button class="btn small" data-act="swing">Abrir p/ outro lado</button></div>` : ''}
        <p class="muted">Arraste a abertura ao longo da parede para mover.</p>
        <div class="btn-row"><button class="btn danger" data-act="del">Excluir</button></div>`;
    } else if (s.type === 'room') {
      const r = plan.rooms.find((r) => r.id === s.id);
      const fin = r.wall || { type: 'paint', color: '#f7f6f2', tile: 'azulejo_branco' };
      html = `
        <div class="head"><h2>Cômodo</h2><span class="muted">${fmtM2(roomArea(plan, r))}</span></div>
        <label class="field"><span>Nome</span><input type="text" class="wide" value="${esc(r.name)}" data-f="rname"></label>
        <h3>Piso</h3>
        <div class="mat-list">
          ${Object.entries(FLOORS).map(([k, f]) => `<button class="mat ${r.floor === k ? 'on' : ''}" data-floor="${k}"><div class="img" style="background-image:url(${texURL('floor', k)})"></div>${f.name}</button>`).join('')}
        </div>
        <h3>Paredes deste cômodo</h3>
        <div class="segctl" data-act="wtype">
          <button data-v="paint" class="${fin.type !== 'tile' ? 'on' : ''}">Pintura</button>
          <button data-v="tile" class="${fin.type === 'tile' ? 'on' : ''}">Revestimento</button>
        </div>
        <div style="height:10px"></div>
        ${fin.type === 'tile' ? `
          <div class="mat-list">
            ${Object.entries(WALL_TILES).map(([k, f]) => `<button class="mat ${fin.tile === k ? 'on' : ''}" data-tile="${k}"><div class="img" style="background-image:url(${texURL('wall', k)})"></div>${f.name}</button>`).join('')}
          </div>` : `
          <div class="swatches">
            ${PAINTS.map(([n, c]) => `<button class="swatch ${fin.color?.toLowerCase() === c ? 'on' : ''}" title="${n}" style="background:${c}" data-paint="${c}"></button>`).join('')}
            <input type="color" class="color-input" value="${fin.color || '#ffffff'}" data-f="rcolor" title="Outra cor">
          </div>
          <p class="muted">${esc(paintName(fin.color || '#f7f6f2'))}</p>`}
        <div class="btn-row"><button class="btn danger" data-act="del">Excluir cômodo (mantém paredes)</button></div>`;
    } else if (s.type === 'item') {
      const it = plan.items.find((i) => i.id === s.id);
      html = `
        <div class="head"><h2>${esc(it.name)}</h2></div>
        <div class="grid2">
          <label class="field"><span>Largura</span><input type="number" inputmode="decimal" value="${cm(it.w)}" data-f="iw"></label>
          <label class="field"><span>Profund.</span><input type="number" inputmode="decimal" value="${cm(it.d)}" data-f="id"></label>
          <label class="field"><span>Altura</span><input type="number" inputmode="decimal" value="${cm(it.h)}" data-f="ih"></label>
          <label class="field"><span>Do chão</span><input type="number" inputmode="decimal" value="${cm(it.elev || 0)}" data-f="ie"></label>
        </div>
        <div class="field"><span>Girar</span>
          <div class="rot">
            <button data-rot="-90">↺ 90°</button><button data-rot="-15">−15°</button><button data-rot="15">+15°</button><button data-rot="90">↻ 90°</button>
          </div>
        </div>
        <h3>Cor</h3>
        <div class="swatches">
          ${ITEM_COLORS.map((c) => `<button class="swatch ${it.color === c ? 'on' : ''}" style="background:${c}" data-icolor="${c}"></button>`).join('')}
          <input type="color" class="color-input" value="${it.color}" data-f="icolor">
        </div>
        <div class="btn-row"><button class="btn" data-act="dup">Duplicar</button><button class="btn danger" data-act="del">Excluir</button></div>`;
    }
    body.innerHTML = html;
    this.bindProps(body);
  }

  bindProps(body) {
    const s = this.selection;
    const plan = this.plan;
    const edit = (fn) => { this.beginEdit(); fn(); this.changed(); };

    body.querySelectorAll('input[data-f]').forEach((inp) => {
      inp.addEventListener(inp.type === 'color' ? 'input' : 'change', () => {
        const f = inp.dataset.f;
        const v = num(inp.value);
        const m = v / 100;
        if (inp.type === 'number' && !(v >= 0)) return this.renderProps();
        if (inp.type === 'color' && this.colorT) { clearTimeout(this.colorT); }
        const apply = () => edit(() => {
          if (s.type === 'wall') {
            const w = getWall(plan, s.id);
            if (f === 'len' && m > 0.05) setWallLength(plan, w, m);
            if (f === 'thick' && m > 0.03) w.thickness = m;
            if (f === 'height' && m > 0.5) w.height = Math.abs(m - plan.wallHeight) < 1e-6 ? undefined : m;
          } else if (s.type === 'point') {
            const p = getPoint(plan, s.id);
            if (f === 'px') p.x = m; if (f === 'py') p.y = m;
            plan.walls.forEach((w) => clampOpenings(plan, w));
          } else if (s.type === 'opening') {
            const { wall, opening: o } = findOpening(plan, s.id);
            if (f === 'ow' && m > 0.2) o.width = m;
            if (f === 'oh' && m > 0.2) o.height = m;
            if (f === 'os') o.sill = m;
            if (f === 'oo') o.offset = m + o.width / 2;
            clampOpenings(plan, wall);
          } else if (s.type === 'room') {
            const r = plan.rooms.find((r) => r.id === s.id);
            if (f === 'rname') r.name = inp.value.trim() || r.name;
            if (f === 'rcolor') r.wall = { ...(r.wall || {}), type: 'paint', color: inp.value };
          } else if (s.type === 'item') {
            const it = plan.items.find((i) => i.id === s.id);
            if (f === 'iw' && m > 0.02) it.w = m;
            if (f === 'id' && m > 0.005) it.d = m;
            if (f === 'ih' && m > 0.005) it.h = m;
            if (f === 'ie') it.elev = m;
            if (f === 'icolor') it.color = inp.value;
          }
        });
        if (inp.type === 'color') this.colorT = setTimeout(apply, 150); else apply();
      });
      if (inp.type === 'number') inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });

    body.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const seg = b.closest('.segctl');
      if (seg) {
        const v = b.dataset.v, act = seg.dataset.act;
        edit(() => {
          if (act === 'status') {
            const before = plan.rooms.length;
            getWall(plan, s.id).status = v;
            detectRooms(plan);
            if (plan.rooms.length < before) this.toast('Cômodos unidos (a parede será demolida)');
            if (plan.rooms.length > before) this.toast('Cômodos separados novamente');
          }
          if (act === 'otype') {
            const { wall, opening: o } = findOpening(plan, s.id);
            const d = OPENING_DEFAULTS[v];
            o.type = v; o.height = d.height; o.sill = d.sill;
            clampOpenings(plan, wall);
          }
          if (act === 'wtype') {
            const r = plan.rooms.find((r) => r.id === s.id);
            r.wall = { color: '#f7f6f2', tile: 'azulejo_branco', ...(r.wall || {}), type: v };
          }
        });
        return;
      }
      if (b.dataset.floor) return edit(() => { plan.rooms.find((r) => r.id === s.id).floor = b.dataset.floor; });
      if (b.dataset.tile) return edit(() => { const r = plan.rooms.find((r) => r.id === s.id); r.wall = { ...r.wall, type: 'tile', tile: b.dataset.tile }; });
      if (b.dataset.paint) return edit(() => { const r = plan.rooms.find((r) => r.id === s.id); r.wall = { ...r.wall, type: 'paint', color: b.dataset.paint }; });
      if (b.dataset.icolor) return edit(() => { plan.items.find((i) => i.id === s.id).color = b.dataset.icolor; });
      if (b.dataset.rot) return edit(() => { const it = plan.items.find((i) => i.id === s.id); it.rot = ((it.rot + +b.dataset.rot) % 360 + 360) % 360; });
      const act = b.dataset.act;
      if (!act) return;
      if (act === 'del') {
        edit(() => {
          if (s.type === 'wall') { deleteWall(plan, s.id); detectRooms(plan); cleanup(plan); }
          if (s.type === 'point') { deletePoint(plan, s.id); detectRooms(plan); cleanup(plan); }
          if (s.type === 'opening') { const { wall } = findOpening(plan, s.id); wall.openings = wall.openings.filter((o) => o.id !== s.id); }
          if (s.type === 'room') { plan.rooms = plan.rooms.filter((r) => r.id !== s.id); cleanup(plan); }
          if (s.type === 'item') plan.items = plan.items.filter((i) => i.id !== s.id);
          this.selection = null;
        });
      } else if (act === 'dup') {
        const it = plan.items.find((i) => i.id === s.id);
        let copy;
        edit(() => { copy = { ...it, id: uid(), x: it.x + 0.3, y: it.y + 0.3 }; plan.items.push(copy); });
        this.select({ type: 'item', id: copy.id });
      } else if (act === 'hinge' || act === 'swing') {
        edit(() => {
          const { opening: o } = findOpening(plan, s.id);
          if (act === 'hinge') o.hinge = o.hinge === 'R' ? 'L' : 'R'; else o.swing = (o.swing || 1) * -1;
        });
      } else if (['door', 'window', 'passage'].includes(act)) {
        const w = getWall(plan, s.id);
        let o;
        edit(() => {
          const L = wallLength(plan, w);
          const d = OPENING_DEFAULTS[act];
          o = { id: uid(), type: act, offset: L / 2, width: Math.min(d.width, L - 0.1), height: d.height, sill: d.sill, hinge: 'L', swing: 1 };
          w.openings.push(o);
          clampOpenings(plan, w);
        });
        this.select({ type: 'opening', id: o.id });
      }
    };
  }

  // ---------- modais ----------
  openModal(html, onBind) {
    $('#modalBody').innerHTML = html;
    $('#modal').classList.remove('hidden');
    onBind?.($('#modalBody'));
  }

  closeModal() {
    $('#modal').classList.add('hidden');
    $('#modalBody').innerHTML = '';
    URL.revokeObjectURL(this.arURL || '');
  }

  openMenu() {
    const item = (act, icon, label) => `<button data-m="${act}"><svg viewBox="0 0 24 24">${icon}</svg>${label}</button>`;
    this.openModal(`
      <h2>${esc(this.project.name)}</h2>
      <div class="menu-list">
        ${item('quant', '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>', 'Quantitativos para orçamento')}
        ${item('height', '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>', `Pé-direito padrão: ${fmtLen(this.plan.wallHeight)}`)}
        ${item('fit', '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', 'Centralizar planta')}
        ${item('png', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>', 'Salvar imagem (planta ou 3D)')}
        ${item('export', '<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>', 'Exportar projeto (arquivo .json)')}
        ${item('import', '<path d="M12 15V3M7 10l5 5 5-5M5 21h14"/>', 'Importar projeto (.json)')}
        ${item('rename', '<path d="M4 20h4L20 8l-4-4L4 16z"/>', 'Renomear projeto')}
        ${item('sample', '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z"/>', 'Novo projeto com exemplo')}
        ${item('new', '<path d="M12 5v14M5 12h14"/>', 'Novo projeto em branco')}
        ${item('help', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01"/>', 'Como usar')}
      </div>`, (el) => {
      el.onclick = (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        const m = b.dataset.m;
        if (m === 'quant') return this.openQuantities();
        if (m === 'help') return this.openHelp();
        this.closeModal();
        if (m === 'fit') this.plan2d.fit();
        if (m === 'height') {
          const v = num(prompt('Pé-direito padrão (cm):', cm(this.plan.wallHeight)));
          if (v > 100) { this.beginEdit(); this.plan.wallHeight = v / 100; this.changed(); }
        }
        if (m === 'png') this.saveImage();
        if (m === 'export') this.exportFile();
        if (m === 'import') $('#fileInput').click();
        if (m === 'rename') {
          const n = prompt('Nome do projeto:', this.project.name);
          if (n) { this.project.name = n.trim(); this.save(); }
        }
        if (m === 'new' || m === 'sample') {
          if (!confirm('Começar um novo projeto? O atual será substituído (exporte antes se quiser guardar).')) return;
          this.project = newProject(m === 'sample');
          this.undoStack = []; this.redoStack = []; this.selection = null;
          this.plan2d.endChain();
          this.save(); this.refreshAll();
          if (m === 'new') { this.setTool('wall'); }
        }
      };
    });
  }

  openScenarios() {
    const sc = this.project.scenarios;
    const render = () => `
      <div class="head"><h2>Cenários</h2><button class="btn small primary" data-s="dupActive">+ Novo a partir do atual</button></div>
      <p class="muted">Cada cenário é uma versão completa do apartamento. Mantenha o primeiro como "antes" e crie versões da reforma para comparar.</p>
      <div class="list">
        ${sc.map((s, i) => {
          const q = computeQuantities(s.plan);
          return `<div class="row-card ${s.id === this.project.activeId ? 'on' : ''}" data-id="${s.id}">
            <div class="grow" data-s="open">
              <div class="title">${esc(s.name)}</div>
              <div class="sub">${fmtM2(q.floorTotal)} · ${s.plan.rooms.length} cômodos${q.demolishLength ? ` · demolir ${fmtM(q.demolishLength)}` : ''}${q.newLength ? ` · construir ${fmtM(q.newLength)}` : ''}</div>
            </div>
            <button data-s="rename">Renomear</button>
            ${sc.length > 1 ? `<button data-s="del">Excluir</button>` : ''}
          </div>`;
        }).join('')}
      </div>
      ${sc.length > 1 ? `<div class="btn-row"><button class="btn" data-s="compare">Comparar cenários</button></div>` : ''}`;
    this.openModal(render(), (el) => {
      el.onclick = (e) => {
        const b = e.target.closest('[data-s]');
        if (!b) return;
        const id = b.closest('[data-id]')?.dataset.id;
        const s = sc.find((x) => x.id === id);
        const act = b.dataset.s;
        if (act === 'open') { this.switchScenario(id); this.closeModal(); }
        if (act === 'dupActive') {
          const n = prompt('Nome do novo cenário:', `Reforma ${String.fromCharCode(64 + sc.length)}`);
          if (!n) return;
          const copy = { id: uid(), name: n.trim(), plan: clonePlan(this.plan) };
          sc.push(copy);
          this.switchScenario(copy.id);
          this.closeModal();
          this.toast('Cenário criado. Paredes novas serão marcadas como "Construir".');
        }
        if (act === 'rename') {
          const n = prompt('Nome do cenário:', s.name);
          if (n) { s.name = n.trim(); this.save(); $('#scenarioName').textContent = this.scenario.name; el.innerHTML = render(); }
        }
        if (act === 'del') {
          if (!confirm(`Excluir o cenário "${s.name}"?`)) return;
          this.project.scenarios = sc.filter((x) => x.id !== id);
          if (this.project.activeId === id) this.project.activeId = this.project.scenarios[0].id;
          this.save(); this.closeModal(); this.switchScenario(this.project.activeId);
        }
        if (act === 'compare') this.openCompare();
      };
    });
  }

  switchScenario(id) {
    if (id === this.project.activeId) return;
    this.project.activeId = id;
    this.undoStack = []; this.redoStack = []; this.selection = null;
    this.plan2d.endChain();
    this.save();
    $('#scenarioName').textContent = this.scenario.name;
    this.updateUndo();
    this.plan2d.draw();
    this.renderProps();
    if (this.view === '3d') this.rebuild3d();
  }

  openRectRoom() {
    const empty = !this.plan.points.length;
    this.openModal(`
      <h2>Novo cômodo retangular</h2>
      <label class="field"><span>Nome</span><input type="text" class="wide" id="rrName" value="Cômodo ${this.plan.rooms.length + 1}"></label>
      <label class="field"><span>Largura (cm)</span><input type="number" inputmode="decimal" id="rrW" value="400"></label>
      <label class="field"><span>Comprimento (cm)</span><input type="number" inputmode="decimal" id="rrD" value="300"></label>
      <p class="muted">${empty ? 'Será criado na origem.' : 'Será criado no centro da tela. Depois arraste o cômodo (selecione e arraste) para encostar nos outros: cantos e paredes coincidentes são unidos automaticamente.'}</p>
      <div class="btn-row"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="rrOk">Criar</button></div>`, (el) => {
      $('#rrOk', el).onclick = () => {
        const w = num($('#rrW', el).value) / 100, d = num($('#rrD', el).value) / 100;
        if (!(w > 0.3 && d > 0.3)) return this.toast('Medidas inválidas');
        const c = empty ? { x: w / 2, y: d / 2 } : this.plan2d.viewCenter();
        const x = Math.round((c.x - w / 2) / 0.05) * 0.05, y = Math.round((c.y - d / 2) / 0.05) * 0.05;
        this.beginEdit();
        let room = addRectRoom(this.plan, x, y, w, d, $('#rrName', el).value.trim(), this.defaultWallStatus());
        detectRooms(this.plan);
        room = this.plan.rooms.find((r) => r.id === room.id) || room;
        this.closeModal();
        this.setTool('select');
        this.changed();
        if (empty) this.plan2d.fit();
        this.select({ type: 'room', id: room.id });
      };
    });
  }

  openCatalog() {
    const groups = [...new Set(ITEMS.map((i) => i.group))];
    this.openModal(`
      <h2>Adicionar móvel</h2>
      ${groups.map((g) => `<div class="catalog-group"><h3>${g}</h3><div class="catalog">
        ${ITEMS.map((it, i) => it.group === g ? `<button data-i="${i}"><span class="dot" style="background:${it.color}"></span><span>${it.name}<small>${cm(it.w)}×${cm(it.d)}×${cm(it.h)} cm</small></span></button>` : '').join('')}
      </div></div>`).join('')}`, (el) => {
      el.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const def = ITEMS[+b.dataset.i];
        const c = this.plan2d.viewCenter();
        this.beginEdit();
        const it = addItem(this.plan, def, c.x, c.y);
        this.closeModal();
        this.setTool('select');
        this.changed();
        this.select({ type: 'item', id: it.id });
        this.toast('Arraste o móvel para posicionar');
      };
    });
  }

  quantitiesHTML(plan) {
    const q = computeQuantities(plan);
    const row = (a, b) => `<tr><td>${a}</td><td class="n">${b}</td></tr>`;
    const sw = (style) => `<span class="chip" style="${style}"></span>`;
    let h = `<table class="q"><tr><th>Cômodo</th><th class="n">Piso</th><th class="n">Paredes*</th></tr>
      ${q.rooms.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${fmtM2(r.area)}</td><td class="n">${fmtM2(r.wallArea)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="n"><b>${fmtM2(q.floorTotal)}</b></td><td></td></tr></table>`;
    h += `<h3>Pisos</h3><table class="q">${Object.entries(q.floors).map(([k, v]) => row(sw(`background-image:url(${texURL('floor', k)})`) + floorName(k), fmtM2(v))).join('')}</table>`;
    if (Object.keys(q.paints).length) h += `<h3>Pintura de paredes</h3><table class="q">${Object.entries(q.paints).map(([k, v]) => row(sw(`background:${k}`) + esc(paintName(k)), fmtM2(v))).join('')}</table>`;
    if (Object.keys(q.tiles).length) h += `<h3>Revestimento de paredes</h3><table class="q">${Object.entries(q.tiles).map(([k, v]) => row(sw(`background-image:url(${texURL('wall', k)})`) + tileName(k), fmtM2(v))).join('')}</table>`;
    h += `<h3>Obra</h3><table class="q">
      ${row('Demolição de paredes', `${fmtM2(q.demolishArea)} (${fmtM(q.demolishLength)})`)}
      ${row('Paredes novas', `${fmtM2(q.newArea)} (${fmtM(q.newLength)})`)}
      ${row('Portas / janelas / vãos', `${q.openings.door} / ${q.openings.window} / ${q.openings.passage}`)}
    </table>`;
    if (Object.keys(q.items).length) h += `<h3>Móveis e equipamentos</h3><table class="q">${Object.entries(q.items).map(([k, v]) => row(esc(k), v + '×')).join('')}</table>`;
    h += `<p class="muted">* Área de parede por lado, já descontando portas e janelas. Some 10–15% de perda para revestimentos.</p>`;
    return { html: h, q };
  }

  openQuantities() {
    const { html, q } = this.quantitiesHTML(this.plan);
    this.openModal(`<div class="head"><h2>Quantitativos · ${esc(this.scenario.name)}</h2></div>${html}
      <div class="btn-row"><button class="btn" id="qCopy">Copiar como texto</button><button class="btn primary" data-close>Fechar</button></div>`, (el) => {
      $('#qCopy', el).onclick = async () => {
        const lines = [`${this.project.name} — ${this.scenario.name}`, ''];
        q.rooms.forEach((r) => lines.push(`${r.name}: piso ${fmtM2(r.area)}, paredes ${fmtM2(r.wallArea)}`));
        lines.push(`Total piso: ${fmtM2(q.floorTotal)}`, '');
        Object.entries(q.floors).forEach(([k, v]) => lines.push(`Piso ${floorName(k)}: ${fmtM2(v)}`));
        Object.entries(q.paints).forEach(([k, v]) => lines.push(`Pintura ${paintName(k)}: ${fmtM2(v)}`));
        Object.entries(q.tiles).forEach(([k, v]) => lines.push(`Revestimento ${tileName(k)}: ${fmtM2(v)}`));
        lines.push(`Demolição: ${fmtM2(q.demolishArea)}`, `Paredes novas: ${fmtM2(q.newArea)}`);
        try { await navigator.clipboard.writeText(lines.join('\n')); this.toast('Copiado'); } catch { this.toast('Não foi possível copiar'); }
      };
    });
  }

  openCompare() {
    const sc = this.project.scenarios;
    const qs = sc.map((s) => computeQuantities(s.plan));
    const line = (label, f) => `<tr><td>${label}</td>${qs.map((q) => `<td class="n">${f(q)}</td>`).join('')}</tr>`;
    const allFloors = [...new Set(qs.flatMap((q) => Object.keys(q.floors)))];
    this.openModal(`
      <h2>Comparar cenários</h2>
      <div style="overflow-x:auto"><table class="q">
        <tr><th></th>${sc.map((s) => `<th class="n">${esc(s.name)}</th>`).join('')}</tr>
        ${line('Área de piso', (q) => fmtM2(q.floorTotal))}
        ${line('Cômodos', (q) => q.rooms.length)}
        ${allFloors.map((k) => line(floorName(k), (q) => (q.floors[k] ? fmtM2(q.floors[k]) : '—'))).join('')}
        ${line('Pintura', (q) => fmtM2(Object.values(q.paints).reduce((a, b) => a + b, 0)))}
        ${line('Revestimento', (q) => fmtM2(Object.values(q.tiles).reduce((a, b) => a + b, 0)))}
        ${line('Demolição', (q) => fmtM2(q.demolishArea))}
        ${line('Paredes novas', (q) => fmtM2(q.newArea))}
        ${line('Móveis', (q) => Object.values(q.items).reduce((a, b) => a + b, 0))}
      </table></div>
      <div class="btn-row"><button class="btn primary" data-close>Fechar</button></div>`);
  }

  openHelp() {
    this.openModal(`
      <div class="help">
        <h2>Como usar o Reforma 3D</h2>
        <ol>
          <li><b>Meça o apartamento.</b> Use o app <i>Medida</i> do iPhone (já vem instalado) ou uma trena. Anote o comprimento de cada parede, posição de portas e janelas e o pé-direito.</li>
          <li><b>Desenhe a planta.</b> Use <b>Cômodo</b> para criar retângulos com as medidas, ou <b>Parede</b> para traçar canto a canto: digite a medida em cm e toque na seta da direção. Toque no primeiro ponto para fechar o cômodo.</li>
          <li><b>Ajuste.</b> Em <b>Selecionar</b>, toque numa parede para mudar o comprimento, ou arraste cantos, paredes e cômodos. Use <b>Porta</b>, <b>Janela</b> e <b>Vão</b> tocando sobre as paredes.</li>
          <li><b>Crie a reforma.</b> No topo, toque no nome do cenário → <b>Novo a partir do atual</b>. No novo cenário, marque paredes como <b>Demolir</b>, desenhe paredes novas (ficam verdes), troque pisos e cores de cada cômodo e coloque móveis.</li>
          <li><b>Veja em 3D.</b> Toque em <b>3D</b>: gire com um dedo, aproxime com pinça. <b>Caminhar</b> coloca você dentro do apartamento. <b>AR</b> abre o modelo em realidade aumentada em tamanho real.</li>
          <li><b>Orçamento.</b> No menu ☰ → <b>Quantitativos</b> mostra m² de piso, pintura, revestimento, demolição e paredes novas.</li>
        </ol>
        <p class="muted">Tudo fica salvo automaticamente neste aparelho. Use <b>Exportar projeto</b> para fazer backup ou abrir em outro aparelho. Para usar como app, no Safari toque em Compartilhar → <b>Adicionar à Tela de Início</b>.</p>
        <div class="btn-row"><button class="btn primary" data-close>Entendi</button></div>
      </div>`);
  }

  async openAR() {
    if (!this.view3d) return;
    this.openModal(`<h2>Realidade aumentada</h2><p class="muted" id="arStatus">Gerando modelo 3D…</p><div id="arSlot"></div>`);
    try {
      const blob = await this.view3d.exportUSDZ();
      this.arURL = URL.createObjectURL(blob);
      const fname = `${slug(this.project.name)}-${slug(this.scenario.name)}.usdz`;
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      $('#arStatus').innerHTML = isIOS
        ? 'Pronto! Toque abaixo para abrir no <b>AR Quick Look</b>. Aponte o iPhone para o chão; dá para mover, girar e ver em tamanho real (100%).'
        : 'Pronto. O AR Quick Look funciona no iPhone/iPad. Aqui você pode baixar o arquivo .usdz.';
      $('#arSlot').innerHTML = `
        <a class="ar-link" rel="ar" href="${this.arURL}" ${isIOS ? '' : `download="${fname}"`}><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">${isIOS ? 'Abrir em AR' : 'Baixar .usdz'}</a>
        <div class="btn-row"><a class="btn" href="${this.arURL}" download="${fname}" style="text-align:center;text-decoration:none">Salvar arquivo .usdz</a></div>`;
    } catch (err) {
      console.error(err);
      $('#arStatus').textContent = 'Não foi possível gerar o modelo: ' + err.message;
    }
  }

  // ---------- arquivos ----------
  exportFile() {
    const blob = new Blob([JSON.stringify(this.project, null, 1)], { type: 'application/json' });
    download(blob, `${slug(this.project.name)}.json`);
  }

  async importFile(file) {
    if (!file) return;
    try {
      const p = JSON.parse(await file.text());
      if (!p.scenarios?.length || !p.scenarios[0].plan) throw new Error('arquivo inválido');
      this.project = p;
      if (!p.scenarios.some((s) => s.id === p.activeId)) p.activeId = p.scenarios[0].id;
      this.undoStack = []; this.redoStack = []; this.selection = null;
      this.save(); this.refreshAll();
      this.toast('Projeto importado');
    } catch (e) {
      this.toast('Não foi possível importar: ' + e.message);
    }
    $('#fileInput').value = '';
  }

  saveImage() {
    const url = this.view === '3d' && this.view3d ? this.view3d.screenshot() : this.plan2d.snapshot();
    fetch(url).then((r) => r.blob()).then((b) => download(b, `${slug(this.scenario.name)}-${this.view}.${this.view === '3d' ? 'jpg' : 'png'}`));
  }
}

// ---------- utilidades ----------
const texCache = {};
function texURL(kind, key) {
  const id = kind + key;
  if (!texCache[id]) {
    const c = textureCanvas(kind, key);
    const s = document.createElement('canvas'); s.width = s.height = 128;
    s.getContext('2d').drawImage(c, 0, 0, 128, 128);
    texCache[id] = s.toDataURL('image/jpeg', 0.8);
  }
  return texCache[id];
}

function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projeto';
}

async function download(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } }

window.app = new App();
