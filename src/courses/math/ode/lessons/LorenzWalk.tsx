import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Figure, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { fmt } from '../../../../lib/plot';
import type { Palette } from '../../../../lib/theme';
import { color3, textSprite, THREE } from '../../../../lib/three';
import { World3D, type WorldApi, type WorldView } from '../../../../lib/world3d';
import { H, S, SectionWalker, fixedPoints, floorToLorenz, floorZ, ghostOrbit, makeCloud, spread, stepAll, toWorld } from './lorenz3d';

const EYE = 0.3;
const BOUNDS = 4.5;
const N_CLOUD = 400;
const R0 = 1e-3;
const MARKS = [1e-2, 1e-1, 1, 10];
const MARK_LABELS = ['10⁻²', '10⁻¹', '1', '10'];

/** Scientific notation with a superscript exponent, e.g. 3.2 × 10⁻⁴. */
function sci(v: number): string {
  if (!(v > 0)) return '0';
  const e = Math.floor(Math.log10(v));
  if (e >= -1 && e <= 1) return fmt(v, 2);
  const m = v / 10 ** e;
  const sup = String(e)
    .split('')
    .map((c) => ({ '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' })[c])
    .join('');
  return `${fmt(m, 1)} × 10${sup}`;
}

/** Glass floor at z = ρ − 1, the fixed points, the z axis, and (optionally) the attractor's shape. */
function buildStage(scene: THREE.Scene, P: Palette, rho: number, ghost: boolean) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS * 2 + 2, BOUNDS * 2 + 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: color3(P.surface3), transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
  );
  scene.add(floor);
  // grid every 10 units of x and y
  const gpts: THREE.Vector3[] = [];
  for (let k = -40; k <= 40; k += 10) {
    gpts.push(new THREE.Vector3(k * S, 0.002, -BOUNDS - 1), new THREE.Vector3(k * S, 0.002, BOUNDS + 1));
    gpts.push(new THREE.Vector3(-BOUNDS - 1, 0.002, k * S), new THREE.Vector3(BOUNDS + 1, 0.002, k * S));
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gpts), new THREE.LineBasicMaterial({ color: color3(P.lineStrong), transparent: true, opacity: 0.6 })));

  // the z axis (x = y = 0), which the flow never leaves
  const zAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...toWorld(rho, 0, 0, 0)), new THREE.Vector3(...toWorld(rho, 0, 0, 52))]), new THREE.LineDashedMaterial({ color: color3(P.ink3), dashSize: 0.08, gapSize: 0.06 }));
  zAxis.computeLineDistances();
  scene.add(zAxis);
  const zl = textSprite('z축', P.ink2, P.fontBody, 0.16, true);
  zl.position.set(0.12, 0.35, 0);
  scene.add(zl);

  for (const [i, c] of fixedPoints(rho).entries()) {
    const [x, , z] = toWorld(rho, c[0], c[1], c[2]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color3(P.bad), side: THREE.DoubleSide }));
    ring.position.set(x, 0.004, z);
    scene.add(ring);
    const l = textSprite(i === 0 ? 'C⁺' : 'C⁻', P.bad, P.fontBody, 0.18, true);
    l.position.set(x, 0.3, z);
    scene.add(l);
  }

  if (ghost) {
    const pts = ghostOrbit(rho).map(([x, y, z]) => new THREE.Vector3(...toWorld(rho, x, y, z)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: color3(P.ink3), transparent: true, opacity: P.dark ? 0.35 : 0.3 }));
    scene.add(line);
  }
}

interface LzProps {
  rho: number;
  start: { x: number; z: number; yaw: number };
  view: WorldView;
  deps: unknown[];
  api: React.MutableRefObject<WorldApi | null>;
  onKey: (k: string) => boolean;
  label: string;
  setup: (scene: THREE.Scene, P: Palette) => { update: (dt: number) => void };
  children: (full: boolean) => React.ReactNode;
}

function LorenzWorld({ rho, start, view, deps, api, onKey, label, setup, children }: LzProps) {
  const st = useMemo(() => ({ ...start, pitch: 0.1 }), [start]);
  return (
    <World3D
      label={label}
      height={540}
      bounds={BOUNDS}
      ground={() => 0}
      start={st}
      view={view}
      eye={EYE}
      speed={0.9}
      skyDistance={5.5}
      pitchRange={[-1.5, 1.45]}
      api={api}
      deps={[rho, ...deps]}
      onKey={onKey}
      setup={({ scene, palette }) => {
        buildStage(scene, palette, rho, rho === 28);
        return setup(scene, palette);
      }}
    >
      {children}
    </World3D>
  );
}

/** Lorenz (x, y) of a floor point, back to the walker's world (x, z). */
const worldOf = (x: number, y: number): [number, number] => [x * S, -y * S];

/* ─────────────── Figure 1: release a cloud where you stand ─────────────── */

const RHO1 = 28;
const SPOT_START: [number, number] = [-3, 2];
const C1 = fixedPoints(RHO1)[0];
const SPOTS: { id: string; name: string; xy: [number, number] }[] = [
  { id: 'start', name: '처음 자리', xy: SPOT_START },
  { id: 'axis', name: 'z축', xy: [0, 0] },
  { id: 'c', name: 'C⁺', xy: [C1[0], C1[1]] },
];

interface CloudHud {
  t: number;
  spread: number;
  marks: (number | null)[];
  at: [number, number] | null;
}

function CloudFigure() {
  const [view, setView] = useState<WorldView>('walk');
  const [speed, setSpeed] = useState(1.5);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<CloudHud>({ t: 0, spread: 0, marks: MARKS.map(() => null), at: null });
  const api = useRef<WorldApi | null>(null);
  const sim = useRef<{ p: Float64Array | null; k: number; t: number; acc: number; marks: (number | null)[]; ver: number; at: [number, number] | null }>({ p: null, k: 0, t: 0, acc: 0, marks: MARKS.map(() => null), ver: 0, at: null });
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const runRef = useRef(running);
  runRef.current = running;
  const start = useMemo(() => {
    const [x, z] = worldOf(...SPOT_START);
    return { x, z, yaw: -1.06 };
  }, []);

  const release = () => {
    const w = api.current?.get();
    if (!w) return;
    const [x, y] = floorToLorenz(w.x, w.z);
    const s = sim.current;
    s.p = makeCloud([x, y, floorZ(RHO1)], R0, N_CLOUD);
    s.k = 0;
    s.t = 0;
    s.acc = 0;
    s.marks = MARKS.map(() => null);
    s.at = [x, y];
    s.ver++;
    setHud({ t: 0, spread: spread(s.p), marks: s.marks.slice(), at: [x, y] });
    setRunning(true);
  };
  const goTo = (xy: [number, number]) => {
    const [x, z] = worldOf(...xy);
    api.current?.glideTo(x, z, { dur: 1, face: true });
  };

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      ' ': release,
      p: () => setRunning((r) => !r),
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
      '1': () => goTo(SPOTS[0].xy),
      '2': () => goTo(SPOTS[1].xy),
      '3': () => goTo(SPOTS[2].xy),
    };
    act[k]?.();
    return k in act;
  };

  const lastMark = hud.marks.reduce<number>((k, m, i) => (m !== null ? i : k), -1);

  return (
    <Figure
      no={1}
      title="발밑에서 점 구름 풀어 놓기"
      hint="화면을 누르고 W·A·S·D로 걸은 뒤 Space를 눌러 보세요"
      caption={
        <>
          유리 바닥은 두 평형점 C⁺, C⁻가 놓인 평면 z = 27이고, 회색 선은 끌개 위의 긴 궤적 하나입니다. 격자 한 칸은 x, y로 10입니다. "여기서 풀기"를 누르면 발밑을 중심으로 반지름 <M>{'10^{-3}'}</M>인 공 안에 점 {N_CLOUD}개를 놓고, 모두 같은 로렌츠 방정식(ρ = 28)을 RK4(보폭 0.005)로 따라갑니다. 퍼짐은 점들이 무게중심에서 떨어진 거리의 제곱평균제곱근입니다. 키: Space 여기서 풀기, P 멈춤, 1·2·3 처음 자리·z축·C⁺로 가기, V 시점 바꾸기, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <LorenzWorld
          rho={RHO1}
          start={start}
          view={view}
          deps={[]}
          api={api}
          onKey={onKey}
          label="로렌츠 끌개 한가운데의 유리 바닥 위에 서서 점 구름이 퍼지는 것을 보는 3D 장면."
          setup={(scene, P) => {
            const pos = new Float32Array(N_CLOUD * 3);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: color3(P.pos), size: 0.035, sizeAttenuation: true }));
            pts.frustumCulled = false;
            pts.visible = false;
            scene.add(pts);
            const origin = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.05, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color3(P.pos), side: THREE.DoubleSide }));
            origin.visible = false;
            scene.add(origin);
            let lastReport = 0;
            let seen = -1;
            return {
              update(dt) {
                const s = sim.current;
                if (s.ver !== seen) {
                  seen = s.ver;
                  pts.visible = !!s.p;
                  origin.visible = !!s.at;
                  if (s.at) {
                    const [x, z] = worldOf(...s.at);
                    origin.position.set(x, 0.005, z);
                  }
                }
                if (!s.p) return;
                if (runRef.current) {
                  s.acc += dt * speedRef.current;
                  while (s.acc >= H) {
                    s.acc -= H;
                    stepAll(s.p, RHO1);
                    s.k++;
                    s.t = s.k * H;
                    const sp = spread(s.p);
                    MARKS.forEach((m, i) => {
                      if (s.marks[i] === null && sp >= m) s.marks[i] = s.t;
                    });
                  }
                }
                for (let i = 0; i < N_CLOUD; i++) {
                  const w = toWorld(RHO1, s.p[3 * i], s.p[3 * i + 1], s.p[3 * i + 2]);
                  pos[3 * i] = w[0];
                  pos[3 * i + 1] = w[1];
                  pos[3 * i + 2] = w[2];
                }
                geo.attributes.position.needsUpdate = true;
                lastReport += dt;
                if (lastReport > 0.1) {
                  lastReport = 0;
                  setHud({ t: s.t, spread: spread(s.p), marks: s.marks.slice(), at: s.at });
                }
              },
            };
          }}
        >
          {(full) => (
            <>
              <div className="w3-hud">
                t = <strong>{fmt(hud.t, 2)}</strong> · 퍼짐 <strong>{hud.at ? sci(hud.spread) : '–'}</strong>
                <div>
                  {hud.at
                    ? lastMark >= 0
                      ? `퍼짐이 ${MARK_LABELS[lastMark]}을 넘은 시각: ${fmt(hud.marks[lastMark]!, 2)}`
                      : '구름이 아직 처음 크기 그대로 한 점처럼 움직입니다.'
                    : '"여기서 풀기"를 누르면 발밑에서 점 구름이 출발합니다.'}
                </div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small primary onClick={release}>
                    여기서 풀기
                  </Button>
                  {SPOTS.map((s) => (
                    <Button key={s.id} small onClick={() => goTo(s.xy)}>
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </LorenzWorld>
        <div className="controls">
          <div className="btn-row">
            <Button small primary onClick={release}>
              여기서 풀기
            </Button>
            <Button small onClick={() => setRunning((r) => !r)} disabled={!hud.at}>
              {running ? '멈추기' : '이어서'}
            </Button>
          </div>
          <div className="btn-row">
            {SPOTS.map((s) => (
              <Button key={s.id} small onClick={() => goTo(s.xy)}>
                {s.name}로
              </Button>
            ))}
          </div>
          <Slider id="lz1-speed" label="빠르기 (초당 시간)" value={speed} min={0.25} max={4} step={0.25} onChange={setSpeed} format={(v) => fmt(v, 2)} color="var(--pos)" />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {MARKS.map((m, i) => (
              <Readout key={m} label={`퍼짐 ${MARK_LABELS[i]} 도달`} value={hud.marks[i] === null ? '–' : `t = ${fmt(hud.marks[i]!, 2)}`} color={i === lastMark ? 'var(--pos)' : undefined} />
            ))}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: dots on the floor ─────────────── */

const MAX_DOTS = 4000;
const TRAIL = 900;

function SectionFigure() {
  const [rho, setRho] = useState(28);
  const [view, setView] = useState<WorldView>('sky');
  const [speed, setSpeed] = useState(3);
  const [running, setRunning] = useState(true);
  const [hud, setHud] = useState({ t: 0, dots: 0, last: null as [number, number] | null });
  const [clearKey, setClearKey] = useState(0);
  const api = useRef<WorldApi | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const runRef = useRef(running);
  runRef.current = running;
  const start = useMemo(() => {
    const [x, z] = worldOf(-2, -9);
    return { x, z, yaw: 0.2 };
  }, []);

  const onKey = (k: string) => {
    const act: Record<string, () => void> = {
      p: () => setRunning((r) => !r),
      c: () => setClearKey((c) => c + 1),
      v: () => setView((x) => (x === 'walk' ? 'sky' : 'walk')),
    };
    act[k]?.();
    return k in act;
  };

  return (
    <Figure
      no={2}
      title="바닥을 뚫고 지나간 자리"
      hint="궤적이 바닥을 위에서 아래로 뚫을 때마다 점이 남습니다"
      caption={
        <>
          한 점이 (1, 1, 1)에서 출발해 로렌츠 방정식을 따라 움직입니다. 밝은 선은 최근 궤적이고, 궤적이 유리 바닥 z = ρ − 1을 위에서 아래로 뚫고 지나갈 때마다 그 자리에 점을 찍습니다(한 보폭 안에서 직선으로 이어 뚫는 자리를 구합니다). ρ를 바꾸면 바닥 높이도 그 ρ의 평형점 높이로 바뀝니다. 키: P 멈춤, C 점 지우기, V 시점 바꾸기, F 전체 화면.
        </>
      }
    >
      <div className="fig-split">
        <LorenzWorld
          rho={rho}
          start={start}
          view={view}
          deps={[clearKey]}
          api={api}
          onKey={onKey}
          label="로렌츠 궤적이 유리 바닥을 뚫을 때마다 바닥에 점이 찍히는 3D 장면."
          setup={(scene, P) => {
            const walker = new SectionWalker(rho);
            const dotPos = new Float32Array(MAX_DOTS * 3);
            const dotGeo = new THREE.BufferGeometry();
            dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3));
            dotGeo.setDrawRange(0, 0);
            const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: color3(P.neg), size: 0.045, sizeAttenuation: true }));
            dots.frustumCulled = false;
            scene.add(dots);
            let nDots = 0;

            const trailPos = new Float32Array(TRAIL * 3);
            const trailGeo = new THREE.BufferGeometry();
            trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
            const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: color3(P.pos) }));
            trailLine.frustumCulled = false;
            scene.add(trailLine);
            const ring: number[][] = [];
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color: color3(P.pos), emissive: color3(P.pos), emissiveIntensity: 0.8 }));
            scene.add(head);

            let acc = 0;
            let every = 0;
            let lastReport = 0;
            let last: [number, number] | null = null;
            return {
              update(dt) {
                if (runRef.current) {
                  acc += dt * speedRef.current;
                  const n = Math.floor(acc / H);
                  acc -= n * H;
                  walker.advance(
                    n * H,
                    (x, y) => {
                      if (nDots >= MAX_DOTS) return;
                      const [wx, , wz] = toWorld(rho, x, y, floorZ(rho));
                      dotPos.set([wx, 0.006, wz], nDots * 3);
                      nDots++;
                      last = [x, y];
                    },
                    (x, y, z) => {
                      if (++every % 2) return;
                      ring.push([x, y, z]);
                      if (ring.length > TRAIL) ring.shift();
                    },
                  );
                  dotGeo.setDrawRange(0, nDots);
                  dotGeo.attributes.position.needsUpdate = true;
                  ring.forEach((q, i) => {
                    const w = toWorld(rho, q[0], q[1], q[2]);
                    trailPos[3 * i] = w[0];
                    trailPos[3 * i + 1] = w[1];
                    trailPos[3 * i + 2] = w[2];
                  });
                  trailGeo.setDrawRange(0, ring.length);
                  trailGeo.attributes.position.needsUpdate = true;
                  head.position.set(...toWorld(rho, walker.p[0], walker.p[1], walker.p[2]));
                }
                lastReport += dt;
                if (lastReport > 0.15) {
                  lastReport = 0;
                  setHud({ t: walker.t, dots: nDots, last });
                }
              },
            };
          }}
        >
          {(full) => (
            <>
              <div className="w3-hud">
                ρ = <strong>{rho}</strong> · t = <strong>{fmt(hud.t, 1)}</strong> · 바닥의 점 <strong>{hud.dots}</strong>개
                <div>{hud.last ? `마지막으로 뚫은 자리 (x, y) = (${fmt(hud.last[0], 2)}, ${fmt(hud.last[1], 2)})` : '아직 바닥을 뚫지 않았습니다.'}</div>
              </div>
              {full && (
                <div className="w3-hud-bar">
                  <Button small primary onClick={() => setRunning((r) => !r)}>
                    {running ? '멈추기' : '이어서'}
                  </Button>
                  <Button small onClick={() => setClearKey((c) => c + 1)}>
                    처음부터
                  </Button>
                </div>
              )}
            </>
          )}
        </LorenzWorld>
        <div className="controls">
          <Seg label="ρ" value={rho} onChange={(r) => setRho(r)} options={[{ value: 28, label: '28' }, { value: 22, label: '22' }]} />
          <Seg label="시점" value={view} onChange={setView} options={[{ value: 'walk', label: '1인칭' }, { value: 'sky', label: '하늘에서' }]} />
          <Slider id="lz2-speed" label="빠르기 (초당 시간)" value={speed} min={0.5} max={12} step={0.5} onChange={setSpeed} format={(v) => fmt(v, 1)} color="var(--pos)" />
          <div className="btn-row">
            <Button small primary onClick={() => setRunning((r) => !r)}>
              {running ? '멈추기' : '이어서'}
            </Button>
            <Button small onClick={() => setClearKey((c) => c + 1)}>
              처음부터
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="시각 t" value={fmt(hud.t, 1)} />
            <Readout label="바닥의 점" value={`${hud.dots}개`} color="var(--neg)" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LorenzWalk() {
  return (
    <>
      <h2>나비의 몸통에 서기</h2>
      <p>
        <a href={lessonHref('math-differential-equations', 'nonlinear-chaos')}>비선형계와 혼돈</a>에서는 로렌츠 끌개를 밖에서 돌려 보며, <M>{'10^{-8}'}</M>만큼 다르게 출발한 두 궤적이 시각 20쯤 완전히 갈라지는 것을 봤습니다. 이번 장에서는 끌개 안으로 들어갑니다. 바닥은 두 평형점 C⁺, C⁻가 놓인 평면 z = 27이고, 유리로 되어 있어 아래쪽 날개도 내려다볼 수 있습니다.
      </p>
      <MB>{"x' = 10(y - x), \\qquad y' = x(28 - z) - y, \\qquad z' = xy - \\tfrac{8}{3}z"}</MB>
      <p>
        두 점 대신 이번에는 점 {N_CLOUD}개를 한꺼번에 풀어 놓습니다. 발밑을 중심으로 반지름 <M>{'10^{-3}'}</M>인 아주 작은 공 안에 흩뿌린 점들이라, 처음에는 한 점처럼 보입니다. 그림을 한 번 누르면 W·A·S·D로 걷고, 끌어서 둘러봅니다. 바로 위나 아래를 보려면 PgUp·PgDn 키를 쓰거나 화면을 위아래로 끕니다.
      </p>
      <CloudFigure />
      <p>
        처음 자리에서 풀면 구름은 한동안 한 점처럼 같이 날아가다가 점점 길게 늘어납니다. 퍼짐이 <M>{'10^{-2}'}</M>를 넘는 시각은 0.51, <M>{'10^{-1}'}</M>는 2.13, 1은 5.83, 10은 7.45입니다. 퍼짐 10은 날개 하나만 한 크기라서, 그 뒤로는 구름이 거의 커지지 않습니다(끌개 전체에 고르게 퍼지면 약 15입니다). 구름은 두 날개 전체에 퍼진 채 끌개를 따라 흘러 다닙니다. 몇 바퀴 지나면 처음에 한 점이었다는 흔적이 남지 않습니다.
      </p>
      <p>
        이제 2번 키나 "z축으로"를 눌러 바닥 한가운데로 가서 풀어 보세요. 구름이 아래로 떨어지다가 순식간에 두 갈래로 찢어져, 절반은 C⁺ 쪽 날개로, 절반은 C⁻ 쪽 날개로 갑니다. 퍼짐이 10에 닿기까지 1.13밖에 걸리지 않습니다. z축(x = y = 0) 위에서는 <M>{"x' = y' = 0"}</M>이라 흐름이 z축을 벗어나지 않고 곧장 원점으로 내려가는데, 원점은 x, y 방향으로 아주 빠르게 밀어내는 안장점입니다. 축에서 조금이라도 오른쪽에 있던 점과 왼쪽에 있던 점은 서로 다른 날개로 보내집니다.
      </p>
      <p>
        3번 키로 C⁺에 서서 풀면 정반대입니다. 평형점 바로 위라 흐름이 거의 0이고, 구름은 제자리에서 아주 천천히 맴돌며 커집니다. 퍼짐이 <M>{'10^{-2}'}</M>가 되기까지만 28.8이 걸립니다. C⁺는 불안정하지만 그 불안정이 아주 약한 나선이라서, 밀려나는 빠르기가 끌개 위의 평균보다 훨씬 느립니다. 같은 방정식, 같은 크기의 구름이어도 어디서 출발하느냐에 따라 예측할 수 있는 시간이 몇십 배 달라집니다.
      </p>
      <p>
        구름이 늘어날 뿐 부풀지는 않는다는 것도 눈여겨보세요. 점들은 한 방향으로는 길게 늘어나지만 나머지 방향으로는 납작하게 눌려, 공이 아니라 실처럼 됩니다. 로렌츠 계의 발산을 계산하면 이유가 보입니다.
      </p>
      <MB note="부피는 매 순간 같은 비율로 줄어듭니다. 시간 1이 지나면 처음 부피의 약 백만분의 1입니다.">{"\\nabla \\cdot F = \\frac{\\partial x'}{\\partial x} + \\frac{\\partial y'}{\\partial y} + \\frac{\\partial z'}{\\partial z} = -10 - 1 - \\tfrac{8}{3} \\approx -13.67, \\qquad V(t) = V(0)\\,e^{-13.67t}"}</MB>
      <p>
        <a href={lessonHref('math-multivariable', 'vector-theorems')}>발산 정리</a>에 따르면 흐름에 실려 가는 작은 부피는 발산만큼 줄어듭니다. 발산이 어디서나 −13.67이라, 구름의 부피는 한 방향으로 늘어나는 동안에도 빠르게 0으로 줄어듭니다. 늘어나는 방향이 있어 가까운 점들이 갈라지고, 부피는 0으로 줄어드니 결국 모든 점이 부피가 0인 얇은 집합, 곧 끌개 위로 모입니다.
      </p>
      <Callout kind="key">
        혼돈은 늘이기와 접기입니다. 끌개 위의 흐름은 가까운 점들을 한 방향으로 지수적으로 떼어 놓고(늘이기), 동시에 전체 부피를 줄여 끌개 밖으로는 나가지 못하게 합니다(접기). 그래서 점 구름은 터져 흩어지는 대신 끌개 모양의 가는 실로 감깁니다.
      </Callout>

      <h2>바닥에 남는 자국</h2>
      <p>
        3차원 궤적을 통째로 보는 대신, 평면 하나를 정해 놓고 궤적이 그 평면을 뚫는 자리만 기록하는 방법이 있습니다. 이렇게 얻은 점들을 <T en="Poincaré section">푸앵카레 단면</T>이라고 합니다. 연속적인 흐름이 "이번에 뚫은 자리 → 다음에 뚫을 자리"라는 평면 위의 함수로 바뀌므로, 3차원 미분방정식을 2차원 점화식으로 다룰 수 있게 됩니다. 아래 그림에서는 유리 바닥이 그 평면입니다.
      </p>
      <SectionFigure />
      <p>
        ρ = 28에서 점이 수백 개 쌓이면 바닥에 두 개의 가는 선분이 나타납니다. 궤적은 영원히 같은 길을 되풀이하지 않으니 점이 한 곳에 겹치지는 않는데, 그렇다고 바닥 전체에 흩어지지도 않고 선 위에만 찍힙니다. 앞에서 본 부피 수축 때문입니다. 끌개는 부피가 없을 만큼 얇아서, 바닥으로 자르면 면이 아니라 선처럼 보입니다. 확대해 보면 이 선은 한 줄이 아니라 무수히 많은 겹으로 되어 있는데, 이렇게 크기를 바꿔도 비슷한 구조가 되풀이되는 집합을 <T en="fractal">프랙털</T>이라고 합니다.
      </p>
      <p>
        ρ를 22로 낮추면 처음 얼마 동안은 ρ = 28과 비슷하게 두 날개를 오가며 바닥 여기저기를 뚫습니다. 그러다 시각 24쯤부터 한쪽 평형점 근처로 빨려 들어가, 점들이 그 평형점 하나로 모입니다. 이 ρ에서는 C⁺, C⁻가 안정한 평형점이라 혼돈은 잠깐 지나가는 과정일 뿐이고, 결국 끌어당겨지는 곳은 평형점입니다. ρ가 약 24.74를 넘으면 두 평형점이 불안정해져 더는 머물 곳이 없고, 그때부터 궤적은 끌개 위를 영원히 떠돕니다.
      </p>
      <Quiz
        q="같은 크기(반지름 10⁻³)의 점 구름을 끌개의 서로 다른 곳에서 풀었더니, 퍼짐이 10⁻²가 되기까지 걸린 시간이 0.48에서 28.8까지 달랐습니다. 이 결과에서 말할 수 있는 것은?"
        options={['RK4의 오차 때문에 생긴 차이일 뿐이다', '가까운 점들이 갈라지는 빠르기는 공간의 자리마다 다르고, 랴푸노프 지수는 그것을 끌개 전체에서 평균한 값이다', '로렌츠 계는 어떤 출발점에서도 같은 빠르기로 갈라진다', '구름이 클수록 늦게 갈라진다']}
        answer={1}
        explain={<>z축 근처는 원점의 안장점이 x, y 방향으로 강하게 밀어내는 곳이고, C⁺ 근처는 약하게만 밀어내는 곳입니다. 앞 장에서 한 쌍으로 잰 기울기(0.710)와 오래 평균한 랴푸노프 지수(0.898)가 달랐던 것도 같은 이유입니다.</>}
      />
    </>
  );
}
