import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../components/ui';
import { prefersReducedMotion, useCanvas2D } from '../lib/canvas';
import { fmt } from '../lib/plot';
import { alpha, usePalette } from '../lib/theme';
import { rng, sigmoid } from '../lib/math';

/* ═══════════════════ Figure 1: computational graph ═══════════════════ */

type NodeId = 'x' | 'w' | 'b' | 'y' | 'mul' | 'add' | 'sig' | 'sub' | 'sq';
interface GNode {
  id: NodeId;
  cx: number;
  cy: number;
  leaf: boolean;
  sym: string;
  title: string;
  v: string; // variable name
  fwd: number; // step at which value appears (0 = always)
  bwd: number; // step at which gradient appears
}
const OW = 116;
const OH = 80;
const LW = 124;
const LH = 62;
const NODES: GNode[] = [
  { id: 'x', cx: 72, cy: 48, leaf: true, sym: '', title: '입력', v: 'x', fwd: 0, bwd: 10 },
  { id: 'w', cx: 72, cy: 222, leaf: true, sym: '', title: '가중치', v: 'w', fwd: 0, bwd: 10 },
  { id: 'b', cx: 460, cy: 265, leaf: true, sym: '', title: '편향', v: 'b', fwd: 0, bwd: 9 },
  { id: 'y', cx: 880, cy: 265, leaf: true, sym: '', title: '정답', v: 'y', fwd: 0, bwd: 7 },
  { id: 'mul', cx: 250, cy: 135, leaf: false, sym: '×', title: '곱하기', v: 'u', fwd: 1, bwd: 9 },
  { id: 'add', cx: 460, cy: 135, leaf: false, sym: '+', title: '더하기', v: 'z', fwd: 2, bwd: 8 },
  { id: 'sig', cx: 670, cy: 135, leaf: false, sym: 'σ', title: '시그모이드', v: 'ŷ', fwd: 3, bwd: 7 },
  { id: 'sub', cx: 880, cy: 135, leaf: false, sym: '−', title: '빼기', v: 'd', fwd: 4, bwd: 6 },
  { id: 'sq', cx: 1037, cy: 135, leaf: false, sym: '( )²', title: '제곱', v: 'L', fwd: 5, bwd: 6 },
];
const NODE = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, GNode>;

interface GEdge {
  from: NodeId;
  to: NodeId;
  fwd: number;
  bwd: number;
  /** label position + alignment */
  lx: number;
  ly: number;
  anchor: 'start' | 'middle';
}
const EDGES: GEdge[] = [
  { from: 'x', to: 'mul', fwd: 1, bwd: 10, lx: 138, ly: 64, anchor: 'start' },
  { from: 'w', to: 'mul', fwd: 1, bwd: 10, lx: 138, ly: 214, anchor: 'start' },
  { from: 'mul', to: 'add', fwd: 2, bwd: 9, lx: 355, ly: 82, anchor: 'middle' },
  { from: 'b', to: 'add', fwd: 2, bwd: 9, lx: 470, ly: 212, anchor: 'start' },
  { from: 'add', to: 'sig', fwd: 3, bwd: 8, lx: 565, ly: 82, anchor: 'middle' },
  { from: 'sig', to: 'sub', fwd: 4, bwd: 7, lx: 775, ly: 82, anchor: 'middle' },
  { from: 'y', to: 'sub', fwd: 4, bwd: 7, lx: 890, ly: 212, anchor: 'start' },
  { from: 'sub', to: 'sq', fwd: 5, bwd: 6, lx: 958, ly: 82, anchor: 'middle' },
];

function boxHalf(n: GNode): [number, number] {
  return n.leaf ? [LW / 2, LH / 2] : [OW / 2, OH / 2];
}
/** Point on the border of node n in direction (dx, dy). */
function border(n: GNode, dx: number, dy: number): [number, number] {
  const [hw, hh] = boxHalf(n);
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [n.cx + dx * t, n.cy + dy * t];
}
function edgeEnds(e: GEdge): [number, number, number, number] {
  const a = NODE[e.from];
  const b = NODE[e.to];
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const [x1, y1] = border(a, dx, dy);
  const [x2, y2] = border(b, -dx, -dy);
  return [x1, y1, x2, y2];
}

const DEFAULTS = { x: 1.5, w: 0.8, b: -0.5, y: 1 };

function computeGraph(x: number, w: number, b: number, y: number) {
  const u = w * x;
  const z = u + b;
  const yh = sigmoid(z);
  const d = yh - y;
  const L = d * d;
  const gL = 1;
  const gd = 2 * d;
  const gyh = gd;
  const gy = -gd;
  const sp = yh * (1 - yh);
  const gz = gyh * sp;
  const gu = gz;
  const gb = gz;
  const gw = gu * x;
  const gx = gu * w;
  return {
    val: { x, w, b, y, mul: u, add: z, sig: yh, sub: d, sq: L } as Record<NodeId, number>,
    grad: { x: gx, w: gw, b: gb, y: gy, mul: gu, add: gz, sig: gyh, sub: gd, sq: gL } as Record<NodeId, number>,
    sp,
    d,
  };
}

function GraphFigure() {
  const [p, setP] = useState(DEFAULTS);
  const [eta, setEta] = useState(1);
  const [step, setStep] = useState(0);
  const [hist, setHist] = useState<number[]>([]);
  const [anim, setAnim] = useState<{ step: number; dir: 'f' | 'b'; t: number } | null>(null);
  const g = useMemo(() => computeGraph(p.x, p.w, p.b, p.y), [p]);

  // pulse animation
  useEffect(() => {
    if (!anim || anim.t >= 1) return;
    let raf = 0;
    const t0 = performance.now() - anim.t * 650;
    const loop = (now: number) => {
      const t = Math.min(1, (now - t0) / 650);
      setAnim((a) => (a ? { ...a, t } : a));
      if (t < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim?.step, anim?.dir]);

  const go = (to: number, dir: 'f' | 'b') => {
    setStep(to);
    if (!prefersReducedMotion()) setAnim({ step: to, dir, t: 0 });
  };
  const fwdStep = () => go(Math.min(5, step + 1), 'f');
  const bwdStep = () => go(Math.min(10, Math.max(6, step + 1)), 'b');
  const update = () => {
    const nw = p.w - eta * g.grad.w;
    const nb = p.b - eta * g.grad.b;
    const ng = computeGraph(p.x, nw, nb, p.y);
    setHist((h) => (h.length ? [...h, ng.val.sq] : [g.val.sq, ng.val.sq]).slice(-8));
    setP({ ...p, w: Math.round(nw * 1000) / 1000, b: Math.round(nb * 1000) / 1000 });
    setStep(5);
    setAnim(null);
  };
  const resetAll = () => {
    setP(DEFAULTS);
    setStep(0);
    setHist([]);
    setAnim(null);
  };

  const local: Record<string, string> = {
    'x-mul': `∂u/∂x = w = ${fmt(p.w, 2)}`,
    'w-mul': `∂u/∂w = x = ${fmt(p.x, 2)}`,
    'mul-add': '∂z/∂u = 1',
    'b-add': '∂z/∂b = 1',
    'add-sig': `∂ŷ/∂z = σ(1−σ) = ${fmt(g.sp, 3)}`,
    'sig-sub': '∂d/∂ŷ = 1',
    'y-sub': '∂d/∂y = −1',
    'sub-sq': `∂L/∂d = 2d = ${fmt(2 * g.d, 3)}`,
  };

  const factors: { tex: string; val: string; at: number }[] = [
    { tex: '\\frac{\\partial L}{\\partial d}', val: fmt(2 * g.d, 3), at: 6 },
    { tex: '\\frac{\\partial d}{\\partial \\hat y}', val: '1', at: 7 },
    { tex: '\\frac{\\partial \\hat y}{\\partial z}', val: fmt(g.sp, 3), at: 8 },
    { tex: '\\frac{\\partial z}{\\partial u}', val: '1', at: 9 },
    { tex: '\\frac{\\partial u}{\\partial w}', val: fmt(p.x, 2), at: 10 },
  ];

  const stageText =
    step === 0
      ? '아직 아무것도 계산하지 않았습니다. "순전파 한 단계"를 눌러 보세요.'
      : step < 5
        ? `순전파 ${step}/5단계: 왼쪽에서 오른쪽으로 값을 계산하는 중입니다.`
        : step === 5
          ? `순전파 완료. 손실 L = ${fmt(g.val.sq, 4)}. 이제 "역전파 한 단계"로 기울기를 거꾸로 전달해 보세요.`
          : step < 10
            ? `역전파 ${step - 5}/5단계: 오른쪽에서 왼쪽으로 기울기를 곱해 나가는 중입니다.`
            : `역전파 완료. ∂L/∂w = ${fmt(g.grad.w, 4)}, ∂L/∂b = ${fmt(g.grad.b, 4)}. "가중치 갱신"을 누르면 손실이 줄어듭니다.`;

  return (
    <Figure
      no={1}
      title="계산 그래프 위의 순전파와 역전파"
      hint="버튼으로 한 단계씩 진행하세요"
      caption={
        <>
          파란 숫자는 순전파로 구한 값, 주황 숫자는 역전파로 구한 기울기(∂L/∂·)입니다. 역전파 때 화살표 위에 나타나는 식은 각 연산의 국소 미분입니다. 어떤 노드의 기울기는 바로 오른쪽 노드의 기울기에 그 화살표의 국소 미분을 곱한 값입니다.
        </>
      }
    >
      <div className="bp-scroll-hint">그래프가 화면보다 넓습니다. 옆으로 밀어서 전체를 보세요.</div>
      <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
        <svg viewBox="0 0 1100 310" style={{ width: '100%', minWidth: 660, display: 'block' }} role="img" aria-label="L = (σ(wx+b) − y)² 의 계산 그래프">
          <defs>
            <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--line-strong)" />
            </marker>
          </defs>
          {EDGES.map((e) => {
            const [x1, y1, x2, y2] = edgeEnds(e);
            const key = `${e.from}-${e.to}`;
            const fwdOn = step >= e.fwd;
            const bwdOn = step >= e.bwd;
            const active = anim && anim.t < 1 && ((anim.dir === 'f' && anim.step === e.fwd) || (anim.dir === 'b' && anim.step === e.bwd));
            const t = anim ? anim.t : 0;
            const px = anim?.dir === 'f' ? x1 + (x2 - x1) * t : x2 + (x1 - x2) * t;
            const py = anim?.dir === 'f' ? y1 + (y2 - y1) * t : y2 + (y1 - y2) * t;
            return (
              <g key={key}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={bwdOn ? 'var(--pos)' : fwdOn ? 'var(--accent)' : 'var(--line-strong)'} strokeOpacity={bwdOn || fwdOn ? 0.75 : 1} strokeWidth={2} markerEnd="url(#bp-arrow)" />
                {bwdOn && (
                  <text x={e.lx} y={e.ly} textAnchor={e.anchor} fontSize="13" fontFamily="var(--font-mono)" fill="var(--pos)" fontWeight={600}>
                    {local[key]}
                  </text>
                )}
                {active && <circle cx={px} cy={py} r={7} fill={anim!.dir === 'f' ? 'var(--accent)' : 'var(--pos)'} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            );
          })}
          {NODES.map((n) => {
            const [hw, hh] = boxHalf(n);
            const showV = step >= n.fwd;
            const showG = step >= n.bwd;
            const isW = n.id === 'w' || n.id === 'b';
            return (
              <g key={n.id}>
                <rect x={n.cx - hw} y={n.cy - hh} width={hw * 2} height={hh * 2} rx={n.leaf ? 31 : 10} fill="var(--surface)" stroke={isW ? 'var(--c-dl)' : n.id === 'sq' ? 'var(--ink-2)' : 'var(--line-strong)'} strokeWidth={isW || n.id === 'sq' ? 2 : 1.3} />
                {n.leaf ? (
                  <>
                    <text x={n.cx} y={n.cy - 13} textAnchor="middle" fontSize="12" fill="var(--ink-3)" fontFamily="var(--font-body)">
                      {n.title}
                    </text>
                    <text x={n.cx} y={n.cy + 5} textAnchor="middle" fontSize="14" fontWeight={600} fill="var(--accent)" fontFamily="var(--font-mono)">
                      {n.v} = {fmt(g.val[n.id], 2)}
                    </text>
                    <text x={n.cx} y={n.cy + 22} textAnchor="middle" fontSize="12" fill={showG ? 'var(--pos)' : 'var(--ink-3)'} fontFamily="var(--font-mono)" fontWeight={showG ? 600 : 400}>
                      {showG ? `∂L/∂${n.v}=${fmt(g.grad[n.id], 3)}` : `∂L/∂${n.v}=?`}
                    </text>
                  </>
                ) : (
                  <>
                    <text x={n.cx} y={n.cy - 20} textAnchor="middle" fontSize="13" fill="var(--ink-2)" fontFamily="var(--font-body)">
                      <tspan fontFamily="var(--font-mono)" fontWeight={700} fill="var(--ink)">
                        {n.sym}
                      </tspan>{' '}
                      {n.title}
                    </text>
                    <text x={n.cx} y={n.cy + 3} textAnchor="middle" fontSize="15" fontWeight={600} fill={showV ? 'var(--accent)' : 'var(--ink-3)'} fontFamily="var(--font-mono)">
                      {n.v} = {showV ? fmt(g.val[n.id], 3) : '?'}
                    </text>
                    <text x={n.cx} y={n.cy + 24} textAnchor="middle" fontSize="12" fill={showG ? 'var(--pos)' : 'var(--ink-3)'} fontFamily="var(--font-mono)" fontWeight={showG ? 600 : 400}>
                      {showG ? `∂L/∂${n.v}=${fmt(g.grad[n.id], 3)}` : `∂L/∂${n.v}=?`}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.6em' }}>{stageText}</div>

      <div className="btn-row">
        <Button onClick={fwdStep} disabled={step >= 5} primary={step < 5}>
          순전파 한 단계 →
        </Button>
        <Button onClick={bwdStep} disabled={step < 5 || step >= 10} primary={step >= 5 && step < 10}>
          ← 역전파 한 단계
        </Button>
        <Button onClick={update} disabled={step < 10} primary={step >= 10}>
          가중치 갱신
        </Button>
        <Button onClick={() => go(10, 'b')} disabled={step >= 10}>
          끝까지 계산
        </Button>
        <Button onClick={resetAll}>처음부터</Button>
      </div>

      <div className="fig-split" style={{ alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>연쇄 법칙으로 구한 ∂L/∂w</div>
          <div className="bp-chain">
            <span className="bp-term">
              <M>{'\\frac{\\partial L}{\\partial w}'}</M>
            </span>
            <span className="bp-op">=</span>
            {factors.map((f, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="bp-op">·</span>}
                <span className="bp-term" data-on={step >= f.at}>
                  <M>{f.tex}</M>
                  <span className="bp-val">{step >= f.at ? f.val : '?'}</span>
                </span>
              </span>
            ))}
            <span className="bp-op">=</span>
            <span className="bp-term bp-result" data-on={step >= 10}>
              <span className="bp-val" style={{ fontSize: '1.05rem' }}>
                {step >= 10 ? fmt(g.grad.w, 4) : '?'}
              </span>
            </span>
          </div>
          {hist.length > 1 && (
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
              손실의 변화:{' '}
              <span className="mono">
                {hist.map((h, i) => (
                  <span key={i}>
                    {i > 0 && ' → '}
                    <span style={{ color: i === hist.length - 1 ? 'var(--good)' : undefined, fontWeight: i === hist.length - 1 ? 700 : 400 }}>{fmt(h, 4)}</span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
        <div className="controls">
          <Slider id="bp-x" label="입력 x" value={p.x} min={-2} max={2} step={0.1} onChange={(v) => setP((q) => ({ ...q, x: v }))} format={(v) => fmt(v, 1)} />
          <Slider id="bp-w" label="가중치 w" value={p.w} min={-3} max={3} step={0.01} onChange={(v) => setP((q) => ({ ...q, w: v }))} format={(v) => fmt(v, 2)} color="var(--c-dl)" />
          <Slider id="bp-b" label="편향 b" value={p.b} min={-3} max={3} step={0.01} onChange={(v) => setP((q) => ({ ...q, b: v }))} format={(v) => fmt(v, 2)} color="var(--c-dl)" />
          <Seg label="정답 y" value={p.y} options={[{ value: 0, label: '0' }, { value: 1, label: '1' }]} onChange={(v) => setP((q) => ({ ...q, y: v }))} />
          <Slider id="bp-eta" label="학습률 η" value={eta} min={0.1} max={5} step={0.1} onChange={setEta} format={(v) => fmt(v, 1)} />
        </div>
      </div>
    </Figure>
  );
}

/* ═══════════════════ Figure 2: blame in a 2-2-1 network ═══════════════════ */

interface Net221 {
  W1: number[][]; // [hidden][input]
  b1: number[];
  W2: number[];
  b2: number;
}
const NET0: Net221 = { W1: [[1.2, -0.8], [-0.6, 1.1]], b1: [0.1, -0.2], W2: [0.9, -1.3], b2: 0.2 };

function run221(n: Net221, x: number[], y: number) {
  const z1 = n.W1.map((row, j) => row[0] * x[0] + row[1] * x[1] + n.b1[j]);
  const h = z1.map(sigmoid);
  const z2 = n.W2[0] * h[0] + n.W2[1] * h[1] + n.b2;
  const yh = sigmoid(z2);
  const L = (yh - y) ** 2;
  const d2 = 2 * (yh - y) * yh * (1 - yh);
  const d1 = h.map((hj, j) => n.W2[j] * d2 * hj * (1 - hj));
  const gW2 = h.map((hj) => d2 * hj);
  const gW1 = d1.map((dj) => x.map((xi) => dj * xi));
  return { h, yh, L, d2, d1, gW2, gW1, gb1: d1, gb2: d2 };
}

function BlameFigure() {
  const [net, setNet] = useState<Net221>(NET0);
  const [x, setX] = useState([1, 0.5]);
  const [y, setY] = useState(1);
  const [view, setView] = useState<'w' | 'g'>('g');
  const [hist, setHist] = useState<number[]>([]);
  const r = run221(net, x, y);
  const eta = 2;

  const train = (k: number) => {
    let n = net;
    const hs: number[] = [];
    for (let i = 0; i < k; i++) {
      const o = run221(n, x, y);
      hs.push(o.L);
      n = {
        W1: n.W1.map((row, j) => row.map((w, i2) => w - eta * o.gW1[j][i2])),
        b1: n.b1.map((b, j) => b - eta * o.gb1[j]),
        W2: n.W2.map((w, j) => w - eta * o.gW2[j]),
        b2: n.b2 - eta * o.gb2,
      };
    }
    setHist((h) => [...h, ...hs].slice(-60));
    setNet(n);
  };

  // layout (viewBox 560 × 300)
  const IN = [
    [44, 90],
    [44, 210],
  ];
  const HID = [
    [232, 90],
    [232, 210],
  ];
  const OUT = [422, 150];
  const gmax = Math.max(1e-6, ...r.gW1.flat().map(Math.abs), ...r.gW2.map(Math.abs));
  const wmax = Math.max(1e-6, ...net.W1.flat().map(Math.abs), ...net.W2.map(Math.abs));
  const edge = (x1: number, y1: number, x2: number, y2: number, w: number, gr: number, key: string, labelT = 0.5) => {
    const mag = view === 'g' ? Math.abs(gr) / gmax : Math.abs(w) / wmax;
    const col = view === 'g' ? 'var(--pos)' : w >= 0 ? 'var(--accent)' : 'var(--bad)';
    const lx = x1 + (x2 - x1) * labelT;
    const ly = y1 + (y2 - y1) * labelT;
    return (
      <g key={key}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeOpacity={0.25 + 0.65 * mag} strokeWidth={1 + 9 * mag} strokeLinecap="round" />
        <rect x={lx - 31} y={ly - 11} width={62} height={22} rx={5} fill="var(--surface)" stroke="var(--line)" />
        <text x={lx} y={ly + 5} textAnchor="middle" fontSize="13.5" fontFamily="var(--font-mono)" fill={view === 'g' ? 'var(--pos)' : 'var(--ink)'} fontWeight={600}>
          {fmt(view === 'g' ? gr : w, view === 'g' ? 3 : 2)}
        </text>
      </g>
    );
  };
  const nodeC = (cx: number, cy: number, label: string, val: number, delta: number | null, key: string) => (
    <g key={key}>
      <circle cx={cx} cy={cy} r={30} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth={1.5} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="13" fill="var(--ink-3)" fontFamily="var(--font-body)">
        {label}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="15" fontWeight={600} fill="var(--accent)" fontFamily="var(--font-mono)">
        {fmt(val, 2)}
      </text>
      {delta !== null && (
        <text x={cx} y={cy + 50} textAnchor="middle" fontSize="13" fill="var(--pos)" fontFamily="var(--font-mono)">
          δ = {fmt(delta, 3)}
        </text>
      )}
    </g>
  );

  return (
    <Figure
      no={2}
      title="가중치마다 다른 책임"
      hint="‘기울기 보기’에서 선의 굵기 = |∂L/∂w|"
      caption={
        <>
          입력 2개, 은닉 뉴런 2개, 출력 1개인 작은 신경망입니다(활성화는 모두 시그모이드, 손실은 제곱오차). δ는 각 뉴런에 도착한 오차 신호입니다. 어떤 가중치의 기울기는 그 가중치가 출발하는 쪽의 값과 도착하는 쪽의 δ를 곱한 것입니다. 그래서 입력이 0인 선의 기울기는 0이 되어, 그 가중치는 이번 예제에 대해 아무 책임이 없습니다. 입력 x₂를 0으로 바꿔 확인해 보세요.
        </>
      }
    >
      <div className="fig-split">
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox="0 0 472 300" style={{ width: '100%', minWidth: 340, display: 'block' }} role="img" aria-label="2-2-1 신경망의 가중치별 기울기">
            {HID.map((hp, j) => IN.map((ip, i) => edge(ip[0] + 30, ip[1], hp[0] - 30, hp[1], net.W1[j][i], r.gW1[j][i], `e1${j}${i}`, i === j ? 0.5 : 0.3)))}
            {HID.map((hp, j) => edge(hp[0] + 30, hp[1], OUT[0] - 30, OUT[1], net.W2[j], r.gW2[j], `e2${j}`))}
            {IN.map((ip, i) => nodeC(ip[0], ip[1], `x${i === 0 ? '₁' : '₂'}`, x[i], null, `in${i}`))}
            {HID.map((hp, j) => nodeC(hp[0], hp[1], `h${j === 0 ? '₁' : '₂'}`, r.h[j], r.d1[j], `h${j}`))}
            {nodeC(OUT[0], OUT[1], 'ŷ', r.yh, r.d2, 'out')}
          </svg>
        </div>
        <div className="controls">
          <Seg
            value={view}
            options={[
              { value: 'g', label: '기울기 보기' },
              { value: 'w', label: '가중치 보기' },
            ]}
            onChange={setView}
          />
          <Slider id="bl-x1" label="입력 x₁" value={x[0]} min={-2} max={2} step={0.1} onChange={(v) => setX([v, x[1]])} format={(v) => fmt(v, 1)} />
          <Slider id="bl-x2" label="입력 x₂" value={x[1]} min={-2} max={2} step={0.1} onChange={(v) => setX([x[0], v])} format={(v) => fmt(v, 1)} />
          <Seg label="정답 y" value={y} options={[{ value: 0, label: '0' }, { value: 1, label: '1' }]} onChange={setY} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="예측 ŷ" value={fmt(r.yh, 3)} />
            <Readout label="손실 L" value={fmt(r.L, 4)} color="var(--pos)" />
          </div>
          <div className="btn-row">
            <Button primary onClick={() => train(1)}>
              학습 한 걸음
            </Button>
            <Button onClick={() => train(10)}>10걸음</Button>
            <Button
              onClick={() => {
                setNet(NET0);
                setHist([]);
              }}
            >
              되돌리기
            </Button>
          </div>
          {hist.length > 0 && <MiniLoss values={hist} />}
        </div>
      </div>
    </Figure>
  );
}

function MiniLoss({ values }: { values: number[] }) {
  const P = usePalette();
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      ctx.fillStyle = P.surface2;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, 6);
      ctx.fill();
      const max = Math.max(...values, 1e-6);
      ctx.strokeStyle = P.pos;
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((v, i) => {
        const X = 8 + ((w - 16) * i) / Math.max(1, values.length - 1);
        const Y = h - 8 - ((h - 22) * v) / max;
        if (i) ctx.lineTo(X, Y);
        else ctx.moveTo(X, Y);
      });
      ctx.stroke();
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontBody}`;
      ctx.textBaseline = 'top';
      ctx.fillText(`손실 ${fmt(values[0], 3)} → ${fmt(values[values.length - 1], 4)}`, 8, 4);
    },
    [P, values],
    { height: 56, minHeight: 40 },
  );
  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}

/* ═══════════════════ Figure 3: vanishing / exploding gradients ═══════════════════ */

type VAct = 'sigmoid' | 'tanh' | 'relu';
function chainGrads(depth: number, act: VAct, scale: number): number[] {
  const r = rng(5);
  const ws = Array.from({ length: depth }, () => scale * (0.85 + 0.3 * r()));
  const f = (z: number) => (act === 'sigmoid' ? sigmoid(z) : act === 'tanh' ? Math.tanh(z) : Math.max(0, z));
  const fp = (z: number) => {
    if (act === 'sigmoid') {
      const s = sigmoid(z);
      return s * (1 - s);
    }
    if (act === 'tanh') return 1 - Math.tanh(z) ** 2;
    return z > 0 ? 1 : 0;
  };
  const hs = [1];
  const zs: number[] = [];
  for (let l = 0; l < depth; l++) {
    const z = ws[l] * hs[l] + 0.1;
    zs.push(z);
    hs.push(f(z));
  }
  // L = h_N, dL/dh_N = 1
  const grads = new Array(depth).fill(0);
  let delta = fp(zs[depth - 1]);
  for (let l = depth - 1; l >= 0; l--) {
    grads[l] = delta * hs[l];
    if (l > 0) delta = delta * ws[l] * fp(zs[l - 1]);
  }
  return grads;
}

function VanishFigure() {
  const P = usePalette();
  const [depth, setDepth] = useState(10);
  const [act, setAct] = useState<VAct>('sigmoid');
  const [scale, setScale] = useState(1);
  const grads = useMemo(() => chainGrads(depth, act, scale), [depth, act, scale]);
  const ratio = Math.abs(grads[0]) / Math.max(1e-300, Math.abs(grads[depth - 1]));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 52;
      const padB = 42;
      const padT = 14;
      const padR = 10;
      const logs = grads.map((g) => Math.log10(Math.max(1e-30, Math.abs(g))));
      let lo = Math.min(-3, Math.floor(Math.min(...logs)));
      let hi = Math.max(1, Math.ceil(Math.max(...logs)));
      lo = Math.max(lo, -30);
      if (hi - lo < 4) lo = hi - 4;
      const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
      const pw = w - padL - padR;
      const bw = pw / depth;
      // grid
      const stepD = Math.max(1, Math.ceil((hi - lo) / 6));
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const sup = (n: number) => String(n).replace('-', '⁻').replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
      for (let v = Math.floor(hi / stepD) * stepD; v >= lo; v -= stepD) {
        ctx.strokeStyle = v === 0 ? P.lineStrong : P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, Math.round(Y(v)) + 0.5);
        ctx.lineTo(w - padR, Math.round(Y(v)) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.fillText(v === 0 ? '1' : `10${sup(v)}`, padL - 6, Y(v));
      }
      // bars from the bottom
      for (let l = 0; l < depth; l++) {
        const v = logs[l];
        const x = padL + l * bw + bw * 0.15;
        const y0 = Y(lo);
        const y1 = Y(v);
        const col = v < -4 ? P.neg : v > 1 ? P.bad : P.good;
        ctx.fillStyle = alpha(col, 0.85);
        ctx.beginPath();
        ctx.roundRect(x, Math.min(y0, y1), bw * 0.7, Math.abs(y0 - y1), [3, 3, 0, 0]);
        ctx.fill();
        if (depth <= 20 && (depth <= 12 || l % 2 === 0)) {
          ctx.fillStyle = P.ink3;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(String(l + 1), x + bw * 0.35, h - padB + 6);
        }
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('층 번호 (1 = 입력 쪽)', padL + pw / 2, h - 4);
    },
    [P, grads, depth],
    { aspect: 2, maxHeight: 320, minHeight: 220 },
  );

  return (
    <Figure
      no={3}
      title="깊어질수록 사라지는 기울기"
      hint="층 수와 활성화 함수를 바꿔 보세요"
      caption={
        <>
          뉴런 하나짜리 층을 일렬로 쌓은 신경망에서 각 층 가중치의 기울기 크기를 로그 눈금으로 그렸습니다. 막대 하나가 한 칸 내려갈 때마다 기울기는 10분의 1이 됩니다. 시그모이드의 미분은 최대 0.25라서 층을 지날 때마다 기울기가 4분의 1 이하로 줄어듭니다. 입력 쪽 층은 거의 배우지 못하게 되는 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="활성화 함수"
            value={act}
            options={[
              { value: 'sigmoid', label: '시그모이드' },
              { value: 'tanh', label: 'tanh' },
              { value: 'relu', label: 'ReLU' },
            ]}
            onChange={setAct}
          />
          <Slider id="vg-depth" label="층 수" value={depth} min={2} max={20} step={1} onChange={setDepth} />
          <Slider id="vg-scale" label="가중치 크기" value={scale} min={0.5} max={2} step={0.05} onChange={setScale} format={(v) => fmt(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="마지막 층 기울기" value={Math.abs(grads[depth - 1]).toExponential(1)} />
            <Readout label="첫 층 기울기" value={Math.abs(grads[0]).toExponential(1)} color={ratio < 1e-3 ? 'var(--neg)' : ratio > 1e2 ? 'var(--bad)' : 'var(--good)'} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            첫 층 / 마지막 층 ={' '}
            <strong className="mono">{ratio >= 0.01 && ratio < 1000 ? fmt(ratio, 2) : ratio.toExponential(1)}</strong>
            {ratio < 1e-3 ? ' → 기울기 소실' : ratio > 1e2 ? ' → 기울기 폭발' : ' → 비교적 건강함'}
          </div>
          <Legend
            items={[
              { color: 'var(--good)', label: '적당함', shape: 'sq' },
              { color: 'var(--neg)', label: '소실 (10⁻⁴ 미만)', shape: 'sq' },
              { color: 'var(--bad)', label: '폭발 (10 초과)', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ═══════════════════ Lesson ═══════════════════ */

const CSS = `
.bp-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 12px; border-radius: 8px; background: var(--surface-2); }
.bp-term { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 8px; border-radius: 6px; background: var(--surface); border: 1px solid var(--line); opacity: 0.55; transition: opacity .2s, border-color .2s; }
.bp-term[data-on='true'] { opacity: 1; border-color: var(--pos); }
.bp-term:first-child { opacity: 1; }
.bp-op { color: var(--ink-3); font-family: var(--font-mono); }
.bp-val { font-family: var(--font-mono); font-size: .8rem; font-weight: 600; color: var(--pos); font-variant-numeric: tabular-nums; }
.bp-scroll-hint { display: none; font-size: var(--fs-xs); color: var(--ink-3); }
@media (max-width: 720px) { .bp-scroll-hint { display: block; } }
.bp-result[data-on='true'] { background: color-mix(in srgb, var(--pos) 12%, var(--surface)); }
`;

export default function Backprop() {
  return (
    <>
      <style>{CSS}</style>
      <h2>수백만 개의 가중치, 누구 탓인가</h2>
      <p>
        신경망이 고양이 사진을 보고 "개"라고 답했다고 해 봅시다. 손실이 큽니다. 이제 가중치를 고쳐야 하는데, 신경망에는 가중치가 수백만에서 수천억 개 있습니다. 각 가중치에 대해 알고 싶은 것은 단 하나, "이 가중치를 조금 키우면 손실이 늘어나는가 줄어드는가, 얼마나?"입니다. 바로 편미분 <M>{'\\partial L / \\partial w'}</M>입니다.
      </p>
      <p>
        가장 단순한 방법은 가중치를 하나씩 살짝 바꿔 보고 손실을 다시 계산하는 것입니다. 하지만 가중치가 100만 개면 신경망을 100만 번 돌려야 한 걸음을 갈 수 있습니다. <T en="backpropagation">역전파</T>는 순전파 한 번과 그와 비슷한 비용의 역방향 계산 한 번으로 모든 가중치의 기울기를 한꺼번에 구합니다. 1986년 럼멜하트, 힌턴, 윌리엄스의 논문으로 널리 알려진 이 방법 덕분에 깊은 신경망의 학습이 현실이 되었습니다.
      </p>

      <h2>계산을 작은 조각으로 나누기</h2>
      <p>
        비결은 복잡한 계산을 곱하기, 더하기 같은 아주 작은 연산들의 연결로 보는 것입니다. 이 연결도를 <T en="computational graph">계산 그래프</T>라고 합니다. 아래 예는 뉴런 하나의 예측 <M>{'\\hat y = \\sigma(wx+b)'}</M>와 정답 <M>{'y'}</M>의 제곱오차를 계산합니다.
      </p>
      <MB>{'L = \\big(\\sigma(w x + b) - y\\big)^2'}</MB>
      <p>
        각 연산은 자기 입력에 대한 미분, 즉 <T en="local gradient">국소 미분</T>만 알면 됩니다. 곱셈 <M>{'u = wx'}</M>는 <M>{'\\partial u/\\partial w = x'}</M>라는 것만, 덧셈은 미분이 1이라는 것만 알면 충분합니다. 먼저 순전파로 왼쪽에서 오른쪽으로 값을 채운 뒤, 역전파로 오른쪽 끝의 <M>{'\\partial L/\\partial L = 1'}</M>에서 출발해 국소 미분을 하나씩 곱하며 왼쪽으로 돌아옵니다.
      </p>
      <GraphFigure />
      <p>그림에서 본 계산을 식으로 쓰면 미분의 장에서 배운 연쇄 법칙 그대로입니다.</p>
      <MB note="오른쪽 끝(손실)에서 시작해 w까지 가는 길 위의 국소 미분을 모두 곱합니다.">{'\\frac{\\partial L}{\\partial w} = \\frac{\\partial L}{\\partial d}\\cdot\\frac{\\partial d}{\\partial \\hat y}\\cdot\\frac{\\partial \\hat y}{\\partial z}\\cdot\\frac{\\partial z}{\\partial u}\\cdot\\frac{\\partial u}{\\partial w} = 2(\\hat y - y)\\cdot 1\\cdot \\hat y(1-\\hat y)\\cdot 1\\cdot x'}</MB>
      <Callout kind="intuition">
        역전파의 효율은 중간 결과의 재사용에서 나옵니다. <M>{'\\partial L/\\partial z'}</M>를 한 번 구해 두면 <M>{'\\partial L/\\partial w'}</M>와 <M>{'\\partial L/\\partial b'}</M>가 둘 다 이 값에서 한 번의 곱셈으로 나옵니다. 뒤에서부터 계산하면 같은 경로를 두 번 계산할 일이 없습니다.
      </Callout>
      <p>
        기울기를 구했으면 가중치를 기울기의 반대 방향으로 조금 옮깁니다. 앞에서 본 경사하강법 그대로입니다. 그림 1에서 "가중치 갱신"을 여러 번 반복하면 손실이 점점 0에 가까워지는 것을 볼 수 있습니다.
      </p>
      <MB note="η(에타)는 학습률입니다.">{'w \\leftarrow w - \\eta\\,\\frac{\\partial L}{\\partial w}, \\qquad b \\leftarrow b - \\eta\\,\\frac{\\partial L}{\\partial b}'}</MB>

      <h2>신경망 전체로 넓히기</h2>
      <p>
        뉴런이 여러 개여도 원리는 같습니다. 각 뉴런에 도착하는 오차 신호를 <M>{'\\delta'}</M>라고 부르면, 한 층의 <M>{'\\delta'}</M>는 다음 층의 <M>{'\\delta'}</M>들을 연결 가중치로 가중합한 뒤 자기 활성화 함수의 미분을 곱한 값입니다. 그리고 가중치 하나의 기울기는 "보내는 쪽의 값 × 받는 쪽의 <M>{'\\delta'}</M>"입니다.
      </p>
      <MB note="j는 앞 층 뉴런, k는 뒤 층 뉴런입니다.">{'\\delta_j = \\sigma\'(z_j)\\sum_k w_{jk}\\,\\delta_k, \\qquad \\frac{\\partial L}{\\partial w_{jk}} = h_j\\,\\delta_k'}</MB>
      <BlameFigure />

      <h2>기울기 소실 문제</h2>
      <p>
        연쇄 법칙은 미분을 계속 곱하는 것이므로, 곱하는 값이 1보다 작으면 층을 지날수록 기울기가 기하급수적으로 작아집니다. 시그모이드 함수의 미분은 아무리 커도 0.25입니다. 층이 10개면 입력 쪽 층의 기울기는 <M>{'0.25^{10} \\approx 10^{-6}'}</M> 수준까지 줄어들 수 있습니다. 이것이 2000년대 초까지 깊은 신경망 학습을 가로막았던 <T en="vanishing gradient">기울기 소실</T>입니다. 반대로 곱하는 값이 1보다 크면 기울기가 폭발합니다.
      </p>
      <VanishFigure />
      <p>
        ReLU는 양수 구간에서 미분이 정확히 1이라 이 문제를 크게 줄입니다. 오늘날의 깊은 신경망은 여기에 더해 가중치 초기화를 신중하게 하고, 층 출력의 크기를 맞추는 정규화(normalization)를 넣고, 입력을 몇 층 건너뛰어 더해 주는 <T en="residual connection">잔차 연결</T>을 써서 기울기가 수백 층을 지나도 살아남게 만듭니다. 트랜스포머도 이 기법들을 모두 씁니다.
      </p>
      <Callout kind="key">
        역전파는 새로운 수학이 아닙니다. 계산 그래프 위에서 연쇄 법칙을 뒤에서부터 적용하며 중간 결과를 재사용하는 계산 순서입니다. PyTorch나 TensorFlow 같은 프레임워크는 여러분이 쓴 순전파 코드로 계산 그래프를 자동으로 만들고, <code>loss.backward()</code> 한 줄로 이 과정을 대신 해 줍니다.
      </Callout>
      <Quiz
        q="곱셈 노드 u = w·x에서 역전파로 ∂L/∂u = 0.5가 도착했습니다. x = 3, w = −2일 때 ∂L/∂w는?"
        options={['0.5', '1.5', '−1.0', '6']}
        answer={1}
        explain={<>곱셈 노드의 국소 미분은 ∂u/∂w = x입니다. 따라서 ∂L/∂w = ∂L/∂u × x = 0.5 × 3 = 1.5입니다. 곱셈 노드는 기울기를 보낼 때 상대편 입력 값을 곱해 주는 셈입니다(∂L/∂x는 0.5 × (−2) = −1.0).</>}
      />
    </>
  );
}
