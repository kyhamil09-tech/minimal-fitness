import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Four athletic androids rendered as real 3D models with three.js, built from primitives in code (no downloaded models). Each has a
 * brushed-metal shell in one of Google's four colors over graphite joints, a domed head with a visor and two antennae, and trains:
 * a runner mid-stride, a hydration check, a recovery stretch, and an overhead lift. They are original designs. This file is loaded
 * lazily so the three.js code only ships to people who pick the theme.
 */
export type BotKind = 'runner' | 'water' | 'recover' | 'lift';

export interface BotSpec {
  kind: BotKind;
  color: string;
}

interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  kind: BotKind;
  tap: number;
}

const FOOT = 0.1;
const THIGH = 0.5;
const SHIN = 0.5;
const UPPER = 0.45;
const FORE = 0.42;

function buildRig(spec: BotSpec, shell: THREE.Material, dark: THREE.Material, glow: THREE.Material, accent: THREE.Material): Rig {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 6, 16), dark);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.9);
  hips.add(pelvis);

  const chest = new THREE.Group();
  chest.position.y = 0.1;
  hips.add(chest);
  // V-tapered torso: wide at the shoulders, narrow at the waist.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.29, 0.8, 28, 1), shell);
  torso.scale.z = 0.62;
  torso.position.y = 0.42;
  chest.add(torso);
  const abs = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.25, 0.16, 20), dark);
  abs.scale.z = 0.62;
  abs.position.y = 0.0;
  chest.add(abs);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), accent);
  plate.position.set(0, 0.55, 0.3);
  chest.add(plate);
  const plate2 = plate.clone();
  plate2.scale.x = 0.7;
  plate2.position.y = 0.45;
  chest.add(plate2);

  // Head: dome, visor band, eyes, two antennae.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 12), dark);
  neck.position.y = 0.86;
  chest.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.92;
  chest.add(head);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  dome.position.y = 0.02;
  head.add(dome);
  const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.07, 28), dark);
  jaw.position.y = -0.015;
  head.add(jaw);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.275, 28, 8, Math.PI / 2 - 0.95, 1.9, 0.95, 0.5), dark);
  visor.position.y = 0.02;
  head.add(visor);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.045, 4, 8), glow);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(s * 0.1, 0.095, 0.245);
    head.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.22, 8), dark);
    ant.position.set(s * 0.13, 0.33, 0);
    ant.rotation.z = -s * 0.42;
    head.add(ant);
  }

  const shoulderBall = new THREE.SphereGeometry(0.2, 20, 14);
  const armGeo = new THREE.CapsuleGeometry(0.125, UPPER - 0.25, 6, 14);
  const foreGeo = new THREE.CapsuleGeometry(0.1, FORE - 0.2, 6, 14);
  const makeArm = (s: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.62, 0.72, 0);
    chest.add(shoulder);
    shoulder.add(new THREE.Mesh(shoulderBall, shell));
    const upper = new THREE.Mesh(armGeo, shell);
    upper.position.y = -UPPER / 2 - 0.02;
    upper.scale.set(1, 1, 0.95);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER - 0.02;
    shoulder.add(elbow);
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), dark));
    const fore = new THREE.Mesh(foreGeo, dark);
    fore.position.y = -FORE / 2;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), shell);
    hand.position.y = -FORE - 0.03;
    elbow.add(hand);
    return { shoulder, elbow };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  const thighGeo = new THREE.CapsuleGeometry(0.15, THIGH - 0.3, 6, 14);
  const shinGeo = new THREE.CapsuleGeometry(0.115, SHIN - 0.23, 6, 14);
  const makeLeg = (s: number) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.22, -0.05, 0);
    hips.add(hip);
    const thigh = new THREE.Mesh(thighGeo, shell);
    thigh.position.y = -THIGH / 2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), dark));
    const shin = new THREE.Mesh(shinGeo, dark);
    shin.position.y = -SHIN / 2;
    knee.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, FOOT * 1.5, 0.4), shell);
    shoe.position.set(0, -SHIN - 0.02, 0.08);
    knee.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.42), accent);
    sole.position.set(0, -SHIN - 0.1, 0.08);
    knee.add(sole);
    return { hip, knee };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Props.
  if (spec.kind === 'water') {
    const bottle = new THREE.Group();
    bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 16), accent));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 12), dark);
    cap.position.y = 0.18;
    bottle.add(cap);
    bottle.position.set(0, -FORE - 0.05, 0.08);
    armR.elbow.add(bottle);
  }
  if (spec.kind === 'lift') {
    const bar = new THREE.Group();
    bar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 12), dark));
    bar.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      for (const [off, r] of [[0.8, 0.3], [0.89, 0.24]] as const) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.07, 24), off > 0.85 ? accent : dark);
        w.position.y = s * off;
        bar.add(w);
      }
    }
    bar.position.set(0, 1.62, 0);
    chest.add(bar);
  }

  return { root, hips, chest, head, shoulderL: armL.shoulder, shoulderR: armR.shoulder, elbowL: armL.elbow, elbowR: armR.elbow, hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee, kind: spec.kind, tap: 0 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function pose(r: Rig, t: number): void {
  const bump = r.tap > 0 ? Math.sin((1 - r.tap) * Math.PI) : 0;
  const reset = (g: THREE.Object3D) => g.rotation.set(0, 0, 0);
  [r.chest, r.head, r.shoulderL, r.shoulderR, r.elbowL, r.elbowR, r.hipL, r.hipR, r.kneeL, r.kneeR].forEach(reset);
  r.root.rotation.set(0, 0, 0);
  let hipY = FOOT + SHIN + THIGH + 0.04;
  switch (r.kind) {
    case 'runner': {
      const p = Math.sin(t * 5.5);
      const q = Math.sin(t * 5.5 + Math.PI);
      r.chest.rotation.x = -0.18;
      r.root.rotation.y = 0.5;
      r.shoulderL.rotation.x = -p * 0.95;
      r.shoulderR.rotation.x = -q * 0.95;
      r.elbowL.rotation.x = -1.4;
      r.elbowR.rotation.x = -1.4;
      r.hipL.rotation.x = -p * 0.85 - 0.1;
      r.hipR.rotation.x = -q * 0.85 - 0.1;
      r.kneeL.rotation.x = Math.max(0, p) * 1.5 + 0.2;
      r.kneeR.rotation.x = Math.max(0, q) * 1.5 + 0.2;
      hipY += Math.abs(Math.cos(t * 5.5)) * 0.1 - 0.08;
      break;
    }
    case 'water': {
      const sip = Math.max(0, Math.sin(t * 0.9 - 1)) ** 3;
      r.chest.rotation.z = Math.sin(t * 1.1) * 0.015;
      r.shoulderR.rotation.x = lerp(-0.35, -1.3, sip);
      r.elbowR.rotation.x = lerp(-1.6, -1.9, sip);
      r.head.rotation.x = -sip * 0.25;
      r.shoulderL.rotation.z = -0.12;
      r.shoulderR.rotation.z = 0.0;
      r.shoulderL.rotation.x = Math.sin(t * 1.1) * 0.05;
      r.hipL.rotation.z = -0.04;
      r.hipR.rotation.z = 0.04;
      break;
    }
    case 'recover': {
      const k = (Math.sin(t * 0.8) + 1) / 2;
      const lean = Math.sin(t * 0.8) * 0.22;
      r.chest.rotation.z = lean;
      r.shoulderL.rotation.z = -(2.55 + k * 0.35);
      r.shoulderR.rotation.z = 2.55 + k * 0.35;
      r.elbowL.rotation.z = 0.12;
      r.elbowR.rotation.z = -0.12;
      r.hipL.rotation.z = -0.1;
      r.hipR.rotation.z = 0.1;
      r.head.rotation.z = -lean * 0.4;
      hipY += 0.0;
      break;
    }
    case 'lift': {
      const s = (Math.sin(t * 1.5) + 1) / 2; // 0 = standing, 1 = bottom of squat
      const a = s * 0.85;
      r.hipL.rotation.x = -a;
      r.hipR.rotation.x = -a;
      r.kneeL.rotation.x = a * 2;
      r.kneeR.rotation.x = a * 2;
      r.chest.rotation.x = -a * 0.35;
      r.shoulderL.rotation.z = -3.0;
      r.shoulderR.rotation.z = 3.0;
      r.shoulderL.rotation.x = a * 0.1;
      r.shoulderR.rotation.x = a * 0.1;
      hipY = FOOT + (SHIN + THIGH) * Math.cos(a) + 0.04;
      r.root.rotation.y = 0;
      break;
    }
  }
  // A tap makes the android flex: a little hop and a chest-out puff.
  r.hips.position.y = hipY + bump * 0.18;
  r.chest.scale.setScalar(1 + bump * 0.06);
}

interface Props {
  specs: BotSpec[];
  light: boolean;
  still: boolean;
  onTap: (index: number) => void;
  label: string;
}

const BotScene3D: React.FC<Props> = ({ specs, light, still, onTap, label }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const hitRef = useRef<(i: number) => void>(() => undefined);

  useEffect(() => {
    const host = wrap.current;
    if (!host) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      host.dataset.failed = 'true';
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2);
    rim.position.set(-4, 3, -5);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(24, 21 / 10, 0.1, 100);
    camera.position.set(0, 1.8, 10.4);
    camera.lookAt(0, 1.75, 0);

    const dark = new THREE.MeshStandardMaterial({ color: '#23262d', metalness: 0.75, roughness: 0.42 });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f1ff', emissiveIntensity: 2.2 });
    const shadowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      if (g) {
        const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        grd.addColorStop(0, 'rgba(0,0,0,0.42)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
      }
      return new THREE.CanvasTexture(c);
    })();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.0);

    const owned: THREE.Material[] = [dark, glow, shadowMat];
    const rigs: Rig[] = specs.map((s, i) => {
      const shell = new THREE.MeshStandardMaterial({ color: s.color, metalness: 0.55, roughness: 0.32 });
      const accent = new THREE.MeshStandardMaterial({ color: '#f4f6fa', metalness: 0.35, roughness: 0.4 });
      owned.push(shell, accent);
      const rig = buildRig(s, shell, dark, glow, accent);
      const x = (i - (specs.length - 1) / 2) * 2.4;
      rig.root.position.x = x;
      scene.add(rig.root);
      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x, 0.01, 0.05);
      scene.add(sh);
      return rig;
    });

    const resize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || Math.round((w * 10) / 21);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw(clock);
    });
    ro.observe(host);

    let clock = 1.2;
    const draw = (t: number) => {
      rigs.forEach((r, i) => {
        if (r.kind !== 'runner') r.root.rotation.y = 0;
        pose(r, t + i * 1.7);
        if (r.kind !== 'runner' && r.kind !== 'lift') r.root.rotation.y = Math.sin(t * 0.5 + i) * 0.18;
        if (r.kind === 'lift') r.root.rotation.y = Math.sin(t * 0.5) * 0.12;
      });
      renderer.render(scene, camera);
    };

    let raf = 0;
    let last = 0;
    let visible = true;
    let tabVisible = !document.hidden;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || !tabVisible) return;
      const dt = now - last;
      if (dt < 33) return;
      last = now;
      clock += Math.min(dt, 100) / 1000;
      rigs.forEach((r) => {
        if (r.tap > 0) r.tap = Math.max(0, r.tap - dt / 650);
      });
      draw(clock);
    };
    draw(clock);
    if (!still) raf = requestAnimationFrame(loop);

    hitRef.current = (i: number) => {
      const r = rigs[i];
      if (!r) return;
      r.tap = 1;
      if (still) {
        const step = () => {
          r.tap = Math.max(0, r.tap - 0.08);
          draw(clock);
          if (r.tap > 0) requestAnimationFrame(step);
        };
        step();
      }
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(host);
    const onVis = () => {
      tabVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      host.dataset.failed = 'true';
    };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== shadowGeo) m.geometry.dispose();
      });
      shadowGeo.dispose();
      shadowTex.dispose();
      owned.forEach((m) => m.dispose());
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [specs, still]);

  const pick = (clientX: number) => {
    const host = wrap.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const i = Math.min(specs.length - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * specs.length)));
    hitRef.current(i);
    tapRef.current(i);
  };

  return (
    <div
      ref={wrap}
      className="mascot-stage"
      role="button"
      tabIndex={0}
      aria-label={label}
      // In the light look the page filter inverts everything; inverting the canvas again gives its true colors back.
      style={light ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
      onPointerDown={(e) => pick(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const i = Math.floor(Math.random() * specs.length);
          hitRef.current(i);
          tapRef.current(i);
        }
      }}
    />
  );
};

export default BotScene3D;
