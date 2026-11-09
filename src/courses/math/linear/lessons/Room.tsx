import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { useAnimationFrame } from '../../../../lib/canvas';
import { usePalette, type Palette } from '../../../../lib/theme';
import { color3, textSprite, THREE } from '../../../../lib/three';
import { World3D, makeArrow, pointArrow, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { F_SHAPE, useLaColors } from './draw';
import { nf } from './la';
import { I3, ap3, col3, det3, dot3, eig3, lerp3, norm3, rotZ, unit3, type EigenSpace, type Mat3, type Vec3 } from './la3';

/*
 * Math coordinates (x, y, z) with z up, as in the text, are drawn at world (x, z, −y): three.js has y up.
 * The room is the cube [−2, 2]³ around the origin; the reader stands on its floor (z = −2), which never moves.
 */

const HALF = 2;
const EYE = 1.2;
const toW = (v: Vec3) => new THREE.Vector3(v[0], v[2], -v[1]);

/** The world-space Matrix4 of the math-space matrix m: P m Pᵀ with P: (x, y, z) ↦ (x, z, −y). */
function worldMatrix(m: Mat3): THREE.Matrix4 {
  const P = [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
  const e: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += P[i][a] * m[a * 3 + b] * P[j][b];
      e.push(s);
    }
  return new THREE.Matrix4().set(e[0], e[1], e[2], 0, e[3], e[4], e[5], 0, e[6], e[7], e[8], 0, 0, 0, 0, 1);
}

/** Grid lines on the six walls of the room, in math coordinates. */
function roomSegments(): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  for (let axis = 0; axis < 3; axis++)
    for (const side of [-HALF, HALF])
      for (let k = -HALF; k <= HALF; k++) {
        const a = (axis + 1) % 3;
        const b = (axis + 2) % 3;
        for (const [along, at] of [
          [a, b],
          [b, a],
        ]) {
          const p: Vec3 = [0, 0, 0];
          const q: Vec3 = [0, 0, 0];
          p[axis] = q[axis] = side;
          p[at] = q[at] = k;
          p[along] = -HALF;
          q[along] = HALF;
          out.push([p, q]);
        }
      }
  return out;
}

function segmentsObject(segs: [Vec3, Vec3][], color: THREE.Color, opacity: number): THREE.LineSegments {
  const pts: THREE.Vector3[] = [];
  for (const [p, q] of segs) pts.push(toW(p), toW(q));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

/** The six walls as faint tinted panes; walls across x, y and z take the colours of î, ĵ and k̂. */
function wallsObject(cols: [string, string, string]): THREE.Group {
  const g = new THREE.Group();
  for (let axis = 0; axis < 3; axis++) {
    const mat = new THREE.MeshBasicMaterial({ color: color3(cols[axis]), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
    for (const side of [-HALF, HALF]) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      const corner = (u: number, v: number) => {
        const p: Vec3 = [0, 0, 0];
        p[axis] = side;
        p[a] = u;
        p[b] = v;
        return toW(p);
      };
      const c = [corner(-HALF, -HALF), corner(HALF, -HALF), corner(HALF, HALF), corner(-HALF, HALF)];
      const geo = new THREE.BufferGeometry().setFromPoints([c[0], c[1], c[2], c[0], c[2], c[3]]);
      g.add(new THREE.Mesh(geo, mat));
    }
  }
  return g;
}

/** A solid letter F standing upright in the plane y = 1.2, readable from the starting spot. */
function letterF(color: THREE.Color): THREE.Mesh {
  const shape = new THREE.Shape(F_SHAPE.map(([u, v]) => new THREE.Vector2(u, v)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const w = toW([-1.6 + 1.4 * pos.getX(i), 1.2 + pos.getZ(i), -1.9 + 1.4 * pos.getY(i)]);
    pos.setXYZ(i, w.x, w.y, w.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide }));
}

function floorObject(P: Palette): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: color3(P.surface2) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -HALF - 0.004;
  return floor;
}

function dashedLine(a: Vec3, b: Vec3, color: THREE.Color): THREE.Line {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([toW(a), toW(b)]), new THREE.LineDashedMaterial({ color, dashSize: 0.14, gapSize: 0.09 }));
  line.computeLineDistances();
  return line;
}

const scale3 = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** Two unit vectors spanning the plane with normal n. */
function planeBasis(n: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = unit3([n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]]);
  const b: Vec3 = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  return [a, b];
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ─────────────── Figure 1: twisting the room ─────────────── */

const PRESETS: { id: string; label: string; m: Mat3 }[] = [
  { id: 'stretch', label: '늘이기', m: [1.5, 0, 0, 0, 1, 0, 0, 0, 0.5] },
  { id: 'shear', label: '밀기', m: [1, 0, 0.8, 0, 1, 0, 0, 0, 1] },
  { id: 'rotate', label: '회전', m: rotZ(Math.PI / 3) },
  { id: 'mirror', label: '반사', m: [-1, 0, 0, 0, 1, 0, 0, 0, 1] },
  { id: 'flat', label: '납작하게', m: [1, 0, 0, 0, 1, 0, 0, 0, 0] },
  { id: 'mix', label: '섞기', m: [1.2, 0.4, 0, 0.3, 0.9, 0.5, -0.2, 0.3, 1.1] },
];

const cellText = (v: number) => nf(v, 2).replace('−', '-');

function eigenSummary(es: EigenSpace[]): string {
  if (!es.length) return '없음';
  return es.map((s) => `${nf(s.l, 2)}${s.kind === 'plane' ? '(평면)' : s.kind === 'all' ? '(모든 방향)' : ''}`).join(', ');
}

function RoomFigure() {
  const P = usePalette();
  const cols = useLaColors(P);
  const [pid, setPid] = useState('shear');
  const [A, setA] = useState<Mat3>(PRESETS[1].m);
  const [draft, setDraft] = useState<string[]>(() => PRESETS[1].m.map(cellText));
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showEig, setShowEig] = useState(true);
  const [view, setView] = useState<WorldView>('walk');
  const tRef = useRef(t);
  tRef.current = t;
  const api = useRef<WorldApi | null>(null);

  useAnimationFrame((dt) => {
    setT((x) => {
      const n = Math.min(1, x + dt / 1.8);
      if (n >= 1) setPlaying(false);
      return n;
    });
  }, playing);

  const play = () => {
    if (reducedMotion()) {
      setT(1);
      return;
    }
    setT(0);
    setPlaying(true);
  };
  const pick = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPid(id);
    setA(p.m);
    setDraft(p.m.map(cellText));
    play();
  };
  const edit = (i: number, s: string) => {
    const d = draft.slice();
    d[i] = s;
    setDraft(d);
    const v = parseFloat(s);
    if (Number.isFinite(v)) {
      const m = A.slice() as Mat3;
      m[i] = Math.max(-3, Math.min(3, v));
      setA(m);
      setPid('custom');
    }
  };

  const eig = useMemo(() => eig3(A), [A]);
  const Mt = lerp3(I3, A, t);
  const detA = det3(A);
  const detT = det3(Mt);
  const orient = Math.abs(detT) < 1e-3 ? { text: '납작해짐', color: 'var(--bad)' } : detT < 0 ? { text: '뒤집힘', color: 'var(--bad)' } : { text: '그대로', color: 'var(--good)' };

  const onKey = (k: string) => {
    const n = Number(k);
    if (n >= 1 && n <= PRESETS.length) {
      pick(PRESETS[n - 1].id);
      return true;
    }
    const act: Record<string, () => void> = { ' ': play, v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')), g: () => setShowEig((x) => !x) };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={1}
      title="방 안에서 행렬 하나가 공간 전체를 움직인다"
      hint="변환을 고르고, 방 안을 걸어 다니며 보세요"
      caption={
        <>
          진한 선과 색 유리벽이 변환된 방이고, 흐린 선은 원래 방입니다. 바닥은 움직이지 않는 관찰자의 자리라서 그대로 둡니다. 세 화살표는 î, ĵ, k̂가 옮겨 간 곳, 곧 행렬의 세 열이고 노란 상자는 단위 정육면체가 바뀐 모양입니다. 고유 방향을 켜면 점선 위의 점들이 변환 내내 자기 점선을 벗어나지 않습니다. 키: 1–6 변환 고르기, Space 다시 변환, G 고유 방향, V 시점, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <World3D
          label="3차원 방이 행렬에 따라 변환되는 장면."
          height={540}
          bounds={3.8}
          ground={() => -HALF}
          start={{ x: 0.7, z: 1.9, yaw: 0.1, pitch: 0.24 }}
          eye={EYE}
          speed={1.2}
          skyDistance={4.6}
          view={view}
          api={api}
          deps={[A.join(','), showEig, cols.join(',')]}
          onKey={onKey}
          setup={({ scene, palette }) => {
            scene.add(floorObject(palette));
            const segs = roomSegments();
            scene.add(segmentsObject(segs, color3(palette.ink3), 0.28));

            // everything inside `room` is drawn in its original place and moved by one matrix per frame
            const room = new THREE.Group();
            room.matrixAutoUpdate = false;
            scene.add(room);
            room.add(segmentsObject(segs, color3(palette.ink2), 0.9));
            room.add(wallsObject(cols));
            for (let i = 0; i < 3; i++) {
              const e: Vec3 = [0, 0, 0];
              const f: Vec3 = [0, 0, 0];
              e[i] = -HALF;
              f[i] = HALF;
              room.add(segmentsObject([[e, f]], color3(cols[i]), 0.55));
            }
            room.add(letterF(color3(palette.accent)));
            const cubeGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, -0.5);
            room.add(new THREE.Mesh(cubeGeo, new THREE.MeshBasicMaterial({ color: color3(palette.hl), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
            room.add(new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: color3(palette.hl) })));

            // points on the eigen lines and planes: kept outside `room` (so they stay round) and moved by hand
            const markers: { mesh: THREE.Mesh; p: Vec3 }[] = [];
            if (showEig) {
              const ec = color3(palette.good);
              const dotGeo = new THREE.SphereGeometry(0.05, 14, 10);
              const dotMat = new THREE.MeshBasicMaterial({ color: ec });
              const marker = (p: Vec3) => {
                const mesh = new THREE.Mesh(dotGeo, dotMat);
                scene.add(mesh);
                markers.push({ mesh, p });
              };
              for (const s of eig) {
                if (s.kind === 'line') {
                  scene.add(dashedLine(scale3(s.v, -3.4), scale3(s.v, 3.4), ec));
                  for (const k of [-1.4, -0.7, 0.7, 1.4]) marker(scale3(s.v, k));
                  const lab = textSprite(`λ = ${nf(s.l, 2)}`, palette.good, palette.fontBody, 0.2, true);
                  lab.position.copy(toW(scale3(s.v, 3.6)));
                  scene.add(lab);
                } else if (s.kind === 'plane') {
                  const [a, b] = planeBasis(s.n);
                  const disk = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ color: ec, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
                  disk.lookAt(toW(s.n));
                  scene.add(disk);
                  for (let i = 0; i < 8; i++) {
                    const th = (i / 8) * Math.PI * 2;
                    marker([1.4 * (Math.cos(th) * a[0] + Math.sin(th) * b[0]), 1.4 * (Math.cos(th) * a[1] + Math.sin(th) * b[1]), 1.4 * (Math.cos(th) * a[2] + Math.sin(th) * b[2])]);
                  }
                  const lab = textSprite(`평면 λ = ${nf(s.l, 2)}`, palette.good, palette.fontBody, 0.2, true);
                  lab.position.copy(toW(scale3(a, 2.9)));
                  scene.add(lab);
                }
              }
            }

            // î, ĵ, k̂ after the transformation, drawn from the origin
            const names = ['î', 'ĵ', 'k̂'];
            const arrows = [0, 1, 2].map((i) => {
              const ar = makeArrow(color3(cols[i]), 0.022);
              scene.add(ar);
              const lab = textSprite(names[i], cols[i], palette.fontBody, 0.26, true);
              scene.add(lab);
              return { ar, lab };
            });
            const origin = new THREE.Vector3();
            return {
              update() {
                const m = lerp3(I3, A, tRef.current);
                // a little thickness keeps lighting defined when the room is completely flat
                const mm = Math.abs(det3(m)) < 1e-4 ? (m.map((x, i) => (i % 4 === 0 ? x + 1e-3 : x)) as Mat3) : m;
                room.matrix.copy(worldMatrix(mm));
                room.matrixWorldNeedsUpdate = true;
                for (const mk of markers) mk.mesh.position.copy(toW(ap3(m, mk.p)));
                arrows.forEach(({ ar, lab }, i) => {
                  const c = col3(m, i);
                  const len = norm3(c);
                  ar.visible = lab.visible = len > 1e-3;
                  if (!ar.visible) return;
                  pointArrow(ar, origin, toW(c), len);
                  lab.position.copy(toW(scale3(c, (len + 0.22) / len)));
                });
              },
            };
          }}
        >
          {(full) => (
            <>
              <div className="w3-hud">
                행렬식 <strong>{nf(detT, 2)}</strong> · 부피 <strong>{nf(Math.abs(detT), 2)}</strong>배 · 방향 <span style={{ color: orient.color, fontWeight: 600 }}>{orient.text}</span>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  {PRESETS.map((p) => (
                    <Button key={p.id} small primary={p.id === pid} onClick={() => pick(p.id)}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </World3D>
        <div className="controls">
          <div className="btn-row">
            {PRESETS.map((p) => (
              <Button key={p.id} small primary={p.id === pid} onClick={() => pick(p.id)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>행렬 A (열마다 색: î ĵ k̂)</span>
            </span>
            <div className="mat3-input" role="group" aria-label="행렬 A의 아홉 성분">
              {draft.map((s, i) => (
                <input key={i} type="number" step={0.1} min={-3} max={3} value={s} aria-label={`${Math.floor(i / 3) + 1}행 ${(i % 3) + 1}열`} style={{ color: cols[i % 3], borderColor: cols[i % 3] }} onChange={(e) => edit(i, e.target.value)} />
              ))}
            </div>
          </div>
          <Slider id="room-t" label="변환 진행" value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} format={(v) => nf(v, 2)} color="var(--c-math-3)" />
          <div className="btn-row">
            <Button small onClick={play}>
              다시 변환
            </Button>
            <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
              {view === 'walk' ? '하늘에서 보기' : '1인칭으로'}
            </Button>
          </div>
          <Check label="고유 방향 보기" checked={showEig} onChange={setShowEig} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="det A" value={nf(detA, 3)} />
            <Readout label="지금 부피 배율" value={nf(detT, 2)} color={orient.color} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>실수 고윳값: {eigenSummary(eig)}</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: find the eigenvectors by looking ─────────────── */

const HUNT: { id: string; label: string; m: Mat3 }[] = [
  { id: 'sym', label: '대칭 행렬', m: [2, 1, 0, 1, 2, 0, 0, 0, 0.5] },
  { id: 'tri', label: '일반 행렬', m: [1, 0.5, 0, 0, 2, 0.5, 0, 0, -1] },
  { id: 'cycle', label: '회전', m: [0, 0, 1, 1, 0, 0, 0, 1, 0] },
];
const FIND_DEG = 4;

/** Unit gaze direction in math coordinates from the walker's heading. */
const gazeOf = (yaw: number, pitch: number): Vec3 => [-Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];

function HuntFigure() {
  const P = usePalette();
  const cols = useLaColors(P);
  const [hid, setHid] = useState('sym');
  const A = HUNT.find((h) => h.id === hid)!.m;
  const lines = useMemo(() => eig3(A).filter((s): s is Extract<EigenSpace, { kind: 'line' }> => s.kind === 'line'), [A]);
  const [found, setFound] = useState<number[]>([]);
  const [gaze, setGaze] = useState<Vec3>(gazeOf(0, 0.1));
  const [view, setView] = useState<WorldView>('walk');
  const api = useRef<WorldApi | null>(null);

  useEffect(() => setFound([]), [hid]);

  const Av = ap3(A, gaze);
  const lenAv = norm3(Av);
  const cos = lenAv > 1e-9 ? dot3(gaze, Av) / lenAv : 1;
  const angle = (Math.acos(Math.min(1, Math.abs(cos))) * 180) / Math.PI;
  const onLine = lines.findIndex((s) => (Math.acos(Math.min(1, Math.abs(dot3(s.v, gaze)))) * 180) / Math.PI < FIND_DEG);

  useEffect(() => {
    if (onLine >= 0 && !found.includes(onLine)) setFound((f) => [...f, onLine]);
  }, [onLine, found]);

  const status =
    onLine >= 0
      ? { text: `고유벡터 방향입니다. Av = ${nf(lines[onLine].l, 2)} v${lines[onLine].l < 0 ? ' (Av는 등 뒤를 가리킵니다)' : ''}`, color: 'var(--good)' }
      : { text: `v와 Av가 ${nf(angle, 0)}° 벌어져 있습니다.`, color: 'var(--ink-2)' };

  const onKey = (k: string) => {
    if (k === 'v') {
      setView((x) => (x === 'walk' ? 'sky' : 'walk'));
      return true;
    }
    return false;
  };

  return (
    <Figure
      no={2}
      title="시선으로 고유벡터 찾기"
      hint="고개를 돌리고 들어서 v와 Av가 겹치는 방향을 찾아보세요"
      caption={
        <>
          지금 바라보는 방향이 벡터 v(회색 화살표, 길이 1)이고, 같은 자리에서 나가는 색 화살표가 Av입니다. 벡터는 방향과 길이만 같으면 어디에 그려도 같은 벡터라서, 원점 대신 가슴 앞에서 그렸습니다. 두 화살표가 한 직선에 겹치면 그 방향이 고유벡터이고, 길이의 비가 고윳값입니다. 찾은 방향은 원점을 지나는 점선으로 방에 남습니다. 위나 아래를 끝까지 보려면 화면을 위아래로 끌거나 PgUp·PgDn 키를 씁니다.
        </>
      }
    >
      <div className="fig-split">
        <World3D
          label="바라보는 방향 v와 Av를 비교해 고유벡터를 찾는 3차원 방."
          height={540}
          bounds={3.8}
          ground={() => -HALF}
          start={{ x: 0, z: 1, yaw: 0, pitch: 0.1 }}
          eye={EYE}
          speed={1.2}
          skyDistance={4.6}
          pitchRange={[-1.53, 1.53]}
          view={view}
          api={api}
          deps={[hid, found.join(','), cols.join(',')]}
          onMove={(w) => setGaze(gazeOf(w.yaw, w.pitch))}
          onKey={onKey}
          setup={({ scene, palette, walker }) => {
            scene.add(floorObject(palette));
            scene.add(segmentsObject(roomSegments(), color3(palette.ink3), 0.45));
            for (let i = 0; i < 3; i++) {
              const e: Vec3 = [0, 0, 0];
              const f: Vec3 = [0, 0, 0];
              e[i] = -HALF;
              f[i] = HALF;
              scene.add(segmentsObject([[e, f]], color3(cols[i]), 0.5));
            }
            const ec = color3(palette.good);
            for (const i of found) {
              const s = lines[i];
              scene.add(dashedLine(scale3(s.v, -3.4), scale3(s.v, 3.4), ec));
              const lab = textSprite(`λ = ${nf(s.l, 2)}`, palette.good, palette.fontBody, 0.2, true);
              lab.position.copy(toW(scale3(s.v, 3.6)));
              scene.add(lab);
            }
            const vArrow = makeArrow(color3(palette.ink3), 0.012);
            const avArrow = makeArrow(color3(cols[0]), 0.016);
            scene.add(vArrow, avArrow);
            const chest = new THREE.Vector3();
            return {
              update() {
                const g = gazeOf(walker.yaw, walker.pitch);
                const av = ap3(A, g);
                // the chest: a bit below the eye and a step ahead, so arrows along the gaze stay in view
                chest.set(walker.x - Math.sin(walker.yaw) * 0.3, -HALF + EYE - 0.35, walker.z - Math.cos(walker.yaw) * 0.3);
                pointArrow(vArrow, chest, toW(g), 1.2);
                const l = norm3(av);
                avArrow.visible = l > 1e-3;
                if (avArrow.visible) pointArrow(avArrow, chest, toW(av), Math.min(4, 1.2 * l));
              },
            };
          }}
        >
          <div className="w3-hud">
            찾은 방향 <strong>{found.length}</strong> / {lines.length}
            <div style={{ color: status.color }}>{status.text}</div>
          </div>
        </World3D>
        <div className="controls">
          <Seg label="행렬" value={hid} onChange={setHid} options={HUNT.map((h) => ({ value: h.id, label: h.label }))} />
          <MB>{`A = ${texA(A, cols)}`}</MB>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="v와 Av의 각도" value={`${nf(angle, 1)}°`} color={onLine >= 0 ? 'var(--good)' : undefined} />
            <Readout label="|Av| / |v|" value={nf(lenAv, 2)} />
            <Readout label="Av의 방향" value={cos >= 0 ? '앞쪽' : '뒤쪽'} />
            <Readout label="찾은 방향" value={`${found.length} / ${lines.length}`} />
          </div>
          <div className="btn-row">
            <Button small onClick={() => setView((x) => (x === 'walk' ? 'sky' : 'walk'))}>
              {view === 'walk' ? '하늘에서 보기' : '1인칭으로'}
            </Button>
            <Button small onClick={() => setFound([])}>
              다시 찾기
            </Button>
          </div>
          {found.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
              {found.map((i) => (
                <li key={i}>
                  λ = {nf(lines[i].l, 2)}, 방향 ({lines[i].v.map((x) => nf(x, 2)).join(', ')})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Figure>
  );
}

function texA(m: Mat3, cols: string[]): string {
  const w = (v: number, j: number) => `\\textcolor{${cols[j]}}{${nf(v, 2).replace('−', '-')}}`;
  const row = (i: number) => [0, 1, 2].map((j) => w(m[i * 3 + j], j)).join(' & ');
  return `\\begin{pmatrix} ${row(0)} \\\\ ${row(1)} \\\\ ${row(2)} \\end{pmatrix}`;
}

/* ─────────────── Lesson ─────────────── */

export default function Room() {
  const L = (id: string) => lessonHref('math-linear-algebra', id);
  return (
    <>
      <h2>방 안에 서서 행렬 보기</h2>
      <p>
        <a href={L('matrices')}>2장</a>에서는 2×2 행렬이 평면의 격자를 늘이고, 돌리고, 기울이는 것을 위에서 내려다봤습니다. 3×3 행렬은 같은 일을 공간 전체에 합니다. 이번에는 내려다보는 대신 그 공간 안에 들어가 봅니다. 아래 그림은 한 변이 4인 방이고, 방의 한가운데가 원점입니다. 행렬을 고르면 방의 모든 점 <M>{'\\mathbf{p}'}</M>가 <M>{'A\\mathbf{p}'}</M>로 옮겨 갑니다. 여러분은 움직이지 않는 바닥에 서서 그 모습을 지켜봅니다. 그림은 변환 전(단위행렬)에서 변환 후(A)까지 행렬을 조금씩 섞어 가며 움직임을 보여 줍니다.
      </p>
      <p>
        그림을 한 번 누르면 W·A·S·D나 화살표 키로 걷고, 화면을 끌어 둘러볼 수 있습니다. 휴대폰에서는 왼쪽 아래의 동그란 막대로 걷습니다. 오른쪽 위 단추나 F 키로 전체 화면을 켜면 방 안에 들어선 느낌이 훨씬 강해집니다. 이 장에서는 수학 책처럼 z축이 위쪽입니다.
      </p>
      <MB note="2×2일 때와 같습니다. 행렬의 세 열은 î, ĵ, k̂가 옮겨 간 곳이고, 나머지 모든 점은 그 세 벡터의 선형결합으로 따라옵니다.">{'A = \\begin{pmatrix} | & | & | \\\\ A\\hat{\\imath} & A\\hat{\\jmath} & A\\hat{k} \\\\ | & | & | \\end{pmatrix}, \\qquad A\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix} = x\\,A\\hat{\\imath} + y\\,A\\hat{\\jmath} + z\\,A\\hat{k}'}</MB>
      <RoomFigure />
      <p>
        여러 변환을 골라 보며 공통점을 찾아보세요. 원점은 언제나 제자리에 있습니다. 벽은 기울거나 늘어나도 휘지 않고 평평하게 남으며, 벽 위의 격자선은 서로 평행하고 간격이 고릅니다. 직선은 직선으로, 평면은 평면으로 가는 것이 <T en="linear transformation">선형변환</T>의 성질입니다. "밀기"에서는 바닥과 천장이 서로 반대쪽으로 밀려 옆벽이 비스듬히 눕고, "회전"에서는 방 전체가 z축을 중심으로 60° 돕니다.
      </p>

      <h2>부피와 행렬식</h2>
      <p>
        노란 상자는 î, ĵ, k̂가 만드는 단위 정육면체가 바뀐 모양입니다. 변환 뒤에는 세 열 벡터가 만드는 <T en="parallelepiped">평행육면체</T>가 되고, 그 부피가 행렬식의 절댓값입니다. <a href={L('determinants')}>4장</a>에서 2×2 행렬식이 넓이의 배율이었던 것처럼, 3×3 행렬식은 부피의 배율입니다. 격자의 모든 칸이 똑같이 변하므로 방 전체의 부피도 같은 배율로 바뀝니다. "늘이기"는 x 방향으로 1.5배, z 방향으로 0.5배라서 부피가 0.75배이고, "밀기"와 "회전"은 모양이 크게 바뀌어도 부피는 그대로 1배입니다.
      </p>
      <MB note="첫째 줄을 따라 2×2 행렬식으로 나눠 계산합니다. 세 열 벡터로 쓰면 스칼라 삼중곱 Aî · (Aĵ × Ak̂)와 같습니다.">{'\\det \\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix} = a(ei - fh) - b(di - fg) + c(dh - eg)'}</MB>
      <p>
        "반사"를 고르고 F를 보세요. 행렬식이 −1이 되면서 F가 거울에 비친 글자로 바뀝니다. 방 안을 아무리 돌아다니며 어느 쪽에서 봐도 이 F를 원래 F와 겹치게 볼 수는 없습니다. 오른손을 어떻게 돌려도 왼손이 되지 않는 것과 같습니다. 음수 행렬식은 공간이 <strong>뒤집혔다</strong>는 뜻입니다. "변환 진행" 슬라이더를 천천히 움직이면 뒤집히기 직전에 방이 한 번 납작해지는 순간(행렬식 0)을 지나는 것도 볼 수 있습니다.
      </p>
      <p>
        "납작하게"는 k̂를 0으로 보냅니다. 방 전체가 원점 높이의 얇은 판 하나로 눌리고, 머리 위에 떠 있는 그 판 말고는 아무것도 남지 않습니다. 부피가 0이니 행렬식도 0입니다. 판 위의 한 점이 원래 어느 높이에서 왔는지는 알 길이 없으므로, 이 변환은 되돌릴 수 없습니다. 행렬식이 0인 행렬에 <a href={L('determinants')}>역행렬</a>이 없는 이유를 눈으로 본 것입니다.
      </p>
      <Callout kind="intuition">
        행렬식은 세 가지를 한 숫자로 알려 줍니다. 크기는 부피가 몇 배가 되는지, 부호는 공간이 뒤집혔는지, 0인지 아닌지는 변환을 되돌릴 수 있는지입니다.
      </Callout>

      <h2>방이 움직여도 제 직선을 지키는 방향</h2>
      <p>
        "고유 방향 보기"를 켜고 "다시 변환"을 눌러 보세요. 초록 점선은 원점을 지나는 직선이고, 그 위의 초록 점들은 변환 내내 자기 점선을 벗어나지 않고 그 위에서 미끄러지기만 합니다. 이 방향이 <a href={L('eigen')}>5장</a>의 고유벡터이고, 점선 끝의 λ가 그 방향으로 늘어나는 배율인 고윳값입니다. 그림은 단위행렬 <M>{'I'}</M>에서 <M>{'A'}</M>까지 <M>{'(1-t)I + tA'}</M>로 바꿔 가며 그리는데, <M>{'A\\mathbf{v} = \\lambda\\mathbf{v}'}</M>이면 <M>{'\\big((1-t)I + tA\\big)\\mathbf{v} = \\big((1-t) + t\\lambda\\big)\\mathbf{v}'}</M>라서 도중에도 계속 같은 직선 위에 있습니다. 이렇게 섞는 방식 때문에 "회전"은 도중에 방이 잠깐 작아집니다(<M>{'t = 0.5'}</M>에서 부피 0.75배). 실제 회전이 그렇다는 뜻은 아니고, 끝난 뒤의 부피는 정확히 1배입니다.
      </p>
      <ul>
        <li>
          <strong>늘이기</strong>: 세 좌표축이 그대로 고유벡터이고 고윳값은 1.5, 1, 0.5입니다.
        </li>
        <li>
          <strong>밀기</strong>: 고윳값은 1 하나뿐인데, 직선이 아니라 바닥과 나란한 평면(z = 0) 전체가 고유벡터입니다. 그 평면 위의 점은 아예 움직이지 않습니다.
        </li>
        <li>
          <strong>회전</strong>: 회전축(z축) 하나만 남고 고윳값은 1입니다. 나머지 두 고윳값은 복소수라서 공간 안에 방향으로 나타나지 않습니다.
        </li>
        <li>
          <strong>반사</strong>: 거울에 수직인 x축은 고윳값 −1(방향이 뒤집힘), 거울면인 yz 평면은 고윳값 1입니다.
        </li>
        <li>
          <strong>섞기</strong>: 실수 고윳값은 약 0.44 하나뿐입니다. 3×3 실수 행렬의 특성방정식은 3차식이고, 3차식은 실근이 적어도 하나 있어서 3차원 공간의 선형변환에는 고유 방향이 늘 하나 이상 있습니다.
        </li>
      </ul>

      <h2>시선으로 고유벡터 찾기</h2>
      <p>
        고유벡터를 계산하지 않고 몸으로 찾아볼 수도 있습니다. 아래 그림에서는 여러분이 바라보는 방향이 벡터 <M>{'\\mathbf{v}'}</M>입니다. 고개를 돌리면 <M>{'\\mathbf{v}'}</M>가 바뀌고, 그때마다 <M>{'A\\mathbf{v}'}</M>가 따라 움직입니다. 둘이 한 직선 위에 겹치는 방향, 곧 <M>{'A\\mathbf{v} = \\lambda\\mathbf{v}'}</M>인 방향을 찾으면 그 직선이 방에 초록 점선으로 남습니다.
      </p>
      <HuntFigure />
      <p>
        <strong>대칭 행렬</strong>의 고유 방향 셋은 서로 수직입니다. 하나는 발밑(바로 아래, λ = 0.5)이고 나머지 둘은 바닥과 나란한 대각선 방향(λ = 3과 λ = 1)입니다. 대칭 행렬은 언제나 서로 수직인 고유벡터 세 개를 고를 수 있는데, 이것이 <a href={L('svd')}>특잇값 분해와 PCA</a>의 바탕입니다. <strong>일반 행렬</strong>의 고유 방향은 수직이 아닙니다. 그중 거의 위쪽을 향한 방향은 고윳값이 −1이라서, 그쪽을 보면 Av가 정확히 등 뒤를 가리킵니다. <strong>회전</strong>은 x→y→z→x로 축을 돌리는 행렬로, 대각선 축 (1, 1, 1)을 중심으로 120° 돌립니다. 고유 방향은 이 축 하나뿐이고, 바닥에서 위로 약 35° 올려다본 방향입니다.
      </p>
      <Callout kind="note">
        3차원 고유벡터는 물리에서도 자주 나옵니다. 물체가 회전에 저항하는 정도를 나타내는 3×3 대칭 행렬(관성 텐서)의 고유벡터가 그 물체의 주축입니다. 휴대폰을 던져 돌리면 세 주축 가운데 가장 긴 축과 가장 짧은 축 둘레로는 깔끔하게 돌지만, 중간 축 둘레로 돌리면 공중에서 저절로 뒤집힙니다(테니스 라켓 정리). 3D 그래픽스에서 물체를 돌리고 늘이는 것도 모두 이 장의 3×3 행렬입니다.
      </Callout>
      <Quiz
        q="3×3 행렬 A의 행렬식이 −2입니다. 단위 정육면체는 변환 뒤에 어떻게 될까요?"
        options={['부피가 2배가 되고 공간이 뒤집힌다', '부피가 −2가 되어 사라진다', '부피가 1/2배가 된다', '부피는 그대로이고 공간만 뒤집힌다']}
        answer={0}
        explain={<>행렬식의 크기 2는 부피가 2배가 된다는 뜻이고, 음수 부호는 "반사"처럼 공간이 뒤집힌다는 뜻입니다. 부피 자체는 음수가 될 수 없으므로 부호는 방향만 알려 줍니다.</>}
      />
    </>
  );
}
