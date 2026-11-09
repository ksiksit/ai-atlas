import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { THREE, color3 } from './three';
import { usePalette, type Palette } from './theme';

/**
 * Immersive first-person 3D world for lessons where the space itself is the figure.
 *
 * The reader stands on a ground surface y = ground(x, z) and walks around it:
 * WASD / arrow keys (when the view has focus), drag to look, an on-screen stick on touch screens.
 * 'walk' is the first-person view; 'sky' lifts the camera up and behind the walker, who is then
 * drawn as a small pawn. The lesson builds its scene in `setup` and can move the walker itself
 * through `api` (for example to take one gradient step).
 */

export interface Walker {
  x: number;
  z: number;
  /** Heading in radians. 0 looks toward −z; positive turns left. */
  yaw: number;
  /** Look up (+) or down (−) in radians. */
  pitch: number;
}

export type WorldView = 'walk' | 'sky';

export interface WorldCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  palette: Palette;
  /** Live walker state (mutated in place every frame). */
  walker: Walker;
  ground: (x: number, z: number) => number;
}

export interface WorldHandle {
  update?: (dt: number, t: number) => void;
  dispose?: () => void;
}

export interface WorldApi {
  get(): Walker;
  /** Move smoothly to (x, z); instant when the reader prefers reduced motion. `face` turns toward the direction of travel. */
  glideTo(x: number, z: number, opts?: { dur?: number; face?: boolean }): void;
  /** Jump to a new state at once (e.g. when resetting). */
  place(w: Partial<Walker>): void;
  gliding(): boolean;
}

interface Props {
  setup: (ctx: WorldCtx) => WorldHandle | void;
  /** Rebuild the scene when these change (the theme is always a dependency). */
  deps?: unknown[];
  ground: (x: number, z: number) => number;
  /** The walker stays inside [−bounds, bounds]² on the x–z plane. */
  bounds: number;
  start: Walker;
  view?: WorldView;
  /** Fog visibility distance in world units; Infinity for clear air. Only applies in the walk view. */
  fog?: number;
  /** Eye height above the ground. */
  eye?: number;
  /** Walking speed in world units per second (Shift runs at 2.5×). */
  speed?: number;
  /** Distance of the sky camera behind and above the walker. */
  skyDistance?: number;
  /** Lowest and highest look angle in radians. */
  pitchRange?: [number, number];
  height?: number;
  api?: MutableRefObject<WorldApi | null>;
  /** Called (throttled) whenever the walker moves. */
  onMove?: (w: Walker) => void;
  /** Extra keys while the view has focus. Return true if handled. */
  onKey?: (key: string) => boolean;
  /** Short description for screen readers. */
  label: string;
  /** Overlay drawn over the view; receives whether the view is full screen. */
  children?: ReactNode | ((full: boolean) => ReactNode);
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const MOVE_KEYS: Record<string, [number, number, number, number]> = {
  // [forward, strafe right, turn left, look up]
  w: [1, 0, 0, 0],
  s: [-1, 0, 0, 0],
  a: [0, -1, 0, 0],
  d: [0, 1, 0, 0],
  arrowup: [1, 0, 0, 0],
  arrowdown: [-1, 0, 0, 0],
  arrowleft: [0, 0, 1, 0],
  arrowright: [0, 0, -1, 0],
  q: [0, 0, 1, 0],
  e: [0, 0, -1, 0],
  pageup: [0, 0, 0, 1],
  pagedown: [0, 0, 0, -1],
};

export function World3D({ setup, deps = [], ground, bounds, start, view = 'walk', fog = Infinity, eye = 0.1, speed = 0.5, skyDistance = 2.4, pitchRange = [-1.25, 0.9], height = 480, api, onMove, onKey, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const palette = usePalette();
  const [ok] = useState(webglAvailable);
  const [focused, setFocused] = useState(false);
  const [full, setFull] = useState(false);
  const [cssFull, setCssFull] = useState(false);
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  const setupRef = useRef(setup);
  setupRef.current = setup;
  const groundRef = useRef(ground);
  groundRef.current = ground;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const viewRef = useRef(view);
  viewRef.current = view;
  const fogRef = useRef(fog);
  fogRef.current = fog;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const pitchRef = useRef(pitchRange);
  pitchRef.current = pitchRange;
  const clampPitch = (p: number) => Math.max(pitchRef.current[0], Math.min(pitchRef.current[1], p));

  const walker = useRef<Walker>({ ...start });
  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0 });
  const glide = useRef<{ x0: number; z0: number; x1: number; z1: number; yaw0: number; yaw1: number; t: number; dur: number } | null>(null);
  const moved = useRef(true);

  const clampXZ = (v: number) => Math.max(-boundsRef.current, Math.min(boundsRef.current, v));

  if (api) {
    api.current = {
      get: () => ({ ...walker.current }),
      gliding: () => glide.current !== null,
      place: (w) => {
        glide.current = null;
        Object.assign(walker.current, w);
        walker.current.x = clampXZ(walker.current.x);
        walker.current.z = clampXZ(walker.current.z);
        moved.current = true;
      },
      glideTo: (x, z, opts = {}) => {
        const w = walker.current;
        const x1 = clampXZ(x);
        const z1 = clampXZ(z);
        const dx = x1 - w.x;
        const dz = z1 - w.z;
        const faceYaw = opts.face && Math.hypot(dx, dz) > 1e-4 ? Math.atan2(-dx, -dz) : w.yaw;
        const dur = reducedMotion() ? 0 : opts.dur ?? 0.4;
        if (dur <= 0) {
          w.x = x1;
          w.z = z1;
          w.yaw = faceYaw;
          glide.current = null;
          moved.current = true;
          return;
        }
        glide.current = { x0: w.x, z0: w.z, x1, z1, yaw0: w.yaw, yaw1: w.yaw + wrapAngle(faceYaw - w.yaw), t: 0, dur };
      },
    };
  }

  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // Full screen: the real Fullscreen API where it exists, otherwise a fixed overlay.
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const isFull = full || cssFull;
  const toggleFull = () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (cssFull) {
      setCssFull(false);
      return;
    }
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setCssFull(true));
    } else setCssFull(true);
    el.focus({ preventScroll: true });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !ok) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.domElement.className = 'w3-canvas';
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const bg = color3(palette.surface);
    scene.background = bg;
    const fogObj = new THREE.Fog(bg, 0.01, 1e4);
    scene.fog = fogObj;
    const cam = new THREE.PerspectiveCamera(62, el.clientWidth / el.clientHeight, 0.004, 200);
    cam.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight(0xffffff, color3(palette.ink3), palette.dark ? 0.7 : 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, palette.dark ? 1.3 : 1.5);
    sun.position.set(3, 8, 4);
    scene.add(sun);

    // The walker as seen from the sky: a small pawn.
    const accent = color3(palette.accent);
    const pawn = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 18), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
    body.position.y = 0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 12), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }));
    head.position.y = 0.19;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 12), new THREE.MeshStandardMaterial({ color: color3(palette.ink) }));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.19, -0.06);
    pawn.add(body, head, nose);
    scene.add(pawn);

    const handle = setupRef.current({ scene, camera: cam, renderer, palette, walker: walker.current, ground: (x, z) => groundRef.current(x, z) }) || {};

    // Looking around: drag on the canvas.
    const canvas = renderer.domElement;
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      el.focus({ preventScroll: true });
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const w = walker.current;
      w.yaw += (e.clientX - drag.x) * 0.006;
      w.pitch = clampPitch(w.pitch + (e.clientY - drag.y) * 0.005);
      drag.x = e.clientX;
      drag.y = e.clientY;
      moved.current = true;
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true), { rootMargin: '100px' });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      cam.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      cam.updateProjectionMatrix();
    });
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    let lastReport = 0;
    const fwd = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const w = walker.current;
      const g = groundRef.current;

      const gl = glide.current;
      if (gl) {
        gl.t = Math.min(1, gl.t + dt / gl.dur);
        const s = smooth(gl.t);
        w.x = gl.x0 + (gl.x1 - gl.x0) * s;
        w.z = gl.z0 + (gl.z1 - gl.z0) * s;
        w.yaw = gl.yaw0 + (gl.yaw1 - gl.yaw0) * s;
        moved.current = true;
        if (gl.t >= 1) glide.current = null;
      } else {
        let f = stick.current.y;
        let r = stick.current.x;
        let turn = 0;
        let look = 0;
        for (const k of keys.current) {
          const m = MOVE_KEYS[k];
          if (!m) continue;
          f += m[0];
          r += m[1];
          turn += m[2];
          look += m[3];
        }
        if (look) {
          w.pitch = clampPitch(w.pitch + look * 1.2 * dt);
          moved.current = true;
        }
        const run = keys.current.has('shift') ? 2.5 : 1;
        if (turn) {
          w.yaw += turn * 1.6 * dt;
          moved.current = true;
        }
        if (f || r) {
          const len = Math.max(1, Math.hypot(f, r));
          const v = (speed * run * dt) / len;
          const sy = Math.sin(w.yaw);
          const cy = Math.cos(w.yaw);
          w.x = clampXZ(w.x + (-sy * f + cy * r) * v);
          w.z = clampXZ(w.z + (-cy * f - sy * r) * v);
          moved.current = true;
        }
      }

      const gy = g(w.x, w.z);
      const sky = viewRef.current === 'sky';
      if (sky) {
        fwd.set(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
        cam.position.set(w.x - fwd.x * skyDistance, gy + skyDistance * 1.05, w.z - fwd.z * skyDistance);
        cam.lookAt(w.x + fwd.x * 0.4, gy, w.z + fwd.z * 0.4);
        fogObj.near = 0.01;
        fogObj.far = 1e4;
      } else {
        cam.position.set(w.x, gy + eye, w.z);
        cam.rotation.set(w.pitch, w.yaw, 0);
        const d = fogRef.current;
        fogObj.near = Number.isFinite(d) ? d * 0.15 : 0.01;
        fogObj.far = Number.isFinite(d) ? d : 1e4;
      }
      pawn.visible = sky;
      pawn.position.set(w.x, gy, w.z);
      pawn.rotation.y = w.yaw;

      handle.update?.(dt, now / 1000);
      renderer.render(scene, cam);

      if (moved.current && now - lastReport > 80) {
        moved.current = false;
        lastReport = now;
        onMoveRef.current?.({ ...w });
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      handle.dispose?.();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, palette, eye, speed, skyDistance, ...deps]);

  const keyDown = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' && cssFull) {
      setCssFull(false);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (k === 'f') {
      toggleFull();
      e.preventDefault();
      return;
    }
    if (onKeyRef.current?.(k)) {
      e.preventDefault();
      return;
    }
    if (MOVE_KEYS[k] || k === 'shift') {
      keys.current.add(k);
      e.preventDefault();
    }
  };
  const keyUp = (e: React.KeyboardEvent) => keys.current.delete(e.key.toLowerCase());

  // On-screen stick for touch screens.
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const stickMove = (e: React.PointerEvent) => {
    const r = stickRef.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - r.left - R) / R;
    let y = (e.clientY - r.top - R) / R;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    stick.current = { x, y: -y };
    setKnob([x, y]);
  };
  const stickEnd = () => {
    stick.current = { x: 0, y: 0 };
    setKnob([0, 0]);
  };

  const h = vw < 640 ? Math.min(height, Math.round(vw * 1.05)) : height;
  const overlay = typeof children === 'function' ? children(isFull) : children;

  return (
    <div
      ref={ref}
      className={'w3-box' + (cssFull ? ' w3-css-full' : '')}
      style={isFull ? undefined : { height: h }}
      tabIndex={0}
      role="application"
      aria-label={label + ' 이 영역에 초점을 두면 W·A·S·D나 화살표 키로 걷고, F 키로 전체 화면을 켜고 끕니다.'}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        keys.current.clear();
      }}
    >
      {!ok && <div className="webgl-fallback">이 브라우저에서는 3D(WebGL)를 표시할 수 없습니다.</div>}
      {ok && (
        <>
          {overlay}
          <button type="button" className="w3-full-btn" onClick={toggleFull} aria-label={isFull ? '전체 화면 끝내기' : '전체 화면으로 보기'} title={isFull ? '전체 화면 끝내기 (F)' : '전체 화면 (F)'}>
            {isFull ? '✕' : '⛶'}
          </button>
          <div className="w3-keys" aria-hidden="true">
            {focused ? 'W A S D 걷기 · ← → 돌기 · PgUp PgDn 위아래 · Shift 달리기 · 드래그로 둘러보기' : '눌러서 조작 시작 · 드래그로 둘러보기'}
          </div>
          <div ref={stickRef} className="w3-stick" aria-hidden="true" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); stickMove(e); }} onPointerMove={(e) => e.buttons && stickMove(e)} onPointerUp={stickEnd} onPointerCancel={stickEnd}>
            <span style={{ transform: `translate(${knob[0] * 28}px, ${knob[1] * 28}px)` }} />
          </div>
        </>
      )}
    </div>
  );
}

/** Points along the straight x–z segment a → b, lifted `lift` above the ground, so a path hugs the terrain. */
export function drapeSegment(ground: (x: number, z: number) => number, a: [number, number], b: [number, number], lift = 0.01, n = 16): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    out.push(new THREE.Vector3(x, ground(x, z) + lift, z));
  }
  return out;
}

/** A shaft-and-head arrow of unit length along +y; scale and orient it with `pointArrow`. */
export function makeArrow(color: THREE.Color, radius = 0.012): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 10), mat);
  shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 3, radius * 8, 14), mat);
  head.name = 'head';
  g.add(shaft, head);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Place an arrow made by `makeArrow` from `from` along `dir` with total length `len`. */
export function pointArrow(arrow: THREE.Group, from: THREE.Vector3, dir: THREE.Vector3, len: number) {
  const shaft = arrow.getObjectByName('shaft') as THREE.Mesh;
  const head = arrow.getObjectByName('head') as THREE.Mesh;
  const headLen = (head.geometry as THREE.ConeGeometry).parameters.height;
  const sl = Math.max(0.001, len - headLen);
  shaft.scale.set(1, sl, 1);
  shaft.position.y = sl / 2;
  head.position.y = sl + headLen / 2;
  arrow.position.copy(from);
  arrow.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
}
