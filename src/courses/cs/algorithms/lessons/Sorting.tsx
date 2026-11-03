import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { ALGS, INPUTS, count, makeInput, trace, type Alg, type Frame, type InputKind } from './sorts';
import './algorithms.css';

const ALG_IDS = Object.keys(ALGS) as Alg[];
// short labels ("삽입") so the four choices fit on one line
const algOptions = ALG_IDS.map((a) => ({ value: a, label: ALGS[a].name.replace(' 정렬', '') }));
const inputOptions = (Object.keys(INPUTS) as InputKind[]).map((k) => ({ value: k, label: INPUTS[k] }));

/** Bars for one frame: height = value. Compared bars are yellow, moved bars orange, the pivot blue. */
function drawBars(ctx: CanvasRenderingContext2D, P: Palette, f: Frame, w: number, h: number, labels: boolean) {
  const n = f.a.length;
  const padB = labels ? 18 : 2;
  const gap = n > 30 ? 1 : 3;
  const bw = (w - 4) / n;
  const maxV = n;
  if (f.range) {
    ctx.fillStyle = alpha(P.accent, 0.07);
    ctx.fillRect(2 + f.range[0] * bw, 0, (f.range[1] - f.range[0] + 1) * bw, h - padB);
  }
  for (let i = 0; i < n; i++) {
    const v = f.a[i];
    const bh = (v / maxV) * (h - padB - 6);
    let col = alpha(P.ink, 0.32);
    if (f.done || i < f.fixed) col = alpha(P.good, 0.75);
    if (f.pivot === i) col = P.neg;
    if (f.cmp && (f.cmp[0] === i || f.cmp[1] === i)) col = P.hl;
    if (f.moved.includes(i)) col = P.pos;
    ctx.fillStyle = col;
    ctx.fillRect(2 + i * bw + gap / 2, h - padB - bh, Math.max(1, bw - gap), bh);
    if (labels) {
      ctx.fillStyle = P.ink3;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(v), 2 + i * bw + bw / 2, h - padB + 4);
    }
  }
}

/* ─────────────── Figure 1: one algorithm, step by step ─────────────── */

function StepFigure() {
  const P = usePalette();
  const [alg, setAlg] = useState<Alg>('insertion');
  const [seed, setSeed] = useState(4);
  const frames = useMemo(() => trace(alg, makeInput('random', 16, rng(seed))), [alg, seed]);
  const s = useStepper(frames.length, 4, `${alg}|${seed}`);
  const f = frames[s.i];

  const { wrapRef, canvasRef } = useCanvas2D((ctx, { w, h }) => drawBars(ctx, P, f, w, h, true), [P, f], { aspect: 2.3, maxHeight: 280, minHeight: 200 });

  return (
    <Figure
      no={1}
      title="한 단계씩 정렬하기"
      hint="알고리즘을 고르고 재생해 보세요"
      caption={<>막대 높이가 값입니다. 노란 막대는 지금 비교하는 두 값, 주황 막대는 방금 옮긴 값, 파란 막대는 퀵 정렬의 피벗, 초록 막대는 자리가 확정된 값입니다. 옅은 파란 배경은 지금 작업 중인 구간입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }} aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg label="알고리즘" value={alg} onChange={setAlg} options={algOptions} />
          <StepControls s={s} id="st-speed" maxSpeed={30} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((x) => x + 1)}>
              새로 섞기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="비교" value={`${f.c}번`} />
            <Readout label="이동 (교환·쓰기)" value={`${f.m}번`} />
          </div>
          <Legend
            items={[
              { color: 'var(--hl)', label: '비교', shape: 'sq' },
              { color: 'var(--pos)', label: '이동', shape: 'sq' },
              { color: 'var(--neg)', label: '피벗', shape: 'sq' },
              { color: 'var(--good)', label: '확정', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a race on the same input ─────────────── */

function RacePanel({ alg, frames, i }: { alg: Alg; frames: Frame[]; i: number }) {
  const P = usePalette();
  const f = frames[Math.min(i, frames.length - 1)];
  const { wrapRef, canvasRef } = useCanvas2D((ctx, { w, h }) => drawBars(ctx, P, f, w, h, false), [P, f], { aspect: 2.6, maxHeight: 150, minHeight: 90 });
  return (
    <div className="race-panel" data-done={f.done || undefined}>
      <div className="race-head">
        <strong>{ALGS[alg].name}</strong>
        <span className="mono">
          비교 {f.c} · 이동 {f.m}
        </span>
      </div>
      <div ref={wrapRef} style={{ marginTop: 6 }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>
    </div>
  );
}

function RaceFigure() {
  const [kind, setKind] = useState<InputKind>('random');
  const [seed, setSeed] = useState(1);
  const input = useMemo(() => makeInput(kind, 40, rng(seed * 31 + 7)), [kind, seed]);
  const traces = useMemo(() => Object.fromEntries(ALG_IDS.map((a) => [a, trace(a, input)])) as Record<Alg, Frame[]>, [input]);
  const total = Math.max(...ALG_IDS.map((a) => traces[a].length));
  const s = useStepper(total, 60, input);
  const finished = ALG_IDS.filter((a) => s.i >= traces[a].length - 1).sort((x, y) => traces[x].length - traces[y].length);

  return (
    <Figure
      no={2}
      title="같은 데이터로 경주시키기"
      hint="입력 모양을 바꿔 가며 재생해 보세요"
      caption={<>네 알고리즘이 같은 40개의 값을 정렬합니다. 한 단계는 비교 한 번 또는 이동 한 번이므로, 먼저 끝나는 알고리즘일수록 일을 적게 한 것입니다. 입력이 무작위일 때와 이미 정렬되어 있을 때 순위가 어떻게 뒤바뀌는지 보세요.</>}
    >
      <div className="race-grid">
        {ALG_IDS.map((a) => (
          <RacePanel key={a} alg={a} frames={traces[a]} i={s.i} />
        ))}
      </div>
      <div className="controls row">
        <Seg label="입력 모양" value={kind} onChange={setKind} options={inputOptions} />
        <div className="ctl" style={{ flex: '1 1 260px' }}>
          <StepControls s={s} id="race-speed" maxSpeed={400} />
        </div>
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Button small onClick={() => setSeed((x) => x + 1)}>
            새 데이터
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }}>
        {finished.length ? (
          <>
            끝난 순서: <strong>{finished.map((a) => ALGS[a].name).join(' → ')}</strong>
          </>
        ) : (
          '재생을 눌러 경주를 시작하세요'
        )}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: comparisons as n grows ─────────────── */

const NS = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
const ALG_COLOR: Record<Alg, keyof Palette> = { selection: 'ink2', insertion: 'pos', merge: 'neg', quick: 'good' };
const ALG_CSS: Record<Alg, string> = { selection: 'var(--ink-2)', insertion: 'var(--pos)', merge: 'var(--neg)', quick: 'var(--good)' };

function CountFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<InputKind>('random');
  const series = useMemo(() => {
    const r = rng(99);
    return Object.fromEntries(
      ALG_IDS.map((a) => [
        a,
        NS.map((n) => {
          const runs = kind === 'random' || kind === 'nearly' ? 3 : 1;
          let c = 0;
          for (let k = 0; k < runs; k++) c += count(a, makeInput(kind, n, r)).c;
          return c / runs;
        }),
      ]),
    ) as Record<Alg, number[]>;
  }, [kind]);
  const last = NS.length - 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const nMax = NS[last];
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: nMax, yMin: 0, yMax: ((nMax * (nMax - 1)) / 2) * 1.08, pad: { l: 52, r: 16, t: 14, b: 30 } });
      plot.grid({ xLabel: 'n', fmt: (v) => (v >= 1000 ? `${fmt(v / 1000, 0)}천` : String(Math.round(v))) });
      plot.fn((x) => (x * (x - 1)) / 2, alpha(P.ink3, 0.7), 1.2, { dash: [5, 4] });
      plot.fn((x) => (x > 1 ? x * Math.log2(x) : 0), alpha(P.ink3, 0.7), 1.2, { dash: [2, 4] });
      plot.text('n²/2', nMax * 0.86, (nMax * 0.86) ** 2 / 2, P.ink3, { dx: -8, align: 'right', font: `11px ${P.fontMono}` });
      plot.text('n log₂n', nMax, nMax * Math.log2(nMax), P.ink3, { dy: -10, align: 'right', font: `11px ${P.fontMono}` });
      for (const a of ALG_IDS) {
        const ys = series[a];
        ctx.strokeStyle = P[ALG_COLOR[a]] as string;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        NS.forEach((n, i) => (i ? ctx.lineTo(plot.X(n), plot.Y(ys[i])) : ctx.moveTo(plot.X(n), plot.Y(ys[i]))));
        ctx.stroke();
      }
    },
    [P, series],
    { aspect: 2, maxHeight: 330, minHeight: 240 },
  );

  return (
    <Figure
      no={3}
      title="n이 커질 때 비교 횟수"
      hint="입력 모양을 바꿔 보세요"
      caption={<>n을 10부터 300까지 늘리며 각 알고리즘의 비교 횟수를 실제로 셌습니다. 점선은 기준선 n²/2와 n log₂n입니다. 무작위 입력에서 선택·삽입 정렬은 위쪽 포물선을, 병합·퀵 정렬은 바닥에 붙은 n log n을 따릅니다. 이미 정렬된 입력에서는 삽입 정렬과 퀵 정렬이 자리를 맞바꿉니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg label="입력 모양" value={kind} onChange={setKind} options={inputOptions} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {ALG_IDS.map((a) => (
              <Readout key={a} label={`${ALGS[a].name} (n=300)`} value={`${Math.round(series[a][last]).toLocaleString('ko-KR')}번`} color={ALG_CSS[a]} />
            ))}
          </div>
          <Legend items={ALG_IDS.map((a) => ({ color: ALG_CSS[a], label: ALGS[a].name, shape: 'ln' as const }))} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Sorting() {
  return (
    <>
      <h2>왜 정렬을 배우나</h2>
      <p>
        정렬은 그 자체로도 쓸모 있지만, 다른 문제를 쉽게 만들어 준다는 점이 더 중요합니다. 정렬된 배열에서는 이진 탐색으로 값을 빠르게 찾을 수 있고, 중복은 이웃끼리만 비교하면 되며, 중앙값은 한가운데를 보면 됩니다. 그래서 "일단 정렬하고 시작하자"는 알고리즘 설계에서 가장 흔한 첫수입니다.
      </p>
      <p>
        실무에서는 언어가 제공하는 정렬 함수를 쓰면 됩니다. 그래도 정렬 알고리즘 몇 가지를 직접 따라가 보면 반복문 하나가 O(n²)이 되는 이유와, 나눠서 정복하는 아이디어가 O(n log n)을 만드는 원리를 손으로 익힐 수 있습니다.
      </p>

      <h2>O(n²) 정렬: 선택과 삽입</h2>
      <p>
        <T en="selection sort">선택 정렬</T>은 남은 것 중 가장 작은 값을 찾아 맨 앞으로 보내는 일을 반복합니다. 가장 작은 값을 찾으려면 남은 원소를 모두 봐야 하므로, 비교 횟수는 입력과 상관없이 항상 <M>{'(n-1) + (n-2) + \\cdots + 1 = n(n-1)/2'}</M>번입니다.
      </p>
      <p>
        <T en="insertion sort">삽입 정렬</T>은 손에 든 카드를 정리하는 방식입니다. 앞쪽은 이미 정렬되어 있다고 보고, 새 원소를 왼쪽으로 한 칸씩 옮기며 제자리를 찾아 끼워 넣습니다. 최악의 경우(역순)에는 선택 정렬처럼 n²/2번 비교하지만, 이미 거의 정렬된 데이터에서는 원소마다 한두 번만 비교하고 끝납니다.
      </p>
      <Code label="삽입 정렬">{`
function insertionSort(a) {
  for (let i = 1; i < a.length; i++) {
    // a[0..i-1]은 이미 정렬됨. a[i]를 왼쪽으로 옮기며 제자리를 찾는다
    for (let j = i; j > 0 && a[j - 1] > a[j]; j--) {
      [a[j - 1], a[j]] = [a[j], a[j - 1]];
    }
  }
  return a;
}`}</Code>
      <StepFigure />

      <h2>O(n log n) 정렬: 나눠서 정복하기</h2>
      <p>
        <T en="merge sort">병합 정렬</T>은 배열을 반으로 나눠 각각 정렬한 다음, 정렬된 두 줄을 앞에서부터 비교하며 하나로 합칩니다. 반으로 나누기를 반복하면 <M>{'\\log_2 n'}</M>단계 만에 원소 하나짜리가 되고, 각 단계에서 합치는 일은 모두 합쳐 n번 정도입니다. 그래서 전체는 <M>{'n \\log n'}</M>입니다.
      </p>
      <MB note="크기 n인 문제를 크기 n/2인 문제 두 개로 나누고, 합치는 데 n만큼 일하면 전체는 n log n이 됩니다.">{'T(n) = 2\\,T\\!\\left(\\tfrac{n}{2}\\right) + n \\;\\;\\Rightarrow\\;\\; T(n) = O(n \\log n)'}</MB>
      <Code label="병합 정렬">{`
function mergeSort(a) {
  if (a.length <= 1) return a;
  const mid = a.length >> 1;
  const left = mergeSort(a.slice(0, mid));
  const right = mergeSort(a.slice(mid));
  // 정렬된 두 배열을 앞에서부터 비교하며 합친다
  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    out.push(left[i] <= right[j] ? left[i++] : right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}`}</Code>
      <p>
        <T en="quicksort">퀵 정렬</T>은 순서를 뒤집습니다. 먼저 기준값(<T en="pivot">피벗</T>) 하나를 골라 그보다 작은 것은 왼쪽, 큰 것은 오른쪽으로 나누고, 양쪽을 각각 다시 정렬합니다. 피벗이 매번 가운데쯤에 떨어지면 병합 정렬처럼 log n단계로 끝나고, 추가 메모리도 거의 쓰지 않아 실제로 매우 빠릅니다. 그림 1에서 알고리즘을 바꿔 가며 단계 수를 비교해 보세요.
      </p>

      <h2>입력에 따라 달라지는 순위</h2>
      <RaceFigure />
      <p>
        무작위 입력에서는 병합·퀵 정렬이 압도적으로 먼저 끝납니다. 그런데 "이미 정렬됨"으로 바꾸면 삽입 정렬이 거의 즉시 끝나고, 퀵 정렬은 꼴찌로 떨어집니다. 이 그림의 퀵 정렬은 매번 마지막 원소를 피벗으로 고르는데, 이미 정렬된 배열에서는 그것이 늘 가장 큰 값이라 한쪽으로만 나뉘기 때문입니다. 실제 구현은 피벗을 무작위로 고르거나 세 값의 중앙값을 써서 이런 최악의 경우를 피합니다.
      </p>
      <CountFigure />
      <Callout kind="note">
        원소끼리 비교만 해서 정렬하는 방법은 최악의 경우 적어도 약 <M>{'n \\log_2 n'}</M>번 비교해야 한다는 것이 증명되어 있습니다. n개를 늘어놓는 경우의 수 n!가지 중 정답 하나를 골라내야 하고, 비교 한 번은 예/아니오 한 비트의 정보만 주기 때문입니다. 그래서 O(n log n)은 비교 정렬이 도달할 수 있는 최선입니다.
      </Callout>
      <Callout kind="warn">
        JavaScript의 <code>Array.prototype.sort()</code>는 비교 함수를 주지 않으면 값을 <strong>문자열로 바꿔서</strong> 비교합니다. 그래서 <code>[10, 9, 1].sort()</code>의 결과는 <code>[1, 10, 9]</code>입니다. 숫자를 정렬할 때는 항상 <code>{'a.sort((x, y) => x - y)'}</code>처럼 비교 함수를 넘기세요.
      </Callout>

      <Callout kind="key">
        선택·삽입 정렬은 O(n²), 병합·퀵 정렬은 O(n log n)입니다. 하지만 입력의 모양도 중요합니다. 삽입 정렬은 거의 정렬된 데이터에서 O(n)으로 빨라지고, 피벗을 잘못 고른 퀵 정렬은 O(n²)으로 느려집니다. 표준 라이브러리의 정렬은 이런 장단점을 섞어 대부분의 입력에서 빠르게 동작하도록 만들어져 있습니다.
      </Callout>
      <Quiz
        q="이미 정렬된 10만 개의 기록 끝에 새 기록 몇 개가 붙었다. 다시 정렬할 때 이 데이터에서 특히 빠른 것은?"
        options={['선택 정렬', '삽입 정렬', '마지막 원소를 피벗으로 쓰는 퀵 정렬', '어떤 방법이든 똑같다']}
        answer={1}
        explain={<>삽입 정렬은 이미 제자리에 있는 원소에서는 비교 한 번으로 넘어가고, 새로 붙은 몇 개만 앞으로 옮기면 되므로 거의 O(n)에 끝납니다. 선택 정렬은 입력과 상관없이 n²/2번 비교하고, 마지막 원소를 피벗으로 쓰는 퀵 정렬은 정렬된 입력에서 최악이 됩니다.</>}
      />
    </>
  );
}
