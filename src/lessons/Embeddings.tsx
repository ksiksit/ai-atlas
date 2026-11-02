import { Fragment, useMemo, useState } from 'react';
import { Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../components/ui';
import { ThreeView, textSprite, color3, THREE } from '../lib/three';
import { type Palette } from '../lib/theme';
import { fmt } from '../lib/plot';

/* ─────────────── toy embedding space ─────────────── */

type Cat = 'people' | 'place' | 'food' | 'animal' | 'job';
const CAT_LABEL: Record<Cat, string> = { people: '사람', place: '나라·도시', food: '음식', animal: '동물', job: '직업' };
const CAT_VAR: Record<Cat, string> = { people: 'var(--c-math)', place: 'var(--c-ml)', food: 'var(--pos)', animal: 'var(--c-dl)', job: 'var(--hl)' };
function catColor(P: Palette, c: Cat) {
  return { people: P.math, place: P.ml, food: P.pos, animal: P.dl, job: P.hl }[c];
}

/** Hand-placed 3D vectors. Real embeddings have hundreds or thousands of learned dimensions. */
const WORDS: { w: string; c: Cat; v: [number, number, number] }[] = [
  { w: '남자', c: 'people', v: [-1.47, 0.34, 0.56] },
  { w: '여자', c: 'people', v: [-1.48, 0.24, -0.59] },
  { w: '왕', c: 'people', v: [-1.35, 1.04, 0.66] },
  { w: '여왕', c: 'people', v: [-1.42, 1.09, -0.57] },
  { w: '왕자', c: 'people', v: [-1.03, 0.58, 0.6] },
  { w: '공주', c: 'people', v: [-1.08, 0.71, -0.63] },
  { w: '소년', c: 'people', v: [-1.01, -0.17, 0.57] },
  { w: '소녀', c: 'people', v: [-1.12, -0.16, -0.64] },
  { w: '한국', c: 'place', v: [1.27, 0.5, 0.95] },
  { w: '서울', c: 'place', v: [1.42, 1.26, 1.09] },
  { w: '일본', c: 'place', v: [1.62, 0.57, 0.43] },
  { w: '도쿄', c: 'place', v: [1.56, 1.4, 0.68] },
  { w: '프랑스', c: 'place', v: [1.42, 0.6, -0.48] },
  { w: '파리', c: 'place', v: [1.46, 1.37, -0.26] },
  { w: '이탈리아', c: 'place', v: [1.63, 0.48, -0.9] },
  { w: '로마', c: 'place', v: [1.66, 1.2, -0.7] },
  { w: '김치', c: 'food', v: [0.9, -1.23, 1.04] },
  { w: '비빔밥', c: 'food', v: [0.73, -1.31, 1.22] },
  { w: '라면', c: 'food', v: [0.97, -1.11, 0.79] },
  { w: '초밥', c: 'food', v: [1.15, -1.15, 0.59] },
  { w: '크루아상', c: 'food', v: [0.97, -1.17, -0.34] },
  { w: '피자', c: 'food', v: [1.17, -1.18, -0.92] },
  { w: '파스타', c: 'food', v: [1.38, -1.3, -1.03] },
  { w: '늑대', c: 'animal', v: [-1.29, -0.61, -0.97] },
  { w: '호랑이', c: 'animal', v: [-0.99, -0.43, -1.5] },
  { w: '사자', c: 'animal', v: [-0.8, -0.3, -1.69] },
  { w: '곰', c: 'animal', v: [-1.34, -0.27, -1.39] },
  { w: '강아지', c: 'animal', v: [-1.1, -1.23, -0.5] },
  { w: '고양이', c: 'animal', v: [-0.8, -1.08, -0.96] },
  { w: '토끼', c: 'animal', v: [-0.5, -1.41, -0.62] },
  { w: '의사', c: 'job', v: [-0.16, 1.77, 0.01] },
  { w: '간호사', c: 'job', v: [-0.46, 1.57, 0.04] },
  { w: '교사', c: 'job', v: [0.08, 1.88, 0.06] },
  { w: '프로그래머', c: 'job', v: [0.29, 1.74, 0.03] },
  { w: '요리사', c: 'job', v: [0.46, 0.95, -0.02] },
];
const BY = Object.fromEntries(WORDS.map((x) => [x.w, x]));
const CATS = Object.keys(CAT_LABEL) as Cat[];

type V3 = [number, number, number];
const cos = (a: number[], b: number[]) => {
  const d = a.reduce((s, x, i) => s + x * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? d / n : 0;
};
function nearest(v: number[], exclude: string[] = [], k = 6) {
  return WORDS.filter((x) => !exclude.includes(x.w))
    .map((x) => ({ w: x.w, c: x.c, s: cos(v, x.v) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
}
const toThree = (v: number[]) => new THREE.Vector3(v[0], v[1], v[2]);

function WordSelect({ id, value, onChange, label }: { id: string; value: string; onChange: (w: string) => void; label: string }) {
  return (
    <div className="ctl">
      <label className="ctl-label" htmlFor={id}>
        <span>{label}</span>
      </label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {CATS.map((c) => (
          <optgroup key={c} label={CAT_LABEL[c]}>
            {WORDS.filter((x) => x.c === c).map((x) => (
              <option key={x.w} value={x.w}>
                {x.w}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function SimBars({ items }: { items: { w: string; c: Cat; s: number }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((n, i) => (
        <div key={n.w} style={{ display: 'grid', gridTemplateColumns: '18px 72px minmax(0,1fr) 44px', gap: 8, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
          <span className="mono" style={{ color: 'var(--ink-3)', fontSize: '0.72rem' }}>
            {i + 1}
          </span>
          <span style={{ fontWeight: i === 0 ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.w}</span>
          <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, n.s) * 100}%`, height: '100%', background: CAT_VAR[n.c] }} />
          </div>
          <span className="mono" style={{ fontSize: '0.78rem', textAlign: 'right' }}>
            {fmt(n.s, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Shared scene builder: dots + labels; returns hit meshes for picking. */
function buildWords(scene: THREE.Scene, P: Palette, emphasis: (w: string) => number) {
  const hits: THREE.Mesh[] = [];
  const geo = new THREE.SphereGeometry(1, 18, 12);
  const hitGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const x of WORDS) {
    const e = emphasis(x.w); // 0 dim, 1 normal, 2 strong
    const col = color3(catColor(P, x.c));
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, transparent: e === 0, opacity: e === 0 ? 0.5 : 1, emissive: col, emissiveIntensity: e === 2 ? 0.35 : 0.1 });
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(e === 2 ? 0.085 : 0.055);
    m.position.copy(toThree(x.v));
    scene.add(m);
    const s = textSprite(x.w, e === 0 ? P.ink3 : P.ink, P.fontBody, e === 2 ? 0.2 : 0.16, e === 2);
    (s.material as THREE.SpriteMaterial).opacity = e === 0 ? 0.62 : 1;
    s.position.copy(toThree(x.v)).add(new THREE.Vector3(0, 0.15, 0));
    scene.add(s);
    const h = new THREE.Mesh(hitGeo, hitMat);
    h.position.copy(m.position);
    h.userData.word = x.w;
    scene.add(h);
    hits.push(h);
  }
  // origin + faint axes
  const o = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: color3(P.ink2) }));
  scene.add(o);
  const axGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -2), new THREE.Vector3(0, 0, 2)]);
  scene.add(new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ color: color3(P.ink3), transparent: true, opacity: 0.35 })));
  return hits;
}

function attachPicker(el: HTMLElement, camera: THREE.Camera, hits: THREE.Object3D[], onPick: (w: string) => void) {
  const ray = new THREE.Raycaster();
  let start: { x: number; y: number } | null = null;
  const canvas = el.querySelector('canvas');
  if (!canvas) return () => {};
  const down = (e: PointerEvent) => (start = { x: e.clientX, y: e.clientY });
  const up = (e: PointerEvent) => {
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(hits, false)[0];
    if (hit) onPick(hit.object.userData.word as string);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointerup', up);
  };
}

function lineBetween(scene: THREE.Scene, a: number[], b: number[], color: string, opacity = 0.8) {
  const g = new THREE.BufferGeometry().setFromPoints([toThree(a), toThree(b)]);
  scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: color3(color), transparent: true, opacity })));
}

/* ─────────────── Figure 1: one-hot vs dense ─────────────── */

const SAMPLE = ['고양이', '강아지', '호랑이', '피자', '김치', '서울'];

function OneHotFigure() {
  const [mode, setMode] = useState<'onehot' | 'dense'>('onehot');
  const sim = (a: string, b: string) => (mode === 'onehot' ? (a === b ? 1 : 0) : cos(BY[a].v, BY[b].v));
  const cellBg = (s: number) => `color-mix(in srgb, var(--accent) ${Math.round(Math.max(0, s) * 85)}%, var(--surface-2))`;
  const vecText = (w: string) => {
    if (mode === 'dense') return `[${BY[w].v.map((x) => fmt(x, 2)).join(', ')}]`;
    const idx = WORDS.findIndex((x) => x.w === w);
    return `[0, …, 0, 1, 0, …, 0]  (${idx + 1}번째만 1)`;
  };
  return (
    <Figure
      no={1}
      title="원-핫 벡터와 임베딩 벡터의 유사도"
      hint="두 방식을 바꿔 보세요"
      caption={<>오른쪽 표의 각 칸은 두 단어 벡터의 코사인 유사도입니다. 원-핫 방식에서는 자기 자신을 뺀 모든 쌍이 0이라 "고양이와 강아지가 고양이와 피자보다 가깝다"는 사실을 표현할 수 없습니다.</>}
    >
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { value: 'onehot', label: '원-핫 (35차원)' },
          { value: 'dense', label: '임베딩 (3차원)' },
        ]}
      />
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
        <div className="tbl-wrap" style={{ margin: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>단어</th>
                <th>벡터</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE.map((w) => (
                <tr key={w}>
                  <td style={{ whiteSpace: 'nowrap' }}>{w}</td>
                  <td className="mono" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {vecText(w)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${SAMPLE.length}, minmax(34px, 1fr))`, gap: 3, minWidth: 300, maxWidth: 400, margin: '0 auto', fontSize: '0.72rem' }}>
            <span />
            {SAMPLE.map((w) => (
              <span key={w} style={{ textAlign: 'center', color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {w}
              </span>
            ))}
            {SAMPLE.map((a) => (
              <Fragment key={a}>
                <span style={{ color: 'var(--ink-2)', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                  {a}
                </span>
                {SAMPLE.map((b) => {
                  const s = sim(a, b);
                  return (
                    <span
                      key={a + b}
                      title={`${a}·${b} = ${fmt(s, 2)}`}
                      style={{ aspectRatio: '1', maxWidth: '100%', display: 'grid', placeItems: 'center', borderRadius: 4, background: cellBg(s), color: s > 0.6 ? 'var(--accent-ink)' : 'var(--ink-2)', fontFamily: 'var(--font-mono)', transition: 'background .25s' }}
                    >
                      {fmt(s, 1)}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
        고양이·강아지 유사도 <strong className="mono">{fmt(sim('고양이', '강아지'), 2)}</strong>, 고양이·피자 유사도 <strong className="mono">{fmt(sim('고양이', '피자'), 2)}</strong>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: 3D word space ─────────────── */

function SpaceFigure() {
  const [sel, setSel] = useState('고양이');
  const neigh = useMemo(() => nearest(BY[sel].v, [sel], 6), [sel]);
  const top = new Set(neigh.slice(0, 5).map((n) => n.w));
  return (
    <Figure
      no={2}
      title="단어들의 3차원 의미 공간"
      hint="단어 점을 클릭하거나 목록에서 고르세요"
      caption={<>선택한 단어(굵게)에서 원점까지, 그리고 코사인 유사도가 높은 다섯 단어까지 선을 그었습니다. 원점에서 본 방향이 비슷할수록 의미가 비슷합니다. 위치는 이해를 돕기 위해 손으로 배치한 예시입니다.</>}
    >
      <div className="fig-split">
        <ThreeView
          height={460}
          camera={[3.2, 2.2, 4.6]}
          deps={[sel]}
          setup={({ scene, camera, el, palette: P }) => {
            const hits = buildWords(scene, P, (w) => (w === sel ? 2 : top.has(w) ? 1 : 0));
            const sv = BY[sel].v;
            lineBetween(scene, [0, 0, 0], sv, P.ink, 0.9);
            for (const n of neigh.slice(0, 5)) {
              lineBetween(scene, [0, 0, 0], BY[n.w].v, catColor(P, n.c), 0.45);
              lineBetween(scene, sv, BY[n.w].v, P.hl, 0.7);
            }
            const off = attachPicker(el, camera, hits, setSel);
            return { dispose: off };
          }}
        />
        <div className="controls">
          <WordSelect id="emb-space-word" label="기준 단어" value={sel} onChange={setSel} />
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>가장 가까운 단어 (코사인 유사도)</div>
          <SimBars items={neigh} />
          <Legend items={CATS.map((c) => ({ color: CAT_VAR[c], label: CAT_LABEL[c] }))} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: analogies ─────────────── */

const PRESETS: { a: string; b: string; c: string; label: string }[] = [
  { a: '왕', b: '남자', c: '여자', label: '왕 − 남자 + 여자' },
  { a: '서울', b: '한국', c: '일본', label: '서울 − 한국 + 일본' },
  { a: '피자', b: '이탈리아', c: '일본', label: '피자 − 이탈리아 + 일본' },
  { a: '강아지', b: '늑대', c: '호랑이', label: '강아지 − 늑대 + 호랑이' },
];

function AnalogyFigure() {
  const [a, setA] = useState('왕');
  const [b, setB] = useState('남자');
  const [c, setC] = useState('여자');
  const r: V3 = [0, 1, 2].map((i) => BY[a].v[i] - BY[b].v[i] + BY[c].v[i]) as V3;
  const res = nearest(r, [a, b, c], 4);
  const ans = res[0].w;
  const presetIdx = PRESETS.findIndex((p) => p.a === a && p.b === b && p.c === c);

  return (
    <Figure
      no={3}
      title="단어로 하는 덧셈과 뺄셈"
      hint="예시를 고르거나 세 단어를 직접 바꿔 보세요"
      caption={<>회색 화살표는 B에서 A로 가는 방향(예: 남자→왕, "왕족다움")입니다. 같은 화살표를 C에 붙이면 별표 위치에 도착하고, 그곳에서 가장 가까운 단어가 답입니다. 계산에 쓴 세 단어는 후보에서 뺍니다.</>}
    >
      <Seg
        value={presetIdx}
        onChange={(i) => {
          if (i < 0) return;
          const p = PRESETS[i];
          setA(p.a);
          setB(p.b);
          setC(p.c);
        }}
        options={PRESETS.map((p, i) => ({ value: i, label: p.label }))}
      />
      <div className="fig-split">
        <ThreeView
          height={420}
          camera={[3.4, 2.4, 4.4]}
          deps={[a, b, c]}
          setup={({ scene, palette: P }) => {
            const strong = new Set([a, b, c, ans]);
            buildWords(scene, P, (w) => (strong.has(w) ? 2 : 0));
            const A = toThree(BY[a].v);
            const B = toThree(BY[b].v);
            const C = toThree(BY[c].v);
            const R = toThree(r);
            const arrow = (from: THREE.Vector3, to: THREE.Vector3, col: string) => {
              const d = to.clone().sub(from);
              const len = d.length();
              if (len < 1e-3) return;
              scene.add(new THREE.ArrowHelper(d.normalize(), from, len, color3(col).getHex(), Math.min(0.18, len * 0.3), 0.09));
            };
            arrow(B, A, P.ink2);
            arrow(C, R, P.ink2);
            const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: color3(P.hl), emissive: color3(P.hl), emissiveIntensity: 0.4 }));
            star.position.copy(R);
            scene.add(star);
            lineBetween(scene, r, BY[ans].v, P.hl, 0.9);
            return {
              update: (dt) => {
                star.rotation.y += dt * 1.5;
              },
            };
          }}
        />
        <div className="controls">
          <WordSelect id="emb-an-a" label="A (출발 단어)" value={a} onChange={setA} />
          <WordSelect id="emb-an-b" label="− B (뺄 단어)" value={b} onChange={setB} />
          <WordSelect id="emb-an-c" label="+ C (더할 단어)" value={c} onChange={setC} />
          <Readout label="A − B + C 의 위치" value={`(${r.map((x) => fmt(x, 2)).join(', ')})`} />
          <Readout label="가장 가까운 단어" value={`${ans} · ${fmt(res[0].s, 3)}`} color="var(--hl)" />
          <SimBars items={res} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Embeddings() {
  return (
    <>
      <h2>단어를 숫자로 바꾸는 가장 단순한 방법</h2>
      <p>
        신경망은 숫자만 계산할 수 있으니 단어도 벡터로 바꿔야 합니다. 가장 쉬운 방법은 사전에 있는 단어마다 번호를 붙이고, 그 번호 자리만 1이고 나머지는 모두 0인 벡터를 만드는 것입니다. 이것을 <T en="one-hot encoding">원-핫 인코딩</T>이라고 합니다. 단어가 5만 개면 벡터도 5만 차원입니다.
      </p>
      <p>
        원-핫 벡터에는 큰 약점이 있습니다. 서로 다른 두 단어의 벡터는 항상 직각이라서 <a href="#vectors">내적</a>이 0입니다. 모든 단어가 다른 모든 단어와 똑같이 남남인 셈이죠. 아래 그림에서 두 방식을 바꿔 가며 비교해 보세요.
      </p>
      <OneHotFigure />

      <h2>의미를 공간에 배치하기</h2>
      <p>
        <T en="embedding">임베딩</T>은 단어를 수백 개 정도의 숫자로 이루어진 촘촘한 벡터로 나타냅니다. 이 숫자들은 사람이 정하지 않고 학습으로 정해집니다. 2013년에 나온 word2vec은 "어떤 단어 주변에 어떤 단어들이 나오는가"를 맞히도록 학습했는데, 그 결과 비슷한 문맥에 등장하는 단어들이 공간에서 가까이 모였습니다. 고양이와 강아지는 "밥을 준다", "털이 빠진다" 같은 비슷한 문장에 등장하니까요.
      </p>
      <Callout kind="intuition">
        "단어의 의미는 그 단어가 어울리는 친구들로 알 수 있다." 언어학자 존 퍼스(J. R. Firth)가 1957년에 한 이 말이 임베딩의 출발점입니다. 의미를 직접 정의하지 않고, 쓰임새가 비슷하면 뜻도 비슷하다고 보는 것입니다.
      </Callout>
      <p>
        실제 모델 안에서 임베딩은 거대한 표 하나입니다. 단어 수 <M>{'V'}</M>만큼의 행과 차원 수 <M>{'d'}</M>만큼의 열이 있는 행렬 <M>{'E'}</M>에서, 단어 번호에 해당하는 행을 꺼내 오면 그것이 그 단어의 벡터입니다. 원-핫 벡터에 이 행렬을 곱하는 것과 같은 계산입니다.
      </p>
      <MB note="원-핫 벡터 x는 E의 한 행만 골라냅니다. E의 값들은 학습 중에 경사하강법으로 계속 바뀝니다.">{'\\mathbf{e}_{\\text{단어}} = E^{\\top}\\mathbf{x}_{\\text{원-핫}}, \\qquad E \\in \\mathbb{R}^{V \\times d}'}</MB>

      <h2>3차원으로 들여다보기</h2>
      <p>
        실제 임베딩은 300차원, 대형 언어 모델에서는 수천 차원이라 그대로 그릴 수 없습니다. 연구자들은 PCA나 t-SNE 같은 방법으로 2~3차원에 눌러 담아 구경합니다. 아래는 그런 그림이 어떤 모습인지 보여 주려고 35개 단어를 3차원에 직접 배치한 예시입니다. 단어를 클릭해서 이웃을 찾아보세요.
      </p>
      <SpaceFigure />
      <p>
        가까움을 잴 때는 보통 점 사이의 거리보다 <a href="#vectors">코사인 유사도</a>를 씁니다. 원점에서 바라본 방향이 얼마나 같은지를 보는 것이죠. 벡터의 길이는 단어가 얼마나 자주 나오는지 같은 다른 요인에 영향을 받기 때문에, 의미를 비교할 때는 방향만 보는 편이 안정적입니다.
      </p>

      <h2>의미에도 방향이 있다</h2>
      <p>
        임베딩 공간에서 가장 유명한 발견은 단어로 덧셈과 뺄셈을 할 수 있다는 것입니다. "남자"에서 "왕"으로 가는 화살표는 "왕족다움"이라는 의미의 방향을 담고 있습니다. 같은 화살표를 "여자"에 더하면 "여왕" 근처에 도착합니다.
      </p>
      <MB>{'\\vec{v}_{\\text{왕}} - \\vec{v}_{\\text{남자}} + \\vec{v}_{\\text{여자}} \\approx \\vec{v}_{\\text{여왕}}'}</MB>
      <AnalogyFigure />
      <Callout kind="warn">
        임베딩은 데이터에 있는 편견도 그대로 배웁니다. 실제 뉴스 기사로 학습한 임베딩에서 "의사 − 남자 + 여자"를 계산하면 "간호사"가 나온다는 연구가 있습니다. 이 예시에서는 직업 단어를 성별 방향과 무관하게 배치했지만, 실제 모델을 만들 때는 이런 편향을 측정하고 줄이는 작업이 꼭 필요합니다.
      </Callout>

      <h2>단어를 넘어서</h2>
      <p>
        임베딩 아이디어는 단어에서 끝나지 않습니다. 문장 전체, 이미지, 소리, 상품, 사용자도 벡터로 만들 수 있습니다. 사진과 그 설명 문장을 같은 공간의 가까운 점으로 보내도록 학습하면 "바닷가의 강아지"라는 글로 사진을 검색할 수 있게 됩니다. 챗봇이 회사 문서를 찾아 답하는 검색 증강 생성(RAG)도 질문과 문서를 임베딩한 뒤 코사인 유사도가 높은 문서를 고르는 방식입니다.
      </p>
      <p>
        한 가지 남은 문제가 있습니다. "배가 고프다"의 배와 "배를 타다"의 배는 뜻이 다른데, 지금까지 본 임베딩 표에서는 같은 벡터를 받습니다. 주변 문맥을 보고 벡터를 그때그때 고쳐 쓰는 장치가 필요한데, 그것이 다음 장의 <a href="#attention">어텐션</a>입니다.
      </p>
      <Callout kind="key">
        임베딩은 단어를 의미 공간의 한 점으로 옮깁니다. 비슷한 쓰임새의 단어는 비슷한 방향을 향하고, 공간 속의 방향 자체가 "성별"이나 "수도" 같은 관계를 담습니다.
      </Callout>
      <Quiz
        q="사전에 단어가 1만 개 있을 때, 원-핫 벡터로 나타낸 '고양이'와 '강아지'의 코사인 유사도는?"
        options={['1', '0.5', '0', '단어에 따라 다르다']}
        answer={2}
        explain={<>두 원-핫 벡터는 1이 있는 자리가 서로 달라서 같은 자리끼리 곱하면 모두 0이 됩니다. 내적이 0이니 코사인 유사도도 0입니다. 어떤 두 단어든 마찬가지라서 원-핫 벡터로는 의미의 가까움을 표현할 수 없습니다.</>}
      />
    </>
  );
}
