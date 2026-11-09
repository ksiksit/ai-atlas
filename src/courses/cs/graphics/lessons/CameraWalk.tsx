import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { useAnimationFrame } from '../../../../lib/canvas';
import { usePalette, type Palette } from '../../../../lib/theme';
import { color3, THREE } from '../../../../lib/three';
import { World3D, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { FILM_H, FILM_W, FLOOR_HALF, TRIP_POINTS, buildScene, camMatrices, ndcDepth, renderFilm, shadeK, trip, type Cam, type SceneObj } from './camscene';
import { applyDir, applyPoint, cssToRgb, normalize, type Mat4, type RGB, type Vec3 } from './gfx';
import './graphics.css';

const EYE = 1.6;
const n2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2).replace('-', '−');
};
const fmtV = (v: number[]) => `(${v.map(n2).join(', ')})`;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Row-major 4×4 (the course's layout) → THREE.Matrix4. */
const m4 = (m: Mat4) => new THREE.Matrix4().set(...(m as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));

function floorColors(P: Palette): [RGB, RGB] {
  return P.dark
    ? [
        [0.36, 0.38, 0.42],
        [0.25, 0.27, 0.3],
      ]
    : [
        [0.86, 0.86, 0.83],
        [0.68, 0.68, 0.65],
      ];
}

function useScene(P: Palette): SceneObj[] {
  return useMemo(() => {
    const [a, b] = floorColors(P);
    return buildScene(a, b);
  }, [P]);
}

/**
 * The scene as one triangle soup for three.js, with the course renderer's lighting baked into vertex colours,
 * so the walkable view and the film look alike. `keep` can drop triangles by their world-space corners.
 */
function sceneGeometry(scene: SceneObj[], keep?: (a: Vec3, b: Vec3, c: Vec3) => boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const o of scene) {
    const wp = o.mesh.positions.map((p) => {
      const q = applyPoint(o.model, p);
      return [q[0], q[1], q[2]] as Vec3;
    });
    const wn = o.mesh.normals.map((n) => normalize(applyDir(o.model, n)));
    for (const [i, j, k] of o.mesh.tris) {
      if (keep && !keep(wp[i], wp[j], wp[k])) continue;
      for (const v of [i, j, k]) {
        pos.push(...wp[v]);
        const s = shadeK(wn[v]);
        // the film writes these values as sRGB bytes; three.js wants linear colours
        c.setRGB(o.color[0] * s, o.color[1] * s, o.color[2] * s, THREE.SRGBColorSpace);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Corners of the frustum cross-section at distance d, in camera space. */
function frustumRect(fovDeg: number, aspect: number, d: number): THREE.Vector3[] {
  const hh = d * Math.tan((fovDeg * Math.PI) / 360);
  const hw = hh * aspect;
  return [new THREE.Vector3(-hw, -hh, -d), new THREE.Vector3(hw, -hh, -d), new THREE.Vector3(hw, hh, -d), new THREE.Vector3(-hw, hh, -d)];
}

/** Line segments of the frustum between distances `from` (0 = the eye) and `to`, with both end rectangles. */
function frustumLines(fovDeg: number, aspect: number, from: number, to: number): THREE.Vector3[] {
  const a = from > 0 ? frustumRect(fovDeg, aspect, from) : [0, 1, 2, 3].map(() => new THREE.Vector3());
  const b = frustumRect(fovDeg, aspect, to);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push(a[i], b[i], b[i], b[(i + 1) % 4]);
    if (from > 0) pts.push(a[i], a[(i + 1) % 4]);
  }
  return pts;
}

function cameraBody(P: Palette): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: color3(P.ink2), roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.26), mat);
  body.position.z = 0.16;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 20), new THREE.MeshStandardMaterial({ color: color3(P.ink), roughness: 0.3 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.03;
  g.add(body, lens);
  return g;
}

const disposeTree = (o: THREE.Object3D) =>
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((y) => y.dispose());
    else mat?.dispose?.();
  });

/* ─────────────── Figure 1: set up a camera and take a picture ─────────────── */

const ASPECT = FILM_W / FILM_H;
const START_CAM: Cam = { eye: [3.5, EYE, 6], yaw: Math.atan2(3.5, 6), pitch: Math.atan2(-0.6, Math.hypot(3.5, 6)), fov: 55, near: 0.3, far: 20 };

function CameraFigure() {
  const P = usePalette();
  const scene = useScene(P);
  const [cam, setCam] = useState<Cam>(START_CAM);
  const [pid, setPid] = useState(TRIP_POINTS[0].id);
  const [inside, setInside] = useState(false);
  const [view, setView] = useState<WorldView>('walk');
  const api = useRef<WorldApi | null>(null);
  const filmRef = useRef<HTMLCanvasElement>(null);
  const texRef = useRef<THREE.CanvasTexture | null>(null);
  const camRef = useRef(cam);
  camRef.current = cam;
  const insideRef = useRef(inside);
  insideRef.current = inside;
  const point = TRIP_POINTS.find((p) => p.id === pid)!;
  const pointRef = useRef(point);
  pointRef.current = point;
  const rigVer = useRef(0);

  const bg = useMemo(() => cssToRgb(P.surface), [P]);
  const film = useMemo(() => renderFilm(scene, cam, bg), [scene, cam, bg]);
  const tr = trip(point.p, cam);

  useEffect(() => {
    rigVer.current++;
  }, [cam, pid]);

  // copy the framebuffer to the canvas shown beside the view and on the picture plane inside it
  useEffect(() => {
    const cv = filmRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(film.fb.color), FILM_W, FILM_H), 0, 0);
    if (tr.inside) {
      const [x, y] = tr.pixel;
      ctx.strokeStyle = P.hl;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 0.5);
      ctx.lineTo(x + 5, y + 0.5);
      ctx.moveTo(x + 0.5, y - 5);
      ctx.lineTo(x + 0.5, y + 5);
      ctx.stroke();
    }
    if (texRef.current) texRef.current.needsUpdate = true;
  }, [film, tr.inside, tr.pixel[0], tr.pixel[1], P]);

  const placeHere = () => {
    const w = api.current?.get();
    if (!w) return;
    setCam((c) => ({ ...c, eye: [w.x, EYE, w.z], yaw: w.yaw, pitch: w.pitch }));
    setInside(false);
  };
  const enter = () => {
    const c = camRef.current;
    api.current?.place({ x: c.eye[0], z: c.eye[2], yaw: c.yaw, pitch: c.pitch });
    setView('walk');
    setInside(true);
  };
  const onMove = (w: { x: number; z: number; yaw: number; pitch: number }) => {
    if (!insideRef.current) return;
    const c = camRef.current;
    if (Math.hypot(w.x - c.eye[0], w.z - c.eye[2]) > 0.02 || Math.abs(w.yaw - c.yaw) > 0.01 || Math.abs(w.pitch - c.pitch) > 0.01) setInside(false);
  };
  const onKey = (k: string) => {
    const act: Record<string, () => void> = { c: placeHere, i: () => (insideRef.current ? setInside(false) : enter()), v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')) };
    act[k]?.();
    return k in act;
  };

  const status = !tr.front ? '이 점은 카메라 뒤에 있습니다.' : tr.inside ? '이 점은 시야 사각뿔 안에 있어서 사진에 찍힙니다.' : tr.ndc[2] > 1 ? '이 점은 far보다 멀어서 잘려 나갑니다.' : tr.ndc[2] < -1 ? '이 점은 near보다 가까워서 잘려 나갑니다.' : '이 점은 시야 사각뿔 옆으로 벗어나 사진 밖에 있습니다.';

  return (
    <Figure
      no={1}
      title="장면 속에 카메라를 세우고 찍기"
      hint="걸어가서 C로 카메라를 세우고, I로 카메라 안에 들어가 보세요"
      caption={
        <>
          선으로 그린 사각뿔이 카메라의 <T en="view frustum">시야 사각뿔</T>이고, 그 안의 사각형이 카메라가 찍은 사진입니다. 사진은 three.js가 아니라 이 과목에서 만든 래스터화 코드가 카메라의 뷰·투영 행렬로 한 픽셀씩 칠한 160×120 그림입니다. 노란 선은 고른 점에서 카메라 눈까지의 시선이고, 그 선이 화면을 뚫는 자리가 사진 속 십자 표시입니다. 키: C 카메라 세우기, I 카메라 안으로 들어가기와 나오기, V 시점, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <World3D
          label="카메라를 세우고 시야 사각뿔과 사진을 보는 3D 장면."
          height={540}
          bounds={FLOOR_HALF + 1}
          ground={() => 0}
          start={{ x: 6.5, z: 7, yaw: Math.atan2(6.5, 7), pitch: -0.12 }}
          eye={EYE}
          speed={1.6}
          skyDistance={5.5}
          fov={inside ? cam.fov : 62}
          view={view}
          api={api}
          deps={[scene]}
          onMove={onMove}
          onKey={onKey}
          setup={({ scene: s3, palette }) => {
            s3.add(new THREE.Mesh(sceneGeometry(scene), new THREE.MeshBasicMaterial({ vertexColors: true })));

            const tex = new THREE.CanvasTexture(filmRef.current!);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            texRef.current = tex;

            const marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: color3(palette.hl) }));
            s3.add(marker);

            const rig = new THREE.Group();
            rig.rotation.order = 'YXZ';
            s3.add(rig);
            let seen = -1;
            const build = () => {
              for (const ch of [...rig.children]) {
                rig.remove(ch);
                disposeTree(ch);
              }
              const c = camRef.current;
              rig.position.set(c.eye[0], c.eye[1], c.eye[2]);
              rig.rotation.set(c.pitch, c.yaw, 0);
              rig.add(cameraBody(palette));
              const lineMat = new THREE.LineBasicMaterial({ color: color3(palette.accent) });
              rig.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(frustumLines(c.fov, ASPECT, 0, c.far)), lineMat));
              const nr = frustumRect(c.fov, ASPECT, c.near);
              rig.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([nr[0], nr[1], nr[1], nr[2], nr[2], nr[3], nr[3], nr[0]]), lineMat));
              const r1 = frustumRect(c.fov, ASPECT, 1);
              const pic = new THREE.Mesh(new THREE.PlaneGeometry(r1[1].x - r1[0].x, r1[2].y - r1[1].y), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
              pic.position.z = -1;
              rig.add(pic);
              // the sight line from the chosen point to the eye, and where it pierces the picture
              const t = trip(pointRef.current.p, c);
              const v = new THREE.Vector3(t.view[0], t.view[1], t.view[2]);
              const hl = color3(palette.hl);
              rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), v]), new THREE.LineBasicMaterial({ color: hl })));
              if (t.front) {
                const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: hl }));
                dot.position.set(v.x / -v.z, v.y / -v.z, -1 + 0.002);
                rig.add(dot);
              }
              marker.position.set(...pointRef.current.p);
            };
            return {
              update() {
                if (seen !== rigVer.current) {
                  seen = rigVer.current;
                  build();
                }
                rig.visible = !insideRef.current;
              },
              dispose() {
                tex.dispose();
                texRef.current = null;
              },
            };
          }}
        >
          <div className="w3-hud">
            {inside ? (
              <>
                지금 카메라 안에 있습니다. 시야각 <strong>{cam.fov}°</strong>
                <div>움직이면 카메라에서 나옵니다.</div>
              </>
            ) : (
              <>
                카메라 시야각 <strong>{cam.fov}°</strong> · near <strong>{n2(cam.near)}</strong> · far <strong>{n2(cam.far)}</strong>
              </>
            )}
          </div>
        </World3D>
        <div className="controls">
          <div>
            <canvas ref={filmRef} width={FILM_W} height={FILM_H} style={{ width: '100%', aspectRatio: `${FILM_W} / ${FILM_H}`, imageRendering: 'pixelated', border: '1px solid var(--line)', display: 'block' }} aria-label="카메라가 찍은 160×120 사진" />
            <div className="gx-small">이 과목의 래스터화 코드로 찍은 사진 (160×120)</div>
          </div>
          <div className="btn-row">
            <Button small primary onClick={placeHere}>
              여기에 카메라 세우기
            </Button>
            <Button small onClick={() => (inside ? setInside(false) : enter())}>
              {inside ? '카메라에서 나오기' : '카메라 안으로'}
            </Button>
          </div>
          <Slider id="cw-fov" label="시야각 (세로)" value={cam.fov} min={20} max={100} step={1} onChange={(v) => setCam((c) => ({ ...c, fov: v }))} format={(v) => `${v}°`} color="var(--c-cs-1)" />
          <Slider id="cw-near" label="near" value={cam.near} min={0.1} max={4} step={0.1} onChange={(v) => setCam((c) => ({ ...c, near: v, far: Math.max(c.far, v + 1) }))} format={n2} color="var(--c-cs-1)" />
          <Slider id="cw-far" label="far" value={cam.far} min={3} max={20} step={0.5} onChange={(v) => setCam((c) => ({ ...c, far: v, near: Math.min(c.near, v - 1) }))} format={n2} color="var(--c-cs-1)" />
          <Seg label="따라갈 점" value={pid} onChange={setPid} options={TRIP_POINTS.map((p) => ({ value: p.id, label: p.short }))} />
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <tbody>
                <tr>
                  <td>월드</td>
                  <td className="num">{fmtV(tr.world)}</td>
                </tr>
                <tr>
                  <td>뷰 (카메라)</td>
                  <td className="num">{fmtV(tr.view.slice(0, 3))}</td>
                </tr>
                <tr>
                  <td>클립</td>
                  <td className="num">{fmtV(tr.clip)}</td>
                </tr>
                <tr>
                  <td>NDC</td>
                  <td className="num">{tr.front ? fmtV(tr.ndc) : '—'}</td>
                </tr>
                <tr>
                  <td>픽셀</td>
                  <td className="num">{tr.inside ? `(${tr.pixel.map((v) => v.toFixed(1)).join(', ')})` : '사진 밖'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="gx-note" data-good={tr.inside ? '' : undefined}>
            {status}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: move the world, then squash the frustum into a box ─────────────── */

const CAM2_EYE: Vec3 = [1.2, 1.7, 7.5];
const CAM2_BASE = { eye: CAM2_EYE, yaw: Math.atan2(1.7, 7.5), pitch: Math.atan2(-0.8, Math.hypot(1.7, 7.5)), fov: 50, far: 14 };
/** Where the camera ends up after the view transform (looking down −z), and the size of the NDC box on display. */
const ANCHOR: Vec3 = [0, 1.6, 5.5];
const K = 1.6;
const BOX_FRONT = 4.5;
const STAGES = ['월드 공간', '뷰 공간', 'NDC 상자'];

function clipShader(mat: THREE.Material, u: { uClip: { value: number }; uMin: { value: THREE.Vector3 }; uMax: { value: THREE.Vector3 } }) {
  // three.js's own clipping planes ignore w, which a projective model matrix makes ≠ 1: clip by hand after dividing.
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec4 vWorldH;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWorldH = modelMatrix * vec4( transformed, 1.0 );');
    sh.fragmentShader =
      'varying vec4 vWorldH;\nuniform float uClip;\nuniform vec3 uMin;\nuniform vec3 uMax;\n' +
      sh.fragmentShader.replace('void main() {', 'void main() {\n  if ( uClip > 0.5 ) { vec3 wp = vWorldH.xyz / vWorldH.w; if ( any( lessThan( wp, uMin ) ) || any( greaterThan( wp, uMax ) ) ) discard; }');
  };
}

function PipelineFigure() {
  const P = usePalette();
  const scene = useScene(P);
  const [near, setNear] = useState(1);
  const [stage, setStage] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [clip, setClip] = useState(true);
  const [view, setView] = useState<WorldView>('walk');
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const nearRef = useRef(near);
  nearRef.current = near;
  const clipRef = useRef(clip);
  clipRef.current = clip;

  useAnimationFrame((dt) => {
    if (target === null) return;
    setStage((s) => {
      const d = target - s;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt / 1.4);
      if (Math.abs(d) < 1e-4) {
        setTarget(null);
        return target;
      }
      return s + step;
    });
  }, target !== null);

  const go = (t: number) => {
    if (reducedMotion()) {
      setStage(t);
      setTarget(null);
    } else setTarget(t);
  };

  const cam: Cam = { ...CAM2_BASE, near };
  const half = (2 * cam.far * near) / (cam.far + near);
  const stageIdx = Math.round(stage);

  const onKey = (k: string) => {
    const act: Record<string, () => void> = { '1': () => go(0), '2': () => go(1), '3': () => go(2), v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')) };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={2}
      title="세상을 카메라 앞으로, 사각뿔을 상자로"
      hint="단계를 바꾸며 장면 전체가 움직이는 것을 보세요"
      caption={
        <>
          장면 전체에 4×4 행렬 하나를 곱해 그립니다. 뷰 공간 단계에서는 뷰 행렬 V를, NDC 상자 단계에서는 투영 행렬 P와 원근 나눗셈까지 적용합니다. 보기 좋게 상자를 {K}배로 키워 바닥 위에 올리고, 원래 장면이 있던 자리는 흐린 바닥으로 남겼습니다. 카메라 뒤쪽이나 시야에서 아주 먼 옆쪽 바닥은 처음부터 빼고 그렸습니다. 키: 1·2·3 단계, V 시점, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <World3D
          label="장면 전체가 뷰 변환과 투영 변환을 거쳐 NDC 상자로 바뀌는 3D 장면."
          height={540}
          bounds={10}
          ground={() => 0}
          start={{ x: 4.5, z: 8.5, yaw: Math.atan2(4.5, 5.5), pitch: -0.1 }}
          eye={EYE}
          speed={1.8}
          skyDistance={7}
          view={view}
          deps={[scene]}
          onKey={onKey}
          setup={({ scene: s3, palette }) => {
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: color3(palette.surface2) }));
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.01;
            s3.add(floor);

            const { V } = camMatrices(cam);
            const Vm = m4(V);
            const P0 = camMatrices({ ...cam, near: 0.5 }).P;
            // keep triangles that stay well in front of the camera and not absurdly far to the side once projected
            const keep = (...ps: Vec3[]) =>
              ps.every((p) => {
                const v = applyPoint(V, p);
                if (v[2] > -0.4) return false;
                const x = (P0[0] * v[0]) / -v[2];
                const y = (P0[5] * v[1]) / -v[2];
                return Math.abs(x) < 4 && Math.abs(y) < 4;
              });

            const uniforms = { uClip: { value: 0 }, uMin: { value: new THREE.Vector3(-K - 0.01, -0.01, BOX_FRONT - 2 * K - 0.01) }, uMax: { value: new THREE.Vector3(K + 0.01, 2 * K + 0.01, BOX_FRONT + 0.01) } };
            const group = new THREE.Group();
            group.matrixAutoUpdate = false;
            s3.add(group);
            const sceneMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
            clipShader(sceneMat, uniforms);
            const mesh = new THREE.Mesh(sceneGeometry(scene, keep), sceneMat);
            mesh.frustumCulled = false;
            group.add(mesh);

            // the camera, placed by its pose (the inverse of V), so the group's matrix carries it along
            const pose = Vm.clone().invert();
            const body = cameraBody(palette);
            body.matrixAutoUpdate = false;
            body.matrix.copy(pose);
            group.add(body);
            const frMat = new THREE.LineBasicMaterial({ color: color3(palette.accent) });
            clipShader(frMat, uniforms);
            const frustum = new THREE.LineSegments(new THREE.BufferGeometry(), frMat);
            frustum.matrixAutoUpdate = false;
            frustum.matrix.copy(pose);
            frustum.frustumCulled = false;
            group.add(frustum);
            let builtNear = -1;

            const A1 = new THREE.Matrix4().makeTranslation(ANCHOR[0], ANCHOR[1], ANCHOR[2]);
            const G1 = A1.clone().multiply(Vm);
            const p1 = new THREE.Vector3();
            const q1 = new THREE.Quaternion();
            const s1 = new THREE.Vector3();
            G1.decompose(p1, q1, s1);
            const D = new THREE.Matrix4().makeTranslation(0, K, BOX_FRONT - K).multiply(new THREE.Matrix4().makeScale(K, K, -K));
            const qi = new THREE.Quaternion();
            const tmpQ = new THREE.Quaternion();
            const tmpP = new THREE.Vector3();
            const one = new THREE.Vector3(1, 1, 1);
            return {
              update() {
                const n = nearRef.current;
                if (n !== builtNear) {
                  builtNear = n;
                  // the frustum from near to far: after projection these twelve edges are exactly the NDC box
                  frustum.geometry.dispose();
                  frustum.geometry = new THREE.BufferGeometry().setFromPoints(frustumLines(cam.fov, ASPECT, n, cam.far));
                }
                const st = stageRef.current;
                let M: THREE.Matrix4;
                if (st <= 1) {
                  tmpQ.slerpQuaternions(qi, q1, st);
                  tmpP.copy(p1).multiplyScalar(st);
                  M = new THREE.Matrix4().compose(tmpP, tmpQ, one);
                } else {
                  const s = st - 1;
                  const G2 = D.clone().multiply(m4(camMatrices({ ...cam, near: n }).P)).multiply(Vm);
                  M = new THREE.Matrix4();
                  for (let i = 0; i < 16; i++) M.elements[i] = (1 - s) * G1.elements[i] + s * G2.elements[i];
                }
                group.matrix.copy(M);
                group.matrixWorldNeedsUpdate = true;
                body.visible = st <= 1.001;
                uniforms.uClip.value = clipRef.current && st >= 1.999 ? 1 : 0;
              },
            };
          }}
        >
          <div className="w3-hud">
            지금: <strong>{stage <= 0.001 ? STAGES[0] : stage >= 1.999 ? STAGES[2] : Math.abs(stage - 1) < 0.001 ? STAGES[1] : stage < 1 ? '월드 → 뷰' : '뷰 → NDC'}</strong>
          </div>
        </World3D>
        <div className="controls">
          <Seg label="단계" value={target ?? stageIdx} onChange={go} options={STAGES.map((s, i) => ({ value: i, label: s }))} />
          <Slider id="cw2-stage" label="변환 진행" value={stage} min={0} max={2} step={0.01} onChange={(v) => { setTarget(null); setStage(v); }} format={(v) => n2(v)} color="var(--c-cs-1)" />
          <Slider id="cw2-near" label="near" value={near} min={0.5} max={3} step={0.1} onChange={setNear} format={n2} color="var(--c-cs-1)" />
          <Check label="상자 밖 잘라내기 (NDC 상자 단계)" checked={clip} onChange={setClip} />
          <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
            {view === 'walk' ? '하늘에서 보기' : '1인칭으로'}
          </Button>
          <div className="tbl-wrap" style={{ margin: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>카메라에서 거리</th>
                  <th style={{ textAlign: 'right' }}>NDC 깊이 z</th>
                </tr>
              </thead>
              <tbody>
                {[near, 2, 4, 8, cam.far].map((d, i) => (
                  <tr key={i}>
                    <td className="num">{n2(d)}</td>
                    <td className="num">{n2(ndcDepth(d, near, cam.far))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Readout label="상자 깊이의 앞쪽 절반이 쓰이는 거리" value={`${n2(near)} ~ ${n2(half)}`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function CameraWalk() {
  const L = (id: string) => lessonHref('cs-graphics', id);
  return (
    <>
      <h2>카메라도 장면 속의 물체입니다</h2>
      <p>
        <a href={L('transforms')}>변환과 카메라</a>에서는 슬라이더로 카메라를 돌리며 화면이 바뀌는 것을 봤습니다. 이번에는 카메라를 장면 속에 직접 세워 봅니다. 카메라도 위치와 방향이 있는 물체일 뿐이고, 카메라가 찍는 것은 눈에서 뻗어 나가는 네모난 사각뿔 안에 든 것뿐입니다. 이 사각뿔을 <T en="view frustum">시야 사각뿔</T>이라고 합니다. 앞쪽 끝은 near 평면, 뒤쪽 끝은 far 평면으로 잘려 있어서 정확히는 꼭대기가 잘린 사각뿔입니다.
      </p>
      <p>
        아래 그림을 한 번 누르면 W·A·S·D나 화살표 키로 걷고, 화면을 끌어 둘러볼 수 있습니다. 휴대폰에서는 왼쪽 아래의 동그란 막대로 걷습니다. 마음에 드는 자리에서 C 키나 "여기에 카메라 세우기"를 누르면, 지금 여러분의 눈 위치와 방향에 카메라가 놓이고 사진을 한 장 찍습니다.
      </p>
      <CameraFigure />
      <p>
        처음 설정에서 빨간 상자의 위쪽 모서리 (0.8, 1.6, 0.8)는 카메라 좌표로 (0.29, 0.50, −5.83)입니다. 카메라에서 앞으로 5.83, 오른쪽으로 0.29, 위로 0.50 떨어져 있다는 뜻입니다. 투영 행렬과 원근 나눗셈을 거치면 NDC (0.07, 0.17, 0.93)이 되고, 160×120 사진에서는 (85.7, 50.0) 픽셀입니다. 그림의 노란 시선을 보면 이 계산이 무엇인지 알 수 있습니다. 점에서 카메라 눈까지 직선을 긋고, 그 직선이 화면을 뚫는 자리를 찾는 것입니다. 닮은 삼각형으로 보면 화면 위치는 옆으로 떨어진 거리를 앞으로 떨어진 거리로 나눈 값입니다.
      </p>
      <MB note="f = 1 / tan(시야각/2), a는 화면의 가로세로 비율입니다. 앞으로 떨어진 거리 −z로 나누는 것이 원근 나눗셈입니다.">{'x_{\\text{NDC}} = \\frac{f}{a}\\cdot\\frac{x_v}{-z_v}, \\qquad y_{\\text{NDC}} = f\\cdot\\frac{y_v}{-z_v}'}</MB>
      <p>
        시야각을 좁히면 사각뿔이 가늘어지고 사진 속 물체가 커집니다. 망원 렌즈입니다. 처음 자리에서 far를 8로 줄이면 파란 공, 초록 기둥, 가장 먼 회색 기둥이 사진에서 사라집니다. 그 앞의 회색 기둥은 카메라에서 직선거리로는 9쯤 떨어져 있지만 남습니다. near와 far는 직선거리가 아니라 카메라가 보는 정면 방향으로 잰 깊이(−z)로 자르는데, 이 기둥은 비스듬히 옆에 있어서 깊이가 7.93이기 때문입니다. near를 크게 하면 카메라 가까이의 바닥이 사라집니다. 이 과목의 작은 렌더러는 삼각형을 자르는 대신, 깊이가 NDC의 −1보다 작거나 1보다 큰 픽셀을 하나씩 버리는 방식으로 이 경계를 지킵니다.
      </p>
      <p>
        이제 "카메라 안으로"를 누르거나 I 키를 눌러 보세요. 여러분이 카메라 자리로 옮겨 가고, 눈의 시야각도 카메라와 같아집니다. 지금 보이는 화면은 three.js가 그린 것이고 옆의 사진은 이 과목의 래스터화 코드가 그린 것인데, 같은 뷰 행렬과 투영 행렬을 쓰므로 같은 장면이 같은 자리에 찍힙니다(가로세로 비율이 달라 좌우 폭만 조금 다릅니다). 게임 엔진이 화면을 그리는 것도, 1인칭 게임에서 "내 눈"이 하는 일도 결국 이 카메라 하나입니다.
      </p>

      <h2>카메라를 옮기는 대신 세상을 옮긴다</h2>
      <p>
        래스터화는 카메라가 원점에 있고 −z 방향을 볼 때 가장 간단합니다. 그래서 그래픽스 파이프라인은 카메라를 그 자리로 보내는 대신, 반대로 세상 전체를 움직여서 카메라가 원점에서 −z를 보게 만듭니다. 이것이 <T en="view matrix">뷰 행렬</T> V이고, 카메라의 위치와 방향을 나타내는 변환의 역행렬입니다. 아래 그림에서 "뷰 공간"을 누르면 바닥, 상자, 공, 기둥이 모두 한 덩어리로 돌고 움직여서, 비스듬히 서 있던 카메라가 정면을 보게 됩니다.
      </p>
      <PipelineFigure />

      <h2>사각뿔을 상자로</h2>
      <p>
        "NDC 상자"를 누르면 투영 행렬과 원근 나눗셈을 장면 전체에 적용합니다. 시야 사각뿔이 정육면체로 눌리면서, 카메라 가까이의 물체는 커지고 먼 물체는 작아집니다. 사진 속에서만 그런 것이 아니라 공간 속의 실제 모양이 그렇게 바뀝니다. 나란히 서 있던 기둥들도 상자 안에서는 멀수록 가늘고 낮아져서, 원근이 3차원 모양으로 굳어 있습니다. 사각뿔의 열두 모서리는 정확히 상자의 열두 모서리가 됩니다.
      </p>
      <p>
        이 상자 안에서는 원근이 이미 반영되어 있으므로, 상자를 정면에서 보고 z를 버리면 그대로 사진이 됩니다. z는 버리지 않고 <a href={L('rasterization')}>깊이 버퍼</a>에 남겨 앞뒤를 가리는 데 씁니다. "상자 밖 잘라내기"를 켜면 상자를 벗어난 바닥과 기둥이 잘려 나갑니다. 실제 GPU도 이 단계(정확히는 나눗셈 직전의 클립 공간)에서 삼각형을 상자 경계로 자릅니다. 상자의 면이 모두 평평한 평면이라 사각뿔에서 자르는 것보다 훨씬 쉽기 때문입니다.
      </p>
      <p>
        상자의 깊이 방향을 보면 간격이 고르지 않습니다. near 1, far 14이면 카메라에서 거리 1에서 1.87까지가 상자 깊이의 앞쪽 절반을 다 차지하고, 1.87에서 14까지가 나머지 절반에 몰립니다. 깊이 z가 거리 d에 대해 <M>{'1/d'}</M>로 바뀌기 때문입니다. near를 0.5로 줄이면 앞쪽 절반이 0.97까지로 더 좁아집니다. 깊이 버퍼에 저장할 수 있는 숫자는 정밀도가 정해져 있으니, 먼 곳의 물체들은 깊이 값이 거의 같아져서 앞뒤가 뒤섞이며 깜빡이기도 합니다(z-파이팅). 그래서 near는 장면이 허락하는 한 크게 잡는 것이 좋습니다.
      </p>
      <MB note="n은 near, f는 far, d는 카메라 앞으로의 거리입니다. d = n이면 −1, d = f이면 1입니다.">{'z_{\\text{NDC}} = \\frac{f + n}{f - n} - \\frac{2fn}{(f - n)\\,d}'}</MB>
      <Callout kind="key">
        정점 하나가 화면에 오기까지: 모델 행렬로 세계에 놓고, 뷰 행렬로 세상 전체를 카메라 앞으로 옮기고, 투영 행렬과 원근 나눗셈으로 시야 사각뿔을 정육면체로 누른 뒤, 상자 밖을 잘라 내고, 정면에서 눌러 픽셀로 바꿉니다. 마지막 단계에서 남은 z는 깊이 버퍼로 갑니다.
      </Callout>
      <Quiz
        q="near를 0.01처럼 아주 작게 잡으면 생기기 쉬운 문제는?"
        options={['먼 물체들의 깊이 값이 거의 같아져 앞뒤가 뒤섞인다', '가까운 물체가 화면에서 사라진다', '시야각이 넓어진다', '원근이 사라지고 직교 투영처럼 보인다']}
        answer={0}
        explain={<>앞쪽 절반이 쓰이는 거리는 대략 2n이라, n이 아주 작으면 상자 깊이 거의 전부가 카메라 코앞에 쓰이고 나머지 장면 전체가 1에 가까운 좁은 구간에 몰립니다. 깊이 버퍼의 정밀도가 모자라 z-파이팅이 생깁니다.</>}
      />
    </>
  );
}
