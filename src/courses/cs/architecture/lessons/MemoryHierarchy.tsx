import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { courseHref, lessonHref } from '../../../index';
import { StepControls, humanTime, useStepper } from '../../shared';
import { COLS, ELEM, LINE, PER_LINE, ROWS, TIERS, TOTAL_LINES, simulateCache, type Order } from './cache';
import '../../algorithms/lessons/algorithms.css';
import './arch.css';

/* ─────────────── Figure 1: the latency ladder ─────────────── */

const LOG_MIN = -1; // 0.1 ns
const LOG_MAX = 9; // 1 s

function fmtNs(ns: number) {
  if (ns < 1000) return `${ns}ns`;
  if (ns < 1e6) return `${+(ns / 1000).toFixed(1)}µs`;
  if (ns < 1e9) return `${+(ns / 1e6).toFixed(1)}ms`;
  return `${+(ns / 1e9).toFixed(1)}s`;
}
/** "if 1 ns were 1 second" */
function fmtHuman(ns: number) {
  return ns < 60 ? `${ns}초` : humanTime(ns);
}

function LadderFigure() {
  const [scale, setScale] = useState<'real' | 'human'>('real');
  const [pick, setPick] = useState(4);
  const t = TIERS[pick];
  return (
    <Figure
      no={1}
      title="데이터를 가져오는 데 걸리는 시간"
      hint="눈금을 바꾸고 줄을 눌러 보세요"
      caption={<>막대 길이는 로그 눈금입니다. 눈금 한 칸이 10배이므로 막대가 한 칸 길어질 때마다 10배 느립니다. 수치는 흔히 인용되는 대략적인 자릿수로, 기계마다 몇 배씩 다릅니다. "1ns = 1초"로 바꾸면 모든 시간을 10억 배 늘려 사람의 시간으로 보여 줍니다.</>}
    >
      <Seg
        label="눈금"
        value={scale}
        onChange={setScale}
        options={[
          { value: 'real', label: '실제 시간' },
          { value: 'human', label: '1ns를 1초로 늘리면' },
        ]}
      />
      <div className="lat-rows" role="list">
        {TIERS.map((tier, k) => {
          const pct = ((Math.log10(tier.ns) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
          return (
            <button key={tier.name} type="button" role="listitem" className="lat-row" aria-pressed={k === pick} onClick={() => setPick(k)}>
              <span className="lat-name">{tier.name}</span>
              <span className="lat-track">
                <span className="lat-bar" style={{ width: `${Math.max(1.5, pct)}%`, background: k < 4 ? 'var(--good)' : k === 4 ? 'var(--hl)' : k < 7 ? 'var(--pos)' : 'var(--bad)' }} />
              </span>
              <span className="lat-time mono">{scale === 'real' ? fmtNs(tier.ns) : fmtHuman(tier.ns)}</span>
            </button>
          );
        })}
        <div className="lat-axis" aria-hidden="true">
          {['0.1ns', '1ns', '10ns', '100ns', '1µs', '10µs', '100µs', '1ms', '10ms', '100ms', '1s'].map((s, i) =>
            i % 2 === 0 ? (
              <span key={s} style={{ left: `${(i / 10) * 100}%` }}>
                {s}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label={`${t.name}: 크기`} value={t.size} />
        <Readout label="3GHz CPU의 클록으로" value={`약 ${Math.max(1, Math.round(t.ns * 3)).toLocaleString('ko-KR')}클록`} />
        <Readout label="L1 캐시보다" value={t.ns <= 1 ? (t.ns < 1 ? `${(1 / t.ns).toFixed(0)}배 빠름` : '기준') : `${Math.round(t.ns).toLocaleString('ko-KR')}배 느림`} />
      </div>
      <div className="arch-note">{t.note}</div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a cache fed by two loop orders ─────────────── */

type Ways = 1 | 2 | 4 | 0; // 0 = fully associative
const WAY_OPTS: { value: Ways; label: string }[] = [
  { value: 1, label: '직접 사상' },
  { value: 2, label: '2-way' },
  { value: 4, label: '4-way' },
  { value: 0, label: '완전 연관' },
];
const lineName = (l: number) => `${l >> 1}행 ${l & 1 ? '뒤' : '앞'}`;

function CacheFigure() {
  const P = usePalette();
  const [order, setOrder] = useState<Order>('row');
  const [lines, setLines] = useState(8);
  const [ways, setWays] = useState<Ways>(1);
  const w = ways === 0 ? lines : ways;
  const frames = useMemo(() => simulateCache(order, lines, w), [order, lines, w]);
  const other = useMemo(() => {
    const fr = simulateCache(order === 'row' ? 'col' : 'row', lines, w);
    return fr[fr.length - 1];
  }, [order, lines, w]);
  const s = useStepper(frames.length, 12, `${order}|${lines}|${w}`);
  const f = frames[s.i];
  const end = frames[frames.length - 1];
  const cached = new Set(f.sets.flat().filter((x) => x >= 0));
  const visited = new Set(frames.slice(1, s.i + 1).map((x) => x.idx));
  const ci = Math.floor(f.idx / COLS);
  const cj = f.idx % COLS;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w: W, h: H }) => {
      const padL = 26;
      const padT = 18;
      const cs = Math.floor(Math.min((W - padL - 4) / COLS, (H - padT - 4) / ROWS));
      const x0 = padL + Math.floor((W - padL - 4 - cs * COLS) / 2);
      const y0 = padT;
      ctx.font = `10px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < COLS; j += 4) ctx.fillText(`j${j}`, x0 + j * cs + cs / 2, 8);
      ctx.textAlign = 'right';
      for (let i = 0; i < ROWS; i += 2) ctx.fillText(`i${i}`, x0 - 4, y0 + i * cs + cs / 2);
      for (let k = 0; k < ROWS * COLS; k++) {
        const i = Math.floor(k / COLS);
        const j = k % COLS;
        const x = x0 + j * cs;
        const y = y0 + i * cs;
        const line = Math.floor(k / PER_LINE);
        let fill = P.surface;
        if (cached.has(line)) fill = alpha(P.neg, P.dark ? 0.3 : 0.2);
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, cs, cs);
        if (visited.has(k)) {
          ctx.fillStyle = alpha(P.ink, 0.45);
          ctx.beginPath();
          ctx.arc(x + cs / 2, y + cs / 2, Math.max(1.2, cs * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // grid: thin cell lines, thick cache-line boundaries
      ctx.strokeStyle = alpha(P.ink3, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= COLS; j++) {
        ctx.moveTo(x0 + j * cs + 0.5, y0);
        ctx.lineTo(x0 + j * cs + 0.5, y0 + ROWS * cs);
      }
      for (let i = 0; i <= ROWS; i++) {
        ctx.moveTo(x0, y0 + i * cs + 0.5);
        ctx.lineTo(x0 + COLS * cs, y0 + i * cs + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = P.ink2;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let j = 0; j <= COLS; j += PER_LINE) {
        ctx.moveTo(x0 + j * cs + 0.5, y0);
        ctx.lineTo(x0 + j * cs + 0.5, y0 + ROWS * cs);
      }
      for (let i = 0; i <= ROWS; i++) {
        ctx.moveTo(x0, y0 + i * cs + 0.5);
        ctx.lineTo(x0 + COLS * cs, y0 + i * cs + 0.5);
      }
      ctx.stroke();
      if (f.evicted !== null) {
        const er = f.evicted >> 1;
        const ec = (f.evicted & 1) * PER_LINE;
        ctx.strokeStyle = P.bad;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x0 + ec * cs + 1, y0 + er * cs + 1, PER_LINE * cs - 2, cs - 2);
        ctx.setLineDash([]);
      }
      if (f.idx >= 0) {
        ctx.fillStyle = f.hit ? P.good : P.bad;
        ctx.fillRect(x0 + cj * cs + 1, y0 + ci * cs + 1, cs - 1, cs - 1);
      }
    },
    [P, f, s.i],
    { aspect: 1.06, maxHeight: 380, minHeight: 260 },
  );

  const missRate = f.k ? f.misses / f.k : 0;
  return (
    <Figure
      no={2}
      title="캐시 흉내 내기: 같은 배열, 다른 순서"
      hint="순서와 캐시 모양을 바꿔 재생해 보세요"
      caption={<>16 × 16 정수 배열(원소 {ELEM}바이트)을 행 우선으로 메모리에 놓았습니다. 캐시 줄은 {LINE}바이트라서 한 줄에 원소 {PER_LINE}개, 굵은 선으로 나눈 칸 하나가 캐시 줄 하나입니다. 파랗게 칠한 줄이 지금 캐시에 들어 있는 줄이고, 초록 칸은 적중, 빨간 칸은 미스, 빨간 점선은 방금 쫓겨난 줄입니다. 각 세트 안에서는 가장 오래 안 쓴 줄을 버립니다(LRU).</>}
    >
      <div className="controls row">
        <Seg label="순회 순서" value={order} onChange={setOrder} options={[{ value: 'row', label: '행 우선 a[i][j]' }, { value: 'col', label: '열 우선 a[j][i]' }]} />
        <Seg label="캐시 크기" value={lines} onChange={setLines} options={[8, 16, 32].map((v) => ({ value: v, label: `${v}줄` }))} />
        <Seg label="배치 방식" value={ways} onChange={setWays} options={WAY_OPTS} />
      </div>
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`16×16 배열을 ${order === 'row' ? '행 우선' : '열 우선'}으로 순회 중. 접근 ${f.k}번, 적중 ${f.hits}번, 미스 ${f.misses}번`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="arch-note mono" aria-live="polite" style={{ fontSize: '0.8125rem' }}>
            {f.idx < 0 ? '재생을 누르면 이중 반복문이 배열을 차례로 읽습니다.' : `a[${ci}][${cj}] → 주소 ${f.idx * ELEM} → 줄 ${f.line}(${lineName(f.line)}) → 세트 ${f.set}: ${f.hit ? '적중' : '미스'}${f.evicted !== null ? `, 줄 ${f.evicted} 퇴출` : ''}`}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="cache-speed" maxSpeed={120} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="적중" value={f.hits} color="var(--good)" />
            <Readout label="미스" value={f.misses} color="var(--bad)" />
            <Readout label="미스율" value={f.k ? `${(missRate * 100).toFixed(1)}%` : '—'} />
            <Readout label="끝까지 가면 미스" value={`${end.misses} / ${ROWS * COLS}`} />
          </div>
          <div className="arch-small">
            같은 캐시로 {order === 'row' ? '열 우선' : '행 우선'} 순회를 하면 미스 <strong>{other.misses}번</strong>입니다. 배열 전체는 {TOTAL_LINES}줄입니다.
          </div>
        </div>
      </div>
      <div className="cache-sets" data-ways={w} aria-label="캐시의 세트와 줄">
        {f.sets.map((set, k) => (
          <div key={k} className="cache-set" data-cur={k === f.set || undefined}>
            <span className="cache-set-h">세트 {k}</span>
            <div className="cache-ways">
              {set.map((l, j) => (
                <span key={j} className="cache-way" data-empty={l < 0 || undefined} data-new={(k === f.set && j === 0 && !f.hit && f.idx >= 0) || undefined} data-hit={(k === f.set && j === 0 && f.hit) || undefined}>
                  {l < 0 ? '빈칸' : `줄 ${l}`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Legend
        items={[
          { color: 'var(--neg)', label: '캐시에 있는 줄', shape: 'sq' },
          { color: 'var(--good)', label: '적중', shape: 'sq' },
          { color: 'var(--bad)', label: '미스 · 퇴출', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: measure it in this browser ─────────────── */

interface Timing {
  n: number;
  row: number;
  col: number;
}

function sumRows(a: Float64Array, n: number) {
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += a[i * n + j];
  return s;
}
function sumCols(a: Float64Array, n: number) {
  let s = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) s += a[i * n + j];
  return s;
}

function MeasureFigure() {
  const [n, setN] = useState(2048);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Timing | null>(null);
  const arr = useRef<{ n: number; a: Float64Array } | null>(null);
  const sink = useRef(0);

  const measure = () => {
    setBusy(true);
    // give the button a frame to repaint before the main thread is busy
    setTimeout(() => {
      if (!arr.current || arr.current.n !== n) arr.current = { n, a: new Float64Array(n * n).fill(1) };
      const a = arr.current.a;
      const time = (fn: (a: Float64Array, n: number) => number) => {
        let best = Infinity;
        for (let k = 0; k < 3; k++) {
          const t0 = performance.now();
          sink.current += fn(a, n);
          best = Math.min(best, performance.now() - t0);
        }
        return best;
      };
      sumRows(a, n); // warm up both functions
      sumCols(a, n);
      setRes({ n, row: time(sumRows), col: time(sumCols) });
      setBusy(false);
    }, 40);
  };

  const max = res ? Math.max(res.row, res.col) : 1;
  const mb = (n * n * 8) / 2 ** 20;
  return (
    <Figure
      no={3}
      title="이 브라우저에서 직접 재기"
      hint="배열 크기를 고르고 재 보세요"
      caption={<>n × n개의 64비트 실수(Float64Array)를 모두 더하는 시간을, 같은 반복문의 순서만 바꿔 재었습니다. 세 번씩 재서 가장 빠른 값을 보여 줍니다. 결과는 CPU, 브라우저, 다른 탭의 상태에 따라 달라지지만, 배열이 캐시보다 커지면 열 우선이 몇 배씩 느려지는 경향은 거의 모든 기계에서 나타납니다.</>}
    >
      <div className="controls row">
        <Seg label="n (배열 크기)" value={n} onChange={setN} options={[512, 1024, 2048].map((v) => ({ value: v, label: String(v) }))} />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Button primary onClick={measure} disabled={busy}>
            {busy ? '재는 중…' : '재 보기'}
          </Button>
        </div>
        <div className="ctl arch-small" style={{ flex: '1 1 160px' }}>
          원소 {(n * n).toLocaleString('ko-KR')}개 · {mb}MB
        </div>
      </div>
      <div className="growth-rows" style={{ ['--gn' as string]: '96px', ['--gt' as string]: '86px' }}>
        {(['row', 'col'] as const).map((k) => (
          <div key={k} className="growth-row">
            <span className="growth-name">{k === 'row' ? '행 우선' : '열 우선'}</span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: res ? `${Math.max(1, (res[k] / max) * 100)}%` : '0%', background: k === 'row' ? 'var(--good)' : 'var(--bad)' }} />
            </span>
            <span className="growth-time mono">{res ? `${res[k].toFixed(1)}ms` : '—'}</span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Readout label="열 우선 ÷ 행 우선" value={res ? `${(res.col / res.row).toFixed(1)}배` : '아직 재지 않음'} color="var(--bad)" />
        <Readout label="행 우선: 원소 하나당" value={res ? `${((res.row * 1e6) / (res.n * res.n)).toFixed(2)}ns` : '—'} />
        <Readout label="열 우선: 원소 하나당" value={res ? `${((res.col * 1e6) / (res.n * res.n)).toFixed(2)}ns` : '—'} />
      </div>
      {res && res.n !== n && <div className="arch-small">위 결과는 n = {res.n}에서 잰 값입니다. 다시 재 보세요.</div>}
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function MemoryHierarchy() {
  return (
    <>
      <h2>CPU는 기다린다</h2>
      <p>
        지난 장의 CPU는 명령어마다 메모리를 읽었습니다. 실제 CPU에서 덧셈 한 번은 1나노초(10억분의 1초)도 걸리지 않지만, 메인 메모리(DRAM)에서 값 하나를 가져오는 데는 약 100나노초가 걸립니다. 메모리를 기다리는 동안 CPU는 덧셈을 수백 번 할 수 있었습니다. 지난 수십 년 동안 CPU는 메모리보다 훨씬 빨리 빨라져서, 이 격차는 계속 벌어졌습니다. 이것을 <T en="memory wall">메모리 벽</T>이라고 부릅니다.
      </p>
      <LadderFigure />
      <p>
        그림 1을 "1ns를 1초로 늘리면"으로 바꿔 보세요. L1 캐시에서 읽는 일이 1초라면 메인 메모리는 1분 40초, SSD는 하루 가까이, 다른 대륙의 서버는 몇 년이 걸립니다. 그래서 컴퓨터는 빠르지만 작은 저장소를 CPU 가까이에, 크지만 느린 저장소를 멀리 두고 층층이 쌓습니다. 이것이 <T en="memory hierarchy">메모리 계층</T>입니다.
      </p>
      <ul>
        <li>
          <strong>레지스터</strong>: CPU 안의 플립플롭. 수십 개뿐이지만 한 클록 안에 읽습니다.
        </li>
        <li>
          <strong>캐시 (L1, L2, L3)</strong>: CPU 칩 안의 SRAM. 아래층일수록 크고 느립니다.
        </li>
        <li>
          <strong>메인 메모리</strong>: CPU 칩 바깥의 DRAM. 수십 GB이고, 전원이 꺼지면 사라집니다.
        </li>
        <li>
          <strong>저장 장치</strong>: SSD와 HDD. 전원이 꺼져도 남지만 메모리보다 수백 배에서 수만 배 느립니다.
        </li>
      </ul>
      <Callout kind="intuition">
        책상, 책장, 도서관, 창고를 떠올려 보세요. 지금 읽는 책은 책상(레지스터) 위에, 자주 보는 책은 손 닿는 책장(캐시)에, 나머지는 도서관(메모리)에 둡니다. 도서관에 다녀올 때는 한 권만 가져오지 않고 옆 칸의 책까지 한 아름 가져옵니다. 캐시가 하는 일이 정확히 이것입니다.
      </Callout>

      <h2>지역성과 캐시 줄</h2>
      <p>
        작은 캐시가 쓸모 있는 것은 프로그램이 메모리를 고르게 쓰지 않기 때문입니다. 이 성질을 <T en="locality">지역성</T>이라고 합니다.
      </p>
      <ul>
        <li>
          <T en="temporal locality">시간 지역성</T>: 방금 쓴 데이터는 곧 다시 씁니다. 반복문의 변수 <code>i</code>와 <code>sum</code>이 그렇습니다.
        </li>
        <li>
          <T en="spatial locality">공간 지역성</T>: 방금 쓴 데이터의 이웃도 곧 씁니다. 배열을 앞에서부터 차례로 읽는 코드가 그렇습니다.
        </li>
      </ul>
      <p>
        공간 지역성을 살리려고 캐시는 바이트 하나가 아니라 <T en="cache line">캐시 줄</T> 단위로 메모리를 가져옵니다. 오늘날 대부분의 CPU에서 한 줄은 64바이트입니다. <code>a[0]</code>을 읽느라 미스가 나면 <code>a[0]</code>부터 <code>a[15]</code>(4바이트 정수 16개)가 한꺼번에 캐시에 들어오고, 그다음 15번은 적중입니다.
      </p>

      <h2>캐시는 줄을 어디에 둘까</h2>
      <p>
        캐시는 메모리보다 훨씬 작으므로, 메모리의 어느 줄을 캐시의 어느 칸에 둘지 정하는 규칙이 필요합니다. 캐시는 그 규칙에 따라 칸 몇 개만 확인하고 적중인지 판단해야 합니다. 1나노초 안에 캐시 전체를 뒤질 수는 없기 때문입니다.
      </p>
      <ul>
        <li>
          <T en="direct-mapped">직접 사상</T>: 메모리의 줄 번호를 캐시 칸 수로 나눈 나머지 자리에만 둡니다. 확인할 칸이 하나뿐이라 빠르지만, 나머지가 같은 두 줄을 번갈아 쓰면 서로를 계속 쫓아냅니다.
        </li>
        <li>
          <T en="set-associative">집합 연관</T>: 캐시 칸을 몇 개씩 묶어 <T en="set">세트</T>로 만들고, 줄 번호를 세트 수로 나눈 나머지 세트 안의 아무 칸에나 둡니다. 4-way라면 한 세트에 4칸입니다. 세트가 가득 차면 그 안에서 가장 오래 안 쓴 줄을 버립니다. 실제 CPU의 L1 캐시는 대개 8~12-way입니다.
        </li>
        <li>
          <T en="fully associative">완전 연관</T>: 아무 칸에나 둡니다. 낭비가 없지만 모든 칸을 동시에 비교하는 회로가 커서 아주 작은 캐시에만 씁니다.
        </li>
      </ul>
      <MB note="같은 세트로 가는 줄들은 '태그'(줄 번호를 세트 수로 나눈 몫)로 구별합니다.">{'\\text{줄 번호} = \\left\\lfloor \\frac{\\text{주소}}{\\text{줄 크기}} \\right\\rfloor, \\qquad \\text{세트} = \\text{줄 번호} \\bmod \\text{세트 수}'}</MB>
      <p>
        세트 안에서 무엇을 버릴지는 <a href={lessonHref('cs-system-algorithms', 'lru-cache')}>LRU 캐시</a>에서 본 교체 정책 문제와 같습니다. 다만 하드웨어는 몇 나노초 안에 골라야 하므로 비트 몇 개로 LRU를 흉내 내는 간단한 방법을 씁니다.
      </p>

      <h2>반복 순서 하나로 달라지는 미스</h2>
      <p>
        2차원 배열은 메모리에 한 줄로 펴서 저장됩니다. C와 JavaScript의 typed array를 직접 펴서 쓰는 코드는 대개 <T en="row-major">행 우선</T>, 즉 0행 전체, 1행 전체, … 순서로 놓습니다. 그러면 <code>a[i][j]</code> 바로 옆 메모리에는 <code>a[i][j+1]</code>이 있고, <code>a[i+1][j]</code>는 한 행만큼(이 그림에서는 64바이트) 떨어져 있습니다. 이 배열을 두 순서로 읽어 보겠습니다.
      </p>
      <Code label="같은 합, 다른 순서">{`
const n = 2048;
const a = new Float64Array(n * n);     // a[i][j]는 a[i * n + j]

// 행 우선: 안쪽 반복문이 j를 움직인다 → 메모리를 차례로 읽는다
let s1 = 0;
for (let i = 0; i < n; i++)
  for (let j = 0; j < n; j++) s1 += a[i * n + j];

// 열 우선: 안쪽 반복문이 i를 움직인다 → 매번 n * 8바이트씩 건너뛴다
let s2 = 0;
for (let j = 0; j < n; j++)
  for (let i = 0; i < n; i++) s2 += a[i * n + j];
`}</Code>
      <p>
        그림 2는 이 두 반복문을 작은 배열과 작은 캐시로 흉내 낸 것입니다. 캐시 줄 하나에 원소 8개가 들어가고, 배열 전체는 32줄입니다.
      </p>
      <CacheFigure />
      <p>
        행 우선으로 재생하면 줄의 첫 원소에서만 미스가 나고 나머지 일곱은 적중합니다. 어떤 캐시 모양에서도 미스는 32번, 배열 전체를 한 번씩 가져오는 데 꼭 필요한 만큼입니다. 열 우선은 다릅니다. 한 열을 내려가는 동안 16개의 서로 다른 줄을 건드리는데, 8줄짜리 캐시에는 다 들어가지 않으므로 다음 열로 넘어갈 때쯤이면 첫 줄은 이미 쫓겨났습니다. 256번 모두 미스입니다.
      </p>
      <p>
        캐시를 16줄로 키워도 직접 사상에서는 여전히 미스가 많습니다. 한 행이 두 줄이라 열을 따라 내려가는 줄 번호가 모두 짝수(또는 홀수)이고, 16으로 나눈 나머지가 겹쳐 절반의 칸에만 몰리기 때문입니다. 배치 방식을 "완전 연관"으로 바꾸면 16줄이 정확히 들어가 미스가 32번으로 떨어집니다. 이처럼 미스에는 세 종류가 있습니다.
      </p>
      <ul>
        <li>
          <T en="compulsory miss">필수 미스</T>: 처음 보는 줄이라 어쩔 수 없는 미스. 행 우선의 32번이 모두 이것입니다.
        </li>
        <li>
          <T en="capacity miss">용량 미스</T>: 다시 쓸 데이터가 캐시보다 커서 생기는 미스. 8줄 캐시에서 열 우선이 그렇습니다.
        </li>
        <li>
          <T en="conflict miss">충돌 미스</T>: 캐시에 빈자리는 있는데 같은 세트로 몰려서 생기는 미스. 16줄 직접 사상에서 열 우선이 그렇습니다.
        </li>
      </ul>
      <Callout kind="warn">
        배열의 한 행 크기가 2의 거듭제곱(4096바이트 등)이면 열 방향으로 읽을 때 모든 줄이 같은 세트로 몰려 충돌 미스가 폭발할 수 있습니다. 행렬 계산 라이브러리가 행 길이에 일부러 여분(padding)을 붙이기도 하는 이유입니다.
      </Callout>

      <h2>평균 접근 시간</h2>
      <p>캐시가 얼마나 도움이 되는지는 미스율로 정해집니다. 캐시에서 읽는 시간에, 미스가 날 때마다 아래층에서 가져오는 시간이 더해집니다.</p>
      <MB note="적중 시간 1ns, 미스 때 메모리에서 가져오는 추가 시간 100ns라고 하면">{'\\text{평균 접근 시간} = t_{\\text{hit}} + (\\text{미스율}) \\times t_{\\text{miss}}'}</MB>
      <p>
        미스율이 1%면 <M>{'1 + 0.01 \\times 100 = 2'}</M>ns, 10%면 <M>{'1 + 0.1 \\times 100 = 11'}</M>ns입니다. 미스율이 몇 퍼센트 바뀌었을 뿐인데 평균이 다섯 배 넘게 차이 납니다. 그림 2의 행 우선(미스율 12.5%)과 열 우선(100%)을 이 식에 넣으면 평균 접근 시간이 13.5ns와 101ns로 일곱 배 넘게 벌어집니다. 실제로도 그런지 이 브라우저에서 재 보겠습니다.
      </p>
      <MeasureFigure />
      <p>
        실제 CPU에서는 차이가 시뮬레이션보다 작게 나올 수도 있습니다. CPU가 일정한 간격의 접근을 알아채고 다음 줄을 미리 가져오는 <T en="prefetching">프리페치</T>를 하고, L2와 L3가 L1의 미스를 받아 주기 때문입니다. 그래도 배열이 커서 L3에도 들어가지 않는 2048에서는 대개 몇 배 차이가 납니다.
      </p>

      <h2>코드에서 지역성 살리기</h2>
      <ul>
        <li>
          <strong>안쪽 반복문이 메모리를 차례로 지나가게</strong> 쓰세요. 2차원 데이터를 다룰 때는 저장된 순서대로 읽는 것이 기본입니다.
        </li>
        <li>
          <strong>연결 리스트보다 배열이 빠른 경우가 많습니다.</strong> 연결 리스트는 다음 노드가 메모리 어디에 있을지 몰라 노드마다 미스가 날 수 있지만, 배열은 캐시 줄 하나에 여러 원소가 들어갑니다. 이론상 같은 O(n)이라도 실제 속도는 몇 배 차이 납니다.
        </li>
        <li>
          <strong>숫자를 많이 다룬다면 typed array</strong>(<code>Float64Array</code> 등)를 고려하세요. 일반 배열에 객체를 담으면 객체가 메모리 여기저기 흩어질 수 있지만, typed array는 값이 빈틈없이 붙어 있습니다.
        </li>
        <li>
          같은 원리가 디스크에서도 통합니다. 데이터베이스의 <a href={lessonHref('cs-system-algorithms', 'b-tree')}>B-트리</a>는 한 번에 읽는 디스크 블록 하나에 키를 수백 개씩 담아, 느린 읽기 횟수를 줄입니다.
        </li>
      </ul>
      <Callout kind="note">
        메모리 계층의 아래쪽, 메인 메모리와 디스크 사이도 캐시처럼 동작합니다. 운영체제는 자주 쓰는 디스크 내용을 메모리에 남겨 두고(페이지 캐시), 메모리가 부족하면 오래 안 쓴 부분을 디스크로 내보냅니다. 프로그램마다 자기만의 주소 공간을 주는 가상 메모리와 함께 <a href={courseHref('cs-operating-systems')}>운영체제</a> 과목에서 다룹니다.
      </Callout>

      <Callout kind="key">
        CPU는 메모리보다 수백 배 빠르기 때문에, 그 사이에 작고 빠른 캐시를 여러 층 둡니다. 캐시는 64바이트 캐시 줄 단위로 가져오고, 메모리의 각 줄은 정해진 세트에만 들어갈 수 있습니다. 프로그램이 지역성을 가질수록, 특히 메모리를 차례로 읽을수록 미스율이 낮아지고, 평균 접근 시간은 <M>{'t_{\\text{hit}} + \\text{미스율} \\times t_{\\text{miss}}'}</M>로 정해집니다. 같은 O(n) 코드도 접근 순서에 따라 몇 배씩 빨라지거나 느려집니다.
      </Callout>
      <Quiz
        q="1000 × 1000 행렬이 행 우선으로 저장되어 있다. 각 열의 합을 구하려 한다(결과는 길이 1000의 배열 colSum). 캐시에 가장 친화적인 반복문은?"
        options={[
          <>바깥 반복문이 열 j, 안쪽 반복문이 행 i: <code>colSum[j] += a[i][j]</code></>,
          <>바깥 반복문이 행 i, 안쪽 반복문이 열 j: <code>colSum[j] += a[i][j]</code></>,
          '어느 순서든 결과가 같으므로 속도도 같다',
          '열의 합은 캐시를 쓸 수 없으므로 행렬을 먼저 전치해야만 빨라진다',
        ]}
        answer={1}
        explain={<>구하는 것이 열의 합이어도 읽는 순서는 바꿀 수 있습니다. 행을 바깥에 두면 안쪽 반복문이 <code>a[i][0], a[i][1], …</code>를 메모리 순서대로 읽고, <code>colSum</code> 배열(8KB)도 캐시에 그대로 남아 있습니다. 열을 바깥에 두면 안쪽 반복문이 매번 한 행(8,000바이트)씩 건너뛰어 그림 2의 열 우선처럼 미스가 납니다. 전치도 방법이지만 필요하지 않습니다.</>}
      />
    </>
  );
}
