import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { setNightGlow } from './meshes';
import { skyTexture } from './textures';

export interface View {
  root: THREE.Group;
  /** Meshes the pointer can hit; each carries routing info in userData. */
  pickables: THREE.Object3D[];
  home(camera: THREE.PerspectiveCamera, controls: OrbitControls): void;
  update(dt: number, t: number): void;
  hover?(obj: THREE.Object3D | undefined): void;
  setNight?(night: boolean): void;
}

/** One piece of a 3D label. Text is always set as text, never parsed as HTML (names can come from users). */
export interface LabelPart { tag: 'b' | 'span' | 'i'; text?: string; cls?: string; hidden?: boolean }

export function label(parts: LabelPart[], className: string, onClick?: () => void) {
  const el = document.createElement('div');
  el.className = className;
  for (const p of parts) {
    const child = document.createElement(p.tag);
    if (p.cls) child.className = p.cls;
    if (p.text !== undefined) child.textContent = p.text;
    if (p.hidden) child.style.display = 'none';
    el.append(child);
  }
  if (onClick) {
    el.style.pointerEvents = 'auto';
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  }
  return new CSS2DObject(el);
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  controls: OrbitControls;
  view?: View;
  night = false;
  onPick?: (obj: THREE.Object3D) => void;

  private hemi = new THREE.HemisphereLight('#ffffff', '#b5a48a', 1.6);
  private sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  private clock = new THREE.Clock();
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private downAt = new THREE.Vector2();

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.append(this.renderer.domElement, this.labels.domElement);
    this.labels.domElement.className = 'label-layer';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;

    this.sun.position.set(40, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 250 });
    this.scene.add(this.hemi, this.sun);
    this.setNight(false);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.bindPointer();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setView(v: View) {
    if (this.view) {
      // CSS2D labels only remove their DOM node when they themselves are detached.
      this.view.root.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
      this.scene.remove(this.view.root);
    }
    this.view = v;
    this.scene.add(v.root);
    v.setNight?.(this.night);
    v.home(this.camera, this.controls);
  }

  setNight(night: boolean) {
    this.night = night;
    // Gradient sky: deep blue overhead fading to a hazy horizon that the fog blends into.
    const [top, horizon] = night ? ['#050a1f', '#1b2a55'] : ['#5aa9e6', '#d6ecfa'];
    this.scene.background = skyTexture(top, horizon);
    this.scene.fog = new THREE.Fog(horizon, 130, 280);
    this.hemi.intensity = night ? 0.35 : 1.6;
    this.sun.intensity = night ? 0.25 : 2.2;
    this.sun.color.set(night ? '#8fa6ff' : '#fff4e0');
    setNightGlow(night);
    this.view?.setNight?.(night);
  }

  /** Camera pad: rotate around target, dolly, pan forward/back. */
  nudge(kind: 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'home') {
    const c = this.camera, t = this.controls.target;
    const off = c.position.clone().sub(t);
    if (kind === 'home') return this.view?.home(c, this.controls);
    if (kind === 'in' || kind === 'out') off.multiplyScalar(kind === 'in' ? 0.8 : 1.25);
    if (kind === 'left' || kind === 'right') off.applyAxisAngle(new THREE.Vector3(0, 1, 0), kind === 'left' ? 0.35 : -0.35);
    if (kind === 'up' || kind === 'down') {
      const fwd = off.clone().setY(0).normalize().multiplyScalar(kind === 'up' ? -off.length() * 0.15 : off.length() * 0.15);
      t.add(fwd);
    }
    c.position.copy(t).add(off);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private hit(e: PointerEvent) {
    if (!this.view) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    let o: THREE.Object3D | null = this.ray.intersectObjects(this.view.pickables, true)[0]?.object ?? null;
    while (o && !o.userData.pick) o = o.parent;
    return o ?? undefined;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', e => {
      const o = this.hit(e);
      el.style.cursor = o ? 'pointer' : 'grab';
      this.view?.hover?.(o);
    });
    el.addEventListener('pointerdown', e => this.downAt.set(e.clientX, e.clientY));
    el.addEventListener('pointerup', e => {
      if (this.downAt.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5) return; // was a drag
      const o = this.hit(e);
      if (o) this.onPick?.(o);
    });
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.view?.update(dt, this.clock.elapsedTime);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
