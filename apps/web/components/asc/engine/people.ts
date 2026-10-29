// @ts-nocheck
// People: one builder for office staff and city pedestrians.
// Ported unchanged from the AutoSalesCity design file (three r160 code, runs on the app's three). Everything is
// generated in code: no model, texture or image downloads.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const P3 = (() => {
  // Fast Sales virtual office: stylised people (original characters, built from simple shapes).
  // One builder for everyone: office staff (detailed) and city pedestrians (light).

  const geoCache = new Map();
  const G = (key, make) => {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  };
  const matCache = new Map();
  const M = (color, rough = 0.75) => {
    const k = color + '|' + rough;
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
    return matCache.get(k);
  };

  const SKIN = ['#f1c7a5', '#e0ac85', '#c98e66', '#a86f4c', '#8a5536', '#f5d3b8'];
  const HAIR = ['#1d1612', '#3a2618', '#5b3a22', '#8a5a2b', '#c99a5b', '#2a2a2e', '#6b2f1f'];

  /**
   * makePerson({ gender: 'm'|'f', skin, hair, hairStyle, top, accent, bottom, shoes, jacket, tie, glasses, detail })
   * returns { g, head, torso, arms:[{sh, el}], legs:[{hip, knee}], pose(name), animate(t, mode, k) }
   */
  function makePerson(o = {}) {
    const f = o.gender === 'f';
    const detail = o.detail !== false;
    const seg = detail ? 14 : 7;
    const skin = M(o.skin || SKIN[0], 0.6);
    const hairM = M(o.hair || HAIR[0], 0.85);
    const top = M(o.top || (f ? '#e86a5a' : '#2c3e66'), 0.7);
    const accent = M(o.accent || '#ffffff', 0.6);
    const bottom = M(o.bottom || '#2b2f3a', 0.8);
    const shoes = M(o.shoes || '#1c1c20', 0.5);

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body); // everything above the hips (bobs while walking)
    const hipY = 0.92;

    // torso
    const tw = f ? 0.4 : 0.48,
      th = f ? 0.52 : 0.56,
      td = f ? 0.24 : 0.27;
    const torso = new THREE.Mesh(
      G(`torso${tw}${th}${td}${detail}`, () => new RoundedBoxGeometry(tw, th, td, detail ? 3 : 1, 0.1)),
      top,
    );
    torso.position.y = hipY + th / 2 + 0.02;
    body.add(torso);
    if (f) {
      // waist / skirt or trousers top
      const waist = new THREE.Mesh(
        G(`waist${detail}`, () => new RoundedBoxGeometry(0.36, 0.14, 0.22, detail ? 2 : 1, 0.06)),
        o.skirt ? bottom : top,
      );
      waist.position.y = hipY + 0.04;
      body.add(waist);
    }
    if (detail) {
      // shirt / collar "V" and optional tie
      const v = new THREE.Mesh(
        G('vneck', () => new THREE.CircleGeometry(0.075, 3)),
        accent,
      );
      v.position.set(0, torso.position.y + th / 2 - 0.08, td / 2 + 0.003);
      v.rotation.z = Math.PI;
      v.scale.set(1, 1.6, 1);
      body.add(v);
      if (o.tie) {
        const tie = new THREE.Mesh(
          G('tie', () => new THREE.BoxGeometry(0.045, 0.24, 0.015)),
          M(o.tie, 0.5),
        );
        tie.position.set(0, torso.position.y + 0.06, td / 2 + 0.01);
        body.add(tie);
      }
      if (o.jacket) {
        // open jacket lapels
        [-1, 1].forEach(s => {
          const lap = new THREE.Mesh(
            G('lapel', () => new THREE.BoxGeometry(0.11, 0.42, 0.02)),
            M(o.jacket, 0.7),
          );
          lap.position.set(s * 0.1, torso.position.y - 0.02, td / 2 + 0.006);
          lap.rotation.z = s * 0.18;
          body.add(lap);
        });
      }
    }

    // neck + head
    const neck = new THREE.Mesh(
      G(`neck${seg}`, () => new THREE.CylinderGeometry(0.06, 0.07, 0.12, seg)),
      skin,
    );
    neck.position.y = torso.position.y + th / 2 + 0.03;
    body.add(neck);
    const head = new THREE.Group();
    head.position.y = neck.position.y + 0.17;
    body.add(head);
    const skull = new THREE.Mesh(
      G(`skull${seg}`, () => new THREE.SphereGeometry(0.17, seg + 4, seg + 2)),
      skin,
    );
    skull.scale.set(f ? 0.92 : 0.96, 1.08, 1);
    head.add(skull);
    if (detail) {
      const dark = M('#1b1b22', 0.4);
      [-1, 1].forEach(s => {
        const eye = new THREE.Mesh(
          G('eye', () => new THREE.SphereGeometry(0.021, 10, 8)),
          dark,
        );
        eye.position.set(s * 0.058, 0.02, 0.152);
        eye.scale.set(1, f ? 1.25 : 1.05, 0.6);
        head.add(eye);
        const white = new THREE.Mesh(
          G('eyew', () => new THREE.SphereGeometry(0.008, 6, 6)),
          M('#ffffff', 0.3),
        );
        white.position.set(s * 0.058 + 0.007, 0.03, 0.163);
        head.add(white);
        const brow = new THREE.Mesh(
          G('brow', () => new THREE.BoxGeometry(0.05, f ? 0.009 : 0.014, 0.01)),
          hairM,
        );
        brow.position.set(s * 0.06, 0.068, 0.155);
        brow.rotation.z = s * (f ? -0.12 : -0.06);
        head.add(brow);
        const ear = new THREE.Mesh(
          G('ear', () => new THREE.SphereGeometry(0.032, 8, 6)),
          skin,
        );
        ear.position.set(s * 0.158, 0.0, 0);
        ear.scale.set(0.5, 1, 0.8);
        head.add(ear);
      });
      const nose = new THREE.Mesh(
        G('nose', () => new THREE.SphereGeometry(0.024, 8, 6)),
        M(shade(o.skin || SKIN[0], -0.08), 0.6),
      );
      nose.position.set(0, -0.012, 0.166);
      nose.scale.set(0.8, 1, 0.9);
      head.add(nose);
      const mouth = new THREE.Mesh(
        G('mouth', () => new THREE.BoxGeometry(0.06, 0.012, 0.01)),
        M(f ? '#b4485a' : '#8a4a40', 0.5),
      );
      mouth.position.set(0, -0.07, 0.152);
      head.add(mouth);
      if (o.beard) {
        const b = new THREE.Mesh(
          G(
            `beard${seg}`,
            () => new THREE.SphereGeometry(0.168, seg + 4, seg, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.35),
          ),
          hairM,
        );
        b.scale.set(0.97, 1.08, 1.02);
        head.add(b);
      }
      if (o.glasses) {
        const fr = M('#20232a', 0.3);
        [-1, 1].forEach(s => {
          const r = new THREE.Mesh(
            G('lens', () => new THREE.TorusGeometry(0.03, 0.006, 6, 16)),
            fr,
          );
          r.position.set(s * 0.058, 0.02, 0.168);
          head.add(r);
        });
        const br = new THREE.Mesh(
          G('bridge', () => new THREE.BoxGeometry(0.05, 0.006, 0.006)),
          fr,
        );
        br.position.set(0, 0.025, 0.17);
        head.add(br);
      }
    }
    hairdo(head, f, o.hairStyle, hairM, seg, detail);

    // arms (pivot at shoulder, then elbow)
    const arms = [];
    [-1, 1].forEach(s => {
      const sh = new THREE.Group();
      sh.position.set(s * (tw / 2 + 0.035), torso.position.y + th / 2 - 0.07, 0);
      body.add(sh);
      const upper = new THREE.Mesh(
        G(`uarm${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.048 : 0.058, 0.22, 3, seg)),
        top,
      );
      upper.position.y = -0.14;
      sh.add(upper);
      const el = new THREE.Group();
      el.position.y = -0.28;
      sh.add(el);
      const fore = new THREE.Mesh(
        G(`farm${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.042 : 0.05, 0.2, 3, seg)),
        o.sleeves === 'short' ? skin : top,
      );
      fore.position.y = -0.13;
      el.add(fore);
      const hand = new THREE.Mesh(
        G(`hand${seg}`, () => new THREE.SphereGeometry(0.052, seg, seg - 2)),
        skin,
      );
      hand.position.y = -0.29;
      hand.scale.set(0.8, 1.1, 0.7);
      el.add(hand);
      arms.push({ sh, el });
    });

    // legs (pivot at hip, then knee)
    const legs = [];
    [-1, 1].forEach(s => {
      const hip = new THREE.Group();
      hip.position.set(s * (f ? 0.095 : 0.11), hipY, 0);
      g.add(hip);
      const thigh = new THREE.Mesh(
        G(`thigh${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.075 : 0.085, 0.3, 3, seg)),
        o.skirt ? skin : bottom,
      );
      thigh.position.y = -0.22;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      const shin = new THREE.Mesh(
        G(`shin${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.06 : 0.07, 0.3, 3, seg)),
        o.skirt ? skin : bottom,
      );
      shin.position.y = -0.2;
      knee.add(shin);
      const shoe = new THREE.Mesh(
        G(
          `shoe${f}${detail}`,
          () => new RoundedBoxGeometry(f ? 0.1 : 0.12, 0.08, f ? 0.22 : 0.25, detail ? 2 : 1, 0.035),
        ),
        shoes,
      );
      shoe.position.set(0, -0.42, 0.05);
      knee.add(shoe);
      legs.push({ hip, knee });
    });
    if (o.skirt) {
      const sk = new THREE.Mesh(
        G(`skirt${seg}`, () => new THREE.CylinderGeometry(0.2, 0.27, 0.36, seg, 1, true)),
        bottom,
      );
      sk.position.y = hipY - 0.14;
      g.add(sk);
      sk.material.side = THREE.DoubleSide;
    }

    g.traverse(m => {
      if (m.isMesh) {
        m.castShadow = detail;
        m.receiveShadow = false;
      }
    });

    const P = { g, body, head, torso, arms, legs, mode: 'stand' };
    P.pose = name => {
      P.mode = name;
      if (name === 'sit') {
        legs.forEach(l => {
          l.hip.rotation.x = -1.5;
          l.knee.rotation.x = 1.5;
        });
        body.position.y = -0.38;
        legs.forEach(l => {
          l.hip.position.y = hipY - 0.38;
        });
      } else {
        legs.forEach(l => {
          l.hip.rotation.x = 0;
          l.knee.rotation.x = 0;
          l.hip.position.y = hipY;
        });
        body.position.y = 0;
      }
    };
    /** mode: 'type' | 'idle' | 'walk' | 'talk' | 'wave'; k = phase offset */
    P.animate = (t, mode, k = 0) => {
      const [aL, aR] = arms,
        [lL, lR] = legs;
      if (mode === 'walk') {
        const s = Math.sin(t * 7 + k);
        lL.hip.rotation.x = s * 0.5;
        lR.hip.rotation.x = -s * 0.5;
        lL.knee.rotation.x = Math.max(0, -s) * 0.7;
        lR.knee.rotation.x = Math.max(0, s) * 0.7;
        aL.sh.rotation.x = -s * 0.45;
        aR.sh.rotation.x = s * 0.45;
        aL.el.rotation.x = -0.25;
        aR.el.rotation.x = -0.25;
        aL.sh.rotation.z = -0.06;
        aR.sh.rotation.z = 0.06;
        body.position.y = Math.abs(Math.cos(t * 7 + k)) * 0.035;
        head.rotation.y = Math.sin(t * 0.7 + k) * 0.15;
        return;
      }
      if (mode === 'type') {
        aL.sh.rotation.x = -0.55 + Math.sin(t * 13 + k) * 0.05;
        aR.sh.rotation.x = -0.55 + Math.sin(t * 13 + k + 1.9) * 0.05;
        aL.el.rotation.x = -1.05;
        aR.el.rotation.x = -1.05;
        aL.sh.rotation.z = 0.12;
        aR.sh.rotation.z = -0.12;
        head.rotation.x = 0.12 + Math.sin(t * 0.9 + k) * 0.03;
        head.rotation.y = Math.sin(t * 0.5 + k) * 0.12;
        body.rotation.y = 0;
        return;
      }
      if (mode === 'talk' || mode === 'wave') {
        aL.sh.rotation.x = -0.3;
        aL.el.rotation.x = -0.9 + Math.sin(t * 3 + k) * 0.25;
        aR.sh.rotation.x = mode === 'wave' ? -2.6 : -0.45;
        aR.el.rotation.x = mode === 'wave' ? Math.sin(t * 8) * 0.4 : -1.1 + Math.sin(t * 2.4 + k) * 0.3;
        aR.sh.rotation.z = mode === 'wave' ? -0.3 : 0;
        head.rotation.y = Math.sin(t * 1.3 + k) * 0.25;
        head.rotation.x = Math.sin(t * 2.6 + k) * 0.05;
        return;
      }
      // idle: relaxed arms, gentle breathing, looking around
      aL.sh.rotation.set(P.mode === 'sit' ? -0.5 : 0.05, 0, 0.06);
      aR.sh.rotation.set(P.mode === 'sit' ? -0.5 : 0.05, 0, -0.06);
      aL.el.rotation.x = P.mode === 'sit' ? -0.9 : -0.12;
      aR.el.rotation.x = P.mode === 'sit' ? -0.9 : -0.12;
      torso.scale.y = 1 + Math.sin(t * 1.6 + k) * 0.012;
      head.rotation.y = Math.sin(t * 0.45 + k) * 0.45;
      head.rotation.x = Math.sin(t * 0.3 + k) * 0.06;
    };
    P.pose('stand');
    return P;
  }

  function hairdo(head, f, style, mat, seg, detail) {
    const add = (geo, pos, scale, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      if (rot) m.rotation.set(...rot);
      head.add(m);
      return m;
    };
    const cap = G(`hcap${seg}`, () => new THREE.SphereGeometry(0.182, seg + 4, seg, 0, Math.PI * 2, 0, Math.PI * 0.52));
    if (!f) {
      const s = style || 'side';
      add(cap, [0, 0.02, -0.005], [1, 1.05, 1.04], [-0.12, 0, 0]);
      if (s === 'side' || s === 'quiff') {
        // swept fringe
        add(
          G(`quiff${seg}`, () => new THREE.SphereGeometry(0.1, seg, seg - 2)),
          [s === 'side' ? -0.04 : 0, 0.14, 0.09],
          [s === 'side' ? 1.5 : 1.2, 0.55, 0.8],
          [0.3, 0, s === 'side' ? 0.25 : 0],
        );
      }
      if (s === 'buzz') add(cap, [0, 0.0, 0], [1.02, 1.0, 1.02], [-0.3, 0, 0]);
      if (detail)
        [-1, 1].forEach(k =>
          add(
            G('sideburn', () => new THREE.BoxGeometry(0.03, 0.08, 0.06)),
            [k * 0.16, 0.03, 0.03],
          ),
        );
      return;
    }
    const s = style || 'long';
    add(cap, [0, 0.025, -0.005], [1.04, 1.08, 1.08], [-0.15, 0, 0]);
    add(
      G(`fringe${seg}`, () => new THREE.SphereGeometry(0.11, seg, seg - 2)),
      [0.03, 0.13, 0.1],
      [1.45, 0.45, 0.7],
      [0.45, 0, -0.2],
    );
    if (s === 'long') {
      add(
        G(`hlong${seg}`, () => new THREE.CapsuleGeometry(0.15, 0.24, 3, seg)),
        [0, -0.1, -0.06],
        [1.15, 1, 0.72],
      );
      [-1, 1].forEach(k =>
        add(
          G(`hside${seg}`, () => new THREE.CapsuleGeometry(0.05, 0.22, 3, seg)),
          [k * 0.15, -0.08, 0.02],
        ),
      );
    } else if (s === 'bob') {
      add(
        G(`hbob${seg}`, () => new THREE.SphereGeometry(0.2, seg + 2, seg)),
        [0, -0.02, -0.02],
        [1.02, 0.85, 1.0],
      );
    } else if (s === 'bun') {
      add(
        G(`hbun${seg}`, () => new THREE.SphereGeometry(0.075, seg, seg - 2)),
        [0, 0.17, -0.12],
      );
    } else if (s === 'pony') {
      add(
        G(`hpony${seg}`, () => new THREE.CapsuleGeometry(0.055, 0.22, 3, seg)),
        [0, -0.03, -0.2],
        null,
        [0.35, 0, 0],
      );
    }
  }

  function shade(hex, amt) {
    const c = new THREE.Color(hex);
    const h = {};
    c.getHSL(h);
    c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt)));
    return '#' + c.getHexString();
  }

  return { makePerson, SKIN, HAIR };
})();
