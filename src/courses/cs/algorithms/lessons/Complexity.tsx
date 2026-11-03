import { useEffect, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { humanTime } from '../../shared';
import './algorithms.css';

/* ─────────────── Figure 1: how long would it take? ─────────────── */

const OPS_PER_SEC = 1e8;

interface Growth {
  name: string;
  /** log10 of the operation count for input size n. */
  log10: (n: number) => number;
  color: string;
}

const GROWTHS: Growth[] = [
  { name: 'O(1)', log10: () => 0, color: 'var(--good)' },
  { name: 'O(log n)', log10: (n) => Math.log10(Math.max(1, Math.log2(n))), color: 'var(--good)' },
  { name: 'O(n)', log10: (n) => Math.log10(n), color: 'var(--c-cs-2)' },
  { name: 'O(n log n)', log10: (n) => Math.log10(n * Math.max(1, Math.log2(n))), color: 'var(--c-cs-2)' },
  { name: 'O(n²)', log10: (n) => 2 * Math.log10(n), color: 'var(--pos)' },
  { name: 'O(2ⁿ)', log10: (n) => n * Math.log10(2), color: 'var(--bad)' },
];
const SCALE = 20; // bars span 10⁰ … 10²⁰ operations

function fmtN(n: number) {
  if (n >= 1e8) return `${fmt(n / 1e8, n % 1e8 ? 1 : 0)}억`;
  if (n >= 1e4) return `${fmt(n / 1e4, n % 1e4 ? 1 : 0)}만`;
  return n.toLocaleString('ko-KR');
}

function GrowthFigure() {
  const [e, setE] = useState(3);
  const n = Math.round(10 ** e);
  return (
    <Figure
      no={2}
      title="입력이 n개일 때 걸리는 시간"
      hint="n을 바꿔 보세요"
      caption={<>컴퓨터가 1초에 기본 연산을 1억 번 한다고 가정했습니다. 막대 길이는 연산 횟수의 자릿수(로그 눈금)입니다. 칸 하나가 10배이므로, 막대가 한 칸 길어질 때마다 시간은 10배가 됩니다. n이 작을 때는 모두 눈 깜짝할 사이지만, n이 커지면 O(n²)과 O(2ⁿ)만 다른 세상으로 갑니다.</>}
    >
      <div className="fig-split">
        <div className="growth-rows" role="table" aria-label={`n = ${fmtN(n)}일 때 복잡도별 예상 시간`}>
          {GROWTHS.map((g) => {
            const l = g.log10(n);
            const w = Math.min(1, l / SCALE);
            const over = l > SCALE;
            return (
              <div key={g.name} className="growth-row" role="row">
                <span className="mono growth-name" role="cell">
                  {g.name}
                </span>
                <span className="growth-track" role="cell" aria-hidden="true">
                  <span className="growth-bar" style={{ width: `${Math.max(1.5, w * 100)}%`, background: g.color }} data-over={over || undefined} />
                </span>
                <span className="mono growth-time" role="cell">
                  {humanTime(10 ** Math.min(l, 300) / OPS_PER_SEC)}
                </span>
              </div>
            );
          })}
          <div className="growth-axis" aria-hidden="true">
            {[0, 5, 10, 15, 20].map((k) => (
              <span key={k} style={{ left: `${(k / SCALE) * 100}%` }}>
                10<sup>{k}</sup>
              </span>
            ))}
          </div>
        </div>
        <div className="controls">
          <Slider id="gr-n" label="입력 크기 n" value={e} min={1} max={9} step={0.05} onChange={setE} format={() => fmtN(n)} color="var(--c-cs-1)" />
          <div className="btn-row">
            {[1, 3, 6, 9].map((k) => (
              <Button key={k} small onClick={() => setE(k)}>
                {fmtN(10 ** k)}
              </Button>
            ))}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="n" value={n.toLocaleString('ko-KR')} />
            <Readout label="n²" value={n * n >= 1e15 ? (n * n).toExponential(1) : (n * n).toLocaleString('ko-KR')} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: constants vs growth ─────────────── */

function ConstantFigure() {
  const P = usePalette();
  const [c, setC] = useState(50);
  const N = Math.max(30, Math.round(c * 2.4));
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const yMax = Math.max(c * N, N * N) * 1.05;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: N, yMin: 0, yMax, pad: { l: 52, r: 14, t: 14, b: 30 } });
      plot.grid({ xLabel: '입력 크기 n', fmt: (v) => (v >= 1e4 ? `${fmt(v / 1e4, 0)}만` : String(Math.round(v))) });
      plot.fillUnder((x) => Math.min(x * x, c * x), alpha(P.good, 0.08));
      plot.fn((x) => c * x, P.accent, 2.5);
      plot.fn((x) => x * x, P.pos, 2.5);
      plot.dot(c, c * c, 6, P.ink, P.surface, 2);
      plot.text(`교차점 n = ${c}`, c, c * c, P.ink, { dx: 10, dy: -12, bg: P.surface });
      plot.text(`A: ${c}·n`, N * 0.97, c * N * 0.97, P.accent, { align: 'right', dy: -12 });
    },
    [P, c, N],
    { aspect: 2, maxHeight: 320, minHeight: 230 },
  );
  return (
    <Figure
      no={1}
      title="상수가 큰 O(n)과 상수가 작은 O(n²)"
      hint="A의 상수를 바꿔 보세요"
      caption={<>A는 원소마다 무거운 작업을 c번 하는 O(n) 알고리즘(c·n), B는 원소 쌍마다 가벼운 작업을 한 번 하는 O(n²) 알고리즘(n²)입니다. n이 c보다 작으면 B가 더 빠르지만, 교차점을 넘으면 B는 다시는 A를 따라잡지 못합니다. 상수가 아무리 커도 n이 충분히 크면 증가 속도가 이깁니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="cf-c" label="A의 상수 c" value={c} min={5} max={200} step={5} onChange={setC} color="var(--accent)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="n = 10일 때 A / B" value={`${(c * 10).toLocaleString('ko-KR')} / 100`} />
            <Readout label="n = 10만일 때 A / B" value={`${fmtN(c * 1e5)} / 100억`} />
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: 'A: c·n  → O(n)', shape: 'ln' },
              { color: 'var(--pos)', label: 'B: n²  → O(n²)', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: measure it in this browser ─────────────── */

type TaskId = 'sum' | 'sort' | 'pairs' | 'bsearch';

interface Task {
  label: string;
  big: string;
  sizes: number[];
  /** Returns a number so the work cannot be optimized away. */
  run: (data: Float64Array, n: number) => number;
  expect: string;
}

const TASKS: Record<TaskId, Task> = {
  bsearch: {
    label: '이진 탐색 10만 번',
    big: 'O(log n)',
    sizes: [1_000, 10_000, 100_000, 1_000_000, 10_000_000],
    run: (a, n) => {
      let found = 0;
      for (let q = 0; q < 100_000; q++) {
        const target = (q * 7919) % n;
        let lo = 0;
        let hi = n - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (mid === target) {
            found++;
            break;
          }
          if (mid < target) lo = mid + 1;
          else hi = mid - 1;
        }
      }
      return found + a[0];
    },
    expect: '거의 그대로 (n이 10배여도)',
  },
  sum: {
    label: '합계',
    big: 'O(n)',
    sizes: [200_000, 400_000, 800_000, 1_600_000, 3_200_000],
    run: (a, n) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += a[i];
      return s;
    },
    expect: '약 2배',
  },
  sort: {
    label: '정렬',
    big: 'O(n log n)',
    sizes: [25_000, 50_000, 100_000, 200_000, 400_000],
    run: (a, n) => {
      const c = a.slice(0, n);
      c.sort();
      return c[n >> 1];
    },
    expect: '2배보다 조금 더',
  },
  pairs: {
    label: '모든 쌍 비교',
    big: 'O(n²)',
    sizes: [500, 1000, 2000, 4000, 8000],
    run: (a, n) => {
      let k = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (a[i] + a[j] > 1.9) k++;
      return k;
    },
    expect: '약 4배',
  },
};

let sink = 0;

function TimingFigure() {
  const [task, setTask] = useState<TaskId>('pairs');
  const [rows, setRows] = useState<{ n: number; ms: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);
  const t = TASKS[task];

  useEffect(() => () => void (cancel.current = true), []);

  const run = async () => {
    cancel.current = false;
    setBusy(true);
    setRows([]);
    const maxN = Math.max(...t.sizes);
    const data = new Float64Array(maxN);
    for (let i = 0; i < maxN; i++) data[i] = Math.random();
    const out: { n: number; ms: number }[] = [];
    for (const n of t.sizes) {
      await new Promise((r) => setTimeout(r, 30));
      if (cancel.current) return;
      let best = Infinity;
      for (let rep = 0; rep < 3; rep++) {
        const t0 = performance.now();
        sink += t.run(data, n);
        best = Math.min(best, performance.now() - t0);
      }
      out.push({ n, ms: best });
      setRows([...out]);
    }
    setBusy(false);
  };

  const ratioLabel = task === 'bsearch' ? 'n이 10배일 때' : 'n이 2배일 때';
  return (
    <Figure
      no={3}
      title="이 브라우저에서 직접 재 보기"
      hint="작업을 고르고 측정을 눌러 보세요"
      caption={<>지금 보고 있는 기기에서 실제로 코드를 실행해 시간을 잽니다. 각 크기마다 세 번 실행해 가장 빠른 값을 씁니다. 절대 시간은 기기마다 다르지만, n을 키웠을 때 시간이 몇 배가 되는지는 복잡도를 따릅니다. 측정에는 잡음이 있으니 대략적인 경향을 보세요.</>}
    >
      <div className="fig-split">
        <div className="tbl-wrap" style={{ margin: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>n</th>
                <th style={{ textAlign: 'right' }}>시간</th>
                <th style={{ textAlign: 'right' }}>{ratioLabel}</th>
              </tr>
            </thead>
            <tbody>
              {t.sizes.map((n, i) => {
                const r = rows[i];
                const prev = rows[i - 1];
                return (
                  <tr key={n}>
                    <td className="num" style={{ textAlign: 'left' }}>
                      {n.toLocaleString('ko-KR')}
                    </td>
                    <td className="num">{r ? `${fmt(r.ms, r.ms < 10 ? 2 : 1)}ms` : busy ? '…' : '—'}</td>
                    <td className="num" style={{ color: 'var(--c-cs-1)', fontWeight: 600 }}>
                      {r && prev && prev.ms > 0.05 ? `×${fmt(r.ms / prev.ms, 1)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="controls">
          <Seg
            label="작업"
            value={task}
            onChange={(v) => {
              setTask(v);
              setRows([]);
            }}
            options={(Object.keys(TASKS) as TaskId[]).map((k) => ({ value: k, label: TASKS[k].big }))}
          />
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>
            {t.label} · 예상: {ratioLabel} 시간 <strong>{t.expect}</strong>
          </div>
          <div className="btn-row">
            <Button primary small onClick={run} disabled={busy}>
              {busy ? '측정 중…' : '측정 시작'}
            </Button>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Complexity() {
  return (
    <>
      <h2>"빠르다"를 어떻게 잴까</h2>
      <p>
        두 사람이 같은 문제를 푸는 코드를 짰습니다. 어느 쪽이 빠를까요? 직접 실행해서 초를 재면 될 것 같지만, 결과는 컴퓨터 성능, 언어, 그날의 데이터에 따라 달라집니다. 더 중요한 문제는 따로 있습니다. 오늘 데이터 1000개에서 비슷했던 두 코드가 내년에 데이터가 100만 개로 늘었을 때도 비슷할까요?
      </p>
      <p>
        그래서 알고리즘의 속도는 초 대신 <strong>입력 크기 n에 대해 기본 연산을 몇 번 하는가</strong>로 잽니다. 배열에서 가장 큰 값을 찾으려면 원소를 하나씩 모두 봐야 하니 n번, 모든 원소 쌍을 비교하려면 약 n²/2번입니다. 이렇게 입력이 커질 때 연산 횟수가 어떻게 늘어나는지를 <T en="time complexity">시간 복잡도</T>라고 합니다.
      </p>
      <Code label="O(n)과 O(n²)의 예">{`
// O(n): 원소를 한 번씩 본다
function max(a) {
  let best = a[0];
  for (let i = 1; i < a.length; i++) {
    if (a[i] > best) best = a[i];
  }
  return best;
}

// O(n²): 모든 쌍을 본다 (중복이 있는지 확인)
function hasDuplicate(a) {
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if (a[i] === a[j]) return true;
    }
  }
  return false;
}`}</Code>

      <h2>Big-O: 가장 빨리 자라는 항만 본다</h2>
      <p>
        어떤 코드의 연산 횟수가 <M>{'3n^2 + 5n + 100'}</M>번이라고 해 봅시다. n이 작을 때는 100이 크게 보이지만, n이 1만만 돼도 <M>{'3n^2'}</M>이 3억이고 나머지는 5만 남짓이라 무시할 만합니다. 그래서 가장 빨리 자라는 항만 남기고 앞의 상수도 떼어 <M>{'O(n^2)'}</M>이라고 씁니다. 이것이 <T en="Big-O notation">Big-O 표기법</T>입니다.
      </p>
      <MB note="Big-O는 n이 충분히 클 때 연산 횟수가 어떤 함수보다 빨리 자라지 않는다는 상한을 나타냅니다.">{'3n^2 + 5n + 100 = O(n^2) \\qquad 7n\\log n + 20n = O(n \\log n)'}</MB>
      <p>상수를 떼어도 될까요? 상수가 아주 큰 O(n) 알고리즘과 상수가 작은 O(n²) 알고리즘을 비교해 봅시다.</p>
      <ConstantFigure />
      <Callout kind="note">
        상수가 쓸모없다는 뜻은 아닙니다. n이 작을 때는 상수가 작은 단순한 알고리즘이 더 빠를 수 있습니다. 실제로 여러 언어의 표준 정렬 함수는 원소가 수십 개 이하인 작은 구간을 만나면 O(n²)인 삽입 정렬로 바꿔서 처리합니다. Big-O는 "데이터가 커지면 결국 어떻게 되는가"에 답하는 도구입니다.
      </Callout>

      <h2>자주 만나는 복잡도</h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>복잡도</th>
              <th>이름</th>
              <th>예</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">O(1)</td>
              <td>상수 시간</td>
              <td>배열의 i번째 원소 읽기, 해시 테이블 조회(평균)</td>
            </tr>
            <tr>
              <td className="mono">O(log n)</td>
              <td>로그 시간</td>
              <td>정렬된 배열에서 이진 탐색</td>
            </tr>
            <tr>
              <td className="mono">O(n)</td>
              <td>선형 시간</td>
              <td>최댓값 찾기, 배열 전체 한 번 훑기</td>
            </tr>
            <tr>
              <td className="mono">O(n log n)</td>
              <td>선형 로그 시간</td>
              <td>병합 정렬, 표준 라이브러리의 정렬</td>
            </tr>
            <tr>
              <td className="mono">O(n²)</td>
              <td>제곱 시간</td>
              <td>이중 반복문으로 모든 쌍 비교, 삽입 정렬(최악)</td>
            </tr>
            <tr>
              <td className="mono">O(2ⁿ)</td>
              <td>지수 시간</td>
              <td>모든 부분집합을 하나씩 시도하기</td>
            </tr>
          </tbody>
        </table>
      </div>
      <GrowthFigure />
      <p>
        n이 100만이면 O(n log n) 정렬은 0.2초면 끝나지만 O(n²) 정렬은 3시간 가까이 걸립니다. O(2ⁿ)은 n = 40 정도에서 이미 몇 시간이 걸리고, n = 100이면 우주의 나이로도 모자랍니다. 그래서 개발자는 코드를 짜기 전에 "데이터가 얼마나 커질까, 그때 이 방법은 버틸까"를 먼저 묻습니다.
      </p>

      <h2>2배 규칙으로 직접 확인하기</h2>
      <p>
        복잡도를 확인하는 간단한 방법이 있습니다. 입력을 2배로 늘리고 시간이 몇 배가 되는지 보는 것입니다. O(n)이면 약 2배, O(n²)이면 약 4배, O(n log n)이면 2배보다 조금 더, O(log n)이면 거의 늘지 않습니다.
      </p>
      <TimingFigure />
      <Code label="O(log n): 매번 범위를 절반으로">{`
// 정렬된 배열 a에서 x의 위치를 찾는다. 없으면 -1
function binarySearch(a, x) {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;   // 가운데
    if (a[mid] === x) return mid;
    if (a[mid] < x) lo = mid + 1; // 오른쪽 절반만 남김
    else hi = mid - 1;            // 왼쪽 절반만 남김
  }
  return -1;
}`}</Code>
      <p>
        이진 탐색은 한 번 비교할 때마다 후보를 절반으로 줄이므로, 100만 개에서도 약 20번(<M>{'\\log_2 10^6 \\approx 20'}</M>)이면 끝납니다. 그림 3에서 n을 10배씩 늘려도 시간이 거의 그대로인 이유입니다. 이 방법은 <a href="#cs-algorithms/search-hash">탐색과 해시 테이블</a> 장에서 자세히 다룹니다.
      </p>

      <Callout kind="key">
        알고리즘의 속도는 입력 크기 n에 대한 연산 횟수로 재고, 가장 빨리 자라는 항만 남긴 Big-O로 요약합니다. n이 커질수록 상수보다 증가 속도가 결정적입니다. 입력을 2배로 늘렸을 때 시간이 몇 배가 되는지 보면 복잡도를 거꾸로 짐작할 수 있습니다.
      </Callout>
      <Quiz
        q="어떤 함수에 넣는 데이터를 2배로 늘렸더니 실행 시간이 약 4배가 되었다. 이 함수의 복잡도로 가장 그럴듯한 것은?"
        options={['O(log n)', 'O(n)', 'O(n²)', 'O(2ⁿ)']}
        answer={2}
        explain={<>O(n²)에서는 n이 2배가 되면 n²은 4배가 됩니다. O(n)이면 약 2배, O(log n)이면 거의 그대로입니다. O(2ⁿ)이라면 n이 2배가 될 때 시간은 제곱으로 늘어나서, 4배 정도로는 끝나지 않습니다.</>}
      />
    </>
  );
}
