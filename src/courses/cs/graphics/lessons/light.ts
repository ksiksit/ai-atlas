/* 컴퓨터 그래픽스 · 빛과 셰이딩: the Phong reflection model and three ways to shade a mesh. */

import { add, clamp01, cross, dot, drawTriangle, Framebuffer, lookAt, mul, normalize, perspective, reflect, scale, sphere, sub, toScreen, applyPoint, type Mesh, type RGB, type SVert, type Vec3 } from './gfx';

export interface Terms {
  ambient: boolean;
  diffuse: boolean;
  specular: boolean;
}

export interface LightParams {
  /** Light position in world space. */
  pos: Vec3;
  /** Camera position in world space. */
  eye: Vec3;
  ka: number;
  kd: number;
  ks: number;
  shininess: number;
  /** Use the Blinn–Phong half vector instead of the mirror direction. */
  blinn: boolean;
  terms: Terms;
}

export const ALL_TERMS: Terms = { ambient: true, diffuse: true, specular: true };

/** Light position on a sphere of radius `r` around the origin; azimuth 0 is toward the camera (+z). Angles in degrees. */
export function lightAt(azDeg: number, elDeg: number, r = 4): Vec3 {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [r * Math.sin(az) * Math.cos(el), r * Math.sin(el), r * Math.cos(az) * Math.cos(el)];
}

/** The three Phong terms at a surface point, each as a plain intensity (0..1 before the base colour). */
export function phongTerms(p: Vec3, nIn: Vec3, L: LightParams): { a: number; d: number; s: number } {
  const n = normalize(nIn);
  const l = normalize(sub(L.pos, p));
  const v = normalize(sub(L.eye, p));
  const ndl = dot(n, l);
  const a = L.ka;
  const d = L.kd * Math.max(0, ndl);
  let s = 0;
  if (ndl > 0) {
    if (L.blinn) {
      const h = normalize(add(l, v));
      s = L.ks * Math.pow(Math.max(0, dot(n, h)), L.shininess);
    } else {
      const r = reflect(scale(l, -1), n);
      s = L.ks * Math.pow(Math.max(0, dot(r, v)), L.shininess);
    }
  }
  return { a, d, s };
}

/** Combine the enabled terms: ambient and diffuse take the surface colour, specular is the light's (white). */
export function phongColor(p: Vec3, n: Vec3, L: LightParams, base: RGB): RGB {
  const t = phongTerms(p, n, L);
  const ad = (L.terms.ambient ? t.a : 0) + (L.terms.diffuse ? t.d : 0);
  const s = L.terms.specular ? t.s : 0;
  return [clamp01(base[0] * ad + s), clamp01(base[1] * ad + s), clamp01(base[2] * ad + s)];
}

export type ShadeMode = 'flat' | 'gouraud' | 'phong';

/** Camera used by every sphere figure in the lesson. */
export const EYE: Vec3 = [0, 0, 3.2];

export interface RenderInfo {
  /** Strongest specular (highlight) intensity that reached any pixel, 0..ks. */
  peakSpec: number;
  triangles: number;
}

/**
 * Render a unit sphere into `fb` using one of three shading strategies:
 * flat (one colour per triangle, from its centroid and face normal), Gouraud (colour per vertex,
 * interpolated) or Phong (normal interpolated, colour per pixel).
 */
export function renderSphere(fb: Framebuffer, mesh: Mesh, mode: ShadeMode, L: LightParams, base: RGB, bg: RGB): RenderInfo {
  fb.clear(bg);
  const vp = mul(perspective((38 * Math.PI) / 180, fb.w / fb.h, 0.1, 10), lookAt(L.eye, [0, 0, 0]));
  const sv: SVert[] = mesh.positions.map((p) => {
    const s = toScreen(applyPoint(vp, p), fb.w, fb.h);
    return { x: s.x, y: s.y, z: s.z, invW: s.invW };
  });
  const specOn = L.terms.specular;
  let peakSpec = 0;
  const seen = (s: number) => {
    if (specOn && s > peakSpec) peakSpec = s;
  };
  // Gouraud: colour (3) and the specular intensity (1) per vertex, both interpolated
  const vatt = mode === 'gouraud' ? mesh.positions.map((p, i) => [...phongColor(p, mesh.normals[i], L, base), phongTerms(p, mesh.normals[i], L).s]) : [];
  for (const [i, j, k] of mesh.tris) {
    const a = mesh.positions[i], b = mesh.positions[j], c = mesh.positions[k];
    if (mode === 'flat') {
      const centroid = scale(add(add(a, b), c), 1 / 3);
      const fn = normalize(cross(sub(b, a), sub(c, a)));
      const col = phongColor(centroid, fn, L, base);
      const sp = phongTerms(centroid, fn, L).s;
      drawTriangle(fb, sv[i], sv[j], sv[k], () => (seen(sp), col), { cullBack: true });
    } else if (mode === 'gouraud') {
      const A = { ...sv[i], a: vatt[i] }, B = { ...sv[j], a: vatt[j] }, C = { ...sv[k], a: vatt[k] };
      drawTriangle(fb, A, B, C, (f) => (seen(f.a[3]), [f.a[0], f.a[1], f.a[2]]), { cullBack: true });
    } else {
      const na = mesh.normals[i], nb = mesh.normals[j], nc = mesh.normals[k];
      const A = { ...sv[i], a: [...a, ...na] }, B = { ...sv[j], a: [...b, ...nb] }, C = { ...sv[k], a: [...c, ...nc] };
      drawTriangle(
        fb, A, B, C,
        (f) => {
          const p: Vec3 = [f.a[0], f.a[1], f.a[2]], n: Vec3 = [f.a[3], f.a[4], f.a[5]];
          seen(phongTerms(p, n, L).s);
          return phongColor(p, n, L, base);
        },
        { cullBack: true },
      );
    }
  }
  return { peakSpec, triangles: mesh.tris.length };
}

/** Render only one Phong term (as grey levels times the base colour for a and d, white for s). */
export function renderTerm(fb: Framebuffer, mesh: Mesh, term: keyof Terms | 'all', L: LightParams, base: RGB, bg: RGB): RenderInfo {
  const terms: Terms = term === 'all' ? L.terms : { ambient: term === 'ambient', diffuse: term === 'diffuse', specular: term === 'specular' };
  return renderSphere(fb, mesh, 'phong', { ...L, terms }, base, bg);
}

export const sphereMesh = (seg: number) => sphere(seg);
