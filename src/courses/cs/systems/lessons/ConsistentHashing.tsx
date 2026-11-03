import { useMemo, useState, type MouseEvent } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, type CanvasSize } from '../../../../lib/canvas';
import { drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { RING, SERVER_NAMES, buildRing, failureImpact, keyHashes, loadStats, modOwner, movedCount, replicas, ringOwner, ringShares, successor, type Ring } from './systems';
import './systems.css';

/* ─────────────── shared drawing helpers ─────────────── */

/** One colour per server A–J, from theme tokens so both themes work. */
function useServerColors(P: Palette): string[] {
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    return [P.neg, P.pos, P.good, P.stats2, P.hl, P.bad, P.stats1, v('--c-cs-3', P.dl), v('--c-cs-1', P.ml), P.ink3];
  }, [P]);
}
/** Text colour on a server-coloured fill (the yellow needs dark text in both themes). */
const inkOn = (P: Palette, fill: string) => (fill === P.hl ? '#1a1a1a' : P.surface);

interface RingGeom {
  cx: number;
  cy: number;
  R: number;
  ang: (p: number) => number;
  at: (p: number, r: number) => [number, number];
}
function ringGeom({ w, h }: CanvasSize, pad: number): RingGeom {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.max(40, Math.min(w, h) / 2 - pad);
  // 0 at twelve o'clock, positions grow clockwise
  const ang = (p: number) => -Math.PI / 2 + (p / RING) * Math.PI * 2;
  return { cx, cy, R, ang, at: (p, r) => [cx + r * Math.cos(ang(p)), cy + r * Math.sin(ang(p))] };
}

/** The ring itself: each arc in the colour of the server that owns it (the point at the arc's clockwise end). */
function drawArcs(ctx: CanvasRenderingContext2D, g: RingGeom, ring: Ring, color: (s: string) => string, lw: number) {
  const n = ring.pos.length;
  ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const start = i === 0 ? ring.pos[n - 1] - RING : ring.pos[i - 1];
    ctx.strokeStyle = color(ring.owner[i]);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, g.ang(start), g.ang(ring.pos[i]));
    ctx.stroke();
  }
}

/** A server's point on the ring: a labelled disc, or a short tick when there are many points. */
function drawPoint(ctx: CanvasRenderingContext2D, P: Palette, g: RingGeom, pos: number, label: string, fill: string, size: number, mode: 'disc' | 'tick' | 'tickNew' | 'gone') {
  const [x, y] = g.at(pos, g.R);
  if (mode === 'tick' || mode === 'tickNew') {
    const fresh = mode === 'tickNew';
    const [x1, y1] = g.at(pos, g.R - (fresh ? 11 : 7));
    const [x2, y2] = g.at(pos, g.R + (fresh ? 11 : 7));
    ctx.strokeStyle = fill;
    ctx.lineWidth = fresh ? 3.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (fresh) {
      // a dark cap marks the points of the server that just joined
      ctx.beginPath();
      ctx.arc(x2, y2, 3, 0, Math.PI * 2);
      ctx.fillStyle = P.ink;
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  if (mode === 'gone') {
    ctx.fillStyle = P.surface;
    ctx.fill();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = P.ink3;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = P.surface;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = mode === 'gone' ? P.ink3 : inkOn(P, fill);
  ctx.font = `700 ${Math.round(size * 1.05)}px ${P.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

/** Keys sit just inside the ring at their hash angle, staggered over four radii so they don't pile up. */
const keyRadius = (g: RingGeom, i: number) => g.R - 16 - (i % 4) * 6;

/* ─────────────── Figure 1: modulo vs ring, keys moved ─────────────── */

const K1 = 200;
const HASH1 = keyHashes(K1);

function MoveFigure() {
  const P = usePalette();
  const colors = useServerColors(P);
  const [st, setSt] = useState({ n: 5, prev: 4 });
  const [vn, setVn] = useState(1);
  const setN = (n: number) => setSt((s) => (n === s.n ? s : { n, prev: s.n }));
  const colorOf = (s: string) => colors[SERVER_NAMES.indexOf(s)];

  const r = useMemo(() => {
    const before = SERVER_NAMES.slice(0, st.prev);
    const after = SERVER_NAMES.slice(0, st.n);
    const ringB = buildRing(before, vn);
    const ringA = buildRing(after, vn);
    const modB = HASH1.map((h) => modOwner(h, before));
    const modA = HASH1.map((h) => modOwner(h, after));
    const rgB = HASH1.map((h) => ringOwner(ringB, h));
    const rgA = HASH1.map((h) => ringOwner(ringA, h));
    return { before, after, ringB, ringA, modA, rgA, modMoved: modA.map((s, i) => s !== modB[i]), rgMoved: rgA.map((s, i) => s !== rgB[i]), mod: movedCount(modB, modA), rg: movedCount(rgB, rgA) };
  }, [st, vn]);
  const ideal = (K1 * Math.abs(st.n - st.prev)) / Math.max(st.n, st.prev);
  const pct = (c: number) => `${Math.round((c / K1) * 100)}%`;

  const drawDot = (ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, fill: string, moved: boolean) => {
    ctx.beginPath();
    ctx.arc(x, y, moved ? rad * 1.2 : rad, 0, Math.PI * 2);
    ctx.fillStyle = moved ? fill : alpha(fill, 0.3);
    ctx.fill();
    if (moved) {
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  };

  const mod = useCanvas2D(
    (ctx, { w, h }) => {
      const cols = Math.ceil(Math.sqrt((K1 * w) / h));
      const rows = Math.ceil(K1 / cols);
      const cell = Math.min((w - 16) / cols, (h - 16) / rows);
      const ox = (w - cell * cols) / 2;
      const oy = (h - cell * rows) / 2;
      for (let i = 0; i < K1; i++) {
        const x = ox + ((i % cols) + 0.5) * cell;
        const y = oy + (Math.floor(i / cols) + 0.5) * cell;
        drawDot(ctx, x, y, cell * 0.3, colorOf(r.modA[i]), r.modMoved[i]);
      }
    },
    [P, r, colors],
    { aspect: 1.05, maxHeight: 330, minHeight: 220 },
  );

  const ring = useCanvas2D(
    (ctx, size) => {
      const g = ringGeom(size, 20);
      drawArcs(ctx, g, r.ringA, (s) => alpha(colorOf(s), 0.55), 5);
      for (let i = 0; i < K1; i++) {
        const [x, y] = g.at(HASH1[i], keyRadius(g, i));
        drawDot(ctx, x, y, 2.8, colorOf(r.rgA[i]), r.rgMoved[i]);
      }
      const now = new Set(r.after);
      const was = new Set(r.before);
      const disc = Math.max(9, Math.min(12, g.R / 11));
      // servers that just left: hollow, so the reader sees whose keys were handed on
      r.ringB.pos.forEach((p, i) => {
        const s = r.ringB.owner[i];
        if (!now.has(s)) drawPoint(ctx, P, g, p, s, P.ink3, vn === 1 ? disc : 4, vn === 1 ? 'gone' : 'tick');
      });
      r.ringA.pos.forEach((p, i) => {
        const s = r.ringA.owner[i];
        drawPoint(ctx, P, g, p, s, colorOf(s), disc, vn === 1 ? 'disc' : was.has(s) ? 'tick' : 'tickNew');
        if (!was.has(s) && vn === 1) {
          const [x, y] = g.at(p, g.R);
          ctx.beginPath();
          ctx.arc(x, y, disc + 4, 0, Math.PI * 2);
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

    },
    [P, r, colors, vn],
    { aspect: 1.05, maxHeight: 330, minHeight: 220 },
  );

  const change = st.n > st.prev ? `${st.prev}대 → ${st.n}대 (추가)` : `${st.prev}대 → ${st.n}대 (제거)`;

  return (
    <Figure
      no={1}
      title="나머지 해싱 vs 해시 링: 서버 수가 바뀌면 몇 개가 옮겨지나"
      hint="서버를 추가하거나 빼 보세요"
      caption={<>점 하나가 키 하나이고, 색은 그 키를 맡은 서버입니다. 마지막 변화에서 맡는 서버가 바뀐 키는 테두리를 두르고 진하게, 그대로인 키는 흐리게 그렸습니다. 해시 링에서 키는 자기 위치에서 시계 방향으로 가장 먼저 만나는 서버에 갑니다. 굵은 원은 방금 들어온 서버, 점선 원은 방금 빠진 서버입니다. 서버당 점이 20개일 때는 서버의 점을 짧은 눈금으로 그렸고, 방금 들어온 서버의 눈금은 길고 끝이 검습니다.</>}
    >
      <div className="ch-pair">
        <div className="ch-panel">
          <div className="ch-head">
            <strong>나머지 해싱</strong> <span className="mono">servers[hash % N]</span>
          </div>
          <div ref={mod.wrapRef} className="canvas-box" role="img" aria-label={`나머지 해싱: ${change}, 키 ${K1}개 중 ${r.mod}개 이동`}>
            <canvas ref={mod.canvasRef} />
          </div>
          <div className="ch-count">
            옮겨진 키 <strong style={{ color: 'var(--bad)' }}>{r.mod}</strong> / {K1}
          </div>
        </div>
        <div className="ch-panel">
          <div className="ch-head">
            <strong>해시 링</strong> <span>시계 방향으로 다음 서버</span>
          </div>
          <div ref={ring.wrapRef} className="canvas-box" role="img" aria-label={`해시 링: ${change}, 키 ${K1}개 중 ${r.rg}개 이동`}>
            <canvas ref={ring.canvasRef} />
          </div>
          <div className="ch-count">
            옮겨진 키 <strong style={{ color: 'var(--good)' }}>{r.rg}</strong> / {K1}
          </div>
        </div>
      </div>
      <Legend items={r.after.map((s) => ({ color: colorOf(s), label: `서버 ${s}`, shape: 'dot' as const }))} />
      <div className="fig-cols">
        <div className="controls">
          <Slider id="ch-n" label="서버 수 N" value={st.n} min={2} max={10} step={1} onChange={setN} color="var(--c-cs-3)" />
          <div className="btn-row">
            <Button small primary onClick={() => setN(st.n + 1)} disabled={st.n >= 10}>
              서버 추가 (+1)
            </Button>
            <Button small onClick={() => setN(st.n - 1)} disabled={st.n <= 2}>
              서버 빼기 (−1)
            </Button>
          </div>
          <Seg
            label="링 위의 점"
            value={vn}
            onChange={setVn}
            options={[
              { value: 1, label: '서버당 1개' },
              { value: 20, label: '서버당 20개' },
            ]}
          />
        </div>
        <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr', alignSelf: 'start' }} aria-live="polite">
          <Readout label="마지막 변화" value={change} />
          <Readout label="꼭 옮겨야 하는 최소량" value={`≈ ${ideal.toFixed(0)}개`} />
          <Readout label="나머지 해싱: 이동" value={`${r.mod}개 · ${pct(r.mod)}`} color="var(--bad)" />
          <Readout label="해시 링: 이동" value={`${r.rg}개 · ${pct(r.rg)}`} color="var(--good)" />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: virtual nodes even out the load ─────────────── */

function VnodeFigure() {
  const P = usePalette();
  const colors = useServerColors(P);
  const [v, setV] = useState(1);
  const [n, setN] = useState(10);
  const [salt, setSalt] = useState(0);
  const servers = SERVER_NAMES.slice(0, n);
  const ring = useMemo(() => buildRing(servers, v, salt), [n, v, salt]); // eslint-disable-line react-hooks/exhaustive-deps
  const shares = useMemo(() => ringShares(ring, servers), [ring]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = loadStats(shares);
  const colorOf = (s: string) => colors[SERVER_NAMES.indexOf(s)];

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 8;
      const padR = 8;
      const sw = w - padL - padR;
      // the ring cut open at 0 and laid flat
      const sy = 22;
      const sh = 16;
      const npts = ring.pos.length;
      for (let i = 0; i < npts; i++) {
        const x0 = padL + ((i === 0 ? 0 : ring.pos[i - 1]) / RING) * sw;
        const x1 = padL + (ring.pos[i] / RING) * sw;
        ctx.fillStyle = colorOf(ring.owner[i]);
        ctx.fillRect(x0, sy, Math.max(0.5, x1 - x0), sh);
      }
      // the stretch after the last point wraps around to the first point's server
      ctx.fillStyle = colorOf(ring.owner[0]);
      ctx.fillRect(padL + (ring.pos[npts - 1] / RING) * sw, sy, sw - (ring.pos[npts - 1] / RING) * sw, sh);
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(padL + 0.5, sy + 0.5, sw - 1, sh - 1);
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('0', padL, sy - 3);
      ctx.textAlign = 'right';
      ctx.fillText('2³²', w - padR, sy - 3);
      ctx.textAlign = 'center';
      ctx.fillStyle = P.ink2;
      ctx.font = `12px ${P.fontBody}`;
      ctx.fillText('링을 0에서 잘라 편 모습', w / 2, sy - 3);

      // bars: each server's share of the ring
      const top = 80;
      const bottom = h - 24;
      const yMax = Math.max(stats.max * 1.12, 2 / n);
      const Y = (s: number) => bottom - (s / yMax) * (bottom - top);
      const slot = sw / n;
      const bw = Math.min(46, slot * 0.68);
      const narrow = slot < 40;
      ctx.strokeStyle = P.line;
      ctx.beginPath();
      ctx.moveTo(padL, bottom + 0.5);
      ctx.lineTo(w - padR, bottom + 0.5);
      ctx.stroke();
      servers.forEach((s, i) => {
        const cx = padL + slot * (i + 0.5);
        const y = Y(shares[i]);
        ctx.fillStyle = colorOf(s);
        ctx.fillRect(cx - bw / 2, y, bw, bottom - y);
        ctx.fillStyle = P.ink;
        ctx.font = `600 12px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(s, cx, bottom + 5);
        ctx.font = `${narrow ? 10 : 11}px ${P.fontMono}`;
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = P.ink2;
        ctx.fillText(`${(shares[i] * 100).toFixed(narrow ? 0 : 1)}`, cx, y - 3);
      });
      // the fair share
      const ym = Y(1 / n);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(padL, ym);
      ctx.lineTo(w - padR, ym);
      ctx.stroke();
      ctx.setLineDash([]);
      // its label sits above the plot so it never covers a bar's number
      const lbl = `점선: 똑같이 나눈 몫 ${(100 / n).toFixed(0)}% · 막대 위 숫자는 %`;
      ctx.font = `11px ${P.fontBody}`;
      ctx.fillStyle = P.ink2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, w - padR, top - 28);
    },
    [P, ring, shares, colors],
    { aspect: 1.75, maxHeight: 330, minHeight: 250 },
  );

  return (
    <Figure
      no={2}
      title="가상 노드: 서버 하나를 링 위 여러 점에"
      hint="가상 노드 수를 늘려 보세요"
      caption={<>위 띠는 링 전체를 한 줄로 편 것으로, 색은 그 구간의 키를 맡는 서버입니다. 막대는 서버마다 링에서 맡은 몫(%)이고, 점선은 모두 똑같이 나눴을 때의 몫입니다. 키가 링 위에 고르게 흩어진다면 서버가 받는 키의 비율은 이 몫과 같습니다. "다른 해시"는 서버 이름에 덧붙이는 값을 바꿔 링 위치를 새로 뽑습니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`서버 ${n}대, 가상 노드 ${v}개: 가장 바쁜 서버가 평균의 ${stats.maxOverMean.toFixed(2)}배`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ch-v" label="서버당 가상 노드" value={v} min={1} max={200} step={1} onChange={setV} color="var(--c-cs-3)" />
          <Seg
            label="서버 수"
            value={n}
            onChange={setN}
            options={[
              { value: 5, label: '5대' },
              { value: 10, label: '10대' },
            ]}
          />
          <div className="btn-row">
            <Button small onClick={() => setSalt((x) => x + 1)}>
              다른 해시
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="링 위의 점" value={`${(n * v).toLocaleString('ko-KR')}개`} />
            <Readout label="가장 바쁜 ÷ 평균" value={`${stats.maxOverMean.toFixed(2)}배`} color={stats.maxOverMean > 1.5 ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="가장 한가한 ÷ 평균" value={`${(stats.min / stats.mean).toFixed(2)}배`} />
            <Readout label="표준편차 ÷ 평균" value={`${(stats.cv * 100).toFixed(0)}%`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: replicas on the next R servers ─────────────── */

const K3 = 120;
const HASH3 = keyHashes(K3);
const SERVERS3 = SERVER_NAMES.slice(0, 6);
const ORDER3 = HASH3.map((_, i) => i).sort((x, y) => HASH3[x] - HASH3[y]); // keys in clockwise order

function ReplicaFigure() {
  const P = usePalette();
  const colors = useServerColors(P);
  const [r, setR] = useState(3);
  const [v, setV] = useState(1);
  const [sel, setSel] = useState(ORDER3[0]);
  const [down, setDown] = useState<string[]>([]);
  const colorOf = (s: string) => colors[SERVER_NAMES.indexOf(s)];

  const ring = useMemo(() => buildRing(SERVERS3, v), [v]);
  const downSet = useMemo(() => new Set(down), [down]);
  const alive = useMemo(() => buildRing(SERVERS3.filter((s) => !downSet.has(s)), v), [v, downSet]);
  const rep = replicas(ring, HASH3[sel], r, downSet);
  const impact = useMemo(() => failureImpact(ring, HASH3, r, downSet), [ring, r, downSet]);
  const lostKey = useMemo(() => HASH3.map((h) => replicas(ring, h, r).servers.every((s) => downSet.has(s))), [ring, r, downSet]);

  const toggle = (s: string) => setDown((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s].sort()));
  const move = (dir: number) => {
    const at = ORDER3.indexOf(sel);
    setSel(ORDER3[(at + dir + K3) % K3]);
  };

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, sz) => {
      const g = ringGeom(sz, 34);
      if (alive.pos.length) drawArcs(ctx, g, alive, (s) => alpha(colorOf(s), 0.5), 5);
      // keys, coloured by the server holding their first copy now
      const drawKey = (i: number) => {
        const [x, y] = g.at(HASH3[i], keyRadius(g, i));
        const isSel = i === sel;
        if (isSel) {
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fillStyle = P.surface;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y, isSel ? 6 : 2.8, 0, Math.PI * 2);
        if (lostKey[i]) {
          ctx.fillStyle = P.surface;
          ctx.fill();
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        } else {
          ctx.fillStyle = alive.pos.length ? alpha(colorOf(ringOwner(alive, HASH3[i])), isSel ? 1 : 0.55) : P.ink3;
          ctx.fill();
          if (isSel) {
            ctx.strokeStyle = P.ink;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      };
      for (let i = 0; i < K3; i++) if (i !== sel) drawKey(i);
      // the clockwise walk from the selected key to its last replica
      if (rep.visited.length) {
        const h0 = HASH3[sel];
        const last = ring.pos[rep.visited[rep.visited.length - 1].idx];
        const end = last >= h0 ? last : last + RING;
        const rw = g.R + 13;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, rw, g.ang(h0), g.ang(end));
        ctx.stroke();
        const a1 = g.ang(end) - 0.04;
        const tip: [number, number] = [g.cx + rw * Math.cos(g.ang(end)), g.cy + rw * Math.sin(g.ang(end))];
        drawArrow(ctx, g.cx + rw * Math.cos(a1), g.cy + rw * Math.sin(a1), tip[0], tip[1], P.ink, 2, 7);
        const [kx, ky] = g.at(h0, keyRadius(g, sel));
        const [sx, sy2] = g.at(h0, rw);
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        ctx.lineTo(sx, sy2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // ring points: crossed out when the server is down
      const disc = v === 1 ? Math.max(9, Math.min(12, g.R / 11)) : 8;
      ring.pos.forEach((p, i) => {
        const s = ring.owner[i];
        drawPoint(ctx, P, g, p, s, colorOf(s), disc, downSet.has(s) ? 'gone' : 'disc');
        if (downSet.has(s)) {
          const [x, y] = g.at(p, g.R);
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(x - disc * 0.8, y - disc * 0.8);
          ctx.lineTo(x + disc * 0.8, y + disc * 0.8);
          ctx.stroke();
        }
      });
      // replica order badges outside the ring; skipped points get a small ring
      let k = 0;
      for (const vis of rep.visited) {
        const [x, y] = g.at(ring.pos[vis.idx], g.R + 25);
        if (vis.taken) {
          k++;
          ctx.beginPath();
          ctx.arc(x, y, 8.5, 0, Math.PI * 2);
          ctx.fillStyle = P.ink;
          ctx.fill();
          ctx.fillStyle = P.surface;
          ctx.font = `700 11px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k), x, y + 1);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.strokeStyle = P.ink3;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      drawKey(sel);
      // name of the selected key, on a backing so it reads over the dots
      const [lx, ly] = g.at(HASH3[sel], keyRadius(g, sel) - 22);
      const label = `key-${sel}`;
      ctx.font = `600 12px ${P.fontMono}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = alpha(P.surface, 0.92);
      ctx.fillRect(lx - tw / 2 - 4, ly - 9, tw + 8, 18);
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly + 1);
    },
    [P, ring, alive, sel, r, downSet, colors, lostKey, v],
    { aspect: 1.08, maxHeight: 400, minHeight: 280 },
  );

  // clicking the ring picks the key nearest to that angle
  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - size.w / 2;
    const y = e.clientY - rect.top - size.h / 2;
    const p = ((((Math.atan2(y, x) + Math.PI / 2) / (Math.PI * 2)) % 1) + 1) % 1 * RING;
    let best = 0;
    let bd = Infinity;
    HASH3.forEach((h, i) => {
      const d = Math.min(Math.abs(h - p), RING - Math.abs(h - p));
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setSel(best);
  };

  const primary = alive.pos.length ? alive.owner[successor(alive, HASH3[sel])] : null;

  return (
    <Figure
      no={3}
      title="복제: 시계 방향으로 서로 다른 서버 R대에"
      hint="서버를 꺼 보고, 링을 눌러 다른 키를 골라 보세요"
      caption={<>큰 점이 고른 키이고, 바깥쪽 화살표가 그 키에서 시계 방향으로 걸어가며 복제본을 둘 서버를 고르는 길입니다. 숫자는 복제본의 순서(1이 첫 번째)이고, 작은 빈 원은 이미 고른 서버의 다른 점이거나 꺼진 서버라서 건너뛴 점입니다. 서버를 끄면 그 서버의 점이 링에서 빠지고, 키들은 다음 서버로 넘어갑니다. 빨간 테두리의 빈 점은 복제본을 둔 서버가 모두 꺼져 데이터를 잃은 키입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box ch-click" role="img" aria-label={`해시 링: key-${sel}의 복제본 ${rep.servers.join(', ') || '없음'}`}>
          <canvas ref={canvasRef} onClick={pick} />
        </div>
        <div className="controls">
          <Seg
            label="복제본 수 R"
            value={r}
            onChange={setR}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
          />
          <Seg
            label="서버당 점"
            value={v}
            onChange={setV}
            options={[
              { value: 1, label: '1개' },
              { value: 4, label: '4개' },
            ]}
          />
          <div className="ctl">
            <span className="ctl-label">
              <span>서버 끄기</span>
            </span>
            <div className="btn-row ch-servers">
              {SERVERS3.map((s) => (
                <button key={s} type="button" className="btn small ch-srv" aria-pressed={downSet.has(s)} aria-label={`서버 ${s} ${downSet.has(s) ? '켜기' : '끄기'}`} disabled={!downSet.has(s) && down.length >= SERVERS3.length - 1} onClick={() => toggle(s)} style={{ ['--srv' as string]: colorOf(s) }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-row">
            <Button small onClick={() => move(-1)} label="이전 키">
              ◀ 이전 키
            </Button>
            <Button small onClick={() => move(1)} label="다음 키">
              다음 키 ▶
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }} aria-live="polite">
            <Readout label={`key-${sel}의 복제본`} value={rep.servers.length ? rep.servers.join(' → ') : '없음'} />
            <Readout label="첫 복제본" value={primary ?? '—'} />
            <Readout label="잃은 키" value={`${impact.lost} / ${K3}`} color={impact.lost ? 'var(--bad)' : 'var(--good)'} />
            <Readout label="새로 만들 복제본" value={impact.copies ? `${impact.copies}개 → ${impact.receivers.join('·')}` : '없음'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function ConsistentHashing() {
  return (
    <>
      <h2>키를 서버에 나누는 가장 쉬운 방법</h2>
      <p>
        사용자 세션이나 상품 정보를 캐시 서버 여러 대에 나눠 담는다고 합시다. 어떤 키가 어느 서버에 있는지 따로 기록해 두지 않으려면, 키만 보고 서버를 계산할 수 있어야 합니다. 가장 먼저 떠오르는 방법은 <a href="#cs-algorithms/search-hash">해시 테이블</a>이 칸을 고르는 방법 그대로, 키의 해시값을 서버 수로 나눈 나머지를 쓰는 것입니다.
      </p>
      <Code label="나머지 해싱">{`
function serverFor(key, servers) {
  return servers[hash32(key) % servers.length];
}`}</Code>
      <p>
        해시 함수가 키를 고르게 흩어 준다면 서버마다 거의 같은 수의 키를 맡고, 어떤 클라이언트든 같은 키에 대해 같은 서버를 고릅니다. 서버 수가 바뀌지 않는 한 아무 문제가 없습니다.
      </p>
      <p>
        문제는 서버를 한 대 늘리거나 한 대가 죽었을 때입니다. 나누는 수 N이 바뀌면 나머지가 거의 전부 바뀝니다. 키가 제자리에 남으려면 <M>{'h \\bmod N'}</M>과 <M>{'h \\bmod (N+1)'}</M>이 같아야 하는데, 해시값이 고르게 퍼져 있으면 그럴 확률은 <M>{'1/(N+1)'}</M>뿐입니다. 거꾸로 말하면 키의 <M>{'N/(N+1)'}</M>이 다른 서버로 옮겨 갑니다.
      </p>
      <MB note="키 20만 개로 직접 세어 보니 4 → 5대에서 79.9%, 10 → 11대에서 90.9%가 옮겨졌습니다.">{'\\text{옮겨지는 비율} = \\frac{N}{N+1} \\qquad N = 4 \\to 80\\%, \\quad N = 10 \\to 91\\%'}</MB>
      <p>
        캐시라면 옮겨진 키는 새 서버에 아직 없으므로 모두 캐시 미스가 납니다. 서버 한 대를 늘린 순간 거의 모든 요청이 뒤의 데이터베이스로 쏟아지는 것입니다. 데이터베이스 샤드라면 사정이 더 나빠서, 거의 모든 데이터를 네트워크 너머로 복사해야 합니다. 그런데 새 서버가 공평하게 제 몫을 맡으려면 원래 옮겨야 하는 양은 전체의 <M>{'1/(N+1)'}</M>뿐입니다. 이 차이를 메우는 것이 <T en="consistent hashing">일관된 해싱</T>입니다.
      </p>

      <h2>해시 링</h2>
      <p>
        일관된 해싱은 1997년 Karger 등이 웹 캐시에서 특정 서버에 요청이 몰리는 문제를 다루며 제안했습니다. 아이디어는 해시값의 범위 <M>{'[0, 2^{32})'}</M>를 원으로 이어 붙이고, <strong>서버도 키와 같은 해시 함수로 원 위에 올리는 것</strong>입니다. 키는 자기 위치에서 시계 방향으로 돌다가 처음 만나는 서버에 맡깁니다.
      </p>
      <ul>
        <li>서버를 추가하면, 새 서버와 반시계 방향 이웃 사이 구간의 키만 새 서버로 옮겨 갑니다. 다른 구간은 아무 영향이 없습니다.</li>
        <li>서버를 빼면, 그 서버가 맡던 키만 시계 방향 다음 서버로 넘어갑니다.</li>
      </ul>
      <p>서버 수 N이 계산식에 들어가지 않으니, N이 바뀌어도 대부분의 키는 그대로 있습니다.</p>
      <MoveFigure />
      <p>
        처음 화면은 서버를 4대에서 5대로 늘린 직후입니다. 나머지 해싱에서는 200개 중 163개(82%)가 자리를 옮겼고, 해시 링에서는 13개만 옮겼으며 그 13개는 모두 새 서버 E로 갔습니다. 서버를 한 대씩 더 늘리거나 빼 보세요. 나머지 해싱은 매번 70~90%가 움직이는데, 해시 링은 옮겨진 키가 언제나 새 서버로 가거나 빠진 서버에서 나옵니다.
      </p>
      <p>
        그런데 해시 링의 숫자를 "꼭 옮겨야 하는 최소량"과 비교해 보면 들쭉날쭉합니다. 4 → 5대에서는 최소량 40개보다 훨씬 적은 13개만 옮겼고, 9 → 10대에서는 새 서버 J가 키를 하나도 받지 못합니다. 많이 옮기지 않은 것이 좋아 보이지만, 사실은 새 서버가 링에서 아주 좁은 구간을 맡게 되어 제 몫을 하지 못한다는 뜻입니다. 서버 위치를 해시로 정하니 운에 따라 구간 길이가 크게 달라집니다. "서버당 20개"로 바꾸면 이동량이 최소량 근처로 모입니다. 이것이 다음 절의 가상 노드입니다.
      </p>
      <p>
        찾는 방법은 <a href="#cs-algorithms/search-hash">이진 탐색</a>입니다. 서버들의 링 위치를 정렬된 배열로 들고 있다가, 키의 해시값 이상인 첫 위치를 찾으면 됩니다. 끝을 넘어가면 원을 한 바퀴 돌아 첫 위치로 갑니다.
      </p>
      <Code label="해시 링: 정렬된 위치 + 이진 탐색">{`
class HashRing {
  points = [];   // { pos, server }, pos 순으로 정렬
  constructor(vnodes = 100) { this.vnodes = vnodes; }

  add(server) {
    // 가상 노드: 서버 하나를 이름을 조금씩 바꿔 여러 번 올린다
    for (let v = 0; v < this.vnodes; v++) {
      const pos = hash32(\`\${server}#\${v}\`);
      this.points.splice(this.search(pos), 0, { pos, server });
    }
  }

  remove(server) {
    this.points = this.points.filter((p) => p.server !== server);
  }

  get(key) {
    if (this.points.length === 0) return undefined;
    const i = this.search(hash32(key));
    return this.points[i % this.points.length].server; // 끝을 넘으면 처음으로
  }

  // pos 이상인 첫 점의 인덱스 (이진 탐색, O(log n))
  search(pos) {
    let lo = 0, hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.points[mid].pos < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}`}</Code>
      <p>
        <code>hash32</code>는 문자열을 32비트 부호 없는 정수로 바꾸는 해시 함수면 무엇이든 됩니다. 이 글의 그림은 FNV-1a에 MurmurHash3의 마무리 단계를 덧붙인 함수를 씁니다. 서버 추가는 <code>splice</code> 때문에 점 개수에 비례하는 시간이 들지만 드물게 일어나는 일이고, 매 요청마다 하는 <code>get</code>은 점이 n개일 때 <M>{'O(\\log n)'}</M>입니다.
      </p>

      <h2>가상 노드</h2>
      <p>
        서버 하나를 링 위의 한 점으로만 두면, 점 사이 간격이 무작위라 서버마다 맡는 구간의 길이가 크게 다릅니다. 서버가 N대일 때 가장 긴 구간의 기댓값은 평균 구간의 <M>{'1 + \\tfrac12 + \\cdots + \\tfrac1N'}</M>배로, 10대면 약 2.9배입니다. 가장 바쁜 서버가 평균의 세 배 가까운 일을 하는 것입니다.
      </p>
      <p>
        해결책은 서버 하나를 링 위의 <strong>여러 점</strong>에 올리는 것입니다. <code>"A#0"</code>, <code>"A#1"</code>, …처럼 이름을 바꿔 가며 해시하면 서버 A가 링 곳곳에 흩어진 점들을 갖게 됩니다. 이 점들을 <T en="virtual node, vnode">가상 노드</T>라고 합니다. 서버의 몫은 짧고 긴 구간 여러 개의 합이 되어 평균에 가까워집니다.
      </p>
      <VnodeFigure />
      <p>
        서버 10대에 가상 노드 1개로 시작하면 가장 바쁜 서버가 평균의 2.33배를 맡습니다. 슬라이더를 100까지 올리면 1.15배로 내려옵니다. "다른 해시"를 여러 번 눌러 보면 숫자가 매번 바뀌는데, 해시를 바꿔 가며 400번 평균을 내 보니 가상 노드 1개에서 2.96배(위의 기댓값 2.9와 맞습니다), 100개에서 1.16배, 200개에서 1.11배였습니다. 표준편차는 평균의 대략 <M>{'1/\\sqrt{V}'}</M>로 줄어들어, V = 100이면 9% 안팎입니다. 가상 노드를 4배로 늘려야 편차가 절반이 되는 셈이라, 어느 정도 넘어가면 더 늘려도 얻는 것이 적습니다.
      </p>
      <p>가상 노드에는 고른 부하 말고도 좋은 점이 둘 더 있습니다.</p>
      <ul>
        <li>
          <strong>옮겨지는 키가 여러 서버에서 조금씩 온다.</strong> 점이 하나면 새 서버는 이웃 한 대의 키만 받아 오지만, 점이 여러 개면 여러 서버에서 조금씩 받아 옵니다. 서버가 빠질 때도 그 서버의 키가 한 이웃에게 몰리지 않고 여러 서버로 흩어집니다.
        </li>
        <li>
          <strong>성능이 다른 서버에 다른 몫을 줄 수 있다.</strong> 메모리가 두 배인 서버에는 가상 노드를 두 배로 주면 됩니다.
        </li>
      </ul>
      <p>
        대가는 메모리와 찾는 시간입니다. 서버 N대에 가상 노드 V개면 링 위에 NV개의 점이 있고, 찾기는 <M>{'O(\\log NV)'}</M>입니다. 서버 100대에 가상 노드 100개라도 점은 1만 개, 이진 탐색은 14번 남짓이라 실제로는 거의 부담이 되지 않습니다.
      </p>

      <h2>복제: 다음 서버들에 한 부씩 더</h2>
      <p>
        캐시는 서버가 죽어도 데이터베이스에서 다시 읽으면 되지만, 데이터베이스 샤드는 서버가 죽으면 데이터가 사라집니다. 그래서 키를 여러 서버에 복제해 둡니다. 해시 링에서는 복제본을 둘 곳도 간단히 정해집니다. 키에서 시계 방향으로 걸어가며 만나는 <strong>서로 다른 서버 R대</strong>에 하나씩 두는 것입니다.
      </p>
      <p>
        "서로 다른"이 중요합니다. 가상 노드를 쓰면 시계 방향 다음 점이 같은 서버의 다른 가상 노드일 수 있는데, 같은 서버에 복제본 두 개를 두면 그 서버가 죽을 때 둘 다 사라집니다. 그래서 이미 고른 서버의 점은 건너뜁니다.
      </p>
      <ReplicaFigure />
      <p>
        R = 3에서는 어떤 서버 두 대를 꺼도 잃는 키가 없습니다. 키마다 서로 다른 세 서버에 복제본이 있기 때문입니다. R을 1로 낮추고 서버 하나를 꺼 보면, 그 서버가 맡던 키는 모두 빨간 빈 점이 됩니다. 꺼진 서버의 몫은 시계 방향 다음 서버가 넘겨받고, 시스템은 복제본 수를 R로 되돌리려고 남은 복제본에서 새 서버로 데이터를 복사합니다.
      </p>
      <p>
        R = 3에서 서버 B를 끄고 "서버당 점"을 바꿔 보세요. 점이 1개일 때는 새 복제본 81개를 A와 E 두 대가 받아야 하지만, 4개일 때는 60개를 다섯 대가 나눠 받습니다. 가상 노드가 복구 작업도 여러 서버에 나눠 준다는 뜻이고, 고장 난 서버의 짐이 이웃 한 대에 몰려 그 서버마저 넘어지는 일을 막아 줍니다.
      </p>
      <Code label="복제본을 둘 서로 다른 서버 r대">{`
// HashRing에 더하는 메서드
getReplicas(key, r) {
  const out = [];
  const start = this.search(hash32(key));
  for (let step = 0; step < this.points.length && out.length < r; step++) {
    const { server } = this.points[(start + step) % this.points.length];
    if (!out.includes(server)) out.push(server); // 같은 서버의 다른 가상 노드는 건너뛴다
  }
  return out;
}`}</Code>

      <h2>실제 시스템에서는</h2>
      <p>
        아마존의 Dynamo 논문(2007)은 이 장의 구성을 거의 그대로 씁니다. 키를 해시 링에 올리고, 노드마다 가상 노드를 여러 개 두며, 키를 링에서 다음 N개의 노드에 복제합니다(논문은 복제본 수를 N이라고 부릅니다). 복제본 목록을 만들 때 같은 물리 노드의 가상 노드는 건너뛴다는 점도 그림 3과 같습니다. Dynamo의 영향을 받은 Apache Cassandra도 토큰 링에 가상 노드를 올리는 방식으로 데이터를 나누며, 서버당 가상 노드 수는 설정으로 정하고 기본값은 버전에 따라 다릅니다.
      </p>
      <p>
        캐시 쪽에서는 memcached 클라이언트가 대표적입니다. memcached 서버들은 서로를 모르고, 어느 서버에 키를 둘지는 클라이언트가 정합니다. ketama 같은 클라이언트 라이브러리는 서버 하나를 링 위 여러 점에 올리는 일관된 해싱으로, 서버 목록이 바뀌어도 캐시 대부분이 살아남게 합니다.
      </p>
      <Callout kind="note" label="다른 방법들">
        <p>
          모든 시스템이 링을 쓰는 것은 아닙니다. Redis Cluster는 키를 CRC16 해시로 16384개의 <T en="hash slot">해시 슬롯</T> 중 하나에 넣고, 슬롯 단위로 노드에 배정합니다. 슬롯 수가 고정되어 있으니 나머지 해싱의 문제가 없고, 노드를 늘릴 때는 슬롯 일부만 새 노드로 옮깁니다.
        </p>
        <p>
          <T en="rendezvous hashing, HRW">랑데부 해싱</T>은 키마다 모든 서버와 짝지어 <code>hash(key, server)</code>를 계산하고 가장 큰 값의 서버를 고릅니다. 링도 가상 노드도 없이 이동량이 최소이고 부하가 고르지만, 찾을 때마다 서버 수만큼 해시를 계산해야 합니다. 구글의 <T en="jump consistent hash">점프 일관된 해시</T>(2014)는 메모리를 전혀 쓰지 않고 <M>{'O(\\log N)'}</M>에 0~N−1 중 하나를 고르며 부하도 매우 고르지만, 서버를 번호 끝에서만 늘리거나 줄일 수 있어 아무 서버나 빼야 하는 경우에는 따로 장치가 필요합니다.
        </p>
      </Callout>

      <Callout kind="key">
        <code>hash % N</code>은 N이 바뀌면 키의 <M>{'N/(N+1)'}</M>을 옮깁니다. 일관된 해싱은 서버와 키를 같은 링에 올리고 키를 시계 방향 다음 서버에 맡겨, 꼭 옮겨야 하는 약 <M>{'1/N'}</M>만 옮깁니다. 찾기는 정렬된 위치에서의 이진 탐색입니다. 서버를 한 점에만 두면 부하가 들쭉날쭉하므로 가상 노드를 여러 개 두고, 복제본은 시계 방향으로 서로 다른 서버 R대에 둡니다.
      </Callout>
      <Quiz
        q="캐시 서버 4대를 5대로 늘린다. 키가 고르게 퍼져 있을 때, hash % N 방식과 (가상 노드가 충분한) 일관된 해싱에서 다른 서버로 옮겨지는 키의 비율은 대략 얼마인가?"
        options={['둘 다 약 20%', '나머지 해싱 약 80%, 일관된 해싱 약 20%', '나머지 해싱 약 20%, 일관된 해싱 약 80%', '나머지 해싱 약 100%, 일관된 해싱 0%']}
        answer={1}
        explain={<>나머지 해싱에서 키가 제자리에 남으려면 <M>{'h \\bmod 4 = h \\bmod 5'}</M>여야 하고, 그 확률은 1/5입니다. 그래서 4/5, 약 80%가 옮겨집니다. 일관된 해싱에서는 새 서버가 링의 약 1/5을 맡게 되고 그 구간의 키만 옮겨지므로 약 20%입니다. 5대가 공평하게 나누려면 새 서버가 전체의 1/5을 가져와야 하니, 이것이 옮길 수 있는 최소량이기도 합니다. 0%라면 새 서버가 아무 일도 하지 않는다는 뜻입니다.</>}
      />
    </>
  );
}
