import { useState } from 'react';
import { Button, Callout, Check, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../components/ui';
import { useCanvas2D } from '../lib/canvas';
import { Plot, fmt } from '../lib/plot';
import { alpha, parseColor, usePalette } from '../lib/theme';
import { relu, sigmoid } from '../lib/math';

type ActId = 'step' | 'sigmoid' | 'tanh' | 'relu';
const ACTS: Record<ActId, { name: string; f: (z: number) => number; df: (z: number) => number; range: [number, number]; tex: string }> = {
  step: { name: '계단', f: (z) => (z >= 0 ? 1 : 0), df: () => 0, range: [-0.2, 1.2], tex: 'f(z)=\\begin{cases}1 & z\\ge 0\\\\ 0 & z<0\\end{cases}' },
  sigmoid: { name: '시그모이드', f: sigmoid, df: (z) => sigmoid(z) * (1 - sigmoid(z)), range: [-0.2, 1.2], tex: 'f(z)=\\dfrac{1}{1+e^{-z}}' },
  tanh: { name: 'tanh', f: Math.tanh, df: (z) => 1 - Math.tanh(z) ** 2, range: [-1.2, 1.2], tex: 'f(z)=\\tanh z' },
  relu: { name: 'ReLU', f: relu, df: (z) => (z > 0 ? 1 : 0), range: [-0.5, 3.2], tex: 'f(z)=\\max(0,z)' },
};

/* ─────────────── Figure 1: anatomy of a neuron ─────────────── */

const INPUTS = ['좋아하는 배우가 나온다', '평점이 높다', '상영 시간이 길다'];

function NeuronDiagram() {
  const P = usePalette();
  const [x, setX] = useState([1, 0.8, 0.6]);
  const [w, setW] = useState([1.5, 2, -1.2]);
  const [b, setB] = useState(-1.5);
  const [act, setAct] = useState<ActId>('sigmoid');
  const A = ACTS[act];
  const z = x.reduce((s, xi, i) => s + xi * w[i], 0) + b;
  const out = A.f(z);
  const outNorm = Math.max(0, Math.min(1, act === 'tanh' ? (out + 1) / 2 : act === 'relu' ? out / 3 : out));

  const ys = [60, 140, 220];
  const NX = 330;
  const NY = 140;
  // mini activation plot inside the SVG
  const bx = 432;
  const by = 100;
  const bw = 110;
  const bh = 80;
  const [r0, r1] = A.range;
  const zr = 5;
  const px = (zz: number) => bx + ((zz + zr) / (2 * zr)) * bw;
  const py = (v: number) => by + bh - ((v - r0) / (r1 - r0)) * bh;
  let path = '';
  for (let i = 0; i <= 80; i++) {
    const zz = -zr + (2 * zr * i) / 80;
    const v = Math.max(r0, Math.min(r1, A.f(zz)));
    path += `${i ? 'L' : 'M'}${px(zz).toFixed(1)},${py(v).toFixed(1)}`;
  }
  const zc = Math.max(-zr, Math.min(zr, z));

  return (
    <Figure no={1} title="뉴런 하나 해부하기: 이 영화를 볼까?" hint="입력과 가중치를 바꿔 보세요" caption={<>선의 굵기는 가중치의 크기, 색은 부호입니다(주황 = 양수, 파랑 = 음수). 상영 시간이 길다는 입력은 음수 가중치라서 값이 클수록 "보러 간다"는 쪽에서 멀어집니다. 활성화 함수를 바꾸면 같은 가중합 z가 다른 출력으로 바뀝니다.</>}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox="0 0 640 280" style={{ width: '100%', minWidth: 540, display: 'block' }} role="img" aria-label="입력 세 개, 가중합, 활성화 함수, 출력으로 이어지는 뉴런 그림">
          {ys.map((y, i) => {
            const wi = w[i];
            const col = wi >= 0 ? P.pos : P.neg;
            const mx = (110 + NX) / 2;
            const my = (y + NY) / 2;
            return (
              <g key={i}>
                <line x1={110} y1={y} x2={NX - 46} y2={NY + (y - NY) * 0.12} stroke={col} strokeWidth={1 + Math.abs(wi) * 2.6} strokeOpacity={0.25 + Math.min(0.75, Math.abs(wi) / 3)} strokeLinecap="round" />
                <rect x={mx - 30} y={my - 12} width={60} height={22} rx={6} fill={P.surface} stroke={col} strokeWidth={1} />
                <text x={mx} y={my + 4} textAnchor="middle" fontFamily={P.fontMono} fontSize={12} fill={col} fontWeight={600}>
                  w{i + 1}={fmt(wi, 1)}
                </text>
                <circle cx={88} cy={y} r={22} fill={alpha(P.accent, 0.08 + 0.5 * x[i])} stroke={P.lineStrong} strokeWidth={1.5} />
                <text x={88} y={y + 5} textAnchor="middle" fontFamily={P.fontMono} fontSize={13} fill={P.ink} fontWeight={600}>
                  {fmt(x[i], 1)}
                </text>
                <text x={88} y={y - 29} textAnchor="middle" fontFamily={P.fontBody} fontSize={11.5} fill={P.ink2}>
                  x{i + 1} {INPUTS[i]}
                </text>
              </g>
            );
          })}
          {/* bias */}
          <line x1={NX} y1={250} x2={NX} y2={NY + 46} stroke={P.ink3} strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={NX} y={266} textAnchor="middle" fontFamily={P.fontMono} fontSize={12} fill={P.ink2}>
            편향 b={fmt(b, 1)}
          </text>
          {/* summation node */}
          <circle cx={NX} cy={NY} r={46} fill={P.surface} stroke={P.ink} strokeWidth={2} />
          <text x={NX} y={NY - 6} textAnchor="middle" fontFamily={P.fontBody} fontSize={22} fill={P.ink} fontWeight={700}>
            Σ
          </text>
          <text x={NX} y={NY + 18} textAnchor="middle" fontFamily={P.fontMono} fontSize={13} fill={P.ink}>
            z={fmt(z, 2)}
          </text>
          <line x1={NX + 46} y1={NY} x2={bx - 8} y2={NY} stroke={P.ink3} strokeWidth={2} markerEnd="url(#nArrow)" />
          {/* activation box */}
          <rect x={bx - 8} y={by - 22} width={bw + 16} height={bh + 34} rx={10} fill={P.surface2} stroke={P.line} />
          <text x={bx + bw / 2} y={by - 7} textAnchor="middle" fontFamily={P.fontBody} fontSize={11.5} fill={P.ink2}>
            활성화: {A.name}
          </text>
          <line x1={bx} y1={py(0)} x2={bx + bw} y2={py(0)} stroke={P.lineStrong} strokeWidth={1} />
          <line x1={px(0)} y1={by} x2={px(0)} y2={by + bh} stroke={P.lineStrong} strokeWidth={1} />
          <path d={path} fill="none" stroke={P.dl} strokeWidth={2.5} />
          <circle cx={px(zc)} cy={py(Math.max(r0, Math.min(r1, A.f(zc))))} r={5} fill={P.hl} stroke={P.ink} strokeWidth={1.5} />
          <line x1={bx + bw + 8} y1={NY} x2={572} y2={NY} stroke={P.ink3} strokeWidth={2} markerEnd="url(#nArrow)" />
          {/* output */}
          <circle cx={600} cy={NY} r={26} fill={alpha(P.dl, 0.12 + 0.7 * outNorm)} stroke={P.dl} strokeWidth={2} />
          <text x={600} y={NY + 5} textAnchor="middle" fontFamily={P.fontMono} fontSize={13} fill={P.ink} fontWeight={700}>
            {fmt(out, 2)}
          </text>
          <text x={600} y={NY + 46} textAnchor="middle" fontFamily={P.fontBody} fontSize={11.5} fill={P.ink2}>
            출력
          </text>
          <defs>
            <marker id="nArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill={P.ink3} />
            </marker>
          </defs>
        </svg>
      </div>
      <Seg label="활성화 함수" value={act} onChange={setAct} options={(Object.keys(ACTS) as ActId[]).map((k) => ({ value: k, label: ACTS[k].name }))} />
      <div className="fig-cols">
        <div className="controls">
          {INPUTS.map((_n, i) => (
            <Slider key={i} id={`nr-x${i}`} label={`입력 x${i + 1}`} value={x[i]} min={0} max={1} step={0.05} onChange={(v) => setX((s) => s.map((q, j) => (j === i ? v : q)))} format={(v) => fmt(v, 2)} />
          ))}
        </div>
        <div className="controls">
          {INPUTS.map((_n, i) => (
            <Slider key={i} id={`nr-w${i}`} label={`가중치 w${i + 1}`} value={w[i]} min={-3} max={3} step={0.1} onChange={(v) => setW((s) => s.map((q, j) => (j === i ? v : q)))} format={(v) => fmt(v, 1)} color={w[i] >= 0 ? 'var(--pos)' : 'var(--neg)'} />
          ))}
          <Slider id="nr-b" label="편향 b" value={b} min={-3} max={3} step={0.1} onChange={setB} format={(v) => fmt(v, 1)} />
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.9, overflowX: 'auto' }}>
        z = {w.map((wi, i) => `${fmt(wi, 1)}×${fmt(x[i], 2)}`).join(' + ')} + ({fmt(b, 1)}) = <strong style={{ color: 'var(--ink)' }}>{fmt(z, 2)}</strong>
        <br />
        출력 = {A.name}({fmt(z, 2)}) = <strong style={{ color: 'var(--c-dl)' }}>{fmt(out, 3)}</strong>
        {act !== 'tanh' && act !== 'relu' && <span> → {out >= 0.5 ? '보러 간다' : '집에 있는다'}</span>}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: activation functions ─────────────── */

function ActPlot({ id, showD }: { id: ActId; showD: boolean }) {
  const P = usePalette();
  const A = ACTS[id];
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -4, xMax: 4, yMin: Math.min(A.range[0], -0.3), yMax: Math.max(A.range[1], 1.2), pad: { l: 30, r: 8, t: 10, b: 22 } });
      plot.grid({ xStep: 2, yStep: id === 'relu' ? 1 : 0.5 });
      if (showD) plot.fn(A.df, P.hl, 2, { dash: [5, 4] });
      if (id === 'step') {
        plot.line(-4, 0, 0, 0, P.dl, 3);
        plot.line(0, 1, 4, 1, P.dl, 3);
        plot.dot(0, 1, 4, P.dl);
        plot.dot(0, 0, 4, P.surface, P.dl, 2);
      } else plot.fn(A.f, P.dl, 3);
    },
    [P, id, showD],
    { aspect: 1.45, maxHeight: 200, minHeight: 150 },
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--fs-sm)' }}>{A.name}</strong>
        <span style={{ fontSize: '0.8rem' }}>
          <M>{A.tex}</M>
        </span>
      </div>
      <div ref={wrapRef} className="canvas-box">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

function ActivationsFigure() {
  const [showD, setShowD] = useState(false);
  return (
    <Figure no={2} title="네 가지 활성화 함수" caption={<>노란 점선은 각 함수의 기울기(도함수)입니다. 계단 함수는 거의 모든 곳에서 기울기가 0이라 경사하강법으로 학습할 수 없습니다. 시그모이드와 tanh는 양 끝에서 기울기가 0에 가까워지고, ReLU는 양수 쪽에서 기울기가 항상 1이라 깊은 신경망에서도 학습 신호가 잘 전달됩니다.</>}>
      <div className="fig-cols" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {(Object.keys(ACTS) as ActId[]).map((k) => (
          <ActPlot key={k} id={k} showD={showD} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Check label="기울기(도함수) 함께 보기" checked={showD} onChange={setShowD} />
        <Legend
          items={[
            { color: 'var(--c-dl)', label: '활성화 함수 f(z)', shape: 'ln' },
            { color: 'var(--hl)', label: "기울기 f'(z)", shape: 'ln' },
          ]}
        />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: one neuron vs logic gates ─────────────── */

type Gate = 'AND' | 'OR' | 'XOR';
const CORNERS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];
const TRUTH: Record<Gate, number[]> = { AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], XOR: [0, 1, 1, 0] };
const SOLUTION: Record<Gate, [number, number, number]> = { AND: [1, 1, -1.5], OR: [1, 1, -0.5], XOR: [1, 1, -0.5] };

function GateFigure() {
  const P = usePalette();
  const [gate, setGate] = useState<Gate>('AND');
  const [wv, setWv] = useState<[number, number, number]>([1, -0.6, 0.2]);
  const [w1, w2, b] = wv;
  const [msg, setMsg] = useState('');
  const correct = CORNERS.filter(([a, c], i) => (w1 * a + w2 * c + b >= 0 ? 1 : 0) === TRUTH[gate][i]).length;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: -0.5, xMax: 1.5, yMin: -0.5, yMax: 1.5, equal: true, pad: { l: 30, r: 10, t: 10, b: 24 } });
      const pc = parseColor(P.pos);
      const nc = parseColor(P.neg);
      plot.heatmap((x, y) => {
        const p = sigmoid(6 * (w1 * x + w2 * y + b));
        const c = p >= 0.5 ? pc : nc;
        return [c[0], c[1], c[2], Math.round(30 + 90 * Math.abs(p - 0.5) * 2)];
      }, 5);
      plot.grid({ xStep: 0.5, yStep: 0.5, xLabel: 'x₁', yLabel: 'x₂' });
      if (Math.abs(w2) > 1e-6) plot.slopeLine(0, -b / w2, -w1 / w2, P.ink, 2.5);
      else if (Math.abs(w1) > 1e-6) plot.line(-b / w1, -0.5, -b / w1, 1.5, P.ink, 2.5);
      CORNERS.forEach(([a, c], i) => {
        const t = TRUTH[gate][i];
        const ok = (w1 * a + w2 * c + b >= 0 ? 1 : 0) === t;
        plot.dot(a, c, 13, t ? P.pos : P.neg, ok ? P.surface : P.bad, ok ? 2 : 4);
        plot.text(String(t), a, c, P.surface, { align: 'center', font: `700 13px ${P.fontMono}` });
      });
    },
    [P, gate, w1, w2, b],
    { aspect: 1.2, maxHeight: 400, minHeight: 280 },
  );

  const search = () => {
    let bestC = 0;
    let bestW: [number, number, number] = [0, 0, 0];
    for (let a = -3; a <= 3; a += 0.25)
      for (let c = -3; c <= 3; c += 0.25)
        for (let d = -3; d <= 3; d += 0.25) {
          const k = CORNERS.filter(([p, q], i) => (a * p + c * q + d >= 0 ? 1 : 0) === TRUTH[gate][i]).length;
          if (k > bestC) {
            bestC = k;
            bestW = [a, c, d];
          }
        }
    setWv(bestW);
    setMsg(bestC === 4 ? `가중치 약 1만 5천 개 조합을 모두 시험했고, 4개를 모두 맞히는 직선을 찾았습니다.` : `가중치 약 1만 5천 개 조합을 모두 시험했지만 최대 ${bestC}개밖에 못 맞힙니다. 직선 하나로는 XOR을 나눌 수 없습니다.`);
  };

  return (
    <Figure no={3} title="뉴런 하나로 논리 게이트 흉내 내기" hint="게이트를 고르고 직선을 맞춰 보세요" caption={<>네 점은 입력 (x₁, x₂)의 모든 조합이고 숫자는 정답 출력입니다. 뉴런은 w₁x₁ + w₂x₂ + b ≥ 0 이면 1을 냅니다. AND와 OR은 직선 하나로 주황 점과 파랑 점을 나눌 수 있지만, XOR은 대각선으로 마주 보는 점끼리 같은 편이라 어떤 직선으로도 나눌 수 없습니다.</>}>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="논리 게이트"
            value={gate}
            onChange={(g) => {
              setGate(g);
              setMsg('');
            }}
            options={[
              { value: 'AND', label: 'AND' },
              { value: 'OR', label: 'OR' },
              { value: 'XOR', label: 'XOR' },
            ]}
          />
          <Slider id="gt-w1" label="w₁" value={w1} min={-3} max={3} step={0.05} onChange={(v) => setWv([v, w2, b])} format={(v) => fmt(v, 2)} />
          <Slider id="gt-w2" label="w₂" value={w2} min={-3} max={3} step={0.05} onChange={(v) => setWv([w1, v, b])} format={(v) => fmt(v, 2)} />
          <Slider id="gt-b" label="b" value={b} min={-3} max={3} step={0.05} onChange={(v) => setWv([w1, w2, v])} format={(v) => fmt(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="맞힌 점" value={`${correct} / 4`} color={correct === 4 ? 'var(--good)' : 'var(--ink)'} />
          </div>
          <div className="btn-row">
            <Button small primary onClick={search}>
              모든 직선 시험하기
            </Button>
            {gate !== 'XOR' && (
              <Button
                small
                onClick={() => {
                  setWv(SOLUTION[gate]);
                  setMsg('');
                }}
              >
                정답 예시
              </Button>
            )}
          </div>
          {msg && <div style={{ fontSize: 'var(--fs-sm)', color: correct === 4 ? 'var(--good)' : 'var(--bad)' }}>{msg}</div>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Neuron() {
  return (
    <>
      <h2>뇌세포에서 빌려 온 아이디어</h2>
      <p>
        뇌의 신경세포(뉴런)는 여러 갈래의 가지돌기로 이웃 세포의 신호를 받습니다. 받은 신호가 충분히 강하면 세포가 "발화"해서 축삭을 따라 다음 세포로 신호를 보내고, 약하면 조용히 있습니다. 신호를 주고받는 연결부(시냅스)마다 세기가 다르고, 학습은 이 연결 세기가 바뀌는 과정이라고 알려져 있습니다.
      </p>
      <p>
        1943년 매컬러와 피츠는 이 과정을 아주 단순한 수식으로 옮겼고, 1958년 로젠블랫은 이를 학습시킬 수 있는 <T en="perceptron">퍼셉트론</T>으로 발전시켰습니다. 오늘날 신경망의 <T en="artificial neuron">인공 뉴런</T>은 이 모델의 직계 후손입니다. 실제 뇌세포는 훨씬 복잡하므로 이 비유는 출발점 정도로만 생각하면 됩니다.
      </p>

      <h2>뉴런이 하는 일: 곱하고, 더하고, 통과시키기</h2>
      <p>인공 뉴런 하나는 세 단계로 일합니다.</p>
      <ol>
        <li>
          각 입력 <M>{'x_i'}</M>에 그 입력의 중요도인 <T en="weight">가중치</T> <M>{'w_i'}</M>를 곱합니다.
        </li>
        <li>
          모두 더하고 <T en="bias">편향</T> <M>{'b'}</M>를 더해 <M>{'z'}</M>를 얻습니다. 편향은 "얼마나 쉽게 발화하는가"를 정하는 문턱입니다.
        </li>
        <li>
          <M>{'z'}</M>를 <T en="activation function">활성화 함수</T> <M>{'f'}</M>에 통과시켜 출력을 냅니다.
        </li>
      </ol>
      <MB note="벡터 장에서 본 내적 그대로입니다. 뉴런은 입력이 자기가 좋아하는 패턴 w와 얼마나 같은 방향인지 잽니다.">{'y = f\\Big(\\sum_{i=1}^{n} w_i x_i + b\\Big) = f(\\mathbf{w}\\cdot\\mathbf{x} + b)'}</MB>
      <NeuronDiagram />
      <Callout kind="intuition">
        가중치가 양수인 입력은 "보러 가자" 쪽으로, 음수인 입력은 "그만두자" 쪽으로 표를 던집니다. 가중치의 크기는 그 표의 무게입니다. 학습이란 데이터를 보면서 이 무게들을 조정하는 일입니다.
      </Callout>

      <h2>활성화 함수는 왜 필요할까</h2>
      <p>
        활성화 함수가 없으면 뉴런은 그냥 일차식입니다. 문제는 일차식을 아무리 겹쳐도 다시 일차식이 된다는 점입니다. 층을 100개 쌓아도 직선 하나와 다를 바 없게 되죠. 활성화 함수는 이 사슬을 끊는 <T en="nonlinearity">비선형성</T>을 넣어 줍니다. 그래야 층을 쌓을수록 더 복잡한 모양을 표현할 수 있습니다.
      </p>
      <ActivationsFigure />
      <p>
        초기 퍼셉트론은 계단 함수를 썼지만, 기울기가 0이라 경사하강법을 쓸 수 없었습니다. 그 뒤로 매끄러운 시그모이드와 tanh가 쓰였고, 2010년대 이후 깊은 신경망에서는 계산이 간단하고 기울기가 잘 유지되는 <T en="Rectified Linear Unit">ReLU</T>가 기본값이 되었습니다. 최근 언어 모델들은 ReLU를 부드럽게 다듬은 GELU나 SwiGLU 같은 변형을 씁니다.
      </p>

      <h2>뉴런 하나의 한계</h2>
      <p>
        뉴런 하나는 <M>{'\\mathbf{w}\\cdot\\mathbf{x} + b = 0'}</M>이라는 직선(고차원에서는 평면)으로 공간을 둘로 나눌 뿐입니다. 로지스틱 회귀와 똑같죠. 그래서 직선으로 나눌 수 있는 문제만 풀 수 있습니다. 컴퓨터의 기본 논리 게이트로 시험해 보겠습니다.
      </p>
      <GateFigure />
      <p>
        1969년 민스키와 페퍼트는 책 『퍼셉트론』에서 바로 이 XOR 문제를 들어 단층 퍼셉트론의 한계를 증명했습니다. 이 지적은 신경망 연구가 한동안 침체되는 계기가 되었습니다.
      </p>
      <p>
        해결책은 뉴런을 여러 층으로 쌓는 것입니다. 첫 번째 층의 뉴런 둘이 각각 OR과 NAND(AND의 반대)를 계산하고, 두 번째 층의 뉴런이 그 둘을 AND로 합치면 XOR이 됩니다. 직선 두 개를 조합해 띠 모양 영역을 만드는 셈입니다. 이렇게 층을 쌓은 신경망이 어떤 경계까지 그릴 수 있는지는 다음 장 <a href="#neural-network">신경망 놀이터</a>에서 직접 확인해 보세요.
      </p>
      <MB note="은닉층 두 뉴런(h₁ = OR, h₂ = NAND)과 출력 뉴런 하나로 만든 XOR. 계단 함수 기준입니다.">{'\\text{XOR}(x_1,x_2) = \\text{AND}\\big(\\,\\underbrace{\\text{OR}(x_1,x_2)}_{h_1},\\ \\underbrace{\\text{NAND}(x_1,x_2)}_{h_2}\\,\\big)'}</MB>
      <Callout kind="key">
        인공 뉴런 = 가중합 + 편향 + 활성화 함수. 하나만으로는 직선 경계밖에 못 그리지만, 비선형 활성화 함수를 가진 뉴런을 층으로 쌓으면 훨씬 복잡한 경계를 표현할 수 있습니다.
      </Callout>
      <Quiz
        q="활성화 함수 없이(f(z) = z) 뉴런 층을 10개 쌓은 신경망은 무엇과 같을까요?"
        options={['층 하나짜리 선형 모델', '10배 더 복잡한 곡선을 그리는 모델', 'XOR을 풀 수 있는 모델', '학습이 불가능한 모델']}
        answer={0}
        explain={<>일차식의 합성은 다시 일차식입니다. W₂(W₁x + b₁) + b₂ = (W₂W₁)x + (W₂b₁ + b₂)처럼 정리되니 층이 몇 개든 하나의 선형 변환과 같습니다. 비선형 활성화 함수가 있어야 층을 쌓는 의미가 생깁니다.</>}
      />
    </>
  );
}
