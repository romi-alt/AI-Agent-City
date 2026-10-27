import * as THREE from 'three';

/**
 * Small glowing points (navigation lights, strobes, roof beacons) that keep a fixed pixel size at any distance, so
 * a wingtip light 400 units away still reads as a light. One draw call per set.
 */
export class LightPoints {
  readonly points: THREE.Points;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private c = new THREE.Color();
  private n = 0;

  constructor(capacity: number, pixelRatio: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aSize', this.size);
    const m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: pixelRatio } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uPixelRatio;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (aColor.a > 0.003 ? 1.0 : 0.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          // A hot centre with a soft halo.
          float halo = pow(smoothstep(1.0, 0.0, r), 1.6);
          float core = smoothstep(0.4, 0.0, r);
          float a = vColor.a * min(1.0, halo * 0.75 + core);
          if (a < 0.003) discard;
          gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), core * 0.5) * a, a);
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  begin() {
    this.n = 0;
  }

  push(x: number, y: number, z: number, color: string, alpha: number, sizePx: number) {
    if (this.n >= this.size.count || alpha <= 0.003) return;
    this.pos.setXYZ(this.n, x, y, z);
    this.c.set(color);
    this.col.setXYZW(this.n, this.c.r, this.c.g, this.c.b, Math.min(1, alpha));
    this.size.setX(this.n, sizePx);
    this.n++;
  }

  end() {
    this.points.geometry.setDrawRange(0, this.n);
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.size.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
