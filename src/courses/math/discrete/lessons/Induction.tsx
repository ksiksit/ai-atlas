import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../../cs/shared';
import { ProofSteps, useMathColors, useProof, type ProofStep } from './parts';
import './discrete.css';

/* ─────────────── Figure 1: dominoes ─────────────── */

const DN = 12;
const FALL = 0.26; // seconds for one domino to reach the next
const BREAK_AT = 6; // in "broken" mode the gap after domino 6 is too wide

function DominoFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [base, setBase] = useState(true);
  const [mode, setMode] = useState<'all' | 'broken'>('all');
  const [playing, setPlaying] = useState(false);
  const t = useRef(0);
  const [, setTick] = useState(0);
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const broken = mode === 'broken';
  const last = !base ? -1 : broken ? BREAK_AT - 1 : DN - 1; // index of the last domino that falls
  const end = (last + 2.5) * FALL;

  useAnimationFrame((dt) => {
    t.current += dt;
    if (t.current >= end) {
      t.current = end;
      setPlaying(false);
    }
    setTick((x) => x + 1);
  }, playing && inView);

  const push = () => {
    t.current = prefersReducedMotion() ? end : 0;
    setPlaying(!prefersReducedMotion());
    setTick((x) => x + 1);
  };
  const resetAll = () => {
    t.current = 0;
    setPlaying(false);
    setTick((x) => x + 1);
  };
  const change = (fn: () => void) => {
    fn();
    resetAll();
  };

  const now = t.current;
  const fallen = last < 0 || now === 0 ? 0 : Math.min(last + 1, Math.floor(now / FALL) + 1);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const extraUnits = 1.5; // the wide gap, in units of the normal spacing
      const s = (w - 44) / (DN + extraUnits);
      const H = s * 1.55;
      const dw = Math.max(4, s * 0.24);
      const ground = h - 34;
      const xOf = (i: number) => 18 + i * s + (broken && i >= BREAK_AT ? extraUnits * s : 0);
      const gapTo = (i: number) => xOf(i + 1) - (xOf(i) + dw); // distance from pivot to the next domino's face

      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(8, ground + 0.5);
      ctx.lineTo(w - 8, ground + 0.5);
      ctx.stroke();

      // resting angles, from the right: the last falling domino lies flat, each earlier one leans on its neighbour
      const rest: number[] = Array(DN).fill(Math.PI / 2);
      for (let i = last - 1; i >= 0; i--) {
        const phi = rest[i + 1];
        const d = xOf(i + 1) - xOf(i);
        rest[i] = Math.max(Math.asin(Math.min(1, gapTo(i) / H)), phi + Math.asin(Math.max(-1, Math.min(1, (d * Math.cos(phi) - dw) / H))));
      }

      for (let i = 0; i < DN; i++) {
        const x = xOf(i);
        const start = i * FALL;
        const u = (now - start) / FALL;
        const falls = i <= last && now > 0;
        const supported = i < last; // the next one also falls, so this one ends leaning on it
        let th = 0;
        if (falls && u > 0) {
          const thC = Math.asin(Math.min(1, gapTo(i) / H));
          if (supported) th = u <= 1 ? thC * u * u : thC + (rest[i] - thC) * Math.min(1, (u - 1) / 1.5);
          else th = (Math.PI / 2) * Math.min(1, (u / 1.3) ** 2);
        }
        ctx.save();
        ctx.translate(x + dw, ground);
        ctx.rotate(th);
        const isDown = falls && u > 0.15;
        ctx.fillStyle = isDown ? c2 : P.surface;
        ctx.strokeStyle = isDown ? P.surface : P.ink2;
        ctx.lineWidth = isDown ? 1 : 1.5;
        ctx.fillRect(-dw, -H, dw, H);
        ctx.strokeRect(-dw, -H, dw, H);
        ctx.restore();

        ctx.fillStyle = isDown ? P.ink : P.ink3;
        ctx.font = `${isDown ? 700 : 400} ${s < 26 ? 10 : 11}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1), x + dw / 2, ground + 6);
      }
      // "and so on" after the last domino
      ctx.fillStyle = P.ink3;
      ctx.font = `14px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('…', xOf(DN - 1) + dw + 6, ground - 4);

      // the push on domino 1
      if (base) {
        const x = xOf(0) - 2;
        ctx.strokeStyle = c1;
        ctx.fillStyle = c1;
        ctx.lineWidth = 2;
        const y = ground - H * 0.85;
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.lineTo(x - 2, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y - 4);
        ctx.lineTo(x - 6, y + 4);
        ctx.fill();
      }
      if (broken) {
        const gx = (xOf(BREAK_AT - 1) + dw + xOf(BREAK_AT)) / 2;
        ctx.strokeStyle = P.bad;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx + dw, ground - H - 10);
        ctx.lineTo(gx + dw, ground);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.bad;
        ctx.font = `600 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('너무 멂', gx + dw, ground - H - 12);
      }
      ctx.fillStyle = alpha(P.ink, 0.6);
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`넘어진 도미노: ${fallen}개`, 10, 10);
    },
    [P, c1, c2, now, base, broken, last, fallen],
    { aspect: 3.2, maxHeight: 220, minHeight: 125 },
  );

  const finished = !playing && now >= end && now > 0;
  const msg = !base
    ? '기초 단계가 없습니다. 아무도 첫 도미노를 밀지 않으니, 도미노끼리 아무리 가까워도 하나도 넘어지지 않습니다.'
    : broken
      ? `귀납 단계가 ${BREAK_AT}번에서 ${BREAK_AT + 1}번으로 넘어가지 못합니다. 앞의 ${BREAK_AT}개만 넘어지고, 그 뒤는 하나도 넘어지지 않습니다.`
      : '기초 단계와 귀납 단계가 모두 있습니다. 1번이 넘어지고, 어떤 도미노든 넘어지면 다음 것이 넘어지므로 모든 도미노가 넘어집니다.';

  return (
    <Figure
      no={1}
      title="도미노와 귀납법"
      hint="두 조건을 바꾸고 넘어뜨려 보세요"
      caption={<>도미노 n번이 넘어지는 것을 명제 P(n)이 참이 되는 것으로 생각합니다. 첫 도미노를 미는 것이 <strong>기초 단계</strong> P(1)이고, 이웃한 도미노 사이의 간격이 넘어진 도미노가 다음 것에 닿을 만큼 가까운 것이 <strong>귀납 단계</strong> P(k) → P(k+1)입니다. 둘 중 하나라도 빠지면 모든 도미노가 넘어진다고 말할 수 없습니다.</>}
    >
      <div ref={outer}>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`도미노 ${DN}개. ${msg} 지금 넘어진 도미노 ${fallen}개.`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <div className="controls row">
        <div className="ctl" style={{ flex: '1 1 220px' }}>
          <Check label="기초 단계: 1번을 민다" checked={base} onChange={(v) => change(() => setBase(v))} />
        </div>
        <Seg label="귀납 단계" value={mode} onChange={(v) => change(() => setMode(v))} options={[{ value: 'all', label: '모든 k에서 닿음' }, { value: 'broken', label: `${BREAK_AT}번 뒤가 멂` }]} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <div className="btn-row">
            <Button small primary onClick={push}>
              ▶ 넘어뜨리기
            </Button>
            <Button small onClick={resetAll}>
              다시 세우기
            </Button>
          </div>
        </div>
      </div>
      <div className="dm-note" aria-live="polite">
        {finished || !base ? msg : '"넘어뜨리기"를 누르세요.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: 1 + 2 + … + n, the staircase ─────────────── */

type StairView = 'pair' | 'one' | 'k' | 'step' | 'all';
const STEP_VIEW: StairView[] = ['pair', 'one', 'k', 'step', 'all'];
const tri = (n: number) => (n * (n + 1)) / 2;

function Staircase({ n, view }: { n: number; view: StairView }) {
  const cols = view === 'one' ? 1 : view === 'step' ? n + 1 : n;
  const rowsN = view === 'one' ? 1 : view === 'pair' || view === 'step' ? n + 1 : n;
  const cell = Math.min(26, 280 / Math.max(cols, rowsN));
  const W = cols * cell + 60;
  const Hh = rowsN * cell + 40;
  const x0 = 30;
  const y0 = Hh - 22;
  const sq: { x: number; y: number; kind: 'a' | 'b' }[] = [];
  for (let j = 1; j <= cols; j++) {
    const height = view === 'one' ? 1 : view === 'step' && j === n + 1 ? n + 1 : j;
    for (let r = 0; r < height; r++) sq.push({ x: j - 1, y: r, kind: view === 'step' && j === n + 1 ? 'b' : 'a' });
    if (view === 'pair') for (let r = j; r < n + 1; r++) sq.push({ x: j - 1, y: r, kind: 'b' });
  }
  const label = view === 'pair' ? `${n} × ${n + 1} = ${n * (n + 1)}` : view === 'one' ? '1 = 1·2/2' : view === 'step' ? `${tri(n)} + ${n + 1} = ${tri(n + 1)}` : `${tri(n)}`;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="dm-stairs" role="img" aria-label={`계단 그림: ${label}`} style={{ maxWidth: Math.max(160, W * 1.25) }}>
      {sq.map((q, i) => (
        <rect key={i} x={x0 + q.x * cell} y={y0 - (q.y + 1) * cell} width={cell} height={cell} className={q.kind} />
      ))}
      {Array.from({ length: cols }, (_, j) => (
        <text key={j} x={x0 + (j + 0.5) * cell} y={y0 + 14} className="ax">
          {view === 'one' ? 1 : j + 1}
        </text>
      ))}
      <text x={x0 + (cols * cell) / 2} y="14" className="cap">
        {label}
      </text>
    </svg>
  );
}

function StairFigure() {
  const [n, setN] = useState(5);
  const steps: ProofStep[] = [
    {
      claim: (
        <>
          <strong>증명할 명제 P(n):</strong> <M>{'1 + 2 + \\cdots + n = \\tfrac{n(n+1)}{2}'}</M>. 그림처럼 계단 두 개를 맞붙이면 <M>{'n \\times (n+1)'}</M> 직사각형이 되니 그럴듯하다. 이제 귀납법으로 모든 n에 대해 증명한다.
        </>
      ),
      tone: 'goal',
    },
    {
      claim: (
        <>
          <strong>기초 단계:</strong> n = 1이면 왼쪽은 1, 오른쪽은 <M>{'1 \\cdot 2 / 2 = 1'}</M>. P(1)은 참이다.
        </>
      ),
      why: '첫 도미노를 넘어뜨렸습니다.',
    },
    {
      claim: (
        <>
          <strong>귀납 가정:</strong> 어떤 k ≥ 1에 대해 P(k)가 참이라고 하자. 즉 <M>{'1 + \\cdots + k = \\tfrac{k(k+1)}{2}'}</M>.
        </>
      ),
      why: `특정한 k 하나를 고르는 것이 아니라, 아무 k에서나 통하는 논리를 쓰겠다는 뜻입니다. 그림은 k = ${n}일 때입니다.`,
    },
    {
      claim: (
        <>
          <strong>귀납 단계:</strong> 계단에 높이 k + 1인 열을 하나 더 세운다.
          <MB>{'1 + \\cdots + k + (k+1) = \\tfrac{k(k+1)}{2} + (k+1) = \\tfrac{(k+1)(k+2)}{2}'}</MB>
          이것은 정확히 P(k + 1)이다.
        </>
      ),
      why: '첫 등호에서 귀납 가정을 썼습니다. 둘째 등호는 (k+1)로 묶은 계산입니다: (k+1)(k/2 + 1).',
    },
    {
      claim: <>기초 단계와 귀납 단계를 보였으므로, 수학적 귀납법에 의해 모든 양의 정수 n에 대해 P(n)이 참이다. ∎</>,
      tone: 'good',
    },
  ];
  const p = useProof(steps.length);
  const view = STEP_VIEW[p.i];

  return (
    <Figure
      no={2}
      title="1부터 n까지의 합: 계단 그림과 귀납법"
      hint="증명을 한 줄씩 넘기고 n을 바꿔 보세요"
      caption={<>정사각형 하나가 1입니다. 파란 계단 하나가 1 + 2 + ⋯ + n이고, 같은 계단을 뒤집어 붙인 분홍 계단과 합치면 n × (n+1) 직사각형이 됩니다. 귀납 단계에서는 높이 k인 파란 계단에 높이 k + 1인 분홍 열이 붙어 높이 k + 1인 계단이 되는 모습을 봅니다.</>}
    >
      <div className="fig-split">
        <ProofSteps steps={steps} p={p} label="1부터 n까지의 합 공식의 귀납법 증명" />
        <div className="controls">
          <Slider id="st-n" label={p.i >= 2 && p.i <= 3 ? 'k' : 'n'} value={n} min={1} max={10} step={1} onChange={setN} />
          <Staircase n={n} view={view} />
          <Legend
            items={[
              { color: 'var(--c-math-2)', label: view === 'step' ? '높이 k인 계단' : '계단 1 + ⋯ + n', shape: 'sq' },
              { color: 'color-mix(in srgb, var(--c-math-1) 55%, transparent)', label: view === 'step' ? '새 열 k + 1' : '뒤집은 복사본', shape: 'sq' },
            ]}
          />
          <Readout label={`1 + ⋯ + ${n}`} value={`${tri(n)} = ${n}·${n + 1}/2`} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: strong induction with stamps ─────────────── */

const MAXN = 40;
const PAIRS: [number, number][] = [
  [4, 5],
  [3, 5],
  [3, 7],
  [5, 7],
];

/** For each amount, one way to pay it with coins a and b (counts), or null. */
function payTable(a: number, b: number): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = [[0, 0]];
  for (let n = 1; n <= MAXN; n++) {
    let got: [number, number] | null = null;
    for (let y = 0; y * b <= n && !got; y++) if ((n - y * b) % a === 0) got = [(n - y * b) / a, y];
    out.push(got);
  }
  return out;
}

function StampFigure() {
  const [pi, setPi] = useState(0);
  const [a, b] = PAIRS[pi];
  const pay = useMemo(() => payTable(a, b), [a, b]);
  const F = useMemo(() => {
    let f = 0;
    for (let n = 1; n <= MAXN; n++) if (!pay[n]) f = n;
    return f; // largest amount that cannot be paid
  }, [pay]);
  const baseLo = F + 1;
  const baseHi = F + a;
  const frames = 1 + (MAXN - baseHi);
  const s = useStepper(frames, 3, pi);
  const cur = s.i === 0 ? null : baseHi + s.i;
  // amounts past the base block are built the way the induction builds them: (n − a) plus one a-coin
  const rep = useMemo(() => {
    const out = pay.slice();
    for (let n = baseHi + 1; n <= MAXN; n++) {
      const q = out[n - a];
      out[n] = q ? [q[0] + 1, q[1]] : null;
    }
    return out;
  }, [pay, baseHi, a]);
  const show = (n: number) => {
    const p = rep[n];
    if (!p) return '';
    const parts = [];
    if (p[0]) parts.push(p[0] > 1 ? `${a}×${p[0]}` : `${a}`);
    if (p[1]) parts.push(p[1] > 1 ? `${b}×${p[1]}` : `${b}`);
    return parts.join('+') || '0';
  };
  const state = (n: number) => {
    if (n < baseLo) return pay[n] ? 'small' : 'no';
    if (n <= baseHi) return 'base';
    if (cur !== null && n === cur) return 'cur';
    if (cur !== null && n === cur - a) return 'src';
    if (cur !== null && n < cur) return 'done';
    return 'todo';
  };

  return (
    <Figure
      no={3}
      title="강한 귀납법: 동전 두 종류로 금액 만들기"
      hint="동전 쌍을 고르고 재생해 보세요"
      caption={<>칸 하나가 금액 하나입니다. 회색 줄이 그어진 칸은 만들 수 없는 금액입니다. 굵은 테두리 칸들이 기초 단계로, 직접 만들어 보인 연속된 금액 {a}개입니다. 그다음부터는 n원을 만들 때 {a}원 앞의 금액 n − {a}를 만드는 방법에 {a}원 동전 하나를 더합니다. 바로 앞(n − 1)이 아니라 {a}칸 앞의 결과를 쓰므로 기초 단계도 {a}개가 필요합니다.</>}
    >
      <div className="controls row">
        <Seg label="동전" value={pi} onChange={setPi} options={PAIRS.map(([x, y], i) => ({ value: i, label: `${x}원·${y}원` }))} />
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="dm-stamps" role="list" aria-label={`1원부터 ${MAXN}원까지`}>
            {Array.from({ length: MAXN }, (_, k) => {
              const n = k + 1;
              const st = state(n);
              return (
                <div key={n} role="listitem" className="dm-stamp" data-st={st} aria-label={`${n}원: ${pay[n] ? show(n) : '만들 수 없음'}`}>
                  <span className="amt">{n}</span>
                  <span className="how">{st === 'todo' ? '' : st === 'no' ? '✕' : show(n)}</span>
                </div>
              );
            })}
          </div>
          <div className="dm-note" aria-live="polite">
            {cur === null ? (
              <>
                <strong>기초 단계:</strong> {baseLo}원부터 {baseHi}원까지 {a}개의 금액을 직접 만들었습니다. {F > 0 ? `${F}원은 어떻게 해도 만들 수 없으므로 출발점은 ${baseLo}원입니다.` : ''}
              </>
            ) : (
              <>
                <strong>{cur}원</strong> = ({cur - a}원을 만드는 방법) + {a}원 = {show(cur - a)} + {a}. {cur - a}원이 만들어진다는 것은 귀납 가정에 들어 있습니다.
              </>
            )}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="stamp-speed" maxSpeed={12} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="만들 수 없는 가장 큰 금액" value={`${F}원`} />
            <Readout label="기초 단계" value={`${baseLo}원 ~ ${baseHi}원 (${a}개)`} color="var(--c-math-2)" />
          </div>
          <Legend
            items={[
              { color: 'var(--c-math-2)', label: '기초 단계', shape: 'sq' },
              { color: 'var(--c-math-1)', label: '지금 만드는 금액', shape: 'sq' },
              { color: 'var(--hl)', label: '가져다 쓰는 금액', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Induction() {
  return (
    <>
      <h2>무한히 많은 경우를 한 번에</h2>
      <p>
        "모든 양의 정수 n에 대해 P(n)"을 증명하고 싶을 때, n을 하나씩 확인하는 일은 끝나지 않습니다. 2장에서 본 것처럼 40개를 확인해도 41번째에서 틀릴 수 있습니다. <T en="mathematical induction">수학적 귀납법</T>은 단 두 가지만 증명해서 무한히 많은 n을 한꺼번에 처리합니다. 도미노를 생각하면 쉽습니다.
      </p>
      <DominoFigure />
      <p>그림 1에서 기초 단계를 끄거나 귀납 단계를 끊어 보면, 두 조건이 각각 꼭 필요하다는 것을 알 수 있습니다. 이것을 식으로 쓰면 다음과 같습니다.</p>
      <MB note="P(1)이 참이고, 'P(k)가 참이면 P(k+1)도 참'이 모든 k에서 성립하면, P(n)은 모든 n에서 참입니다.">{'\\Big[\\, P(1) \\;\\land\\; \\forall k \\ge 1\\, \\big(P(k) \\to P(k+1)\\big) \\Big] \\;\\Rightarrow\\; \\forall n \\ge 1\\; P(n)'}</MB>
      <ol>
        <li>
          <T en="base case">기초 단계</T>: P(1)이 참임을 보인다. 보통 계산 한 줄입니다.
        </li>
        <li>
          <T en="inductive step">귀납 단계</T>: 아무 k에 대해 P(k)가 참이라고 <strong>가정</strong>하고(<T en="inductive hypothesis">귀납 가정</T>), 그로부터 P(k+1)이 참임을 보인다.
        </li>
      </ol>
      <p>
        귀납 단계에서 "P(k)가 참이라고 가정한다"는 말이 증명하려는 것을 미리 가정하는 것처럼 들릴 수 있습니다. 그렇지 않습니다. 증명하는 것은 P(k) 자체가 아니라 함의 <M>{'P(k) \\to P(k+1)'}</M>, 즉 "넘어지면 다음 것도 넘어진다"는 도미노 사이의 관계입니다. 실제로 넘어뜨리는 일은 기초 단계가 합니다.
      </p>

      <h2>첫 번째 귀납법 증명</h2>
      <p>
        어린 가우스가 1부터 100까지 더하라는 문제를 받고 1 + 100, 2 + 99, …처럼 짝을 지어 101 × 50 = 5050이라고 답했다는 이야기가 있습니다. 일반적인 공식 <M>{'1 + 2 + \\cdots + n = n(n+1)/2'}</M>를 귀납법으로 증명해 봅시다.
      </p>
      <StairFigure />
      <p>
        그림 2의 계단 그림은 공식이 <em>왜</em> 맞는지 보여 주고, 귀납법은 그것이 <em>모든</em> n에서 맞는다는 것을 보장합니다. 귀납법 증명의 핵심은 언제나 귀납 단계에서 P(k+1)의 식 안에 P(k)의 식을 찾아내는 것입니다. 여기서는 1 + ⋯ + (k+1) 안에 1 + ⋯ + k가 들어 있었습니다.
      </p>
      <p>하나 더 해 봅시다. 이번에는 숫자 대신 집합에 관한 명제입니다.</p>
      <div className="dm-boxed">
        <p>
          <strong>정리.</strong> 원소가 n개인 집합의 부분집합은 <M>{'2^n'}</M>개다.
        </p>
        <p>
          <strong>기초 단계.</strong> n = 0이면 집합은 ∅이고, 부분집합은 ∅ 하나뿐이다. <M>{'2^0 = 1'}</M>이므로 참이다.
        </p>
        <p>
          <strong>귀납 단계.</strong> 원소가 k개인 집합의 부분집합이 <M>{'2^k'}</M>개라고 가정하자. 원소가 k + 1개인 집합 S에서 원소 하나 x를 빼면 원소 k개짜리 집합 T가 남는다. S의 부분집합은 x를 포함하지 않는 것(곧 T의 부분집합, <M>{'2^k'}</M>개)과 x를 포함하는 것(T의 부분집합에 x를 더한 것, 역시 <M>{'2^k'}</M>개)으로 빠짐없이 나뉜다. 따라서 모두 <M>{'2^k + 2^k = 2^{k+1}'}</M>개다. ∎
        </p>
      </div>
      <p>기초 단계는 꼭 n = 1일 필요가 없습니다. 명제가 n = 0부터 성립하면 0에서, n = 5부터 성립하면 5에서 시작합니다. 그러면 결론도 "n ≥ 5인 모든 n"이 됩니다.</p>
      <Callout kind="warn" label="주의: 모든 말은 같은 색이다?">
        다음 "증명"은 어디가 틀렸을까요? P(n): "말 n마리를 모으면 모두 같은 색이다." 기초: 한 마리면 당연히 같은 색. 단계: k + 1마리를 줄 세우고, 앞의 k마리와 뒤의 k마리는 귀납 가정에 의해 각각 같은 색이고, 두 무리가 겹치므로 전부 같은 색. 틀린 곳은 k = 1에서 2로 갈 때입니다. 말 두 마리를 "앞의 1마리"와 "뒤의 1마리"로 나누면 겹치는 말이 없어서 두 무리를 이을 수 없습니다. 도미노 하나 사이의 간격이 너무 먼 것입니다. 귀납 단계는 <strong>모든</strong> k에서 통해야 합니다.
      </Callout>

      <h2>강한 귀납법</h2>
      <p>
        어떤 명제는 P(k+1)을 보이는 데 P(k) 하나로 부족하고, 더 앞의 결과가 필요합니다. <T en="strong induction">강한 귀납법</T>은 귀납 가정을 "P(1), P(2), …, P(k)가 모두 참"으로 넓힙니다. 넘어진 도미노가 바로 앞의 하나가 아니라 앞의 모든 것이라고 생각해도 되므로, 증명할 수 있는 것은 같지만 쓰기가 훨씬 편할 때가 많습니다.
      </p>
      <p>
        예를 들어 4원짜리와 5원짜리 우표만으로 12원 이상의 모든 금액을 만들 수 있다는 것을 증명해 봅시다. n원을 만들 때 n − 4원을 만드는 방법을 가져다 4원 우표 한 장을 붙이면 됩니다. n − 1이 아니라 n − 4를 쓰므로 강한 귀납법이 필요하고, 기초 단계도 연속된 네 금액(12, 13, 14, 15원)이 있어야 합니다.
      </p>
      <StampFigure />
      <p>
        그림 3에서 동전을 3원·7원으로 바꾸면 만들 수 없는 가장 큰 금액이 11원이 되고, 기초 단계는 12, 13, 14원 세 개면 충분합니다. 작은 동전이 a원이면 연속한 a개의 금액만 만들어 두면 나머지는 모두 따라온다는 점이 귀납 단계의 모양에서 바로 나옵니다.
      </p>

      <h2>재귀 함수가 맞다는 증명</h2>
      <p>
        귀납법과 <T en="recursion">재귀</T>는 같은 생각의 두 얼굴입니다. 재귀 함수는 작은 입력을 직접 처리하는 기저 사례와, 큰 입력을 더 작은 입력의 결과로 푸는 재귀 사례로 이루어집니다. 함수가 모든 입력에서 맞다는 증명은 정확히 귀납법의 모양입니다. 기저 사례가 맞다는 것이 기초 단계이고, "더 작은 입력에서 맞다면 이 입력에서도 맞다"가 귀납 단계입니다.
      </p>
      <Code label="재귀 함수와 그 정확성 증명">{`
// 주장: power(x, n)은 n ≥ 0인 모든 정수 n에 대해 xⁿ을 돌려준다
function power(x, n) {
  if (n === 0) return 1;            // 기초 단계: x⁰ = 1. 맞다
  const half = power(x, Math.floor(n / 2));
  // 강한 귀납 가정: n보다 작은 m에 대해 power(x, m) = xᵐ
  // floor(n/2) < n 이므로 half = x^floor(n/2)
  if (n % 2 === 0) return half * half;     // n 짝수: (x^(n/2))² = xⁿ
  return half * half * x;                  // n 홀수: (x^((n-1)/2))² · x = xⁿ
}
// 귀납 단계가 모든 n ≥ 1에서 통하므로, 모든 n에서 power(x, n) = xⁿ.
// 덤으로 호출 깊이가 log₂n이라 x를 n번 곱하는 것보다 훨씬 빠르다.`}</Code>
      <p>
        증명에는 두 가지가 숨어 있습니다. 첫째, 재귀 호출의 입력이 <strong>엄격히 작아져야</strong> 합니다(<M>{'\\lfloor n/2 \\rfloor < n'}</M>). 그래야 언젠가 기저 사례에 닿아 함수가 끝나고, 귀납 가정을 쓸 자격이 생깁니다. 둘째, 바로 앞 n − 1이 아니라 n/2를 쓰므로 강한 귀납법입니다. 6장의 거듭제곱 나머지 계산과 RSA가 바로 이 함수를 씁니다.
      </p>
      <Callout kind="note">
        재귀를 처음 만난다면 <a href={lessonHref('cs-programming', 'recursion')}>프로그래밍 입문의 재귀</a>에서 호출 스택이 쌓이고 풀리는 모습을, 재귀로 문제를 설계하는 방법은 <a href={lessonHref('cs-algorithm-design', 'recursion')}>재귀와 백트래킹</a>에서 이어서 보세요. 반복문도 같은 방식으로 증명합니다. "i번 돌고 나면 변수들이 어떤 관계를 만족한다"는 <T en="loop invariant">반복문 불변식</T>을 세우고, 0번 돈 상태(기초)와 한 번 더 도는 것(단계)을 확인합니다.
      </Callout>

      <Callout kind="key">
        수학적 귀납법은 기초 단계 P(1)과 귀납 단계 P(k) → P(k+1) 두 가지를 증명해 모든 n에 대한 P(n)을 얻습니다. 강한 귀납법은 앞의 모든 경우를 가정으로 쓸 수 있게 해 줍니다. 재귀 함수의 정확성 증명은 귀납법과 같은 모양입니다. 기저 사례가 맞고, 더 작은 입력에서 맞다면 지금 입력에서도 맞음을 보이면 됩니다.
      </Callout>
      <Quiz
        q={<>어떤 명제 P(n)에 대해 "P(k)가 참이면 P(k+2)도 참이다"를 모든 k ≥ 1에서 증명했다. 모든 n ≥ 1에서 P(n)을 얻으려면 기초 단계로 무엇이 필요한가?</>}
        options={['P(1)만', 'P(1)과 P(2)', 'P(2)만', '기초 단계는 필요 없다']}
        answer={1}
        explain={<>P(1)에서 출발하면 P(3), P(5), …처럼 홀수만 넘어집니다. 짝수 쪽 도미노 줄을 넘어뜨리려면 P(2)도 따로 보여야 합니다. 그림 3에서 n − 4를 쓸 때 기초 단계가 4개 필요했던 것과 같은 이유입니다.</>}
      />
    </>
  );
}
