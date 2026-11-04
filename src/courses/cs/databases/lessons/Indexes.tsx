import { useEffect, useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import {
  ACTUAL,
  CQUERIES,
  DEFAULT_EQ_SEL,
  N_ROWS,
  PAGES,
  PLANS,
  PLAN_EN,
  PLAN_NAMES,
  RPP,
  STALE,
  STATUSES,
  cheapest,
  matchPages,
  planCost,
  readSequence,
  runComposite,
  switchPoints,
  type ICol,
  type PlanKind,
  type Status,
} from './plans';
import { SqlBox } from './DbTable';
import '../../algorithms/lessons/algorithms.css';
import './db.css';

const PLAN_CSS: Record<PlanKind, string> = { index: 'var(--neg)', bitmap: 'var(--c-stats-2)', seq: 'var(--ink-2)' };
const planColor = (P: Palette, k: PlanKind) => (k === 'index' ? P.neg : k === 'bitmap' ? P.stats2 : P.ink2);
const fmtN = (v: number) => Math.round(v).toLocaleString('ko-KR');
const pct = (k: number) => {
  const p = (k / N_ROWS) * 100;
  return `${p < 0.1 ? p.toFixed(3) : p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
};
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const pow10 = (k: number) => '10' + String(k).split('').map((d) => SUP[+d]).join('');

/* ─────────────── Figure 1: three ways to read the same rows ─────────────── */

const GRID_COLS = 20;
type Choice = 'auto' | PlanKind;

function ScanFigure() {
  const P = usePalette();
  const [lgK, setLgK] = useState(Math.log10(200));
  const [clustered, setClustered] = useState(false);
  const [choice, setChoice] = useState<Choice>('auto');
  const k = Math.max(1, Math.min(N_ROWS, Math.round(10 ** lgK)));
  const pages = useMemo(() => matchPages(k, clustered), [k, clustered]);
  const dActual = useMemo(() => new Set(pages).size, [pages]);
  const auto = cheapest(k, clustered, dActual);
  const kind: PlanKind = choice === 'auto' ? auto : choice;
  const reads = useMemo(() => readSequence(kind, pages), [kind, pages]);
  const s = useStepper(reads.length + 1, 60, `${kind}|${k}|${clustered}`, true);
  useEffect(() => s.setSpeed(Math.max(8, Math.round(reads.length / 4))), [reads.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const costs = Object.fromEntries(PLANS.map((p) => [p, planCost(p, k, clustered, dActual)])) as Record<PlanKind, ReturnType<typeof planCost>>;
  const maxCost = Math.max(...PLANS.map((p) => costs[p].total));
  const done = s.i;

  const hasMatch = useMemo(() => {
    const a = new Uint16Array(PAGES);
    for (const p of pages) a[p]++;
    return a;
  }, [pages]);

  const grid = useCanvas2D(
    (ctx, { w, h }) => {
      const rows = PAGES / GRID_COLS;
      const cs = Math.floor(Math.min((w - 8) / GRID_COLS, (h - 8) / rows));
      const x0 = Math.round((w - cs * GRID_COLS) / 2);
      const y0 = Math.round((h - cs * rows) / 2);
      const cnt = new Uint16Array(PAGES);
      for (let i = 0; i < done; i++) cnt[reads[i]]++;
      const at = (p: number): [number, number] => [x0 + (p % GRID_COLS) * cs, y0 + Math.floor(p / GRID_COLS) * cs];
      for (let p = 0; p < PAGES; p++) {
        const [x, y] = at(p);
        ctx.fillStyle = cnt[p] ? alpha(P.pos, cnt[p] > 1 ? 0.95 : 0.55) : alpha(P.ink, P.dark ? 0.07 : 0.05);
        ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        if (hasMatch[p]) {
          // a dot sized by how many matching rows the page holds
          const r = Math.max(1.6, Math.min(cs * 0.3, 1.4 + Math.sqrt(hasMatch[p]) * 0.6));
          ctx.fillStyle = cnt[p] ? P.surface : P.ink;
          ctx.beginPath();
          ctx.arc(x + cs / 2, y + cs / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // the last few jumps of an index scan
      if (kind === 'index' && done > 1) {
        const from = Math.max(1, done - 14);
        for (let i = from; i < done; i++) {
          const [ax, ay] = at(reads[i - 1]);
          const [bx, by] = at(reads[i]);
          ctx.strokeStyle = alpha(P.ink, 0.12 + 0.5 * ((i - from) / 14));
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ax + cs / 2, ay + cs / 2);
          ctx.lineTo(bx + cs / 2, by + cs / 2);
          ctx.stroke();
        }
      }
      if (done > 0 && done <= reads.length) {
        const [x, y] = at(reads[done - 1]);
        ctx.strokeStyle = P.hl;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      }
    },
    [P, reads, done, hasMatch, kind],
    { aspect: 2, maxHeight: 330, minHeight: 160 },
  );

  const curve = useCanvas2D(
    (ctx, { w, h }) => {
      const xMax = Math.log10(N_ROWS);
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 1, yMax: 5, pad: { l: 40, r: 12, t: 10, b: 38 } });
      plot.grid({ xStep: 1, yStep: 1, labels: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.fillStyle = P.ink3;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = 1; y <= 5; y++) ctx.fillText(pow10(y), plot.X(0) - 5, plot.Y(y));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = 0; x <= 4; x++) ctx.fillText(fmtN(10 ** x) + '행', plot.X(x), plot.Y(1) + 14);
      // a band under the axis: the planner's pick at each selectivity
      for (let i = 0; i < plot.pw; i += 2) {
        const kk = Math.max(1, Math.round(10 ** plot.invX(plot.pad.l + i)));
        ctx.fillStyle = planColor(P, cheapest(kk, clustered));
        ctx.fillRect(plot.pad.l + i, plot.Y(1) + 2, 2, 7);
      }
      plot.line(lgK, 1, lgK, 5, alpha(P.ink, 0.4), 1.2, [4, 4]);
      for (const p of PLANS) {
        plot.fn((x) => Math.log10(planCost(p, Math.max(1, 10 ** x), clustered).total), planColor(P, p), 2.2, { samples: 160 });
        plot.dot(lgK, Math.log10(costs[p].total), 4.5, planColor(P, p), P.surface, 2);
      }
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('예상 비용', plot.X(0) + 6, plot.Y(5) + 2);
    },
    [P, lgK, clustered, costs],
    { aspect: 2.6, maxHeight: 220, minHeight: 150 },
  );

  const explain =
    kind === 'seq'
      ? `Seq Scan on users  (cost=0.00..${costs.seq.total.toFixed(2)} rows=${k})\n  Filter: (age BETWEEN …)`
      : kind === 'index'
        ? `Index Scan using users_age_idx on users  (cost=0.29..${costs.index.total.toFixed(2)} rows=${k})\n  Index Cond: (age BETWEEN …)`
        : `Bitmap Heap Scan on users  (cost=${(costs.bitmap.idx * 4).toFixed(2)}..${costs.bitmap.total.toFixed(2)} rows=${k})\n  ->  Bitmap Index Scan on users_age_idx  (rows=${k})`;

  return (
    <Figure
      no={1}
      title="같은 행을 읽는 세 가지 방법"
      hint="찾는 행의 수를 바꾸고, 계획을 직접 골라 재생해 보세요"
      caption={<>위 격자의 칸 하나가 표의 페이지 하나입니다(행 {fmtN(N_ROWS)}개, 페이지당 {RPP}행, 모두 {PAGES}페이지). 작은 점은 조건에 맞는 행이 든 페이지, 주황 칸은 읽은 페이지이고, 진한 주황은 같은 페이지를 두 번 이상 읽은 것입니다. 인덱스 스캔에서 이어지는 선은 최근에 건너뛴 경로입니다. 아래 그래프는 PostgreSQL의 기본값(순차 읽기 1, 무작위 읽기 4, 행 처리 0.01)으로 계산한 예상 비용이고, 맨 아래 색 띠는 그 선택도에서 가장 싼 계획입니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={grid.wrapRef} className="canvas-box" role="img" aria-label={`표의 ${PAGES}개 페이지 중 ${PLAN_NAMES[kind]}이 지금까지 ${done}번 읽음. 조건에 맞는 행 ${k}개는 ${dActual}개 페이지에 있음`}>
            <canvas ref={grid.canvasRef} />
          </div>
          <SqlBox sql={`SELECT * FROM users WHERE age BETWEEN … ;  -- ${fmtN(k)}행 (${pct(k)})\n` + explain} on={(_, i) => i === 1} label="쿼리와 실행 계획" />
          <div className="growth-rows ix-rows">
            {PLANS.map((p) => (
              <div key={p} className="growth-row" data-on={p === kind || undefined}>
                <span className="growth-name">
                  {PLAN_NAMES[p]}
                  {p === auto ? ' ✓' : ''}
                </span>
                <span className="growth-track">
                  <span className="growth-bar" style={{ width: `${Math.max(0.5, (Math.log10(costs[p].total) / Math.log10(maxCost * 1.05)) * 100)}%`, background: PLAN_CSS[p] }} />
                </span>
                <span className="growth-time mono">{fmtN(costs[p].total)}</span>
              </div>
            ))}
          </div>
          <div ref={curve.wrapRef} className="canvas-box" role="img" aria-label={`선택도에 따른 세 계획의 예상 비용. 지금 ${fmtN(k)}행에서는 ${PLAN_NAMES[auto]}이 가장 쌈`}>
            <canvas ref={curve.canvasRef} />
          </div>
        </div>
        <div className="controls">
          <Slider id="ix-k" label="조건에 맞는 행" value={lgK} min={0} max={Math.log10(N_ROWS)} step={0.02} onChange={setLgK} format={() => `${fmtN(k)}행 (${pct(k)})`} />
          <Check label="행이 age 순서로 저장됨" checked={clustered} onChange={setClustered} />
          <Seg
            label="실행 계획"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'auto', label: '플래너에게' },
              { value: 'index', label: '인덱스' },
              { value: 'bitmap', label: '비트맵' },
              { value: 'seq', label: '전체' },
            ]}
          />
          <StepControls s={s} id="ix-speed" maxSpeed={5000} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="읽은 표 페이지" value={`${Math.min(done, reads.length)} / ${reads.length}`} color="var(--pos)" />
            <Readout label="인덱스 페이지" value={kind === 'seq' ? '0' : `${costs[kind].idx}`} />
            <Readout label="맞는 행이 든 페이지" value={`${dActual}`} />
            <Readout label="플래너의 선택" value={PLAN_NAMES[auto]} color={PLAN_CSS[auto]} />
          </div>
          <Legend
            items={[
              { color: 'var(--pos)', label: '읽은 페이지', shape: 'sq' },
              { color: 'var(--ink)', label: '맞는 행이 있음', shape: 'dot' },
              { color: 'var(--neg)', label: '인덱스', shape: 'ln' },
              { color: 'var(--c-stats-2)', label: '비트맵', shape: 'ln' },
              { color: 'var(--ink-2)', label: '전체 스캔', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the planner only knows its statistics ─────────────── */

type StatMode = 'none' | 'stale' | 'fresh';
const STAT_OPTS: { value: StatMode; label: string }[] = [
  { value: 'none', label: '통계 없음' },
  { value: 'stale', label: '지난달 통계' },
  { value: 'fresh', label: '방금 ANALYZE' },
];
const STATUS_CSS: Record<Status, string> = { done: 'var(--c-cs-4)', shipped: 'var(--c-cs-2)', pending: 'var(--c-cs-1)', error: 'var(--bad)' };

function StatsFigure() {
  const [val, setVal] = useState<Status>('error');
  const [mode, setMode] = useState<StatMode>('stale');
  const known: Record<Status, number> | null = mode === 'fresh' ? ACTUAL : mode === 'stale' ? STALE : null;
  const est = Math.max(1, Math.round((known ? known[val] : DEFAULT_EQ_SEL) * N_ROWS));
  const actual = Math.round(ACTUAL[val] * N_ROWS);
  const chosen = cheapest(est, false);
  const best = cheapest(actual, false);
  const chosenCost = planCost(chosen, actual, false).total;
  const bestCost = planCost(best, actual, false).total;
  const ratio = chosenCost / bestCost;

  const Bar = ({ dist, title }: { dist: Record<Status, number> | null; title: string }) => (
    <div className="st-bar-row">
      <span className="st-bar-title">{title}</span>
      <div className="st-bar" aria-label={title + ': ' + (dist ? STATUSES.map((x) => `${x} ${(dist[x] * 100).toFixed(2)}%`).join(', ') : '모름')}>
        {dist ? (
          STATUSES.map((x) => (
            <span key={x} data-on={x === val || undefined} style={{ width: `${dist[x] * 100}%`, background: STATUS_CSS[x] }} title={`${x}: ${(dist[x] * 100).toFixed(2)}%`} />
          ))
        ) : (
          <span className="st-unknown">값의 분포를 모름 → 같음 조건은 0.5%로 가정</span>
        )}
      </div>
    </div>
  );

  return (
    <Figure
      no={2}
      title="플래너는 통계만 보고 고른다"
      hint="찾는 값과 통계 상태를 바꿔 보세요"
      caption={<>orders 표({fmtN(N_ROWS)}행)의 status 열에 인덱스가 있습니다. 어제 장애가 나서 'error' 행이 25%로 늘었지만, 플래너가 가진 통계는 그대로일 수 있습니다. 플래너는 통계로 추정한 행 수로 가장 싸 보이는 계획을 고르고, 실제 비용은 실제 행 수로 정해집니다. 비용 모델은 그림 1과 같고, 행은 표에 흩어져 있습니다.</>}
    >
      <div className="controls row">
        <Seg label="WHERE status =" value={val} onChange={setVal} options={STATUSES.map((x) => ({ value: x, label: `'${x}'` }))} />
        <Seg label="플래너의 통계" value={mode} onChange={setMode} options={STAT_OPTS} />
      </div>
      <div className="st-bars">
        <Bar dist={ACTUAL} title="실제 표" />
        <Bar dist={known} title="플래너가 아는 것" />
        <Legend items={STATUSES.map((x) => ({ color: STATUS_CSS[x], label: x, shape: 'sq' as const }))} />
      </div>
      <SqlBox
        sql={`EXPLAIN ANALYZE SELECT * FROM orders WHERE status = '${val}';\n${PLAN_EN[chosen]} on orders  (rows=${fmtN(est)})  (actual rows=${fmtN(actual)})`}
        on={(_, i) => i === 1}
        label="실행 계획: 추정과 실제"
      />
      <div className="readouts">
        <Readout label="추정 행 수" value={fmtN(est)} />
        <Readout label="실제 행 수" value={fmtN(actual)} />
        <Readout label="고른 계획" value={PLAN_NAMES[chosen]} color={PLAN_CSS[chosen]} />
        <Readout label="그 계획의 실제 비용" value={fmtN(chosenCost)} />
        <Readout label="실제로 가장 싼 계획" value={`${PLAN_NAMES[best]} (${fmtN(bestCost)})`} color={PLAN_CSS[best]} />
        <Readout label="손해" value={ratio < 1.005 ? '없음' : `${ratio.toFixed(ratio < 10 ? 1 : 0)}배 느림`} color={ratio < 1.005 ? 'var(--good)' : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a composite index and the order of its columns ─────────────── */

function CompositeFigure() {
  const [order, setOrder] = useState<'dy' | 'yd'>('dy');
  const [qid, setQid] = useState('dy');
  const [covering, setCovering] = useState(false);
  const cols: [ICol, ICol] = order === 'dy' ? ['dept', 'year'] : ['year', 'dept'];
  const q = CQUERIES.find((x) => x.id === qid)!;
  const res = useMemo(() => runComposite(cols, q), [order, qid]); // eslint-disable-line react-hooks/exhaustive-deps
  const scanned = res.scanned.size;
  const matched = res.matched.size;
  const visits = covering ? 0 : matched;
  const idxName = `students_${cols.join('_')}_idx`;
  const verdict =
    res.mode === 'range'
      ? `범위 탐색: ${res.bound.map((c) => c).join(', ')}로 시작점을 찾고, 잎을 따라 ${scanned}개만 읽고 멈춥니다.` + (scanned > matched ? ` 범위 안의 ${scanned - matched}개는 읽었지만 다른 조건에 맞지 않아 버립니다.` : '')
      : res.mode === 'order'
        ? `인덱스가 이미 (dept, year) 순서이므로 앞에서 ${matched}개만 읽으면 정렬된 결과가 나옵니다. 정렬 단계가 없습니다.`
        : res.mode === 'sort'
          ? `인덱스가 (year, dept) 순서라 ORDER BY dept, year를 도와주지 못합니다. 전부 읽어 다시 정렬해야 합니다.`
          : `인덱스의 첫 열(${cols[0]})에 조건이 없어서 시작점을 정할 수 없습니다. 맞는 항목이 인덱스 곳곳에 흩어져 있으니 전부 훑어야 합니다.`;
  const plan = res.mode === 'range' || res.mode === 'order' ? (covering ? 'Index Only Scan' : 'Index Scan') : res.mode === 'sort' ? 'Seq Scan + Sort' : 'Seq Scan (또는 인덱스 전체 훑기)';

  return (
    <Figure
      no={3}
      title={`복합 인덱스 (${cols.join(', ')})`}
      hint="쿼리와 열 순서를 바꿔 보세요"
      caption={<>학생 32명의 인덱스 항목을 인덱스 순서대로 늘어놓았습니다. 앞 열이 같으면 뒤 열로 정렬합니다. 테두리가 진한 칸은 인덱스에서 읽은 항목, 색이 찬 칸은 조건에 맞는 항목입니다. 범위 탐색에서는 읽은 칸이 한 덩어리로 이어지고, 범위를 정하지 못하면 맞는 항목이 흩어집니다.</>}
    >
      <div className="controls row">
        <Seg
          label="인덱스 열 순서"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'dy', label: '(dept, year)' },
            { value: 'yd', label: '(year, dept)' },
          ]}
        />
        <div className="ctl" style={{ flex: '0 0 auto', justifyContent: 'flex-end' }}>
          <Check label="SELECT dept, year만 (인덱스에 있는 열)" checked={covering} onChange={setCovering} />
        </div>
      </div>
      <Seg label="쿼리" value={qid} onChange={setQid} options={CQUERIES.map((x) => ({ value: x.id, label: <span className="mono ci-q">{x.label}</span> }))} />
      <div className="ci-entries" role="list" aria-label={`인덱스 항목 32개 중 ${scanned}개를 읽고 ${matched}개가 조건에 맞음`}>
        {res.sorted.map((e, i) => {
          const a = String(e[cols[0]]);
          const b = String(e[cols[1]]);
          return (
            <span key={e.id} role="listitem" className="ci-entry" data-scan={res.scanned.has(i) || undefined} data-match={res.matched.has(i) || undefined} data-break={i > 0 && res.sorted[i - 1][cols[0]] !== e[cols[0]] ? true : undefined}>
              <b>{a}</b>·{b}
            </span>
          );
        })}
      </div>
      <SqlBox sql={`CREATE INDEX ${idxName} ON students (${cols.join(', ')});\nSELECT ${covering ? 'dept, year' : '*'} FROM students ${q.where.length ? 'WHERE ' + q.label : q.label};\n-- ${plan}`} on={(_, i) => i === 2} label="인덱스와 쿼리" />
      <div className="step-note" aria-live="polite">
        {verdict}
      </div>
      <div className="readouts">
        <Readout label="읽은 인덱스 항목" value={`${scanned} / 32`} />
        <Readout label="조건에 맞음" value={`${matched}개`} color="var(--part-color)" />
        <Readout label="표 방문" value={`${visits}번`} />
        <Readout label="계획" value={<span style={{ fontSize: '0.875rem' }}>{plan}</span>} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Indexes() {
  const un = switchPoints(false);
  const cl = switchPoints(true);
  return (
    <>
      <h2>책 뒤의 찾아보기</h2>
      <p>
        두꺼운 책에서 "트랜잭션"이 나오는 쪽을 찾을 때 첫 장부터 넘기는 사람은 없습니다. 책 뒤의 찾아보기에서 가나다순으로 단어를 찾고, 거기 적힌 쪽 번호로 갑니다. 데이터베이스의 <T en="index">인덱스</T>가 바로 이것입니다. 열의 값을 정렬해 두고, 값마다 그 행이 표의 어디에 있는지 적어 둡니다.
      </p>
      <p>
        관계형 데이터베이스의 기본 인덱스는 디스크 페이지에 맞춘 <a href={lessonHref('cs-system-algorithms', 'b-tree')}>B+트리</a>입니다. 행이 1억 개여도 서너 층만 내려가면 원하는 값에 닿고, 잎끼리 이어져 있어 범위도 순서대로 읽을 수 있습니다. 값이 같은지만 보면 되는 경우를 위한 <a href={lessonHref('cs-algorithms', 'search-hash')}>해시</a> 인덱스도 있지만, 범위와 정렬을 함께 돕는 B+트리가 거의 언제나 기본입니다. 이 장은 B+트리가 어떻게 생겼는지보다, 데이터베이스가 인덱스를 <strong>언제 쓰고 언제 안 쓰는지</strong>를 봅니다.
      </p>
      <Code label="인덱스 만들기와 실행 계획 보기 (SQL)">{`
CREATE INDEX users_age_idx ON users (age);   -- age 순서로 정렬된 B+트리

EXPLAIN SELECT * FROM users WHERE age BETWEEN 30 AND 31;
-- Bitmap Heap Scan on users  (rows=200)
--   ->  Bitmap Index Scan on users_age_idx  (rows=200)`}</Code>
      <p>
        <code>EXPLAIN</code>을 붙이면 데이터베이스가 쿼리를 어떻게 실행할지, 곧 <T en="query plan">실행 계획</T>을 보여 줍니다. SQL은 무엇을 원하는지만 말하므로, 같은 쿼리를 어떤 방법으로 실행할지는 <T en="query planner / optimizer">쿼리 플래너</T>가 고릅니다. 위의 계획에는 인덱스 스캔이 아니라 처음 보는 비트맵 스캔이 나옵니다. 왜 그런지가 이 장의 첫 번째 주제입니다.
      </p>

      <h2>세 가지 읽는 법</h2>
      <p>
        표의 행은 8KB 안팎의 <T en="page">페이지</T>에 수십~수백 개씩 담겨 디스크에 있습니다. 디스크는 페이지 단위로 읽으므로, 비용은 읽는 페이지의 수와 읽는 방식으로 셉니다. 차례로 이어 읽는 <T en="sequential read">순차 읽기</T>는 미리 읽기가 통해서 싸고, 여기저기 건너뛰는 <T en="random read">무작위 읽기</T>는 비쌉니다. PostgreSQL은 기본값으로 무작위 읽기를 순차 읽기의 4배로 칩니다.
      </p>
      <ul>
        <li>
          <strong>전체 스캔</strong>(Seq Scan): 표의 모든 페이지를 처음부터 끝까지 순서대로 읽으며 조건을 검사합니다. 찾는 행이 몇 개든 비용이 같습니다.
        </li>
        <li>
          <strong>인덱스 스캔</strong>(Index Scan): 인덱스에서 조건에 맞는 항목을 키 순서로 찾고, 항목마다 표의 그 페이지로 갑니다. 행이 표에 흩어져 있으면 행 하나에 무작위 읽기 하나입니다.
        </li>
        <li>
          <strong>비트맵 스캔</strong>(Bitmap Heap Scan): 인덱스에서 맞는 행의 위치를 먼저 모두 모은 뒤, 페이지 번호 순으로 정렬해 페이지마다 한 번씩만 읽습니다. 행이 많을수록 읽기가 순차 읽기에 가까워집니다.
        </li>
      </ul>
      <ScanFigure />
      <p>
        처음 설정(200행, 1%)에서 계획을 "인덱스"로 바꿔 재생해 보세요. 맞는 행 200개가 표 곳곳에 흩어져 있어서 인덱스 스캔은 페이지 사이를 200번 뛰어다니고, 같은 페이지를 다시 찾아가기도 합니다. "비트맵"은 같은 행을 120여 개의 페이지에서 한 번씩, 앞에서 뒤로 읽습니다. "전체"는 200페이지를 모두 읽지만 무작위 읽기가 하나도 없습니다.
      </p>
      <p>
        슬라이더를 움직이면 플래너의 선택이 바뀝니다. 이 모델에서 행이 흩어져 있으면 인덱스 스캔은 맞는 행이 {un[0]?.k - 1}개 이하일 때만 이기고, 그 뒤로는 비트맵 스캔이, {fmtN(un[1]?.k ?? 0)}행({pct(un[1]?.k ?? 0)})부터는 전체 스캔이 가장 쌉니다. "행이 age 순서로 저장됨"을 켜면 맞는 행이 이웃한 페이지에 모이므로 인덱스 스캔이 {fmtN((cl[0]?.k ?? N_ROWS) - 1)}행({pct((cl[0]?.k ?? N_ROWS) - 1)})까지 이깁니다. 실제 숫자는 데이터베이스와 하드웨어, 캐시에 따라 다르지만 모양은 같습니다. 찾는 행이 아주 적으면 인덱스, 꽤 많으면 비트맵, 대부분이면 전체 스캔입니다.
      </p>
      <Callout kind="intuition">
        인덱스는 "어디에 있는지"를 알려 줄 뿐, 그곳까지 가는 비용은 따로 듭니다. 찾는 행이 표 전체에 흩어져 있으면 지도를 보며 모든 집을 한 집씩 찾아가는 것보다 동네를 한 바퀴 도는 편이 빠릅니다. 표의 행을 인덱스 순서로 저장하는 <T en="clustered index">클러스터드 인덱스</T>(MySQL InnoDB의 기본 키, PostgreSQL의 <code>CLUSTER</code> 명령)는 이 거리를 줄여 줍니다.
      </Callout>

      <h2>선택도와 통계</h2>
      <p>
        조건이 전체 행 중 얼마를 고르는지를 <T en="selectivity">선택도</T>라고 합니다. 그림 1에서 보듯 계획은 선택도에 따라 갈립니다. 그런데 플래너는 쿼리를 실행하기 <strong>전에</strong> 계획을 골라야 하므로, 실제 행 수를 모르고 추정합니다. 추정의 재료는 <code>ANALYZE</code>가 표의 일부를 표본으로 읽어 모아 둔 <T en="statistics">통계</T>입니다. 열마다 가장 흔한 값과 그 비율, 값의 분포를 나눈 히스토그램, 서로 다른 값의 개수 같은 것입니다.
      </p>
      <StatsFigure />
      <p>
        "지난달 통계"로 'error'를 찾으면 플래너는 4행쯤으로 추정하고 인덱스 스캔을 고릅니다. 실제로는 5,000행이라 무작위 읽기가 5,000번 일어나고, 비트맵 스캔보다 50배 넘게 느립니다. 통계를 새로 모으면("방금 ANALYZE") 같은 쿼리가 제 계획을 찾습니다. 통계가 아예 없으면 플래너는 모든 값을 0.5%로 가정해서, 70%를 차지하는 'done'에도 비트맵 스캔을 고릅니다.
      </p>
      <Callout kind="note">
        실제 서비스의 "어제까지 빠르던 쿼리가 갑자기 느려졌다"는 사건 중 상당수가 이렇게 추정이 빗나간 경우입니다. <code>EXPLAIN ANALYZE</code>는 쿼리를 실제로 실행해서 단계마다 추정 행 수(<code>rows</code>)와 실제 행 수(<code>actual rows</code>)를 나란히 보여 주므로, 둘이 수십 배 차이 나는 단계를 찾으면 원인을 반쯤 찾은 것입니다. PostgreSQL은 자동 청소(autovacuum)가 바뀐 행이 많아진 표를 골라 ANALYZE를 알아서 돌리지만, 대량 적재 직후처럼 따라가지 못할 때가 있습니다.
      </Callout>

      <h2>복합 인덱스와 열 순서</h2>
      <p>
        인덱스는 열 여러 개로 만들 수도 있습니다. <code>(dept, year)</code> 인덱스는 학과로 정렬하고, 학과가 같으면 학년으로 정렬합니다. 전화번호부가 성으로 정렬하고 성이 같으면 이름으로 정렬하는 것과 같습니다. 전화번호부로 "김씨"나 "김민준"은 금방 찾지만, 성과 상관없이 이름이 "민준"인 사람은 처음부터 끝까지 넘겨야 찾을 수 있습니다.
      </p>
      <CompositeFigure />
      <p>
        규칙을 정리하면 이렇습니다. 인덱스는 <strong>왼쪽 열부터</strong> 쓰입니다. 첫 열에 같음(=) 조건이 있으면 다음 열로 범위를 더 좁힐 수 있고, 범위 조건(&gt;=, BETWEEN)을 만나면 그 열까지만 범위를 좁히고 나머지 열은 읽으면서 거릅니다. 그림 3에서 <code>dept &gt;= '수학' AND year = 3</code>은 수학과와 컴공과의 항목 16개를 모두 읽고 그중 4개만 씁니다. 열 순서를 (year, dept)로 바꾸면 같은 쿼리가 4개만 읽습니다. 그래서 복합 인덱스는 <strong>같음 조건에 쓰는 열을 앞에, 범위 조건에 쓰는 열을 뒤에</strong> 둡니다.
      </p>
      <p>
        인덱스는 정렬된 순서 자체로도 쓸모가 있습니다. <code>ORDER BY dept, year LIMIT 5</code>는 (dept, year) 인덱스의 앞에서 다섯 개를 읽으면 끝나고, 정렬 단계가 필요 없습니다. 게시판의 "최신 글 20개"가 글이 수백만 개여도 빠른 것은 작성 시각 인덱스의 끝에서 20개만 읽기 때문입니다. "SELECT dept, year만"을 켜 보세요. 필요한 열이 모두 인덱스에 있으면 표를 방문하지 않고 인덱스만으로 답하는 <T en="index-only scan / covering index">인덱스 전용 스캔</T>이 됩니다.
      </p>

      <h2>인덱스의 값</h2>
      <Callout kind="warn">
        인덱스를 만들어 두어도 조건을 쓰는 방식에 따라 쓰이지 않습니다. <code>WHERE lower(email) = 'a@b.com'</code>이나 <code>WHERE year + 1 = 3</code>처럼 열에 함수나 계산을 씌우면, 인덱스에 정렬된 값은 <code>email</code>과 <code>year</code>이지 그 결과가 아니므로 범위를 정할 수 없습니다. 계산을 상수 쪽으로 옮기거나(<code>year = 2</code>), 식 자체에 인덱스(<code>CREATE INDEX ON users (lower(email))</code>)를 만듭니다. <code>LIKE '%민준'</code>처럼 앞이 정해지지 않은 패턴도 같은 이유로 B+트리 인덱스를 쓰지 못합니다.
      </Callout>
      <p>
        인덱스는 읽기를 빠르게 하는 대신 쓰기를 느리게 합니다. 행 하나를 넣을 때마다 그 표의 모든 인덱스에도 항목을 넣어야 하고, 인덱스마다 디스크와 메모리를 차지합니다. 인덱스가 열 개인 표에 행 하나를 넣으면 B+트리 열 개를 고칩니다. 그래서 인덱스는 실제로 자주 쓰는 쿼리의 조건과 정렬을 보고 골라 만들고, 쓰이지 않는 인덱스는 지웁니다. 버퍼 풀이 자주 쓰는 인덱스 페이지를 메모리에 두는 방식은 <a href={lessonHref('cs-system-algorithms', 'lru-cache')}>LRU 캐시</a>에서 다룹니다.
      </p>

      <Callout kind="key">
        인덱스는 정렬된 값과 행의 위치를 담은 B+트리입니다. 플래너는 통계로 조건의 선택도를 추정하고, 맞는 행이 아주 적으면 인덱스 스캔, 꽤 많으면 비트맵 스캔, 대부분이면 전체 스캔을 고릅니다. 추정이 틀리면 계획도 틀리므로 <code>EXPLAIN ANALYZE</code>로 추정과 실제를 비교합니다. 복합 인덱스는 왼쪽 열부터 쓰이므로 같음 조건의 열을 앞에 두고, 필요한 열이 모두 인덱스에 있으면 표를 읽지 않고 답할 수 있습니다.
      </Callout>
      <Quiz
        q={
          <>
            주문 표에 <code>(customer_id, created_at)</code> 복합 인덱스가 있다. 다음 중 이 인덱스로 <strong>범위를 좁히지 못하는</strong> 쿼리는?
          </>
        }
        options={[
          <code key="a">WHERE customer_id = 42</code>,
          <code key="b">WHERE customer_id = 42 AND created_at &gt;= '2026-01-01'</code>,
          <code key="c">WHERE created_at &gt;= '2026-01-01'</code>,
          <code key="d">WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 10</code>,
        ]}
        answer={2}
        explain={<>인덱스는 customer_id로 먼저 정렬되어 있고, created_at은 같은 고객 안에서만 정렬되어 있습니다. 첫 열에 조건이 없으면 2026년 이후 주문이 인덱스 곳곳의 고객마다 흩어져 있으므로 시작점을 정할 수 없습니다. 나머지는 모두 첫 열의 같음 조건으로 시작하고, 마지막 쿼리는 그 고객의 항목을 created_at 순서로 뒤에서부터 10개만 읽으면 됩니다.</>}
      />
    </>
  );
}
