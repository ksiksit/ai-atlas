import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { label, text } from './draw';
import { PHIL_KO, PROG_LOCK, PROG_PLAIN, OP_TEXT, blocked, finished, raceMany, raceStart, raceStep, runPhilosophers, type PhilState, type RaceState, type Strategy } from './sync';
import './os.css';

/* ─────────────── Figure 1: you are the scheduler ─────────────── */

const TH = ['A', 'B'];
const TH_CSS = ['var(--neg)', 'var(--pos)'];

function replay(order: number[], locked: boolean): RaceState[] {
  const prog = locked ? PROG_LOCK : PROG_PLAIN;
  const hist = [raceStart()];
  for (const th of order) {
    const nx = raceStep(hist[hist.length - 1], prog, th);
    if (nx) hist.push(nx);
  }
  return hist;
}

function InterleaveFigure() {
  const [locked, setLocked] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [seed, setSeed] = useState(3);
  const prog = locked ? PROG_LOCK : PROG_PLAIN;
  const hist = useMemo(() => replay(order, locked), [order, locked]);
  const s = hist[hist.length - 1];
  const bothDone = finished(s, prog, 0) && finished(s, prog, 1);

  const run = (th: number) => setOrder([...hist.slice(1).map((x) => x.trace[x.trace.length - 1].th), th]);
  const preset = (kind: 'serial' | 'alt' | 'random') => {
    // build the schedule by simulation, so a thread waiting for the lock is never picked
    const r = rng(seed);
    if (kind === 'random') setSeed((x) => x + 1);
    let st = raceStart();
    const out: number[] = [];
    while (!(finished(st, prog, 0) && finished(st, prog, 1))) {
      const able = [0, 1].filter((t) => !finished(st, prog, t) && !blocked(st, prog, t));
      const want = kind === 'serial' ? 0 : kind === 'alt' ? out.length % 2 : able[Math.floor(r() * able.length)];
      const th = able.includes(want) ? want : able[0];
      st = raceStep(st, prog, th)!;
      out.push(th);
    }
    setOrder(out);
  };
  const flip = (v: boolean) => {
    setLocked(v);
    setOrder([]);
  };

  // which two loads read the same value: the lost update
  const loads = s.trace.filter((t) => t.op === 'load');
  const lost = bothDone && s.mem < 2;
  const verdict = !bothDone
    ? s.trace.length
      ? `${s.trace.length}개 명령어를 실행했습니다. 두 스레드를 끝까지 실행해 보세요.`
      : '스레드 A나 B의 버튼을 눌러 한 줄씩 실행하세요. 어느 쪽을 먼저 실행할지는 여러분이 스케줄러로서 정합니다.'
    : lost
      ? `count = ${s.mem}. 두 스레드가 모두 count = ${loads[0]?.reg}을 읽은 뒤 각자 1을 더해 썼기 때문에, 나중에 쓴 값이 먼저 쓴 값을 덮어썼습니다. 갱신 하나가 사라졌습니다.`
      : `count = ${s.mem}. 정답입니다. ${locked ? '락 덕분에 한 스레드가 읽고-더하고-쓰는 동안 다른 스레드는 들어오지 못했습니다.' : '한 스레드가 쓰기를 마친 뒤에 다른 스레드가 읽었기 때문입니다. 순서가 달랐다면 어땠을까요?'}`;

  return (
    <Figure
      no={1}
      title="count = count + 1을 두 스레드가 동시에"
      hint="여러분이 스케줄러입니다. 실행 순서를 골라 보세요"
      caption={
        <>
          count++ 한 줄은 기계어로 세 명령어입니다. 메모리의 count를 레지스터 r로 읽고(load), r에 1을 더하고(add), r을 다시 메모리에 씁니다(store). 레지스터는 스레드마다 따로 있고, count는 둘이 함께 쓰는 메모리입니다. 노란 줄이 다음에 실행할 명령어입니다. 락을 켜면 앞뒤에 lock과 unlock이 붙고, 다른 스레드가 쥔 락을 잡으려는 스레드는 빨간 줄에서 기다립니다.
        </>
      }
    >
      <div className="controls row">
        <Check label="뮤텍스로 감싸기" checked={locked} onChange={flip} />
        <div className="btn-row">
          <Button small onClick={() => preset('serial')}>
            A를 다 실행하고 B
          </Button>
          <Button small onClick={() => preset('alt')}>
            한 줄씩 번갈아
          </Button>
          <Button small onClick={() => preset('random')}>
            무작위 순서
          </Button>
          <Button small onClick={() => setOrder(order.slice(0, hist.length - 2))} disabled={hist.length <= 1}>
            한 줄 되돌리기
          </Button>
          <Button small onClick={() => setOrder([])} disabled={hist.length <= 1}>
            처음부터
          </Button>
        </div>
      </div>
      <div className="race-threads">
        {[0, 1].map((th) => {
          const fin = finished(s, prog, th);
          const blk = blocked(s, prog, th);
          return (
            <div key={th} className="thr" data-th={th} style={{ ['--c' as string]: TH_CSS[th] }}>
              <div className="thr-head">
                <strong>스레드 {TH[th]}</strong>
                <span>{fin ? '끝' : blk ? '락을 기다림' : '실행 가능'}</span>
              </div>
              <ol className="thr-code">
                {prog.map((op, k) => (
                  <li key={k} data-s={k < s.pc[th] ? 'done' : k === s.pc[th] ? (blk ? 'blocked' : 'next') : undefined} data-lock={op === 'lock' || op === 'unlock' || undefined}>
                    <span aria-hidden="true">{k === s.pc[th] ? '▸' : ''}</span>
                    <span>{OP_TEXT[op]}</span>
                  </li>
                ))}
              </ol>
              <div className="thr-reg">
                레지스터 r = <strong>{s.reg[th] ?? '?'}</strong>
              </div>
              <Button small primary onClick={() => run(th)} disabled={fin || blk} label={`스레드 ${TH[th]} 한 줄 실행`}>
                {TH[th]} 한 줄 실행
              </Button>
            </div>
          );
        })}
        <div className="shared-mem" style={{ ['--c' as string]: s.holder >= 0 ? TH_CSS[s.holder] : undefined }}>
          <span className="lbl">공유 메모리</span>
          <span className="lbl mono">count</span>
          <span className="val mono" style={{ color: lost ? 'var(--bad)' : bothDone ? 'var(--good)' : undefined }}>
            {s.mem}
          </span>
          {locked && (
            <span className="lock" data-held={s.holder >= 0 || undefined}>
              m: {s.holder >= 0 ? `${TH[s.holder]}가 잠금` : '열림'}
            </span>
          )}
        </div>
      </div>
      <div className="trace" aria-label="실행한 명령어 순서">
        <span className="lbl">실행한 순서</span>
        {s.trace.length ? (
          s.trace.map((t, i) => (
            <span key={i} className="trace-op" style={{ ['--c' as string]: TH_CSS[t.th] }}>
              {TH[t.th]} {t.op}
              {t.op === 'load' || t.op === 'add' ? ` r=${t.reg}` : t.op === 'store' ? ` →${t.mem}` : ''}
            </span>
          ))
        ) : (
          <span className="os-empty">아직 없음</span>
        )}
      </div>
      <div className="os-note" data-bad={lost || undefined} aria-live="polite">
        {verdict}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: run it a thousand times ─────────────── */

const RUNS = 1000;

function ManyRunsFigure() {
  const P = usePalette();
  const [k, setK] = useState(100);
  const [p, setP] = useState(0.05);
  const [locked, setLocked] = useState(false);
  const [seed, setSeed] = useState(11);
  const runs = useMemo(() => raceMany(RUNS, k, p, locked, seed), [k, p, locked, seed]);
  const counts = runs.map((r) => r.count);
  const right = counts.filter((c) => c === 2 * k).length;
  const mean = counts.reduce((a, b) => a + b, 0) / RUNS;
  const min = Math.min(...counts);
  const steps = runs.reduce((a, r) => a + r.steps, 0) / RUNS;
  const blocks = runs.reduce((a, r) => a + r.blocks, 0) / RUNS;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 40, r: 12, t: 14, b: 34 };
      const lo = Math.min(k, min);
      const hi = 2 * k;
      const nb = Math.min(50, hi - lo + 1);
      const bw = (hi - lo + 1) / nb;
      const bins = Array(nb).fill(0);
      for (const c of counts) bins[Math.min(nb - 1, Math.floor((c - lo) / bw))]++;
      const top = Math.max(...bins);
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const X = (v: number) => pad.l + ((v - lo) / (hi - lo + 1)) * pw;
      const Y = (c: number) => pad.t + ph - (c / top) * ph;
      ctx.strokeStyle = P.grid;
      for (let g = 0; g <= 4; g++) {
        const y = pad.t + (g / 4) * ph;
        ctx.beginPath();
        ctx.moveTo(pad.l, y + 0.5);
        ctx.lineTo(w - pad.r, y + 0.5);
        ctx.stroke();
      }
      text(ctx, String(top), pad.l - 5, pad.t, P.ink3, `10px ${P.fontMono}`, 'right');
      text(ctx, '0', pad.l - 5, pad.t + ph, P.ink3, `10px ${P.fontMono}`, 'right');
      bins.forEach((b, i) => {
        if (!b) return;
        const v0 = lo + i * bw;
        const isRight = v0 + bw > hi;
        ctx.fillStyle = isRight ? P.good : P.bad;
        ctx.fillRect(X(v0) + 0.5, Y(b), Math.max(1.5, X(v0 + bw) - X(v0) - 1), Y(0) - Y(b));
      });
      for (const v of [lo, Math.round((lo + hi) / 2), hi]) text(ctx, String(v), X(v + 0.5), h - 24, v === hi ? P.good : P.ink3, `${v === hi ? 700 : 400} 10px ${P.fontMono}`, 'center');
      label(ctx, P, `정답 ${hi}`, Math.min(w - pad.r - 30, X(hi + 0.5)), pad.t + 2, P.good, `600 10px ${P.fontBody}`);
      text(ctx, '실행 횟수', pad.l + 4, pad.t + 2, P.ink3, `10px ${P.fontBody}`, 'left');
      text(ctx, '최종 count →', w - pad.r, h - 1, P.ink3, `10px ${P.fontBody}`, 'right');
    },
    [P, counts, k, min],
    { aspect: 2.2, maxHeight: 260, minHeight: 200 },
  );

  return (
    <Figure
      no={2}
      title="같은 프로그램을 1,000번 실행하면"
      hint="전환 확률과 락을 바꿔 보세요"
      caption={
        <>
          두 스레드가 각각 count++를 {k}번씩 하는 프로그램을 {RUNS.toLocaleString('ko-KR')}번 실행해, 끝났을 때의 count 값을 막대그래프로 그렸습니다. 명령어 하나를 실행하기 전마다 스케줄러가 정한 확률로 다른 스레드로 바꿉니다. 초록 막대가 정답({2 * k}), 빨간 막대는 갱신을 잃은 실행입니다. 난수는 시드를 고정해 같은 설정이면 언제나 같은 결과가 나옵니다.
        </>
      }
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${RUNS}번 실행한 최종 count의 분포. 정답 ${2 * k}이 나온 비율 ${((right / RUNS) * 100).toFixed(1)}%, 평균 ${mean.toFixed(1)}, 최솟값 ${min}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Check label="뮤텍스로 감싸기" checked={locked} onChange={setLocked} />
          <Slider id="mr-p" label="명령어마다 스레드를 바꿀 확률" value={p} min={0.005} max={0.5} step={0.005} onChange={setP} format={(v) => `${(v * 100).toFixed(1)}%`} />
          <Slider id="mr-k" label="스레드당 count++ 횟수" value={k} min={10} max={200} step={10} onChange={setK} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다시 1,000번
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="정답 비율" value={`${((right / RUNS) * 100).toFixed(1)}%`} color={right === RUNS ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="평균 count" value={mean.toFixed(1)} />
            <Readout label="최솟값" value={String(min)} />
            <Readout label="실행한 명령어" value={`${Math.round(steps)}개`} />
          </div>
          <div className="os-small">{locked ? `락이 잡혀 있어 양보한 횟수: 평균 ${blocks.toFixed(1)}번` : `잃어버린 갱신: 평균 ${(2 * k - mean).toFixed(1)}개`}</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: dining philosophers ─────────────── */

const ST_COLOR = (P: ReturnType<typeof usePalette>, s: PhilState) => (s === 'think' ? P.surface2 : s === 'hungry' ? P.hl : s === 'one' ? P.pos : P.good);

function PhilosophersFigure() {
  const P = usePalette();
  const [n, setN] = useState(5);
  const [strat, setStrat] = useState<Strategy>('left');
  const [together, setTogether] = useState(false);
  const [seed, setSeed] = useState(8);
  const frames = useMemo(() => runPhilosophers(n, strat, seed, together), [n, strat, seed, together]);
  const s = useStepper(frames.length, 6, `${n}|${strat}|${seed}|${together}`);
  const f = frames[s.i];
  const cyc = new Set(f.cycle);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 34;
      const pr = Math.max(17, Math.min(26, R * 0.24));
      const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
      const at = (a: number, r: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      // table
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = P.surface2;
      ctx.fill();
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      // forks: on the table between neighbours, or pulled toward their holder
      for (let k = 0; k < n; k++) {
        const holder = f.forks[k];
        // fork k lies between philosopher k−1 and philosopher k
        let a = ang(k) - Math.PI / n;
        let r0 = R * 0.38;
        let r1 = R * 0.58;
        if (holder >= 0) {
          // shift the fork toward the philosopher holding it
          const toward = ang(holder);
          let d = toward - a;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          a += d * 0.55;
          r0 = R * 0.56;
          r1 = R * 0.76;
        }
        const [x0, y0] = at(a, r0);
        const [x1, y1] = at(a, r1);
        ctx.strokeStyle = holder >= 0 ? P.ink : P.ink3;
        ctx.lineWidth = holder >= 0 ? 4 : 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const [lx, ly] = at(a, r0 - 9);
        text(ctx, String(k), lx, ly, P.ink3, `600 10px ${P.fontMono}`, 'center');
      }
      ctx.lineCap = 'butt';
      // wait-for edges: who waits for whom
      f.waitsFor.forEach((to, i) => {
        if (to < 0) return;
        const [xa, ya] = at(ang(i), R);
        const [xb, yb] = at(ang(to), R);
        const inCycle = cyc.has(i) && cyc.has(to);
        // bend the edge toward the centre so it does not hide the forks
        const mx = (xa + xb) / 2 + (cx - (xa + xb) / 2) * 0.35;
        const my = (ya + yb) / 2 + (cy - (ya + yb) / 2) * 0.35;
        const col = inCycle ? P.bad : alpha(P.bad, 0.55);
        ctx.strokeStyle = col;
        ctx.lineWidth = inCycle ? 2.4 : 1.5;
        ctx.setLineDash(inCycle ? [] : [4, 3]);
        const dx = xb - mx;
        const dy = yb - my;
        const L = Math.hypot(dx, dy);
        const ex = xb - (dx / L) * (pr + 3);
        const ey = yb - (dy / L) * (pr + 3);
        const sx = xa + ((mx - xa) / Math.hypot(mx - xa, my - ya)) * (pr + 2);
        const sy = ya + ((my - ya) / Math.hypot(mx - xa, my - ya)) * (pr + 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(ctx, ex - (dx / L) * 2, ey - (dy / L) * 2, ex, ey, col, inCycle ? 2.4 : 1.5, 8);
      });
      // philosophers
      for (let i = 0; i < n; i++) {
        const [x, y] = at(ang(i), R);
        ctx.beginPath();
        ctx.arc(x, y, pr, 0, Math.PI * 2);
        ctx.fillStyle = ST_COLOR(P, f.st[i]);
        ctx.fill();
        ctx.strokeStyle = i === f.actor ? P.ink : P.lineStrong;
        ctx.lineWidth = i === f.actor ? 3 : 1.5;
        ctx.stroke();
        const dark = f.st[i] === 'one' || f.st[i] === 'eat';
        text(ctx, `P${i}`, x, y - 5, dark ? P.surface : P.ink, `700 ${pr > 20 ? 13 : 11}px ${P.fontMono}`, 'center');
        text(ctx, `${f.meals[i]}끼`, x, y + 8, dark ? P.surface : P.ink2, `${pr > 20 ? 11 : 10}px ${P.fontBody}`, 'center');
      }
      if (f.deadlock) label(ctx, P, '교착 상태: 아무도 움직일 수 없음', cx, cy, P.bad, `700 12px ${P.fontBody}`);
    },
    [P, f, n, cyc],
    { aspect: 1.15, maxHeight: 380, minHeight: 280 },
  );

  const holdWait = f.st.some((x) => x === 'one');
  const circ = f.cycle.length > 0;
  const meals = f.meals.reduce((a, b) => a + b, 0);
  return (
    <Figure
      no={3}
      title="식사하는 철학자들"
      hint="전략을 바꾸고 재생해 보세요"
      caption={
        <>
          둥근 탁자에 철학자 {n}명이 앉아 있고, 이웃 사이마다 포크가 하나씩 모두 {n}개 있습니다. 철학자는 생각하다가 배가 고파지면 포크 두 개를 하나씩 집어 식사하고, 다 먹으면 둘 다 내려놓습니다. 포크는 락이고 철학자는 스레드입니다. 색은 상태(회색 생각, 노랑 배고픔, 주황 포크 하나를 쥐고 기다림, 초록 식사), 빨간 화살표는 누가 누구를 기다리는지 보여 주는 대기 그래프, 굵은 테두리는 방금 움직인 철학자입니다. 매 단계 움직일 수 있는 철학자 중 하나를 무작위로 고릅니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="포크 집는 전략"
          value={strat}
          onChange={setStrat}
          options={[
            { value: 'left', label: '모두 왼쪽 먼저' },
            { value: 'order', label: '번호 작은 포크 먼저' },
            { value: 'waiter', label: '최대 n−1명만 앉기' },
          ]}
        />
        <Slider id="ph-n" label="철학자 수" value={n} min={2} max={6} step={1} onChange={setN} />
      </div>
      <div className="fig-split">
        <div className="os-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`철학자 ${n}명. ${f.st.map((x, i) => `P${i} ${PHIL_KO[x]}`).join(', ')}.${f.deadlock ? ' 교착 상태입니다.' : ''}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="os-note" data-bad={f.deadlock || undefined} aria-live="polite">
            {s.i === 0 ? f.note : `${s.i}단계 · ${f.note}`}
            {f.deadlock && ` → 모두가 포크 하나씩을 쥐고 이웃의 포크를 기다립니다. ${s.i}단계 만에 멈췄습니다.`}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="ph-speed" maxSpeed={30} />
          <Check label="처음에 모두 동시에 배고픔" checked={together} onChange={setTogether} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 무작위 순서
          </Button>
          <div>
            <div className="os-small" style={{ marginBottom: 4 }}>
              교착 상태의 네 가지 조건 (지금 이 순간)
            </div>
            <div className="coffman">
              <div data-on="">
                <i>●</i>
                <span>상호 배제: 포크는 한 번에 한 명만</span>
              </div>
              <div data-on={holdWait || undefined}>
                <i>{holdWait ? '●' : '○'}</i>
                <span>점유 대기: 하나를 쥔 채 다른 것을 기다림</span>
              </div>
              <div data-on="">
                <i>●</i>
                <span>비선점: 남의 포크를 빼앗지 않음</span>
              </div>
              <div data-on={circ || undefined} data-broken={strat !== 'left' || undefined}>
                <i>{circ ? '●' : strat !== 'left' ? '✕' : '○'}</i>
                <span>순환 대기: 기다림이 원을 이룸{strat === 'order' ? ' (번호 순서로 깨짐)' : strat === 'waiter' ? ' (빈자리 하나로 깨짐)' : ''}</span>
              </div>
            </div>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="식사 횟수 합" value={`${meals}끼`} color="var(--good)" />
            <Readout label="상태" value={f.deadlock ? '교착' : '진행 중'} color={f.deadlock ? 'var(--bad)' : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--surface-2)', label: PHIL_KO.think, shape: 'dot' },
          { color: 'var(--hl)', label: PHIL_KO.hungry, shape: 'dot' },
          { color: 'var(--pos)', label: PHIL_KO.one, shape: 'dot' },
          { color: 'var(--good)', label: PHIL_KO.eat, shape: 'dot' },
          { color: 'var(--bad)', label: '기다림 (대기 그래프)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Locks() {
  return (
    <>
      <h2>1을 두 번 더했는데 1</h2>
      <p>
        <a href={lessonHref('cs-operating-systems', 'processes')}>1장</a>에서 스레드는 같은 메모리를 함께 쓴다고 했습니다. 통신이 공짜라는 뜻이지만, 동시에 위험하다는 뜻이기도 합니다. 웹 서버의 스레드 두 개가 방문자 수를 세는 전역 변수 <code>count</code>에 각각 1을 더한다고 해 봅시다. 코드로는 <code>count = count + 1</code> 한 줄이지만, CPU는 이것을 명령어 세 개로 실행합니다. 메모리에서 레지스터로 읽고, 레지스터에서 더하고, 다시 메모리에 씁니다.
      </p>
      <p>
        문제는 운영체제가 스레드를 <strong>아무 명령어 사이에서나</strong> 끊고 다른 스레드를 실행할 수 있다는 것입니다. 코어가 여러 개라면 끊을 필요도 없이 두 스레드가 정말 같은 순간에 실행됩니다. 그림 1에서 스케줄러가 되어 두 스레드의 명령어를 원하는 순서로 실행해 보세요.
      </p>
      <InterleaveFigure />
      <p>
        <strong>A를 다 실행하고 B</strong>를 누르면 count는 2가 됩니다. <strong>한 줄씩 번갈아</strong>를 누르면 1이 됩니다. A가 0을 읽고, B도 0을 읽고, A가 1을 쓰고, B도 1을 씁니다. B는 A가 이미 1을 썼다는 사실을 모른 채 자기가 읽어 둔 낡은 0에 1을 더했습니다. 이렇게 결과가 명령어가 끼어드는 순서에 따라 달라지는 상황을 <T en="race condition">경쟁 조건</T>이라고 하고, 공유 데이터를 건드리는 코드 구간(여기서는 세 명령어)을 <T en="critical section">임계 구역</T>이라고 합니다.
      </p>

      <h2>천 번 돌려 보면</h2>
      <p>
        경쟁 조건이 무서운 것은 대부분의 실행에서는 아무 문제가 없어 보인다는 점입니다. 끼어들기가 임계 구역의 딱 그 자리에서 일어나야만 틀리기 때문입니다. 그림 2는 같은 프로그램을 1,000번 실행해서 결과를 모은 것입니다.
      </p>
      <ManyRunsFigure />
      <p>
        기본 설정(전환 확률 5%, 스레드당 100번)에서는 1,000번 중 정답이 한 번도 나오지 않고 결과가 넓게 퍼집니다. 확률을 0.5%까지 낮추면 정답이 3분의 1쯤 나옵니다. 하지만 나머지 실행은 여전히 수십 개씩 잃어버립니다. 전환이 드물어진 대신, 한 스레드가 count를 읽어 둔 채 쉬는 동안 다른 스레드가 수십 번 더한 것이, 그 스레드가 돌아와 낡은 값을 쓰는 순간 한꺼번에 사라지기 때문입니다. 실제 서버에서는 이런 버그가 테스트에서는 숨어 있다가 트래픽이 몰리는 날에만 나타나고, 디버거를 붙이면 타이밍이 바뀌어 사라지기도 합니다.
      </p>
      <Callout kind="intuition">
        경쟁 조건은 "두 사람이 같은 은행 계좌에서 동시에 돈을 뽑는" 문제입니다. 둘 다 잔액 10만 원을 확인하고, 둘 다 7만 원을 뽑고, 각자 잔액을 3만 원으로 고쳐 씁니다. 14만 원이 나갔는데 잔액은 3만 원입니다. 확인하고 고치는 사이에 남이 끼어들 수 있다면, 그 사이를 한 덩어리로 묶어야 합니다.
      </Callout>

      <h2>뮤텍스: 한 번에 한 스레드만</h2>
      <p>
        해결책은 임계 구역을 <T en="atomic">원자적</T>으로, 즉 중간에 아무도 끼어들 수 없는 한 덩어리로 만드는 것입니다. 가장 흔한 도구가 <T en="mutual exclusion, mutex">뮤텍스</T>(락)입니다. 임계 구역에 들어가기 전에 <code>lock()</code>, 나올 때 <code>unlock()</code>을 부르고, 이미 다른 스레드가 쥔 락을 잡으려는 스레드는 풀릴 때까지 기다립니다. 그림 1과 2에서 뮤텍스를 켜 보세요. 어떤 순서로 실행해도, 1,000번 모두 정답이 나옵니다.
      </p>
      <p>
        그런데 락 자체는 어떻게 만들까요? "락이 비었는지 보고, 비었으면 잡는다"를 평범한 코드로 쓰면 그 사이에 또 끼어들 수 있으니 같은 문제가 되풀이됩니다. 코어가 하나뿐이던 시절에는 임계 구역 동안 인터럽트를 꺼서 해결했지만, 여러 코어에서는 소용이 없습니다. 그래서 CPU가 "읽고 비교하고 쓰기"를 한 명령어로 해 주는 하드웨어 원자 연산을 제공합니다. x86의 <code>lock cmpxchg</code>, ARM의 LDXR/STXR 같은 <T en="compare-and-swap">비교 후 교환</T> 명령입니다. JavaScript에서도 웹 워커 사이에 메모리를 공유하면 같은 도구를 그대로 쓸 수 있습니다.
      </p>
      <Code label="JavaScript의 SharedArrayBuffer와 Atomics">{`
// 여러 워커가 같은 메모리를 본다
const shared = new Int32Array(new SharedArrayBuffer(8));
const COUNT = 0, LOCK = 1;

// 각 워커 안에서
for (let i = 0; i < 1e6; i++) shared[COUNT]++;              // 경쟁 조건: 결과가 모자란다
for (let i = 0; i < 1e6; i++) Atomics.add(shared, COUNT, 1); // 원자적 더하기: 항상 정확

// 원자 연산으로 만든 락
function lock(m) {
  // m[LOCK]이 0이면 1로 바꾸고 0을 돌려준다. 이미 1이면 그대로 두고 1을 돌려준다
  while (Atomics.compareExchange(m, LOCK, 0, 1) !== 0) {
    Atomics.wait(m, LOCK, 1);          // 바쁘게 돌지 말고 잠들어 기다린다
  }
}
function unlock(m) {
  Atomics.store(m, LOCK, 0);
  Atomics.notify(m, LOCK, 1);          // 기다리는 워커 하나를 깨운다
}`}</Code>
      <p>
        락이 풀리기를 반복문으로 계속 확인하며 기다리는 것을 <T en="spinlock">스핀락</T>, 운영체제에게 재워 달라고 했다가 풀릴 때 깨어나는 것을 잠드는 락이라고 합니다. 임계 구역이 아주 짧으면 잠들고 깨는 문맥 교환보다 잠깐 도는 편이 싸고, 길면 CPU를 낭비하지 않는 편이 낫습니다. 리눅스의 pthread 뮤텍스는 먼저 원자 연산으로 시도하고, 실패할 때만 커널의 futex로 잠듭니다. 위의 <code>Atomics.wait</code>가 바로 그 방식입니다.
      </p>
      <Callout kind="warn">
        락에도 값이 있습니다. 그림 2에서 락을 켜면 실행한 명령어가 600개에서 1,000개로 늘고, 락을 쥔 스레드가 쉬는 동안 다른 스레드는 일을 못 하고 양보만 합니다. 실제로는 여러 코어가 같은 락을 두고 다투면 캐시 줄이 코어 사이를 오가며 훨씬 느려집니다. 그래서 임계 구역은 꼭 필요한 만큼만 짧게 잡고, 단순한 카운터라면 락 대신 원자적 더하기를 씁니다.
      </Callout>

      <h2>교착 상태: 서로가 서로를 기다릴 때</h2>
      <p>
        락이 하나면 단순하지만, 실제 프로그램은 락을 여러 개 씁니다. 계좌 이체는 보내는 계좌와 받는 계좌의 락을 둘 다 잡아야 합니다. 스레드 1이 계좌 X에서 Y로, 스레드 2가 Y에서 X로 동시에 이체하면 어떻게 될까요? 스레드 1은 X를 잡고 Y를 기다리고, 스레드 2는 Y를 잡고 X를 기다립니다. 둘 다 영원히 기다리는 이 상황을 <T en="deadlock">교착 상태</T>라고 합니다.
      </p>
      <p>
        1965년 다익스트라(Edsger Dijkstra)가 낸 <T en="dining philosophers">식사하는 철학자</T> 문제는 이것을 둥근 탁자로 일반화한 것입니다. 그림 3에서 철학자 수를 2로 두면 정확히 위의 이체 문제이고, 5로 두면 고전적인 형태입니다.
      </p>
      <PhilosophersFigure />
      <p>
        <strong>모두 왼쪽 먼저</strong> 전략으로 재생하면 처음 순서에서는 74단계 만에 멈춥니다. <strong>다른 무작위 순서</strong>를 눌러 보면 수십에서 이백 단계 안팎에서 멈추는 일이 대부분이고, 운 좋게 끝까지 버티는 순서도 있습니다. "처음에 모두 동시에 배고픔"을 켜면 모두가 왼쪽 포크를 하나씩 집는 최악의 순서가 되어 5단계 만에 멈춥니다. 대기 그래프의 빨간 화살표가 탁자를 한 바퀴 도는 원을 이루는 것을 보세요. 1971년 코프먼(Edward Coffman) 등은 교착 상태가 생기려면 네 조건이 <strong>모두</strong> 성립해야 함을 보였습니다.
      </p>
      <ol>
        <li>
          <T en="mutual exclusion">상호 배제</T>: 자원(포크, 락)을 한 번에 하나만 쓸 수 있다.
        </li>
        <li>
          <T en="hold and wait">점유 대기</T>: 자원을 쥔 채로 다른 자원을 기다린다.
        </li>
        <li>
          <T en="no preemption">비선점</T>: 남이 쥔 자원을 강제로 빼앗을 수 없다.
        </li>
        <li>
          <T en="circular wait">순환 대기</T>: 기다림의 사슬이 원을 이룬다.
        </li>
      </ol>
      <p>
        넷 중 하나만 깨면 교착 상태는 일어나지 않습니다. 실무에서 가장 많이 쓰는 방법은 넷째를 깨는 것입니다. 모든 락에 순서를 정해 두고 언제나 작은 번호부터 잡으면 원이 생길 수 없습니다. 그림 3의 <strong>번호 작은 포크 먼저</strong>가 그것으로, 마지막 철학자만 오른쪽(0번) 포크를 먼저 집습니다. 계좌 이체라면 계좌 번호가 작은 쪽 락부터 잡으면 됩니다. <strong>최대 n−1명만 앉기</strong>는 빈자리를 하나 남겨 원이 닫히지 않게 하는 방법입니다. 그 밖에 <code>trylock</code>으로 잡아 보고 실패하면 쥔 것을 다 내려놓는 방법(점유 대기를 깸)도 있습니다.
      </p>
      <Callout kind="note">
        데이터베이스는 다른 길을 갑니다. 트랜잭션이 어떤 순서로 행을 잠글지 미리 알 수 없으므로, 교착 상태를 막는 대신 일어나면 찾아냅니다. 주기적으로 대기 그래프를 그려 원이 보이면 그중 한 트랜잭션을 강제로 취소(선점)하고 다시 시도하게 합니다. MySQL이나 PostgreSQL이 "deadlock detected" 오류를 내는 것이 이 경우입니다. 트랜잭션과 락은 <a href={lessonHref('cs-databases', 'transactions')}>트랜잭션</a> 장에서 이어집니다.
      </Callout>

      <Callout kind="key">
        여러 스레드가 공유 데이터를 읽고-고치고-쓰는 사이에 끼어들 수 있으면 경쟁 조건이 생겨, 결과가 실행 순서에 따라 달라집니다. 임계 구역을 뮤텍스로 감싸거나 원자적 연산을 쓰면 한 번에 한 스레드만 들어가고, 락은 하드웨어의 비교 후 교환 명령으로 만듭니다. 락을 여러 개 쓰면 교착 상태가 생길 수 있는데, 상호 배제, 점유 대기, 비선점, 순환 대기가 모두 성립할 때만 일어나므로 락을 잡는 순서를 정해 순환 대기를 깨는 것이 가장 흔한 처방입니다.
      </Callout>
      <Quiz
        q="함수 transfer(from, to)가 lock(from); lock(to); … unlock(to); unlock(from); 순서로 두 계좌의 락을 잡는다. 서버에서 가끔 요청이 영원히 멈춘다. 가장 알맞은 고침은?"
        options={['lock 사이에 sleep(1)을 넣어 다른 스레드가 먼저 끝내게 한다', '두 계좌 중 번호가 작은 쪽 락을 언제나 먼저 잡는다', '락을 없애고 잔액 계산을 두 번 해서 결과를 비교한다', 'unlock 순서를 lock 순서와 같게 바꾼다']}
        answer={1}
        explain={<>transfer(X, Y)와 transfer(Y, X)가 동시에 오면 하나는 X를, 하나는 Y를 쥐고 서로를 기다리는 순환 대기가 생깁니다. 계좌 번호처럼 전체 순서가 있는 기준으로 언제나 작은 쪽부터 잡으면 두 요청 모두 같은 락을 먼저 노리므로 원이 생기지 않습니다. sleep은 타이밍만 바꿀 뿐 교착 상태를 없애지 못하고, 락을 푸는 순서는 교착 상태와 상관이 없습니다.</>}
      />
    </>
  );
}
