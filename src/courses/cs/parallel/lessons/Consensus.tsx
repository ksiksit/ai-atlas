import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, Callout, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, prefersReducedMotion, useAnimationFrame, useCanvas2D, useInView } from '../../../../lib/canvas';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import {
  DEFAULT_CFG,
  advance,
  advanceToEvent,
  clientRequest,
  crash,
  createSim,
  currentLeader,
  electionStats,
  electionTrial,
  heal,
  majority,
  partition,
  partitionStory,
  partitioned,
  restart,
  sname,
  type Entry,
  type Role,
  type Sim,
} from './raft';
import './parallel.css';
import './raft.css';

/* ─────────────── shared pieces ─────────────── */

const TERM_CSS = ['var(--c-cs-1)', 'var(--c-cs-2)', 'var(--c-cs-3)', 'var(--c-cs-4)', 'var(--c-net-1)', 'var(--c-net-3)', 'var(--c-math-1)', 'var(--c-math-2)'];
const termCss = (t: number) => (t <= 0 ? 'var(--ink-3)' : TERM_CSS[(t - 1) % TERM_CSS.length]);
const ROLE_KO: Record<Role, string> = { follower: '팔로워', candidate: '후보', leader: '리더' };
/** Dark text on the highlight yellow, in both themes. */
const onHl = (P: Palette) => (P.dark ? P.bg : P.ink);

function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

interface GridServer {
  alive: boolean;
  role: Role;
  term: number;
  log: Entry[];
  commit: number;
}

/**
 * Logs side by side, one row per server and one column per log index, so the reader can compare
 * the same index across servers. Colour is the entry's term; a filled cell is committed on that server.
 */
function LogGrid({ servers, group, cols, mark, onToggle }: { servers: GridServer[]; group?: number[]; cols?: number; mark?: { idx: number; bad?: boolean }; onToggle?: (i: number) => void }) {
  const end = Math.max(cols ?? 0, ...servers.map((s) => s.log.length), 1);
  const start = Math.max(1, end - 11);
  const idxs = Array.from({ length: end - start + 1 }, (_, k) => start + k);
  const split = group ? group.some((g) => g !== group[0]) : false;
  return (
    <div className="rf-grid" role="table" aria-label="서버별 로그. 열은 로그의 항목 번호입니다.">
      <div className="rf-row rf-head" role="row">
        <span className="rf-who" role="columnheader">
          서버
        </span>
        <div className="rf-cells" role="presentation">
          {start > 1 && <span className="rf-more">…</span>}
          {idxs.map((i) => (
            <span key={i} className="rf-idx mono" role="columnheader" data-mark={mark?.idx === i ? (mark.bad ? 'bad' : 'on') : undefined}>
              {i}
            </span>
          ))}
        </div>
        {onToggle && <span />}
      </div>
      {servers.map((s, i) => (
        <div key={i} className="rf-row" role="row" data-dead={!s.alive || undefined}>
          <span className="rf-who" role="rowheader">
            <b className="mono" data-role={s.alive ? s.role : 'dead'}>{sname(i)}</b>
            <span>
              {s.alive ? ROLE_KO[s.role] : '꺼짐'} · 임기 {s.term}
              {split && group![i] === 1 ? ' · 끊긴 쪽' : ''}
            </span>
          </span>
          <div className="rf-cells" role="presentation">
            {start > 1 && <span className="rf-more">…</span>}
            {idxs.map((k) => {
              const e = s.log[k - 1];
              const c = e && k <= s.commit;
              return (
                <span
                  key={k}
                  role="cell"
                  className="rf-cell"
                  data-empty={!e || undefined}
                  data-on={c || undefined}
                  data-mark={mark?.idx === k ? (mark.bad ? 'bad' : 'on') : undefined}
                  style={e ? ({ ['--c' as string]: termCss(e.term) } as CSSProperties) : undefined}
                  title={e ? `항목 ${k}: 임기 ${e.term}, 명령 ${e.cmd}${c ? ', 커밋됨' : ', 커밋 안 됨'}` : `항목 ${k}: 비어 있음`}
                >
                  {e ? (
                    <>
                      <b>{e.term}</b>
                      {e.cmd && <i>{e.cmd}</i>}
                    </>
                  ) : (
                    ''
                  )}
                </span>
              );
            })}
          </div>
          {onToggle && (
            <Button small onClick={() => onToggle(i)} label={`${sname(i)} ${s.alive ? '끄기' : '켜기'}`}>
              {s.alive ? '끄기' : '켜기'}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function LogLegend() {
  return (
    <div className="pd-small rf-key">
      칸 안의 숫자는 그 항목을 적은 리더의 <strong>임기</strong>, 글자는 명령입니다. 색도 임기를 나타냅니다. <span className="rf-cell rf-sample" data-on="" style={{ ['--c' as string]: termCss(1) } as CSSProperties}><b>1</b></span> 칠한 칸은 그 서버가 커밋된 것으로 아는 항목, <span className="rf-cell rf-sample" style={{ ['--c' as string]: termCss(1) } as CSSProperties}><b>1</b></span> 테두리만 있는 칸은 아직 커밋되지 않은 항목입니다.
    </div>
  );
}

/* ─────────────── Figure 1: the cluster ─────────────── */

type Pos = { x: number; y: number };

function layout(sim: Sim, w: number, h: number): Pos[] {
  const n = sim.cfg.n;
  if (!partitioned(sim)) {
    const R = Math.min(w * 0.36, h * 0.35);
    return sim.servers.map((_, i) => {
      const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
      return { x: w / 2 + R * Math.cos(a), y: h / 2 + 4 + R * Math.sin(a) };
    });
  }
  const pos: Pos[] = Array(n);
  for (const g of [1, 0]) {
    const ids = sim.servers.filter((s) => sim.group[s.id] === g).map((s) => s.id);
    const m = ids.length;
    const gap = Math.min(84, (h - 40) / Math.max(1, m));
    const cx = g === 1 ? w * 0.2 : w * 0.66;
    ids.forEach((id, k) => {
      const bow = m > 1 ? Math.sin((k / (m - 1)) * Math.PI) * Math.min(40, w * 0.05) : 0;
      pos[id] = { x: cx + (g === 1 ? -bow : bow), y: h / 2 + (k - (m - 1) / 2) * gap };
    });
  }
  return pos;
}

function drawCluster(ctx: CanvasRenderingContext2D, P: Palette, sim: Sim, w: number, h: number) {
  const pos = layout(sim, w, h);
  const split = partitioned(sim);
  const r = Math.max(15, Math.min(24, w / 26));
  if (split) {
    ctx.strokeStyle = P.bad;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(w * 0.43, 18);
    ctx.lineTo(w * 0.43, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    txt(ctx, '네트워크 끊김', w * 0.43, 10, P.bad, `600 11px ${P.fontBody}`, 'center');
  }
  // links between servers that can talk
  ctx.lineWidth = 1;
  for (let i = 0; i < sim.cfg.n; i++)
    for (let j = i + 1; j < sim.cfg.n; j++) {
      if (sim.group[i] !== sim.group[j]) continue;
      ctx.strokeStyle = alpha(P.lineStrong, 0.5);
      ctx.beginPath();
      ctx.moveTo(pos[i].x, pos[i].y);
      ctx.lineTo(pos[j].x, pos[j].y);
      ctx.stroke();
    }
  // messages in flight
  for (const m of sim.msgs) {
    const a = pos[m.from];
    const b = pos[m.to];
    const span = Math.max(1e-6, m.arrive - m.sent);
    const p = Math.max(0, Math.min(1, (sim.t - m.sent) / span)) * (m.lost ? 0.5 : 1);
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / d;
    const uy = (b.y - a.y) / d;
    const x = a.x + ux * r + (b.x - a.x - 2 * ux * r) * p;
    const y = a.y + uy * r + (b.y - a.y - 2 * uy * r) * p;
    ctx.globalAlpha = m.lost ? Math.max(0.15, 1 - p * 1.6) : 1;
    if (m.kind === 'append') {
      const big = m.entries!.length > 0;
      ctx.fillStyle = P.accent;
      if (big) {
        ctx.fillRect(x - 5, y - 5, 10, 10);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (m.kind === 'vote') {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fillStyle = P.hl;
      ctx.fill();
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const ok = m.kind === 'vote-ok' ? m.granted : m.success;
      ctx.beginPath();
      ctx.arc(x, y, m.kind === 'vote-ok' ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = ok ? P.good : P.bad;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // servers
  sim.servers.forEach((s, i) => {
    const { x, y } = pos[i];
    if (s.alive && s.role !== 'leader') {
      const f = Math.max(0, Math.min(1, (s.deadline - sim.t) / Math.max(1, s.timeoutLen)));
      ctx.strokeStyle = P.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = f < 0.25 ? P.hl : P.ink3;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.stroke();
    } else if (s.alive) {
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = !s.alive ? P.surface2 : s.role === 'leader' ? P.accent : s.role === 'candidate' ? P.hl : P.surface;
    ctx.fill();
    ctx.strokeStyle = s.alive ? P.ink : P.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const ink = !s.alive ? P.ink3 : s.role === 'leader' ? P.surface : s.role === 'candidate' ? onHl(P) : P.ink;
    txt(ctx, sname(i), x, y + 0.5, ink, `700 ${Math.round(r * 0.62)}px ${P.fontMono}`, 'center');
    if (!s.alive) {
      ctx.strokeStyle = P.bad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.7);
      ctx.lineTo(x + r * 0.7, y + r * 0.7);
      ctx.moveTo(x + r * 0.7, y - r * 0.7);
      ctx.lineTo(x - r * 0.7, y + r * 0.7);
      ctx.stroke();
    }
    const role = s.alive ? ROLE_KO[s.role] : '꺼짐';
    const roleColor = !s.alive ? P.ink3 : s.role === 'leader' ? P.accent : s.role === 'candidate' ? P.ink : P.ink3;
    if (split) {
      const right = sim.group[i] === 0;
      const lx = right ? x + r + 12 : x - r - 12;
      const al: CanvasTextAlign = right ? 'left' : 'right';
      txt(ctx, role, lx, y - 7, roleColor, `600 11px ${P.fontBody}`, al);
      txt(ctx, `임기 ${s.term}`, lx, y + 8, P.ink3, `11px ${P.fontMono}`, al);
    } else {
      txt(ctx, `${role} · 임기 ${s.term}`, x, y + r + 17, roleColor, `600 11px ${P.fontBody}`, 'center');
    }
  });
  txt(ctx, `t = ${Math.round(sim.t)} ms`, w - 6, h - 10, P.ink3, `11px ${P.fontMono}`, 'right');
}

function hitServer(sim: Sim, w: number, h: number, px: number, py: number): number {
  const pos = layout(sim, w, h);
  const r = Math.max(15, Math.min(24, w / 26));
  for (let i = 0; i < pos.length; i++) if (Math.hypot(px - pos[i].x, py - pos[i].y) <= r + 8) return i;
  return -1;
}

const FIG1_SEED = 3;

function ClusterFigure() {
  const P = usePalette();
  const outer = useRef<HTMLDivElement>(null);
  const inView = useInView(outer);
  const [n, setN] = useState(5);
  const [seed, setSeed] = useState(FIG1_SEED);
  const sim = useRef<Sim>(createSim({ ...DEFAULT_CFG, n }, seed));
  const [, setV] = useState(0);
  const bump = () => setV((v) => v + 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(prefersReducedMotion() ? 40 : 80);
  const [quiet, setQuiet] = useState(false);

  const reset = (nn = n, sd = seed) => {
    sim.current = createSim({ ...DEFAULT_CFG, n: nn }, sd);
    setPlaying(false);
    setQuiet(false);
    bump();
  };
  const act = (f: () => void) => {
    f();
    setQuiet(false);
    bump();
  };

  useAnimationFrame((dt) => {
    advance(sim.current, sim.current.t + dt * speed);
    bump();
  }, playing && inView);

  const S = sim.current;
  const leader = currentLeader(S);
  const split = partitioned(S);
  const toggle = (i: number) => act(() => (S.servers[i].alive ? crash(S, i) : restart(S, i)));
  const cut = () =>
    act(() => {
      if (split) heal(S);
      else {
        const l = leader ?? S.servers[0];
        partition(S, [l.id, (l.id + 1) % S.cfg.n]);
      }
    });

  const { wrapRef, canvasRef, size } = useCanvas2D((ctx, { w, h }) => drawCluster(ctx, P, S, w, h), [P, S, S.t, S.msgs.length, S.evCount, split], { height: 400, minHeight: 300 });

  const click = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const p = localPoint(e, el);
    const i = hitServer(S, size.w, size.h, p.x, p.y);
    if (i >= 0) toggle(i);
  };

  const recent = S.events.slice(-3).reverse();
  const committed = Math.max(0, ...S.servers.filter((s) => s.alive).map((s) => s.commit));
  const alive = S.servers.filter((s) => s.alive).length;
  const desc = S.servers.map((s, i) => `${sname(i)} ${s.alive ? ROLE_KO[s.role] : '꺼짐'} 임기 ${s.term} 로그 ${s.log.length}개 중 ${s.commit}개 커밋`).join(', ');

  return (
    <Figure
      no={1}
      title="Raft 클러스터"
      hint="재생하고, 서버를 눌러 끄고, 네트워크를 끊어 보세요"
      caption={
        <>
          서버 둘레의 고리는 선거 타이머입니다. 리더의 하트비트를 받을 때마다 가득 차고, 다 줄어들면(노랗게 바뀐 뒤) 그 서버가 후보가 되어 선거를 엽니다. 마름모는 표를 달라는 요청, 작은 동그라미는 응답(초록은 찬성이나 성공, 빨강은 반대나 실패), 파란 점은 내용 없는 하트비트, 파란 네모는 로그 항목을 실은 복제 메시지입니다. 시간은 느리게 흐릅니다. 화면의 1초가 서버의 {speed}밀리초입니다. 같은 시드에서 같은 순간에 같은 조작을 하면 같은 일이 일어납니다.
        </>
      }
    >
      <div ref={outer} className="pd-col">
        <div className="controls row">
          <div className="btn-row">
            <Button small primary onClick={() => setPlaying((p) => !p)} label={playing ? '일시정지' : '재생'}>
              {playing ? '❚❚ 멈춤' : '▶ 재생'}
            </Button>
            <Button
              small
              onClick={() => {
                setPlaying(false);
                setQuiet(!advanceToEvent(S));
                bump();
              }}
            >
              다음 사건까지
            </Button>
            <Button small onClick={() => act(() => clientRequest(S))}>
              클라이언트 명령 보내기
            </Button>
            <Button small onClick={() => act(() => leader && crash(S, leader.id))} disabled={!leader}>
              리더 끄기
            </Button>
            <Button small onClick={cut}>
              {split ? '네트워크 잇기' : '네트워크 끊기 (리더를 소수 쪽에)'}
            </Button>
          </div>
        </div>
        <div ref={wrapRef} className="canvas-box rf-canvas" onClick={click} role="img" aria-label={`Raft 서버 ${S.cfg.n}대, 시각 ${Math.round(S.t)}밀리초. ${split ? '네트워크가 둘로 끊겨 있습니다. ' : ''}${desc}.`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Readout label="시각" value={`${Math.round(S.t)} ms`} />
          <Readout label="리더" value={leader ? `${sname(leader.id)} (임기 ${leader.term})` : '없음'} color={leader ? 'var(--accent)' : 'var(--bad)'} />
          <Readout label="커밋된 항목" value={`${committed}개`} color="var(--good)" />
          <Readout label="켜진 서버 / 과반" value={`${alive} / ${majority(S.cfg.n)}`} color={alive < majority(S.cfg.n) ? 'var(--bad)' : undefined} />
        </div>
        <div className="rf-events" aria-live="polite">
          {quiet && (
            <div data-latest="">
              <span className="mono">{Math.round(S.t)} ms</span>
              <span>3초 동안 새 사건 없이 하트비트만 오갔습니다. 명령을 보내거나 서버를 꺼 보세요.</span>
            </div>
          )}
          {recent.length ? (
            recent.map((e, k) => (
              <div key={S.evCount - k} data-latest={(k === 0 && !quiet) || undefined} data-kind={e.kind}>
                <span className="mono">{Math.round(e.t)} ms</span>
                <span>{e.text}</span>
              </div>
            ))
          ) : (
            <div data-latest="">
              <span className="mono">0 ms</span>
              <span>서버 {S.cfg.n}대가 모두 팔로워로 시작합니다. 리더가 없으니 하트비트도 없고, 각자의 선거 타이머만 줄어듭니다. ▶ 재생을 누르거나 "다음 사건까지"로 한 사건씩 넘겨 보세요.</span>
            </div>
          )}
        </div>
        <LogGrid servers={S.servers} group={S.group} onToggle={toggle} />
        <LogLegend />
        <div className="controls row">
          <Seg
            label="서버 수"
            value={n}
            onChange={(v) => {
              setN(v);
              reset(v, seed);
            }}
            options={[3, 5, 7].map((v) => ({ value: v, label: `${v}대` }))}
          />
          <Slider id="rf-speed" label="화면 1초 = 서버의" value={speed} min={10} max={300} step={10} onChange={setSpeed} format={(v) => `${v} ms`} />
          <div className="btn-row">
            <Button small onClick={() => reset()}>
              처음부터
            </Button>
            <Button
              small
              onClick={() => {
                setSeed(seed + 1);
                reset(n, seed + 1);
              }}
            >
              다른 시드
            </Button>
          </div>
        </div>
        <Legend
          items={[
            { color: 'var(--accent)', label: '리더' },
            { color: 'var(--hl)', label: '후보' },
            { color: 'var(--line-strong)', label: '팔로워 (흰 원)' },
            { color: 'var(--hl)', label: '표 요청', shape: 'sq' },
            { color: 'var(--accent)', label: '복제·하트비트', shape: 'sq' },
            { color: 'var(--good)', label: '찬성·성공' },
            { color: 'var(--bad)', label: '반대·실패' },
          ]}
        />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: elections and split votes ─────────────── */

const RUNS = 200;
const MAX_T = 4000;

function ElectionFigure() {
  const P = usePalette();
  const [spread, setSpread] = useState(150);
  const [trialSeed, setTrialSeed] = useState(1000);
  const cfg = useMemo(() => ({ ...DEFAULT_CFG, timeoutSpread: spread }), [spread]);
  const stats = useMemo(() => electionStats(cfg, RUNS, 1000, MAX_T), [cfg]);
  const trial = useMemo(() => electionTrial(cfg, trialSeed, MAX_T), [cfg, trialSeed]);

  const tl = useCanvas2D(
    (ctx, { w, h }) => {
      const n = cfg.n;
      const pad = { l: 34, r: 12, t: 10, b: 24 };
      const T = trial.time !== null ? Math.max(400, Math.ceil((trial.time + 60) / 100) * 100) : 1200;
      const X = (t: number) => pad.l + (Math.min(t, T) / T) * (w - pad.l - pad.r);
      const rowH = (h - pad.t - pad.b) / n;
      // the window the first timeouts are drawn from
      ctx.fillStyle = alpha(P.hl, 0.18);
      ctx.fillRect(X(cfg.timeoutMin), pad.t, Math.max(2, X(cfg.timeoutMin + spread) - X(cfg.timeoutMin)), h - pad.t - pad.b);
      for (let i = 0; i < n; i++) {
        const y = pad.t + i * rowH + rowH / 2;
        ctx.strokeStyle = P.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        txt(ctx, sname(i), 4, y, P.ink2, `700 11px ${P.fontMono}`);
      }
      for (let g = 0; g <= T; g += T <= 600 ? 100 : 200) {
        txt(ctx, `${g}`, X(g), h - 10, P.ink3, `10px ${P.fontMono}`, 'center');
      }
      const lead = trial.sim.trace.find((e) => e.kind === 'leader');
      for (const e of trial.sim.trace) {
        if (e.t > T) continue;
        const y = pad.t + e.s * rowH + rowH / 2;
        if (e.kind === 'timeout') {
          const won = lead && lead.s === e.s && lead.term === e.term;
          ctx.beginPath();
          ctx.arc(X(e.t), y, Math.min(9, rowH * 0.36), 0, Math.PI * 2);
          ctx.fillStyle = won ? P.accent : P.hl;
          ctx.fill();
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1;
          ctx.stroke();
          txt(ctx, String(e.term), X(e.t), y + 0.5, won ? P.surface : onHl(P), `700 10px ${P.fontMono}`, 'center');
        }
      }
      if (lead) {
        const y = pad.t + lead.s * rowH + rowH / 2;
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(X(lead.t), y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(lead.t), pad.t);
        ctx.lineTo(X(lead.t), h - pad.b);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [P, trial, cfg, spread],
    { height: 200, minHeight: 160 },
  );

  const hist = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 34, r: 12, t: 10, b: 24 };
      const top = 1500;
      const bw = 50;
      const nb = top / bw + 1;
      const bins = Array(nb).fill(0);
      for (const t of stats.times) bins[Math.min(nb - 1, Math.floor(t / bw))]++;
      bins[nb - 1] += stats.failed;
      const peak = Math.max(1, ...bins);
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const cw = pw / nb;
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ph + 0.5);
      ctx.lineTo(w - pad.r, pad.t + ph + 0.5);
      ctx.stroke();
      bins.forEach((c, k) => {
        if (!c) return;
        const bh = (c / peak) * ph;
        ctx.fillStyle = k === nb - 1 ? P.bad : P.accent;
        ctx.fillRect(pad.l + k * cw + 1, pad.t + ph - bh, Math.max(1, cw - 2), bh);
      });
      txt(ctx, String(peak), pad.l - 5, pad.t + 4, P.ink3, `10px ${P.fontMono}`, 'right');
      txt(ctx, '0', pad.l - 5, pad.t + ph, P.ink3, `10px ${P.fontMono}`, 'right');
      for (let g = 0; g < top; g += 250) txt(ctx, `${g}`, pad.l + (g / bw) * cw, h - 10, P.ink3, `10px ${P.fontMono}`, 'center');
      txt(ctx, '1.5초 넘음', w - pad.r, h - 10, P.bad, `10px ${P.fontBody}`, 'right');
    },
    [P, stats],
    { height: 150, minHeight: 120 },
  );

  const tw = trial.time !== null;
  const note = !tw
    ? `이 시도에서는 ${MAX_T / 1000}초가 지나도 리더가 없습니다. 타이머가 모두 같은 순간에 끝나니 모든 서버가 동시에 후보가 되어 자기에게 투표하고, 남의 요청은 이미 투표했으니 거절합니다. 임기만 ${trial.terms}까지 올라갔습니다.`
    : trial.terms > 1
      ? `이 시도에서는 표가 갈렸습니다. 임기 ${trial.terms}에 가서야 ${Math.round(trial.time!)}ms 만에 리더가 뽑혔습니다.`
      : `이 시도에서는 처음 타이머가 끝난 서버가 다른 서버들의 타이머가 끝나기 전에 표를 모아, 임기 1에 ${Math.round(trial.time!)}ms 만에 리더가 되었습니다.`;

  return (
    <Figure
      no={2}
      title="선거 타이머를 얼마나 흩뜨릴까"
      hint="범위를 0까지 줄여 보세요"
      caption={
        <>
          위: 서버 다섯 대가 동시에 켜진 한 번의 시도. 노란 띠는 첫 선거 타이머가 끝날 수 있는 구간(최소 {cfg.timeoutMin}ms에서 {cfg.timeoutMin + spread}ms까지)이고, 동그라미는 타이머가 끝나 후보가 된 순간과 그때의 임기입니다. 파란 동그라미와 굵은 선이 이긴 후보입니다. 아래: 같은 설정으로 시드를 바꿔 {RUNS}번 시도했을 때 첫 리더가 뽑히기까지 걸린 시간의 분포. 메시지 하나가 가는 데는 {DEFAULT_CFG.latMin}~{DEFAULT_CFG.latMin + DEFAULT_CFG.latJitter}ms가 걸립니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="rf-spread" label="타이머를 흩뜨리는 범위" value={spread} min={0} max={300} step={5} onChange={setSpread} format={(v) => `${cfg.timeoutMin}~${cfg.timeoutMin + v} ms`} />
        <Button small onClick={() => setTrialSeed((s) => s + 1)}>
          다른 시도 보기
        </Button>
      </div>
      <div ref={tl.wrapRef} className="canvas-box" role="img" aria-label={`한 번의 선거 시도. ${note}`}>
        <canvas ref={tl.canvasRef} />
      </div>
      <div className="pd-note" data-bad={!tw || undefined}>
        {note}
      </div>
      <div ref={hist.wrapRef} className="canvas-box" role="img" aria-label={`${RUNS}번 시도한 선거 시간 분포. 평균 ${stats.mean === null ? '없음' : Math.round(stats.mean) + '밀리초'}, ${stats.failed}번 실패.`}>
        <canvas ref={hist.canvasRef} />
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <Readout label="평균" value={stats.mean === null ? '—' : `${Math.round(stats.mean)} ms`} />
        <Readout label="95%가 이 안에" value={stats.p95 === null ? '—' : `${Math.round(stats.p95)} ms`} />
        <Readout label="표가 갈린 시도" value={`${stats.split} / ${RUNS}`} color={stats.split > RUNS / 4 ? 'var(--bad)' : undefined} />
        <Readout label={`${MAX_T / 1000}초 안에 실패`} value={`${stats.failed} / ${RUNS}`} color={stats.failed ? 'var(--bad)' : 'var(--good)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: a partition, step by step ─────────────── */

function PartitionFigure() {
  const frames = useMemo(() => partitionStory(5), []);
  const s = useStepper(frames.length, 2);
  const f = frames[s.i];
  const split = f.group.some((g) => g !== f.group[0]);
  const cols = Math.max(...frames.map((fr) => Math.max(...fr.servers.map((x) => x.log.length))));
  return (
    <Figure
      no={3}
      title="리더가 소수 쪽에 갇히면"
      hint="한 단계씩 넘겨 보세요"
      caption={<>그림 1과 같은 시뮬레이터에 정해진 순서대로 조작을 넣은 것입니다. 리더와 팔로워 하나를 나머지 셋과 떼어 놓고, 양쪽 리더에게 명령을 두 개씩 보낸 뒤 네트워크를 다시 잇습니다. "끊긴 쪽"은 다섯 대 중 둘뿐인 무리입니다.</>}
    >
      <div className="fig-split">
        <div className="pd-col">
          <LogGrid servers={f.servers} group={f.group} cols={cols} />
          <div className="pd-note" data-bad={f.kind === 'overwrite' || undefined} data-good={f.kind === 'commit' || undefined} aria-live="polite">
            <span className="mono">{Math.round(f.t)} ms · </span>
            {f.note}
          </div>
          <LogLegend />
        </div>
        <div className="controls">
          <StepControls s={s} id="rf-story-speed" maxSpeed={6} />
          <Readout label="네트워크" value={split ? '끊김' : '이어짐'} color={split ? 'var(--bad)' : undefined} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: why only current-term entries are counted ─────────────── */

type F8 = { key: string; label: string; servers: GridServer[]; mark?: { idx: number; bad?: boolean }; note: string };
const e = (term: number): Entry => ({ term, cmd: '' });
const sv = (log: number[], term: number, role: Role = 'follower', alive = true, commit = 1): GridServer => ({ log: log.map(e), term, role, alive, commit });

const FIG8: F8[] = [
  {
    key: 'a',
    label: '(가)',
    servers: [sv([1, 2], 2, 'leader'), sv([1, 2], 2), sv([1], 2), sv([1], 2), sv([1], 2)],
    note: 'S1이 임기 2의 리더입니다. 항목 2를 받아 S2에게만 복제한 채로 꺼집니다.',
  },
  {
    key: 'b',
    label: '(나)',
    servers: [sv([1, 2], 2, 'follower', false), sv([1, 2], 2), sv([1], 3), sv([1], 3), sv([1, 3], 3, 'leader')],
    note: 'S5가 S3, S4와 자기 표로 임기 3의 리더가 됩니다. S5의 로그(마지막 임기 1)가 S3, S4보다 뒤처지지 않으니 표를 받습니다. 새 명령을 항목 2에 적었지만 복제하기 전에 꺼집니다.',
  },
  {
    key: 'c',
    label: '(다)',
    servers: [sv([1, 2, 4], 4, 'leader'), sv([1, 2], 4), sv([1, 2], 4), sv([1], 4), sv([1, 3], 3, 'follower', false)],
    mark: { idx: 2 },
    note: 'S1이 다시 켜져 임기 4의 리더가 되고, 예전 임기 2의 항목 2를 S3에게도 복제합니다. 이제 항목 2는 다섯 대 중 세 대에 있습니다. 세기만 하면 과반이지만, 이것은 S1 자신의 임기(4)의 항목이 아니므로 S1은 커밋하지 않습니다.',
  },
  {
    key: 'd',
    label: '(라) 세어서 커밋했다면',
    servers: [sv([1, 2, 4], 4, 'follower', false), sv([1, 3], 5), sv([1, 3], 5), sv([1, 3], 5), sv([1, 3], 5, 'leader')],
    mark: { idx: 2, bad: true },
    note: '(다)에서 S1이 꺼지고 S5가 다시 켜지면, S5는 S2, S3, S4의 표로 임기 5의 리더가 될 수 있습니다. S5의 마지막 항목은 임기 3이고 그들의 마지막 항목은 임기 2라서, S5의 로그가 더 최신으로 보이기 때문입니다. S5는 항목 2를 자기 것(임기 3)으로 모두 덮어씁니다. (다)에서 항목 2를 과반이라고 세어 커밋했다면, 커밋된 항목이 사라진 것입니다.',
  },
  {
    key: 'e',
    label: '(마) 규칙대로',
    servers: [sv([1, 2, 4], 4, 'leader', true, 3), sv([1, 2, 4], 4), sv([1, 2, 4], 4), sv([1], 4), sv([1, 3], 3, 'follower', false)],
    mark: { idx: 3 },
    note: '규칙대로라면 S1은 자기 임기의 항목 3을 S2, S3에 복제해 과반이 된 순간 항목 3을 커밋하고, 그 앞의 항목 2도 함께 커밋됩니다. 이제 S1이 꺼져도 S5는 리더가 될 수 없습니다. S2와 S3의 마지막 항목이 임기 4라서, 마지막 항목이 임기 3인 S5에게 표를 주지 않습니다.',
  },
];

function OldTermFigure() {
  const [k, setK] = useState('a');
  const f = FIG8.find((x) => x.key === k)!;
  return (
    <Figure
      no={4}
      title="예전 임기의 항목은 세지 않는다"
      hint="(가)부터 차례로 눌러 보세요"
      caption={<>Raft 논문의 그림 8을 옮긴 것입니다. 항목 1은 처음부터 모두에게 있고 커밋되어 있습니다. (라)와 (마)는 (다) 다음에 일어날 수 있는 두 갈래입니다. 이 그림의 로그에는 명령 글자를 적지 않았습니다.</>}
    >
      <div className="controls row">
        <Seg value={k} onChange={setK} options={FIG8.map((x) => ({ value: x.key, label: x.label }))} />
      </div>
      <LogGrid servers={f.servers} cols={3} mark={f.mark} />
      <div className="pd-note" data-bad={f.mark?.bad || undefined} aria-live="polite">
        {f.note}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Consensus() {
  return (
    <>
      <h2>서버 한 대는 언젠가 꺼집니다</h2>
      <p>
        은행 잔액이나 쇼핑몰 주문처럼 잃어버리면 안 되는 데이터를 서버 한 대에만 두면, 그 서버의 디스크가 고장 나거나 전원이 나가거나 운영체제를 업데이트하느라 재부팅하는 동안 서비스가 멈춥니다. 서버 수천 대를 운영하는 회사에서는 하루에도 몇 대씩 고장이 납니다. 그래서 같은 데이터를 여러 대에 <T en="replication">복제</T>해 둡니다. 한 대가 꺼져도 다른 서버가 이어서 답하면 됩니다.
      </p>
      <p>
        복제본들이 같은 데이터를 갖게 하는 가장 깔끔한 방법은 <T en="state machine replication">상태 기계 복제</T>입니다. 데이터를 바꾸는 명령("x에 5를 더한다", "주문 17을 취소한다")을 차례로 적은 <T en="log">로그</T>를 모든 서버가 똑같이 갖고, 각 서버가 로그의 명령을 처음부터 같은 순서로 실행합니다. 같은 상태에서 시작해 같은 명령을 같은 순서로 실행하면 결과도 같습니다. 그러니 문제는 하나로 줄어듭니다. <strong>로그의 몇 번째 칸에 어떤 명령이 들어가는지 모든 서버가 합의하는 것</strong>입니다. 이것을 <T en="consensus">합의</T> 문제라고 합니다.
      </p>
      <Callout kind="intuition">
        여러 지점에 흩어진 회계 담당자들이 같은 장부를 따로 쓴다고 생각해 보세요. 각자 들어온 순서대로 적으면 지점마다 순서가 달라지고, "잔액이 0원 아래로 내려가면 거절"하는 규칙의 결과도 달라집니다. 모두가 "이번 줄에는 이 거래"라고 합의한 다음에 적어야 장부가 같아집니다.
      </Callout>

      <h2>무엇이 어려운가</h2>
      <p>
        <a href={lessonHref('cs-parallel-distributed', 'clocks')}>앞 장</a>에서 본 것처럼 서버들은 시계도 메모리도 공유하지 않고 메시지로만 이야기합니다. 그리고 메시지는 늦게 도착하거나 사라질 수 있습니다. 답이 오지 않을 때, 상대 서버가 꺼진 것인지 그저 느린 것인지 알 방법이 없습니다. 1985년 피셔(Michael Fischer), 린치(Nancy Lynch), 패터슨(Michael Paterson)은 메시지가 얼마나 늦을지 한계가 없는 네트워크에서는, 서버 하나만 꺼질 수 있어도 언제나 유한한 시간 안에 합의를 끝내는 결정적 알고리즘이 없음을 증명했습니다. 이른바 <T en="FLP impossibility">FLP 불가능성</T>입니다. 느린 서버를 기다리면 영원히 기다릴 수 있고, 기다리지 않고 진행하면 꺼진 줄 알았던 서버가 돌아와 다른 답을 낼 수 있기 때문입니다.
      </p>
      <p>
        실제 합의 알고리즘은 이 벽을 이렇게 피합니다. <strong>틀린 답은 어떤 경우에도 내지 않고</strong>(안전성), 네트워크가 충분히 빨리 답해 주는 동안에만 <strong>진행을 보장</strong>합니다(활성). 그 도구가 과반수입니다. 서버 <M>{'2f+1'}</M>대 중 <M>{'f+1'}</M>대 이상이 동의한 것만 결정으로 치면, 과반 두 무리는 반드시 한 대 이상 겹치므로 서로 다른 두 결정이 동시에 나올 수 없습니다. 그리고 <M>{'f'}</M>대까지 꺼져도 남은 <M>{'f+1'}</M>대로 과반을 만들 수 있습니다. 다섯 대짜리 클러스터는 두 대가 꺼져도 동작하고, 세 대가 꺼지면 멈춥니다. 멈출 뿐 틀린 답을 내지는 않습니다.
      </p>

      <h2>Raft: 리더 한 명이 순서를 정한다</h2>
      <p>
        2014년 온가로(Diego Ongaro)와 오스터하우트(John Ousterhout)가 발표한 <T en="Raft">Raft</T>는 "이해하기 쉬운 합의 알고리즘"을 목표로 만들었습니다. 핵심은 리더를 한 명 뽑아 모든 결정을 맡기는 것입니다. 서버는 셋 중 하나의 역할을 맡습니다.
      </p>
      <ul>
        <li>
          <T en="leader">리더</T>: 클라이언트의 명령을 받아 자기 로그에 적고, 팔로워들에게 복제합니다. 할 일이 없을 때도 짧은 간격(여기서는 {DEFAULT_CFG.heartbeat}ms)으로 빈 메시지인 <T en="heartbeat">하트비트</T>를 보내 "나 살아 있다"고 알립니다.
        </li>
        <li>
          <T en="follower">팔로워</T>: 리더가 보낸 항목을 받아 적기만 합니다. 정해진 시간 동안 리더의 소식이 없으면 리더가 꺼졌다고 보고 후보가 됩니다.
        </li>
        <li>
          <T en="candidate">후보</T>: 선거를 열어 다른 서버들에게 표를 달라고 요청합니다. 과반의 표를 얻으면 리더가 됩니다.
        </li>
      </ul>
      <p>
        시간은 <T en="term">임기</T>로 나뉩니다. 임기는 1, 2, 3처럼 하나씩 커지는 번호이고, 선거가 열릴 때마다 하나 올라갑니다. 한 임기에는 리더가 많아야 한 명입니다. 모든 메시지에는 보낸 서버의 임기가 붙어 있어서, 자기보다 높은 임기의 메시지를 받은 서버는 곧바로 임기를 따라 올리고 팔로워가 됩니다. 꺼졌다 돌아온 옛 리더도 이렇게 자기가 더는 리더가 아님을 알게 됩니다. 임기는 서버들이 시계를 맞추지 않고도 "어느 리더가 더 최근인가"를 정하는 <a href={lessonHref('cs-parallel-distributed', 'clocks')}>논리 시계</a>입니다.
      </p>
      <ClusterFigure />
      <p>
        ▶ 재생을 누르면 서버 다섯 대의 타이머가 각자 다른 길이로 줄어듭니다. 156ms에 가장 먼저 끝난 S2가 임기 1의 후보가 되고, 5ms 뒤에 S4도 후보가 됩니다. 나머지 세 대(S1, S3, S5)는 먼저 도착한 S2의 요청에 표를 주고 S4의 요청은 거절합니다. S2는 191ms에 자기 표를 포함해 세 표가 모이는 순간 리더가 되고, S4는 S2의 하트비트를 받고 팔로워로 돌아갑니다. 그 뒤로는 파란 점이 규칙적으로 오가며 모든 팔로워의 타이머를 다시 채웁니다. 다음을 해 보세요.
      </p>
      <ul>
        <li>
          <strong>클라이언트 명령 보내기</strong>를 몇 번 누르세요. 리더의 로그에 테두리만 있는 칸이 생기고, 과반에 복제되었다는 응답이 오는 순간 칠한 칸이 됩니다. 팔로워의 칸은 다음 메시지에서 리더가 알려 줄 때 칠해집니다.
        </li>
        <li>
          <strong>리더 끄기</strong>를 누르세요. 하트비트가 끊기고, 타이머가 먼저 끝난 팔로워가 임기를 하나 올려 새 리더가 됩니다. 꺼진 서버를 눌러 다시 켜면 더 높은 임기를 보고 팔로워로 돌아오고, 놓친 항목을 받아 갑니다.
        </li>
        <li>
          서버를 세 대 끄세요. 남은 두 대는 과반(세 대)을 만들 수 없어서 선거를 거듭해도 리더가 나오지 않고, 명령도 받지 못합니다.
        </li>
      </ul>

      <h2>선거: 임기마다 한 표</h2>
      <p>
        표를 주는 규칙은 두 가지뿐입니다. 첫째, 서버는 한 임기에 <strong>한 번만</strong> 투표합니다. 먼저 요청한 후보에게 주고, 그 임기에 온 다른 요청은 거절합니다. 투표 기록은 디스크에 적어 두므로 재부팅해도 같은 임기에 두 번 투표하지 않습니다. 과반의 표가 필요하고 서버마다 한 표뿐이니, 한 임기에 리더가 둘 나올 수 없습니다. 둘째, 후보의 로그가 자기 로그보다 <strong>뒤처지면</strong> 표를 주지 않습니다. 이 규칙은 아래 커밋에서 다시 나옵니다.
      </p>
      <p>
        문제는 여러 서버의 타이머가 거의 동시에 끝날 때입니다. 다섯 대 중 세 대가 동시에 후보가 되면 각자 자기 표를 갖고 나머지 두 표를 나눠 가져, 아무도 과반을 얻지 못할 수 있습니다. 이것을 <T en="split vote">표 갈림</T>이라고 합니다. 그러면 타이머가 다시 끝날 때 임기를 하나 더 올려 선거를 다시 엽니다. Raft는 선거 타이머의 길이를 서버마다, 매번 무작위로 정해서 이 문제를 줄입니다. 그림 2에서 그 범위를 바꿔 보세요.
      </p>
      <ElectionFigure />
      <p>
        기본값인 150~300ms(논문이 제안한 값)에서는 200번 중 7번만 표가 갈렸고, 리더가 뽑히기까지 평균 216ms, 95%가 267ms 안에 끝났습니다. 범위를 50ms(150~200ms)로 좁히면 평균은 263ms로 늘고 표가 갈린 시도는 66번이 됩니다. 25ms에서는 167번이 갈리고 평균은 511ms입니다. 범위를 0으로 하면 200번 모두 4초가 지나도 리더가 없습니다. 모든 타이머가 같은 순간에 끝나 모두가 자기에게 투표하고, 다음 선거도 다시 같은 순간에 열리기 때문입니다. 반대로 범위를 크게 넓혀도 좋아지지 않습니다. 첫 타이머가 끝나는 시각 자체가 늦어지기 때문입니다. 무작위의 폭이 메시지가 오가는 시간(여기서는 12~22ms)보다 충분히 커서, 먼저 깬 후보가 다른 서버들이 깨기 전에 표를 모을 수 있으면 됩니다.
      </p>
      <Callout kind="note">
        선거 타이머는 서버 자기 시계로 "얼마나 오래 소식이 없었나"만 잽니다. 다른 서버와 시각을 맞출 필요가 없으므로, 앞 장에서 본 시계 어긋남은 Raft의 정확성에 영향을 주지 않습니다. 타이머는 진행을 돕는 데만 쓰이고, 타이머가 틀려서 리더가 필요 없이 바뀌더라도 틀린 답이 나오지는 않습니다.
      </Callout>

      <h2>로그 복제와 커밋</h2>
      <p>
        리더는 클라이언트의 명령을 받으면 자기 로그 끝에 그 명령과 현재 임기를 함께 적고, 팔로워들에게 <T en="AppendEntries">항목 추가</T> 메시지로 보냅니다. 이 메시지에는 새 항목 바로 앞 항목의 번호와 임기도 들어 있습니다. 팔로워는 자기 로그의 같은 자리에 같은 임기의 항목이 있을 때만 받아들이고, 없으면 거절합니다. 거절당한 리더는 한 칸 앞에서부터 다시 보내고, 맞는 자리를 찾을 때까지 이것을 되풀이합니다. 맞는 자리를 찾으면 팔로워는 그 뒤의 다른 항목을 지우고 리더의 항목으로 채웁니다. 그래서 두 로그에서 같은 번호, 같은 임기의 항목이 있으면 그 앞의 로그 전체가 같다는 것이 언제나 보장됩니다.
      </p>
      <p>
        항목이 서버 과반의 로그에 적히면 리더는 그 항목을 <T en="committed">커밋</T>되었다고 보고, 상태 기계에 적용한 뒤 클라이언트에게 성공을 알립니다. 커밋은 약속입니다. 한 번 커밋된 항목은 어떤 서버가 꺼지고 네트워크가 끊겨도 그 자리에 그대로 남습니다. 커밋되지 않은 항목은 지워질 수 있지만, 그런 명령은 클라이언트에게 성공이라고 알린 적이 없습니다. 그림 3은 리더가 네트워크의 작은 쪽에 갇힌 경우입니다.
      </p>
      <PartitionFigure />
      <p>
        S5가 임기 1의 리더로 명령 a와 b를 커밋한 뒤, 네트워크가 S5와 S1, 그리고 S2, S3, S4로 나뉩니다. S5는 자기가 아직 리더라고 믿고 명령 c와 d를 받아 적지만, 함께 있는 S1까지 두 대뿐이라 과반(세 대)이 되지 않아 커밋하지 못합니다. 그동안 큰 쪽에서는 하트비트가 끊긴 S4가 임기 2의 후보가 되어 590ms에 리더가 되고, 명령 e와 f를 세 대에 복제해 커밋합니다. 네트워크가 다시 이어지면 S5는 임기 2의 메시지를 받고 물러나고, S5와 S1의 항목 3, 4(c와 d)는 S4의 e와 f로 덮어써집니다. 같은 시각에 리더가 두 명이었지만 커밋할 수 있었던 것은 과반을 가진 쪽 하나뿐이었습니다.
      </p>
      <Callout kind="warn">
        그림 3에서 S5는 네트워크가 끊긴 동안에도 자기가 리더라고 믿습니다. 그래서 리더라는 사실만 믿고 읽기 요청에 답하면 큰 쪽에서 이미 바뀐 값 대신 낡은 값을 돌려줄 수 있습니다. 실제 구현은 읽기에 답하기 전에 과반과 한 번 하트비트를 주고받아 자기가 아직 리더인지 확인하거나, 읽기도 로그에 적어 커밋한 뒤에 답합니다. 이런 선택이 다음 장의 일관성 이야기입니다.
      </Callout>

      <h2>예전 임기의 항목은 세지 않는다</h2>
      <p>
        여기까지 보면 "과반에 복제된 항목은 커밋"이라는 규칙이면 충분해 보입니다. 그런데 Raft에는 한 가지 단서가 더 붙습니다. <strong>리더는 자기 임기에 적은 항목만 복제본 수를 세어 커밋합니다.</strong> 예전 임기의 항목은 그 뒤에 오는 자기 임기의 항목이 커밋될 때 함께 커밋됩니다. 그림 4는 이 단서가 없으면 무엇이 잘못되는지 보여 줍니다.
      </p>
      <OldTermFigure />
      <p>
        (다)에서 항목 2는 세 대에 있지만 S1, S2, S3의 마지막 항목은 임기 2와 4이고 S5의 마지막 항목은 임기 3입니다. S5가 다시 켜지면 S2, S3에게 "내 로그가 더 최신"이라고 주장할 수 있고(임기 3이 2보다 크므로), 실제로 (라)처럼 리더가 되어 항목 2를 덮어씁니다. 과반에 있다는 것만으로는 그 항목이 미래의 모든 리더에게 남는다고 장담할 수 없었던 것입니다. 반대로 S1이 자기 임기 4의 항목 3을 과반에 복제했다면 (마)처럼 그 과반은 모두 마지막 임기가 4인 로그를 갖게 되고, 투표 규칙 때문에 임기 4의 항목이 없는 서버는 리더가 될 수 없습니다. 투표 규칙과 이 커밋 규칙이 맞물려서, 새로 뽑힌 리더는 언제나 지금까지 커밋된 항목을 모두 가지고 있습니다. 그림 1의 시뮬레이터는 이 규칙대로 동작하며, 서버를 끄고 켜고 네트워크를 끊는 무작위 조작을 서버 3, 5, 7대에 대해 900번 돌려도 한 임기에 리더가 둘이 되거나 커밋된 항목이 바뀐 적이 없습니다.
      </p>

      <h2>실제로 쓰이는 곳</h2>
      <p>
        합의는 보통 데이터 전부가 아니라 "누가 리더인가", "설정이 무엇인가"처럼 작지만 틀리면 안 되는 정보를 지키는 데 씁니다. 쿠버네티스는 클러스터의 모든 상태를 Raft로 복제하는 저장소 etcd에 두고, HashiCorp의 Consul도 Raft로 서비스 목록과 설정을 지킵니다. CockroachDB와 TiKV 같은 분산 데이터베이스는 데이터를 수많은 조각으로 나누고 조각마다 따로 Raft 무리를 돌려, 조각 하나의 복제본 세 개가 같은 순서로 쓰기를 적용하게 합니다. <a href={lessonHref('cs-databases', 'transactions')}>트랜잭션</a> 장에서 본 커밋 로그를 여러 대에 안전하게 남기는 일이 바로 이것입니다.
      </p>
      <p>
        Raft보다 먼저 나온 합의 알고리즘은 램포트(Leslie Lamport)가 1989년에 쓰고 1998년에 발표한 <T en="Paxos">팍소스</T>입니다. 구글의 Chubby와 Spanner가 팍소스를 쓰고, 아파치 ZooKeeper는 비슷한 Zab을 씁니다. 과반수로 결정하고 번호(팍소스의 제안 번호, Raft의 임기)로 오래된 결정을 가려낸다는 핵심은 같습니다. Raft는 리더 하나에 역할을 몰아주고 로그에 구멍이 생기지 않게 해서 같은 일을 더 따라가기 쉽게 만들었습니다. 합의는 과반이 서로 이야기할 수 있어야 진행되므로, 네트워크가 끊기면 작은 쪽은 쓰기를 멈춥니다. 멈출 것인가, 낡을 수 있는 답이라도 줄 것인가의 선택은 <a href={lessonHref('cs-parallel-distributed', 'consistency')}>다음 장</a>에서 다룹니다.
      </p>

      <Callout kind="key">
        데이터를 여러 서버에 복제하고 모두가 같은 명령을 같은 순서로 실행하게 하려면 로그의 순서에 합의해야 합니다. Raft는 임기마다 과반의 표로 리더를 한 명 뽑고, 리더가 로그를 팔로워들에게 복제하며, 과반에 복제된 자기 임기의 항목을 커밋합니다. 과반끼리는 언제나 겹치므로 서버 <M>{'2f+1'}</M>대는 <M>{'f'}</M>대의 고장을 견디고, 한 임기에 리더가 둘 생기거나 커밋된 항목이 사라지는 일은 일어나지 않습니다. 무작위로 흩뜨린 선거 타이머가 표 갈림을 줄여, 리더가 꺼져도 수백 밀리초 안에 새 리더가 나옵니다.
      </Callout>
      <Quiz
        q="서버 세 대로 Raft 클러스터를 운영하다가 '더 안전하게' 하려고 한 대를 더해 네 대로 만들었다. 이제 동시에 몇 대가 꺼져도 클러스터가 계속 쓰기를 받을 수 있을까?"
        options={['0대', '1대', '2대', '3대']}
        answer={1}
        explain={<>네 대의 과반은 세 대입니다. 두 대가 꺼지면 두 대만 남아 과반을 만들 수 없으므로 견디는 고장은 한 대뿐이고, 세 대일 때와 같습니다. 오히려 매번 세 대의 응답을 기다려야 하니 쓰기는 조금 느려집니다. 그래서 합의 클러스터는 보통 세 대, 다섯 대, 일곱 대처럼 홀수로 꾸립니다. 두 대의 고장을 견디려면 다섯 대(2f+1, f = 2)가 필요합니다.</>}
      />
    </>
  );
}
