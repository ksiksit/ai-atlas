import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Callout, Figure, Legend, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D, useElementSize } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { CLICKS, EXAMPLE_FITTS, conditions, fittsFit, fittsId, linearIds, pieId, throughput, type Condition, type FittsTrial } from './fitts';
import { mean } from './measure';
import './hci.css';
import './fitts.css';

const PRIVACY = '누른 기록은 이 페이지 안에서만 쓰고, 저장하거나 어디로 보내지 않습니다.';
const ms = (v: number) => `${Math.round(v)}ms`;
const EX_FIT = fittsFit(EXAMPLE_FITTS)!;
const predict = (id: number) => EX_FIT.a + EX_FIT.b * id;

/* ─────────────── Figure 1: the tapping task ─────────────── */

const AREA_H = 200;

function FittsTask({ onTrials, count }: { onTrials: (t: FittsTrial[]) => void; count: number }) {
  const area = useRef<HTMLDivElement>(null);
  const { w: areaW } = useElementSize(area, { height: AREA_H, minHeight: AREA_H });
  // the task state lives in a ref so that clicks arriving faster than React renders are never lost
  const st = useRef<{ conds: Condition[] | null; ci: number; side: number; done: number; last: number | null; pendingMiss: number; kb: boolean }>({ conds: null, ci: 0, side: 0, done: 0, last: null, pendingMiss: 0, kb: false });
  const [, render] = useState(0);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const S = st.current;

  const running = S.conds !== null && S.ci < S.conds.length;
  const finished = S.conds !== null && S.ci >= S.conds.length;
  const c = running ? S.conds![S.ci] : null;
  const cx = areaW / 2;
  const centre = (s: number) => (c ? cx + (s === 0 ? -c.d / 2 : c.d / 2) : cx);

  const start = () => {
    st.current = { conds: conditions(areaW), ci: 0, side: 0, done: 0, last: null, pendingMiss: 0, kb: false };
    setMisses(0);
    onTrials([]);
    render((x) => x + 1);
    area.current?.focus();
  };

  const hit = (timed: boolean) => {
    const s = st.current;
    if (!s.conds || s.ci >= s.conds.length) return;
    const cond = s.conds[s.ci];
    const now = performance.now();
    setFlash('hit');
    s.side = 1 - s.side;
    if (s.last === null) {
      // the first click of a condition only starts the clock
      s.last = now;
    } else {
      const mt = now - s.last;
      s.last = now;
      if (timed) onTrials([{ d: cond.d, w: cond.w, mt, miss: s.pendingMiss }]);
      s.pendingMiss = 0;
      s.done++;
      if (s.done >= CLICKS) {
        s.done = 0;
        s.last = null;
        s.ci++;
      }
    }
    render((x) => x + 1);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (!s.conds || s.ci >= s.conds.length || !area.current) return;
    e.preventDefault();
    const cond = s.conds[s.ci];
    const r = area.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const t = r.width / 2 + (s.side === 0 ? -cond.d / 2 : cond.d / 2);
    if (Math.abs(x - t) <= cond.w / 2) hit(true);
    else if (s.last !== null) {
      s.pendingMiss++;
      setMisses((m) => m + 1);
      setFlash('miss');
    }
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (!running || (e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    e.preventDefault();
    st.current.kb = true;
    hit(false);
  };
  const conds = S.conds;
  const ci = S.ci;
  const side = S.side;
  const done = S.done;

  const id = c ? fittsId(c.d, c.w) : 0;
  const status = !conds
    ? '시작을 누르면 막대 두 개가 나타납니다. 색이 칠해진 막대를 누르고, 반대쪽 막대가 칠해지면 그쪽을 누르기를 되풀이하세요. 정확하게, 그러면서도 되도록 빨리.'
    : finished
      ? `여섯 조건을 모두 마쳤습니다. 그림 2에 여러분의 기록이 나타납니다.${S.kb ? ' 키보드로 넘긴 회는 시간을 재지 않았습니다.' : ''}`
      : `조건 ${ci + 1}/${conds.length}: 거리 D = ${c!.d}px, 너비 W = ${c!.w}px, 난이도 ${id.toFixed(2)}비트. ${S.last === null ? '첫 번째 누름은 시계를 켜기만 합니다.' : `${done}/${CLICKS}번 쟀습니다.`}`;

  return (
    <Figure
      no={1}
      title="왼쪽, 오른쪽, 왼쪽…"
      hint="칠해진 막대를 번갈아 누르세요"
      caption={
        <>
          거리와 너비가 다른 여섯 조건을 차례로 합니다. 조건마다 첫 누름은 시계를 켜기만 하고, 그다음 {CLICKS}번 누를 때마다 직전 누름에서 걸린 시간을 기록합니다. 막대 밖을 누르면 빗나감으로 셉니다. 거리는 이 상자의 너비에 맞춰 정하므로 화면이 좁으면 거리도 짧아집니다. 키보드의 스페이스 바나 Enter로도 넘어갈 수 있지만, 손을 뻗는 움직임이 없으므로 그 회는 시간을 재지 않습니다. {PRIVACY}
        </>
      }
    >
      <div className="controls row">
        <div className="btn-row">
          <Button small primary onClick={start}>
            {conds ? '처음부터 다시' : '시작'}
          </Button>
        </div>
      </div>
      <div
        ref={area}
        className="ft-area"
        style={{ height: AREA_H }}
        tabIndex={0}
        role="application"
        aria-label={running ? `피츠 과제. ${side === 0 ? '왼쪽' : '오른쪽'} 막대를 누를 차례입니다. 스페이스 바로 넘길 수 있지만 시간은 재지 않습니다.` : '피츠 과제 영역. 시작 버튼을 누르세요.'}
        onPointerDown={onDown}
        onKeyDown={onKey}
        data-flash={flash ?? undefined}
        onAnimationEnd={() => setFlash(null)}
      >
        {c &&
          [0, 1].map((s) => (
            <div key={s} className="ft-bar" data-on={s === side || undefined} style={{ left: centre(s) - c.w / 2, width: c.w }} />
          ))}
        {c && (
          <div className="ft-dist" style={{ left: centre(0), width: c.d }} aria-hidden="true">
            <span>D = {c.d}</span>
          </div>
        )}
        {!running && <div className="ft-idle">{finished ? '끝' : '시작을 누르세요'}</div>}
      </div>
      <div className="hc-note" aria-live="polite">
        {status}
      </div>
      <div className="readouts">
        <Readout label="잰 횟수" value={`${count}번`} />
        <Readout label="빗나감" value={`${misses}번`} color={misses ? 'var(--bad)' : undefined} />
        <Readout label="지금 난이도 ID" value={c ? `${id.toFixed(2)}비트` : '–'} color="var(--accent)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: MT against ID ─────────────── */

function FittsPlot({ mine }: { mine: FittsTrial[] }) {
  const P = usePalette();
  const conds = new Set(mine.map((t) => `${t.d}/${t.w}`)).size;
  const [src, setSrc] = useState<'example' | 'mine'>('example');
  const useMine = src === 'mine' && conds >= 2;
  const data = useMine ? mine : EXAMPLE_FITTS;
  const fit = fittsFit(data);
  const tp = throughput(data);
  const missRate = data.reduce((a, t) => a + t.miss, 0) / Math.max(1, data.length + data.reduce((a, t) => a + t.miss, 0));
  const ids = data.map((t) => fittsId(t.d, t.w));
  const xMax = Math.max(6.5, ...ids) + 0.3;
  const yMax = Math.max(1400, ...data.map((t) => t.mt)) * 1.05;
  // per-condition means
  const groups = new Map<string, FittsTrial[]>();
  for (const t of data) groups.set(`${t.d}/${t.w}`, [...(groups.get(`${t.d}/${t.w}`) ?? []), t]);
  const means = [...groups.values()].map((g) => ({ id: fittsId(g[0].d, g[0].w), mt: mean(g.map((t) => t.mt)), d: g[0].d, w: g[0].w }));

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax, yMin: 0, yMax, pad: { l: 52, r: 16, t: 16, b: 40 } });
      pl.grid({ xStep: 1, yStep: yMax > 2000 ? 500 : 200, fmt: (v) => String(Math.round(v)) });
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('난이도 ID = log₂(D/W + 1) (비트)', pl.pad.l + pl.pw / 2, h - 4);
      ctx.save();
      ctx.translate(12, pl.pad.t + pl.ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('움직인 시간 MT (ms)', 0, 0);
      ctx.restore();
      pl.clip();
      if (fit) pl.fn((x) => fit.a + fit.b * x, alpha(P.accent, 0.85), 2, { dash: [6, 4] });
      for (const t of data) pl.dot(fittsId(t.d, t.w), t.mt, 2.5, alpha(P.ink3, 0.5));
      for (const m of means) pl.dot(m.id, m.mt, 6, P.accent, P.surface, 2);
      pl.unclip();
      if (!useMine) pl.text('예시 데이터', xMax - 0.1, yMax * 0.06, P.ink3, { align: 'right', font: `600 12px ${P.fontBody}` });
    },
    [P, data, useMine, xMax, yMax],
    { height: 300 },
  );

  return (
    <Figure
      no={2}
      title="어려움을 비트로 재면 시간은 직선"
      hint={conds >= 2 ? '내 기록과 예시 데이터를 바꿔 보세요' : '그림 1을 해 보면 내 기록을 볼 수 있습니다'}
      caption={
        <>
          작은 점은 한 번 한 번의 기록, 큰 점은 조건마다의 평균, 점선은 모든 기록에 맞춘 직선입니다. 처리량은 기록마다 ID를 걸린 시간(초)으로 나눈 값의 평균으로, 손이 1초에 처리하는 "어려움"의 양입니다. 예시 데이터는 이 장을 위해 만든 한 사람의 그럴듯한 마우스 기록이며, 실제 측정값이 아닙니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="데이터"
          value={useMine ? 'mine' : 'example'}
          onChange={setSrc}
          options={[
            { value: 'example', label: '예시 데이터' },
            { value: 'mine', label: `내 기록 (${mine.length}번)` },
          ]}
        />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${useMine ? '내 기록' : '예시 데이터'}의 난이도별 움직인 시간. ${means.map((m) => `ID ${m.id.toFixed(1)}비트에서 ${ms(m.mt)}`).join(', ')}.${fit ? ` 맞춘 직선은 MT = ${Math.round(fit.a)} + ${Math.round(fit.b)} × ID ms입니다.` : ''}`}>
        <canvas ref={canvasRef} />
      </div>
      {src === 'mine' && conds < 2 && <div className="hc-note">내 기록이 두 조건 이상 모이면 직선을 맞출 수 있습니다. 지금은 예시 데이터를 보여 줍니다.</div>}
      <div className="readouts">
        <Readout label="a (기본 시간)" value={fit ? ms(fit.a) : '–'} />
        <Readout label="b (비트당 시간)" value={fit ? `${Math.round(fit.b)}ms/비트` : '–'} color="var(--accent)" />
        <Readout label="r²" value={fit ? fit.r2.toFixed(2) : '–'} />
        <Readout label="처리량" value={data.length ? `${tp.toFixed(1)}비트/초` : '–'} color="var(--good)" />
        <Readout label="빗나감 비율" value={`${Math.round(missRate * 100)}%`} />
      </div>
      <Legend
        items={[
          { color: 'var(--accent)', label: '조건별 평균', shape: 'dot' },
          { color: 'var(--ink-3)', label: '한 번의 기록', shape: 'dot' },
          { color: 'var(--accent)', label: '맞춘 직선 a + b·ID', shape: 'ln' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: the edge of the screen ─────────────── */

function EdgeFigure() {
  const P = usePalette();
  const [d, setD] = useState(400);
  const [h, setH] = useState(24);
  const idWin = fittsId(d, h);
  // at the screen edge the pointer stops by itself: it may overshoot as far as it came, so W ≈ D
  const idEdge = fittsId(d, d);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: ch }) => {
      const colW = (w - 24) / 2;
      const top = 30;
      const avail = ch - top - 40;
      const s = avail / (d + d * 0.25 + h);
      const draw = (x0: number, edge: boolean) => {
        const title = edge ? '화면 맨 위의 메뉴' : '창 안의 메뉴';
        ctx.fillStyle = P.ink2;
        ctx.font = `600 12px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, x0 + colW / 2, 12);
        const mx = x0 + colW * 0.15;
        const mw = colW * 0.7;
        const above = d * 0.25 * s;
        const menuY = top + above;
        const menuH = Math.max(3, h * s);
        if (edge) {
          // the screen edge: a wall
          ctx.fillStyle = P.ink;
          ctx.fillRect(x0, menuY - 4, colW, 4);
          ctx.fillStyle = alpha(P.good, 0.16);
          ctx.fillRect(mx, menuY, mw, Math.max(menuH, d * s));
          ctx.strokeStyle = alpha(P.good, 0.7);
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(mx + 0.5, menuY + 0.5, mw - 1, Math.max(menuH, d * s) - 1);
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = P.line;
          ctx.strokeRect(x0 + 0.5, top + 0.5, colW - 1, avail + 20);
        }
        ctx.fillStyle = alpha(P.accent, 0.85);
        ctx.fillRect(mx, menuY, mw, menuH);
        ctx.fillStyle = P.surface;
        ctx.font = `600 10px ${P.fontBody}`;
        if (menuH > 12) ctx.fillText('메뉴', mx + mw / 2, menuY + menuH / 2);
        // pointer start and movement
        const px = mx + mw / 2;
        const py = menuY + menuH / 2 + d * s;
        ctx.strokeStyle = P.ink2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, menuY + menuH / 2 + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 5, menuY + menuH / 2 + 12);
        ctx.lineTo(px, menuY + menuH / 2 + 4);
        ctx.lineTo(px + 5, menuY + menuH / 2 + 12);
        ctx.stroke();
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.fillText(`D = ${d}`, px + 8, (py + menuY) / 2);
        if (edge) {
          ctx.fillStyle = P.good;
          ctx.font = `600 10px ${P.fontBody}`;
          ctx.fillText('넘어가도 멈추는 곳', mx + 4, menuY + Math.max(menuH, d * s) - 10);
        }
        const id = edge ? idEdge : idWin;
        ctx.fillStyle = P.ink;
        ctx.font = `600 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.fillText(`ID ${id.toFixed(2)}비트 · 약 ${Math.round(predict(id))}ms`, x0 + colW / 2, ch - 12);
      };
      draw(0, false);
      draw(colW + 24, true);
    },
    [P, d, h, idWin, idEdge],
    { height: 320 },
  );

  return (
    <Figure
      no={3}
      title="화면 가장자리는 아주 넓은 버튼"
      hint="거리와 메뉴 높이를 바꿔 보세요"
      caption={
        <>
          왼쪽은 창 안에 있는 높이 h의 메뉴, 오른쪽은 화면 맨 위 가장자리에 붙은 메뉴입니다. 포인터는 화면 밖으로 나가지 못하므로, 위쪽으로 힘껏 밀어도 가장자리에서 멈춥니다. 여기서는 그만큼을 "온 거리만큼 더 넘어가도 되는" 너비 W ≈ D로 계산했습니다. 시간은 그림 2의 예시 데이터에 맞춘 직선으로 예측한 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="ft-edge-d" label="거리 D (px)" value={d} min={100} max={800} step={10} onChange={setD} />
        <Slider id="ft-edge-h" label="메뉴 높이 h (px)" value={h} min={12} max={64} step={2} onChange={setH} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`거리 ${d}px에서 높이 ${h}px인 창 안의 메뉴는 난이도 ${idWin.toFixed(2)}비트로 약 ${Math.round(predict(idWin))}ms, 화면 맨 위 메뉴는 ${idEdge.toFixed(2)}비트로 약 ${Math.round(predict(idEdge))}ms가 걸린다고 예측됩니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="창 안의 메뉴" value={`${idWin.toFixed(2)}비트 · ${ms(predict(idWin))}`} />
        <Readout label="화면 맨 위 메뉴" value={`${idEdge.toFixed(2)}비트 · ${ms(predict(idEdge))}`} color="var(--good)" />
        <Readout label="줄어든 시간" value={ms(predict(idWin) - predict(idEdge))} color="var(--accent)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: linear vs pie menus ─────────────── */

function MenuFigure() {
  const P = usePalette();
  const [n, setN] = useState(8);
  const lin = linearIds(n);
  const pie = pieId(n);
  const maxId = Math.max(...lin, pie);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const colW = (w - 24) / 2;
      const heat = (id: number) => alpha(P.pos, 0.12 + 0.7 * (id / Math.max(3.7, maxId)));
      ctx.textBaseline = 'middle';
      // linear menu
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText('아래로 펼치는 메뉴', colW / 2, 12);
      const ih = Math.min(24, (h - 50) / n);
      const lx = colW * 0.12;
      const lw = colW * 0.76;
      const ly = 34;
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(lx + 14, ly - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      lin.forEach((id, k) => {
        const y = ly + k * ih;
        ctx.fillStyle = heat(id);
        ctx.fillRect(lx, y, lw, ih - 1);
        ctx.fillStyle = P.ink;
        ctx.font = `500 ${Math.min(11, ih - 4)}px ${P.fontBody}`;
        ctx.textAlign = 'left';
        ctx.fillText(`항목 ${k + 1}`, lx + 8, y + ih / 2);
        ctx.textAlign = 'right';
        ctx.font = `${Math.min(11, ih - 4)}px ${P.fontMono}`;
        ctx.fillText(id.toFixed(2), lx + lw - 6, y + ih / 2);
      });
      // pie menu
      const ox = colW + 24;
      ctx.fillStyle = P.ink2;
      ctx.font = `600 12px ${P.fontBody}`;
      ctx.textAlign = 'center';
      ctx.fillText('파이 메뉴', ox + colW / 2, 12);
      const cx = ox + colW / 2;
      const cy = 34 + (h - 50) / 2;
      const R = Math.min(colW / 2 - 8, (h - 50) / 2);
      const r0 = R * 0.22;
      for (let k = 0; k < n; k++) {
        const a0 = -Math.PI / 2 - Math.PI / n + (k * 2 * Math.PI) / n;
        const a1 = a0 + (2 * Math.PI) / n;
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.arc(cx, cy, r0, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = heat(pie);
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
        const am = (a0 + a1) / 2;
        ctx.fillStyle = P.ink;
        ctx.font = `500 10px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(k + 1), cx + Math.cos(am) * (R * 0.62), cy + Math.sin(am) * (R * 0.62));
      }
      ctx.fillStyle = P.ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.ink2;
      ctx.font = `600 11px ${P.fontMono}`;
      ctx.fillText(`항목마다 ${pie.toFixed(2)}비트`, cx, h - 10);
    },
    [P, n, maxId],
    { height: 320 },
  );

  return (
    <Figure
      no={4}
      title="같은 여덟 항목, 다른 배치"
      hint="항목 수를 바꿔 보세요"
      caption={
        <>
          검은 점은 메뉴를 연 순간의 포인터 위치이고, 숫자와 색의 진하기는 그 항목의 난이도(비트)입니다. 펼치는 메뉴는 항목 높이를 1로 두고 k번째 항목까지의 거리를 k − 0.5로, 파이 메뉴는 조각까지의 거리 r과 조각의 호 길이 2πr/n으로 계산했습니다. 파이 조각은 바깥쪽으로 끝이 없어 실제로는 더 쉬우므로, 파이 메뉴 쪽은 보수적으로 잡은 값입니다.
        </>
      }
    >
      <div className="controls row">
        <Slider id="ft-menu-n" label="항목 수" value={n} min={4} max={12} step={1} onChange={setN} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`항목 ${n}개. 펼치는 메뉴는 항목 난이도가 ${lin[0].toFixed(2)}비트부터 ${lin[n - 1].toFixed(2)}비트까지, 평균 ${mean(lin).toFixed(2)}비트입니다. 파이 메뉴는 모든 항목이 ${pie.toFixed(2)}비트입니다.`}>
        <canvas ref={canvasRef} />
      </div>
      <div className="readouts">
        <Readout label="펼치는 메뉴 평균" value={`${mean(lin).toFixed(2)}비트 · ${ms(predict(mean(lin)))}`} />
        <Readout label="펼치는 메뉴 마지막 항목" value={`${lin[n - 1].toFixed(2)}비트 · ${ms(predict(lin[n - 1]))}`} color="var(--bad)" />
        <Readout label="파이 메뉴" value={`${pie.toFixed(2)}비트 · ${ms(predict(pie))}`} color="var(--good)" />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Fitts() {
  const [trials, setTrials] = useState<FittsTrial[]>([]);
  const exA = Math.round(EX_FIT.a);
  const exB = Math.round(EX_FIT.b);
  const exTp = throughput(EXAMPLE_FITTS);
  return (
    <>
      <h2>멀고 작을수록 오래 걸립니다</h2>
      <p>
        <a href={lessonHref('cs-hci', 'reaction-time')}>앞 장</a>에서는 무엇을 누를지 고르는 시간을 쟀습니다. 이번에는 고른 다음 손을 움직여 누르는 시간입니다. 버튼이 멀수록, 작을수록 오래 걸린다는 것은 누구나 압니다. 1954년 심리학자 피츠(Paul Fitts)는 그 "얼마나"를 식 하나로 나타냈습니다. 먼저 직접 해 봅시다.
      </p>
      <FittsTask count={trials.length} onTrials={(t) => setTrials((prev) => (t.length === 0 ? [] : [...prev, ...t]))} />
      <p>
        조건마다 시간이 꽤 다르게 나왔을 것입니다. 가까운 넓은 막대는 거의 생각 없이 오갈 수 있지만, 먼 좁은 막대는 손이 끝에서 속도를 줄이고 조금씩 맞춰 가야 합니다. 피츠는 움직임의 어려움을 거리 D와 너비 W의 비율로 재는 <T en="index of difficulty">난이도 지수</T>를 정의했습니다. 지금 널리 쓰는 형태는 1992년 매켄지(Scott MacKenzie)가 다듬은 것입니다.
      </p>
      <MB note="D는 목표 중심까지의 거리, W는 움직이는 방향으로 잰 목표의 너비. 단위가 같으면 비율만 남으므로 픽셀이든 센티미터든 상관없습니다.">{`\\text{ID} = \\log_2\\!\\left(\\frac{D}{W} + 1\\right) \\qquad \\text{MT} = a + b \\cdot \\text{ID}`}</MB>
      <p>
        거리를 두 배로 늘리거나 너비를 반으로 줄이면 어려움이 약 1비트 늘고, 움직이는 시간 MT는 그 비트 수에 비례해 늘어납니다. 이것이 <T en="Fitts’s law">피츠의 법칙</T>입니다. 그림 1의 기록을 이 축에 놓아 보면 정말 직선에 가까운지 확인할 수 있습니다.
      </p>
      <FittsPlot mine={trials} />
      <p>
        예시 데이터에 직선을 맞추면 a = {exA}ms, b = {exB}ms/비트이고, 직선이 기록의 흩어짐을 r² = {EX_FIT.r2.toFixed(2)}만큼 설명합니다. 처리량은 {exTp.toFixed(1)}비트/초입니다. 직선을 맞추는 방법은 <a href={lessonHref('ai-basics', 'linear-regression')}>선형회귀</a> 장의 최소제곱법과 같습니다. 여러분의 기록에서도 r²가 0.8을 넘는 경우가 많습니다. 사람의 움직임이라는 들쭉날쭉한 대상을 숫자 두 개로 이 정도 설명하는 법칙은 드뭅니다.
      </p>
      <Callout kind="note">
        a와 b는 사람마다, 그리고 무엇으로 누르는지에 따라 다릅니다. 마우스, 터치패드, 손가락, 게임 패드는 같은 ID에서도 걸리는 시간이 꽤 다르므로, 입력 장치를 비교할 때 처리량을 씁니다. 빗나감도 함께 봐야 합니다. 서두르면 시간은 줄지만 빗나감이 늘어, 실제로는 더 작은 목표를 누른 것과 같아지기 때문입니다. 연구에서는 빗나간 정도로 너비를 보정한 "유효 너비"를 쓰기도 합니다.
      </Callout>

      <h2>가장자리와 손가락</h2>
      <p>
        피츠의 법칙에서 가장 쓸모 있는 결론은 W를 키우는 방법이 꼭 버튼을 크게 그리는 것만은 아니라는 점입니다. 화면 가장자리에 붙은 메뉴는 포인터가 화면 밖으로 나가지 못하므로, 위쪽으로 아무리 세게 밀어도 메뉴 위에서 멈춥니다. 정확히 맞춰 멈출 필요가 없으니, 움직이는 방향으로는 사실상 끝없이 넓은 목표입니다.
      </p>
      <EdgeFigure />
      <p>
        기본 설정(거리 400, 높이 24)에서 창 안의 메뉴는 {fittsId(400, 24).toFixed(2)}비트로 약 {Math.round(predict(fittsId(400, 24)))}ms, 가장자리 메뉴는 1비트로 약 {Math.round(predict(1))}ms가 걸린다고 예측됩니다. macOS가 메뉴 막대를 각 창이 아니라 화면 맨 위에 두는 것, 윈도우의 시작 버튼과 화면 모서리의 동작이 모서리에 있는 것이 이 이유로 설명됩니다. 모서리는 위와 옆 두 방향으로 모두 멈추므로 화면에서 가장 누르기 쉬운 곳입니다.
      </p>
      <p>
        손가락은 마우스 포인터보다 훨씬 굵고, 누르는 순간 자기 손가락이 목표를 가립니다. 그래서 휴대폰 플랫폼들은 누를 수 있는 것의 최소 크기를 권고합니다. 애플의 가이드라인은 44×44pt, 안드로이드의 머티리얼 디자인은 48×48dp를 권합니다(각 플랫폼의 권고값이며, 물리적 크기로는 대략 7~9mm입니다). 같은 거리 200에서 너비 24인 버튼은 {fittsId(200, 24).toFixed(2)}비트, 44인 버튼은 {fittsId(200, 44).toFixed(2)}비트로, 예시 데이터의 직선으로는 약 {Math.round(predict(fittsId(200, 24)) - predict(fittsId(200, 44)))}ms 차이입니다. 무엇보다 작은 버튼은 빗나감이 늘어 엉뚱한 것을 누르게 합니다.
      </p>

      <h2>메뉴의 모양</h2>
      <p>
        자주 쓰는 명령을 모은 메뉴도 피츠의 법칙으로 비교할 수 있습니다. 아래로 펼치는 메뉴는 아래쪽 항목일수록 멀어집니다. 메뉴를 연 자리를 가운데 두고 항목을 둥글게 늘어놓은 <T en="pie menu">파이 메뉴</T>는 모든 항목이 같은 거리에 있고, 조각이 바깥쪽으로 넓어집니다.
      </p>
      <MenuFigure />
      <p>
        항목이 여덟 개일 때 펼치는 메뉴는 평균 {mean(linearIds(8)).toFixed(2)}비트이고 마지막 항목은 {linearIds(8)[7].toFixed(2)}비트인데, 파이 메뉴는 모든 항목이 {pieId(8).toFixed(2)}비트입니다. 예시 데이터의 직선으로는 평균 약 {Math.round(predict(mean(linearIds(8))))}ms 대 {Math.round(predict(pieId(8)))}ms입니다. 1988년 캘러핸(Jack Callahan) 등의 실험에서도 파이 메뉴가 더 빠르고 실수가 적었습니다. 게임의 무기 고르기 바퀴나 일부 그림 프로그램의 둥근 도구 메뉴가 이 모양인 이유입니다. 다만 항목이 많아지면 조각이 좁아지고 이름을 쓸 자리도 줄어서, 메뉴 대부분은 여전히 아래로 펼칩니다. 그 대신 가장 자주 쓰는 항목을 맨 위에 두는 것만으로도 평균 시간이 줄어듭니다.
      </p>
      <Callout kind="intuition">
        피츠의 법칙으로 인터페이스를 보는 요령은 두 가지를 묻는 것입니다. 사용자가 다음에 누를 것이 지금 포인터나 손가락에서 얼마나 먼가? 움직이는 방향으로 얼마나 넓은가? 확인 버튼을 입력 칸 바로 옆에 두고, 자주 누르는 것은 크게, 위험한 것(삭제)은 일부러 작고 멀게 둡니다. 휴대폰에서 자주 쓰는 버튼이 엄지가 닿는 화면 아래쪽으로 옮겨 가는 것도 같은 계산입니다.
      </Callout>

      <Callout kind="key">
        손을 뻗어 누르는 데 걸리는 시간은 난이도 지수 ID = log₂(D/W + 1)에 비례합니다(MT = a + b·ID). 거리를 두 배로 하거나 너비를 반으로 하면 약 1비트, b만큼 느려집니다. 화면 가장자리와 모서리는 포인터가 멈추므로 사실상 무한히 넓은 목표이고, 터치 화면에서는 손가락 크기에 맞춘 최소 크기가 필요하며, 파이 메뉴처럼 모든 항목을 가깝고 넓게 두면 고르기가 빨라집니다.
      </Callout>
      <Quiz
        q="거리 300px, 너비 20px인 버튼이 있다. 피츠의 법칙으로 볼 때 이 버튼을 누르기가 가장 쉬워지는 변화는?"
        options={['거리를 150px로 줄인다', '너비를 40px로 늘린다', '버튼을 화면 맨 아래 가장자리에 붙여 아래쪽으로 끝없이 멈추게 한다', '버튼 색을 더 눈에 띄게 바꾼다']}
        answer={2}
        explain={<>지금은 log₂(300/20 + 1) = 4비트입니다. 거리를 반으로 줄이거나 너비를 두 배로 늘리면 둘 다 log₂(7.5 + 1) ≈ 3.09비트로 약 1비트 줄어듭니다. 가장자리에 붙이면 움직이는 방향으로 넘어가도 멈추므로 W가 사실상 D 이상이 되어 1비트 안팎까지 내려갑니다. 색은 찾는 시간에는 영향을 주지만, 피츠의 법칙이 다루는 손을 뻗는 시간은 바꾸지 않습니다.</>}
      />
    </>
  );
}
