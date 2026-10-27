import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Agent, Building, Floor } from '../core/types';
import { label, type View } from './engine';
import { decorBuilding, flat } from './meshes';
import { woodTexture } from './textures';

const STATUS_COLOR = { idle: '#9aa5b1', working: '#2ecc71', 'needs-you': '#ef4444' } as const;
const OUTSIDE = ['#f08a6c', '#ef6f6c', '#9fd39a', '#f4a6c1', '#f7c873', '#a6d3f4', '#f2b8d0'];

interface Desk {
  agent: Agent;
  head: THREE.Mesh;
  ring: THREE.Mesh;
  screen: THREE.CanvasTexture;
  screenCtx: CanvasRenderingContext2D;
  tag: HTMLElement;
  phase: number;
}

/** What the office's wall screens show; supplied by the app from live sim state. */
export interface OfficeScreens {
  live: { title: string; lines: [string, string][] };
  wall: { day: string; items: { text: string; color: string }[] }[];
}

export class OfficeView implements View {
  root = new THREE.Group();
  pickables: THREE.Object3D[] = [];
  private desks: Desk[] = [];
  private board?: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private b: Building;
  private f: Floor;
  private onAgent: (agentId: string) => void;
  private screens: () => OfficeScreens;
  private tv?: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private wall?: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private deskPos = new Map<string, THREE.Vector3>();
  selected?: string;

  constructor(b: Building, f: Floor, onAgent: (agentId: string) => void, screens: () => OfficeScreens) {
    this.b = b; this.f = f; this.onAgent = onAgent; this.screens = screens;
    this.room();
    this.screensMeshes();
    this.outside();
    if (f.vacant) this.vacantSign();
    else this.layoutDesks();
    this.refresh();
  }

  home(cam: THREE.PerspectiveCamera, controls: OrbitControls) {
    // Aim a little left of centre so the leadership corner isn't hidden under the left menu.
    controls.target.set(-2.5, 0, 0);
    cam.position.set(-2.5, 17, 22);
    controls.minDistance = 6;
    controls.maxDistance = 45;
  }

  setNight() {}

  /** Swing the camera to an agent's desk ("Elvis's desk", "Max"). */
  focusAgent(id: string, cam: THREE.PerspectiveCamera, controls: OrbitControls) {
    const p = this.deskPos.get(id);
    if (!p) return;
    controls.target.set(p.x, 1.2, p.z);
    cam.position.set(p.x + 3, 7, p.z + 8);
  }

  private canvasPlane(w: number, h: number, pw: number, ph: number) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex }));
    return { mesh, tex, ctx: c.getContext('2d')! };
  }

  private screensMeshes() {
    // Live screen: a standing TV on the right, like the reference office.
    const tv = this.canvasPlane(512, 640, 3.2, 4);
    tv.mesh.position.set(12.2, 3.1, -5.5);
    tv.mesh.rotation.y = -0.6;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.2, 0.15), flat('#1b1f24'));
    bezel.position.copy(tv.mesh.position);
    bezel.rotation.y = tv.mesh.rotation.y;
    bezel.translateZ(-0.09);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1), flat('#333'));
    pole.position.set(12.2, 0.55, -5.5);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 20), flat('#333'));
    foot.position.set(12.2, 0.04, -5.5);
    this.root.add(bezel, tv.mesh, pole, foot);
    this.tv = tv;

    // Content wall: this week's posts, on the left glass wall.
    const wall = this.canvasPlane(1024, 512, 8, 4);
    wall.mesh.position.set(-14.85, 2.8, 0);
    wall.mesh.rotation.y = Math.PI / 2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.3, 8.3), flat('#b9824f'));
    frame.position.set(-14.98, 2.8, 0);
    this.root.add(frame, wall.mesh);
    this.wall = wall;
  }

  private drawScreens() {
    const s = this.screens();
    if (this.tv) {
      const g = this.tv.ctx;
      g.fillStyle = '#0e141b'; g.fillRect(0, 0, 512, 640);
      g.fillStyle = '#f5b335'; g.font = 'bold 30px system-ui'; g.fillText('LIVE', 24, 50);
      g.fillStyle = '#9fb3c8'; g.font = '20px system-ui'; g.fillText(s.live.title, 24, 80);
      s.live.lines.forEach(([k, v], i) => {
        const y = 140 + i * 78;
        g.fillStyle = '#1d2733'; g.fillRect(20, y - 40, 472, 64);
        g.fillStyle = '#9fb3c8'; g.font = '20px system-ui'; g.fillText(k, 36, y - 6);
        g.fillStyle = '#f5b335'; g.font = 'bold 34px system-ui'; g.textAlign = 'right'; g.fillText(v, 476, y + 4); g.textAlign = 'left';
      });
      this.tv.tex.needsUpdate = true;
    }
    if (this.wall) {
      const g = this.wall.ctx;
      g.fillStyle = '#121a24'; g.fillRect(0, 0, 1024, 512);
      g.fillStyle = '#f5b335'; g.font = 'bold 30px system-ui'; g.fillText('CONTENT WEEK', 24, 46);
      const cw = (1024 - 32) / 7;
      s.wall.slice(0, 7).forEach((d, i) => {
        const x = 16 + i * cw;
        g.fillStyle = '#1d2733'; g.fillRect(x + 3, 66, cw - 6, 430);
        g.fillStyle = '#fff'; g.font = 'bold 18px system-ui'; g.fillText(d.day, x + 10, 92);
        d.items.slice(0, 5).forEach((it, j) => {
          const y = 108 + j * 76;
          g.fillStyle = it.color; g.fillRect(x + 10, y, 5, 64);
          g.fillStyle = '#e5e7eb'; g.font = '15px system-ui';
          wrap(g, it.text, x + 22, y + 16, cw - 36, 18, 3);
        });
      });
      this.wall.tex.needsUpdate = true;
    }
  }

  private room() {
    const W = 30, D = 22;
    const wood = woodTexture().clone();
    wood.needsUpdate = true;
    wood.repeat.set(4, 3);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.9 }));
    floor.position.y = -0.15;
    floor.receiveShadow = true;
    this.root.add(floor);

    // Zone rugs: leadership corner (accent) and the team pit.
    const rug = (w: number, d: number, x: number, z: number, border: string) => {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), flat(border));
      outer.position.set(x, 0.02, z);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.05, d - 0.6), flat('#f3ede2'));
      inner.position.set(x, 0.03, z);
      outer.receiveShadow = inner.receiveShadow = true;
      this.root.add(outer, inner);
    };
    rug(9, 6.5, -9.5, -4.5, this.b.accent);
    rug(19, 11, 4, 1, '#e3a868');

    // Glass walls with a timber rail, and a timber feature wall holding the task board.
    const glass = new THREE.MeshStandardMaterial({ color: '#cfe9f7', transparent: true, opacity: 0.18, roughness: 0.1 });
    for (const [w, x, z, ry] of [[W, 0, -D / 2, 0], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, Math.PI / 2]] as const) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 5, 0.1), glass);
      pane.position.set(x, 2.5, z);
      pane.rotation.y = ry;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 0.25), flat('#c9a27a'));
      rail.position.set(x, 1.1, z);
      rail.rotation.y = ry;
      this.root.add(pane, rail);
    }
    const feature = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 0.5), flat('#b9824f'));
    feature.position.set(1, 2.75, -D / 2 + 0.3);
    this.root.add(feature);

    const c = document.createElement('canvas');
    c.width = 1024; c.height = 440;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.board = { tex, ctx: c.getContext('2d')! };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 4), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(1, 2.9, -D / 2 + 0.56);
    this.root.add(board);

    // Lounge: round table + chairs, plants.
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 24), flat('#e3a868'));
    table.position.set(11, 0.8, 7);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8), flat('#555'));
    leg.position.set(11, 0.4, 7);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 40), flat('#3bb8a8', { side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(11, 0.06, 7);
    this.root.add(table, leg, ring);
    for (const [px, pz] of [[-13.5, -9.5], [13.5, -9.5], [-13.5, 9.5]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 10), flat('#c0623b'));
      pot.position.set(px, 0.35, pz);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), flat('#5fae58', { flatShading: true }));
      leaves.position.set(px, 1.3, pz);
      this.root.add(pot, leaves);
    }
  }

  private outside() {
    // Neighbouring facades seen through the glass, like the reference office.
    OUTSIDE.forEach((c, i) => {
      const d = decorBuilding(6, 6, 6 + (i % 3) * 2, c, '#7d6b5d', i);
      d.position.set(-21 + i * 7, -8, -20);
      this.root.add(d);
    });
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        const d = decorBuilding(6, 6, 7 + (i % 2) * 3, OUTSIDE[(i * 3 + (side > 0 ? 1 : 0)) % OUTSIDE.length], '#7d6b5d', i + 3);
        d.position.set(side * 22, -8, -12 + i * 8);
        this.root.add(d);
      }
    }
  }

  private vacantSign() {
    const text = this.f.rent ? `Floor for rent · $${this.f.rent}/mo` : 'Available floor';
    const sign = label([{ tag: 'b', text: `L${this.f.level} · ${text}` }, { tag: 'span', text: 'No agents yet' }], 'vacant-sign');
    sign.position.set(0, 2, 2);
    this.root.add(sign);
  }

  private layoutDesks() {
    const agents = this.f.agents;
    // Humans and leadership go in the corner zone; everyone else in the team pit, up to 4 per row.
    const lead = agents.filter(a => a.kind === 'human' || a.role === 'CEO');
    const team = agents.filter(a => !lead.includes(a));
    lead.forEach((a, i) => this.desk(a, -11.5 + i * 4.2, -4.5 - (i % 2) * 1.2));
    team.forEach((a, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      const perRow = Math.min(4, team.length - row * 4);
      this.desk(a, 4 + (col - (perRow - 1) / 2) * 4.6, -2 + row * 5);
    });
  }

  private desk(a: Agent, x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.3), flat('#d4955a'));
    top.position.y = 0.95;
    top.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 1.1), flat('#cfd4d9'));
    cab.position.set(0.9, 0.45, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.1), flat('#555'));
    legL.position.set(-1.2, 0.45, 0);
    g.add(top, cab, legL);

    // Monitor faces the agent, who sits on the camera side.
    const c = document.createElement('canvas');
    c.width = 256; c.height = 150;
    const screen = new THREE.CanvasTexture(c);
    screen.colorSpace = THREE.SRGBColorSpace;
    const mon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.08), [flat('#222'), flat('#222'), flat('#222'), flat('#222'), new THREE.MeshBasicMaterial({ map: screen }), flat('#222')]);
    mon.position.set(-0.2, 1.6, -0.35);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), flat('#333'));
    stand.position.set(-0.2, 1.15, -0.35);
    g.add(mon, stand);

    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), flat('#2f3640'));
    chair.position.set(-0.2, 0.55, 1.05);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.1), flat('#2f3640'));
    back.position.set(-0.2, 1.0, 1.45);
    g.add(chair, back);

    // Avatar: humans in warm tones, AI agents in cool tones (matches the legend).
    const shirt = a.kind === 'human' ? '#f2b33d' : '#4aa8d8';
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), flat(shirt));
    body.position.set(-0.2, 1.05, 1.0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), flat('#e0b48f'));
    head.position.set(-0.2, 1.7, 1.0);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(a.kind === 'human' ? '#3b2a20' : '#1e3a5f'));
    hair.position.copy(head.position).y += 0.03;
    hair.rotation.x = -0.3;
    body.castShadow = head.castShadow = true;
    g.add(body, head, hair);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: STATUS_COLOR[a.status], side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-0.2, 0.07, 1.0);
    g.add(ring);

    // Agent names on rented floors come from the business name a person typed, so they are set as text.
    const tag = label(
      [{ tag: 'i', cls: 'dot' }, { tag: 'b', text: a.name }, { tag: 'span', cls: 'role', text: a.role }],
      `agent-tag kind-${a.kind}`, () => this.onAgent(a.id));
    tag.position.set(-0.2, 2.6, 0.4);
    g.add(tag);

    const hit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.2, 0.5);
    g.add(hit);
    g.userData = { pick: true, agentId: a.id };
    this.deskPos.set(a.id, new THREE.Vector3(x, 0, z));
    this.pickables.push(g);
    this.root.add(g);

    this.desks.push({ agent: a, head, ring, screen, screenCtx: c.getContext('2d')!, tag: tag.element, phase: Math.random() * 6 });
  }

  /** Redraw status rings, screens and the task board from sim state. */
  refresh() {
    for (const d of this.desks) {
      const a = d.agent;
      (d.ring.material as THREE.MeshBasicMaterial).color.set(STATUS_COLOR[a.status]);
      d.tag.dataset.status = a.status;
      d.tag.classList.toggle('selected', a.id === this.selected);
      const g = d.screenCtx;
      g.fillStyle = a.status === 'needs-you' ? '#3a1414' : '#0f1720';
      g.fillRect(0, 0, 256, 150);
      g.fillStyle = '#7dd3fc';
      g.font = 'bold 18px system-ui';
      g.fillText(a.kind === 'human' ? a.name : `${a.name} · AI`, 10, 26);
      g.fillStyle = '#e5e7eb';
      g.font = '15px system-ui';
      wrap(g, a.current?.title ?? (a.status === 'working' ? 'Working…' : 'Waiting for next task'), 10, 54, 236, 19, 4);
      d.screen.needsUpdate = true;
    }
    this.drawBoard();
    this.drawScreens();
  }

  private drawBoard() {
    if (!this.board) return;
    const { ctx: g, tex } = this.board;
    g.fillStyle = '#121a24';
    g.fillRect(0, 0, 1024, 440);
    g.fillStyle = '#f5b335';
    g.font = 'bold 30px system-ui';
    g.fillText(`TASK BOARD · ${this.b.short.toUpperCase()} · L${this.f.level}`, 28, 50);
    g.fillStyle = '#9fb3c8';
    g.font = '20px system-ui';
    g.fillText(this.f.name, 28, 80);
    const cols = this.f.agents.slice(0, 8);
    const cw = cols.length ? (1024 - 40) / cols.length : 0;
    cols.forEach((a, i) => {
      const x = 20 + i * cw;
      g.fillStyle = '#1d2733';
      g.fillRect(x + 4, 100, cw - 8, 320);
      g.fillStyle = STATUS_COLOR[a.status];
      g.fillRect(x + 4, 100, cw - 8, 6);
      g.fillStyle = '#fff';
      g.font = 'bold 20px system-ui';
      g.fillText(a.name.slice(0, 12), x + 12, 136);
      g.fillStyle = '#9fb3c8';
      g.font = '16px system-ui';
      g.fillText(a.role, x + 12, 158);
      g.fillStyle = '#e5e7eb';
      wrap(g, a.current?.title ?? '—', x + 12, 192, cw - 24, 20, 8);
      g.fillStyle = '#6ee7b7';
      g.fillText(`✓ ${a.done} done`, x + 12, 404);
    });
    if (!cols.length) {
      g.fillStyle = '#9fb3c8';
      g.font = '26px system-ui';
      g.fillText(this.f.rent ? `Available to rent — $${this.f.rent}/mo` : 'Available floor', 28, 200);
    }
    tex.needsUpdate = true;
  }

  update(_dt: number, t: number) {
    for (const d of this.desks) {
      const working = d.agent.status === 'working';
      d.head.position.y = 1.7 + (working ? Math.sin(t * 6 + d.phase) * 0.03 : 0);
      if (d.agent.status === 'needs-you') d.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
      else d.ring.scale.setScalar(1);
    }
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) {
      g.fillText(line, x, y + n * lh);
      if (++n >= maxLines) return;
      line = w;
    } else line = test;
  }
  if (line) g.fillText(line, x, y + n * lh);
}
