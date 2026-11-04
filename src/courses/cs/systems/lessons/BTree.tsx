import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { bBuild, bCount, bHeight, bInsert, bLayout, bSearch, binaryLevels, bplusLevels, crossover, fmtKo, indexCost, samePath, weighted, type BFrame, type BNode, type MarkRole } from './storage';
import './storage.css';

/* ─────────────── Figure 1: B-tree insert and search ─────────────── */

const MAX_TOTAL = 24;
const START_KEYS = [50, 20, 80, 35, 65, 10, 90, 27, 58, 72, 42];

function fillFor(P: Palette, role: MarkRole | undefined): [string, string] {
  switch (role) {
    case 'visit':
      return [P.hl, '#1a1a1a'];
    case 'over':
      return [alpha(P.bad, 0.28), P.ink];
    case 'split':
      return [alpha(P.neg, 0.28), P.ink];
    case 'found':
      return [alpha(P.good, 0.35), P.ink];
    case 'miss':
      return [alpha(P.bad, 0.18), P.ink];
    default:
      return [P.surface, P.ink];
  }
}

function BTreeFigure() {
  const P = usePalette();
  const [still] = useState(prefersReducedMotion);
  const [maxKeys, setMaxKeys] = useState(3);
  const [keys, setKeys] = useState<number[]>(START_KEYS);
  const [typed, setTyped] = useState('47');
  const r = useRef(rng(5));
  const tree = useMemo(() => bBuild(keys, maxKeys), [keys, maxKeys]);
  const [run, setRun] = useState<{ id: number; frames: BFrame[]; visits: number | null; splits: number | null; kind: 'insert' | 'search' | 'rebuild' }>(() => ({
    id: 0,
    frames: [{ tree: bBuild(START_KEYS, 3), marks: [], note: `키 ${START_KEYS.length}개가 들어 있는 B-트리입니다. 키를 넣거나 찾아보세요.` }],
    visits: null,
    splits: null,
    kind: 'rebuild',
  }));
  const s = useStepper(run.frames.length, 2, run.id, still, !still);
  const f = run.frames[s.i];
  const count = bCount(tree);
  const full = keys.length >= MAX_TOTAL;

  const insert = (k: number) => {
    const dup = keys.includes(k);
    if (full && !dup) return;
    const res = bInsert(tree, k, maxKeys);
    if (!dup) setKeys((ks) => [...ks, k]);
    setRun((x) => ({ id: x.id + 1, frames: res.frames, visits: res.visits, splits: res.splits, kind: 'insert' }));
  };
  const insertRandom = () => {
    const free = Array.from({ length: 99 }, (_, i) => i + 1).filter((v) => !keys.includes(v));
    if (free.length) insert(free[Math.floor(r.current() * free.length)]);
  };
  const nextAsc = keys.length ? Math.max(...keys) + 1 : 1;
  const search = (k: number) => {
    const res = bSearch(tree, k);
    setRun((x) => ({ id: x.id + 1, frames: res.frames, visits: res.visits, splits: null, kind: 'search' }));
  };
  const reset = (ks: number[], m: number, note: string) => {
    setKeys(ks);
    setRun((x) => ({ id: x.id + 1, frames: [{ tree: bBuild(ks, m), marks: [], note }], visits: null, splits: null, kind: 'rebuild' }));
  };
  const changeMax = (m: number) => {
    setMaxKeys(m);
    reset(keys, m, `노드당 최대 키 ${m}개로 바꾸고, 같은 키 ${keys.length}개를 같은 순서로 다시 넣었습니다.`);
  };
  const typedNum = Number(typed);
  const typedOk = Number.isInteger(typedNum) && typedNum >= 1 && typedNum <= 99;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const t: BNode | null = f.tree;
      if (!t) {
        ctx.fillStyle = P.ink3;
        ctx.font = `14px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText('비어 있음', w / 2, h / 2);
        return;
      }
      const L = bLayout(t);
      const depth = bHeight(t);
      const padX = 8;
      const cw = Math.min(30, (w - 2 * padX) / Math.max(1, L.width));
      const ox = (w - L.width * cw) / 2;
      const nh = Math.max(20, Math.min(26, cw * 1.15));
      const top = 14;
      const dy = depth > 1 ? Math.min(78, (h - top - nh - 10) / (depth - 1)) : 0;
      const X = (u: number) => ox + u * cw;
      const Y = (d: number) => top + d * dy;
      const roleOf = (p: number[]) => {
        let role: MarkRole | undefined;
        for (const m of f.marks) if (samePath(m.path, p)) role = m.role;
        return role;
      };
      const byPath = new Map(L.nodes.map((n) => [n.path.join('.'), n]));
      // edges: from the gap between keys i-1 and i down to child i
      for (const n of L.nodes) {
        n.node.kids.forEach((_, i) => {
          const c = byPath.get([...n.path, i].join('.'));
          if (!c) return;
          const hot = roleOf(c.path) === 'visit' || roleOf(c.path) === 'found' || roleOf(c.path) === 'miss';
          ctx.strokeStyle = hot ? P.ink : P.lineStrong;
          ctx.lineWidth = hot ? 2.2 : 1.1;
          ctx.beginPath();
          ctx.moveTo(X(n.x + i), Y(n.depth) + nh);
          ctx.lineTo(X(c.x + c.w / 2), Y(c.depth));
          ctx.stroke();
        });
      }
      const font = Math.round(Math.max(10, Math.min(13, cw * 0.48)));
      for (const n of L.nodes) {
        const role = roleOf(n.path);
        const [fill, ink] = fillFor(P, role);
        const x0 = X(n.x);
        const y0 = Y(n.depth);
        ctx.fillStyle = fill;
        ctx.fillRect(x0, y0, n.w * cw, nh);
        n.node.keys.forEach((k, i) => {
          const isKey = f.key && samePath(f.key.path, n.path) && f.key.value === k;
          if (isKey) {
            ctx.fillStyle = P.pos;
            ctx.fillRect(x0 + i * cw, y0, cw, nh);
          }
          if (i > 0) {
            ctx.strokeStyle = P.lineStrong;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0 + i * cw + 0.5, y0 + 3);
            ctx.lineTo(x0 + i * cw + 0.5, y0 + nh - 3);
            ctx.stroke();
          }
          ctx.fillStyle = isKey ? P.surface : ink;
          ctx.font = `${isKey ? 700 : 500} ${font}px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k), x0 + (i + 0.5) * cw, y0 + nh / 2 + 1);
        });
        ctx.strokeStyle = role === 'over' ? P.bad : P.ink;
        ctx.lineWidth = role ? 2 : 1.2;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, n.w * cw - 1, nh - 1);
      }
    },
    [P, f],
    { aspect: 2.3, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={1}
      title="B-트리에 키 넣기: 넘치면 둘로 나누고 가운데를 위로"
      hint="키를 넣거나 찾으면서 단계를 따라가 보세요"
      caption={<>상자 하나가 노드(디스크의 페이지 하나)이고, 칸 하나가 키입니다. 노드 안의 키는 정렬되어 있고, 두 키 사이에서 내려가는 선이 그 사이 값들을 담은 자식입니다. 넣을 때는 루트에서 잎까지 내려가 잎에 넣고, 노드가 최대 키 수를 넘으면(빨간 테두리) 가운데 키를 부모로 올리며 둘로 나눕니다(파란 노드). 노란색은 지금 읽는 노드, 주황 칸은 방금 넣거나 올라간 키입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`B-트리: 키 ${count.keys}개, 노드 ${count.nodes}개, 높이 ${bHeight(tree)}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="sto-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg label="노드당 최대 키 수" value={maxKeys} onChange={changeMax} options={[3, 4, 5].map((m) => ({ value: m, label: String(m) }))} />
          <div className="btn-row">
            <Button small primary onClick={insertRandom} disabled={full}>
              무작위 키 넣기
            </Button>
            <Button small onClick={() => insert(nextAsc)} disabled={full || nextAsc > 99}>
              다음 큰 수 ({nextAsc > 99 ? '—' : nextAsc}) 넣기
            </Button>
          </div>
          <div className="bt-typed">
            <label htmlFor="bt-key">키 (1~99)</label>
            <input id="bt-key" className="text-input mono" inputMode="numeric" value={typed} maxLength={2} onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, ''))} />
            <Button small onClick={() => typedOk && insert(typedNum)} disabled={!typedOk || full}>
              넣기
            </Button>
            <Button small onClick={() => typedOk && search(typedNum)} disabled={!typedOk}>
              찾기
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={() => reset([], maxKeys, '빈 트리입니다. 키를 넣어 보세요.')}>
              비우기
            </Button>
            <Button small onClick={() => reset(START_KEYS, maxKeys, `처음 키 ${START_KEYS.length}개로 되돌렸습니다.`)}>
              처음 트리
            </Button>
          </div>
          <StepControls s={s} id="bt-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label={`키 수 (최대 ${MAX_TOTAL})`} value={String(count.keys)} />
            <Readout label="높이 · 노드 수" value={`${bHeight(tree)}층 · ${count.nodes}개`} color="var(--neg)" />
            <Readout label="이번에 읽은 노드" value={run.visits === null ? '—' : `${run.visits}개`} color="var(--pos)" />
            <Readout label="이번 분할" value={run.splits === null ? '—' : `${run.splits}번`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '읽는 노드', shape: 'sq' },
          { color: 'var(--pos)', label: '넣은 · 올라간 키', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--bad) 28%, transparent)', label: '넘친 노드', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--neg) 28%, transparent)', label: '나뉜 두 노드', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--good) 35%, transparent)', label: '찾음', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: how tall? ─────────────── */

const DEVICES = [
  { value: 'hdd', label: 'HDD ≈ 10ms', sec: 10e-3 },
  { value: 'ssd', label: 'SSD ≈ 0.1ms', sec: 1e-4 },
];

function humanMs(sec: number): string {
  const ms = sec * 1e3;
  return ms < 10 ? `${Math.round(ms * 10) / 10}ms` : `${Math.round(ms)}ms`;
}

function HeightFigure() {
  const [lg, setLg] = useState(9);
  const [dev, setDev] = useState('hdd');
  const n = Math.round(10 ** lg);
  const sec = DEVICES.find((d) => d.value === dev)!.sec;
  const rows = [
    { name: '이진 트리', sub: '노드당 키 1개', levels: binaryLevels(n), color: 'var(--bad)' },
    { name: 'B+트리', sub: '페이지당 100개', levels: bplusLevels(n, 100), color: 'var(--neg)' },
    { name: 'B+트리', sub: '페이지당 500개', levels: bplusLevels(n, 500), color: 'var(--pos)' },
  ];
  const maxL = binaryLevels(10 ** 10);

  return (
    <Figure
      no={2}
      title="10억 개를 찾는 데 페이지 몇 번?"
      hint="키 개수를 바꿔 보세요"
      caption={<>네모 하나가 루트에서 잎까지 내려가며 읽는 노드(페이지) 하나입니다. 이진 트리는 완전히 균형 잡혔다고 보고 <M>{'2^L - 1 \\ge n'}</M>인 가장 작은 L을, B+트리는 모든 페이지가 항목 f개를 꽉 채운다고 보고 <M>{'f^L \\ge n'}</M>인 가장 작은 L을 셌습니다. 걸리는 시간은 페이지 읽기 한 번에 대략 그만큼 걸리고 캐시가 전혀 없다고 친 어림입니다.</>}
    >
      <div className="lv-rows">
        {rows.map((rw, i) => (
          <div key={i} className="lv-row">
            <span className="lv-name">
              {rw.name}
              <small>{rw.sub}</small>
            </span>
            <span className="lv-boxes" aria-label={`${rw.levels}층`}>
              {Array.from({ length: rw.levels }, (_, k) => (
                <i key={k} style={{ background: rw.color }} />
              ))}
              {Array.from({ length: Math.max(0, (i === 0 ? maxL : 0) - rw.levels) }, (_, k) => (
                <i key={'e' + k} data-empty />
              ))}
            </span>
            <span className="lv-num mono">
              {rw.levels}번
              <small>{humanMs(rw.levels * sec)}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="fig-cols">
        <div className="controls">
          <Slider id="bt-n" label="키 개수 n" value={lg} min={3} max={10} step={0.1} onChange={setLg} format={() => fmtKo(n)} />
          <Seg label="페이지 읽기 한 번 (대략)" value={dev} onChange={setDev} options={DEVICES.map((d) => ({ value: d.value, label: d.label }))} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }}>
          <Readout label="페이지 500개짜리 3층에 담기는 키" value="1.25억" />
          <Readout label="4층이면" value="625억" />
          <Readout label="이진 트리 ÷ B+트리(500)" value={`${(rows[0].levels / rows[2].levels).toFixed(1)}배`} color="var(--pos)" />
          <Readout label="log₂ n" value={Math.log2(n).toFixed(1)} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: index vs full scan ─────────────── */

const RPP = 100;
const KPP = 500;

function IndexFigure() {
  const P = usePalette();
  const [lgN, setLgN] = useState(6);
  const [mode, setMode] = useState<'eq' | 'range'>('range');
  const [lgFrac, setLgFrac] = useState(-2.5);
  const [clustered, setClustered] = useState(false);
  const [rand4, setRand4] = useState(false);
  const N = Math.round(10 ** lgN);
  const minLg = -lgN;
  const fracLg = Math.max(minLg, lgFrac);
  const matches = mode === 'eq' ? 1 : Math.max(1, Math.round(N * 10 ** fracLg));
  const rw = rand4 ? 4 : 1;
  const c = indexCost(N, matches, clustered, RPP, KPP);
  const wc = weighted(c, clustered, rw);
  const cross = useMemo(() => crossover(N, clustered, rw), [N, clustered, rw]);
  const indexWins = wc.index < wc.scan;
  const pct = (m: number) => {
    const p = (m / N) * 100;
    return p >= 1 ? `${Math.round(p * 10) / 10}%` : p >= 0.01 ? `${p.toPrecision(2)}%` : `${p.toExponential(0)}%`;
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.ceil(Math.log10(Math.max(10, weighted(indexCost(N, N, clustered, RPP, KPP), clustered, rw).index, N / RPP)) + 0.3);
      const pad = { l: 44, r: 12, t: 14, b: 28 };
      const plot = new Plot(ctx, w, h, P, { xMin: minLg, xMax: 0, yMin: 0, yMax, pad });
      plot.grid({ xStep: 1, yStep: 1, labels: false, axes: false });
      const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
      const p10 = (k: number) => (k === 0 ? '1' : k === 1 ? '10' : '10' + String(k).split('').map((d) => SUP[d]).join(''));
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const yStep = yMax > 8 ? 2 : 1;
      for (let y = 0; y <= yMax; y += yStep) ctx.fillText(p10(y), pad.l - 6, plot.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xStep = lgN > 6 || w < 520 ? 2 : 1;
      for (let x = 0; x >= minLg; x -= xStep) {
        ctx.textAlign = x === 0 ? 'right' : x <= minLg + 0.01 ? 'left' : 'center';
        ctx.fillText(x >= -4 ? `${10 ** (x + 2)}%` : p10(x + 2) + '%', plot.X(x), plot.Y(0) + 6);
      }
      plot.clip();
      // crossover region
      if (cross <= N) {
        const cx = plot.X(Math.log10(cross / N));
        ctx.fillStyle = alpha(P.bad, 0.07);
        ctx.fillRect(cx, pad.t, plot.X(0) - cx, plot.ph);
      }
      const scanY = plot.Y(Math.log10(wc.scan));
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad.l, scanY);
      ctx.lineTo(w - pad.r, scanY);
      ctx.stroke();
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      const cols = Math.round(plot.pw);
      for (let px = 0; px <= cols; px++) {
        const xl = minLg + (-minLg * px) / cols;
        const m = Math.max(1, Math.round(N * 10 ** xl));
        const v = weighted(indexCost(N, m, clustered, RPP, KPP), clustered, rw).index;
        const X = pad.l + px;
        const Y = plot.Y(Math.log10(v));
        if (px === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      plot.unclip();
      const mx = plot.X(Math.log10(matches / N));
      ctx.strokeStyle = P.ink3;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(mx, pad.t);
      ctx.lineTo(mx, plot.Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [v, col] of [
        [wc.scan, P.ink],
        [wc.index, P.pos],
      ] as [number, string][]) {
        ctx.beginPath();
        ctx.arc(mx, plot.Y(Math.log10(v)), 5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const label = (s: string, x: number, y: number, col: string, align: CanvasTextAlign) => {
        ctx.font = `600 12px ${P.fontBody}`;
        const tw = ctx.measureText(s).width;
        const bx = align === 'right' ? x - tw - 3 : x - 3;
        ctx.fillStyle = alpha(P.surface, 0.9);
        ctx.fillRect(bx, y - 9, tw + 6, 18);
        ctx.fillStyle = col;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y);
      };
      label('전체 스캔', w - pad.r - 4, scanY - 12, P.ink, 'right');
      label(rand4 ? '인덱스 (무작위 ×4)' : '인덱스', pad.l + 6, plot.Y(Math.log10(weighted(indexCost(N, 1, clustered, RPP, KPP), clustered, rw).index)) - 14, P.pos, 'left');
    },
    [P, N, matches, clustered, rw, cross, lgN],
    { aspect: 2, maxHeight: 300, minHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="인덱스가 있을 때와 없을 때"
      hint="행 수, 범위의 넓이, 저장 방식을 바꿔 보세요"
      caption={<>한 페이지에 행 {RPP}개, 인덱스 페이지에 키 {KPP}개가 들어간다고 보고 읽는 페이지 수를 셌습니다(세로축은 로그 눈금). 가로축은 조건에 맞는 행이 전체에서 차지하는 비율, 점선은 지금 고른 쿼리입니다. 행이 흩어져 있으면 맞는 행마다 페이지를 하나씩 따로 읽는다고 단순화했고, 캐시는 없다고 쳤습니다. 붉은 바탕은 인덱스가 전체 스캔보다 비싸지는 구간입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`행 ${N}개 중 ${matches}개를 찾을 때: 전체 스캔 ${wc.scan}, 인덱스 ${wc.index}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="sto-note mono-sm" aria-live="polite">
            {mode === 'eq' ? 'SELECT * FROM users WHERE id = 42' : `SELECT * FROM users WHERE age BETWEEN … (행 ${pct(matches)})`}
            <br />
            인덱스 = 내려가기 {c.descend} + 잎 따라가기 {c.leaves} + 행이 든 페이지 {fmtKo(c.heap)}
            {rand4 ? ` (무작위 읽기는 ×4)` : ''}
          </div>
        </div>
        <div className="controls">
          <Slider id="ix-n" label="테이블 행 수" value={lgN} min={4} max={9} step={0.5} onChange={setLgN} format={() => fmtKo(N)} />
          <Seg
            label="조건"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'eq', label: '같음 (=)' },
              { value: 'range', label: '범위' },
            ]}
          />
          {mode === 'range' && <Slider id="ix-frac" label="범위에 드는 행" value={fracLg} min={minLg} max={0} step={0.05} onChange={setLgFrac} format={() => `${fmtKo(matches)}행`} />}
          <div className="ctl">
            <Check label="행이 키 순서로 모여 있음 (클러스터드)" checked={clustered} onChange={setClustered} />
            <Check label="무작위 읽기를 4배로 치기" checked={rand4} onChange={setRand4} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="전체 스캔" value={fmtKo(wc.scan)} />
            <Readout label="인덱스" value={fmtKo(wc.index)} color="var(--pos)" />
            <Readout label="더 싼 쪽" value={indexWins ? '인덱스' : '전체 스캔'} color={indexWins ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="갈림길" value={cross > N ? '없음' : pct(cross)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--ink)', label: '전체 스캔 (순차 읽기)', shape: 'ln' },
          { color: 'var(--pos)', label: '인덱스로 찾기', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function BTree() {
  return (
    <>
      <h2>디스크는 멀다</h2>
      <p>
        지금까지는 데이터가 모두 메모리에 있다고 가정하고 비교 횟수를 셌습니다. 데이터베이스는 다릅니다. 테이블이 메모리보다 클 수 있고, 전원이 꺼져도 남아 있어야 하므로 데이터는 SSD나 하드 디스크에 삽니다. 그리고 저장 장치는 메모리보다 훨씬 멉니다. 메모리에서 값 하나를 읽는 데는 대략 100나노초, SSD에서 무작위 위치를 읽는 데는 대략 수십에서 수백 마이크로초, 하드 디스크(HDD)는 헤드를 옮기고 원판이 돌아오기를 기다리느라 대략 수 밀리초가 걸립니다. 수백 배에서 수만 배 넘는 차이입니다.
      </p>
      <p>
        또 저장 장치는 바이트 하나씩이 아니라 <T en="page, block">페이지</T>라는 덩어리 단위로 읽고 씁니다. 데이터베이스의 기본 페이지 크기는 PostgreSQL이 8KB, MySQL의 InnoDB가 16KB입니다. 1바이트가 필요해도 페이지 하나를 통째로 읽어야 하고, 한번 읽은 페이지 안을 뒤지는 일은 메모리 안의 계산이라 상대적으로 공짜에 가깝습니다. 그래서 디스크 위의 자료구조는 비교 횟수가 아니라 <strong>페이지를 몇 번 읽는가</strong>로 비용을 셉니다.
      </p>
      <p>
        <a href="#cs-algorithms/search-hash">이진 탐색</a>이나 균형 잡힌 이진 탐색 트리는 원소 n개에서 약 <M>{'\\log_2 n'}</M>번 비교합니다. 10억 개면 30번입니다. 메모리에서는 순식간이지만, 노드 하나가 서로 다른 페이지에 있다면 디스크를 30번 읽어야 하고 HDD라면 수백 밀리초입니다. 노드 하나에 키 하나만 담으면 8KB 페이지를 읽어 와서 8바이트만 쓰고 버리는 셈입니다.
      </p>

      <h2>B-트리: 한 노드에 키를 여러 개</h2>
      <p>
        <T en="B-tree">B-트리</T>는 이 낭비를 없앱니다. 노드 하나를 페이지 하나에 맞추고, 그 안에 키를 <strong>정렬된 채로 여러 개</strong> 담습니다. 키가 m개인 노드는 자식이 m + 1개이고, 키 사이사이가 자식으로 내려가는 길입니다. 노드 하나를 읽어 그 안에서 이진 탐색으로 자리를 찾으면, 한 번에 수백 갈래 중 하나로 내려갈 수 있습니다. 1970년대 초 Bayer와 McCreight가 바로 이런 디스크 상황을 위해 고안했습니다.
      </p>
      <p>B-트리는 세 가지 규칙을 지킵니다.</p>
      <ul>
        <li>노드 안의 키는 정렬되어 있고, 자식 i에는 i번째 키와 i + 1번째 키 사이의 값만 있습니다.</li>
        <li>노드는 정해진 최대 개수까지만 키를 담고, 루트가 아닌 노드는 대략 절반 이상 차 있습니다.</li>
        <li>모든 잎은 같은 깊이에 있습니다. 그래서 어떤 키를 찾든 읽는 노드 수가 같습니다.</li>
      </ul>
      <p>
        세 번째 규칙이 놀라운데, 비결은 삽입 방식에 있습니다. 키는 언제나 잎에 넣습니다. 잎이 넘치면 가운데 키를 부모로 올려 보내고 잎을 둘로 나눕니다. 부모도 넘치면 같은 일을 반복하고, 루트까지 넘치면 루트를 둘로 나누고 가운데 키 하나로 새 루트를 만듭니다. 트리는 <strong>잎이 아래로 자라는 것이 아니라 루트가 위로 솟으며</strong> 자라므로, 모든 잎의 깊이가 한꺼번에 1씩 늘어납니다.
      </p>
      <BTreeFigure />
      <p>
        "다음 큰 수 넣기"를 여러 번 눌러 보세요. 오름차순으로 넣으면 이진 탐색 트리는 한쪽으로 늘어진 막대가 되지만, B-트리는 오른쪽 끝 잎이 계속 넘쳐 나뉘면서도 높이가 천천히, 고르게 늘어납니다. 키 24개를 넣어도 높이는 3층 안팎입니다. 노드당 최대 키 수를 5로 바꾸면 같은 키가 더 적은 노드, 더 낮은 트리에 담깁니다. 실제 데이터베이스에서 이 수는 수백입니다.
      </p>
      <Code label="B-트리 찾기와 넣기 (메모리 안에서 단순화한 버전)">{`
// 노드: { keys: [정렬된 키], kids: [자식] } — 잎은 kids가 빈 배열
const MAX = 4; // 노드 하나에 담을 수 있는 키 수 (실제로는 수백)

function search(node, k) {
  while (node) {                                  // 한 바퀴 = 페이지 한 번 읽기
    let i = 0;
    while (i < node.keys.length && node.keys[i] < k) i++; // 실제로는 이진 탐색
    if (node.keys[i] === k) return true;
    if (node.kids.length === 0) return false;     // 잎까지 왔는데 없다
    node = node.kids[i];
  }
  return false;
}

function insert(root, k) {
  const up = insertInto(root, k);
  if (!up) return root;
  return { keys: [up.median], kids: [up.left, up.right] }; // 루트가 나뉘면 한 층 높아진다
}

// 이 노드가 넘쳐서 나뉘었으면 { median, left, right }를, 아니면 null을 돌려준다
function insertInto(node, k) {
  let i = 0;
  while (i < node.keys.length && node.keys[i] < k) i++;
  if (node.keys[i] === k) return null;            // 이미 있다
  if (node.kids.length === 0) {
    node.keys.splice(i, 0, k);                    // 잎에 넣는다
  } else {
    const up = insertInto(node.kids[i], k);
    if (!up) return null;
    node.keys.splice(i, 0, up.median);            // 자식이 올려 보낸 키를 받는다
    node.kids.splice(i, 1, up.left, up.right);
  }
  if (node.keys.length <= MAX) return null;
  const mid = Math.floor(node.keys.length / 2);   // 넘쳤다: 가운데에서 나눈다
  return {
    median: node.keys[mid],
    left:  { keys: node.keys.slice(0, mid),  kids: node.kids.slice(0, mid + 1) },
    right: { keys: node.keys.slice(mid + 1), kids: node.kids.slice(mid + 1) },
  };
}`}</Code>
      <p>
        찾기와 넣기 모두 루트에서 잎까지 한 줄로 내려갔다 올라오므로 읽는 페이지 수는 높이에 비례합니다. 나누기는 넘친 노드 하나를 두 페이지로 쓰고 부모를 고치는 일이라, 한 번 넣을 때 많아야 높이만큼만 일어납니다. 지우기는 반대로, 노드가 너무 비면 형제에게서 키를 빌리거나 형제와 합칩니다.
      </p>

      <h2>몇 층이면 될까</h2>
      <p>
        페이지 하나에 항목이 f개 들어가면 한 층 내려갈 때마다 갈래가 f배로 늘어납니다. 층이 L개인 트리는 <M>{'f^L'}</M>개까지 담을 수 있으므로, 높이는 약 <M>{'\\log_f n'}</M>입니다.
      </p>
      <MB note="밑이 2에서 f로 바뀌면 높이는 log₂ f로 나뉩니다. f = 500이면 약 9분의 1입니다.">{'\\log_f n = \\frac{\\log_2 n}{\\log_2 f}'}</MB>
      <HeightFigure />
      <p>
        키가 8바이트 정수라면 8KB 페이지 하나에 키와 자식 포인터 쌍이 수백 개 들어갑니다. 페이지당 500개라면 3층에 1.25억 개, 4층에 625억 개가 담깁니다. 10억 행에서 하나를 찾을 때 이진 트리는 페이지를 30번, 페이지당 100개짜리 B+트리는 5번, 500개짜리는 4번 읽습니다. 게다가 루트와 그 아래 층은 자주 읽히므로 보통 메모리의 버퍼 캐시에 머뭅니다. 페이지당 500개라면 위의 두 층이 페이지 501개, 8KB 페이지로 약 4MB입니다. 그래서 실제로 디스크까지 가는 읽기는 한두 번인 경우가 많습니다.
      </p>

      <h2>B+트리: 데이터는 잎에, 잎은 줄줄이</h2>
      <p>
        데이터베이스가 실제로 쓰는 것은 대부분 변형인 <T en="B+ tree">B+트리</T>입니다. 두 가지가 다릅니다.
      </p>
      <ul>
        <li>
          <strong>모든 키와 데이터는 잎에만</strong> 있고, 내부 노드에는 길 안내용 키만 둡니다. 내부 노드에 데이터가 없으니 한 페이지에 갈래를 더 많이 담을 수 있어 트리가 더 낮아집니다.
        </li>
        <li>
          <strong>잎끼리 옆으로 이어져</strong> 있습니다. 잎마다 다음 잎(구현에 따라 이전 잎도)을 가리키는 포인터가 있습니다.
        </li>
      </ul>
      <p>
        두 번째 성질 덕분에 <code>WHERE age BETWEEN 20 AND 29</code> 같은 범위 쿼리가 쌉니다. 20이 있을 잎까지 높이만큼 내려간 다음, 잎을 옆으로 따라가며 29를 넘을 때까지 읽으면 됩니다. 범위에 드는 키가 잎 몇 장에 모여 있으므로 순서대로 몇 페이지만 더 읽습니다. <code>ORDER BY age</code>도 잎을 따라 읽으면 이미 정렬되어 있습니다. 해시 인덱스는 같음(=) 조건에는 빠르지만 이런 범위나 정렬에는 도움이 안 됩니다.
      </p>
      <Code label="B+트리 범위 검색: 한 번 내려가고, 잎을 따라 옆으로">{`
// 내부 노드: { keys, kids }, 잎: { keys, rows, next } (next는 오른쪽 잎)
// 내부 노드의 kids[i]에는 keys[i-1] 이상, keys[i] 미만인 키가 있다
function* range(root, lo, hi) {
  let node = root;
  while (node.kids) {                       // lo가 있을 잎까지: 높이만큼 읽기
    let i = 0;
    while (i < node.keys.length && node.keys[i] <= lo) i++;
    node = node.kids[i];
  }
  for (; node; node = node.next) {          // 잎을 옆으로 따라간다
    for (let i = 0; i < node.keys.length; i++) {
      if (node.keys[i] > hi) return;        // 범위를 벗어나면 끝
      if (node.keys[i] >= lo) yield node.rows[i];
    }
  }
}`}</Code>
      <p>
        관계형 데이터베이스의 기본 인덱스는 대부분 B+트리입니다. PostgreSQL의 <code>CREATE INDEX</code>가 기본으로 만드는 btree 인덱스가 그렇고, MySQL InnoDB의 인덱스도 그렇습니다. 다만 행을 어디에 두느냐가 다릅니다. InnoDB는 테이블 자체를 기본 키 순서의 B+트리로 저장해서 잎에 행이 통째로 들어 있고(<T en="clustered index">클러스터드 인덱스</T>), 다른 인덱스의 잎에는 기본 키 값을 적어 둡니다. PostgreSQL은 행을 순서 없는 힙 테이블에 따로 두고, 인덱스의 잎에는 행의 위치를 적어 둡니다.
      </p>

      <h2>인덱스가 언제나 빠른 것은 아니다</h2>
      <p>
        인덱스가 없으면 데이터베이스는 조건에 맞는 행을 찾으려고 테이블의 모든 페이지를 처음부터 끝까지 읽습니다. 이것이 <T en="full table scan">전체 테이블 스캔</T>입니다. 인덱스가 있으면 높이만큼 내려가 필요한 행만 가져옵니다.
      </p>
      <IndexFigure />
      <p>
        처음 설정(행 100만 개)에서 조건을 "같음"으로 바꾸면, 전체 스캔은 페이지 10,000개를 읽고 인덱스는 4개를 읽습니다. 그런데 범위를 넓혀 가면 사정이 바뀝니다. 행이 테이블 곳곳에 흩어져 있으면 맞는 행마다 다른 페이지를 읽어야 하므로, 맞는 행이 전체의 약 1%(9,978행)를 넘는 순간 인덱스가 전체 스캔보다 많은 페이지를 읽습니다. 10%라면 인덱스는 약 10만 페이지, 전체 스캔의 10배입니다.
      </p>
      <p>
        게다가 전체 스캔은 페이지를 순서대로 읽는 순차 읽기이고, 인덱스는 이곳저곳을 건너뛰는 무작위 읽기입니다. 순차 읽기는 미리 읽기와 묶어 읽기가 통해서 한 페이지당 훨씬 쌉니다. PostgreSQL의 비용 모델은 기본값으로 무작위 페이지 읽기(<code>random_page_cost = 4</code>)를 순차 읽기(<code>seq_page_cost = 1</code>)의 4배로 칩니다. "무작위 읽기를 4배로 치기"를 켜면 갈림길이 약 0.25%로 당겨집니다. 쿼리 옵티마이저가 인덱스를 두고도 전체 스캔을 고르는 것은 이 계산 때문입니다. 옵티마이저가 통계를 보고 계획을 고르는 과정은 데이터베이스 과목의 <a href="#cs-databases/indexes">인덱스와 쿼리 계획</a>에서 직접 따라가 볼 수 있습니다. 반대로 "클러스터드"를 켜면 맞는 행이 연속된 페이지에 모여 있으므로 범위가 넓어도 전체 스캔보다 크게 나빠지지 않습니다. 기본 키 범위로 읽는 쿼리가 InnoDB에서 특히 빠른 이유입니다.
      </p>
      <Callout kind="warn">
        인덱스는 공짜가 아닙니다. 행을 넣거나 고치거나 지울 때마다 그 테이블의 모든 인덱스도 함께 고쳐야 하고(잎에 넣기, 넘치면 나누기), 인덱스마다 디스크와 버퍼 캐시를 차지합니다. 읽기는 빨라지고 쓰기는 느려지는 맞바꿈이므로, 실제로 자주 쓰는 조건에만 인덱스를 만듭니다. 값의 종류가 몇 개뿐인 열(예: 성별, 상태 플래그)에 만든 인덱스는 위의 갈림길을 넘기 쉬워서 쓰이지 않는 경우가 많습니다.
      </Callout>

      <Callout kind="key">
        디스크 위의 자료구조는 페이지를 읽는 횟수로 비용을 셉니다. B-트리는 노드 하나를 페이지 하나에 맞추고 키를 수백 개씩 담아, 높이를 <M>{'\\log_f n'}</M>으로 낮춥니다. 넘친 노드는 가운데 키를 올리며 나뉘고 루트가 위로 자라므로 모든 잎이 같은 깊이에 있습니다. B+트리는 데이터를 잎에만 두고 잎을 이어 범위 쿼리를 빠르게 하며, 관계형 데이터베이스 인덱스의 기본입니다. 다만 조건에 맞는 행이 많으면 흩어진 행을 하나씩 읽는 인덱스보다 전체 스캔이 쌉니다.
      </Callout>
      <Quiz
        q="행 1억 개인 orders 테이블의 status 열에 B+트리 인덱스가 있다. 값의 절반이 'done'이다. WHERE status = 'done' 쿼리의 실행 계획을 보니 옵티마이저가 인덱스를 쓰지 않고 전체 스캔을 골랐다. 가장 그럴듯한 이유는?"
        options={['B+트리는 문자열 키를 찾지 못한다', '맞는 행이 5천만 개라 인덱스로 행을 하나씩 찾아가면 테이블 페이지 수보다 훨씬 많이 읽게 된다', '인덱스의 높이가 너무 높아서 루트까지 가는 데 오래 걸린다', '인덱스는 범위 조건에만 쓰이고 같음 조건에는 쓰이지 않는다']}
        answer={1}
        explain={<>인덱스로 내려가는 것은 몇 페이지면 되지만, 그 뒤에 맞는 행 5천만 개를 테이블에서 가져와야 합니다. 행이 테이블 곳곳에 흩어져 있으면 행마다 무작위 읽기가 일어나, 테이블 전체를 순서대로 한 번 읽는 것보다 훨씬 비쌉니다(그림 3의 갈림길을 한참 넘은 곳입니다). 1억 행이어도 B+트리의 높이는 3~4층이고, 문자열도 정렬할 수 있으니 키로 쓸 수 있으며, 같음 조건은 인덱스가 가장 잘하는 일입니다.</>}
      />
    </>
  );
}
