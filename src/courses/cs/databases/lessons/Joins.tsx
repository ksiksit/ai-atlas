import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { StepControls, humanTime, useStepper } from '../../shared';
import { BUCKETS, CUSTOMERS, CUSTOMER_COLS, JOIN_ALG_NAMES, ORDERS, ORDER_COLS, joinCost, joinFrames, joinPairs, type JoinAlg, type JoinType, type Row } from './db';
import { DbTable, SqlBox } from './DbTable';
import '../../algorithms/lessons/algorithms.css';
import './db.css';

/* ─────────────── Figure 1: inner and outer joins ─────────────── */

const JOIN_OPTS: { value: JoinType; label: string }[] = [
  { value: 'inner', label: 'INNER' },
  { value: 'left', label: 'LEFT' },
  { value: 'right', label: 'RIGHT' },
  { value: 'full', label: 'FULL' },
];
const JOIN_SQL: Record<JoinType, string> = { inner: 'JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL JOIN' };
const JOIN_NOTE: Record<JoinType, string> = {
  inner: '짝이 있는 행만 남습니다. 주문이 없는 최유나도, 고객이 사라진 주문 105도 빠집니다.',
  left: '왼쪽 표(customers)의 행은 짝이 없어도 모두 남습니다. 최유나의 주문 칸은 NULL로 채웁니다.',
  right: '오른쪽 표(orders)의 행은 짝이 없어도 모두 남습니다. 주문 105의 고객 칸은 NULL로 채웁니다.',
  full: '양쪽 모두 짝이 없는 행까지 남깁니다. LEFT와 RIGHT의 결과를 합친 것과 같습니다.',
};
const RES_COLS = ['c.id', 'c.name', 'c.city', 'o.id', 'o.item', 'o.amount'];
const C_LABELS = Object.fromEntries(CUSTOMER_COLS.map((c) => [c.name, c.label]));
const O_LABELS = Object.fromEntries(ORDER_COLS.map((c) => [c.name, c.label]));

function JoinTypeFigure() {
  const [type, setType] = useState<JoinType>('left');
  const [hover, setHover] = useState<number | null>(null);
  const pairs = useMemo(() => joinPairs(CUSTOMERS, ORDERS, 'id', 'customer_id', type), [type]);
  const rows: Row[] = pairs.map(({ l, r }) => {
    const c = l === null ? null : CUSTOMERS[l];
    const o = r === null ? null : ORDERS[r];
    return { 'c.id': c ? c.id : null, 'c.name': c ? c.name : null, 'c.city': c ? c.city : null, 'o.id': o ? o.id : null, 'o.item': o ? o.item : null, 'o.amount': o ? o.amount : null };
  });
  const usedL = new Set(pairs.map((p) => p.l));
  const usedR = new Set(pairs.map((p) => p.r));
  const h = hover !== null ? pairs[hover] : null;
  const matched = pairs.filter((p) => p.l !== null && p.r !== null).length;
  const sql = `SELECT c.id, c.name, c.city, o.id, o.item, o.amount\nFROM customers c\n${JOIN_SQL[type]} orders o ON o.customer_id = c.id;`;

  return (
    <Figure
      no={1}
      title="두 표를 키로 이어 붙이기"
      hint="조인 종류를 바꾸고, 결과 행에 마우스를 올려 보세요"
      caption={<>위의 두 표를 <code>o.customer_id = c.id</code>로 잇습니다. 결과 행에 마우스를 올리거나 Tab으로 옮겨 가면, 그 행을 만든 원래 행이 노랗게 표시됩니다. 흐린 행은 이번 조인의 결과에 나오지 않는 행이고, 파란 NULL은 짝이 없어서 채워 넣은 칸입니다.</>}
    >
      <Seg label="조인 종류" value={type} onChange={setType} options={JOIN_OPTS} />
      <div className="tbl-pair">
        <DbTable
          title={<><span className="mono">customers</span> c (왼쪽)</>}
          ariaLabel="customers 표"
          cols={['id', 'name', 'city']}
          labels={C_LABELS}
          pk={['id']}
          rows={CUSTOMERS}
          rowState={(i) => (h && h.l === i ? 'hl' : !usedL.has(i) ? 'dim' : undefined)}
          compact
        />
        <DbTable
          title={<><span className="mono">orders</span> o (오른쪽)</>}
          ariaLabel="orders 표"
          cols={['id', 'customer_id', 'item', 'amount']}
          labels={O_LABELS}
          pk={['id']}
          rows={ORDERS}
          rowState={(i) => (h && h.r === i ? 'hl' : !usedR.has(i) ? 'dim' : undefined)}
          cellState={(i, c) => (c === 'customer_id' && !CUSTOMERS.some((x) => x.id === ORDERS[i].customer_id) ? 'bad' : undefined)}
          compact
        />
      </div>
      <SqlBox sql={sql} on={(l) => l.includes('JOIN')} />
      <div className="step-note" aria-live="polite">
        {JOIN_NOTE[type]}
      </div>
      <DbTable
        title={`결과: ${rows.length}행`}
        ariaLabel={`${JOIN_SQL[type]} 결과 ${rows.length}행`}
        cols={RES_COLS}
        rows={rows}
        focusRows
        onRowEnter={setHover}
        rowState={(i) => (i === hover ? 'hl' : undefined)}
        cellState={(i, c) => (rows[i][c] === null ? 'null-pad' : undefined)}
        compact
      />
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Readout label="짝이 맞은 행" value={`${matched}행`} />
        <Readout label="NULL로 채운 행" value={`${rows.length - matched}행`} color="var(--neg)" />
        <Readout label="결과" value={`${rows.length}행`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: three join algorithms on the comparison grid ─────────────── */

const ALG_OPTS: { value: JoinAlg; label: string }[] = [
  { value: 'nested', label: '중첩 루프' },
  { value: 'hash', label: '해시' },
  { value: 'merge', label: '정렬 병합' },
];
const N_R = 6;
const N_S = 12;
const KEY_MAX = 8;

function makeKeys(seed: number): { R: number[]; S: number[] } {
  const r = rng(seed * 7919 + 3);
  const pool = Array.from({ length: KEY_MAX }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const R = pool.slice(0, N_R);
  const S = Array.from({ length: N_S }, () => 1 + Math.floor(r() * KEY_MAX));
  return { R, S };
}

const bucketColor = (P: Palette, b: number) => [P.neg, P.pos, P.stats2, P.good][b % 4];

function AlgoFigure() {
  const P = usePalette();
  const [alg, setAlg] = useState<JoinAlg>('nested');
  // seed 7: one bucket of the hash table stays empty, so some probes need no comparison at all
  const [seed, setSeed] = useState(7);
  const { R, S } = useMemo(() => makeKeys(seed), [seed]);
  const frames = useMemo(() => joinFrames(alg, R, S), [alg, R, S]);
  const s = useStepper(frames.length, alg === 'nested' ? 12 : 4, `${alg}|${seed}`);
  const f = frames[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const n = R.length;
      const m = S.length;
      const labelW = 52;
      const top = 40;
      const cs = Math.floor(Math.min(34, (w - labelW - 8) / m, (h - top - 8) / n));
      const x0 = Math.max(4, (w - labelW - m * cs) / 2) + labelW;
      const y0 = top;
      const rowPos = new Map(f.rowOrder.map((i, k) => [i, k]));
      const colPos = new Map(f.colOrder.map((j, k) => [j, k]));

      // header
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('S (orders.customer_id) →', x0, 11);
      ctx.textAlign = 'right';
      ctx.fillText('R ↓', x0 - 8, 11);

      // probed bucket band (hash) and pointer band (merge)
      if (f.probe !== null && f.buckets) {
        const rowsIn = f.buckets[f.probe];
        if (rowsIn.length) {
          const k0 = Math.min(...rowsIn.map((i) => rowPos.get(i)!));
          ctx.fillStyle = alpha(bucketColor(P, f.probe), 0.14);
          ctx.fillRect(x0 - labelW + 4, y0 + k0 * cs, labelW - 4 + m * cs, rowsIn.length * cs);
        }
      }

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          const v = f.cells[i * m + j];
          const x = x0 + colPos.get(j)! * cs;
          const y = y0 + rowPos.get(i)! * cs;
          ctx.fillStyle = v === 2 ? P.good : v === 1 ? alpha(P.ink3, P.dark ? 0.55 : 0.4) : alpha(P.ink, P.dark ? 0.06 : 0.04);
          ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        }
      }
      if (f.cur) {
        const [i, j] = f.cur;
        const x = x0 + colPos.get(j)! * cs;
        const y = y0 + rowPos.get(i)! * cs;
        ctx.strokeStyle = P.hl;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      }

      // labels: S keys on top, R keys on the left
      ctx.font = `600 ${cs < 24 ? 11 : 12}px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < m; j++) {
        const k = colPos.get(j)!;
        const on = (f.cur && f.cur[1] === j) || (f.ptr && f.ptr[1] === k);
        if (on) {
          ctx.fillStyle = alpha(P.hl, 0.5);
          ctx.fillRect(x0 + k * cs + 1, y0 - 20, cs - 2, 18);
        }
        ctx.fillStyle = P.ink;
        ctx.fillText(String(S[j]), x0 + k * cs + cs / 2, y0 - 11);
      }
      for (let i = 0; i < n; i++) {
        const k = rowPos.get(i)!;
        const y = y0 + k * cs;
        const on = (f.cur && f.cur[0] === i) || (f.ptr && f.ptr[0] === k);
        if (on) {
          ctx.fillStyle = alpha(P.hl, 0.5);
          ctx.fillRect(x0 - 30, y + 1, 26, cs - 2);
        }
        if (f.buckets) {
          const b = R[i] % BUCKETS;
          ctx.fillStyle = bucketColor(P, b);
          ctx.fillRect(x0 - labelW + 4, y + 2, 5, cs - 4);
          ctx.fillStyle = P.ink3;
          ctx.font = `10px ${P.fontMono}`;
          ctx.fillText(`b${b}`, x0 - 38, y + cs / 2);
          ctx.font = `600 ${cs < 24 ? 11 : 12}px ${P.fontMono}`;
        }
        ctx.fillStyle = P.ink;
        ctx.fillText(String(R[i]), x0 - 17, y + cs / 2);
      }
    },
    [P, f, R, S],
    { aspect: 2.1, maxHeight: 280, minHeight: 170 },
  );

  const total = f.cmp + f.hash + f.sort;
  return (
    <Figure
      no={2}
      title="조인 알고리즘 세 가지: 어느 칸을 비교하나"
      hint="알고리즘을 고르고 재생해 보세요"
      caption={<>세로줄은 고객 표 R의 키 {N_R}개, 가로줄은 주문 표 S의 고객 번호 {N_S}개입니다. 칸 하나가 "R의 이 행과 S의 이 행을 비교했다"는 뜻이고, 초록 칸이 짝이 맞은 결과 행입니다. 회색 칸이 적을수록 일을 덜 한 것입니다. 해시 조인은 키를 {BUCKETS}로 나눈 나머지로 버킷을 정하고, 빌드가 끝나면 R의 행을 버킷별로 모아 그립니다. 정렬 병합 조인은 정렬이 끝나면 두 축을 키 순서로 다시 그립니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${JOIN_ALG_NAMES[alg]}: R ${N_R}행과 S ${N_S}행의 비교 격자. 지금까지 키 비교 ${f.cmp}번, 결과 ${f.matches}행`}>
            <canvas ref={canvasRef} />
          </div>
          {f.buckets && (
            <div className="hj-buckets" aria-label="해시 테이블">
              {f.buckets.map((b, k) => (
                <div key={k} className="hj-bucket" data-on={f.probe === k || undefined} style={{ ['--g' as string]: ['var(--neg)', 'var(--pos)', 'var(--c-stats-2)', 'var(--good)'][k] }}>
                  <span className="hj-b">버킷 {k}</span>
                  {b.length ? b.map((i) => <span key={i} className="ds-cell">{R[i]}</span>) : <span className="ds-empty">비어 있음</span>}
                </div>
              ))}
            </div>
          )}
          <div className="step-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg label="알고리즘" value={alg} onChange={setAlg} options={ALG_OPTS} />
          <StepControls s={s} id="ja-speed" maxSpeed={30} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((x) => x + 1)}>
              새 데이터
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="키 비교" value={`${f.cmp}번`} />
            <Readout label={alg === 'hash' ? '해시 계산' : alg === 'merge' ? '정렬 비교' : '—'} value={alg === 'hash' ? `${f.hash}번` : alg === 'merge' ? `${f.sort}번` : '—'} />
            <Readout label="결과 행" value={`${f.matches}행`} color="var(--good)" />
            <Readout label="합계" value={`${total}번`} />
          </div>
          <Legend
            items={[
              { color: 'var(--ink-3)', label: '비교함', shape: 'sq' },
              { color: 'var(--good)', label: '짝 맞음', shape: 'sq' },
              { color: 'var(--hl)', label: '지금', shape: 'sq' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: cost as the tables grow ─────────────── */

const COST_ALGS: { id: JoinAlg | 'index'; name: string; css: string; key: keyof Palette }[] = [
  { id: 'nested', name: '중첩 루프', css: 'var(--bad)', key: 'bad' },
  { id: 'index', name: '인덱스 중첩 루프', css: 'var(--c-stats-2)', key: 'stats2' },
  { id: 'merge', name: '정렬 병합', css: 'var(--neg)', key: 'neg' },
  { id: 'hash', name: '해시', css: 'var(--good)', key: 'good' },
];
const OPS_PER_SEC = 1e8;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => '10' + String(k).split('').map((d) => SUP[+d]).join('');
const fmtKo = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1)}억` : v >= 1e4 ? `${(v / 1e4).toFixed(v >= 1e5 ? 0 : 1)}만` : Math.round(v).toLocaleString('ko-KR'));

function CostFigure() {
  const P = usePalette();
  const [lgN, setLgN] = useState(4);
  const [ratio, setRatio] = useState(10);
  const [index, setIndex] = useState(false);
  const n = Math.round(10 ** lgN);
  const m = n * ratio;
  const algs = COST_ALGS.filter((a) => index || a.id !== 'index');
  const best = algs.reduce((a, b) => (joinCost(b.id, n, m) < joinCost(a.id, n, m) ? b : a));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 1, xMax: 7, yMin: 0, yMax: 16, pad: { l: 46, r: 14, t: 12, b: 30 } });
      plot.grid({ xStep: 1, yStep: 2, labels: false });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 1; x <= 7; x++) {
        ctx.textAlign = x === 7 ? 'right' : 'center';
        ctx.fillText(fmtKo(10 ** x), plot.X(x) + (x === 7 ? 4 : 0), plot.Y(0) + 6);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 0; y <= 16; y += 4) ctx.fillText(pow10(y), plot.X(1) - 6, plot.Y(y));
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('고객 수 n (주문은 ' + ratio + 'n)', plot.X(7), plot.Y(0) - 4);
      // one second of work
      const sec = Math.log10(OPS_PER_SEC);
      plot.line(1, sec, 7, sec, alpha(P.ink, 0.35), 1, [4, 4]);
      plot.text('약 1초', 1, sec, P.ink3, { dx: 6, dy: -9, font: `11px ${P.fontBody}` });
      plot.line(lgN, 0, lgN, 16, alpha(P.ink, 0.35), 1.2, [4, 4]);
      for (const a of algs) {
        plot.fn((x) => Math.log10(joinCost(a.id, 10 ** x, ratio * 10 ** x)), P[a.key] as string, 2.4, { samples: 120 });
        plot.dot(lgN, Math.log10(joinCost(a.id, n, m)), 5, P[a.key] as string, P.surface, 2);
      }
    },
    [P, lgN, ratio, index, n, m],
    { aspect: 1.9, maxHeight: 330, minHeight: 230 },
  );

  return (
    <Figure
      no={3}
      title="표가 커지면 벌어지는 차이"
      hint="고객 수와 주문 비율을 바꿔 보세요"
      caption={<>고객 n명과 주문 m건을 조인할 때 필요한 기본 연산(비교, 해시 계산)의 횟수입니다. 가로축과 세로축 모두 로그 눈금이라 칸 하나가 10배입니다. 중첩 루프는 n·m, 해시는 약 n + 2m, 정렬 병합은 두 표를 정렬하는 n log n + m log m에 한 번 훑는 n + m을 더했습니다. 인덱스 중첩 루프는 주문 표의 customer_id에 B-트리 인덱스가 있어서, 고객마다 log m번 만에 주문을 찾는다고 보았습니다. 점선은 1초에 1억 번 계산할 때의 1초입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`고객 ${fmtKo(n)}명, 주문 ${fmtKo(m)}건: ${algs.map((a) => `${a.name} ${fmtKo(joinCost(a.id, n, m))}번`).join(', ')}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="jc-n" label="고객 수 n" value={lgN} min={1} max={7} step={0.25} onChange={setLgN} format={() => `${fmtKo(n)}명`} />
          <Seg label="고객 한 명당 주문" value={ratio} onChange={setRatio} options={[1, 10, 100].map((v) => ({ value: v, label: `${v}건` }))} />
          <Check label="orders.customer_id에 인덱스" checked={index} onChange={setIndex} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            {algs.map((a) => (
              <Readout key={a.id} label={a.name} value={`${fmtKo(joinCost(a.id, n, m))}번 · ${humanTime(joinCost(a.id, n, m) / OPS_PER_SEC)}`} color={a.css} />
            ))}
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>가장 적은 쪽: {best.name}</div>
        </div>
      </div>
      <Legend items={algs.map((a) => ({ color: a.css, label: a.name, shape: 'ln' as const }))} />
    </Figure>
  );
}

/* ─────────────── Figure 4: join order ─────────────── */

const SIZES = { c: 10_000, o: 1_000_000, i: 3_000_000 };
type PlanId = 'oi' | 'co' | 'ci';
const PLAN_OPTS: { value: PlanId; label: string }[] = [
  { value: 'co', label: '(고객 ⋈ 주문) ⋈ 상품' },
  { value: 'oi', label: '(주문 ⋈ 상품) ⋈ 고객' },
  { value: 'ci', label: '(고객 × 상품) ⋈ 주문' },
];

function plan(id: PlanId, f: number) {
  const c = SIZES.c * f;
  const final = SIZES.i * f;
  if (id === 'co') return { first: '제주 고객 ⋈ orders', mid: SIZES.o * f, final };
  if (id === 'oi') return { first: 'orders ⋈ order_items', mid: SIZES.i, final };
  return { first: '제주 고객 × order_items (조건 없음)', mid: c * SIZES.i, final };
}

function OrderFigure() {
  const [id, setId] = useState<PlanId>('co');
  const [lgF, setLgF] = useState(-2);
  const f = 10 ** lgF;
  const plans = PLAN_OPTS.map((o) => ({ ...o, ...plan(o.value, f) }));
  const cur = plans.find((p) => p.value === id)!;
  const read = SIZES.c + SIZES.o + SIZES.i;
  const work = (p: (typeof plans)[number]) => read + p.mid + p.final;
  const maxLg = 12;
  const bar = (v: number) => `${Math.max(1, (Math.log10(Math.max(1, v)) / maxLg) * 100)}%`;

  return (
    <Figure
      no={4}
      title="같은 세 표, 다른 조인 순서"
      hint="순서를 바꾸고 조건의 선택도를 움직여 보세요"
      caption={<>고객 1만 명, 주문 100만 건(고객당 100건), 주문 상품 300만 줄(주문당 3줄)에서 "제주에 사는 고객이 산 상품"을 찾습니다. 조인 두 번 중 첫 번째가 만드는 중간 결과의 크기가 순서마다 크게 다릅니다. 막대는 로그 눈금입니다. 세 번째 순서는 고객과 상품 사이에 조인 조건이 없어서 모든 짝을 만드는 곱(cross join)이 됩니다.</>}
    >
      <div className="controls row">
        <Seg label="조인 순서" value={id} onChange={setId} options={PLAN_OPTS} />
        <Slider id="jo-f" label="제주 고객의 비율" value={lgF} min={-3} max={0} step={0.25} onChange={setLgF} format={() => `${(f * 100).toFixed(f < 0.01 ? 2 : f < 0.1 ? 1 : 0)}% (${fmtKo(SIZES.c * f)}명)`} />
      </div>
      <div className="growth-rows jo-rows">
        {plans.map((p) => (
          <div key={p.value} className="growth-row" data-on={p.value === id || undefined}>
            <span className="growth-name">{p.label}</span>
            <span className="growth-track">
              <span className="growth-bar" style={{ width: bar(p.mid), background: p.value === id ? 'var(--part-color)' : 'var(--ink-3)' }} />
            </span>
            <span className="growth-time mono">{fmtKo(p.mid)}행</span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Readout label="첫 조인" value={<span style={{ fontSize: '0.875rem' }}>{cur.first}</span>} />
        <Readout label="중간 결과" value={`${fmtKo(cur.mid)}행`} color="var(--part-color)" />
        <Readout label="최종 결과" value={`${fmtKo(cur.final)}행`} />
        <Readout label="다룬 행 (읽기 + 중간 + 최종)" value={`${fmtKo(work(cur))}행`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Joins() {
  return (
    <>
      <h2>왜 표를 나누어 두나</h2>
      <p>
        쇼핑몰의 주문 표에는 고객 이름이 없습니다. 고객 번호(<code>customer_id</code>)만 적혀 있고, 이름과 도시는 고객 표에 따로 있습니다. 주문마다 이름과 주소를 함께 적어 두면 고객이 이사할 때 주문 수백 건을 고쳐야 하고, 하나라도 빠뜨리면 같은 사람의 주소가 두 개가 됩니다. 그래서 사실 하나는 한곳에만 적고 번호로 가리킵니다. 이렇게 표를 나누는 원칙은 <a href={lessonHref('cs-databases', 'normalization')}>정규화</a>에서 자세히 봅니다.
      </p>
      <p>
        다른 표의 기본 키를 가리키는 열을 <T en="foreign key">외래 키</T>라고 합니다. <code>orders.customer_id</code>는 <code>customers.id</code>를 가리키는 외래 키입니다. 나누어 둔 표를 질문할 때 다시 이어 붙이는 연산이 <T en="join">조인</T>입니다. "주문마다 고객 이름을 붙여서 보여 줘"는 SQL로 이렇게 씁니다.
      </p>
      <Code label="조인 (SQL)">{`
SELECT c.name, o.item, o.amount
FROM orders o
JOIN customers c ON o.customer_id = c.id;   -- 이 조건을 만족하는 짝마다 한 행`}</Code>

      <h2>내부 조인과 외부 조인</h2>
      <p>
        <T en="inner join">내부 조인</T>은 두 표에서 조건을 만족하는 짝을 모두 찾아 한 행씩 만듭니다. 고객 한 명에게 주문이 세 건이면 그 고객의 정보가 결과에 세 번 나옵니다. 짝이 없는 행은 결과에서 빠집니다. 주문을 한 번도 하지 않은 고객은 보이지 않습니다.
      </p>
      <p>
        짝이 없는 행도 남기고 싶을 때가 많습니다. "모든 고객과 그 주문, 주문이 없으면 없다고"가 그렇습니다. 이때 <T en="outer join">외부 조인</T>을 씁니다. <code>LEFT JOIN</code>은 왼쪽 표의 행을, <code>RIGHT JOIN</code>은 오른쪽 표의 행을, <code>FULL JOIN</code>은 양쪽 행을 모두 남기고, 짝이 없는 쪽의 칸은 NULL로 채웁니다.
      </p>
      <JoinTypeFigure />
      <p>
        그림 1의 주문 105는 고객 번호 5를 가리키지만, 고객 표에는 5번이 없습니다. 탈퇴한 고객의 행을 지운 것입니다. 외래 키 제약(<code>REFERENCES customers(id)</code>)을 걸어 두었다면 데이터베이스가 이 삭제를 막았거나, 설정에 따라 주문까지 함께 지웠을 것입니다. 실무에서 RIGHT JOIN은 거의 쓰지 않습니다. 표의 순서를 바꾸면 LEFT JOIN과 같으므로, 읽기 쉬운 쪽으로 씁니다.
      </p>
      <Callout kind="warn">
        LEFT JOIN 뒤에 오른쪽 표의 열로 거르면 외부 조인이 조용히 내부 조인이 됩니다. <code>... LEFT JOIN orders o ON o.customer_id = c.id WHERE o.amount &gt; 10000</code>에서 주문이 없는 고객은 <code>o.amount</code>가 NULL이라 WHERE를 통과하지 못하기 때문입니다. 주문이 없는 고객을 남기려면 그 조건을 <code>ON o.customer_id = c.id AND o.amount &gt; 10000</code>처럼 ON 안에 넣습니다. ON은 짝을 정하는 조건이고, WHERE는 조인이 끝난 결과를 거르는 조건입니다.
      </Callout>

      <h2>데이터베이스는 조인을 어떻게 계산하나</h2>
      <p>
        SQL에는 "짝을 찾아라"만 있고 어떻게 찾을지는 없습니다. 실제 데이터베이스는 같은 조인을 주로 세 가지 방법 중 하나로 계산합니다.
      </p>
      <ul>
        <li>
          <T en="nested loop join">중첩 루프 조인</T>: 바깥 표의 행마다 안쪽 표를 처음부터 끝까지 훑습니다. 이중 반복문 그대로라서 비교가 <M>{'n \\times m'}</M>번입니다.
        </li>
        <li>
          <T en="hash join">해시 조인</T>: 작은 표의 키로 <a href={lessonHref('cs-algorithms', 'search-hash')}>해시 테이블</a>을 만들고(빌드), 큰 표를 한 번 훑으며 행마다 해시 테이블에서 짝을 찾습니다(프로브). 대략 <M>{'n + m'}</M>번의 일로 끝나지만, 같음(=) 조건에만 쓸 수 있고 해시 테이블을 담을 메모리가 필요합니다.
        </li>
        <li>
          <T en="sort-merge join">정렬 병합 조인</T>: 두 표를 키로 정렬한 다음, 병합 정렬의 합치기처럼 두 줄을 앞에서부터 나란히 훑습니다. 정렬에 <M>{'n \\log n + m \\log m'}</M>이 들지만, 이미 정렬되어 있으면(예: 인덱스 순서로 읽을 때) 거의 공짜이고 범위 조건에도 쓸 수 있습니다.
        </li>
      </ul>
      <AlgoFigure />
      <p>
        그림 2에서 중첩 루프는 격자를 한 칸도 빠짐없이 칠합니다. 해시 조인으로 바꾸면 주문마다 자기 버킷의 한두 칸만 비교하고, 비어 있는 버킷이면 비교 없이 넘어갑니다. 정렬 병합 조인은 정렬이 끝난 뒤 비교한 칸이 왼쪽 위에서 오른쪽 아래로 내려가는 계단 모양을 그립니다. 작은 쪽으로 한 칸씩만 나아가므로 계단의 길이는 많아야 <M>{'n + m'}</M>입니다.
      </p>
      <Code label="해시 조인 (JavaScript)">{`
function hashJoin(customers, orders) {
  // 빌드: 작은 표로 키 → 행 해시 테이블을 만든다
  const table = new Map();
  for (const c of customers) table.set(c.id, c);
  // 프로브: 큰 표를 한 번만 훑으며 짝을 찾는다
  const out = [];
  for (const o of orders) {
    const c = table.get(o.customer_id);  // 평균 O(1)
    if (c) out.push({ ...c, ...o });     // 짝이 없으면 내부 조인에서는 버린다
  }
  return out;
}`}</Code>

      <h2>표가 커지면</h2>
      <p>
        표가 몇 줄일 때는 무엇을 써도 순식간입니다. 차이는 표가 커질 때 드러납니다.
      </p>
      <CostFigure />
      <p>
        고객 1만 명에 주문 10만 건이면 중첩 루프는 비교 10억 번으로 약 10초가 걸리고, 해시 조인은 21만 번으로 몇 밀리초면 끝납니다. 고객이 100만 명이 되면 중첩 루프는 하루를 넘깁니다. 그래서 큰 표끼리의 조인에서 데이터베이스는 거의 언제나 해시 조인이나 정렬 병합 조인을 고릅니다.
      </p>
      <p>
        그렇다고 중첩 루프가 쓸모없는 것은 아닙니다. 안쪽 표의 조인 열에 <a href={lessonHref('cs-system-algorithms', 'b-tree')}>B-트리 인덱스</a>가 있으면, 바깥 행마다 안쪽 표를 훑는 대신 인덱스로 짝을 바로 찾습니다. 이것이 <T en="index nested loop join">인덱스 중첩 루프 조인</T>입니다. 그림 3에서 인덱스를 켜 보세요. 고객 몇 명의 주문만 볼 때처럼 바깥 표가 작으면 이 방법이 가장 빠르고, 웹 서비스의 쿼리 대부분이 이 경우에 해당합니다.
      </p>
      <Callout kind="note">
        해시 조인의 해시 테이블이 메모리(PostgreSQL의 <code>work_mem</code>)에 다 들어가지 않으면, 두 표를 해시 값에 따라 여러 조각으로 나눠 디스크에 쓴 다음 조각끼리 조인합니다. 디스크를 한 번 더 오가므로 느려지지만 여전히 선형에 가깝습니다. 실행 계획에 <code>Batches: 8</code>처럼 나오면 메모리가 모자랐다는 뜻입니다.
      </Callout>

      <h2>조인 순서와 비용</h2>
      <p>
        표가 셋 이상이면 어떤 순서로 이을지도 정해야 합니다. 조인은 순서를 바꿔도 결과가 같지만(교환·결합 법칙), 중간 결과의 크기는 순서에 따라 수만 배씩 달라집니다.
      </p>
      <OrderFigure />
      <p>
        제주 고객이 1%(100명)일 때, 고객부터 걸러 주문과 이으면 중간 결과는 1만 행입니다. 주문과 상품부터 이으면 300만 행을 만든 뒤에야 대부분을 버립니다. 조건 없는 곱은 3억 행이라 실제로는 끝나지 않습니다. 원칙은 단순합니다. 결과를 많이 줄이는 조건을 먼저 적용하고, 작은 중간 결과끼리 잇습니다. 비율을 100%로 올리면 첫 두 순서의 차이가 사라지는 것도 보세요. 조건이 거르는 것이 없으면 먼저 할 이유도 없습니다.
      </p>
      <p>
        표가 n개면 가능한 순서는 n!개를 훌쩍 넘습니다. 쿼리 옵티마이저는 각 표의 행 수와 조건의 선택도를 통계로 추정하고, 부분 조인의 최적 비용을 표에 기억해 두는 <a href={lessonHref('cs-algorithm-design', 'dynamic-programming')}>동적 계획법</a>으로 가장 싼 순서와 알고리즘을 고릅니다. 1979년 IBM의 System R이 처음 쓴 방법이 지금도 기본 틀입니다. PostgreSQL은 표가 12개 이상이면 경우가 너무 많아 유전 알고리즘으로 근사합니다.
      </p>

      <Callout kind="key">
        조인은 외래 키로 나누어 둔 표를 다시 잇습니다. 내부 조인은 짝이 있는 행만, 외부 조인은 짝이 없는 쪽도 NULL로 채워 남깁니다. 데이터베이스는 같은 조인을 중첩 루프(n·m), 해시(n + m, 같음 조건, 메모리 필요), 정렬 병합(정렬 비용, 정렬된 입력에 유리), 인덱스 중첩 루프(바깥이 작고 안쪽에 인덱스가 있을 때) 중에서 골라 계산하고, 표가 여럿이면 중간 결과가 작아지는 순서를 고릅니다.
      </Callout>
      <Quiz
        q="고객 500만 명과 주문 1억 건을 고객 번호로 조인해 고객별 주문 합계를 구하는 야간 리포트가 있다. 두 표 모두 조인 열이 정렬되어 있지 않고, 서버 메모리는 고객 표의 해시 테이블을 담기에 충분하다. 옵티마이저가 가장 그럴듯하게 고를 방법은?"
        options={['중첩 루프 조인: 가장 단순해서 오버헤드가 없다', '고객 표로 해시 테이블을 만들고 주문 표를 한 번 훑는 해시 조인', '주문 표로 해시 테이블을 만들고 고객 표를 훑는 해시 조인', '두 표를 먼저 정렬하는 정렬 병합 조인: 정렬은 언제나 해시보다 싸다']}
        answer={1}
        explain={<>큰 표끼리의 같음 조인에서는 해시 조인이 n + m에 가깝게 끝납니다. 이때 해시 테이블은 작은 쪽(고객 500만)으로 만들어야 메모리에 들어가고, 큰 쪽(주문 1억)은 한 번 흘려보내기만 하면 됩니다. 중첩 루프는 5×10¹⁴번 비교라 끝나지 않고, 정렬 병합은 1억 건을 정렬하는 비용이 더 듭니다. 입력이 이미 정렬되어 있었다면 정렬 병합도 좋은 선택입니다.</>}
      />
    </>
  );
}
