// @ts-nocheck
// People: one builder for office staff and city pedestrians.
// Ported from the AutoSalesCity design file (three r160 code, runs on the app's three) and extended for the HQ floor:
// richer faces (irises, lashes, lips, blush, freckles), ten more hairstyles, outfits (blazer, cardigan, hoodie, vest,
// polo, turtleneck), accessories (lanyard and badge, headset, earrings, watch, scarf, glasses styles), sleeve and shoe
// variety and idle micro-animations (sip, look at the screen, phone, stretch, think, chat). Everything is generated in
// code: no model, texture or image downloads. The extras are opt-in (`rich`) so city pedestrians stay cheap.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  const MM = (color, rough = 0.35, metal = 0.8) => {
    const k = color + '|' + rough + '|m' + metal;
    if (!matCache.has(k))
      matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    return matCache.get(k);
  };

  const SKIN = ['#f1c7a5', '#e0ac85', '#c98e66', '#a86f4c', '#8a5536', '#f5d3b8'];
  const HAIR = ['#1d1612', '#3a2618', '#5b3a22', '#8a5a2b', '#c99a5b', '#2a2a2e', '#6b2f1f'];

  /**
   * makePerson({ gender: 'm'|'f', skin, hair, hairStyle, top, accent, bottom, shoes, jacket, tie, glasses, detail,
   *   rich, outfit, sleeves, shoeStyle, eyes, lipColor, beard, stache, stubble, freckles, lanyard, headset, earrings,
   *   watch, scarf, necklace, headband, streak, height, build })
   * returns { g, head, torso, arms:[{sh, el}], legs:[{hip, knee}], pose(name), animate(t, mode, k), hold(name) }
   */
  function makePerson(o = {}) {
    const f = o.gender === 'f';
    const detail = o.detail !== false;
    const rich = detail && o.rich !== false && !!(o.rich || o.outfit || o.lanyard || o.eyes || o.headset);
    const seg = detail ? 14 : 7;
    const skin = M(o.skin || SKIN[0], 0.6);
    const hairM = M(o.hair || HAIR[0], 0.85);
    const top = M(o.top || (f ? '#e86a5a' : '#2c3e66'), 0.7);
    const accent = M(o.accent || '#ffffff', 0.6);
    const bottom = M(o.bottom || '#2b2f3a', 0.8);
    const shoes = M(o.shoes || '#1c1c20', 0.5);
    const sleeves = o.sleeves || 'long';

    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body); // everything above the hips (bobs while walking)
    const hipY = 0.92;

    // torso
    const bw = o.build === 'broad' ? 1.1 : o.build === 'slim' ? 0.92 : 1;
    const tw = (f ? 0.4 : 0.48) * bw,
      th = f ? 0.52 : 0.56,
      td = f ? 0.24 : 0.27;
    const torso = new THREE.Mesh(
      G(`torso${tw}${th}${td}${detail}`, () => new RoundedBoxGeometry(tw, th, td, detail ? 3 : 1, 0.1)),
      top,
    );
    torso.position.y = hipY + th / 2 + 0.02;
    body.add(torso);
    torso.userData.keep = true; // it breathes
    if (f) {
      // waist / skirt or trousers top
      const waist = new THREE.Mesh(
        G(`waist${detail}`, () => new RoundedBoxGeometry(0.36, 0.14, 0.22, detail ? 2 : 1, 0.06)),
        o.skirt ? bottom : top,
      );
      waist.position.y = hipY + 0.04;
      body.add(waist);
    }
    const front = td / 2;
    const tTop = torso.position.y + th / 2;
    if (detail) {
      // shirt / collar "V" and optional tie
      const v = new THREE.Mesh(
        G('vneck', () => new THREE.CircleGeometry(0.075, 3)),
        accent,
      );
      v.position.set(0, tTop - 0.08, front + 0.003);
      v.rotation.z = Math.PI;
      v.scale.set(1, 1.6, 1);
      body.add(v);
      if (o.tie) {
        const tie = new THREE.Mesh(
          G('tie', () => new THREE.BoxGeometry(0.045, 0.24, 0.015)),
          M(o.tie, 0.5),
        );
        tie.position.set(0, torso.position.y + 0.06, front + 0.01);
        body.add(tie);
        if (rich) {
          const knot = new THREE.Mesh(
            G('tieknot', () => new THREE.BoxGeometry(0.058, 0.04, 0.02)),
            M(o.tie, 0.5),
          );
          knot.position.set(0, tTop - 0.06, front + 0.012);
          body.add(knot);
        }
      }
      if (o.jacket) {
        // open jacket lapels
        [-1, 1].forEach(s => {
          const lap = new THREE.Mesh(
            G('lapel', () => new THREE.BoxGeometry(0.11, 0.42, 0.02)),
            M(o.jacket, 0.7),
          );
          lap.position.set(s * 0.1, torso.position.y - 0.02, front + 0.006);
          lap.rotation.z = s * 0.18;
          body.add(lap);
        });
        if (rich) {
          // pocket square, jacket hem and shirt collar points
          const sq = new THREE.Mesh(
            G('psq', () => new THREE.BoxGeometry(0.05, 0.025, 0.012)),
            M(o.accent && o.accent !== '#ffffff' ? o.accent : o.tie || '#ffffff', 0.6),
          );
          sq.position.set(0.13, torso.position.y + 0.08, front + 0.02);
          body.add(sq);
          [-1, 1].forEach(s => {
            const col = new THREE.Mesh(
              G('collar', () => new THREE.BoxGeometry(0.06, 0.04, 0.012)),
              M('#ffffff', 0.6),
            );
            col.position.set(s * 0.05, tTop - 0.045, front + 0.016);
            col.rotation.z = s * -0.6;
            body.add(col);
          });
        }
      }
    }
    if (rich) buildOutfit(o, body, torso, th, tw, td, f, top, accent, bottom, hipY);

    // neck + head
    const neck = new THREE.Mesh(
      G(`neck${seg}`, () => new THREE.CylinderGeometry(0.06, 0.07, 0.12, seg)),
      skin,
    );
    neck.position.y = tTop + 0.03;
    body.add(neck);
    if (rich && o.outfit === 'turtleneck') {
      const tn = new THREE.Mesh(
        G('turtle', () => new THREE.CylinderGeometry(0.078, 0.086, 0.12, 12)),
        top,
      );
      tn.position.y = neck.position.y + 0.01;
      body.add(tn);
    }
    const head = new THREE.Group();
    head.position.y = neck.position.y + 0.17;
    body.add(head);
    const skull = new THREE.Mesh(
      G(`skull${seg}`, () => new THREE.SphereGeometry(0.17, seg + 4, seg + 2)),
      skin,
    );
    skull.scale.set(f ? 0.92 : 0.96, 1.08, 1);
    head.add(skull);
    if (detail) buildFace(o, head, f, skin, hairM, rich);
    hairdo(head, f, o.hairStyle, hairM, seg, detail, o);
    if (rich) buildHeadgear(o, head, f);

    // lanyard with a name badge (hangs over the outfit)
    if (rich && o.lanyard) {
      const strap = M(o.lanyard, 0.6);
      [-1, 1].forEach(s => {
        const st = new THREE.Mesh(
          G('lanyardStrap', () => new THREE.BoxGeometry(0.014, 0.3, 0.006)),
          strap,
        );
        st.position.set(s * 0.045, tTop - 0.14, front + 0.024);
        st.rotation.z = s * 0.2;
        body.add(st);
      });
      const card = new THREE.Mesh(
        G('badge', () => new RoundedBoxGeometry(0.085, 0.115, 0.012, 1, 0.01)),
        M('#ffffff', 0.5),
      );
      card.position.set(0, torso.position.y - 0.06, front + 0.03);
      body.add(card);
      const band = new THREE.Mesh(
        G('badgeBand', () => new THREE.BoxGeometry(0.085, 0.03, 0.014)),
        strap,
      );
      band.position.set(0, torso.position.y - 0.02, front + 0.032);
      body.add(band);
      const photo = new THREE.Mesh(
        G('badgePhoto', () => new THREE.BoxGeometry(0.03, 0.034, 0.015)),
        M('#9aa3b2', 0.6),
      );
      photo.position.set(0, torso.position.y - 0.07, front + 0.033);
      body.add(photo);
    }

    // arms (pivot at shoulder, then elbow)
    const arms = [];
    [-1, 1].forEach(s => {
      const sh = new THREE.Group();
      sh.position.set(s * (tw / 2 + 0.035), torso.position.y + th / 2 - 0.07, 0);
      body.add(sh);
      const upper = new THREE.Mesh(
        G(`uarm${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.048 : 0.058, 0.22, 3, seg)),
        sleeves === 'short' && o.jacket ? top : top,
      );
      upper.position.y = -0.14;
      sh.add(upper);
      const el = new THREE.Group();
      el.position.y = -0.28;
      sh.add(el);
      const bare = sleeves === 'short' || sleeves === 'rolled' || sleeves === 'three';
      const fore = new THREE.Mesh(
        G(`farm${f}${seg}`, () => new THREE.CapsuleGeometry(f ? 0.042 : 0.05, 0.2, 3, seg)),
        bare ? skin : top,
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
      if (rich && (sleeves === 'rolled' || sleeves === 'three')) {
        // a folded cuff at the elbow
        const cuff = new THREE.Mesh(
          G(`cuff${f}`, () => new THREE.CylinderGeometry(f ? 0.056 : 0.066, f ? 0.056 : 0.066, 0.05, 12)),
          top,
        );
        cuff.position.y = -0.02;
        el.add(cuff);
      }
      if (rich && s === -1 && o.watch) {
        // watch on the left wrist
        const strap = new THREE.Mesh(
          G('wstrap', () => new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12)),
          M(o.watch === true ? '#2b2f38' : o.watch, 0.5),
        );
        strap.position.y = -0.24;
        el.add(strap);
        const face = new THREE.Mesh(
          G('wface', () => new THREE.BoxGeometry(0.05, 0.03, 0.012)),
          MM('#d7dbe0'),
        );
        face.position.set(0, -0.24, 0.046);
        el.add(face);
      }
      if (rich && s === 1 && o.bracelet) {
        const br = new THREE.Mesh(
          G('bracelet', () => new THREE.TorusGeometry(0.048, 0.007, 6, 14)),
          M(o.bracelet, 0.4),
        );
        br.rotation.x = Math.PI / 2;
        br.position.y = -0.24;
        el.add(br);
      }
      arms.push({ sh, el });
    });

    // legs (pivot at hip, then knee)
    const legs = [];
    const shoeStyle = o.shoeStyle || 'plain';
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
      if (rich) buildShoe(shoeStyle, o, knee, f, shoes);
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
    if (rich && !f && !o.skirt && (o.belt !== false || o.jacket)) {
      const belt = new THREE.Mesh(
        G('belt', () => new THREE.BoxGeometry(0.5, 0.03, 0.29)),
        M('#2a1d14', 0.5),
      );
      belt.position.y = hipY + 0.05;
      body.add(belt);
      const buckle = new THREE.Mesh(
        G('buckle', () => new THREE.BoxGeometry(0.04, 0.034, 0.01)),
        MM('#d9b45c', 0.3, 0.9),
      );
      buckle.position.set(0, hipY + 0.05, 0.15);
      body.add(buckle);
    }
    if (o.height) g.scale.setScalar(o.height);

    // things a person can hold: a coffee mug, a phone and a few papers (hidden until used)
    const hand = arms[1].el;
    const props = {};
    if (rich) {
      const mug = new THREE.Group();
      const cup = new THREE.Mesh(
        G('hmug', () => new THREE.CylinderGeometry(0.036, 0.03, 0.08, 12)),
        M(o.mugColor || '#ffffff', 0.5),
      );
      mug.add(cup);
      const band = new THREE.Mesh(
        G('hmugBand', () => new THREE.CylinderGeometry(0.0375, 0.0345, 0.026, 12)),
        M(o.mugBand || '#2b6cb0', 0.5),
      );
      band.position.y = 0.006;
      mug.add(band);
      const lid = new THREE.Mesh(
        G('hmugLid', () => new THREE.CylinderGeometry(0.038, 0.038, 0.012, 12)),
        M('#3a2c24', 0.5),
      );
      lid.position.y = 0.045;
      mug.add(lid);
      mug.position.set(0, -0.3, 0.07);
      mug.visible = false;
      mug.userData.keep = true;
      hand.add(mug);
      props.mug = mug;
      const phone = new THREE.Mesh(
        G('hphone', () => new RoundedBoxGeometry(0.05, 0.1, 0.01, 1, 0.006)),
        M('#16181d', 0.3),
      );
      phone.position.set(0, -0.31, 0.05);
      phone.visible = false;
      phone.userData.keep = true;
      hand.add(phone);
      props.phone = phone;
      const papers = new THREE.Mesh(
        G('hpapers', () => new THREE.BoxGeometry(0.16, 0.22, 0.01)),
        M('#fffdf7', 0.9),
      );
      papers.position.set(0, -0.31, 0.06);
      papers.visible = false;
      papers.userData.keep = true;
      hand.add(papers);
      props.papers = papers;
    }

    if (rich) mergeStatic(g); // a rich person is ~300 parts: merge the parts that never move relative to each other
    g.traverse(m => {
      if (m.isMesh) {
        m.castShadow = detail;
        m.receiveShadow = false;
      }
    });

    const P = { g, body, head, torso, arms, legs, mode: 'stand', props, rich, held: null };
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
    /** Put something in the right hand ('mug' | 'phone' | 'papers') or null to empty it. */
    P.hold = name => {
      P.held = name;
      for (const k in props) props[k].visible = k === name;
    };
    // smoothly move a joint towards a target (rich people blend between poses; pedestrians snap)
    const to = (obj, x, y, z, k = 0.14) => {
      const r = obj.rotation;
      if (!rich) {
        r.set(x ?? r.x, y ?? r.y, z ?? r.z);
        return;
      }
      if (x != null) r.x += (x - r.x) * k;
      if (y != null) r.y += (y - r.y) * k;
      if (z != null) r.z += (z - r.z) * k;
    };
    /** mode: 'type' | 'idle' | 'walk' | 'talk' | 'wave' | 'sip' | 'look' | 'phone' | 'stretch' | 'think' | 'read' | 'walkMug'; k = phase offset */
    P.animate = (t, mode, k = 0) => {
      const [aL, aR] = arms,
        [lL, lR] = legs;
      if (mode === 'walk' || mode === 'walkMug') {
        const s = Math.sin(t * 7 + k);
        lL.hip.rotation.x = s * 0.5;
        lR.hip.rotation.x = -s * 0.5;
        lL.knee.rotation.x = Math.max(0, -s) * 0.7;
        lR.knee.rotation.x = Math.max(0, s) * 0.7;
        aL.sh.rotation.x = -s * 0.45;
        aL.el.rotation.x = -0.25;
        aL.sh.rotation.z = -0.06;
        if (mode === 'walkMug') {
          // coffee in the right hand, held out in front
          to(aR.sh, -0.7, 0, 0.05, 0.3);
          to(aR.el, -1.5, 0, 0, 0.3);
          if (props.mug) props.mug.rotation.x = -(aR.sh.rotation.x + aR.el.rotation.x);
        } else {
          aR.sh.rotation.x = s * 0.45;
          aR.el.rotation.x = -0.25;
          aR.sh.rotation.z = 0.06;
        }
        body.position.y = Math.abs(Math.cos(t * 7 + k)) * 0.035;
        head.rotation.y = Math.sin(t * 0.7 + k) * 0.15;
        head.rotation.x = 0;
        return;
      }
      const seated = P.mode === 'sit';
      const mugUpright = () => {
        if (props.mug) props.mug.rotation.x = -(aR.sh.rotation.x + aR.el.rotation.x);
        if (props.phone) props.phone.rotation.x = -(aR.sh.rotation.x + aR.el.rotation.x) + 0.2;
      };
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
        if (rich) P.hold(null);
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
      if (mode === 'sip') {
        // lift a coffee cup to the mouth, tilt it, set it back down
        const c = (Math.sin(t * 0.9 + k) + 1) / 2; // 0..1 slow cycle
        const up = Math.min(1, c * 1.8);
        to(aL.sh, -0.55, 0, 0.12);
        to(aL.el, -1.05, 0, 0);
        to(aR.sh, -0.55 - up * 0.45, 0, -0.12 + up * 0.04, 0.2);
        to(aR.el, -1.05 - up * 1.2, 0, 0, 0.2);
        to(head, 0.12 - up * 0.2, Math.sin(t * 0.5 + k) * 0.1, 0);
        P.hold('mug');
        mugUpright();
        return;
      }
      if (mode === 'phone') {
        // phone to the ear, free hand gesturing
        to(aR.sh, -0.35, 0, -1.15, 0.12);
        to(aR.el, -2.25, 0, 0, 0.12);
        to(aL.sh, -0.45, 0, 0.1);
        to(aL.el, -0.9 + Math.sin(t * 2.2 + k) * 0.3, 0, 0);
        to(head, 0.02, 0.2, -0.12);
        P.hold('phone');
        mugUpright();
        return;
      }
      if (mode === 'look') {
        // lean in and read the screen, one hand on the mouse
        to(aL.sh, -0.5, 0, 0.1);
        to(aL.el, -1.0, 0, 0);
        to(aR.sh, -0.6, 0, -0.1);
        to(aR.el, -1.0, 0, 0);
        to(head, 0.22 + Math.sin(t * 0.7 + k) * 0.03, Math.sin(t * 0.8 + k) * 0.18, 0);
        P.hold(null);
        return;
      }
      if (mode === 'think') {
        // hand on the chin
        to(aR.sh, -0.7, 0, -0.1, 0.12);
        to(aR.el, -2.3, 0, 0, 0.12);
        to(aL.sh, -0.5, 0, 0.12);
        to(aL.el, -1.0, 0, 0);
        to(head, -0.04, 0.25 + Math.sin(t * 0.6 + k) * 0.08, 0.06);
        P.hold(null);
        return;
      }
      if (mode === 'stretch') {
        // both arms up, a little lean back
        to(aL.sh, -2.9, 0, 0.35, 0.1);
        to(aR.sh, -2.9, 0, -0.35, 0.1);
        to(aL.el, -0.15, 0, 0, 0.1);
        to(aR.el, -0.15, 0, 0, 0.1);
        to(head, -0.25, 0, 0, 0.1);
        P.hold(null);
        return;
      }
      if (mode === 'read') {
        // reading a few papers held in the right hand
        to(aR.sh, -0.8, 0, -0.1, 0.12);
        to(aR.el, -1.5, 0, 0, 0.12);
        to(aL.sh, -0.5, 0, 0.12);
        to(aL.el, -1.0, 0, 0);
        to(head, 0.3, Math.sin(t * 0.5 + k) * 0.1, 0);
        P.hold('papers');
        if (props.papers) props.papers.rotation.x = -(aR.sh.rotation.x + aR.el.rotation.x) + 0.5;
        return;
      }
      // idle: relaxed arms, gentle breathing, looking around
      to(aL.sh, seated ? -0.5 : 0.05, 0, 0.06);
      to(aR.sh, seated ? -0.5 : 0.05, 0, -0.06);
      to(aL.el, seated ? -0.9 : -0.12, 0, 0);
      to(aR.el, seated ? -0.9 : -0.12, 0, 0);
      torso.scale.y = 1 + Math.sin(t * 1.6 + k) * 0.012;
      head.rotation.y = Math.sin(t * 0.45 + k) * 0.45;
      head.rotation.x = Math.sin(t * 0.3 + k) * 0.06;
      if (rich) P.hold(null);
    };
    P.pose('stand');
    return P;
  }

  // merge sibling meshes that share a material into one mesh (per joint group); props and the torso stay separate
  function mergeStatic(grp) {
    grp.children.filter(c => c.isGroup && !c.userData.keep).forEach(mergeStatic);
    const by = new Map();
    grp.children.forEach(c => {
      if (!c.isMesh || c.userData.keep || !c.geometry) return;
      c.updateMatrix();
      const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      Object.keys(geo.attributes).forEach(k => k !== 'position' && k !== 'normal' && geo.deleteAttribute(k));
      geo.applyMatrix4(c.matrix);
      if (!by.has(c.material)) by.set(c.material, []);
      by.get(c.material).push({ mesh: c, geo });
    });
    by.forEach((list, mat) => {
      if (list.length < 2) return list.forEach(l => l.geo.dispose());
      const merged = new THREE.Mesh(
        mergeGeometries(
          list.map(l => l.geo),
          false,
        ),
        mat,
      );
      list.forEach(l => {
        grp.remove(l.mesh);
        l.geo.dispose();
      });
      grp.add(merged);
    });
  }

  /* ---------- face ---------- */
  function buildFace(o, head, f, skin, hairM, rich) {
    const dark = M('#1b1b22', 0.4);
    const eyeCol = M(o.eyes || '#3a2a20', 0.35);
    [-1, 1].forEach(s => {
      if (rich) {
        // eye: white, coloured iris, pupil, highlight (more life than a dark dot)
        const sc = new THREE.Mesh(
          G('sclera', () => new THREE.SphereGeometry(0.026, 10, 8)),
          M('#fdfdfd', 0.3),
        );
        sc.position.set(s * 0.058, 0.02, 0.15);
        sc.scale.set(1.05, f ? 1.15 : 0.95, 0.5);
        head.add(sc);
        const ir = new THREE.Mesh(
          G('iris', () => new THREE.SphereGeometry(0.0155, 10, 8)),
          eyeCol,
        );
        ir.position.set(s * 0.058, 0.02, 0.1605);
        ir.scale.set(1, 1, 0.5);
        head.add(ir);
        const pu = new THREE.Mesh(
          G('pupil', () => new THREE.SphereGeometry(0.008, 8, 6)),
          dark,
        );
        pu.position.set(s * 0.058, 0.02, 0.1645);
        head.add(pu);
        const lid = new THREE.Mesh(
          G('lid', () => new THREE.SphereGeometry(0.029, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4)),
          skin,
        );
        lid.position.set(s * 0.058, 0.026, 0.149);
        lid.scale.set(1.05, 0.8, 0.5);
        lid.rotation.x = -0.15;
        head.add(lid);
        if (f || o.lashes) {
          const la = new THREE.Mesh(
            G('lash', () => new THREE.BoxGeometry(0.058, 0.006, 0.01)),
            dark,
          );
          la.position.set(s * 0.058, 0.048, 0.157);
          la.rotation.z = s * -0.18;
          head.add(la);
          const fl = new THREE.Mesh(
            G('flick', () => new THREE.BoxGeometry(0.016, 0.005, 0.008)),
            dark,
          );
          fl.position.set(s * 0.088, 0.054, 0.15);
          fl.rotation.z = s * 0.5;
          head.add(fl);
        }
      } else {
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
      }
      const brow = new THREE.Mesh(
        G(rich ? 'brow2' : 'brow', () => new THREE.BoxGeometry(0.05, (f ? 0.009 : 0.014) * (rich ? 1.25 : 1), 0.01)),
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
      if (rich && o.earrings) {
        const er = new THREE.Mesh(
          G('earring', () => new THREE.SphereGeometry(0.012, 8, 6)),
          MM(o.earrings === true ? '#e6c36a' : o.earrings, 0.3, 0.9),
        );
        er.position.set(s * 0.168, -0.042, 0.005);
        head.add(er);
        const dr = new THREE.Mesh(
          G('earDrop', () => new THREE.CylinderGeometry(0.004, 0.004, 0.035, 5)),
          MM(o.earrings === true ? '#e6c36a' : o.earrings, 0.3, 0.9),
        );
        dr.position.set(s * 0.168, -0.065, 0.005);
        head.add(dr);
      }
      if (rich && (f || o.blush)) {
        const bl = new THREE.Mesh(
          G('blush', () => new THREE.SphereGeometry(0.026, 8, 6)),
          M(shade(o.skin || SKIN[0], 0.02, '#ff8a8a', 0.28), 0.7),
        );
        bl.position.set(s * 0.093, -0.04, 0.138);
        bl.scale.set(1, 0.7, 0.3);
        bl.rotation.y = s * 0.5;
        head.add(bl);
      }
    });
    const nose = new THREE.Mesh(
      G('nose', () => new THREE.SphereGeometry(0.024, 8, 6)),
      M(shade(o.skin || SKIN[0], -0.08), 0.6),
    );
    nose.position.set(0, -0.012, 0.166);
    nose.scale.set(0.8, 1, 0.9);
    head.add(nose);
    if (rich) {
      const bridge = new THREE.Mesh(
        G('nbridge', () => new THREE.CapsuleGeometry(0.012, 0.04, 2, 6)),
        skin,
      );
      bridge.position.set(0, 0.025, 0.157);
      bridge.scale.set(0.9, 1, 0.6);
      head.add(bridge);
      // mouth: a smile arc with a lip, optionally a grin with teeth
      const lipCol = M(o.lipColor || (f ? '#b4485a' : '#8a4a40'), 0.5);
      if (o.grin) {
        const teeth = new THREE.Mesh(
          G('teeth', () => new THREE.BoxGeometry(0.05, 0.014, 0.008)),
          M('#ffffff', 0.4),
        );
        teeth.position.set(0, -0.068, 0.152);
        head.add(teeth);
      }
      const smile = new THREE.Mesh(
        G('smile', () => new THREE.TorusGeometry(0.036, 0.0055, 5, 14, Math.PI * 0.8)),
        lipCol,
      );
      smile.rotation.z = Math.PI + Math.PI * 0.1;
      smile.position.set(0, -0.052, 0.15);
      smile.scale.set(1, 0.55, 0.7);
      head.add(smile);
      if (f) {
        const lip = new THREE.Mesh(
          G('lip', () => new THREE.SphereGeometry(0.02, 8, 6)),
          lipCol,
        );
        lip.position.set(0, -0.076, 0.152);
        lip.scale.set(1.5, 0.45, 0.4);
        head.add(lip);
      }
    } else {
      const mouth = new THREE.Mesh(
        G('mouth', () => new THREE.BoxGeometry(0.06, 0.012, 0.01)),
        M(f ? '#b4485a' : '#8a4a40', 0.5),
      );
      mouth.position.set(0, -0.07, 0.152);
      head.add(mouth);
    }
    if (o.beard) {
      const b = new THREE.Mesh(
        G('beard', () => new THREE.SphereGeometry(0.168, 18, 14, 0, Math.PI * 2, Math.PI * 0.64, Math.PI * 0.3)),
        hairM,
      );
      b.scale.set(0.97, 1.08, 1.02);
      head.add(b);
    } else if (rich && o.stubble) {
      const b = new THREE.Mesh(
        G('stubble', () => new THREE.SphereGeometry(0.1715, 18, 14, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.3)),
        M(shade(o.skin || SKIN[0], -0.14), 0.9),
      );
      b.scale.set(0.97, 1.08, 1.02);
      head.add(b);
    }
    if (rich && (o.stache || o.beard)) {
      const st = new THREE.Mesh(
        G('stache', () => new THREE.CapsuleGeometry(0.014, 0.06, 2, 6)),
        hairM,
      );
      st.rotation.z = Math.PI / 2;
      st.position.set(0, -0.045, 0.157);
      st.scale.set(1, 1, 0.8);
      head.add(st);
    }
    if (rich && o.freckles) {
      [-1, 1].forEach(s =>
        [
          [0.05, -0.02],
          [0.07, -0.032],
          [0.04, -0.038],
          [0.085, -0.016],
        ].forEach(([x, y]) => {
          const d = new THREE.Mesh(
            G('freckle', () => new THREE.SphereGeometry(0.004, 4, 4)),
            M(shade(o.skin || SKIN[0], -0.2), 0.8),
          );
          d.position.set(s * x, y, 0.158 - Math.abs(x) * 0.22);
          head.add(d);
        }),
      );
    }
    if (rich && o.mole) {
      const d = new THREE.Mesh(
        G('mole', () => new THREE.SphereGeometry(0.005, 4, 4)),
        M('#3a2a20', 0.8),
      );
      d.position.set(0.07, -0.06, 0.148);
      head.add(d);
    }
    if (o.glasses) {
      const style = o.glasses === true ? 'round' : o.glasses;
      const fr = M(style === 'tort' ? '#6b3b1c' : style === 'gold' ? '#c9a24b' : '#20232a', 0.3);
      const lensMat = (this_lens ||= new THREE.MeshStandardMaterial({
        color: '#bfe3ff',
        transparent: true,
        opacity: 0.18,
        roughness: 0.1,
        depthWrite: false,
      }));
      [-1, 1].forEach(s => {
        const sq = style === 'square' || style === 'tort';
        const r = new THREE.Mesh(
          sq
            ? G('lensSq', () => new THREE.TorusGeometry(0.034, 0.006, 4, 4))
            : G('lens', () => new THREE.TorusGeometry(0.03, 0.006, 6, 16)),
          fr,
        );
        if (sq) {
          r.rotation.z = Math.PI / 4;
          r.scale.set(0.95, 0.7, 1);
        }
        r.position.set(s * 0.058, 0.02, 0.168);
        head.add(r);
        if (rich) {
          const ln = new THREE.Mesh(
            G('lensDisc', () => new THREE.CircleGeometry(0.028, 12)),
            lensMat,
          );
          ln.position.set(s * 0.058, 0.02, 0.1685);
          if (sq) ln.scale.set(1.05, 0.7, 1);
          head.add(ln);
          const arm = new THREE.Mesh(
            G('temple', () => new THREE.BoxGeometry(0.005, 0.005, 0.15)),
            fr,
          );
          arm.position.set(s * 0.09, 0.03, 0.095);
          arm.rotation.y = s * -0.12;
          head.add(arm);
        }
      });
      const br = new THREE.Mesh(
        G('bridge', () => new THREE.BoxGeometry(0.05, 0.006, 0.006)),
        fr,
      );
      br.position.set(0, 0.025, 0.17);
      head.add(br);
    }
  }
  let this_lens = null;

  /* ---------- outfit extras ---------- */
  function buildOutfit(o, body, torso, th, tw, td, f, top, accent, bottom, hipY) {
    const front = td / 2;
    const y = torso.position.y;
    const style = o.outfit;
    const add = (geo, mat, x, yy, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, yy, z);
      m.rotation.set(rx, ry, rz);
      body.add(m);
      return m;
    };
    if (style === 'cardigan') {
      const c = M(o.jacket || o.cardigan || '#c9a27a', 0.9);
      [-1, 1].forEach(s => {
        add(
          G('cardiPanel', () => new RoundedBoxGeometry(tw * 0.42, th * 0.96, 0.03, 2, 0.012)),
          c,
          s * tw * 0.27,
          y - 0.01,
          front + 0.012,
        );
        add(
          G('cardiPocket', () => new THREE.BoxGeometry(0.09, 0.07, 0.012)),
          c,
          s * 0.14,
          y - 0.16,
          front + 0.03,
        );
      });
    } else if (style === 'hoodie') {
      add(
        G('hood', () => new THREE.TorusGeometry(0.09, 0.04, 8, 14)),
        top,
        0,
        y + th / 2 + 0.0,
        -0.08,
        Math.PI / 2 - 0.5,
      );
      add(
        G('hoodPocket', () => new RoundedBoxGeometry(0.3, 0.12, 0.03, 2, 0.02)),
        top,
        0,
        y - 0.15,
        front + 0.014,
      );
      [-1, 1].forEach(s =>
        add(
          G('drawstring', () => new THREE.CylinderGeometry(0.006, 0.006, 0.17, 5)),
          M('#f3efe6', 0.6),
          s * 0.045,
          y + th / 2 - 0.1,
          front + 0.014,
        ),
      );
    } else if (style === 'vest') {
      const c = M(o.vest || '#3b4252', 0.8);
      [-1, 1].forEach(s => {
        add(
          G('vestPanel', () => new THREE.BoxGeometry(tw * 0.38, th * 0.82, 0.03)),
          c,
          s * tw * 0.26,
          y - 0.04,
          front + 0.012,
        );
        add(
          G('vestBtn', () => new THREE.SphereGeometry(0.01, 6, 5)),
          M('#d9b45c', 0.4),
          s * 0.03,
          y - 0.04,
          front + 0.032,
        );
      });
    } else if (style === 'polo') {
      [-1, 1].forEach(s =>
        add(
          G('poloCol', () => new THREE.BoxGeometry(0.075, 0.05, 0.012)),
          top,
          s * 0.05,
          y + th / 2 - 0.035,
          front + 0.014,
          0,
          0,
          s * -0.55,
        ),
      );
      add(
        G('placket', () => new THREE.BoxGeometry(0.03, 0.14, 0.01)),
        accent,
        0,
        y + th / 2 - 0.1,
        front + 0.014,
      );
    } else if (style === 'dress') {
      // a dress-shirt look: contrast bottom band and top buttons
      for (let i = 0; i < 3; i++)
        add(
          G('shirtBtn', () => new THREE.SphereGeometry(0.008, 6, 5)),
          accent,
          0,
          y + 0.14 - i * 0.12,
          front + 0.012,
        );
    }
    if (o.scarf) {
      const sc = M(o.scarf, 0.9);
      add(
        G('scarf', () => new THREE.TorusGeometry(0.095, 0.035, 8, 14)),
        sc,
        0,
        y + th / 2 + 0.01,
        0,
        Math.PI / 2,
      );
      add(
        G('scarfTail', () => new THREE.BoxGeometry(0.06, 0.2, 0.025)),
        sc,
        0.06,
        y + th / 2 - 0.12,
        front + 0.02,
        0,
        0,
        0.06,
      );
    }
    if (o.necklace) {
      const gold = MM(o.necklace === true ? '#e6c36a' : o.necklace, 0.3, 0.9);
      add(
        G('necklace', () => new THREE.TorusGeometry(0.075, 0.004, 5, 18, Math.PI)),
        gold,
        0,
        y + th / 2 - 0.02,
        0.03,
        0,
        0,
        Math.PI,
      ).scale.set(1, 1.2, 1);
      add(
        G('pendant', () => new THREE.SphereGeometry(0.011, 6, 5)),
        gold,
        0,
        y + th / 2 - 0.11,
        front + 0.012,
      );
    }
  }

  function buildHeadgear(o, head, f) {
    if (o.headset) {
      const c = M(o.headset === true ? '#1f2330' : o.headset, 0.4);
      const band = new THREE.Mesh(
        G('hsBand', () => new THREE.TorusGeometry(0.182, 0.0085, 5, 18, Math.PI)),
        c,
      );
      band.position.y = 0.0;
      head.add(band);
      [-1, 1].forEach(s => {
        const cup = new THREE.Mesh(
          G('hsCup', () => new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12)),
          c,
        );
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * 0.182, -0.005, 0);
        head.add(cup);
      });
      const boom = new THREE.Mesh(
        G('hsBoom', () => new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5)),
        c,
      );
      boom.rotation.set(Math.PI / 2 - 0.5, 0, 0);
      boom.position.set(0.18, -0.04, 0.07);
      boom.rotation.y = 0.0;
      head.add(boom);
      const mic = new THREE.Mesh(
        G('hsMic', () => new THREE.SphereGeometry(0.011, 6, 5)),
        M('#c0392b', 0.5),
      );
      mic.position.set(0.14, -0.07, 0.135);
      head.add(mic);
    }
    if (o.earbuds) {
      [-1, 1].forEach(s => {
        const e = new THREE.Mesh(
          G('earbud', () => new THREE.SphereGeometry(0.014, 6, 5)),
          M('#ffffff', 0.3),
        );
        e.position.set(s * 0.172, -0.005, 0.01);
        head.add(e);
      });
    }
    if (o.headband) {
      const hb = new THREE.Mesh(
        G('hband', () => new THREE.TorusGeometry(0.182, 0.011, 5, 16, Math.PI)),
        M(o.headband, 0.8),
      );
      hb.rotation.set(0, Math.PI / 2, 0);
      hb.rotation.x = -0.2;
      hb.position.set(0, 0.0, -0.01);
      head.add(hb);
    }
    if (o.cap) {
      const col = M(o.cap, 0.8);
      const dome = new THREE.Mesh(
        G('capDome', () => new THREE.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)),
        col,
      );
      dome.position.y = 0.04;
      dome.scale.set(1, 1.05, 1.08);
      head.add(dome);
      const brim = new THREE.Mesh(
        G('capBrim', () => new THREE.CylinderGeometry(0.16, 0.16, 0.012, 12, 1, false, -Math.PI / 2, Math.PI)),
        col,
      );
      brim.position.set(0, 0.07, 0.14);
      brim.rotation.x = 0.1;
      head.add(brim);
    }
  }

  function buildShoe(style, o, knee, f, shoes) {
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      knee.add(m);
      return m;
    };
    const sw = f ? 0.1 : 0.12,
      sl = f ? 0.22 : 0.25;
    if (style === 'sneaker') {
      add(
        G('sneakSole', () => new RoundedBoxGeometry(sw + 0.008, 0.028, sl + 0.01, 1, 0.012)),
        M('#f4f1ea', 0.6),
        0,
        -0.455,
        0.05,
      );
      add(
        G('sneakToe', () => new THREE.SphereGeometry(0.052, 8, 6)),
        M('#f4f1ea', 0.6),
        0,
        -0.43,
        0.14,
      ).scale.set(1, 0.5, 0.8);
      add(
        G('sneakLace', () => new THREE.BoxGeometry(0.05, 0.004, 0.07)),
        M('#ffffff', 0.5),
        0,
        -0.382,
        0.05,
      );
    } else if (style === 'loafer') {
      add(
        G('loaferSole', () => new RoundedBoxGeometry(sw, 0.016, sl, 1, 0.006)),
        M('#1a120c', 0.7),
        0,
        -0.462,
        0.05,
      );
      add(
        G('loaferStrap', () => new THREE.BoxGeometry(0.07, 0.012, 0.03)),
        MM('#d9b45c', 0.3, 0.9),
        0,
        -0.382,
        0.08,
      );
    } else if (style === 'boot') {
      add(
        G('bootShaft', () => new THREE.CylinderGeometry(0.066, 0.07, 0.12, 10)),
        shoes,
        0,
        -0.34,
        0,
      );
      add(
        G('bootSole', () => new RoundedBoxGeometry(sw + 0.01, 0.025, sl + 0.01, 1, 0.01)),
        M('#3a2a20', 0.8),
        0,
        -0.455,
        0.05,
      );
    } else if (style === 'heel') {
      add(
        G('heelPost', () => new THREE.CylinderGeometry(0.01, 0.014, 0.07, 6)),
        shoes,
        0,
        -0.46,
        -0.04,
      );
      add(
        G('heelStrap', () => new THREE.BoxGeometry(0.1, 0.01, 0.014)),
        shoes,
        0,
        -0.38,
        0.0,
      );
    } else if (style === 'flat') {
      add(
        G('flatSole', () => new RoundedBoxGeometry(sw, 0.012, sl, 1, 0.005)),
        M('#f3e6d6', 0.7),
        0,
        -0.462,
        0.05,
      );
    }
    if (o.socks) {
      add(
        G('sock', () => new THREE.CylinderGeometry(0.062, 0.066, 0.05, 10)),
        M(o.socks, 0.9),
        0,
        -0.385,
        0,
      );
    }
  }

  /* ---------- hair ---------- */
  function hairdo(head, f, style, mat, seg, detail, o = {}) {
    const add = (geo, pos, scale, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      if (scale) m.scale.set(...scale);
      if (rot) m.rotation.set(...rot);
      head.add(m);
      return m;
    };
    const cap = G(`hcap${seg}`, () => new THREE.SphereGeometry(0.182, seg + 4, seg, 0, Math.PI * 2, 0, Math.PI * 0.52));
    const curls = (n, r, rad, yOff, zBack) => {
      // a cap of little balls: curls or an afro, spread over the top of the head
      const ball = G(`curl${r}${seg}`, () => new THREE.SphereGeometry(r, seg - 3, seg - 4));
      for (let i = 0; i < n; i++) {
        const a = i * 2.399963; // golden angle
        const v = Math.acos(1 - (i + 0.5) / n); // 0 at the crown
        const ph = v * 0.78;
        const x = Math.sin(ph) * Math.cos(a) * rad,
          y = Math.cos(ph) * rad * 1.02,
          z = Math.sin(ph) * Math.sin(a) * rad;
        if (z > rad * 0.52 && y < rad * 0.55) continue; // keep the forehead clear
        add(ball, [x, y + yOff, z - zBack]);
      }
    };
    if (!f) {
      const s = style || 'side';
      if (s === 'bald') return;
      if (s === 'afro' && detail) {
        add(cap, [0, 0.02, -0.02], [1.08, 1.1, 1.1], [-0.18, 0, 0]);
        curls(26, 0.062, 0.2, 0.03, 0.02);
        return;
      }
      if (s === 'curly' && detail) {
        add(cap, [0, 0.02, -0.005], [1, 1.05, 1.04], [-0.14, 0, 0]);
        curls(16, 0.055, 0.17, 0.03, 0);
        return;
      }
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
      if (s === 'slick' && detail) {
        add(
          G(`slick${seg}`, () => new THREE.SphereGeometry(0.1, seg, seg - 2)),
          [0, 0.15, 0.02],
          [1.7, 0.6, 1.5],
          [-0.1, 0, 0],
        );
      }
      if (s === 'undercut' && detail) {
        add(
          G(`under${seg}`, () => new THREE.SphereGeometry(0.1, seg, seg - 2)),
          [0, 0.17, 0.04],
          [1.0, 0.8, 1.5],
          [0.2, 0, 0],
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
    if (s === 'afro' && detail) {
      add(cap, [0, 0.02, -0.03], [1.1, 1.12, 1.12], [-0.2, 0, 0]);
      curls(30, 0.066, 0.21, 0.03, 0.03);
      return;
    }
    if (s === 'curly' && detail) {
      add(cap, [0, 0.025, -0.01], [1.06, 1.08, 1.08], [-0.15, 0, 0]);
      curls(18, 0.058, 0.18, 0.03, 0.01);
      [-1, 1].forEach(k => {
        for (let i = 0; i < 4; i++)
          add(
            G(`curlS${seg}`, () => new THREE.SphereGeometry(0.052, seg - 3, seg - 4)),
            [k * (0.15 + (i % 2) * 0.01), -0.02 - i * 0.065, -0.02 - (i % 2) * 0.02],
          );
      });
      return;
    }
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
    } else if (s === 'wavy' && detail) {
      add(
        G(`hlong${seg}`, () => new THREE.CapsuleGeometry(0.15, 0.24, 3, seg)),
        [0, -0.12, -0.06],
        [1.2, 1, 0.72],
      );
      [-1, 1].forEach(k => {
        for (let i = 0; i < 3; i++)
          add(
            G(`wave${seg}`, () => new THREE.SphereGeometry(0.058, seg - 2, seg - 4)),
            [k * (0.155 + (i % 2) * 0.014), -0.02 - i * 0.07, 0.0 - (i % 2) * 0.03],
          );
      });
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
    } else if (s === 'highbun' && detail) {
      add(
        G(`hbun2${seg}`, () => new THREE.SphereGeometry(0.085, seg, seg - 2)),
        [0, 0.24, -0.04],
      );
      add(
        G(`hbunBand${seg}`, () => new THREE.TorusGeometry(0.06, 0.012, 5, 12)),
        [0, 0.2, -0.04],
        null,
        [Math.PI / 2, 0, 0],
      ).material = M('#f3efe6', 0.6);
    } else if (s === 'pony') {
      add(
        G(`hpony${seg}`, () => new THREE.CapsuleGeometry(0.055, 0.22, 3, seg)),
        [0, -0.03, -0.2],
        null,
        [0.35, 0, 0],
      );
    } else if (s === 'braids' && detail) {
      [-1, 1].forEach(k => {
        for (let i = 0; i < 5; i++)
          add(
            G(`braid${seg}`, () => new THREE.SphereGeometry(0.036, 8, 6)),
            [k * 0.1, -0.02 - i * 0.065, -0.14 + (i % 2) * 0.015 - i * 0.01],
            [1, 1.2, 1],
          );
      });
      add(
        G(`hbraidBack${seg}`, () => new THREE.CapsuleGeometry(0.12, 0.1, 3, seg)),
        [0, -0.0, -0.1],
        [1.1, 1, 0.7],
      );
    } else if (s === 'pixie' && detail) {
      add(
        G(`hpix${seg}`, () => new THREE.SphereGeometry(0.08, seg, seg - 2)),
        [-0.05, 0.12, 0.1],
        [1.6, 0.5, 0.8],
        [0.4, 0, 0.3],
      );
    }
    if (o.streak && detail) {
      const m = new THREE.Mesh(
        G(`streak${seg}`, () => new THREE.CapsuleGeometry(0.012, 0.16, 2, 6)),
        M(o.streak, 0.7),
      );
      m.position.set(0.075, 0.1, 0.105);
      m.rotation.set(0.75, 0, -0.5);
      head.add(m);
    }
  }

  function shade(hex, amt, tint, mix) {
    const c = new THREE.Color(hex);
    const h = {};
    c.getHSL(h);
    c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt)));
    if (tint) c.lerp(new THREE.Color(tint), mix || 0.3);
    return '#' + c.getHexString();
  }

  return { makePerson, SKIN, HAIR };
})();
