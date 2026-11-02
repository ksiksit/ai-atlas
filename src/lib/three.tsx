import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { usePalette, type Palette, lerpColor } from './theme';

export interface ThreeCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  palette: Palette;
  el: HTMLDivElement;
}

export interface ThreeHandle {
  update?: (dt: number, t: number) => void;
  dispose?: () => void;
}

interface Props {
  height?: number;
  /** Builds the scene. Re-run when deps or the theme change. */
  setup: (ctx: ThreeCtx) => ThreeHandle | void;
  deps?: unknown[];
  camera?: [number, number, number];
  target?: [number, number, number];
  hint?: string;
  autoRotate?: boolean;
  enableZoom?: boolean;
  className?: string;
  /** Called every frame with the current ctx (after update). */
  children?: React.ReactNode;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A self-managing three.js viewport with orbit controls, HiDPI, resize and offscreen pause. */
export function ThreeView({ height = 420, setup, deps = [], camera = [4, 3.2, 4], target = [0, 0, 0], hint = '드래그로 회전 · 휠로 확대', autoRotate = false, enableZoom = true, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const palette = usePalette();
  const [ok] = useState(webglAvailable);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const camState = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ok) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w = el.clientWidth;
    renderer.setSize(w, height);
    renderer.setClearColor(0x000000, 0);
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, w / height, 0.05, 200);
    if (camState.current) {
      cam.position.copy(camState.current.pos);
    } else cam.position.set(...camera);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = enableZoom;
    controls.enablePan = false;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.6;
    controls.target.set(...target);
    if (camState.current) controls.target.copy(camState.current.target);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, palette.dark ? 0.55 : 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, palette.dark ? 1.4 : 1.6);
    dir.position.set(4, 8, 5);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-5, 3, -4);
    scene.add(dir2);

    const handle = setupRef.current({ scene, camera: cam, renderer, controls, palette, el }) || {};

    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true), { rootMargin: '100px' });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth;
      renderer.setSize(nw, height);
      cam.aspect = nw / height;
      cam.updateProjectionMatrix();
    });
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      handle.update?.(dt, now / 1000);
      controls.update();
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      camState.current = { pos: cam.position.clone(), target: controls.target.clone() };
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      handle.dispose?.();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, height, palette, ...deps]);

  return (
    <div ref={ref} className={'three-box ' + (className ?? '')} style={{ height }}>
      {!ok && <div className="webgl-fallback">이 브라우저에서는 3D(WebGL)를 표시할 수 없습니다.</div>}
      {ok && hint && <span className="three-hint">{hint}</span>}
      {children}
    </div>
  );
}

export function color3(c: string): THREE.Color {
  return new THREE.Color().setStyle(c.trim().startsWith('rgba') ? c.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)') : c);
}

/**
 * Surface mesh for z = f(x, y) over [-r, r]^2, rendered with three.js Y-up:
 * world (x, y=f, z=y). Vertex colours interpolate between lo and hi by height.
 */
export function surfaceMesh(f: (x: number, y: number) => number, opts: { range?: number; n?: number; lo: string; hi: string; zScale?: number; opacity?: number; wire?: boolean; wireColor?: string }) {
  const { range = 2, n = 80, lo, hi, zScale = 1, opacity = 1, wire = true } = opts;
  const geo = new THREE.PlaneGeometry(range * 2, range * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const zs: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = -pos.getZ(i);
    const z = f(x, y) * zScale;
    zs.push(z);
    pos.setY(i, z);
  }
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (zs[i] - zMin) / (zMax - zMin || 1);
    const c = lerpColor(lo, hi, Math.pow(t, 0.8));
    colors[i * 3] = c[0] / 255;
    colors[i * 3 + 1] = c[1] / 255;
    colors[i * 3 + 2] = c[2] / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, metalness: 0.0, transparent: opacity < 1, opacity, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  if (wire) {
    const wgeo = new THREE.WireframeGeometry(new THREE.PlaneGeometry(range * 2, range * 2, Math.round(n / 4), Math.round(n / 4)).rotateX(-Math.PI / 2));
    const wp = wgeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) wp.setY(i, f(wp.getX(i), -wp.getZ(i)) * zScale + 0.003);
    const wmat = new THREE.LineBasicMaterial({ color: color3(opts.wireColor ?? '#000000'), transparent: true, opacity: 0.18 });
    group.add(new THREE.LineSegments(wgeo, wmat));
  }
  return { group, zMin, zMax };
}

/** Thin axis lines with small labels (canvas sprites). */
export function axes3(scene: THREE.Object3D, palette: Palette, len = 2.4, labels: [string, string, string] = ['x', 'z', 'y']) {
  const mat = new THREE.LineBasicMaterial({ color: color3(palette.ink3), transparent: true, opacity: 0.8 });
  const pts = [new THREE.Vector3(-len, 0, 0), new THREE.Vector3(len, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, len, 0), new THREE.Vector3(0, 0, -len), new THREE.Vector3(0, 0, len)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const lines = new THREE.LineSegments(geo, mat);
  scene.add(lines);
  const L = [
    [labels[0], new THREE.Vector3(len + 0.15, 0, 0)],
    [labels[1], new THREE.Vector3(0, len + 0.15, 0)],
    [labels[2], new THREE.Vector3(0, 0, -len - 0.15)],
  ] as const;
  for (const [t, p] of L) {
    const s = textSprite(t, palette.ink2, palette.fontMono, 0.32);
    s.position.copy(p);
    scene.add(s);
  }
}

/** A text label that always faces the camera. `size` = world height. */
export function textSprite(text: string, color: string, font: string, size = 0.3, bold = false): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const px = 64;
  ctx.font = `${bold ? '700 ' : '500 '}${px}px ${font}`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w;
  c.height = px + 20;
  ctx.font = `${bold ? '700 ' : '500 '}${px}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set((size * c.width) / c.height, size, 1);
  return s;
}

export { THREE };
