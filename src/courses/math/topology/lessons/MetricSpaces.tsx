import { useId, useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useDrag } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { LINE_SETS, SETS, classify, editDistance, hamming, pDist, unitBall, type SetId } from './metric';
import './topology.css';
import './metric.css';

const f2 = (v: number) => (Math.abs(v) < 5e-4 ? '0' : v.toFixed(2));

/* ─────────────── Figure 1: what a ball looks like under each distance ─────────────── */

type MetricId = 'p1' | 'p2' | 'pinf' | 'p' | 'discrete';
const METRIC_LABEL: Record<MetricId, string> = { p1: 'd₁', p2: 'd₂', pinf: 'd∞', p: 'dₚ', discrete: '이산' };

function BallsFigure() {
  const P = usePalette();
  const [mid, setMid] = useState<MetricId>('p1');
  const [p, setP] = useState(3);
  const [r, setR] = useState(1);
  const [chain, setChain] = useState(false);
  const [q, setQ] = useState<[number, number]>([0.6, 0.8]);
  const pv = mid === 'p1' ? 1 : mid === 'p2' ? 2 : mid === 'pinf' ? Infinity : p;
  const R = 2.3; // half-width of the view, in plane units
  const view = useRef({ S: 1, cx: 0, cy: 0 });

  const dist = (x: number, y: number, m: MetricId) => (m === 'discrete' ? (x === 0 && y === 0 ? 0 : 1) : pDist(0, 0, x, y, m === 'p1' ? 1 : m === 'p2' ? 2 : m === 'pinf' ? Infinity : p));
  const inBall = dist(q[0], q[1], mid) < r;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const S = Math.min(w, h) / (2 * R);
      const cx = w / 2, cy = h / 2;
      view.current = { S, cx, cy };
      const X = (x: number) => cx + x * S, Y = (y: number) => cy - y * S;
      // grid
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(X(k) + 0.5, Y(-R));
        ctx.lineTo(X(k) + 0.5, Y(R));
        ctx.moveTo(X(-R), Y(k) + 0.5);
        ctx.lineTo(X(R), Y(k) + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = P.lineStrong;
      ctx.beginPath();
      ctx.moveTo(X(-R), Y(0) + 0.5);
      ctx.lineTo(X(R), Y(0) + 0.5);
      ctx.moveTo(X(0) + 0.5, Y(-R));
      ctx.lineTo(X(0) + 0.5, Y(R));
      ctx.stroke();

      const shape = (pp: number, rad: number, color: string, fill: number, width: number, dash: number[] = []) => {
        const pts = unitBall(pp);
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x * rad), Y(y * rad)) : ctx.moveTo(X(x * rad), Y(y * rad))));
        ctx.closePath();
        if (fill > 0) {
          ctx.fillStyle = alpha(color, fill);
          ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      if (chain) {
        // B₁(r) ⊂ B₂(r) ⊂ B∞(r) ⊂ B₁(2r)
        shape(1, 2 * r, P.ink3, 0, 1.5, [5, 4]);
        shape(Infinity, r, P.pos, 0.08, 2);
        shape(2, r, P.good, 0.1, 2);
        shape(1, r, P.neg, 0.16, 2);
      } else if (mid === 'discrete') {
        // r ≤ 1: only the centre; r > 1: the whole plane
        if (r > 1) {
          ctx.fillStyle = alpha(P.accent, 0.14);
          ctx.fillRect(X(-R), Y(R), 2 * R * S, 2 * R * S);
        }
        ctx.fillStyle = P.accent;
        ctx.beginPath();
        ctx.arc(X(0), Y(0), 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        shape(pv, r, P.accent, 0.14, 2.2, [6, 4]);
      }

      // the point q
      ctx.fillStyle = inBall ? P.good : P.bad;
      ctx.beginPath();
      ctx.arc(X(q[0]), Y(q[1]), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontMono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('q', X(q[0]) + 9, Y(q[1]) - 4);
    },
    [P, mid, pv, r, chain, q, inBall],
    { aspect: 1, maxHeight: 420, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const { S, cx, cy } = view.current;
      return Math.hypot(x - (cx + q[0] * S), y - (cy - q[1] * S)) < 22 ? 'q' : null;
    },
    onDrag: (_, x, y) => {
      const { S, cx, cy } = view.current;
      const c = (v: number) => Math.round(Math.max(-2.2, Math.min(2.2, v)) * 100) / 100;
      setQ([c((x - cx) / S), c((cy - y) / S)]);
    },
    onEmpty: (x, y) => {
      const { S, cx, cy } = view.current;
      const c = (v: number) => Math.round(Math.max(-2.2, Math.min(2.2, v)) * 100) / 100;
      setQ([c((x - cx) / S), c((cy - y) / S)]);
    },
  });

  const shapeName = mid === 'p1' ? '마름모' : mid === 'p2' ? '원' : mid === 'pinf' ? '정사각형' : mid === 'discrete' ? (r > 1 ? '평면 전체' : '중심 한 점') : '둥근 정사각형';
  return (
    <Figure
      no={1}
      title="반지름 r인 공의 모양"
      hint="거리를 바꾸고, 점 q를 끌어 보세요"
      caption={
        <>
          가운데 원점을 중심으로 한 열린 공 <M>{'B(0, r) = \\{ q : d(0, q) < r \\}'}</M>입니다. 경계선이 점선인 것은 경계가 공에 들어가지 않기 때문입니다. 점 q는 공 안에 있으면 초록, 밖에 있으면 빨강입니다. "포함 관계"를 켜면 같은 r로 그린 d₁(파랑), d₂(초록), d∞(주황) 공과 반지름 2r인 d₁ 공(회색 점선)이 차례로 들어 있는 모습이 보입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={mid} onChange={setMid} options={(['p1', 'p2', 'pinf', 'p', 'discrete'] as MetricId[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} label="거리" />
        <Slider label="반지름 r" value={r} min={0.3} max={2} step={0.05} onChange={setR} format={(v) => v.toFixed(2)} />
        {mid === 'p' && <Slider label="p" value={p} min={1} max={8} step={0.25} onChange={setP} format={(v) => v.toFixed(2)} />}
        <Check label="포함 관계 보기" checked={chain} onChange={setChain} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${METRIC_LABEL[mid]} 거리로 그린 반지름 ${r.toFixed(2)}인 공은 ${shapeName} 모양입니다. 점 q = (${q[0]}, ${q[1]})는 이 공 ${inBall ? '안' : '밖'}에 있습니다.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="d₁(0, q)" value={f2(dist(q[0], q[1], 'p1'))} />
            <Readout label="d₂(0, q)" value={f2(dist(q[0], q[1], 'p2'))} />
            <Readout label="d∞(0, q)" value={f2(dist(q[0], q[1], 'pinf'))} />
            <Readout label="이산 거리" value={String(dist(q[0], q[1], 'discrete'))} />
          </div>
          <div className="tp-note">
            {METRIC_LABEL[mid]}{mid === 'p' ? ` (p = ${p.toFixed(2)})` : ''}의 공은 {shapeName} 모양이고, q는 그 {inBall ? '안에' : '밖에'} 있습니다.
          </div>
          <div className="btn-row">
            <Button small onClick={() => setQ([0.6, 0.8])}>q = (0.6, 0.8)</Button>
            <Button small onClick={() => setQ([0.7, 0.7])}>q = (0.7, 0.7)</Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: is there a ball inside? ─────────────── */

const KIND_KO = { interior: '내부의 점', boundary: '경계의 점', exterior: '외부의 점' };

function BallInsideFigure() {
  const P = usePalette();
  const [sid, setSid] = useState<SetId>('disk');
  const S = SETS.find((s) => s.id === sid)!;
  const [pt, setPt] = useState<[number, number]>([0.5, 0.3]);
  const [snap, setSnap] = useState(true);
  const c = classify(S, pt[0], pt[1]);
  const R = 1.8;
  const view = useRef({ k: 1, cx: 0, cy: 0 });

  const place = (x: number, y: number) => {
    let nx = Math.max(-R + 0.05, Math.min(R - 0.05, x)), ny = Math.max(-R + 0.05, Math.min(R - 0.05, y));
    if (snap && Math.abs(S.sd(nx, ny)) < 0.06) [nx, ny] = S.snap(nx, ny);
    setPt([Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000]);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const k = Math.min(w, h) / (2 * R);
      const cx = w / 2, cy = h / 2;
      view.current = { k, cx, cy };
      const X = (x: number) => cx + x * k, Y = (y: number) => cy - y * k;
      ctx.fillStyle = alpha(P.math, 0.16);
      ctx.strokeStyle = P.ink2;
      ctx.lineWidth = 2;
      if (sid === 'disk') {
        ctx.beginPath();
        ctx.arc(X(0), Y(0), k, 0, Math.PI * 2);
        ctx.fill();
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillRect(X(-1), Y(1), 2 * k, 2 * k);
        // left, bottom, right edges are in the set: solid
        ctx.beginPath();
        ctx.moveTo(X(-1), Y(1));
        ctx.lineTo(X(-1), Y(-1));
        ctx.lineTo(X(1), Y(-1));
        ctx.lineTo(X(1), Y(1));
        ctx.stroke();
        // the top edge: solid if kept, dashed if left out
        if (sid === 'notop') ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(X(-1), Y(1));
        ctx.lineTo(X(1), Y(1));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // the largest ball that fits on the point's side of the boundary
      const col = c.kind === 'interior' ? P.good : c.kind === 'exterior' ? P.neg : P.bad;
      if (c.r > 0) {
        ctx.fillStyle = alpha(col, 0.18);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(X(pt[0]), Y(pt[1]), c.r * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // on the boundary: every ball, however small, sticks out on both sides
        for (const rr of [0.25, 0.14, 0.07]) {
          ctx.strokeStyle = alpha(col, 0.8);
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(X(pt[0]), Y(pt[1]), rr * k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = c.member ? col : P.surface;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(X(pt[0]), Y(pt[1]), 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    [P, sid, pt, c.kind, c.r, c.member],
    { aspect: 1, maxHeight: 400, minHeight: 40 },
  );

  useDrag(wrapRef, {
    hit: (x, y) => {
      const { k, cx, cy } = view.current;
      return Math.hypot(x - (cx + pt[0] * k), y - (cy - pt[1] * k)) < 24 ? 'p' : null;
    },
    onDrag: (_, x, y) => {
      const { k, cx, cy } = view.current;
      place((x - cx) / k, (cy - y) / k);
    },
    onEmpty: (x, y) => {
      const { k, cx, cy } = view.current;
      place((x - cx) / k, (cy - y) / k);
    },
  });

  const verdict =
    c.kind === 'interior'
      ? `반지름 ${c.r.toFixed(3)}인 공이 통째로 집합 안에 들어갑니다. 이 점은 내부의 점입니다.`
      : c.kind === 'exterior'
        ? `반지름 ${c.r.toFixed(3)}인 공이 통째로 집합 밖에 놓입니다. 이 점은 외부의 점입니다.`
        : `아무리 작은 공을 그려도 집합 안과 밖에 모두 걸칩니다. 이 점은 경계의 점이고, 집합에 ${c.member ? '들어 있습니다' : '들어 있지 않습니다'}.`;
  return (
    <Figure
      no={2}
      title="점 둘레에 공이 들어갈 자리가 있나"
      hint="점을 끌거나 아래 버튼으로 옮겨 보세요"
      caption={
        <>
          색칠한 부분이 집합이고, 실선 경계는 집합에 들어가고 점선 경계는 들어가지 않습니다. 점이 속이 찬 원이면 집합의 원소, 속이 빈 원이면 원소가 아닙니다. 초록 공은 집합 안에, 파란 공은 집합 밖에 통째로 들어가는 가장 큰 공이고, 빨간 점선 원들은 경계 위의 점에서 어떤 공도 한쪽에 들어가지 않는다는 것을 보여 줍니다. 경계 가까이 끌면 경계에 달라붙습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={sid} onChange={setSid} options={SETS.map((s) => ({ value: s.id, label: s.name }))} label="집합" />
        <Check label="경계에 달라붙기" checked={snap} onChange={setSnap} />
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box grab" role="img" aria-label={`${S.name}에서 점 (${pt[0]}, ${pt[1]})은 ${KIND_KO[c.kind]}이고 집합에 ${c.member ? '들어 있습니다' : '들어 있지 않습니다'}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider label="x" value={pt[0]} min={-1.7} max={1.7} step={0.01} onChange={(v) => place(v, pt[1])} format={(v) => v.toFixed(2)} />
          <Slider label="y" value={pt[1]} min={-1.7} max={1.7} step={0.01} onChange={(v) => place(pt[0], v)} format={(v) => v.toFixed(2)} />
          <div className="btn-row">
            <Button small onClick={() => setPt([0.5, 0.3])}>안쪽 점</Button>
            <Button small onClick={() => setPt(sid === 'disk' ? [0.6, 0.8] : [0.5, 1])}>{sid === 'disk' ? '원 위의 점' : '윗변 위의 점'}</Button>
            <Button small onClick={() => setPt(sid === 'disk' ? [-0.8, -0.6] : [-1, 0.2])}>{sid === 'disk' ? '다른 경계점' : '왼변 위의 점'}</Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="점의 종류" value={KIND_KO[c.kind]} color={c.kind === 'boundary' ? 'var(--bad)' : undefined} />
            <Readout label="집합의 원소" value={c.member ? '예' : '아니오'} />
            <Readout label="열린 집합" value={S.open ? '예' : '아니오'} />
            <Readout label="닫힌 집합" value={S.closed ? '예' : '아니오'} />
          </div>
          <div className="tp-note" aria-live="polite">
            {verdict}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: distances between words ─────────────── */

const WORDS = {
  words: ['kitten', 'sitting', 'mitten'],
  codes: ['1011101', '1001001', '1111111'],
};

function WordsFigure() {
  const [preset, setPreset] = useState<'words' | 'codes'>('words');
  const [w, setW] = useState<string[]>(WORDS.words);
  const ids = [useId(), useId(), useId()];
  const pick = (v: 'words' | 'codes') => {
    setPreset(v);
    setW(WORDS[v]);
  };
  const names = ['x', 'y', 'z'];
  const pairs: [number, number][] = [
    [0, 1],
    [1, 2],
    [0, 2],
  ];
  const ed = pairs.map(([a, b]) => editDistance(w[a], w[b]));
  const hm = pairs.map(([a, b]) => hamming(w[a], w[b]));
  // check every triangle inequality d(a, c) ≤ d(a, b) + d(b, c) for the three words
  const tri = useMemo(() => {
    const out: { s: string; ok: boolean; tight: boolean }[] = [];
    const d = (a: number, b: number) => editDistance(w[a], w[b]);
    for (const [a, b, c] of [
      [0, 1, 2],
      [1, 0, 2],
      [0, 2, 1],
    ])
      out.push({ s: `d(${names[a]}, ${names[c]}) = ${d(a, c)} ≤ d(${names[a]}, ${names[b]}) + d(${names[b]}, ${names[c]}) = ${d(a, b) + d(b, c)}`, ok: d(a, c) <= d(a, b) + d(b, c), tight: d(a, c) === d(a, b) + d(b, c) });
    return out;
  }, [w]);

  return (
    <Figure
      no={3}
      title="단어 사이의 거리"
      hint="단어를 고쳐 보세요"
      caption={
        <>
          편집 거리는 한 글자를 넣거나, 지우거나, 바꾸는 일을 몇 번 해야 한 단어가 다른 단어가 되는지 셉니다. 해밍 거리는 길이가 같은 두 단어에서 글자가 다른 자리의 수입니다. 아래 줄은 세 단어로 만들 수 있는 삼각 부등식을 모두 확인하고, 등호가 성립하면 표시합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={preset} onChange={pick} options={[{ value: 'words', label: '영어 단어' }, { value: 'codes', label: '0과 1의 부호어' }]} label="예" />
      </div>
      <div className="ms-words">
        {w.map((word, i) => (
          <label key={i} htmlFor={ids[i]} className="ms-word">
            <span className="mono">{names[i]}</span>
            <input id={ids[i]} type="text" value={word} maxLength={16} spellCheck={false} onChange={(e) => setW(w.map((v, j) => (j === i ? e.target.value : v)))} />
          </label>
        ))}
      </div>
      <div className="tbl-wrap">
        <table className="ms-table">
          <thead>
            <tr>
              <th>두 단어</th>
              <th>편집 거리</th>
              <th>해밍 거리</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(([a, b], k) => (
              <tr key={k}>
                <td>
                  {names[a]}, {names[b]}
                </td>
                <td className="mono">{ed[k]}</td>
                <td className="mono">{hm[k] === null ? '길이가 달라 정의되지 않음' : hm[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="ms-tri" aria-live="polite">
        {tri.map((t, i) => (
          <li key={i} data-ok={t.ok || undefined}>
            <span className="mono">{t.s}</span> {t.ok ? (t.tight ? '· 등호' : '') : '· 깨짐'}
          </li>
        ))}
      </ul>
    </Figure>
  );
}

/* ─────────────── Figure 4: interior, closure and boundary on the line ─────────────── */

type Piece = { kind: 'seg'; a: number; b: number; ca: boolean; cb: boolean } | { kind: 'pts'; xs: number[] } | { kind: 'line' };
const rationals = (() => {
  const s = new Set<number>();
  for (let q = 1; q <= 14; q++) for (let p = 0; p <= q; p++) s.add(p / q);
  return [...s];
})();
const recip = Array.from({ length: 60 }, (_, i) => 1 / (i + 1));
const DRAW: Record<string, Record<'set' | 'int' | 'cl' | 'bd', Piece[]>> = {
  halfopen: {
    set: [{ kind: 'seg', a: 0, b: 1, ca: false, cb: true }],
    int: [{ kind: 'seg', a: 0, b: 1, ca: false, cb: false }],
    cl: [{ kind: 'seg', a: 0, b: 1, ca: true, cb: true }],
    bd: [{ kind: 'pts', xs: [0, 1] }],
  },
  recip: {
    set: [{ kind: 'pts', xs: recip }],
    int: [],
    cl: [{ kind: 'pts', xs: [0, ...recip] }],
    bd: [{ kind: 'pts', xs: [0, ...recip] }],
  },
  ints: {
    set: [{ kind: 'pts', xs: [-1, 0, 1, 2] }],
    int: [],
    cl: [{ kind: 'pts', xs: [-1, 0, 1, 2] }],
    bd: [{ kind: 'pts', xs: [-1, 0, 1, 2] }],
  },
  rationals: {
    set: [{ kind: 'pts', xs: rationals }],
    int: [],
    cl: [{ kind: 'seg', a: 0, b: 1, ca: true, cb: true }],
    bd: [{ kind: 'seg', a: 0, b: 1, ca: true, cb: true }],
  },
  line: { set: [{ kind: 'line' }], int: [{ kind: 'line' }], cl: [{ kind: 'line' }], bd: [] },
};

function drawPieces(ctx: CanvasRenderingContext2D, P: Palette, pieces: Piece[], X: (v: number) => number, y: number, color: string, x0: number, x1: number) {
  ctx.strokeStyle = P.lineStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();
  if (!pieces.length) {
    ctx.fillStyle = P.ink3;
    ctx.font = `12px ${P.fontMono}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('∅', x0 + 2, y - 4);
  }
  for (const pc of pieces) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (pc.kind === 'line') {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    } else if (pc.kind === 'seg') {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(X(pc.a), y);
      ctx.lineTo(X(pc.b), y);
      ctx.stroke();
      for (const [v, closed] of [
        [pc.a, pc.ca],
        [pc.b, pc.cb],
      ] as [number, boolean][]) {
        ctx.beginPath();
        ctx.arc(X(v), y, 5, 0, Math.PI * 2);
        ctx.fillStyle = closed ? color : P.surface;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      for (const v of pc.xs) {
        ctx.beginPath();
        ctx.arc(X(v), y, v < 0.05 && v > 0 ? 1.6 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function LineSetsFigure() {
  const P = usePalette();
  const [id, setId] = useState('halfopen');
  const S = LINE_SETS.find((s) => s.id === id)!;
  const rows: { key: 'set' | 'int' | 'cl' | 'bd'; label: string; text: string; color: string }[] = [
    { key: 'set', label: 'A', text: S.name, color: P.ink },
    { key: 'int', label: '내부', text: S.interior, color: P.good },
    { key: 'cl', label: '폐포', text: S.closure, color: P.neg },
    { key: 'bd', label: '경계', text: S.boundary, color: P.bad },
  ];
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const lw = 48;
      const lo = -1.4, hi = 2.4;
      const X = (v: number) => lw + ((v - lo) / (hi - lo)) * (w - lw - 12);
      const rowH = (h - 26) / 4;
      rows.forEach((r, i) => {
        const y = 14 + rowH * (i + 0.5);
        ctx.fillStyle = P.ink2;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.label, 4, y);
        drawPieces(ctx, P, DRAW[id][r.key], X, y, r.color, lw, w - 12);
      });
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const t of [-1, 0, 1, 2]) ctx.fillText(String(t), X(t), h - 2);
    },
    [P, id],
    { height: 230, minHeight: 40 },
  );
  return (
    <Figure
      no={4}
      title="수직선 위 집합의 내부, 폐포, 경계"
      hint="집합을 골라 보세요"
      caption={
        <>
          속이 찬 끝점은 들어가고 속이 빈 끝점은 빠집니다. ℚ ∩ [0, 1]은 분모가 14 이하인 유리수만 점으로 찍었지만, 실제로는 [0, 1]의 어느 작은 구간에도 유리수와 무리수가 모두 있습니다. 그래서 내부는 비고 폐포와 경계는 구간 전체가 됩니다.
        </>
      }
    >
      <div className="controls row">
        <Seg value={id} onChange={setId} options={LINE_SETS.map((s) => ({ value: s.id, label: s.name }))} label="집합 A" />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`집합 ${S.name}의 내부는 ${S.interior}, 폐포는 ${S.closure}, 경계는 ${S.boundary}입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <Readout label="내부" value={S.interior} />
        <Readout label="폐포" value={S.closure} />
        <Readout label="경계" value={S.boundary} />
        <Readout label="열림 / 닫힘" value={S.open && S.closed ? '둘 다' : S.open ? '열림' : S.closed ? '닫힘' : '둘 다 아님'} />
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '내부', shape: 'ln' },
          { color: 'var(--neg)', label: '폐포', shape: 'ln' },
          { color: 'var(--bad)', label: '경계', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function MetricSpaces() {
  return (
    <>
      <h2>가깝다는 것을 재는 방법</h2>
      <p>
        <a href={lessonHref('math-analysis', 'sequences')}>해석학</a>에서는 수열이 극한에 "가까워진다"를 <M>{'|a_n - L| < \\varepsilon'}</M>으로 정의했습니다. 이 정의에서 쓴 것은 두 수 사이의 거리 <M>{'|x - y|'}</M>뿐입니다. 그렇다면 평면의 점, 단어, 함수처럼 거리를 잴 수 있는 것이라면 무엇이든 같은 방식으로 수렴과 연속을 말할 수 있을 것입니다. 거리가 지켜야 할 규칙만 정하면 됩니다.
      </p>
      <div className="ms-thm">
        <b>정의 (거리 공간).</b> 집합 X 위의 함수 <M>{'d : X \\times X \\to \\mathbb{R}'}</M>가 모든 x, y, z에 대해 다음을 만족하면 <T en="metric">거리</T>라고 하고, (X, d)를 <T en="metric space">거리 공간</T>이라고 합니다.
        <MB>{'\\begin{aligned} &d(x, y) \\ge 0, \\quad d(x, y) = 0 \\iff x = y \\\\ &d(x, y) = d(y, x) \\\\ &d(x, z) \\le d(x, y) + d(y, z) \\quad \\text{(삼각 부등식)} \\end{aligned}'}</MB>
      </div>
      <p>
        평면에서 익숙한 거리는 직선 거리 <M>{'d_2'}</M>이지만, 다른 거리도 이 규칙을 모두 지킵니다. 격자 모양의 길을 따라 가로와 세로로만 움직이는 <M>{'d_1(p, q) = |p_1 - q_1| + |p_2 - q_2|'}</M>(맨해튼 거리), 두 좌표 차이 중 큰 것만 보는 <M>{'d_\\infty(p, q) = \\max(|p_1 - q_1|, |p_2 - q_2|)'}</M>, 그리고 같은 점이면 0, 다르면 무조건 1인 <T en="discrete metric">이산 거리</T>도 거리입니다. 거리 하나를 정하면 "중심에서 거리가 r보다 작은 점들"인 <T en="open ball">열린 공</T> <M>{'B(x, r)'}</M>이 생기는데, 그림 1처럼 거리마다 공의 모양이 다릅니다.
      </p>
      <BallsFigure />
      <p>
        기본값의 점 q = (0.6, 0.8)은 원점에서 직선 거리로 정확히 1이지만, 맨해튼 거리로는 1.40, 최대 거리로는 0.80입니다. 그래서 반지름 1인 d₁ 공(마름모) 밖에 있고, d₂ 공(원)의 경계 위에 있어 공에 들지 않으며, d∞ 공(정사각형) 안에 있습니다. p를 1에서 키우면 공이 마름모에서 원을 거쳐 정사각형 쪽으로 부풀고, 이산 거리에서 공은 r ≤ 1이면 중심 한 점, r &gt; 1이면 평면 전체가 됩니다.
      </p>

      <h2>열린 집합</h2>
      <p>
        이제 "점 둘레에 여유가 있다"는 말을 정확히 합니다. 집합 U의 점 x 둘레에 U 안에 통째로 들어가는 공 <M>{'B(x, r)'}</M>이 하나라도 있으면 x를 U의 <T en="interior point">내부의 점</T>이라고 하고, U의 모든 점이 내부의 점이면 U를 <T en="open set">열린 집합</T>이라고 합니다. 반대로 어떤 공을 그려도 U 안과 밖에 모두 걸치는 점은 <T en="boundary point">경계의 점</T>입니다.
      </p>
      <BallInsideFigure />
      <p>
        열린 원판에서는 어느 원소를 골라도 경계까지 남은 거리만큼의 공이 들어가므로 열린 집합입니다. 경계의 점, 예를 들어 (0.6, 0.8)은 원판에 들어 있지 않습니다. 닫힌 정사각형은 윗변의 (0.5, 1)처럼 경계의 점을 원소로 가지고 있는데, 그 점 둘레에는 공이 들어갈 자리가 없으므로 열린 집합이 아닙니다. 대신 <T en="closed set">닫힌 집합</T>, 곧 여집합이 열린 집합입니다. 윗변만 뺀 정사각형은 왼변의 (−1, 0.2) 때문에 열려 있지 않고, 빠진 윗변 때문에 닫혀 있지도 않습니다. "열림"과 "닫힘"은 서로 반대말이 아닙니다.
      </p>
      <div className="ms-thm">
        <b>정리.</b> 거리 공간에서 열린 공 <M>{'B(x, r)'}</M>은 열린 집합입니다.
      </div>
      <div className="ms-proof">
        <span className="ms-proof-head">증명.</span> <M>{'y \\in B(x, r)'}</M>를 아무렇게나 고르고 <M>{'s = r - d(x, y)'}</M>로 둡니다. y가 공 안에 있으므로 s &gt; 0입니다. <M>{'z \\in B(y, s)'}</M>이면 삼각 부등식으로 <M>{'d(x, z) \\le d(x, y) + d(y, z) < d(x, y) + s = r'}</M>이므로 <M>{'z \\in B(x, r)'}</M>입니다. 곧 <M>{'B(y, s) \\subseteq B(x, r)'}</M>이고, y가 내부의 점입니다. 모든 y에 대해 그러하므로 B(x, r)은 열린 집합입니다. <span className="ms-qed">∎</span>
      </div>
      <p>
        증명에서 쓴 것은 삼각 부등식 하나입니다. 그래서 그림 1의 어느 거리를 쓰든, 그리고 단어나 함수의 거리를 쓰든 열린 공은 언제나 열린 집합입니다.
      </p>

      <h2>거리가 달라도 열린 집합은 같을 수 있다</h2>
      <p>
        그림 1에서 "포함 관계 보기"를 켜 보세요. 평면의 모든 벡터 v에 대해 <M>{'\\|v\\|_\\infty \\le \\|v\\|_2 \\le \\|v\\|_1 \\le 2\\|v\\|_\\infty'}</M>이므로, 같은 반지름으로 그린 공은 <M>{'B_1(r) \\subseteq B_2(r) \\subseteq B_\\infty(r) \\subseteq B_1(2r)'}</M>로 차례로 들어갑니다. 어떤 점 둘레에 d₂ 공이 들어간다면 그 안에 d₁ 공도 들어가고, d∞ 공이 들어간다면 반지름을 절반으로 줄인 d₁ 공이 그 안에 들어갑니다. 그래서 세 거리는 어떤 집합이 열려 있는지에 대해 정확히 같은 답을 냅니다. 공의 모양은 다르지만 "둘레에 여유가 있다"는 판단은 같습니다.
      </p>
      <Callout kind="intuition">
        이 관찰이 다음 장의 출발점입니다. 수렴, 연속, 연결 같은 성질은 거리 값 자체보다 어떤 집합이 열려 있는지에만 기대는 경우가 많습니다. 그렇다면 거리를 버리고 열린 집합들의 목록만 남겨도 같은 이야기를 할 수 있을 것입니다.
      </Callout>

      <h2>단어도 거리 공간이다</h2>
      <p>
        거리 공간은 기하학에만 있지 않습니다. 같은 길이의 0과 1 문자열 사이의 <T en="Hamming distance">해밍 거리</T>는 <a href={lessonHref('math-abstract-algebra', 'codes-crypto')}>오류 정정 부호</a>의 핵심입니다. 부호어끼리의 최소 거리가 d이면 d − 1개 이하의 오류는 반드시 알아챌 수 있습니다. 길이가 다른 문자열에도 쓸 수 있는 <T en="edit distance">편집 거리</T>는 맞춤법 검사기가 비슷한 단어를 제안하는 데 쓰고, <a href={lessonHref('net-software-security', 'supply-chain')}>공급망 보안</a>에서는 유명한 패키지 이름과 거리가 1, 2인 이름을 의심하는 데 썼습니다.
      </p>
      <WordsFigure />
      <p>
        기본값에서 kitten과 sitting은 편집 거리 3(k를 s로, e를 i로 바꾸고 g를 붙임), sitting과 mitten도 3, kitten과 mitten은 1입니다. 세 삼각 부등식이 모두 성립합니다. 부호어 예에서는 1001001과 1111111 사이의 거리 4가 1011101을 거쳐 가는 2 + 2와 같아 등호가 성립합니다. 단어를 고쳐서 삼각 부등식을 깨 보려고 해도 깨지지 않을 것입니다. 편집 거리는 "가장 짧은 편집 경로의 길이"이므로, x에서 y를 거쳐 z로 가는 경로가 언제나 x에서 z로 가는 경로 하나가 되기 때문입니다.
      </p>

      <h2>내부, 폐포, 경계</h2>
      <p>
        열린 집합이 아닌 집합도 그 안의 가장 큰 열린 집합과 그것을 감싸는 가장 작은 닫힌 집합으로 사이에 끼울 수 있습니다. 집합 A의 내부의 점을 모두 모은 것을 <T en="interior">내부</T> <M>{'\\operatorname{int} A'}</M>, A의 점들이 한없이 다가갈 수 있는 점, 곧 어느 공을 그려도 A와 만나는 점을 모두 모은 것을 <T en="closure">폐포</T> <M>{'\\overline{A}'}</M>라고 합니다. 경계는 그 차이 <M>{'\\overline{A} \\setminus \\operatorname{int} A'}</M>입니다.
      </p>
      <LineSetsFigure />
      <p>
        (0, 1]의 경계는 두 끝점 0과 1인데, 0은 집합에 없고 1은 있습니다. 수열 1, 1/2, 1/3, …의 원소들은 모두 고립된 점이라 내부가 비고, 폐포에는 극한 0이 하나 더 들어옵니다. 마지막 예가 가장 놀랍습니다. [0, 1] 안의 유리수만 모은 집합은 어느 점 둘레에도 무리수가 끼어들어 내부가 비어 있지만, 어느 점 둘레에도 유리수가 있어 폐포는 구간 전체입니다. 그래서 경계가 [0, 1] 전체가 됩니다. ℝ 자체는 경계가 없어 열린 집합이면서 닫힌 집합입니다.
      </p>
      <Callout kind="note">
        수열의 극한도 같은 말로 쓸 수 있습니다. <M>{'x_n \\to x'}</M>는 x를 담는 열린 공을 어떻게 그려도 어느 번호 이후의 항이 모두 그 공에 들어간다는 뜻입니다. 그리고 집합 A가 닫혀 있다는 것은 A 안의 점들로 된 수열이 수렴하면 그 극한도 A에 있다는 것과 같습니다.
      </Callout>

      <Callout kind="key">
        거리 공간은 세 규칙(양수성, 대칭성, 삼각 부등식)을 지키는 거리 d가 있는 집합입니다. 거리에 따라 공의 모양은 마름모, 원, 정사각형, 한 점까지 달라집니다. 모든 점 둘레에 공이 들어갈 여유가 있는 집합이 열린 집합이고, 여집합이 열린 집합인 것이 닫힌 집합이며, 둘 다이거나 둘 다 아닌 집합도 있습니다. d₁, d₂, d∞처럼 서로 상수배로 끼워지는 거리는 같은 열린 집합을 줍니다. 내부는 안에 든 가장 큰 열린 집합, 폐포는 감싸는 가장 작은 닫힌 집합이고, 경계는 그 차이입니다.
      </Callout>
      <Quiz
        q="실수 전체 ℝ에서 유리수의 집합 ℚ에 대해 옳은 것은?"
        options={['ℚ는 열린 집합이다', 'ℚ의 내부는 ℚ 자신이다', 'ℚ의 폐포는 ℝ이고 경계도 ℝ이다', 'ℚ의 경계는 비어 있다']}
        answer={2}
        explain={<>어느 유리수 둘레에 공(구간)을 그려도 무리수가 들어 있으므로 내부의 점이 하나도 없어 내부는 ∅이고, ℚ는 열린 집합이 아닙니다. 반대로 어느 실수 둘레의 구간에도 유리수가 있으므로 폐포는 ℝ입니다. 경계는 폐포에서 내부를 뺀 ℝ \ ∅ = ℝ입니다. 그림 4의 ℚ ∩ [0, 1]과 같은 이유입니다.</>}
      />
    </>
  );
}
