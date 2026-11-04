import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, humanTime, useStepper } from '../../shared';
import { D_SRC, PROGS, bruteSubset, collatz, subsetInstance } from './machines';
import './computation.css';

/* ─────────────── Figure 1: does this loop end? ─────────────── */

const COLLATZ_PICKS = [6, 27, 97, 871];
const SCAN = 10000;
const longest = (() => {
  let best = 1;
  let len = 0;
  for (let n = 1; n <= SCAN; n++) {
    const l = collatz(n).length - 1;
    if (l > len) {
      len = l;
      best = n;
    }
  }
  return { n: best, steps: len };
})();

function CollatzFigure() {
  const P = usePalette();
  const [n, setN] = useState(27);
  const path = useMemo(() => collatz(n), [n]);
  const peak = Math.max(...path);
  const peakAt = path.indexOf(peak);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = Math.max(10, path.length - 1);
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax: peak * 1.08, pad: { l: 52, r: 14, t: 14, b: 28 } });
      plot.grid({ xStep: xMax > 60 ? 20 : 10, yStep: peak > 5000 ? 2000 : peak > 1000 ? 500 : peak > 200 ? 100 : 20, labels: true, fmt: (v) => v.toLocaleString('ko-KR') });
      ctx.strokeStyle = P.neg;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.forEach((v, i) => (i ? ctx.lineTo(plot.X(i), plot.Y(v)) : ctx.moveTo(plot.X(i), plot.Y(v))));
      ctx.stroke();
      if (path.length < 80) path.forEach((v, i) => plot.dot(i, v, 2.4, v % 2 ? P.pos : P.neg));
      plot.dot(peakAt, peak, 5, P.hl, P.ink, 1.5);
      plot.dot(path.length - 1, 1, 5, P.good, P.surface, 2);
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontMono}`;
      ctx.textAlign = peakAt > xMax * 0.7 ? 'right' : 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(` 최댓값 ${peak.toLocaleString('ko-KR')} `, plot.X(peakAt), plot.Y(peak) - 6);
    },
    [P, path, peak, peakAt],
    { aspect: 2, maxHeight: 300, minHeight: 200 },
  );

  return (
    <Figure
      no={1}
      title="이 반복문은 끝날까?"
      hint="n을 바꿔 보세요"
      caption={<>짝수면 2로 나누고, 홀수면 3을 곱하고 1을 더하는 일을 1이 될 때까지 되풀이합니다. 가로축은 반복 횟수, 세로축은 n의 값입니다. 주황 점이 홀수, 파란 점이 짝수일 때입니다. n = 27은 111번 반복하는 동안 9,232까지 치솟았다가 1로 떨어집니다. 지금까지 확인한 모든 n에서 이 반복문은 끝났지만, 모든 n에서 끝난다는 증명은 아직 아무도 찾지 못했습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`n = ${n}에서 출발한 콜라츠 수열: ${path.length - 1}번 반복해 1에 도달, 최댓값 ${peak}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ud-n" label="시작하는 수 n" value={n} min={1} max={1000} step={1} onChange={setN} color="var(--c-cs-3)" />
          <Seg label="골라 보기" value={COLLATZ_PICKS.includes(n) ? n : -1} onChange={setN} options={COLLATZ_PICKS.map((v) => ({ value: v, label: String(v) }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="반복 횟수" value={path.length - 1} />
            <Readout label="최댓값" value={peak.toLocaleString('ko-KR')} />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
            1부터 {SCAN.toLocaleString('ko-KR')}까지 모두 이 브라우저에서 돌려 보았고 모두 1에 도달했습니다. 가장 오래 걸린 수는 {longest.n.toLocaleString('ko-KR')}로 {longest.steps}번 반복합니다.
          </p>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the diagonal ─────────────── */

const INPUTS = [...PROGS.map((p) => p.src), D_SRC];
const NAMES = [...PROGS.map((p) => p.name), 'D'];
const H = '멈춤';
const L = '무한';

function DiagonalFigure() {
  const grid = PROGS.map((p) => INPUTS.map((x) => p.halts(x)));
  const dRow = PROGS.map((_, i) => !grid[i][i]); // D does the opposite of pᵢ on its own source
  const s = useStepper(PROGS.length + 2, 1, null);
  const k = s.i; // 0: table only · 1..5: fill D's cells · 6: D on itself
  const [answer, setAnswer] = useState<'halt' | 'loop'>('halt');
  const last = k === PROGS.length + 1;
  const cell = (v: boolean) => (v ? H : L);

  const note =
    k === 0
      ? '각 칸은 "행의 프로그램에 열의 소스 코드를 입력으로 주면 멈추는가"입니다. 이제 D의 행을 한 칸씩 채웁니다.'
      : k <= PROGS.length
        ? `D(${NAMES[k - 1]}의 소스)는 halts(${NAMES[k - 1]}, ${NAMES[k - 1]})를 묻습니다. 대각선 칸이 ${cell(grid[k - 1][k - 1])}이므로 D는 반대로 ${cell(dRow[k - 1])}입니다. 그래서 D의 행은 ${NAMES[k - 1]}의 행과 적어도 이 칸에서 다릅니다.`
        : 'D의 행은 모든 pᵢ의 행과 대각선 칸에서 다르므로, D는 표의 어떤 프로그램과도 같지 않습니다. 그런데 D도 프로그램이니 표에 있어야 합니다. 마지막 칸, D에 D 자신을 넣으면?';

  return (
    <Figure
      no={2}
      title="대각선 논법: 어떤 행과도 다른 프로그램"
      hint="한 단계씩 넘겨 D의 행을 채워 보세요"
      caption={<>행은 프로그램, 열은 입력으로 줄 소스 코드입니다(같은 프로그램들의 소스). 표 아래에 프로그램의 실제 소스가 있고, 칸의 값은 그 코드를 따라가 보면 확인할 수 있습니다. 테두리 친 칸이 대각선, 즉 프로그램에 자기 자신의 소스를 준 경우입니다. D는 halts가 있다고 가정하고 만든 프로그램으로, 대각선의 답을 뒤집어 행동합니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="cmp-tbl-wrap">
            <table className="cmp-tbl" aria-label="프로그램과 입력의 정지 여부 표">
              <thead>
                <tr>
                  <th aria-label="행: 프로그램, 열: 입력">p ＼ x</th>
                  {NAMES.map((nm) => (
                    <th key={nm}>{nm}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROGS.map((p, i) => (
                  <tr key={p.name}>
                    <th className="row">{p.name}</th>
                    {grid[i].map((v, j) => (
                      <td key={j} className={v ? 'halt' : 'loop'} data-s={i === j ? (k === i + 1 ? 'on' : 'diag') : undefined}>
                        {cell(v)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th className="row" style={{ color: 'var(--pos)' }}>
                    D
                  </th>
                  {NAMES.map((_, j) => {
                    if (j < PROGS.length) {
                      const shown = k > j;
                      return (
                        <td key={j} className={shown ? (dRow[j] ? 'halt' : 'loop') : undefined} data-s={shown ? 'flip' : undefined}>
                          {shown ? cell(dRow[j]) : '·'}
                        </td>
                      );
                    }
                    return (
                      <td key={j} data-s={last ? 'bad' : undefined}>
                        {last ? '?' : '·'}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="cmp-note" aria-live="polite">
            {note}
          </div>
          <Code label="표의 프로그램들">{[...PROGS.map((p) => p.src), '', '// halts가 있다고 가정하고 만든 프로그램', D_SRC].join('\n')}</Code>
          {last && (
            <div className="cmp-verdict" style={{ display: 'block' }}>
              halts(D, D)가 <strong>{answer === 'halt' ? 'true (멈춘다)' : 'false (멈추지 않는다)'}</strong>라고 답하면, D는 {answer === 'halt' ? <>if 조건이 참이라 <code>while (true)</code>에 들어가 영원히 돕니다.</> : <>if 조건이 거짓이라 바로 끝납니다.</>} <strong data-ok="no">halts의 답이 틀렸습니다.</strong> 어느 쪽으로 답해도 틀리므로, 처음의 가정, 즉 언제나 옳게 답하는 halts가 있다는 가정이 거짓입니다.
            </div>
          )}
        </div>
        <div className="controls">
          <StepControls s={s} id="ud-diag-speed" maxSpeed={3} />
          <Seg
            label="halts(D, D)의 답이 …라면"
            value={answer}
            onChange={setAnswer}
            options={[
              { value: 'halt', label: 'true' },
              { value: 'loop', label: 'false' },
            ]}
          />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '대각선 · D의 칸 (대각선을 뒤집음)', shape: 'sq' },
          { color: 'var(--bad)', label: '모순: D에 D를 넣은 칸', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: check fast, search slow ─────────────── */

const N_MIN = 4;
const N_MAX = 22;
const RATE = 1e9; // candidates checked per second by a fast program

function SubsetFigure() {
  const P = usePalette();
  const [n, setN] = useState(8);
  const [seed, setSeed] = useState(1);
  const inst = useMemo(() => subsetInstance(n, seed), [n, seed]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [search, setSearch] = useState<{ key: string; tried: number; ms: number; found: boolean[] | null } | null>(null);
  const key = `${n}|${seed}`;
  const sel = inst.nums.map((_, i) => !!picked[i]);
  const sum = inst.nums.reduce((a, v, i) => a + (sel[i] ? v : 0), 0);
  const hit = sum === inst.target && sel.some(Boolean);
  const res = search && search.key === key ? search : null;

  const reset = (nn: number, ss: number) => {
    setN(nn);
    setSeed(ss);
    setPicked([]);
  };
  const runSearch = () => {
    const t = performance.now();
    const r = bruteSubset(inst.nums, inst.target);
    setSearch({ key, tried: r.tried, ms: performance.now() - t, found: r.found });
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = 60;
      const yMax = 18;
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax, pad: { l: 44, r: 12, t: 12, b: 40 } });
      plot.grid({ xStep: 10, yStep: 3, labels: false });
      const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= xMax; x += 10) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= yMax; y += 3) ctx.fillText('10' + String(y).split('').map((d) => SUP[+d]).join(''), plot.X(0) - 6, plot.Y(y));
      // one second of work at RATE
      plot.line(0, Math.log10(RATE), xMax, Math.log10(RATE), P.lineStrong, 1.2, [5, 4]);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('1초 (초당 10억 개)', plot.X(1), plot.Y(Math.log10(RATE)) - 3);
      plot.fn((x) => Math.min(yMax + 1, x * Math.log10(2)), P.bad, 2.4, { from: 0, to: xMax });
      plot.fn((x) => Math.log10(Math.max(1, x)), P.good, 2.4, { from: 1, to: xMax });
      plot.line(n, 0, n, yMax, P.lineStrong, 1, [3, 4]);
      plot.dot(n, n * Math.log10(2), 5, P.bad, P.surface, 2);
      plot.dot(n, Math.log10(n), 5, P.good, P.surface, 2);
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('n (수의 개수)', plot.X(xMax), plot.Y(0) + 22);
    },
    [P, n],
    { aspect: 2.1, maxHeight: 260, minHeight: 190 },
  );

  return (
    <Figure
      no={3}
      title="부분집합의 합: 확인은 순식간, 찾기는 2ⁿ"
      hint="수를 눌러 골라 보고, 모든 경우를 시도해 보세요"
      caption={<>수 n개 중 몇 개를 골라 합이 목표와 같게 만드는 문제입니다. 누군가 고른 답이 맞는지는 덧셈 n번이면 확인합니다(초록). 하지만 답을 찾으려면, 지금 아는 가장 단순한 방법으로는 부분집합 2ⁿ개를 차례로 시도해야 합니다(빨강). 세로축은 로그 눈금이고 점선은 1초에 10억 개를 시도할 때의 1초입니다. "모든 경우 시도"는 매번 수 하나만 넣거나 빼는 순서(그레이 코드)로 부분집합을 바꿔 가며 답을 처음 찾을 때까지 시도한 개수를 셉니다.</>}
    >
      <div className="ss-nums" role="group" aria-label="수를 눌러 고르기">
        {inst.nums.map((v, i) => (
          <button key={i} type="button" className="ss-num" aria-pressed={sel[i]} data-sol={res?.found?.[i] || undefined} onClick={() => setPicked(sel.map((x, j) => (j === i ? !x : x)))}>
            {v.toLocaleString('ko-KR')}
          </button>
        ))}
      </div>
      <div className="cmp-verdict" aria-live="polite">
        목표 <strong className="mono">{inst.target.toLocaleString('ko-KR')}</strong> · 고른 수의 합 <strong className="mono">{sum.toLocaleString('ko-KR')}</strong>
        {sel.some(Boolean) && <strong data-ok={hit ? 'yes' : 'no'}>{hit ? '정답 (덧셈 몇 번으로 확인)' : sum > inst.target ? '너무 큼' : '모자람'}</strong>}
        {res?.found && <span>· 주황 밑줄: 탐색이 찾은 답</span>}
      </div>
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`수 ${n}개: 확인은 덧셈 ${n}번, 모든 부분집합은 ${2 ** n}개`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ud-ss-n" label="수의 개수 n" value={n} min={N_MIN} max={N_MAX} step={1} onChange={(v) => reset(v, seed)} color="var(--c-cs-3)" />
          <div className="btn-row">
            <Button small primary onClick={runSearch}>
              모든 경우 시도
            </Button>
            <Button small onClick={() => reset(n, seed + 1)}>
              새 문제
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="확인: 덧셈" value={`${n}번`} color="var(--good)" />
            <Readout label="부분집합 수 2ⁿ" value={(2 ** n).toLocaleString('ko-KR')} color="var(--bad)" />
            <Readout label="찾을 때까지 시도" value={res ? res.tried.toLocaleString('ko-KR') : '—'} />
            <Readout label="걸린 시간" value={res ? `${res.ms < 1 ? res.ms.toFixed(2) : Math.round(res.ms)}ms` : '—'} />
            <Readout label="n = 60이면" value={humanTime(2 ** 60 / RATE)} />
            <Readout label="n = 100이면" value={humanTime(2 ** 100 / RATE)} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--good)', label: '답 확인 (n)', shape: 'ln' },
          { color: 'var(--bad)', label: '모든 경우 탐색 (2ⁿ)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Undecidability() {
  return (
    <>
      <h2>이 프로그램은 멈출까?</h2>
      <p>코드 리뷰에서 이런 함수를 만났다고 해 봅시다. 어떤 양의 정수 n을 넣어도 반복문이 언젠가 끝날까요? 그림 1에서 여러 n을 넣어 보세요.</p>
      <Code label="콜라츠 반복">{`
function collatz(n) {
  while (n !== 1) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1;
  }
  return 'done';
}`}</Code>
      <CollatzFigure />
      <p>
        이 질문은 1937년 로타르 콜라츠가 던진 뒤로 아직 풀리지 않았습니다. 컴퓨터로 2⁶⁸ 근처까지의 모든 수를 확인했지만, 그보다 큰 어떤 수에서 영원히 돌거나 끝없이 커질 가능성을 배제한 사람은 없습니다. 고작 세 줄짜리 프로그램이 멈추는지조차 우리는 모릅니다. 그렇다면 "프로그램과 입력을 주면 그 프로그램이 멈추는지 알려 주는 프로그램"을 만들면 어떨까요? 무한 루프를 잡아 주는 컴파일러, 영원히 멈추지 않는 요청을 미리 거르는 서버를 만들 수 있을 겁니다.
      </p>
      <p>
        이것이 <T en="halting problem">정지 문제</T>입니다. 앨런 튜링은 1936년, 지난 장의 튜링 기계를 정의한 바로 그 논문에서 이런 프로그램은 <strong>존재할 수 없다</strong>는 것을 증명했습니다. 빠른 프로그램이 없다는 뜻이 아닙니다. 시간을 아무리 많이 줘도, 모든 입력에 대해 옳게 답하는 프로그램은 원리적으로 없다는 뜻입니다.
      </p>

      <h2>멈춤을 판정하는 프로그램이 있다면</h2>
      <p>
        반대로 가정하고 모순을 끌어내겠습니다. 어떤 함수 <code>halts(p, x)</code>가 있어서, 프로그램 소스 p와 입력 x를 받으면 "p에 x를 넣고 실행하면 언젠가 멈춘다"면 <code>true</code>, 영원히 돈다면 <code>false</code>를 항상 옳게, 유한한 시간 안에 돌려준다고 합시다. 그러면 이 함수로 다음 프로그램 D를 만들 수 있습니다.
      </p>
      <Code label="halts가 있다면 만들 수 있는 프로그램">{`
function D(x) {
  if (halts(x, x)) {      // "x에 x 자신을 넣으면 멈추는가?"
    while (true) {}       // 멈춘다고 하면, 일부러 영원히 돈다
  }
  return;                 // 안 멈춘다고 하면, 바로 멈춘다
}

D(D의 소스 코드);         // 이것은 멈출까?`}</Code>
      <p>
        D는 프로그램 x를 받아, x에 자기 자신의 소스를 넣었을 때의 운명을 halts에게 묻고, 정확히 그 반대로 행동합니다. 이제 D에 D 자신의 소스를 넣어 봅시다. halts(D, D)가 true라면 D는 영원히 돌고, false라면 D는 바로 멈춥니다. 어느 쪽이든 halts의 답은 틀립니다. 모든 단계가 정당했으니 잘못된 것은 처음의 가정뿐입니다. 언제나 옳은 halts는 없습니다.
      </p>
      <p>이 논증은 표 하나로 그릴 수 있습니다. 그림 2를 한 단계씩 넘겨 보세요.</p>
      <DiagonalFigure />
      <p>
        이 방법을 <T en="diagonal argument">대각선 논법</T>이라고 합니다. 1891년 칸토어가 실수가 자연수보다 많다는 것을 보일 때 쓴 방법으로, 목록의 i번째 항목과 i번째 자리에서 다르게 만든 새 항목은 목록 어디에도 없다는 것입니다. 프로그램은 유한한 문자열이니 모두 한 줄로 늘어놓을 수 있고, D는 그 목록의 모든 프로그램과 대각선에서 다릅니다. 그런데 halts가 있다면 D도 프로그램이므로 목록 어딘가에 있어야 합니다. 모순입니다.
      </p>
      <Callout kind="key">
        정지 문제는 <T en="undecidable">결정 불가능</T>합니다. 모든 프로그램과 입력에 대해 멈추는지를 유한한 시간 안에 옳게 답하는 알고리즘은 없습니다. 특정한 프로그램이 멈추는지 증명할 수는 있고, "아마 안 멈춘다"고 추측하는 도구도 만들 수 있지만, 언제나 옳게 답하는 하나의 알고리즘은 없습니다.
      </Callout>

      <h2>환원: 하나가 안 되면 다른 것도 안 된다</h2>
      <p>
        정지 문제가 결정 불가능하다는 것을 알고 나면, 다른 문제들도 줄줄이 결정 불가능해집니다. 예를 들어 "이 프로그램은 언젠가 화면에 hi를 출력하는가?"를 판정하는 함수 <code>printsHi(p)</code>가 있다고 해 봅시다. 그러면 정지 문제를 풀 수 있습니다.
      </p>
      <Code label="정지 문제를 printsHi로 바꾸기">{`
function halts(p, x) {
  // p(x)를 출력 없이 실행하고, 끝나면 hi를 찍는 새 프로그램을 만든다
  const q = \`function q() {
    silently(() => (\${p})(\${JSON.stringify(x)}));
    console.log('hi');
  }\`;
  return printsHi(q);   // q가 hi를 찍는다 ⇔ p(x)가 멈춘다
}`}</Code>
      <p>
        q가 hi를 출력하는 것은 정확히 p(x)가 멈출 때뿐입니다. 그러니 printsHi가 있다면 halts도 있습니다. halts는 없으므로 printsHi도 없습니다. 이렇게 문제 A의 입력을 문제 B의 입력으로 바꿔 "B를 풀 수 있으면 A도 풀 수 있다"를 보이는 것을 <T en="reduction">환원</T>이라고 합니다. 방향에 주의하세요. 이미 어렵다고 알려진 A를 새 문제 B로 환원해야 B가 어렵다는 결론이 나옵니다.
      </p>
      <p>
        같은 방법으로 "이 함수는 언젠가 null을 돌려주는가", "이 두 프로그램은 같은 일을 하는가", "이 코드에 도달할 수 없는 줄이 있는가", "이 프로그램은 악성 코드처럼 행동하는가"도 모두 결정 불가능하다는 것이 증명됩니다. 일반적으로 <strong>프로그램이 하는 일</strong>에 대한 의미 있는 질문은 모두 결정 불가능하다는 것이 <T en="Rice's theorem">라이스 정리</T>입니다. 그래서 TypeScript 같은 타입 검사기나 린터는 정확한 답 대신 안전한 쪽으로 어림합니다. 문제가 없는 코드에 경고를 띄우거나, 판단을 포기하고 <code>any</code>를 허용하는 것은 버그가 아니라 피할 수 없는 선택입니다. 지난 장의 바쁜 비버 값을 계산하는 프로그램이 없다는 것도 정지 문제에서 나옵니다.
      </p>

      <Callout kind="note" label="그래서 현실에서는">
        멈출지 미리 알 수 없으니, 실제 시스템은 <strong>시간이나 일의 양에 한도</strong>를 둡니다. 브라우저는 스크립트가 너무 오래 돌면 "페이지가 응답하지 않습니다" 창을 띄우고, 서버리스 함수와 데이터베이스 쿼리에는 제한 시간이 있으며, 이더리움 같은 블록체인은 스마트 계약이 쓸 수 있는 계산량(가스)을 미리 정해 둡니다. 한도에 걸린 프로그램이 영원히 돌 프로그램이었는지는 끝내 모르지만, 적어도 시스템 전체가 멈추지는 않습니다.
      </Callout>

      <h2>풀 수 있지만 너무 오래 걸리는 문제</h2>
      <p>
        이제 결정할 수 있는 문제로 돌아오면, 이번에는 시간이 문제가 됩니다. 입력 크기 n에 대해 <M>{'n^k'}</M> 같은 다항식 시간 안에 풀리는 결정 문제의 모임을 <T en="P">P</T>라고 합니다. 정렬, 최단 경로, 최소 신장 트리가 그렇습니다. 한편 답이 "예"일 때 그 증거가 주어지면 다항 시간 안에 <strong>확인</strong>할 수 있는 문제의 모임을 <T en="NP">NP</T>라고 합니다. 확인할 수 있으면 찾기도 쉬울까요? 그림 3의 부분집합 합 문제로 감을 잡아 봅시다.
      </p>
      <SubsetFigure />
      <p>
        답을 찾는 가장 단순한 방법은 <a href={lessonHref('cs-algorithm-design', 'recursion')}>백트래킹</a>으로 모든 부분집합을 시도하는 것이고, 수가 하나 늘 때마다 후보가 두 배가 됩니다. 수가 작은 정수라면 <a href={lessonHref('cs-algorithm-design', 'dynamic-programming')}>동적 계획법</a>으로 "합 s를 만들 수 있는가"를 표에 채워 O(n × 목표) 시간에 풀 수 있지만, 목표가 n자리 숫자처럼 크면 표도 지수적으로 커집니다. 영리한 방법을 써도 지금까지 알려진 모든 알고리즘은 최악의 경우 지수 시간이 걸립니다. 반면 답을 확인하는 일은 언제나 쉽습니다.
      </p>
      <Callout kind="note" label="P 대 NP">
        확인이 쉬운 문제는 모두 찾기도 쉬운가? 즉 P = NP인가? 이것이 컴퓨터 과학에서 가장 유명한 미해결 문제입니다. 대부분의 연구자는 P ≠ NP라고 믿지만 아무도 증명하지 못했고, 클레이 수학 연구소는 이 문제에 100만 달러의 상금을 걸었습니다.
      </Callout>

      <h2>NP-완전: 모두를 대표하는 문제</h2>
      <p>
        1971년 스티븐 쿡은 논리식이 참이 되도록 변수에 참·거짓을 배정할 수 있는지 묻는 <T en="Boolean satisfiability, SAT">충족 가능성 문제</T>(SAT)에 대해 놀라운 사실을 보였습니다. NP의 <strong>모든</strong> 문제는 다항 시간 안에 SAT로 환원됩니다. 다음 해 리처드 카프는 배낭 문제(부분집합 합), 그래프 색칠, 해밀턴 순환을 포함한 21개 문제가 같은 성질을 가진다는 것을 보였습니다. 이런 문제를 <T en="NP-complete">NP-완전</T>이라고 합니다.
      </p>
      <p>
        NP-완전 문제들은 서로 환원되므로 운명을 함께합니다. 그중 하나라도 다항 시간 알고리즘이 나오면 NP 전체가 P가 되고, 하나라도 지수 시간이 꼭 필요하다는 것이 증명되면 모두가 그렇습니다. 시간표 짜기, 컴파일러의 레지스터 배정(그래프 색칠), 배송 경로 짜기, 큰 스도쿠 풀기가 모두 이 무리에 속합니다.
      </p>
      <p>
        그렇다고 손을 놓는 것은 아닙니다. 실제 입력은 최악의 경우보다 훨씬 다루기 쉬운 경우가 많아서, 현대의 SAT 풀이기는 변수가 수백만 개인 하드웨어 검증 문제를 풉니다. 최적해 대신 보장된 근사해를 구하거나, <a href={lessonHref('cs-algorithm-design', 'greedy')}>탐욕 알고리즘</a> 같은 휴리스틱으로 충분히 좋은 답을 찾기도 합니다. 반대로 어려움을 이용하기도 합니다. <a href={lessonHref('net-security', 'public-key')}>공개 키 암호</a>는 큰 수의 소인수분해처럼 확인은 쉽고 찾기는 어려워 보이는 문제 위에 서 있습니다.
      </p>

      <Callout kind="key">
        정지 문제는 대각선 논법으로 결정 불가능함이 증명되고, 환원을 통해 프로그램의 동작에 대한 수많은 질문이 같은 운명을 맞습니다. 결정할 수 있는 문제 중에서도 P는 빠르게 풀리는 문제, NP는 빠르게 확인되는 문제입니다. NP-완전 문제는 NP의 모든 문제가 환원되는 가장 어려운 문제들이고, P = NP인지는 아직 아무도 모릅니다.
      </Callout>
      <Quiz
        q="새로 만난 문제 X가 어려운지 알고 싶다. 다음 중 'X는 다항 시간에 풀기 어렵다(NP-난해)'는 결론을 주는 것은?"
        options={['X를 SAT로 다항 시간에 환원했다', 'SAT를 X로 다항 시간에 환원했다', 'X의 답을 다항 시간에 확인할 수 있음을 보였다', 'X를 지수 시간에 푸는 알고리즘을 찾았다']}
        answer={1}
        explain={<>SAT를 X로 환원했다는 것은 "X를 빨리 풀 수 있으면 SAT도 빨리 풀 수 있다"는 뜻이므로, X는 적어도 SAT만큼 어렵습니다. ①은 반대 방향이라 "X는 SAT보다 어렵지 않다"는 것만 말해 줍니다. ③은 X가 NP에 속한다는 뜻이고, ④는 어떤 문제에서든 가능할 수 있는 일이라 어려움의 증거가 되지 못합니다. 정지 문제에서 printsHi가 어렵다는 것을 보일 때도 이미 어려운 halts를 printsHi로 바꿨습니다.</>}
      />
    </>
  );
}
