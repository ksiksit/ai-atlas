import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { StepControls, humanTime, useStepper } from '../../shared';
import { chars, coinFrames, editFrames, editPath, editTable, greedyCoins, loopSteps, memoCalls, minCoinsTable, naiveCalls } from './optimize';
import '../../algorithms/lessons/algorithms.css';
import './optimize.css';

/* ─────────────── Figure 1: how many calls? ─────────────── */

const FIB_MAX = 60;
const CALLS_PER_SEC = 1e8;
const MEASURE_MAX = 35;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => '10' + String(k).split('').map((d) => SUP[+d]).join('');

function FibCountFigure() {
  const P = usePalette();
  const [n, setN] = useState(30);
  const [measured, setMeasured] = useState<{ n: number; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const naive = naiveCalls(n);
  const memo = memoCalls(n);
  const loop = loopSteps(n);

  const measure = () => {
    setBusy(true);
    // let the button repaint before the main thread is busy
    setTimeout(() => {
      const fib = (k: number): number => (k < 2 ? k : fib(k - 1) + fib(k - 2));
      const t = performance.now();
      fib(n);
      setMeasured({ n, ms: performance.now() - t });
      setBusy(false);
    }, 30);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: FIB_MAX, yMin: 0, yMax: 14, pad: { l: 44, r: 14, t: 12, b: 30 } });
      plot.grid({ xStep: 10, yStep: 2, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= FIB_MAX; x += 10) ctx.fillText(String(x), plot.X(x), plot.Y(0) + 6);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= 14; y += 2) ctx.fillText(pow10(y), plot.X(0) - 6, plot.Y(y));
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText('n', plot.X(FIB_MAX), plot.Y(0) - 4);

      const series: [(k: number) => number, string, number][] = [
        [naiveCalls, P.bad, 1],
        [memoCalls, P.neg, 1],
        [loopSteps, P.good, 2],
      ];
      plot.line(n, 0, n, 14, alpha(P.ink, 0.35), 1.2, [4, 4]);
      for (const [f, col, from] of series) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = from; k <= FIB_MAX; k++) {
          const v = Math.log10(Math.max(1, f(k)));
          if (k === from) ctx.moveTo(plot.X(k), plot.Y(v));
          else ctx.lineTo(plot.X(k), plot.Y(v));
        }
        ctx.stroke();
      }
      for (const [f, col] of series) {
        const v = f(n);
        if (v >= 1) plot.dot(n, Math.log10(v), 5, col, P.surface, 2);
      }
    },
    [P, n],
    { aspect: 1.9, maxHeight: 320, minHeight: 220 },
  );

  return (
    <Figure
      no={1}
      title="같은 fib(n), 세 가지 방법의 일의 양"
      hint="n을 바꿔 보세요"
      caption={<>세로축은 로그 눈금이라 눈금 한 칸이 100배입니다. 빨간 선은 단순 재귀의 호출 수, 파란 선은 메모이제이션을 한 재귀의 호출 수, 초록 선은 반복문이 도는 횟수입니다. 단순 재귀는 로그 눈금에서 직선으로 올라가는데, 이것이 지수적으로 늘어난다는 뜻입니다. 예상 시간은 1초에 함수 호출을 1억 번 한다고 가정한 값입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`호출 수 (n = ${n}): 단순 재귀 ${naive.toLocaleString('ko-KR')}번, 메모이제이션 ${memo}번, 반복문 ${loop}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="fib-n" label="n" value={n} min={1} max={FIB_MAX} step={1} onChange={setN} color="var(--c-cs-2)" />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="단순 재귀: 호출 수" value={naive.toLocaleString('ko-KR')} color="var(--bad)" />
            <Readout label="메모이제이션: 호출 수" value={memo.toLocaleString('ko-KR')} color="var(--neg)" />
            <Readout label="반복문: 반복 횟수" value={loop.toLocaleString('ko-KR')} color="var(--good)" />
            <Readout label="단순 재귀 예상 시간" value={humanTime(naive / CALLS_PER_SEC)} />
            <Readout label="이 브라우저에서 잰 시간" value={busy ? '재는 중…' : measured && measured.n === n ? `${measured.ms < 1 ? measured.ms.toFixed(2) : Math.round(measured.ms).toLocaleString('ko-KR')}ms` : '—'} />
          </div>
          <div className="btn-row">
            <Button small onClick={measure} disabled={busy || n > MEASURE_MAX}>
              {n > MEASURE_MAX ? `실측 가능: n ≤ ${MEASURE_MAX}` : `fib(${n}) 직접 재 보기`}
            </Button>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '단순 재귀 (호출)', shape: 'ln' },
          { color: 'var(--neg)', label: '메모이제이션 (호출)', shape: 'ln' },
          { color: 'var(--good)', label: '반복문 (반복)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: edit distance table ─────────────── */

const WORD_MAX = 10;
const EDIT_PRESETS = [
  { value: 'kitten', label: 'kitten', a: 'kitten', b: 'sitting' },
  { value: 'sunday', label: 'sunday', a: 'sunday', b: 'saturday' },
  { value: 'seolgeoji', label: '설겆이', a: '설겆이', b: '설거지' },
];
const clip = (s: string) => chars(s).slice(0, WORD_MAX).join('');

function EditDistanceFigure() {
  const P = usePalette();
  const [a, setA] = useState(EDIT_PRESETS[0].a);
  const [b, setB] = useState(EDIT_PRESETS[0].b);
  const t = useMemo(() => editTable(a, b), [a, b]);
  const path = useMemo(() => editPath(t), [t]);
  const frames = useMemo(() => editFrames(t), [t]);
  const s = useStepper(frames.length, 3, `${a}|${b}`);
  const f = frames[s.i];
  const m = t.a.length;
  const n = t.b.length;
  const preset = EDIT_PRESETS.find((p) => p.a === a && p.b === b)?.value ?? 'custom';
  const shownPath = path.cells.slice(path.cells.length - f.path);
  const done = f.path === path.cells.length;
  const dist = t.d[m][n];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cols = n + 2;
      const rows = m + 2;
      const cell = Math.min(46, Math.floor(w / cols), Math.floor(h / rows));
      const ox = Math.floor((w - cell * cols) / 2);
      const oy = Math.floor((h - cell * rows) / 2);
      const X = (j: number) => ox + (j + 1) * cell; // dp column j → screen
      const Y = (i: number) => oy + (i + 1) * cell;
      const order = (i: number, j: number) => (i - 1) * n + (j - 1);
      const visible = (i: number, j: number) => i === 0 || j === 0 || order(i, j) < f.filled;
      const onPath = new Set(shownPath.map(([i, j]) => `${i},${j}`));
      const cur = f.cur;
      const nb = cur ? { diag: [cur[0] - 1, cur[1] - 1], up: [cur[0] - 1, cur[1]], left: [cur[0], cur[1] - 1] } : null;
      const mv = cur ? t.move[cur[0]][cur[1]] : null;
      const chosen = !nb || !mv ? null : mv === 'del' ? nb.up : mv === 'ins' ? nb.left : nb.diag;
      const isNb = (i: number, j: number) => !!nb && [nb.diag, nb.up, nb.left].some(([p, q]) => p === i && q === j);

      // headers
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(cell * 0.4)}px ${P.fontMono}`;
      for (let j = 0; j <= n; j++) {
        const hot = cur && cur[1] === j;
        ctx.fillStyle = hot ? P.accent : j === 0 ? P.ink3 : P.ink;
        ctx.fillText(j === 0 ? 'ε' : t.b[j - 1] === ' ' ? '␣' : t.b[j - 1], X(j) + cell / 2, oy + cell / 2 + 1);
      }
      for (let i = 0; i <= m; i++) {
        const hot = cur && cur[0] === i;
        ctx.fillStyle = hot ? P.accent : i === 0 ? P.ink3 : P.ink;
        ctx.fillText(i === 0 ? 'ε' : t.a[i - 1] === ' ' ? '␣' : t.a[i - 1], ox + cell / 2, Y(i) + cell / 2 + 1);
      }

      // cells: fills first, then the lines, then the numbers on top so the path never hides a value
      for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= n; j++) {
          const isCur = !!cur && cur[0] === i && cur[1] === j;
          let fill = i === 0 || j === 0 ? P.surface2 : P.surface;
          if (onPath.has(`${i},${j}`)) fill = alpha(P.pos, 0.3);
          if (isNb(i, j)) fill = chosen && chosen[0] === i && chosen[1] === j ? alpha(P.neg, 0.45) : alpha(P.neg, 0.16);
          if (isCur) fill = P.hl;
          ctx.fillStyle = fill;
          ctx.fillRect(X(j), Y(i), cell, cell);
          ctx.strokeStyle = P.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(X(j) + 0.5, Y(i) + 0.5, cell - 1, cell - 1);
        }
      }

      // the trace-back path, with a frame around every cell where an edit happens
      if (shownPath.length > 1) {
        ctx.strokeStyle = alpha(P.pos, 0.75);
        ctx.lineWidth = Math.max(2, cell * 0.07);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        shownPath.forEach(([i, j], k) => {
          const px = X(j) + cell / 2;
          const py = Y(i) + cell / 2;
          if (k) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      for (const [i, j] of shownPath) {
        const op = path.ops.find((o) => o.i === i && o.j === j);
        if (op && op.move !== 'same') {
          ctx.strokeStyle = P.pos;
          ctx.lineWidth = 2;
          ctx.strokeRect(X(j) + 2, Y(i) + 2, cell - 4, cell - 4);
        }
      }

      // arrow from the chosen neighbour into the current cell
      if (cur && chosen) {
        const fx = X(chosen[1]) + cell / 2;
        const fy = Y(chosen[0]) + cell / 2;
        const tx = X(cur[1]) + cell / 2;
        const ty = Y(cur[0]) + cell / 2;
        const k = 0.3;
        drawArrow(ctx, fx + (tx - fx) * k, fy + (ty - fy) * k, tx - (tx - fx) * k, ty - (ty - fy) * k, P.neg, 2, Math.max(5, cell * 0.16));
      }

      // numbers
      for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= n; j++) {
          const isCur = !!cur && cur[0] === i && cur[1] === j;
          if (!visible(i, j) && !isCur) continue;
          const tx = X(j) + cell / 2;
          const ty = Y(i) + cell / 2 + 1;
          const txt = String(t.d[i][j]);
          ctx.font = `${isCur ? 700 : 500} ${Math.round(cell * 0.4)}px ${P.fontMono}`;
          if (onPath.has(`${i},${j}`) && !isCur) {
            // a soft halo keeps the digit legible where the path line crosses it
            ctx.lineWidth = 3;
            ctx.strokeStyle = alpha(P.surface, 0.85);
            ctx.strokeText(txt, tx, ty);
          }
          ctx.fillStyle = isCur ? '#1a1a1a' : P.ink;
          ctx.fillText(txt, tx, ty);
        }
      }
    },
    [P, t, f, path],
    { aspect: (n + 2) / (m + 2), maxHeight: 440, minHeight: 120 },
  );

  const changes = path.ops.filter((o) => o.move !== 'same');

  return (
    <Figure
      no={2}
      title="편집 거리 표 채우기"
      hint="재생하거나 단어를 직접 입력해 보세요"
      caption={<>행은 원래 단어, 열은 바꿀 단어의 글자이고 ε는 빈 문자열입니다. 칸 (i, j)에는 원래 단어의 앞 i글자를 바꿀 단어의 앞 j글자로 바꾸는 최소 횟수가 들어갑니다. 노란 칸을 채울 때 보는 이웃은 파란 세 칸뿐입니다. 대각선 위 칸은 교체(글자가 같으면 공짜), 바로 위 칸은 삭제, 바로 왼쪽 칸은 삽입이고 진한 파란 칸이 최솟값을 준 이웃입니다. 표가 다 차면 주황 선으로 답을 거꾸로 따라가고, 테두리를 친 칸에서 편집이 일어납니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`편집 거리 표: ${a} → ${b}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="opt-note" aria-live="polite">
            {f.note}
          </div>
          <div className="opt-chips">
            <span className="lbl">편집 순서</span>
            {done ? (
              changes.length ? (
                changes.map((o, k) => (
                  <span key={k} className="opt-chip" data-kind="change">
                    {o.text}
                  </span>
                ))
              ) : (
                <span className="opt-chip" data-kind="same">
                  두 단어가 같음
                </span>
              )
            ) : (
              <span className="ds-empty">표를 다 채우고 거꾸로 따라가면 나옵니다</span>
            )}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="예시"
            value={preset}
            onChange={(v) => {
              const p = EDIT_PRESETS.find((x) => x.value === v);
              if (p) {
                setA(p.a);
                setB(p.b);
              }
            }}
            options={EDIT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <div className="opt-inputs">
            <div className="ctl">
              <label className="ctl-label" htmlFor="ed-a">
                <span>원래 단어</span>
              </label>
              <input id="ed-a" className="text-input mono" type="text" value={a} spellCheck={false} autoComplete="off" onChange={(e) => setA(clip(e.target.value))} />
            </div>
            <div className="ctl">
              <label className="ctl-label" htmlFor="ed-b">
                <span>바꿀 단어</span>
              </label>
              <input id="ed-b" className="text-input mono" type="text" value={b} spellCheck={false} autoComplete="off" onChange={(e) => setB(clip(e.target.value))} />
            </div>
          </div>
          <StepControls s={s} id="ed-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="채운 칸" value={`${f.filled + m + n + 1} / ${(m + 1) * (n + 1)}`} />
            <Readout label="편집 거리" value={f.path > 0 ? String(dist) : '—'} color="var(--pos)" />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '채우는 칸', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--neg) 45%, transparent)', label: '최솟값을 준 이웃', shape: 'sq' },
          { color: 'var(--pos)', label: '거꾸로 따라간 길', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: minimum number of coins ─────────────── */

const COIN_SETS: { value: string; label: string; coins: number[] }[] = [
  { value: '134', label: '1·3·4', coins: [1, 3, 4] },
  { value: '1710', label: '1·7·10', coins: [1, 7, 10] },
  { value: '25', label: '2·5', coins: [2, 5] },
  { value: '151025', label: '1·5·10·25', coins: [1, 5, 10, 25] },
];
const AMOUNT_MAX = 40;

function CoinDPFigure() {
  const [setId, setSetId] = useState(COIN_SETS[0].value);
  const [amount, setAmount] = useState(6);
  const coins = COIN_SETS.find((c) => c.value === setId)!.coins;
  const frames = useMemo(() => coinFrames(coins, amount), [coins, amount]);
  const table = useMemo(() => minCoinsTable(coins, amount), [coins, amount]);
  const s = useStepper(frames.length, 3, `${setId}|${amount}`);
  const f = frames[s.i];
  const greedy = greedyCoins(coins, amount);
  const best = table.dp[amount];
  const done = s.i === frames.length - 1;
  const work = frames.slice(0, s.i + 1).reduce((acc, fr) => acc + fr.cands.length, 0);
  const bestFrom = f.cands.length && isFinite(table.dp[f.x]) ? f.x - table.pick[f.x] : -1;

  const role = (x: number): string | undefined => {
    if (f.chain.includes(x)) return 'chain';
    if (!f.chain.length && x === f.x && f.x > 0) return 'cur';
    if (x === bestFrom) return 'best';
    if (f.cands.some((c) => c.from === x)) return 'cand';
    return undefined;
  };

  return (
    <Figure
      no={3}
      title="최소 동전 개수 표 채우기"
      hint="동전 종류와 금액을 바꿔 보세요"
      caption={<>칸 x에는 x원을 만드는 최소 동전 개수 dp[x]가 들어갑니다. 노란 칸을 채울 때는 동전마다 "그 동전을 마지막에 하나 낸다면" 남는 금액의 칸(파란 칸, 모서리 숫자가 그 동전)을 보고 가장 작은 값에 1을 더합니다. 칸 아래의 +c는 최솟값을 준 동전입니다. 표가 다 차면 이 동전을 따라 거꾸로 내려가 실제로 낼 동전을 복원합니다(주황 칸). ∞는 만들 수 없는 금액입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="coin-grid" role="img" aria-label={`최소 동전 개수 표 (동전 ${coins.join(', ')} · 금액 0~${amount})`}>
            {Array.from({ length: amount + 1 }, (_, x) => {
              const filled = x <= f.x;
              const v = table.dp[x];
              const cand = f.cands.find((c) => c.from === x);
              return (
                <div key={x} className="coin-cell" data-role={role(x)} data-empty={!filled || undefined}>
                  {cand && !f.chain.length && <span className="tag">{cand.coin}</span>}
                  <span className="idx">{x}</span>
                  <span className="val">{filled ? (isFinite(v) ? v : '∞') : '·'}</span>
                  <span className="via">{filled && x > 0 && isFinite(v) ? `+${table.pick[x]}` : ''}</span>
                </div>
              );
            })}
          </div>
          <div className="opt-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <div className="seg-tight">
            <Seg label="동전 종류" value={setId} onChange={setSetId} options={COIN_SETS.map((c) => ({ value: c.value, label: c.label }))} />
          </div>
          <Slider id="cd-amount" label="금액" value={amount} min={1} max={AMOUNT_MAX} step={1} onChange={setAmount} color="var(--c-cs-2)" />
          <StepControls s={s} id="cd-speed" maxSpeed={20} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="최소 동전 수" value={done ? (isFinite(best) ? `${best}개` : '불가능') : '—'} color="var(--pos)" />
            <Readout label="살펴본 후보" value={`${work}번`} />
            <Readout label="큰 동전부터 고르면" value={greedy.left ? '실패' : `${greedy.coins.length}개`} color={done && (greedy.left > 0 ? isFinite(best) : greedy.coins.length > best) ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '채우는 칸', shape: 'sq' },
          { color: 'var(--neg-soft)', label: '살펴보는 칸', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--neg) 40%, var(--surface))', label: '최솟값을 준 칸', shape: 'sq' },
          { color: 'var(--pos)', label: '답 복원', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function DynamicProgramming() {
  return (
    <>
      <h2>같은 계산을 또 하고 있다</h2>
      <p>
        <a href="#cs-algorithm-design/recursion">재귀 장</a>에서 피보나치 수를 정의 그대로 옮긴 함수의 호출 트리를 그려 보았습니다. 트리 곳곳에 <code>fib(3)</code>, <code>fib(2)</code> 같은 같은 호출이 몇 번이고 다시 나왔습니다. 그 낭비가 얼마나 큰지 세어 보겠습니다.
      </p>
      <Code label="정의를 그대로 옮긴 피보나치">{`
function fib(n) {
  if (n < 2) return n;          // 기저: fib(0) = 0, fib(1) = 1
  return fib(n - 1) + fib(n - 2);
}`}</Code>
      <p>
        <code>fib(n)</code>을 부르면 자기 자신까지 합쳐 정확히 <M>{'2F(n+1) - 1'}</M>번의 호출이 일어납니다(<M>{'F(n)'}</M>은 n번째 피보나치 수). 피보나치 수는 한 칸마다 약 1.618배씩 커지므로 호출 수도 n이 1 늘 때마다 1.618배가 됩니다. <code>fib(40)</code>은 331,160,281번, 3억 번이 넘게 호출됩니다. 그런데 서로 다른 부분 문제는 <code>fib(0)</code>부터 <code>fib(40)</code>까지 41개뿐입니다. 나머지는 모두 이미 푼 문제를 다시 푸는 것입니다.
      </p>
      <p>
        이처럼 같은 부분 문제가 여러 번 나오는 성질을 <T en="overlapping subproblems">겹치는 부분 문제</T>라고 합니다. 해결책은 간단합니다. 한 번 푼 답은 적어 두고, 다음에 같은 문제를 만나면 적어 둔 답을 꺼내 쓰는 것입니다. 이것이 <T en="dynamic programming">동적 계획법</T>(DP)의 전부입니다. 이름은 거창하지만 "표에 적어 두기"라고 생각하면 됩니다.
      </p>

      <h2>메모이제이션: 위에서 아래로</h2>
      <p>
        재귀 함수는 그대로 두고, 답을 돌려주기 직전에 저장소에 적어 두는 방법을 <T en="memoization">메모이제이션</T>이라고 합니다. 저장소는 <a href="#cs-algorithms/search-hash">해시 테이블</a>인 <code>Map</code>이면 충분합니다.
      </p>
      <Code label="메모이제이션을 한 피보나치">{`
const memo = new Map();

function fib(n) {
  if (n < 2) return n;
  if (memo.has(n)) return memo.get(n);   // 이미 푼 문제면 바로 답한다
  const v = fib(n - 1) + fib(n - 2);
  memo.set(n, v);                         // 처음 푼 답은 적어 둔다
  return v;
}`}</Code>
      <p>
        이제 <code>fib(k)</code>는 k마다 한 번만 실제로 계산되고, 그다음부터는 저장소에서 바로 답이 나옵니다. 호출 수는 <M>{'2n - 1'}</M>번으로 줄어듭니다. 지수에서 선형으로 바뀐 것입니다. 그림 1에서 n을 키워 가며 두 선이 얼마나 벌어지는지 보세요.
      </p>
      <FibCountFigure />
      <p>
        n = 40에서 단순 재귀는 3억 3천만 번을 호출하지만 메모이제이션을 하면 79번이면 됩니다. 이 글을 쓰며 Node.js에서 재 보니 단순 재귀 <code>fib(40)</code>은 1초 남짓 걸렸고, n이 하나 늘 때마다 시간이 1.6배 안팎으로 늘었습니다. 이대로라면 n = 50은 몇 분, n = 60은 몇 시간이 걸립니다.
      </p>

      <h2>타뷸레이션: 아래에서 위로</h2>
      <p>
        메모이제이션은 큰 문제에서 출발해 필요한 작은 문제를 부르며 내려갑니다. 반대로 가장 작은 문제부터 차례로 표를 채워 올라갈 수도 있습니다. 이것을 <T en="tabulation">타뷸레이션</T> 또는 상향식(bottom-up) DP라고 합니다. <code>fib(i)</code>를 계산할 때 필요한 <code>fib(i-1)</code>과 <code>fib(i-2)</code>는 이미 표에 있으므로 재귀가 필요 없습니다.
      </p>
      <Code label="표를 아래에서부터 채우는 피보나치">{`
function fib(n) {
  const table = [0, 1];
  for (let i = 2; i <= n; i++) {
    table[i] = table[i - 1] + table[i - 2];
  }
  return table[n];
}`}</Code>
      <p>잘 보면 표 전체가 필요한 게 아니라 바로 앞의 두 칸만 있으면 됩니다. 그래서 변수 두 개로 줄일 수 있고, 메모리는 O(1)이 됩니다.</p>
      <Code label="변수 두 개로 줄인 피보나치">{`
function fib(n) {
  let prev = 0, cur = 1;          // fib(0), fib(1)
  for (let i = 2; i <= n; i++) {
    [prev, cur] = [cur, prev + cur];
  }
  return n === 0 ? 0 : cur;
}`}</Code>
      <p>두 방식은 같은 표를 채우는데, 채우는 순서와 방법이 다릅니다.</p>
      <ul>
        <li>
          <strong>메모이제이션</strong>은 원래 재귀 코드에 몇 줄만 더하면 되고, 실제로 필요한 부분 문제만 계산합니다. 대신 재귀가 깊어지면 호출 스택이 넘칩니다. Node.js에서 위의 메모이제이션 <code>fib(10000)</code>을 처음 부르면 <code>RangeError: Maximum call stack size exceeded</code>가 납니다.
        </li>
        <li>
          <strong>타뷸레이션</strong>은 계산 순서를 직접 정해야 하지만, 반복문이라 스택 걱정이 없고 함수 호출 비용도 없습니다. 위의 피보나치처럼 지나간 칸을 버려 메모리를 줄이는 것도 이쪽에서 쉽습니다.
        </li>
      </ul>

      <h2>DP를 설계하는 네 단계</h2>
      <p>피보나치는 점화식이 처음부터 주어졌습니다. 새로운 문제를 DP로 풀 때는 보통 다음 순서로 생각합니다.</p>
      <ol>
        <li>
          <strong>상태 정의</strong>: 표의 칸 하나가 무엇을 뜻하는지 한 문장으로 정합니다. "dp[x] = x원을 만드는 최소 동전 개수"처럼요. 가장 어렵고 가장 중요한 단계입니다.
        </li>
        <li>
          <strong>점화식</strong>: 한 칸의 값을 더 작은 칸들로 나타냅니다. 보통 "마지막에 무엇을 했나"의 모든 경우를 따져 가장 좋은 것을 고릅니다.
        </li>
        <li>
          <strong>기저</strong>: 더 쪼갤 수 없는 가장 작은 칸의 값을 직접 정합니다.
        </li>
        <li>
          <strong>계산 순서</strong>: 어떤 칸을 계산할 때 필요한 칸이 이미 채워져 있도록 순서를 정합니다. 메모이제이션을 쓰면 재귀가 이 순서를 알아서 맞춰 줍니다.
        </li>
      </ol>
      <p>
        최솟값뿐 아니라 그 답을 만드는 방법까지 알고 싶다면 칸마다 "어느 경우가 최선이었나"를 함께 적어 두고, 마지막 칸에서부터 거꾸로 따라가면 됩니다. 이것을 <T en="reconstruction">답 복원</T>이라고 합니다.
      </p>
      <Callout kind="note" label="복잡도 읽기">
        DP의 시간 복잡도는 <strong>(상태의 수) × (상태 하나를 계산하는 데 드는 일)</strong>입니다. 피보나치는 상태 n개에 칸마다 덧셈 한 번이므로 O(n)입니다. 아래의 편집 거리는 상태 <M>{'(m+1)(n+1)'}</M>개에 칸마다 세 이웃을 보므로 <M>{'O(mn)'}</M>, 거스름돈은 상태 (금액 + 1)개에 칸마다 동전 k종류를 보므로 O(금액 × k)입니다.
      </Callout>

      <h2>편집 거리: 두 문자열은 얼마나 다른가</h2>
      <p>
        한 문자열을 다른 문자열로 바꿀 때, 한 번에 글자 하나를 <strong>삽입</strong>하거나 <strong>삭제</strong>하거나 <strong>교체</strong>할 수 있다고 합시다. 필요한 최소 횟수를 <T en="edit distance, Levenshtein distance">편집 거리</T>(레벤슈타인 거리)라고 합니다. kitten을 sitting으로 바꾸려면 k를 s로, e를 i로 바꾸고 끝에 g를 넣으면 되므로 편집 거리는 3입니다.
      </p>
      <p>
        네 단계를 따라가 봅시다. 원래 단어를 a(길이 m), 바꿀 단어를 b(길이 n)라고 하면 상태는 "d[i][j] = a의 앞 i글자를 b의 앞 j글자로 바꾸는 최소 횟수"입니다. 마지막 글자에서 할 수 있는 일은 세 가지뿐입니다. a의 i번째 글자를 지우거나, b의 j번째 글자를 끝에 넣거나, a의 i번째 글자를 b의 j번째 글자로 바꾸는 것(같으면 공짜)입니다.
      </p>
      <MB note="기저: 빈 문자열과의 거리는 상대의 길이입니다. d[i][0] = i, d[0][j] = j.">{'d[i][j] = \\min\\begin{cases} d[i-1][j] + 1 & \\text{삭제} \\\\ d[i][j-1] + 1 & \\text{삽입} \\\\ d[i-1][j-1] + [\\,a_i \\ne b_j\\,] & \\text{교체 또는 일치} \\end{cases}'}</MB>
      <p>칸 (i, j)는 위쪽과 왼쪽 칸만 쓰므로, 표를 한 줄씩 왼쪽에서 오른쪽으로 채우면 됩니다.</p>
      <EditDistanceFigure />
      <Code label="편집 거리">{`
function editDistance(a, b) {
  const m = a.length, n = b.length;
  // d[i][j]: a의 앞 i글자 → b의 앞 j글자
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;   // 모두 삭제
  for (let j = 0; j <= n; j++) d[0][j] = j;   // 모두 삽입
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,          // 삭제
        d[i][j - 1] + 1,          // 삽입
        d[i - 1][j - 1] + cost,   // 교체 또는 일치
      );
    }
  }
  return d[m][n];
}`}</Code>
      <p>
        편집 거리는 생각보다 가까이 있습니다. 맞춤법 검사기는 사전에 없는 단어를 만나면 편집 거리가 작은 단어를 후보로 내놓고, 검색창의 "이것을 찾으셨나요?"도 같은 아이디어를 씁니다. 사촌 격인 <T en="longest common subsequence">최장 공통 부분 수열</T>(LCS)은 교체 없이 삽입과 삭제만 허용한 문제로, <code>git diff</code>가 두 파일에서 바뀐 줄을 찾는 바탕입니다. 생물정보학에서 DNA 염기 서열을 비교할 때도 같은 표를 채웁니다.
      </p>
      <Callout kind="note">
        <code>a[i - 1]</code>은 UTF-16 코드 단위 하나라서, 한글 음절처럼 기본 다국어 평면에 있는 글자는 문제없지만 이모지처럼 두 단위로 된 글자는 둘로 쪼개집니다. 그림 2는 <code>Array.from(word)</code>로 먼저 글자 단위로 나눈 뒤 비교합니다.
      </Callout>

      <h2>거스름돈: 최소 동전 개수</h2>
      <p>
        동전 종류가 주어졌을 때 금액을 만드는 최소 동전 개수를 구해 봅시다. 가장 먼저 떠오르는 방법은 "큰 동전부터 최대한 많이 내기"입니다. 한국 동전에서는 이 방법이 언제나 맞지만, 동전이 1, 3, 4원이면 6원에서 4 + 1 + 1로 3개를 냅니다. 정답은 3 + 3, 2개입니다. 당장 좋아 보이는 선택이 전체로는 손해일 수 있다는 것이고, 이 이야기는 <a href="#cs-algorithm-design/greedy">다음 장의 탐욕 알고리즘</a>에서 이어집니다.
      </p>
      <p>
        DP는 모든 가능성을 빠짐없이, 하지만 중복 없이 따집니다. 상태는 "dp[x] = x원을 만드는 최소 동전 개수"입니다. x원을 만드는 방법에서 마지막에 낸 동전을 c라고 하면, 그 앞에서는 x − c원을 최소 개수로 만들었어야 합니다. 마지막 동전이 무엇이었는지 모르니 모든 동전을 따져 봅니다.
      </p>
      <MB note="기저: dp[0] = 0. 어떤 동전으로도 만들 수 없는 금액은 ∞로 둡니다.">{'dp[x] = \\min_{c \\,\\le\\, x} \\big( dp[x - c] + 1 \\big)'}</MB>
      <CoinDPFigure />
      <p>
        1·3·4 동전에서 6원 칸을 채울 때를 보세요. 동전 1을 마지막에 내면 dp[5] + 1 = 3, 동전 3이면 dp[3] + 1 = 2, 동전 4면 dp[2] + 1 = 3이므로 2를 고릅니다. 큰 동전부터 내는 방법은 4원을 먼저 집는 순간 2원이 남아 1원 두 개를 더 낼 수밖에 없지만, DP는 마지막 동전이 3인 경우까지 함께 따지므로 이런 함정에 빠지지 않습니다. 2·5 동전으로 바꾸면 1원과 3원처럼 아예 만들 수 없는 금액(∞)도 보입니다.
      </p>
      <Code label="최소 동전 개수와 답 복원">{`
function minCoins(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  const pick = new Array(amount + 1).fill(0);  // 최솟값을 준 동전
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of coins) {
      if (c <= x && dp[x - c] + 1 < dp[x]) {
        dp[x] = dp[x - c] + 1;
        pick[x] = c;
      }
    }
  }
  if (dp[amount] === Infinity) return null;   // 만들 수 없음
  const used = [];
  for (let x = amount; x > 0; x -= pick[x]) used.push(pick[x]);
  return used;
}`}</Code>

      <h2>배낭 꾸리기</h2>
      <p>
        <T en="0/1 knapsack">0/1 배낭 문제</T>도 같은 틀로 풉니다. 무게 한도가 W인 배낭에 물건을 골라 담아 가치의 합을 최대로 만드는 문제입니다. 물건은 통째로 넣거나 빼야 하고 쪼갤 수 없습니다. 상태를 "dp[w] = 지금까지 살펴본 물건으로 무게 w 안에서 얻는 최대 가치"로 두고, 물건을 하나씩 보며 "이 물건을 넣는 경우"와 "넣지 않는 경우" 중 나은 쪽을 고릅니다.
      </p>
      <Code label="0/1 배낭 (1차원 표)">{`
function knapsack(items, W) {        // items: [{ w, v }, ...]
  const dp = new Array(W + 1).fill(0);
  for (const { w, v } of items) {
    // 큰 무게부터 거꾸로 돌아야 같은 물건을 두 번 넣지 않는다
    for (let cap = W; cap >= w; cap--) {
      dp[cap] = Math.max(dp[cap], dp[cap - w] + v);
    }
  }
  return dp[W];
}`}</Code>
      <p>
        예를 들어 (무게, 가치)가 (1, 1), (3, 4), (4, 5), (5, 7)인 물건 넷을 한도 7에 담는다면 답은 (3, 4)와 (4, 5)를 넣은 가치 9입니다. 무게당 가치가 가장 높은 (5, 7)부터 담는 방법은 (5, 7)과 (1, 1)을 담고 가치 8에서 멈춥니다. 상태는 W + 1개이고 물건마다 모두 한 번씩 갱신하므로 O(물건 수 × W)입니다.
      </p>

      <Callout kind="key">
        같은 부분 문제가 반복해서 나오면 답을 표에 적어 두어 한 번씩만 계산합니다. 재귀에 저장소를 붙이면 메모이제이션, 작은 문제부터 반복문으로 채우면 타뷸레이션입니다. 설계는 상태 정의 → 점화식 → 기저 → 계산 순서로 하고, 답을 만드는 방법은 칸마다 선택을 적어 두었다가 거꾸로 따라가 복원합니다. 시간은 상태 수 × 상태당 계산입니다.
      </Callout>
      <Quiz
        q="격자의 왼쪽 위 칸에서 오른쪽 아래 칸까지 오른쪽이나 아래로 한 칸씩만 움직여 가는 경로의 수를 세려 한다. dp[i][j]를 '(i, j) 칸까지 가는 경로의 수'로 정하면 점화식은?"
        options={['dp[i][j] = dp[i-1][j] + dp[i][j-1]', 'dp[i][j] = max(dp[i-1][j], dp[i][j-1]) + 1', 'dp[i][j] = dp[i-1][j-1] + 1', 'dp[i][j] = dp[i-1][j] × dp[i][j-1]']}
        answer={0}
        explain={<>(i, j) 칸에 들어오는 마지막 한 걸음은 위 칸에서 내려오거나 왼쪽 칸에서 오는 것 두 가지뿐이고, 두 경우는 겹치지 않습니다. 그래서 두 칸의 경로 수를 더합니다. 기저는 첫 행과 첫 열이 모두 1(한 방향으로만 가는 길 하나)이고, 한 줄씩 채우면 칸마다 덧셈 한 번이므로 m × n 격자에서 O(mn)입니다. 경우의 수를 셀 때는 더하고, 최솟값을 구할 때는 min을 고른다는 차이만 있을 뿐 표를 채우는 틀은 같습니다.</>}
      />
    </>
  );
}
