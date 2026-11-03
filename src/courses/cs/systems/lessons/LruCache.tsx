import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { LOOP_KEYS, PHASES, PHASE_SET, POLICIES, POLICY_NAMES, STREAM_LEN, ZIPF_KEYS, avgLatency, lruHitCurve, lruReplay, makeStream, simulate, type CacheOp, type Policy, type StreamKind } from './saving';
import '../../algorithms/lessons/algorithms.css';
import './saving.css';

/* ─────────────── Figure 1: an LRU cache, one request at a time ─────────────── */

const PRESET: CacheOp[] = [
  { kind: 'put', key: 'A', value: 1 },
  { kind: 'put', key: 'B', value: 2 },
  { kind: 'put', key: 'C', value: 3 },
  { kind: 'get', key: 'A' },
  { kind: 'put', key: 'D', value: 4 },
  { kind: 'get', key: 'B' },
  { kind: 'put', key: 'B', value: 5 },
  { kind: 'get', key: 'A' },
  { kind: 'get', key: 'C' },
  { kind: 'put', key: 'C', value: 6 },
  { kind: 'put', key: 'A', value: 7 },
  { kind: 'get', key: 'B' },
];
const MAX_OPS = 40;
const RAND_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const RAND_W = [5, 3, 2, 1.5, 1, 1]; // a few keys are much more popular

const opText = (op: CacheOp) => (op.kind === 'get' ? `get(${op.key})` : `put(${op.key}, ${op.value})`);

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string, dash?: number[]) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(dash ?? []);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.setLineDash([]);
}

function tag(ctx: CanvasRenderingContext2D, P: Palette, text: string, x: number, y: number, color: string) {
  ctx.font = `600 11px ${P.fontBody}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = P.surface;
  ctx.fillRect(x - tw / 2 - 3, y - 7, tw + 6, 14);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function LruStepFigure() {
  const P = usePalette();
  const [cap, setCap] = useState(3);
  const [ops, setOps] = useState<CacheOp[]>(PRESET);
  const [mine, setMine] = useState(false); // the reader sent a request: show its result right away
  const [run, setRun] = useState(0);
  const [typed, setTyped] = useState('E');
  const r = useRef(rng(5));
  const frames = useMemo(() => lruReplay(cap, ops), [cap, ops]);
  const s = useStepper(frames.length, 2, `${cap}|${run}`, mine);
  const f = frames[s.i];
  const nextVal = ops.slice(0, s.i).reduce((mx, o) => Math.max(mx, o.value ?? 0), 0) + 1;

  // a new request continues from the state on screen (later preset steps are dropped)
  const send = (more: CacheOp[]) => {
    setOps([...ops.slice(0, s.i), ...more]);
    setMine(true);
    setRun((x) => x + 1);
  };
  const full = s.i >= MAX_OPS;
  const key = typed.trim().toUpperCase();
  const randomReq = () => {
    let u = r.current() * RAND_W.reduce((a, b) => a + b, 0);
    let j = 0;
    while (u > RAND_W[j]) u -= RAND_W[j++];
    const k = RAND_KEYS[j];
    // cache-aside: on a miss the caller reads the origin and puts the value
    send(f.list.some((e) => e.key === k) ? [{ kind: 'get', key: k }] : [{ kind: 'get', key: k }, { kind: 'put', key: k, value: nextVal }]);
  };
  const restart = () => {
    setOps(PRESET);
    setMine(false);
    setRun((x) => x + 1);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const slots = cap + 1; // the last slot shows an evicted node
      const pad = 10;
      const bw = Math.min(66, (w - 2 * pad) / (slots + (slots - 1) * 0.5));
      const gap = bw * 0.5;
      const total = slots * bw + (slots - 1) * gap;
      const x0 = (w - total) / 2;
      const sx = (i: number) => x0 + i * (bw + gap);
      const mapY = 26;
      const mapH = 24;
      const mapW = bw * 0.8;
      const listY = 92;
      const nodeH = 46;
      const touched = f.key;
      const hot = f.event === 'hit' || f.event === 'update';
      const fresh = f.event === 'insert';
      const fillOf = (k: string) => (k === touched && hot ? P.hl : k === touched && fresh ? P.pos : P.surface);
      const inkOf = (k: string) => (k === touched && hot ? '#1a1a1a' : k === touched && fresh ? P.surface : P.ink);

      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('해시 맵 (키 → 노드)', x0, 11);

      // map entries, sorted by key: the map knows where each node is, not which is newest
      const sorted = f.list.map((e, i) => ({ key: e.key, at: i })).sort((a, b) => (a.key < b.key ? -1 : 1));
      sorted.forEach((e, j) => {
        const cx = sx(j) + bw / 2;
        const on = e.key === touched;
        drawArrow(ctx, cx, mapY + mapH, sx(e.at) + bw / 2, listY - 2, on ? P.ink : alpha(P.ink3, 0.8), on ? 2.2 : 1.1, 7);
      });
      sorted.forEach((e, j) => {
        const bx = sx(j) + (bw - mapW) / 2;
        box(ctx, bx, mapY, mapW, mapH, fillOf(e.key), P.ink);
        ctx.fillStyle = inkOf(e.key);
        ctx.font = `700 13px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.key, bx + mapW / 2, mapY + mapH / 2 + 1);
      });
      if (f.event === 'miss' && f.key) {
        const bx = sx(sorted.length) + (bw - mapW) / 2;
        box(ctx, bx, mapY, mapW, mapH, P.surface, P.bad, [4, 3]);
        ctx.fillStyle = P.bad;
        ctx.font = `700 13px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.key, bx + mapW / 2, mapY + mapH / 2 + 1);
        tag(ctx, P, '없음', bx + mapW / 2, mapY + mapH + 12, P.bad);
      }

      // linked-list nodes with next (upper) and prev (lower) pointers
      f.list.forEach((e, i) => {
        if (i < f.list.length - 1) {
          const xa = sx(i) + bw;
          const xb = sx(i + 1);
          drawArrow(ctx, xa + 2, listY + 14, xb - 2, listY + 14, P.ink2, 1.3, 6);
          drawArrow(ctx, xb - 2, listY + nodeH - 14, xa + 2, listY + nodeH - 14, P.ink3, 1.3, 6);
        }
      });
      f.list.forEach((e, i) => {
        box(ctx, sx(i), listY, bw, nodeH, fillOf(e.key), P.ink);
        ctx.fillStyle = inkOf(e.key);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${bw < 44 ? 14 : 16}px ${P.fontMono}`;
        ctx.fillText(e.key, sx(i) + bw / 2, listY + 17);
        ctx.font = `${bw < 44 ? 10 : 11}px ${P.fontMono}`;
        ctx.fillText(`=${e.value}`, sx(i) + bw / 2, listY + 34);
      });
      if (!f.list.length) {
        ctx.fillStyle = P.ink3;
        ctx.font = `13px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.fillText('리스트가 비어 있음', x0, listY + nodeH / 2);
      }
      if (f.evicted) {
        const ex = sx(cap);
        ctx.globalAlpha = 0.75;
        box(ctx, ex, listY, bw, nodeH, P.surface, P.bad, [4, 3]);
        ctx.fillStyle = P.bad;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${bw < 44 ? 14 : 16}px ${P.fontMono}`;
        ctx.fillText(f.evicted.key, ex + bw / 2, listY + 17);
        ctx.font = `${bw < 44 ? 10 : 11}px ${P.fontMono}`;
        ctx.fillText(`=${f.evicted.value}`, ex + bw / 2, listY + 34);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(ex + 6, listY + 6);
        ctx.lineTo(ex + bw - 6, listY + nodeH - 6);
        ctx.stroke();
        tag(ctx, P, '퇴출', ex + bw / 2, listY + nodeH + 12, P.bad);
      }
      if (f.list.length) {
        tag(ctx, P, 'head', sx(0) + bw / 2, listY + nodeH + 12, P.ink2);
        if (f.list.length > 1) tag(ctx, P, 'tail', sx(f.list.length - 1) + bw / 2, listY + nodeH + 12, P.ink2);
      }
      // the node that moved to the front
      if (f.from !== null && f.from > 0) {
        const xa = sx(f.from) + bw / 2;
        const xb = sx(0) + bw / 2;
        const y = listY + nodeH + 24;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(xa, y);
        ctx.bezierCurveTo(xa, y + 26, xb, y + 26, xb + 3, y + 6);
        ctx.stroke();
        drawArrow(ctx, xb + 3, y + 6, xb, y, P.ink, 1.8, 7);
        tag(ctx, P, '맨 앞으로', (xa + xb) / 2, y + 20, P.ink);
      }
    },
    [P, f, cap],
    { height: 196 },
  );

  const gets = f.hits + f.misses;
  const chipState = (i: number) => {
    if (i >= s.i) return 'future';
    const fr = frames[i + 1];
    return fr.event === 'hit' ? 'hit' : fr.event === 'miss' ? 'miss' : 'put';
  };

  return (
    <Figure
      no={1}
      title="LRU 캐시를 한 단계씩"
      hint="재생하거나 요청을 직접 보내 보세요"
      caption={<>위 줄은 키로 노드를 찾는 해시 맵, 아래 줄은 사용한 순서를 기억하는 이중 연결 리스트입니다. 맨 앞(head)이 가장 최근에 쓴 키, 맨 뒤(tail)가 가장 오래 안 쓴 키입니다. 노란색은 방금 찾았거나 값을 바꾼 노드, 주황색은 새로 넣은 노드, 빨간 점선은 미스이거나 쫓겨난 노드입니다. 무작위 요청은 몇몇 키를 훨씬 자주 고르고, 미스가 나면 원본에서 읽어 put까지 합니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`용량 ${cap}인 LRU 캐시. 최근 순서: ${f.list.map((e) => e.key).join(', ') || '비어 있음'}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="op-list" aria-hidden="true">
            <span className="ds-label">요청 순서 (누르면 그 단계로 이동)</span>
            {ops.map((op, i) => (
              <button key={i} type="button" tabIndex={-1} className="op-chip" data-s={chipState(i)} data-cur={i === s.i - 1 || undefined} onClick={() => s.go(i + 1)}>
                {opText(op)}
              </button>
            ))}
          </div>
          <div className="step-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="용량"
            value={cap}
            onChange={setCap}
            options={[3, 4, 5].map((v) => ({ value: v, label: String(v) }))}
          />
          <StepControls s={s} id="lru-speed" maxSpeed={6} />
          <div className="ctl">
            <label className="ctl-label" htmlFor="lru-key">
              <span>키 직접 입력 (3자까지)</span>
            </label>
            <div className="key-form">
              <input id="lru-key" className="text-input mono" type="text" value={typed} maxLength={3} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value.replace(/\s/g, ''))} />
              <Button small onClick={() => send([{ kind: 'get', key }])} disabled={!key || full}>
                get
              </Button>
              <Button small onClick={() => send([{ kind: 'put', key, value: nextVal }])} disabled={!key || full}>
                put
              </Button>
            </div>
          </div>
          <div className="btn-row">
            <Button small primary onClick={randomReq} disabled={full}>
              무작위 요청
            </Button>
            <Button small onClick={restart}>
              예시로 되돌리기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="적중 (get)" value={`${f.hits}번`} color="var(--good)" />
            <Readout label="미스 (get)" value={`${f.misses}번`} color="var(--bad)" />
            <Readout label="적중률" value={gets ? `${Math.round((f.hits / gets) * 100)}%` : '—'} />
            <Readout label="퇴출" value={`${f.evictions}번`} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '적중 · 값 갱신', shape: 'sq' },
          { color: 'var(--pos)', label: '새로 넣음', shape: 'sq' },
          { color: 'var(--bad)', label: '미스 · 퇴출', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: five replacement policies on three request streams ─────────────── */

const STREAM_OPTS: { value: StreamKind; label: string }[] = [
  { value: 'zipf', label: '인기 편중' },
  { value: 'loop', label: '순차 반복' },
  { value: 'phase', label: '작업 집합 변화' },
];
const STREAM_NOTE: Record<StreamKind, string> = {
  zipf: `키 ${ZIPF_KEYS}개 중 r번째로 인기 있는 키를 1/rˢ에 비례하는 확률로 요청합니다. 소수의 키가 요청 대부분을 차지합니다.`,
  loop: `키 0부터 ${LOOP_KEYS - 1}까지를 차례로 읽고, 다시 처음부터 읽기를 반복합니다. 큰 테이블을 처음부터 끝까지 훑는 쿼리와 같습니다.`,
  phase: `요청 ${STREAM_LEN.toLocaleString('ko-KR')}개를 ${PHASES}구간으로 나눠, 구간마다 서로 다른 키 ${PHASE_SET}개에 요청의 90%가 몰립니다. 나머지 10%는 아무 키나 고릅니다.`,
};
const POLICY_COLOR: Record<Policy, string> = { lru: 'var(--pos)', fifo: 'var(--c-cs-1)', lfu: 'var(--c-cs-2)', random: 'var(--ink-3)', opt: 'var(--ink)' };

function PolicyFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<StreamKind>('zipf');
  const [zs, setZs] = useState(1);
  const [cap, setCap] = useState(100);
  const stream = useMemo(() => makeStream(kind, zs), [kind, zs]);
  const rates = useMemo(() => Object.fromEntries(POLICIES.map((p) => [p, simulate(p, stream, cap) / stream.length])) as Record<Policy, number>, [stream, cap]);
  const universe = kind === 'loop' ? LOOP_KEYS : ZIPF_KEYS;

  // the stream itself (time → right, key → up): every 10th request, or the first 1,000 for the scan whose period would alias
  const shown = kind === 'loop' ? 1000 : stream.length;
  const every = kind === 'loop' ? 1 : 10;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: shown, yMin: 0, yMax: universe, pad: { l: 40, r: 8, t: 8, b: 20 } });
      plot.frame();
      ctx.fillStyle = alpha(P.ink, P.dark ? 0.5 : 0.35);
      for (let i = 0; i < shown; i += every) ctx.fillRect(plot.X(i) - 0.75, plot.Y(stream[i] + 0.5) - 0.75, 1.5, 1.5);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('0', plot.X(0) - 5, plot.Y(0));
      ctx.fillText(String(universe), plot.X(0) - 5, plot.Y(universe));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillText(kind === 'loop' ? '가로: 처음 요청 1,000개 · 세로: 키 번호' : `가로: 요청 순서 · 세로: 키 번호`, plot.X(0), plot.Y(0) + 5);
    },
    [P, stream, universe, shown, every, kind],
    { aspect: 4.2, maxHeight: 150, minHeight: 110 },
  );

  return (
    <Figure
      no={2}
      title="교체 정책 비교"
      hint="패턴과 캐시 크기를 바꿔 보세요"
      caption={<>요청 {STREAM_LEN.toLocaleString('ko-KR')}개를 다섯 정책의 캐시에 똑같이 흘려보내고, 적중한 비율을 막대로 그렸습니다. 모든 정책은 미스가 날 때마다 그 키를 캐시에 넣고, 자리가 없으면 정책대로 하나를 버립니다. 최적(Belady)은 미래의 요청을 미리 아는 경우로, 현실에서는 쓸 수 없지만 어떤 정책도 넘을 수 없는 상한입니다. 시뮬레이션은 시드를 고정해 언제나 같은 결과를 냅니다.</>}
    >
      <div className="controls row">
        <Seg label="요청 패턴" value={kind} onChange={setKind} options={STREAM_OPTS} />
        <Slider id="pol-cap" label="캐시 크기 (키 개수)" value={cap} min={10} max={300} step={10} onChange={setCap} />
        {kind === 'zipf' && <Slider id="pol-s" label="편중 정도 s" value={zs} min={0.6} max={1.4} step={0.1} onChange={setZs} format={(v) => v.toFixed(1)} />}
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label="요청 패턴: 가로는 요청 순서, 세로는 요청한 키">
        <canvas ref={canvasRef} />
      </div>
      <div className="stream-note">{STREAM_NOTE[kind]}</div>
      <div className="growth-rows policy-rows">
        {POLICIES.map((p) => (
          <div key={p} className="growth-row" data-opt={p === 'opt' || undefined}>
            <span className="growth-name">{POLICY_NAMES[p]}</span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: `${Math.max(0.4, rates[p] * 100)}%`, background: POLICY_COLOR[p] }} />
            </span>
            <span className="growth-time mono">{(rates[p] * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Readout label="LRU가 놓친 몫 (최적 − LRU)" value={`${((rates.opt - rates.lru) * 100).toFixed(1)}%p`} color="var(--pos)" />
        <Readout label="현실의 정책 중 1위" value={POLICY_NAMES[(['lru', 'fifo', 'lfu', 'random'] as Policy[]).reduce((a, b) => (rates[b] > rates[a] ? b : a))]} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: hit rate and average latency against cache size ─────────────── */

const CURVE_MAX = ZIPF_KEYS;
const T_HIT = 0.5; // ms, an assumption for the figure

function CurveFigure() {
  const P = usePalette();
  const [zs, setZs] = useState(1);
  const [cap, setCap] = useState(100);
  const [tMiss, setTMiss] = useState(10);
  const curve = useMemo(() => {
    const hits = lruHitCurve(makeStream('zipf', zs), CURVE_MAX);
    return Array.from(hits, (x) => x / STREAM_LEN);
  }, [zs]);
  const h = curve[cap];
  const lat = avgLatency(h, T_HIT, tMiss);
  const need = curve.findIndex((x) => x >= 0.9);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const gap = 16;
      const top = (H - gap) * 0.5;
      const pad = { l: 44, r: 12, t: 22, b: 8 };
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: CURVE_MAX, yMin: 0, yMax: 100, pad });
      p1.grid({ xStep: 200, yStep: 25, labels: false });
      const ctxText = (s: string, x: number, y: number, align: CanvasTextAlign, color = P.ink3) => {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(s, x, y);
      };
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      for (const y of [0, 50, 100]) ctxText(`${y}%`, p1.X(0) - 5, p1.Y(y), 'right');
      ctx.font = `12px ${P.fontBody}`;
      ctxText('적중률 (LRU)', p1.X(0), 10, 'left', P.ink2);
      p1.fn((x) => curve[Math.round(x)] * 100, P.pos, 2.4, { samples: 200 });
      p1.line(cap, 0, cap, 100, alpha(P.ink, 0.4), 1.2, [4, 4]);
      p1.dot(cap, h * 100, 5, P.pos, P.surface, 2);

      // bottom: average latency
      ctx.save();
      ctx.translate(0, top + gap);
      const yMax = tMiss * 1.05;
      const p2 = new Plot(ctx, w, H - top - gap, P, { xMin: 0, xMax: CURVE_MAX, yMin: 0, yMax, pad: { l: 44, r: 12, t: 22, b: 22 } });
      p2.grid({ xStep: 200, yStep: tMiss / 2, labels: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      for (const y of [0, tMiss / 2, tMiss]) ctxText(`${y}`, p2.X(0) - 5, p2.Y(y), 'right');
      ctx.textBaseline = 'top';
      for (let x = 0; x <= CURVE_MAX; x += 200) ctxText(String(x), p2.X(x), p2.Y(0) + 5, x === 0 ? 'left' : x === CURVE_MAX ? 'right' : 'center');
      ctx.font = `12px ${P.fontBody}`;
      ctx.textBaseline = 'middle';
      ctxText('평균 응답 시간 (ms)', p2.X(0), 10, 'left', P.ink2);
      p2.fn((x) => avgLatency(curve[Math.round(x)], T_HIT, tMiss), P.neg, 2.4, { samples: 200 });
      p2.line(cap, 0, cap, yMax, alpha(P.ink, 0.4), 1.2, [4, 4]);
      p2.dot(cap, lat, 5, P.neg, P.surface, 2);
      ctx.restore();
    },
    [P, curve, cap, tMiss, h, lat],
    { aspect: 1.9, maxHeight: 380, minHeight: 300 },
  );

  const double = curve[Math.min(CURVE_MAX, cap * 2)];
  return (
    <Figure
      no={3}
      title="캐시를 키우면 얼마나 빨라질까"
      hint="캐시 크기와 편중 정도를 바꿔 보세요"
      caption={<>그림 2의 인기 편중 요청(키 {ZIPF_KEYS.toLocaleString('ko-KR')}개, 요청 {STREAM_LEN.toLocaleString('ko-KR')}개)을 LRU 캐시로 받을 때, 캐시 크기마다 적중률과 평균 응답 시간을 그렸습니다. 캐시 응답은 {T_HIT}ms, 원본 응답은 고른 값이라고 가정했습니다. 가로축은 캐시에 담는 키의 개수이고, 1,000이면 모든 키가 들어갑니다. 그래도 적중률이 100%가 되지 않는 것은 키마다 처음 한 번은 반드시 미스이기 때문입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`캐시 크기 ${cap}에서 적중률 ${(h * 100).toFixed(1)}%, 평균 응답 시간 ${lat.toFixed(2)}ms`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="cv-cap" label="캐시 크기" value={cap} min={0} max={CURVE_MAX} step={10} onChange={setCap} />
          <Slider id="cv-s" label="편중 정도 s" value={zs} min={0} max={1.4} step={0.1} onChange={setZs} format={(v) => v.toFixed(1)} />
          <Seg
            label="원본 응답 시간"
            value={tMiss}
            onChange={setTMiss}
            options={[5, 10, 50].map((v) => ({ value: v, label: `${v}ms` }))}
          />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="적중률" value={`${(h * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="평균 응답 시간" value={`${lat.toFixed(2)}ms`} color="var(--neg)" />
            <Readout label="캐시가 없을 때보다" value={`${(tMiss / lat).toFixed(1)}배 빠름`} />
            <Readout label="크기를 두 배로 하면" value={`${(double * 100).toFixed(1)}%`} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>적중률 90%에 필요한 크기: {need >= 0 ? `${need}개` : '도달 못 함'}</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function LruCache() {
  return (
    <>
      <h2>가까이 둘수록 빠르다</h2>
      <p>
        컴퓨터 안의 저장 장치는 빠를수록 작고 비쌉니다. 그래서 거의 모든 시스템은 느리고 큰 저장소 앞에 빠르고 작은 저장소를 하나 더 두고, 자주 쓰는 데이터를 거기에 복사해 둡니다. 이 작은 저장소가 <T en="cache">캐시</T>입니다. 아래 표는 흔히 인용되는 대략적인 크기입니다. 정확한 값은 하드웨어마다 다르니 자릿수만 보세요.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>어디서 읽나</th>
              <th>대략적인 시간</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CPU의 L1 캐시</td>
              <td>약 1ns</td>
            </tr>
            <tr>
              <td>메인 메모리(RAM)</td>
              <td>약 100ns</td>
            </tr>
            <tr>
              <td>SSD에서 무작위 읽기</td>
              <td>수십~수백 µs</td>
            </tr>
            <tr>
              <td>같은 데이터센터의 다른 서버</td>
              <td>약 0.5ms (왕복)</td>
            </tr>
            <tr>
              <td>다른 대륙의 서버</td>
              <td>100ms 이상 (왕복)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        한 칸 내려갈 때마다 수십에서 수천 배씩 느려집니다. 그래서 캐시는 층층이 쌓여 있습니다. CPU는 RAM 앞에 L1·L2·L3 캐시를, 운영체제는 디스크 앞에 <T en="page cache">페이지 캐시</T>를, 데이터베이스는 디스크 앞에 <T en="buffer pool">버퍼 풀</T>을 둡니다. 웹 서비스는 데이터베이스 앞에 Redis나 Memcached 같은 메모리 캐시를, 사용자 가까이에는 <T en="content delivery network">CDN</T>을 두고, 브라우저는 한 번 받은 파일을 HTTP 캐시에 보관합니다.
      </p>

      <h2>적중률이 평균 응답 시간을 정한다</h2>
      <p>
        찾는 데이터가 캐시에 있으면 <T en="hit">적중</T>, 없으면 <T en="miss">미스</T>입니다. 요청 중 적중하는 비율을 <T en="hit rate">적중률</T> h라고 하면, 평균 응답 시간은 이렇습니다.
      </p>
      <MB note="t_hit: 캐시에서 읽는 시간, t_miss: 미스가 나서 원본에서 읽는 시간">{'\\bar t = h \\cdot t_{\\text{hit}} + (1 - h) \\cdot t_{\\text{miss}}'}</MB>
      <p>
        캐시가 0.5ms, 원본 데이터베이스가 10ms 걸린다고 해 봅시다. 적중률이 90%면 평균은 <M>{'0.9 \\times 0.5 + 0.1 \\times 10 = 1.45'}</M>ms이고, 99%면 <M>{'0.99 \\times 0.5 + 0.01 \\times 10 = 0.595'}</M>ms입니다. 적중률은 9%p 올랐을 뿐인데 평균 응답 시간은 2.4배 빨라졌습니다. 평균을 좌우하는 것은 적중률보다 <strong>미스율</strong>이고, 미스율은 10%에서 1%로 열 배 줄었기 때문입니다. 미스 한 번이 적중 한 번보다 훨씬 비싸면, 남은 몇 퍼센트의 미스가 평균 시간 대부분을 차지합니다.
      </p>

      <h2>캐시가 통하는 이유: 지역성</h2>
      <p>
        캐시가 작아도 쓸모 있는 것은, 프로그램이 데이터를 고르게 쓰지 않기 때문입니다. 이를 <T en="locality">지역성</T>이라고 합니다.
      </p>
      <ul>
        <li>
          <T en="temporal locality">시간 지역성</T>: 방금 쓴 데이터는 곧 다시 쓸 가능성이 큽니다. 반복문의 변수, 로그인한 사용자의 세션, 방금 연 문서가 그렇습니다.
        </li>
        <li>
          <T en="spatial locality">공간 지역성</T>: 방금 쓴 데이터의 이웃도 곧 쓸 가능성이 큽니다. 배열을 차례로 훑는 코드가 그렇습니다. CPU 캐시가 바이트 하나가 아니라 64바이트 안팎의 줄(cache line) 단위로 읽어 오는 이유입니다.
        </li>
      </ul>
      <p>
        웹 서비스에서는 <strong>인기 편중</strong>도 큽니다. 상품, 동영상, 검색어의 인기는 대개 고르지 않아서 소수가 요청 대부분을 차지합니다. 이런 분포를 흔히 <T en="Zipf distribution">지프 분포</T>로 흉내 냅니다. 인기 순위가 r인 항목을 <M>{'1/r^s'}</M>에 비례하는 확률로 고르는 분포로, s가 클수록 편중이 심합니다.
      </p>

      <h2>꽉 차면 무엇을 버릴까</h2>
      <p>
        캐시는 언젠가 가득 찹니다. 새 데이터를 넣으려면 하나를 버려야 하고(<T en="eviction">퇴출</T>), 무엇을 버릴지 정하는 규칙을 <T en="replacement policy">교체 정책</T>이라고 합니다.
      </p>
      <ul>
        <li>
          <strong>LRU</strong>(Least Recently Used): <strong>가장 오래전에 쓴</strong> 것을 버립니다. 시간 지역성에 거는 정책입니다.
        </li>
        <li>
          <strong>FIFO</strong>(First In, First Out): <strong>가장 먼저 들어온</strong> 것을 버립니다. 그 사이에 몇 번을 썼든 상관없습니다.
        </li>
        <li>
          <strong>LFU</strong>(Least Frequently Used): 지금까지 <strong>가장 적게 쓴</strong> 것을 버립니다. 인기에 거는 정책입니다.
        </li>
        <li>
          <strong>무작위</strong>: 아무거나 하나 버립니다. 기억할 것이 없어 가장 단순합니다.
        </li>
      </ul>
      <p>
        이 장의 주인공은 LRU입니다. 가장 널리 쓰이는 기본값이고, 면접 문제로도 단골입니다. 문제는 속도입니다. 요청이 올 때마다 "가장 오래전에 쓴 것"을 찾느라 캐시 전체를 훑는다면 캐시가 오히려 병목이 됩니다. get과 put을 모두 <M>{'O(1)'}</M>에 해내야 합니다.
      </p>

      <h2>해시 맵 + 이중 연결 리스트</h2>
      <p>LRU 캐시는 두 가지를 빠르게 해야 합니다.</p>
      <ul>
        <li>
          키로 값을 찾기. <a href="#cs-algorithms/search-hash">해시 테이블</a>이면 평균 <M>{'O(1)'}</M>입니다.
        </li>
        <li>
          사용 순서를 기억하고, 방금 쓴 것을 맨 앞으로 옮기고, 맨 뒤를 버리기. 배열로 하면 중간 원소를 빼고 앞에 넣을 때 나머지를 밀어야 하므로 <M>{'O(n)'}</M>입니다.
        </li>
      </ul>
      <p>
        두 번째를 <M>{'O(1)'}</M>로 하려면 <T en="doubly linked list">이중 연결 리스트</T>를 씁니다. 노드마다 앞(prev)과 뒤(next) 노드를 가리키는 포인터가 있으면, 노드 하나를 떼어 내거나 맨 앞에 붙이는 일은 포인터 몇 개를 바꾸는 것으로 끝납니다. 다만 리스트에서는 "키가 A인 노드"를 찾으려면 처음부터 훑어야 하므로, 해시 맵이 키 → 노드 포인터를 들고 있게 합니다. 해시 맵은 찾기를, 리스트는 순서를 맡는 분업입니다.
      </p>
      <LruStepFigure />
      <p>
        처음 세 번의 put으로 캐시가 가득 찹니다. 네 번째 <code>get(A)</code>는 맨 뒤에 있던 A를 맵으로 바로 찾아 맨 앞으로 옮깁니다. 그 덕분에 다음 <code>put(D, 4)</code>에서는 A 대신 B가 쫓겨납니다. 한동안 아무도 찾지 않은 키가 버려지는 것입니다. 어느 단계에서도 리스트를 훑지 않는다는 점을 보세요. 맵에서 노드를 찾고, 그 노드의 이웃 포인터만 고칩니다.
      </p>
      <Code label="LRU 캐시: Map + 이중 연결 리스트">{`
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();                // key → 노드
    // 보초 노드 두 개: head.next가 가장 최근, tail.prev가 가장 오래됨
    this.head = { prev: null, next: null };
    this.tail = { prev: this.head, next: null };
    this.head.next = this.tail;
  }

  get(key) {
    const node = this.map.get(key);
    if (!node) return undefined;         // 미스
    this.#unlink(node);
    this.#pushFront(node);               // 방금 썼으니 맨 앞으로
    return node.value;
  }

  put(key, value) {
    let node = this.map.get(key);
    if (node) {                          // 이미 있으면 값만 바꾸고 맨 앞으로
      node.value = value;
      this.#unlink(node);
      this.#pushFront(node);
      return;
    }
    if (this.map.size >= this.capacity) {
      const old = this.tail.prev;        // 가장 오래 안 쓴 노드
      this.#unlink(old);
      this.map.delete(old.key);          // 노드에 키를 적어 두는 이유
    }
    node = { key, value, prev: null, next: null };
    this.#pushFront(node);
    this.map.set(key, node);
  }

  #unlink(n) {
    n.prev.next = n.next;
    n.next.prev = n.prev;
  }
  #pushFront(n) {
    n.prev = this.head;
    n.next = this.head.next;
    this.head.next.prev = n;
    this.head.next = n;
  }
}`}</Code>
      <p>
        양 끝에 값이 없는 <T en="sentinel">보초 노드</T>를 두면 "리스트가 비었나", "이 노드가 맨 앞인가" 같은 경우를 따로 처리할 필요가 없습니다. 노드에 키를 함께 적어 두는 것도 중요합니다. 맨 뒤 노드를 버릴 때 맵에서도 지워야 하는데, 노드만 보고는 키를 알 수 없기 때문입니다. 단일 연결 리스트로는 안 될까요? 노드를 떼어 내려면 앞 노드의 next를 고쳐야 하는데, 앞 노드를 알려면 처음부터 훑어야 하므로 prev 포인터가 꼭 필요합니다.
      </p>

      <h2>JavaScript의 지름길: Map의 순서</h2>
      <p>
        JavaScript의 <code>Map</code>은 키를 <strong>넣은 순서</strong>대로 순회한다고 명세에 정해져 있습니다. 키를 지웠다가 다시 넣으면 순서의 맨 뒤로 가므로, "맨 뒤 = 가장 최근, 맨 앞 = 가장 오래됨"으로 보면 Map 하나가 해시 맵과 연결 리스트 역할을 함께 합니다. 사실 Map은 내부적으로 넣은 순서를 따로 기억하고 있어서, 위의 연결 리스트를 대신 들고 있는 셈입니다.
      </p>
      <Code label="Map의 삽입 순서로 만든 LRU 캐시">{`
class MapLRU {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();
    this.oldest = null;            // 맨 앞(가장 오래된 키)을 가리키는 이터레이터
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);          // 지웠다가
    this.map.set(key, value);      // 다시 넣으면 맨 뒤(가장 최근)로 간다
    return value;
  }

  put(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      this.oldest ??= this.map.keys();
      this.map.delete(this.oldest.next().value); // 맨 앞 = 가장 오래 안 쓴 키
    }
  }
}`}</Code>
      <p>
        <code>delete</code>와 <code>set</code>, <code>has</code>는 모두 평균 <M>{'O(1)'}</M>이므로 이 캐시도 연산마다 평균 <M>{'O(1)'}</M>입니다. 맨 앞 키를 꺼낼 때 이터레이터 하나를 만들어 계속 쓰는 것이 눈에 띌 텐데, 이유가 있습니다.
      </p>
      <Callout kind="warn">
        흔히 보는 <code>this.map.delete(this.map.keys().next().value)</code>처럼 퇴출할 때마다 새 이터레이터를 만들면, 엔진에 따라 다르지만 V8(Node.js와 Chrome의 엔진)에서는 캐시가 클수록 느려집니다. Map은 지운 키의 칸을 바로 당겨 채우지 않고 표시만 해 두었다가 표를 다시 만들 때 한꺼번에 정리하는데, 새 이터레이터는 맨 앞에 쌓인 지운 칸을 매번 처음부터 건너뛰기 때문입니다. 이 글을 쓰며 Node.js에서 미스만 100만 번 일으켜 보니, 용량 1만에서 put 한 번에 약 10µs가 걸렸습니다. 이터레이터를 계속 쓰는 위 코드와 연결 리스트 버전은 0.1~0.2µs 정도였습니다. 이터레이터는 Map이 바뀌어도 유효하고, 그 앞에 있던 키는 모두 이미 지웠으므로 다음에 내놓는 키가 언제나 가장 오래된 키입니다.
      </Callout>

      <h2>정책 비교: 언제나 이기는 정책은 없다</h2>
      <p>
        정책을 하나 더 봅시다. 1966년 벨라디(László Bélády)가 밝힌 <T en="Belady's optimal algorithm">최적 정책</T>은 <strong>앞으로 가장 늦게 다시 쓰일</strong> 것을 버립니다. 미래를 알아야 하므로 실제로는 쓸 수 없지만, 미스 횟수를 가장 적게 만든다는 것이 증명되어 있어서 다른 정책이 얼마나 잘하는지 재는 잣대가 됩니다.
      </p>
      <PolicyFigure />
      <p>세 가지 요청 패턴에서 순위가 뒤바뀝니다. 캐시 크기 100을 기준으로 보겠습니다.</p>
      <ul>
        <li>
          <strong>인기 편중</strong>(s = 1)에서는 LFU 64.8%, LRU 58.0%, FIFO 52.5%, 무작위 52.3% 순입니다. 키마다 인기가 처음부터 끝까지 그대로이므로, 요청 횟수를 세는 LFU가 유리합니다. LRU는 가끔 들어온 비인기 키가 잠시 인기 키를 밀어내는 손해를 봅니다. 그래도 최적(75.7%)과는 아직 차이가 있습니다.
        </li>
        <li>
          <strong>순차 반복</strong>은 LRU의 유명한 약점입니다. 키 200개를 차례로 훑기를 되풀이하는데 캐시가 그보다 작으면 LRU와 FIFO, LFU의 적중률이 정확히 0%입니다. 다음에 필요한 키가 언제나 방금 쫓겨난 키이기 때문입니다. 아무 생각 없는 무작위가 20.2%로 오히려 낫고, 최적은 49.5%입니다. 캐시 크기를 200으로 올리는 순간 모든 정책이 99.3%로 뛰어오르는 절벽도 보세요.
        </li>
        <li>
          <strong>작업 집합 변화</strong>에서는 LFU가 21.1%로 꼴찌입니다. 첫 구간에서 횟수를 많이 쌓은 키들이 더는 쓰이지 않는데도 캐시를 차지하고, 새 구간의 키는 횟수가 적어 들어오자마자 쫓겨납니다. 최근만 보는 LRU는 구간이 바뀌어도 금세 따라가 53.0%를 냅니다.
        </li>
      </ul>
      <Callout kind="intuition">
        LRU는 "최근에 쓴 것을 곧 또 쓴다"에, LFU는 "많이 쓴 것을 앞으로도 많이 쓴다"에 겁니다. 미래가 과거와 비슷하면 둘 다 통하지만, 한 번 훑고 지나가는 스캔이나 유행의 변화처럼 가정이 깨지는 패턴에서는 크게 집니다. 실제 시스템의 정책은 대부분 이 약점을 메우려고 LRU나 LFU를 변형한 것입니다.
      </Callout>

      <h2>캐시를 키우면: 수확 체감</h2>
      <p>
        정책만큼 중요한 것이 캐시 크기입니다. LRU에는 편리한 성질이 있습니다. 크기 C인 LRU 캐시의 내용은 언제나 "가장 최근에 쓴 서로 다른 키 C개"이므로, 큰 캐시는 작은 캐시가 가진 것을 모두 갖고 있습니다. 그래서 요청마다 "직전에 같은 키를 쓴 뒤로 서로 다른 키가 몇 개 쓰였는가"(<T en="stack distance">스택 거리</T>)만 재면, 모든 크기의 적중률을 한 번에 얻습니다. 1970년 매트슨(Mattson) 등이 정리한 이 방법으로 그림 3의 곡선을 그렸습니다.
      </p>
      <CurveFigure />
      <p>
        s = 1에서 키의 1%인 10개만 담아도 요청의 21.1%가, 10%인 100개를 담으면 58.0%가 적중합니다. 하지만 거기서 크기를 두 배로 늘려도 70.3%로 12%p만 오르고, 90%를 넘기려면 612개가 필요합니다. 편중된 분포에서는 처음 조금이 큰 효과를 내고, 그 뒤로는 크기를 늘릴수록 얻는 것이 줄어듭니다. 반대로 s를 0으로 두면(모든 키가 똑같이 인기) 적중률이 크기에 정비례하는 직선이 되어, 캐시 1,000개 중 100개로는 10%밖에 얻지 못합니다. 캐시를 얼마나 크게 잡을지는 결국 요청이 얼마나 편중되어 있는지에 달려 있습니다.
      </p>
      <Callout kind="note">
        FIFO에는 LRU의 이 성질이 없어서, 캐시를 키웠는데 오히려 미스가 늘어나는 일이 생길 수 있습니다. 운영체제의 페이지 교체에서 처음 발견되어 <T en="Belady's anomaly">벨라디의 모순</T>이라고 부릅니다.
      </Callout>

      <h2>실제 시스템의 LRU</h2>
      <p>교과서의 LRU를 그대로 쓰는 곳은 생각보다 드뭅니다. 정확한 LRU는 요청마다 포인터를 고쳐야 해서, 아주 빠르거나 아주 큰 캐시에서는 그 비용과 메모리도 아깝기 때문입니다.</p>
      <ul>
        <li>
          <strong>Redis</strong>는 메모리가 가득 찼을 때의 정책을 <code>maxmemory-policy</code>로 고릅니다. <code>allkeys-lru</code>와 <code>allkeys-lfu</code>가 대표적인데, 둘 다 근사입니다. 연결 리스트를 두지 않고, 키 몇 개를 무작위로 뽑아 그중 가장 오래 안 쓴(또는 가장 덜 쓴) 키를 버립니다. 뽑는 개수(<code>maxmemory-samples</code>)를 늘리면 진짜 LRU에 가까워지는 대신 느려집니다. LFU 모드는 횟수를 시간이 지나면서 줄여서, 위에서 본 "옛 인기 키가 버티는" 문제를 누그러뜨립니다.
        </li>
        <li>
          <strong>MySQL InnoDB</strong>의 버퍼 풀은 LRU 리스트를 쓰되, 새로 읽은 페이지를 맨 앞이 아니라 리스트 중간쯤에 넣습니다. 한 번 읽고 마는 전체 테이블 스캔이 자주 쓰는 페이지를 한꺼번에 밀어내지 못하게 하려는 것으로, 그림 2의 순차 반복 문제에 대한 실전의 답입니다. PostgreSQL은 버퍼마다 사용 횟수를 두고 시곗바늘처럼 돌며 버릴 버퍼를 찾는 clock-sweep 방식으로 LRU를 근사합니다.
        </li>
        <li>
          <strong>Linux</strong>의 페이지 캐시는 LRU를 변형한 active와 inactive 두 리스트로 페이지를 관리합니다. 한 번 쓰인 페이지는 inactive에 들어가고, 다시 쓰여야 active로 올라갑니다. 구체적인 방식은 커널 버전에 따라 달라 왔습니다.
        </li>
        <li>
          <strong>CPU 캐시</strong>는 한 세트에 들어가는 몇 개의 줄 중 하나를 하드웨어가 나노초 안에 골라야 하므로, 많은 설계가 비트 몇 개로 LRU를 흉내 내는 의사 LRU(pseudo-LRU)를 씁니다.
        </li>
      </ul>

      <Callout kind="key">
        캐시의 가치는 적중률, 더 정확히는 미스율이 정합니다(<M>{'\\bar t = h \\cdot t_{\\text{hit}} + (1-h) \\cdot t_{\\text{miss}}'}</M>). LRU는 가장 오래전에 쓴 것을 버리고, 해시 맵(키 → 노드)과 이중 연결 리스트(사용 순서)로 get과 put을 모두 <M>{'O(1)'}</M>에 합니다. 하지만 어떤 정책도 모든 패턴에서 이기지는 못합니다. 순차 스캔에서는 LRU가 0%까지 떨어지고, 인기가 바뀌면 LFU가 무너집니다. 그래서 실제 시스템은 근사 LRU, 중간 삽입, 횟수 감쇠처럼 LRU와 LFU를 다듬은 정책을 씁니다.
      </Callout>
      <Quiz
        q="매일 밤 배치 작업이 큰 테이블 전체를 한 번 훑는데, 그 뒤 아침마다 서비스의 캐시 적중률이 한동안 크게 떨어진다. 캐시는 순수한 LRU다. 가장 그럴듯한 원인과 대책은?"
        options={['LRU의 get이 O(n)이라서 느려졌다. 해시 맵을 추가한다', '스캔한 페이지들이 최근에 쓴 것으로 맨 앞을 차지해 자주 쓰던 데이터를 모두 밀어냈다. 새로 들어온 데이터는 리스트 중간에 넣거나, 스캔은 캐시를 거치지 않게 한다', '캐시가 너무 커서 적중률이 떨어졌다. 캐시를 줄인다', 'FIFO로 바꾸면 스캔의 영향을 받지 않는다']}
        answer={1}
        explain={<>LRU는 "최근에 썼다"는 사실만 보므로, 한 번 훑고 지나가는 스캔의 페이지도 가장 소중한 데이터로 취급합니다. 스캔이 캐시보다 크면 원래 있던 인기 데이터가 모두 쫓겨나고, 아침 요청은 미스부터 시작합니다. InnoDB 버퍼 풀이 새 페이지를 리스트 중간에 넣는 것이 바로 이 문제 때문입니다. FIFO도 스캔한 페이지를 똑같이 넣고 오래된 것부터 버리므로 도움이 되지 않습니다.</>}
      />
    </>
  );
}
