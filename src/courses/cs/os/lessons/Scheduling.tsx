import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { hatch, text } from './draw';
import { ALGO_NAMES, PROC_CSS, PROC_NAMES, metrics, procColor, runMlfq, schedule, type Algo, type Job, type MlfqJob } from './procs';
import './os.css';

/* ─────────────── job sets ─────────────── */

type PresetId = 'basic' | 'convoy' | 'same';
const PRESETS: Record<PresetId, Job[]> = {
  basic: [
    { arrive: 0, burst: 7 },
    { arrive: 2, burst: 4 },
    { arrive: 4, burst: 1 },
    { arrive: 5, burst: 4 },
  ],
  convoy: [
    { arrive: 0, burst: 20 },
    { arrive: 1, burst: 2 },
    { arrive: 2, burst: 2 },
    { arrive: 3, burst: 2 },
  ],
  same: [
    { arrive: 0, burst: 6 },
    { arrive: 0, burst: 6 },
    { arrive: 0, burst: 6 },
    { arrive: 0, burst: 6 },
  ],
};
const PRESET_OPTS: { value: PresetId; label: string }[] = [
  { value: 'basic', label: '기본' },
  { value: 'convoy', label: '호위 효과' },
  { value: 'same', label: '모두 같은 길이' },
];
const ALGOS: Algo[] = ['fcfs', 'sjf', 'srtf', 'rr'];
const MAX_JOBS = 6;
const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

// numbers quoted in the prose
const avgOf = (jobs: Job[], a: Algo, q = 2) => metrics(jobs, schedule(jobs, a, q));
const BASIC = Object.fromEntries(ALGOS.map((a) => [a, avgOf(PRESETS.basic, a)])) as Record<Algo, ReturnType<typeof metrics>>;
const CONVOY = Object.fromEntries(ALGOS.map((a) => [a, avgOf(PRESETS.convoy, a)])) as Record<Algo, ReturnType<typeof metrics>>;
const SAME = Object.fromEntries(ALGOS.map((a) => [a, avgOf(PRESETS.same, a)])) as Record<Algo, ReturnType<typeof metrics>>;

/* ─────────────── Figure 1: a job table and its Gantt chart ─────────────── */

function GanttFigure({ jobs, setJobs, algo, setAlgo, q, setQ }: { jobs: Job[]; setJobs: (j: Job[]) => void; algo: Algo; setAlgo: (a: Algo) => void; q: number; setQ: (v: number) => void }) {
  const P = usePalette();
  const [preset, setPreset] = useState<PresetId | null>('basic');
  const res = useMemo(() => schedule(jobs, algo, q), [jobs, algo, q]);
  const m = useMemo(() => metrics(jobs, res), [jobs, res]);
  const [scrub, setScrub] = useState<number | null>(null);
  const tNow = scrub === null ? res.end : Math.min(scrub, res.end);

  const edit = (i: number, key: keyof Job, v: number) => {
    setJobs(jobs.map((j, k) => (k === i ? { ...j, [key]: key === 'burst' ? clampInt(v, 1, 20) : clampInt(v, 0, 30) } : j)));
    setPreset(null);
  };
  const pick = (id: PresetId) => {
    setPreset(id);
    setJobs(PRESETS[id].map((j) => ({ ...j })));
    setScrub(null);
  };

  const n = jobs.length;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const lw = 34;
      const top = 4;
      const cpuH = 26;
      const rh = 14;
      const T = Math.max(10, res.end);
      const cw = (w - lw - 8) / T;
      const X = (t: number) => lw + t * cw;
      // CPU lane
      text(ctx, 'CPU', 4, top + cpuH / 2, P.ink, `700 11px ${P.fontMono}`);
      ctx.fillStyle = P.surface2;
      ctx.fillRect(X(0), top, T * cw, cpuH);
      for (const sl of res.slices) {
        const end = Math.min(sl.end, tNow);
        if (sl.start >= tNow) continue;
        if (sl.job < 0) {
          hatch(ctx, X(sl.start), top, (end - sl.start) * cw, cpuH, alpha(P.ink3, 0.5), 4);
          continue;
        }
        ctx.fillStyle = procColor(P, sl.job);
        ctx.fillRect(X(sl.start), top, (end - sl.start) * cw - 1, cpuH);
        if ((end - sl.start) * cw > 13) text(ctx, PROC_NAMES[sl.job], X((sl.start + end) / 2), top + cpuH / 2 + 0.5, P.surface, `700 12px ${P.fontMono}`, 'center');
      }
      // one lane per job: waiting (light), running (solid), arrival marker
      const y0 = top + cpuH + 10;
      jobs.forEach((j, i) => {
        const y = y0 + i * (rh + 6);
        const c = procColor(P, i);
        text(ctx, PROC_NAMES[i], 4, y + rh / 2, c, `700 11px ${P.fontMono}`);
        const fin = Math.min(res.finish[i], tNow);
        if (j.arrive < tNow) {
          ctx.fillStyle = alpha(c, 0.22);
          ctx.fillRect(X(j.arrive), y + 3, Math.max(0, (fin - j.arrive) * cw), rh - 6);
        }
        for (const sl of res.slices) {
          if (sl.job !== i || sl.start >= tNow) continue;
          ctx.fillStyle = c;
          ctx.fillRect(X(sl.start), y, (Math.min(sl.end, tNow) - sl.start) * cw - 1, rh);
        }
        // arrival tick
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.moveTo(X(j.arrive), y - 1);
        ctx.lineTo(X(j.arrive) - 4, y - 6);
        ctx.lineTo(X(j.arrive) + 4, y - 6);
        ctx.closePath();
        ctx.fill();
        if (res.finish[i] <= tNow) {
          ctx.fillStyle = P.ink;
          ctx.fillRect(X(res.finish[i]) - 1, y - 2, 2, rh + 4);
        }
      });
      const yb = y0 + n * (rh + 6) + 6;
      const step = T > 40 ? 10 : 5;
      ctx.strokeStyle = P.grid;
      for (let t = 0; t <= T; t += step) {
        text(ctx, String(t), X(t), yb, P.ink3, `10px ${P.fontMono}`, t === 0 ? 'left' : 'center');
        ctx.beginPath();
        ctx.moveTo(X(t) + 0.5, top);
        ctx.lineTo(X(t) + 0.5, yb - 7);
        ctx.stroke();
      }
      if (tNow < res.end) {
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(X(tNow), top - 2);
        ctx.lineTo(X(tNow), yb - 7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [P, res, jobs, tNow, n],
    { height: 4 + 26 + 10 + n * 20 + 16, minHeight: 40 },
  );

  const tick = Math.min(tNow, res.end - 1);
  const onCpu = res.slices.find((sl) => sl.start <= tick && tick < sl.end)?.job ?? -1;
  const waiting = res.queues[tick] ?? [];
  return (
    <Figure
      no={1}
      title="같은 작업, 네 가지 스케줄러"
      hint="알고리즘을 바꾸고 표의 숫자를 고쳐 보세요"
      caption={
        <>
          맨 위 줄은 CPU가 시간마다 어느 작업을 실행했는지 보여 주는 간트 차트입니다. 그 아래 작업별 줄에서 ▼는 도착한 시각, 꽉 찬 칸은 실행, 옅은 칸은 준비 큐에서 기다린 시간, 세로 막대는 끝난 시각입니다. 회색 빗금은 아무 작업도 없어 CPU가 논 시간입니다. 표의 대기·반환·응답 시간은 모두 틱 단위이고, 문맥 교환 비용은 0으로 두었습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="스케줄러" value={algo} onChange={(a) => { setAlgo(a); setScrub(null); }} options={ALGOS.map((a) => ({ value: a, label: ALGO_NAMES[a] }))} />
        <Seg label="예시 작업" value={preset ?? ('' as PresetId)} onChange={pick} options={PRESET_OPTS} />
      </div>
      {algo === 'rr' && <Slider id="g-q" label="타임 퀀텀 q (틱)" value={q} min={1} max={10} step={1} onChange={(v) => { setQ(v); setScrub(null); }} />}
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${ALGO_NAMES[algo]} 간트 차트: ${res.slices.filter((sl) => sl.job >= 0).map((sl) => `${PROC_NAMES[sl.job]} ${sl.start}~${sl.end}`).join(', ')}`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="fig-split">
        <div className="job-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th>작업</th>
                <th>도착</th>
                <th>실행 시간</th>
                <th>대기</th>
                <th>반환</th>
                <th>응답</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, i) => (
                <tr key={i}>
                  <td>
                    <span className="job-name" style={{ ['--c' as string]: PROC_CSS[i] }}>
                      <i aria-hidden="true" />
                      {PROC_NAMES[i]}
                    </span>
                  </td>
                  <td>
                    <input className="num-input" type="number" min={0} max={30} value={j.arrive} aria-label={`작업 ${PROC_NAMES[i]} 도착 시각`} onChange={(e) => edit(i, 'arrive', parseInt(e.target.value, 10))} />
                  </td>
                  <td>
                    <input className="num-input" type="number" min={1} max={20} value={j.burst} aria-label={`작업 ${PROC_NAMES[i]} 실행 시간`} onChange={(e) => edit(i, 'burst', parseInt(e.target.value, 10))} />
                  </td>
                  <td className="mono">{m.wait[i]}</td>
                  <td className="mono">{m.turnaround[i]}</td>
                  <td className="mono">{m.response[i]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>평균</td>
                <td className="mono">{fmt1(m.avgWait)}</td>
                <td className="mono">{fmt1(m.avgTurn)}</td>
                <td className="mono">{fmt1(m.avgResp)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <Button small onClick={() => { setJobs([...jobs, { arrive: Math.min(30, jobs[jobs.length - 1].arrive + 1), burst: 3 }]); setPreset(null); }} disabled={n >= MAX_JOBS}>
              작업 추가
            </Button>
            <Button small onClick={() => { setJobs(jobs.slice(0, -1)); setPreset(null); }} disabled={n <= 1}>
              마지막 작업 빼기
            </Button>
          </div>
        </div>
        <div className="controls">
          <Slider id="g-t" label="시각 되감기" value={tNow} min={0} max={res.end} step={1} onChange={(v) => setScrub(v >= res.end ? null : v)} format={(v) => `${v}틱`} />
          <div className="os-chips" aria-live="polite">
            <span className="lbl">t = {tick} CPU</span>
            <span className="os-chip" data-on="" style={onCpu >= 0 ? { ['--c' as string]: PROC_CSS[onCpu] } : undefined}>
              {onCpu >= 0 ? PROC_NAMES[onCpu] : '쉼'}
            </span>
          </div>
          <div className="os-chips">
            <span className="lbl">준비 큐</span>
            {waiting.length ? (
              waiting.map((k) => (
                <span key={k} className="os-chip" data-c="" style={{ ['--c' as string]: PROC_CSS[k] }}>
                  {PROC_NAMES[k]}
                </span>
              ))
            ) : (
              <span className="os-empty">비어 있음</span>
            )}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="평균 대기" value={fmt1(m.avgWait)} color="var(--pos)" />
            <Readout label="평균 응답" value={fmt1(m.avgResp)} color="var(--neg)" />
            <Readout label="문맥 교환" value={`${res.switches}번`} />
            <Readout label="모두 끝난 시각" value={`${res.end}틱`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: all four side by side, and the quantum sweep ─────────────── */

const ALGO_COLOR: Record<Algo, string> = { fcfs: 'var(--c-cs-1)', sjf: 'var(--c-cs-2)', srtf: 'var(--good)', rr: 'var(--pos)' };

function CompareFigure({ jobs, algo, q, setQ }: { jobs: Job[]; algo: Algo; q: number; setQ: (v: number) => void }) {
  const P = usePalette();
  const [metric, setMetric] = useState<'avgWait' | 'avgResp' | 'avgTurn'>('avgWait');
  const all = useMemo(() => Object.fromEntries(ALGOS.map((a) => [a, metrics(jobs, schedule(jobs, a, q))])) as Record<Algo, ReturnType<typeof metrics>>, [jobs, q]);
  const maxBurst = Math.max(...jobs.map((j) => j.burst));
  const qMax = Math.max(8, maxBurst + 1);
  const sweep = useMemo(
    () =>
      Array.from({ length: qMax }, (_, k) => {
        const r = schedule(jobs, 'rr', k + 1);
        const mm = metrics(jobs, r);
        return { turn: mm.avgTurn, resp: mm.avgResp, sw: r.switches };
      }),
    [jobs, qMax],
  );
  const top = Math.max(...ALGOS.map((a) => all[a][metric]), 0.5);
  const fcfsTurn = all.fcfs.avgTurn;
  const srtfTurn = all.srtf.avgTurn;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const gap = 12;
      const h1 = (h - gap) * 0.62;
      const yMax = Math.max(...sweep.map((s) => Math.max(s.turn, s.resp)), fcfsTurn) * 1.12;
      const pad = { l: 36, r: 10, t: 20, b: 8 };
      const p1 = new Plot(ctx, w, h1, P, { xMin: 0.5, xMax: qMax + 0.5, yMin: 0, yMax, pad });
      p1.grid({ xStep: 1, yStep: yMax > 30 ? 10 : 5, labels: false });
      for (let y = 0; y <= yMax; y += yMax > 30 ? 10 : 5) text(ctx, String(y), p1.X(0.5) - 5, p1.Y(y), P.ink3, `10px ${P.fontMono}`, 'right');
      text(ctx, '라운드 로빈의 평균 시간 (틱)', p1.X(0.5), 9, P.ink2, `12px ${P.fontBody}`);
      p1.line(0.5, fcfsTurn, qMax + 0.5, fcfsTurn, alpha(P.ink2, 0.8), 1.2, [5, 4]);
      text(ctx, 'FCFS 반환', p1.X(qMax + 0.5) - 2, p1.Y(fcfsTurn) - 8, P.ink2, `10px ${P.fontBody}`, 'right');
      p1.line(0.5, srtfTurn, qMax + 0.5, srtfTurn, alpha(P.good, 0.9), 1.2, [2, 3]);
      text(ctx, 'SRTF 반환', p1.X(qMax + 0.5) - 2, p1.Y(srtfTurn) + 9, P.good, `10px ${P.fontBody}`, 'right');
      const series: [keyof (typeof sweep)[0], string][] = [
        ['turn', P.pos],
        ['resp', P.neg],
      ];
      for (const [key, col] of series) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        sweep.forEach((s, k) => (k ? ctx.lineTo(p1.X(k + 1), p1.Y(s[key])) : ctx.moveTo(p1.X(k + 1), p1.Y(s[key]))));
        ctx.stroke();
        sweep.forEach((s, k) => p1.dot(k + 1, s[key], k + 1 === q ? 5 : 2.4, col, k + 1 === q ? P.surface : undefined, 2));
      }
      p1.line(q, 0, q, yMax, alpha(P.ink, 0.35), 1.2, [4, 4]);

      ctx.save();
      ctx.translate(0, h1 + gap);
      const sMax = Math.max(4, ...sweep.map((s) => s.sw));
      const p2 = new Plot(ctx, w, h - h1 - gap, P, { xMin: 0.5, xMax: qMax + 0.5, yMin: 0, yMax: sMax * 1.15, pad: { l: 36, r: 10, t: 20, b: 20 } });
      text(ctx, '문맥 교환 횟수', p2.X(0.5), 9, P.ink2, `12px ${P.fontBody}`);
      sweep.forEach((s, k) => {
        const x = p2.X(k + 1);
        const bw = Math.max(3, p2.sx * 0.6);
        ctx.fillStyle = k + 1 === q ? P.ink : alpha(P.ink3, 0.5);
        ctx.fillRect(x - bw / 2, p2.Y(s.sw), bw, p2.Y(0) - p2.Y(s.sw));
        if (qMax <= 12 || (k + 1) % 2 === 1) text(ctx, String(k + 1), x, p2.Y(0) + 10, k + 1 === q ? P.ink : P.ink3, `${k + 1 === q ? 700 : 400} 10px ${P.fontMono}`, 'center');
      });
      text(ctx, String(sweep[q - 1]?.sw ?? ''), p2.X(q), p2.Y(sweep[q - 1]?.sw ?? 0) - 8, P.ink, `700 10px ${P.fontMono}`, 'center');
      ctx.restore();
    },
    [P, sweep, q, qMax, fcfsTurn, srtfTurn],
    { aspect: 1.5, maxHeight: 360, minHeight: 280 },
  );

  return (
    <Figure
      no={2}
      title="네 알고리즘 비교, 그리고 퀀텀의 크기"
      hint="그림 1의 작업이 그대로 쓰입니다"
      caption={
        <>
          왼쪽 막대는 그림 1의 작업들을 네 스케줄러에 똑같이 넣었을 때의 평균입니다. 오른쪽 위 그래프는 라운드 로빈의 퀀텀을 1부터 바꿔 가며 잰 평균 반환 시간(주황)과 평균 응답 시간(파랑)이고, 아래 막대는 그때의 문맥 교환 횟수입니다. 점선은 FCFS와 SRTF의 평균 반환 시간입니다. 퀀텀이 가장 긴 작업보다 길어지면 라운드 로빈은 FCFS와 똑같아집니다.
        </>
      }
    >
      <div className="fig-split left">
        <div className="controls">
          <Seg
            label="비교할 값"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'avgWait', label: '대기' },
              { value: 'avgResp', label: '응답' },
              { value: 'avgTurn', label: '반환' },
            ]}
          />
          <div className="os-bars">
            {ALGOS.map((a) => (
              <div key={a} className="os-bar" data-cur={a === algo || undefined}>
                <span className="os-bar-name">{a === 'rr' ? `RR (q=${q})` : ALGO_NAMES[a]}</span>
                <span className="os-bar-track">
                  <span className="os-bar-fill" style={{ width: `${(all[a][metric] / top) * 100}%`, background: ALGO_COLOR[a] }} />
                </span>
                <span className="os-bar-val">{fmt1(all[a][metric])}</span>
              </div>
            ))}
          </div>
          <Slider id="c-q" label="라운드 로빈 퀀텀 q" value={q} min={1} max={qMax} step={1} onChange={setQ} />
          <div className="os-small">SRTF는 평균 대기 시간이 가장 짧도록 고르는 방법이지만, 작업 길이를 미리 알아야 합니다.</div>
        </div>
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`퀀텀 q가 1부터 ${qMax}까지일 때 라운드 로빈의 평균 반환·응답 시간과 문맥 교환 횟수. 지금 q=${q}에서 평균 반환 ${fmt1(sweep[q - 1]?.turn ?? 0)}, 평균 응답 ${fmt1(sweep[q - 1]?.resp ?? 0)}, 교환 ${sweep[q - 1]?.sw ?? 0}번`}>
          <canvas ref={canvasRef} />
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: 'RR 평균 반환', shape: 'ln' },
          { color: 'var(--neg)', label: 'RR 평균 응답', shape: 'ln' },
          { color: 'var(--ink-2)', label: 'FCFS 반환 (점선)', shape: 'ln' },
          { color: 'var(--good)', label: 'SRTF 반환 (점선)', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: a multi-level feedback queue ─────────────── */

const rep = (a: number[], k: number) => Array.from({ length: k }, () => a).flat();
type Scenario = 'mixed' | 'gamer';
const MLFQ_JOBS: Record<Scenario, MlfqJob[]> = {
  mixed: [
    { name: 'A', arrive: 0, bursts: [40] },
    { name: 'B', arrive: 3, bursts: [...rep([1, 3], 8), 1] },
    { name: 'C', arrive: 6, bursts: [...rep([3, 3], 4), 3] },
  ],
  gamer: [
    { name: 'A', arrive: 0, bursts: [30] },
    { name: 'G', arrive: 2, bursts: [...rep([1, 1], 20), 1] },
    { name: 'H', arrive: 3, bursts: [...rep([1, 1], 20), 1] },
  ],
};
const QUANTA = [2, 4, 8];
const MLFQ_T = 90;

function MlfqFigure() {
  const P = usePalette();
  const [sc, setSc] = useState<Scenario>('mixed');
  const [boost, setBoost] = useState(false);
  const [allot, setAllot] = useState(false);
  const jobs = MLFQ_JOBS[sc];
  const frames = useMemo(() => runMlfq(jobs, { quanta: QUANTA, boost: boost ? 20 : 0, allotment: allot }, MLFQ_T), [jobs, boost, allot]);
  const s = useStepper(frames.length, 8, `${sc}|${boost}|${allot}`, true);
  const f = frames[s.i];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const lw = 30;
      const lh = 22;
      const top = 4;
      const cw = (w - lw - 6) / MLFQ_T;
      const X = (t: number) => lw + t * cw;
      for (let l = 0; l < 3; l++) {
        const y = top + l * (lh + 4);
        text(ctx, `Q${l}`, 4, y + lh / 2, P.ink2, `700 11px ${P.fontMono}`);
        ctx.fillStyle = P.surface2;
        ctx.fillRect(X(0), y, MLFQ_T * cw, lh);
      }
      for (let t = 0; t <= s.i; t++) {
        const fr = frames[t];
        if (fr.boosted) {
          ctx.fillStyle = P.hl;
          ctx.fillRect(X(t) - 1, top - 3, 2, 3 * (lh + 4) + 2);
        }
        if (fr.running < 0) continue;
        const l = fr.level[fr.running];
        ctx.fillStyle = procColor(P, fr.running);
        ctx.fillRect(X(t), top + l * (lh + 4), Math.max(1, cw - 0.4), lh);
      }
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(s.i) + 0.5, top - 2, Math.max(2, cw - 1), 3 * (lh + 4));
      const yb = top + 3 * (lh + 4) + 8;
      for (let t = 0; t <= MLFQ_T; t += 10) text(ctx, String(t), X(t), yb, P.ink3, `10px ${P.fontMono}`, t === 0 ? 'left' : 'center');
    },
    [P, frames, s.i],
    { height: 4 + 3 * 26 + 18, minHeight: 40 },
  );

  const doneAt = (i: number) => frames.findIndex((fr) => fr.state[i] === 'done');
  return (
    <Figure
      no={3}
      title="다단계 피드백 큐"
      hint="규칙을 켜고 끄며 A가 얼마나 CPU를 받는지 보세요"
      caption={
        <>
          세 줄은 우선순위 큐 Q0(가장 높음, 퀀텀 {QUANTA[0]}), Q1(퀀텀 {QUANTA[1]}), Q2(퀀텀 {QUANTA[2]})입니다. 칸 하나가 1틱이고, CPU가 그 틱에 실행한 작업을 그 작업이 속한 큐의 줄에 칠했습니다. 노란 세로선은 우선순위 올리기가 일어난 시각입니다. A는 CPU만 쓰는 긴 일괄 작업이고, {sc === 'mixed' ? 'B는 1틱 계산하고 3틱 입출력을 기다리는 대화형 작업, C는 3틱씩 계산하는 중간 작업' : 'G와 H는 퀀텀(2틱)을 다 쓰기 직전인 1틱마다 일부러 입출력을 해서 CPU를 내놓는 꼼수 작업'}입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="작업 묶음" value={sc} onChange={setSc} options={[{ value: 'mixed', label: '대화형 + 일괄' }, { value: 'gamer', label: '꼼수 쓰는 작업' }]} />
        <Check label="20틱마다 모두 Q0로 올리기" checked={boost} onChange={setBoost} />
        <Check label="큐마다 쓴 시간을 누적해 강등" checked={allot} onChange={setAllot} />
      </div>
      <div className="fig-split">
        <div className="os-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`다단계 피드백 큐 기록, 시각 ${f.t}. ${jobs.map((j, i) => `${j.name}는 Q${f.level[i]}에서 지금까지 CPU ${f.got[i]}틱`).join(', ')}`}>
            <canvas ref={canvasRef} />
          </div>
          <div aria-live="polite">
            {f.queues.map((qq, l) => (
              <div key={l} className="mlfq-q">
                <span className="lbl">
                  Q{l} · q={QUANTA[l]}
                </span>
                <span className="os-chips" style={{ minHeight: 0 }}>
                  {f.running >= 0 && f.level[f.running] === l && (
                    <span className="os-chip" data-on="" style={{ ['--c' as string]: PROC_CSS[f.running] }} title="실행 중">
                      {jobs[f.running].name}
                    </span>
                  )}
                  {qq.map((k) => (
                    <span key={k} className="os-chip" data-c="" style={{ ['--c' as string]: PROC_CSS[k] }}>
                      {jobs[k].name}
                    </span>
                  ))}
                  {!qq.length && !(f.running >= 0 && f.level[f.running] === l) && <span className="os-empty">비어 있음</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="os-note">
            t = {f.t} · {f.event || '변화 없음'}
          </div>
        </div>
        <div className="controls">
          <StepControls s={s} id="mlfq-speed" maxSpeed={30} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            {jobs.map((j, i) => (
              <Readout key={j.name} label={`${j.name}의 CPU`} value={`${f.got[i]}틱`} color={PROC_CSS[i]} />
            ))}
          </div>
          <div className="os-small">
            A가 끝난 시각: {doneAt(0) >= 0 ? `${doneAt(0)}틱` : `${MLFQ_T}틱 안에 못 끝남`}
            {sc === 'gamer' && ` · A가 처음 20틱 동안 받은 CPU: ${frames[Math.min(22, frames.length - 1)].got[0] - frames[2].got[0]}틱 (t=3~22)`}
          </div>
        </div>
      </div>
      <Legend items={jobs.map((j, i) => ({ color: PROC_CSS[i], label: j.name, shape: 'sq' as const }))} />
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Scheduling() {
  const [jobs, setJobs] = useState<Job[]>(PRESETS.basic.map((j) => ({ ...j })));
  const [algo, setAlgo] = useState<Algo>('fcfs');
  const [q, setQ] = useState(2);
  return (
    <>
      <h2>준비 큐에서 누구를 꺼낼까</h2>
      <p>
        <a href={lessonHref('cs-operating-systems', 'processes')}>앞 장</a>에서 본 준비 큐에는 언제나 CPU를 기다리는 프로세스가 여럿 있습니다. 그중 누구에게 다음 차례를 줄지 정하는 운영체제의 부분이 <T en="CPU scheduler">CPU 스케줄러</T>입니다. 스케줄러가 끼어드는 때는 실행 중인 프로세스가 입출력을 요청하거나 끝날 때, 그리고 타이머 인터럽트가 울릴 때입니다. 앞의 두 경우에만 고르는 방식을 <T en="non-preemptive">비선점</T>, 타이머로 실행 중인 프로세스를 끊을 수도 있는 방식을 <T en="preemptive">선점</T> 스케줄링이라고 합니다.
      </p>
      <p>이 장에서는 프로세스 대신 <strong>작업</strong>이라고 부르고, 작업마다 도착한 시각과 필요한 CPU 시간만 있다고 단순하게 생각합니다. 그러면 좋은 스케줄러인지 재는 잣대는 세 가지입니다.</p>
      <MB note="도착: 준비 큐에 들어온 시각, 실행 시간: 필요한 CPU 시간">{'\\begin{aligned} \\text{반환 시간} &= \\text{끝난 시각} - \\text{도착 시각} \\\\ \\text{대기 시간} &= \\text{반환 시간} - \\text{실행 시간} \\\\ \\text{응답 시간} &= \\text{처음 실행된 시각} - \\text{도착 시각} \\end{aligned}'}</MB>
      <p>
        <T en="turnaround time">반환 시간</T>은 일을 맡기고 결과를 받기까지 걸린 시간으로, 밤새 도는 일괄 작업에서 중요합니다. <T en="waiting time">대기 시간</T>은 그중 준비 큐에서 허비한 시간입니다. <T en="response time">응답 시간</T>은 처음으로 CPU를 받기까지의 시간으로, 키를 누르면 바로 반응해야 하는 대화형 프로그램에서 중요합니다. 이 셋을 모두 최선으로 만드는 스케줄러는 없습니다.
      </p>

      <h2>먼저 온 순서대로: FCFS</h2>
      <p>
        가장 단순한 방법은 은행 창구처럼 먼저 온 작업부터 끝까지 실행하는 <T en="first-come, first-served">FCFS</T>입니다. 준비 큐를 그냥 큐로 쓰면 되고, 누구도 끝없이 밀리지 않습니다. 그림 1의 기본 작업 네 개로 시작해 보세요.
      </p>
      <GanttFigure jobs={jobs} setJobs={setJobs} algo={algo} setAlgo={setAlgo} q={q} setQ={setQ} />
      <p>
        FCFS의 평균 대기 시간은 {fmt1(BASIC.fcfs.avgWait)}틱입니다. 1틱이면 끝나는 C가 7틱짜리 A와 4틱짜리 B 뒤에서 기다리느라 7틱을 허비합니다. 예시를 <strong>호위 효과</strong>로 바꾸면 더 극단적입니다. 20틱짜리 작업 뒤에 2틱짜리 세 개가 줄을 서서 평균 대기 시간이 {fmt1(CONVOY.fcfs.avgWait)}틱이 됩니다. 느린 트럭 뒤에 승용차들이 줄줄이 붙어 가는 모습과 같아서 <T en="convoy effect">호위 효과</T>라고 부릅니다. 실제로는 CPU를 오래 쓰는 프로세스 하나 때문에 입출력 위주의 프로세스들이 디스크를 놀리며 기다리게 되어, CPU와 장치가 번갈아 쉬는 일이 생깁니다.
      </p>

      <h2>짧은 작업 먼저: SJF와 SRTF</h2>
      <p>
        짧은 작업을 먼저 끝내면 뒤에서 기다리는 작업 수가 빨리 줄어듭니다. CPU가 비면 준비 큐에서 실행 시간이 가장 짧은 작업을 고르는 것이 <T en="shortest job first">SJF</T>입니다. 기본 예시에서 SJF는 A가 끝난 뒤 C(1틱)를 B보다 먼저 실행해 평균 대기를 {fmt1(BASIC.sjf.avgWait)}틱으로 줄입니다. 하지만 호위 효과 예시에서는 FCFS와 똑같이 {fmt1(CONVOY.sjf.avgWait)}틱입니다. 짧은 작업들이 도착했을 때 이미 긴 작업이 CPU를 잡고 있고, SJF는 비선점이라 그 작업을 끊지 못하기 때문입니다.
      </p>
      <p>
        선점을 더하면 이 문제가 풀립니다. 새 작업이 올 때마다 <strong>남은</strong> 시간을 비교해, 실행 중인 작업보다 짧은 작업이 오면 바로 바꾸는 것이 <T en="shortest remaining time first">SRTF</T>입니다. 호위 효과 예시에서 평균 대기가 {fmt1(CONVOY.srtf.avgWait)}틱으로, 기본 예시에서도 {fmt1(BASIC.srtf.avgWait)}틱으로 넷 중 가장 짧습니다. 실제로 SRTF는 평균 대기 시간을 가장 작게 만드는 방법임이 증명되어 있습니다.
      </p>
      <Callout kind="warn">
        SJF와 SRTF에는 큰 약점이 둘 있습니다. 첫째, 운영체제는 작업이 CPU를 얼마나 쓸지 미리 알 수 없습니다. 그래서 지난 실행 시간들로 다음 값을 짐작합니다. 흔한 방법은 지수 평균 <M>{'\\tau_{n+1} = \\alpha t_n + (1-\\alpha)\\tau_n'}</M>으로, 방금 잰 실행 시간 <M>{'t_n'}</M>과 이전 예측 <M>{'\\tau_n'}</M>을 섞습니다. 둘째, 짧은 작업이 계속 들어오면 긴 작업은 영원히 차례가 오지 않을 수 있습니다. 이를 <T en="starvation">기아</T>라고 합니다.
      </Callout>

      <h2>돌아가며 조금씩: 라운드 로빈</h2>
      <p>
        <T en="round robin">라운드 로빈</T>은 준비 큐를 FCFS처럼 쓰되, 한 번에 <T en="time quantum">타임 퀀텀</T> q만큼만 실행하고 끝나지 않았으면 큐의 맨 뒤로 보냅니다. 그림 1에서 스케줄러를 라운드 로빈으로 바꾸고 예시를 <strong>모두 같은 길이</strong>로 두어 보세요. 6틱짜리 작업 넷이 동시에 도착했을 때 FCFS의 평균 응답 시간은 {fmt1(SAME.fcfs.avgResp)}틱이지만 라운드 로빈(q=2)은 {fmt1(SAME.rr.avgResp)}틱입니다. 반면 평균 반환 시간은 {fmt1(SAME.fcfs.avgTurn)}틱에서 {fmt1(SAME.rr.avgTurn)}틱으로 오히려 늘어납니다. 모두가 조금씩 나눠 받느라 다 같이 늦게 끝나기 때문입니다.
      </p>
      <Code label="라운드 로빈 스케줄러 (틱 단위 시뮬레이션)">{`
function roundRobin(jobs, q) {        // jobs: [{ arrive, burst }]
  const left = jobs.map(j => j.burst);
  const queue = [], order = [];        // order[t] = t에 실행한 작업
  let t = 0, run = -1, used = 0, done = 0;
  while (done < jobs.length) {
    jobs.forEach((j, i) => { if (j.arrive === t) queue.push(i); });
    if (run >= 0 && left[run] === 0) { done++; run = -1; }   // 끝남
    if (run >= 0 && used === q && queue.length) {           // 퀀텀 소진
      queue.push(run);                 // 새로 온 작업 뒤에 줄 선다
      run = -1;
    }
    if (run < 0 && queue.length) { run = queue.shift(); used = 0; }
    order.push(run);                   // -1이면 CPU가 논다
    if (run >= 0) { left[run]--; used++; }
    t++;
  }
  return order;
}`}</Code>
      <p>
        퀀텀은 얼마가 좋을까요? 그림 2에서 퀀텀을 키우면 문맥 교환 횟수가 줄고, 가장 긴 작업보다 커지는 순간 라운드 로빈은 FCFS와 같아집니다. 퀀텀을 1로 줄이면 응답 시간은 가장 짧지만 교환이 가장 많습니다. 앞 장의 그림 2에서 본 것처럼 실제로는 교환마다 비용이 들기 때문에, 퀀텀은 문맥 교환 시간보다 훨씬 길어야 합니다. 흔히 CPU 작업의 대부분(80% 정도)이 한 퀀텀 안에 끝날 만큼으로 잡으라고 합니다.
      </p>
      <CompareFigure jobs={jobs} algo={algo} q={q} setQ={setQ} />

      <h2>다단계 피드백 큐: 과거로 미래를 짐작하기</h2>
      <p>
        정리하면 이렇습니다. 짧은 작업을 먼저 하면 반환 시간이 좋아지지만 작업 길이를 모르고, 라운드 로빈은 응답 시간이 좋지만 반환 시간이 나쁩니다. 1962년 코르바토(Fernando Corbató)가 CTSS에 쓴 <T en="multi-level feedback queue, MLFQ">다단계 피드백 큐</T>는 작업이 지금까지 어떻게 행동했는지를 보고 우선순위를 바꿔서 둘을 함께 얻으려 합니다.
      </p>
      <ol>
        <li>우선순위가 다른 큐를 여러 개 둡니다. 높은 큐에 작업이 있으면 낮은 큐는 실행하지 않고, 같은 큐 안에서는 라운드 로빈입니다.</li>
        <li>새 작업은 가장 높은 큐에서 시작합니다. 짧은 작업일지도 모르니 일단 기회를 줍니다.</li>
        <li>퀀텀을 다 쓰면 한 단계 아래 큐로 내려갑니다. CPU를 오래 쓰는 작업은 점점 아래로 가라앉습니다.</li>
        <li>퀀텀을 다 쓰기 전에 입출력을 위해 CPU를 내놓으면 그 큐에 그대로 머뭅니다. 대화형 작업은 위에 남습니다.</li>
      </ol>
      <p>
        아래 큐일수록 퀀텀이 길어서, 가라앉은 긴 작업은 한 번 실행될 때 오래 실행되어 문맥 교환이 줄어듭니다. 그림 3의 <strong>대화형 + 일괄</strong>에서 A가 금세 Q2로 가라앉고, 1틱만 쓰고 입출력을 하는 B는 Q0에 남아 도착하자마자 A를 밀어내는 것을 보세요. 키 입력에 바로 반응해야 하는 편집기가 B, 밤새 도는 압축 작업이 A입니다.
      </p>
      <MlfqFigure />
      <p>
        이제 <strong>꼼수 쓰는 작업</strong>으로 바꿔 보세요. G와 H는 퀀텀을 다 쓰기 직전에 의미 없는 입출력을 해서 규칙 4 덕분에 영원히 Q0에 머뭅니다. 둘이 번갈아 CPU를 차지하는 동안 A는 거의 실행되지 못합니다. 이를 막는 규칙이 둘 더 있습니다.
      </p>
      <ul>
        <li>
          <strong>우선순위 올리기</strong>: 일정 시간마다 모든 작업을 맨 위 큐로 올립니다. 가라앉은 작업도 주기적으로 CPU를 받아 기아가 사라지고, 계산 위주였다가 대화형으로 바뀐 작업도 다시 위로 올라옵니다.
        </li>
        <li>
          <strong>누적 할당량</strong>: CPU를 몇 번에 나눠 썼든, 한 큐에서 쓴 시간의 합이 할당량(여기서는 퀀텀의 두 배)을 넘으면 강등합니다. 퀀텀 직전에 CPU를 내놓는 꼼수가 통하지 않습니다.
        </li>
      </ul>
      <p>
        두 체크 상자를 차례로 켜 보세요. 우선순위 올리기는 A에게 20틱마다 잠깐씩 CPU를 주고, 누적 할당량은 G와 H를 금방 아래로 끌어내려 A와 같은 큐에서 공평하게 나눠 쓰게 합니다.
      </p>
      <Callout kind="note">
        Windows와 macOS의 스케줄러는 지금도 우선순위 큐를 여러 개 두고, 입출력을 마친 스레드의 우선순위를 잠시 올려 주는 MLFQ 계열입니다. 리눅스는 다른 길을 택했습니다. 2007년부터 쓴 CFS는 프로세스마다 지금까지 받은 CPU 시간을 기록해 두고 가장 적게 받은 프로세스를 다음에 실행합니다. 2023년의 6.6 버전부터는 마감 시각 개념을 더한 EEVDF로 바뀌었습니다. 어느 쪽이든 목표는 같습니다. 대화형 작업은 빨리 반응하게, 긴 작업도 굶지 않게.
      </Callout>

      <Callout kind="key">
        스케줄러는 반환 시간, 대기 시간, 응답 시간 사이에서 맞바꿈을 합니다. FCFS는 단순하지만 호위 효과에 약하고, SJF와 SRTF는 평균 대기 시간이 가장 짧지만 작업 길이를 알아야 하며 긴 작업이 굶을 수 있습니다. 라운드 로빈은 응답 시간이 좋지만 퀀텀이 짧으면 교환 비용이, 길면 FCFS의 약점이 돌아옵니다. MLFQ는 작업의 과거 행동으로 길이를 짐작해 짧고 대화형인 작업을 위로, 긴 작업을 아래로 보내고, 우선순위 올리기와 누적 할당량으로 기아와 꼼수를 막습니다.
      </Callout>
      <Quiz
        q="작업 A(도착 0, 실행 8), B(도착 1, 실행 1), C(도착 2, 실행 1)가 있다. SJF(비선점)와 SRTF의 평균 대기 시간은 각각 얼마일까? (그림 1에서 작업 하나를 빼고 표에 직접 넣어 확인할 수 있습니다)"
        options={['SJF 4.67, SRTF 0.67', 'SJF 4.67, SRTF 2', 'SJF 0.67, SRTF 4.67', '둘 다 4.67']}
        answer={0}
        explain={<>SJF는 비선점이라 0에 도착한 A가 8까지 CPU를 쥐고, B(8~9)와 C(9~10)는 각각 7틱씩 기다립니다. 평균은 (0 + 7 + 7) / 3 ≈ 4.67입니다. SRTF는 1에 B가 오자 남은 시간 7인 A를 끊고 B를 실행하고, 2에 온 C도 바로 실행합니다. B와 C는 기다리지 않고, A만 3부터 10까지 마저 실행해 2틱 기다립니다. 평균은 2 / 3 ≈ 0.67입니다. 짧은 작업이 긴 작업 바로 뒤에 올 때 선점이 얼마나 큰 차이를 만드는지 보여 줍니다.</>}
      />
    </>
  );
}
