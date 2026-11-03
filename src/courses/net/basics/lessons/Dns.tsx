import { useMemo, useState, type MouseEvent } from 'react';
import { Button, Callout, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { localPoint, useCanvas2D } from '../../../../lib/canvas';
import { Plot, drawArrow } from '../../../../lib/plot';
import { alpha, usePalette, type Palette } from '../../../../lib/theme';
import { StepControls, useStepper } from '../../../cs/shared';
import { DNS_RTT, TREE, TTL_BIN, TTL_CHANGE, TTL_DURATION, TTL_RESOLVERS, ZONES, recordsOf, replayLookups, simulateTtl, zoneOf, zonePath, type DnsNode, type Rec } from './web';
import '../../../cs/systems/lessons/saving.css';
import './web.css';

/* ─────────────── Figure 1: the name tree and its zones ─────────────── */

const zoneIdOf = (name: string) => (name === 'kr' || name.endsWith('.kr') ? 'kr' : zoneOf(name).id);
const ZONE_IDS = ['.', 'com', 'net', 'kr', 'example.com', 'example.net'];
const zoneColor = (P: Palette, z: string) => {
  const m: Record<string, string> = { '.': P.ink3, com: P.math, net: P.stats2, kr: P.stats1, 'example.com': P.pos, 'example.net': P.neg };
  return m[z] ?? P.ink3;
};
const ZONE_CSS: Record<string, string> = { '.': 'var(--ink-3)', com: 'var(--c-math)', net: 'var(--c-stats-2)', kr: 'var(--c-stats-1)', 'example.com': 'var(--pos)', 'example.net': 'var(--neg)' };
const zoneLabel = (z: string) => (z === '.' ? '루트 영역' : `${z} 영역`);

interface Placed {
  name: string;
  label: string;
  parent: string | null;
  depth: number;
  x: number; // in leaf units
}

function layoutTree(): { nodes: Placed[]; leaves: number; depth: number } {
  const kids = (n: string | null) => TREE.filter((t) => t.parent === n);
  const out: Placed[] = [];
  let leaf = 0;
  let maxDepth = 0;
  const walk = (name: string, depth: number): number => {
    const t = TREE.find((x) => x.name === name)!;
    maxDepth = Math.max(maxDepth, depth);
    const cs = kids(name);
    const xs = cs.map((c) => walk(c.name, depth + 1));
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leaf++;
    out.push({ name, label: t.label, parent: t.parent, depth, x });
    return x;
  };
  walk('.', 0);
  return { nodes: out, leaves: leaf, depth: maxDepth };
}

function RecTable({ recs, fresh }: { recs: Rec[]; fresh?: boolean }) {
  if (!recs.length) return <div className="mini-empty">레코드 없음</div>;
  return (
    <div className="mini-tbl-wrap">
      <table className="mini-tbl">
        <thead>
          <tr>
            <th>이름</th>
            <th>유형</th>
            <th>값</th>
            <th>TTL</th>
          </tr>
        </thead>
        <tbody>
          {recs.map((r, i) => (
            <tr key={i} data-new={fresh || undefined}>
              <td>{r.name}</td>
              <td>{r.type}</td>
              <td>{r.value}</td>
              <td className="num">{r.ttl.toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TreeFigure() {
  const P = usePalette();
  const [sel, setSel] = useState('www.example.com');
  const tree = useMemo(layoutTree, []);
  const geo = (w: number, h: number) => {
    const padX = 30;
    const top = 34;
    const step = (h - top - 34) / tree.depth;
    const X = (x: number) => padX + (x / (tree.leaves - 1)) * (w - 2 * padX);
    const Y = (d: number) => top + d * step;
    return { X, Y };
  };

  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const { X, Y } = geo(w, h);
      const at = (n: string) => tree.nodes.find((p) => p.name === n)!;
      // edges: dashed where the child starts a new zone (a delegation)
      for (const n of tree.nodes) {
        if (!n.parent) continue;
        const p = at(n.parent);
        const cut = zoneIdOf(n.name) !== zoneIdOf(p.name);
        ctx.strokeStyle = cut ? P.ink3 : alpha(zoneColor(P, zoneIdOf(n.name)), 0.8);
        ctx.lineWidth = cut ? 1.3 : 2.4;
        ctx.setLineDash(cut ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(X(p.x), Y(p.depth));
        ctx.lineTo(X(n.x), Y(n.depth));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // the path the resolver walks to reach the selected name
      const chain: Placed[] = [];
      for (let n: Placed | undefined = at(sel); n; n = n.parent ? at(n.parent) : undefined) chain.unshift(n);
      for (let i = 1; i < chain.length; i++) {
        ctx.strokeStyle = alpha(P.hl, 0.9);
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X(chain[i - 1].x), Y(chain[i - 1].depth));
        ctx.lineTo(X(chain[i].x), Y(chain[i].depth));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      for (const n of tree.nodes) {
        const z = zoneIdOf(n.name);
        const apex = n.name === z || (z === 'kr' && n.name === 'kr');
        const col = zoneColor(P, z);
        const x = X(n.x);
        const y = Y(n.depth);
        const r = apex ? 9 : 7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = apex ? col : P.surface;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (n.name === sel) {
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = n.name === sel ? P.ink : P.ink2;
        ctx.font = `${n.name === sel ? 700 : 500} 11px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = n.depth === 0 ? 'bottom' : 'top';
        ctx.fillText(n.depth === 0 ? '. (루트)' : n.label, x, n.depth === 0 ? y - 11 : y + r + 5);
      }
    },
    [P, sel, tree],
    { height: 290 },
  );

  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const { x, y } = localPoint(e, e.currentTarget);
    const { X, Y } = geo(size.w, size.h);
    let best: Placed | null = null;
    let bd = 26;
    for (const n of tree.nodes) {
      const d = Math.hypot(X(n.x) - x, Y(n.depth) - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) setSel(best.name);
  };

  const node = TREE.find((t) => t.name === sel)!;
  const z = zoneIdOf(sel);
  const { own, delegation } = recordsOf(sel);
  const known = z !== 'kr';
  const path = known ? zonePath(sel) : [];
  return (
    <Figure
      no={1}
      title="이름의 나무와 영역"
      hint="마디를 눌러 보세요"
      caption={<>이름을 점(.)으로 나눈 조각을 오른쪽부터 읽으면 나무를 뿌리에서 잎 쪽으로 내려가는 길이 됩니다. 색은 그 이름이 속한 <strong>영역(zone)</strong>, 즉 한 관리자가 한 묶음으로 관리하는 범위입니다. 채운 원은 영역의 꼭대기, 점선은 위 영역이 아래 영역에 관리를 넘긴 <strong>위임</strong>입니다. 노란 길은 리졸버가 이 이름을 찾으러 거치는 길입니다. 이름과 주소는 모두 예시용으로 예약된 것이고, 실제 루트와 TLD 영역에는 훨씬 많은 레코드가 있습니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`도메인 이름 나무. 선택한 이름: ${sel}, ${zoneLabel(z)}`} onClick={pick} style={{ cursor: 'pointer' }}>
            <canvas ref={canvasRef} />
          </div>
          <div className="name-chips" role="group" aria-label="이름 고르기">
            {TREE.map((t) => (
              <button key={t.name} type="button" className="op-chip" aria-pressed={t.name === sel} onClick={() => setSel(t.name)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="tree-info">
          <div className="full">{sel === '.' ? '. (루트)' : sel}</div>
          <dl>
            <dt>영역</dt>
            <dd style={{ color: ZONE_CSS[z] }}>{zoneLabel(z)}</dd>
            {known && (
              <>
                <dt>답하는 서버</dt>
                <dd>{ZONES[z].host}</dd>
                <dt>찾아가는 길</dt>
                <dd>{path.map((p) => (p.id === '.' ? '루트' : p.id)).join(' → ')}</dd>
              </>
            )}
          </dl>
          <div>{node.note}</div>
        </div>
      </div>
      {(known || delegation.length > 0) && (
        <div className="fig-cols">
          {known && (
            <div>
              <div className="panel-title">{sel === '.' ? '루트 영역의 레코드 (일부)' : `${sel}의 레코드 (${zoneLabel(z)})`}</div>
              <RecTable recs={own} />
            </div>
          )}
          {delegation.length > 0 && (
            <div>
              <div className="panel-title">위 영역({zonePath(sel).slice(-2)[0].id === '.' ? '루트' : zonePath(sel).slice(-2)[0].id})에 있는 위임</div>
              <RecTable recs={delegation} />
            </div>
          )}
        </div>
      )}
      <Legend items={ZONE_IDS.map((id) => ({ color: ZONE_CSS[id], label: zoneLabel(id) }))} />
    </Figure>
  );
}

/* ─────────────── Figure 2: a recursive resolver walking the tree, then its cache ─────────────── */

const NAMES = ['www.example.com', 'api.example.com', 'shop.example.com', 'nope.example.com'];
const NODE_POS: Record<DnsNode, [number, number]> = { stub: [0.1, 0.5], resolver: [0.4, 0.5], root: [0.84, 0.16], tld: [0.84, 0.5], auth: [0.84, 0.84] };
const WHO: Record<DnsNode, string> = { stub: '내 컴퓨터', resolver: '리졸버', root: '루트', tld: 'TLD', auth: '권한 서버' };

function ResolveFigure() {
  const P = usePalette();
  const [lookups, setLookups] = useState([{ name: NAMES[0], at: 0 }]);
  const [now, setNow] = useState(0);
  const [name, setName] = useState(NAMES[1]);
  const run = useMemo(() => replayLookups(lookups), [lookups]);
  const steps = run.steps;
  const s = useStepper(steps.length, 1.5, lookups.length, false, true);
  const f = steps[s.i];
  const at = lookups[lookups.length - 1].at;

  const ask = () => {
    setLookups([...lookups, { name, at: now }]);
  };
  const wait = (sec: number) => setNow((t) => t + sec);
  const reset = () => {
    setLookups([{ name: NAMES[0], at: 0 }]);
    setNow(0);
    setName(NAMES[1]);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const bw = Math.min(124, w * 0.23);
      const bh = 44;
      const pos = (n: DnsNode): [number, number] => [NODE_POS[n][0] * w, NODE_POS[n][1] * h];
      const title: Record<DnsNode, string> = { stub: '내 컴퓨터', resolver: '재귀 리졸버', root: '루트 서버', tld: `${f.tld} 서버`, auth: '권한 서버' };
      const sub: Record<DnsNode, string> = { stub: '스텁 리졸버', resolver: 'ISP·공용 DNS', root: 'a~m 중 하나', tld: 'TLD', auth: f.auth };
      const used = new Set(steps.slice(0, s.i + 1).flatMap((x) => [x.from, x.to]));

      // earlier messages of this lookup, faint; the current one bold
      const arrow = (k: number, strong: boolean) => {
        const m = steps[k];
        if (m.from === m.to) return;
        const [x1, y1] = pos(m.from);
        const [x2, y2] = pos(m.to);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const L = Math.hypot(dx, dy);
        const ux = dx / L;
        const uy = dy / L;
        // queries run above the line, replies below it
        const off = m.kind === 'query' ? -6 : 6;
        const nx = -uy * off * (ux >= 0 ? 1 : -1);
        const ny = ux * off * (ux >= 0 ? 1 : -1);
        // leave the boxes: distance from a box's centre to its edge along the arrow, plus a gap
        const edge = Math.min(Math.abs(ux) > 1e-6 ? bw / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? bh / 2 / Math.abs(uy) : Infinity);
        const ex = Math.min(edge + 4, L / 2 - 4);
        const col = m.kind === 'query' ? P.ink : m.kind === 'referral' ? P.math : m.kind === 'nx' ? P.bad : P.good;
        drawArrow(ctx, x1 + ux * ex + nx, y1 + uy * ex + ny, x2 - ux * ex + nx, y2 - uy * ex + ny, strong ? col : alpha(col, 0.28), strong ? 2.6 : 1.4, strong ? 9 : 7);
        if (strong) {
          const mx = (x1 + x2) / 2 + nx * 2.2;
          const my = (y1 + y2) / 2 + ny * 2.2;
          ctx.beginPath();
          ctx.arc(mx, my, 10, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          ctx.fillStyle = P.surface;
          ctx.font = `700 11px ${P.fontMono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), mx, my + 0.5);
        }
      };
      for (let k = 0; k < s.i; k++) arrow(k, false);

      (Object.keys(NODE_POS) as DnsNode[]).forEach((n) => {
        const [x, y] = pos(n);
        const active = f.from === n || f.to === n;
        const off = !used.has(n);
        ctx.globalAlpha = off ? 0.45 : 1;
        ctx.fillStyle = active ? P.surface2 : P.surface;
        ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
        ctx.strokeStyle = active ? P.ink : P.lineStrong;
        ctx.lineWidth = active ? 2 : 1.2;
        ctx.strokeRect(x - bw / 2 + 0.5, y - bh / 2 + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = P.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${bw < 90 ? 11 : 12}px ${P.fontBody}`;
        ctx.fillText(title[n], x, y - 8, bw - 6);
        ctx.fillStyle = P.ink3;
        ctx.font = `${bw < 90 ? 9.5 : 10.5}px ${P.fontMono}`;
        ctx.fillText(sub[n], x, y + 9, bw - 6);
        ctx.globalAlpha = 1;
      });
      if (f.from === f.to) {
        // a cache hit inside the resolver
        const [x, y] = pos('resolver');
        ctx.strokeStyle = P.good;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(x - bw / 2 - 5, y - bh / 2 - 5, bw + 10, bh + 10);
        ctx.setLineDash([]);
        ctx.fillStyle = P.good;
        ctx.font = `700 11px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('캐시 확인', x, y + bh / 2 + 9);
      } else arrow(s.i, true);
    },
    [P, f, steps, s.i],
    { aspect: 1.9, maxHeight: 300, minHeight: 230 },
  );

  const prev = new Set(run.before.map((e) => `${e.name}|${e.type}`));
  const cache = f.cache.filter((e) => e.expires > at);
  const fresh = (e: (typeof cache)[number]) => !prev.has(`${e.name}|${e.type}`);
  const asked = steps.slice(0, s.i + 1).filter((x) => x.kind === 'query' && x.from === 'resolver').length;
  const total = steps.filter((x) => x.kind === 'query' && x.from === 'resolver').length;
  const pending = now > at ? `(마지막 조회 뒤 ${now - at}초 지남)` : '';

  return (
    <Figure
      no={2}
      title="재귀 리졸버의 반복 질의"
      hint="이름을 골라 조회하고, 시간을 흘려보내 보세요"
      caption={<>번호는 메시지의 순서, 검은 화살표는 질문, 파란 화살표는 "저 서버에게 물어보라"는 위임 응답, 초록 화살표는 최종 답입니다. 리졸버가 받은 답은 TTL 동안 캐시(오른쪽 표)에 남아, 다음 조회에서 앞 단계를 건너뛰게 합니다. 걸린 시간은 리졸버에서 루트까지 {DNS_RTT.root}ms, TLD까지 {DNS_RTT.tld}ms, 권한 서버까지 {DNS_RTT.auth}ms, 내 컴퓨터에서 리졸버까지 {DNS_RTT.stub}ms 왕복이라고 가정한 값입니다. 실제 리졸버는 서버의 IP 주소를 얻는 일, 여러 서버 중 빠른 곳 고르기, 응답 검증도 함께 합니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${lookups[lookups.length - 1].name} 조회, ${steps.length}단계 중 ${s.i + 1}단계: ${WHO[f.from]}에서 ${WHO[f.to]}로 ${f.label}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="step-note" aria-live="polite">
            {f.note}
          </div>
          <ol className="dns-msgs" aria-label="이번 조회의 메시지">
            {steps.map((m, k) => (
              <li key={k} data-k={m.kind} data-s={k > s.i ? 'future' : undefined} data-cur={k === s.i || undefined}>
                <button type="button" tabIndex={-1} onClick={() => s.go(k)}>
                  <span className="no">{k + 1}</span>
                  <span className="who">{m.from === m.to ? `${WHO[m.from]} 안` : `${WHO[m.from]} → ${WHO[m.to]}`}</span>
                  <span className="what">{m.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="controls">
          <Seg label="찾을 이름" value={name} onChange={setName} options={NAMES.map((n) => ({ value: n, label: n.replace('.example.com', '') }))} />
          <div className="btn-row">
            <Button small primary onClick={ask} disabled={lookups.length >= 30}>
              {name} 조회
            </Button>
          </div>
          <div className="btn-row">
            <Button small onClick={() => wait(60)}>
              +1분
            </Button>
            <Button small onClick={() => wait(600)}>
              +10분
            </Button>
            <Button small onClick={reset}>
              처음부터
            </Button>
          </div>
          <StepControls s={s} id="dns-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="이번 조회의 시각" value={`${at}초`} />
            <Readout label="걸린 시간" value={`${f.ms}ms / ${run.ms}ms`} />
            <Readout label="서버에 보낸 질문" value={`${asked} / ${total}번`} />
            <Readout label="캐시 항목" value={`${cache.length}개`} />
          </div>
          <div>
            <div className="panel-title">리졸버의 캐시 (이번 조회 시각 기준 남은 TTL) {pending}</div>
            {cache.length ? (
              <div className="mini-tbl-wrap">
                <table className="mini-tbl">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th>유형</th>
                      <th>남은 초</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cache.map((e) => (
                      <tr key={`${e.name}|${e.type}`} data-new={fresh(e) || undefined}>
                        <td>{e.name}</td>
                        <td>{e.type === 'NX' ? '없음' : e.type}</td>
                        <td className="num">{(e.expires - at).toLocaleString('ko-KR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mini-empty">비어 있음</div>
            )}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: TTL against load and staleness ─────────────── */

const TTLS = [10, 30, 60, 300, 900, 1800, 3600];
const ttlText = (t: number) => (t < 60 ? `${t}초` : t < 3600 ? `${t / 60}분` : `${t / 3600}시간`);
const NB = TTL_DURATION / TTL_BIN;

function TtlFigure() {
  const P = usePalette();
  const [k, setK] = useState(3);
  const ttl = TTLS[k];
  const sim = useMemo(() => simulateTtl(ttl), [ttl]);
  const authMax = useMemo(() => Math.max(...simulateTtl(TTLS[0]).bins.map((b) => b.auth)), []);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h: H }) => {
      const gap = 14;
      const top = (H - gap) * 0.5;
      const text = (s: string, x: number, y: number, align: CanvasTextAlign, color = P.ink3) => {
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(s, x, y);
      };
      const yTop = Math.ceil(authMax / 50) * 50;
      const p1 = new Plot(ctx, w, top, P, { xMin: 0, xMax: NB, yMin: 0, yMax: yTop, pad: { l: 42, r: 10, t: 22, b: 6 } });
      p1.grid({ xStep: 30, yStep: yTop / 2, labels: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      for (const y of [0, yTop / 2, yTop]) text(String(y), p1.X(0) - 5, p1.Y(y), 'right');
      ctx.font = `12px ${P.fontBody}`;
      text('권한 서버가 받은 질문 (분당)', p1.X(0), 10, 'left', P.ink2);
      ctx.fillStyle = P.neg;
      const bwid = Math.max(1, p1.X(1) - p1.X(0) - 1);
      sim.bins.forEach((b, i) => ctx.fillRect(p1.X(i) + 0.5, p1.Y(b.auth), bwid, p1.Y(0) - p1.Y(b.auth)));
      p1.line(TTL_CHANGE / TTL_BIN, 0, TTL_CHANGE / TTL_BIN, yTop, alpha(P.ink, 0.6), 1.2, [4, 4]);

      ctx.save();
      ctx.translate(0, top + gap);
      const p2 = new Plot(ctx, w, H - top - gap, P, { xMin: 0, xMax: NB, yMin: 0, yMax: 100, pad: { l: 42, r: 10, t: 22, b: 22 } });
      p2.grid({ xStep: 30, yStep: 50, labels: false });
      ctx.font = `11px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      for (const y of [0, 50, 100]) text(`${y}%`, p2.X(0) - 5, p2.Y(y), 'right');
      ctx.textBaseline = 'top';
      for (let m = 0; m <= NB; m += 30) text(`${m}분`, p2.X(m), p2.Y(0) + 5, m === 0 ? 'left' : m === NB ? 'right' : 'center');
      ctx.font = `12px ${P.fontBody}`;
      ctx.textBaseline = 'middle';
      text('옛 주소를 받은 응답의 비율', p2.X(0), 10, 'left', P.ink2);
      ctx.fillStyle = P.bad;
      sim.bins.forEach((b, i) => {
        if (!b.total || !b.stale) return;
        const v = (b.stale / b.total) * 100;
        ctx.fillRect(p2.X(i) + 0.5, p2.Y(v), bwid, p2.Y(0) - p2.Y(v));
      });
      p2.line(TTL_CHANGE / TTL_BIN, 0, TTL_CHANGE / TTL_BIN, 100, alpha(P.ink, 0.6), 1.2, [4, 4]);
      p2.text('주소 변경', TTL_CHANGE / TTL_BIN, 88, P.ink, { dx: 6, font: `600 11px ${P.fontBody}`, bg: P.surface });
      ctx.restore();
    },
    [P, sim, authMax],
    { aspect: 2, maxHeight: 360, minHeight: 280 },
  );

  return (
    <Figure
      no={3}
      title="TTL을 길게 잡을까, 짧게 잡을까"
      hint="TTL을 바꿔 보세요"
      caption={<>리졸버 {TTL_RESOLVERS}곳이 인기 있는 이름 하나를 두 시간 동안 받아 주는 상황입니다. 리졸버마다 사용자 질문이 초당 0.001번에서 1번 사이의 서로 다른 빈도로 무작위하게 들어옵니다. 캐시가 비었거나 만료됐을 때만 권한 서버에 묻습니다. 60분째에 서버를 옮겨 A 레코드의 주소가 바뀌고, 그 전에 캐시한 리졸버는 TTL이 끝날 때까지 옛 주소를 계속 나눠 줍니다. 그림이 시작할 때 이미 캐시가 차 있다고 보고, 시드를 고정해 언제나 같은 결과를 냅니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`TTL ${ttlText(ttl)}: 적중률 ${(sim.hitRate * 100).toFixed(1)}%, 권한 서버 질문 ${sim.auth}번, 옛 주소 응답 ${sim.stale}번`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="ttl-k" label="A 레코드의 TTL" value={k} min={0} max={TTLS.length - 1} step={1} onChange={setK} format={(v) => ttlText(TTLS[v])} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="리졸버 캐시 적중률" value={`${(sim.hitRate * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="권한 서버가 받은 질문" value={`${sim.auth.toLocaleString('ko-KR')}번`} color="var(--neg)" />
            <Readout label="옛 주소를 받은 응답" value={`${sim.stale.toLocaleString('ko-KR')}번`} color="var(--bad)" />
            <Readout label="옛 주소가 나간 기간" value={sim.stale ? `${Math.round(sim.lastStale).toLocaleString('ko-KR')}초` : '없음'} />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>사용자 질문은 모두 {sim.total.toLocaleString('ko-KR')}번입니다.</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Dns() {
  return (
    <>
      <h2>이름은 사람을 위해, 주소는 라우터를 위해</h2>
      <p>
        라우터는 패킷을 <a href="#net-basics/ip-routing">IP 주소</a>로만 보냅니다. 하지만 사람은 192.0.2.10보다 www.example.com을 훨씬 잘 기억하고, 서비스 쪽에서도 이름이 있어야 편합니다. 서버를 다른 데이터센터로 옮겨 주소가 바뀌어도 이름은 그대로 둘 수 있고, 이름 하나에 주소 여러 개를 달아 부하를 나눌 수도 있습니다. 그래서 웹 요청은 거의 언제나 <strong>이름을 주소로 바꾸는 일</strong>로 시작합니다. 이 일을 하는 시스템이 <T en="Domain Name System">DNS</T>입니다.
      </p>
      <p>
        처음부터 DNS가 있었던 것은 아닙니다. 1970년대 아파넷(ARPANET)에서는 스탠퍼드 연구소(SRI)의 네트워크 정보 센터가 모든 컴퓨터의 이름과 주소를 적은 HOSTS.TXT 파일 하나를 관리했고, 각 컴퓨터가 이 파일을 주기적으로 내려받았습니다. 컴퓨터가 늘어나자 파일은 커지고, 변경 요청은 한곳에 몰리고, 이름이 겹치는 일도 막기 어려워졌습니다. 1983년 폴 모카페트리스(Paul Mockapetris)가 제안한 DNS는 이 표를 <strong>나무 모양으로 쪼개서 여러 관리자에게 나눠 맡기는</strong> 방법입니다. 지금도 대부분의 운영체제에는 hosts 파일이 남아 있어서, 거기 적은 이름은 DNS보다 먼저 쓰입니다.
      </p>

      <h2>이름의 나무와 영역</h2>
      <p>
        www.example.com은 점으로 나뉜 <T en="label">레이블</T> 세 개입니다. 오른쪽으로 갈수록 큰 범위입니다. 맨 오른쪽 뒤에는 보이지 않는 <T en="root">루트</T>가 있고, 그 아래 com, net, kr 같은 <T en="top-level domain">최상위 도메인</T>(TLD), 그 아래 example, 다시 그 아래 www가 있습니다. 이름은 이 나무의 뿌리에서 잎까지 가는 길을 거꾸로 적은 것입니다.
      </p>
      <p>
        이 나무를 한 사람이 관리하지 않는다는 것이 핵심입니다. 나무는 <T en="zone">영역</T>으로 잘려 있고, 영역마다 관리자와 그 영역의 질문에 답하는 <T en="authoritative name server">권한 서버</T>가 있습니다. 루트 영역의 관리자는 "com은 이 서버들이 맡는다"는 사실만 적어 두고, com 영역의 관리자는 "example.com은 ns1.example.com이 맡는다"는 사실만 적어 둡니다. 이렇게 아래 영역에 관리를 넘기는 것을 <T en="delegation">위임</T>이라고 하고, 위임은 NS 레코드로 표시합니다. www.example.com의 주소가 무엇인지는 example.com의 관리자만 정하고, 바꾸고 싶을 때 루트나 com에 알릴 필요가 없습니다.
      </p>
      <TreeFigure />
      <p>
        www를 누르면 노란 길이 루트 → com → example.com으로 이어집니다. 이 길에서 영역이 세 번 바뀌므로, 아무것도 모르는 리졸버는 서버 세 곳에 차례로 물어야 합니다. cdn.example.net은 아래에 이름이 있어서 마디로 존재할 뿐, 따로 영역을 나누지 않아 example.net 영역에 그대로 속한다는 점도 보세요. 영역은 관리의 경계이지 레이블의 경계가 아닙니다.
      </p>
      <p>영역에 적는 한 줄 한 줄을 <T en="resource record">레코드</T>라고 합니다. 레코드마다 이름, 유형, 값, 그리고 얼마 동안 캐시해도 되는지를 뜻하는 TTL(초)이 있습니다. 자주 보는 유형은 이렇습니다.</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>유형</th>
              <th>뜻</th>
              <th>예</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A</td>
              <td>IPv4 주소</td>
              <td className="mono">www.example.com → 192.0.2.10</td>
            </tr>
            <tr>
              <td>AAAA</td>
              <td>IPv6 주소</td>
              <td className="mono">www.example.com → 2001:db8::10</td>
            </tr>
            <tr>
              <td>CNAME</td>
              <td>이 이름은 다른 이름의 별명</td>
              <td className="mono">shop.example.com → shop.cdn.example.net</td>
            </tr>
            <tr>
              <td>NS</td>
              <td>이 영역을 맡은 권한 서버</td>
              <td className="mono">example.com → ns1.example.com</td>
            </tr>
            <tr>
              <td>MX</td>
              <td>이 도메인의 메일을 받는 서버와 우선순위</td>
              <td className="mono">example.com → 10 mail.example.com</td>
            </tr>
            <tr>
              <td>TXT</td>
              <td>자유로운 문자열. 메일 발신 정책, 도메인 소유 확인 등에 씀</td>
              <td className="mono">example.com → "v=spf1 mx -all"</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>재귀 리졸버가 대신 찾아다닌다</h2>
      <p>
        내 컴퓨터는 이 나무를 직접 타고 내려가지 않습니다. 운영체제 안의 작은 <T en="stub resolver">스텁 리졸버</T>는 네트워크 설정에 적힌 <T en="recursive resolver">재귀 리졸버</T> 한 곳에 질문을 던지고 최종 답만 기다립니다. 재귀 리졸버는 보통 인터넷 회사(ISP)가 운영하거나, 누구나 쓸 수 있게 공개된 것(예: 1.1.1.1, 8.8.8.8)입니다. 리졸버는 루트부터 시작해 서버마다 같은 질문을 던지고, 서버들은 "나는 모르지만 저 서버에게 물어보라"는 위임으로 답합니다. 리졸버 입장에서는 같은 일을 되풀이하는 <T en="iterative query">반복 질의</T>입니다.
      </p>
      <ResolveFigure />
      <p>
        처음 www.example.com을 찾을 때는 질문이 세 번 나갑니다. 루트는 com 서버를, com 서버는 example.com 서버를 알려 주고, example.com 서버가 비로소 주소를 줍니다. 그림의 가정으로 120ms가 걸립니다. 이제 api를 조회해 보세요. 리졸버가 example.com의 NS를 캐시하고 있으므로 루트와 com을 건너뛰고 권한 서버에 한 번만 물어 70ms에 끝납니다. www를 한 번 더 조회하면 A 레코드까지 캐시에 있어서 어떤 서버에도 묻지 않고 10ms 만에 답합니다. 그 뒤 +10분을 눌러 TTL 300초가 지나게 하고 다시 조회하면, A 레코드는 만료됐지만 이틀짜리 위임은 남아 있어 권한 서버에만 다시 묻습니다.
      </p>
      <p>
        shop은 주소 대신 CNAME을 돌려받아 다른 영역(example.net)의 이름을 처음부터 다시 찾아야 합니다. CDN을 쓰는 사이트가 흔히 이렇게 구성되어 있습니다. example.com의 위임을 이미 알고 있어도 example.com 서버, 루트, net 서버, example.net 서버에 차례로 물어 질문이 네 번 나갑니다. nope처럼 없는 이름에는 <T en="NXDOMAIN">NXDOMAIN</T>이 돌아오고, 이 "없음"도 영역이 정한 시간 동안 캐시됩니다. 이를 <T en="negative caching">부정 캐시</T>라고 합니다. 없는 이름을 계속 묻는 오타나 잘못된 설정이 권한 서버에 그대로 쏟아지지 않게 해 줍니다.
      </p>
      <Callout kind="note">
        리졸버는 "ns1.example.com에게 물어보라"는 답을 받아도 ns1.example.com의 주소를 알아야 물을 수 있습니다. 그런데 그 이름은 바로 지금 찾고 있는 example.com 영역 안에 있어서 닭과 달걀 문제가 생깁니다. 그래서 위 영역은 위임과 함께 권한 서버의 IP 주소를 덧붙여 보내 줍니다. 이 덧붙인 주소를 <T en="glue record">글루 레코드</T>라고 합니다.
      </Callout>

      <h2>캐시가 루트를 지킨다</h2>
      <p>
        모든 조회가 루트에서 시작한다면 루트 서버는 세상의 모든 DNS 질문을 받아야 할 것입니다. 실제로는 그렇지 않습니다. 루트 서버는 a.root-servers.net부터 m.root-servers.net까지 <strong>13개의 이름</strong>으로 운영되지만, 이름마다 <T en="anycast">애니캐스트</T>로 같은 주소를 전 세계 여러 곳의 서버가 함께 씁니다. 패킷은 라우팅에 따라 가장 가까운 서버로 가므로, 실제로는 세계 곳곳의 천 곳이 훨씬 넘는 장소에서 루트 서버가 답합니다. 그리고 루트와 com 영역이 주는 위임에는 보통 이틀(172,800초)짜리 TTL이 붙어 있어서, 바쁜 리졸버는 루트에 거의 묻지 않습니다. com 서버가 누구인지는 이미 알고 있기 때문입니다.
      </p>
      <p>
        DNS 전체가 거대한 계층형 캐시인 셈입니다. 브라우저도, 운영체제도, 공유기도, 리졸버도 각자 답을 캐시합니다. 캐시 일반에 대해서는 <a href="#cs-system-algorithms/lru-cache">LRU 캐시</a> 장에서 더 다룹니다. DNS 캐시가 다른 점은 무엇을 버릴지보다 <strong>언제까지 믿을지</strong>가 중요하다는 것입니다. 그 기한을 정하는 것은 답을 주는 쪽이 붙인 TTL입니다.
      </p>

      <h2>TTL: 빠른 변경과 적은 질문 사이</h2>
      <p>TTL을 길게 잡으면 캐시가 오래 살아서 권한 서버가 편하고 사용자도 빨리 답을 받습니다. 대신 주소를 바꿨을 때, 이미 옛 주소를 캐시한 리졸버들은 TTL이 끝날 때까지 옛 주소를 계속 나눠 줍니다. DNS에는 "캐시를 지금 지워라"라고 세상의 리졸버에 알리는 방법이 없습니다.</p>
      <TtlFigure />
      <p>
        두 시간 동안 사용자 질문은 29,996번입니다. TTL이 1분이면 리졸버 캐시 적중률이 90.8%이고 권한 서버에 2,754번의 질문이 갑니다. 5분으로 늘리면 776번, 1시간이면 76번으로 줄어듭니다. 하지만 주소가 바뀐 뒤 옛 주소를 받은 응답은 1분일 때 126번이고 변경 후 53초 만에 끝나는 반면, 1시간일 때는 554번이고 변경 후 거의 한 시간(3,593초) 동안 이어집니다. 옛 주소가 사라지는 시간의 상한이 곧 TTL입니다.
      </p>
      <p>
        그래서 운영자들은 서버를 옮기기 전에 TTL을 미리 낮춥니다. 원래 TTL이 하루였다면 적어도 하루 전에 60초 정도로 낮춰 두어야, 이사하는 순간에는 모든 캐시가 짧은 TTL을 갖고 있습니다. 이사를 마치고 안정되면 다시 늘립니다. CDN처럼 사용자 위치나 서버 상태에 따라 답을 자주 바꾸는 서비스는 아예 TTL을 수십 초로 짧게 두는 경우가 많습니다.
      </p>
      <Callout kind="warn">
        TTL은 약속이지 강제가 아닙니다. 일부 리졸버나 프로그램은 TTL보다 오래 캐시하기도 하고(예를 들어 한 번 찾은 주소를 프로세스가 끝날 때까지 쓰는 프로그램), 서버를 옮긴 뒤에도 옛 서버로 오는 요청이 한동안 남습니다. 옛 서버는 TTL보다 넉넉하게 켜 두는 것이 안전합니다.
      </Callout>

      <h2>UDP 한 번 왕복, 그리고 그다음</h2>
      <p>
        DNS 질문과 답은 대개 작아서 TCP 연결을 맺지 않고 UDP 패킷 하나씩으로 오갑니다. 포트는 53번입니다. 핸드셰이크가 없으니 조회 한 번이 왕복 한 번으로 끝납니다. 원래 규격은 UDP 메시지를 512바이트로 제한했고, 지금은 <T en="Extension Mechanisms for DNS">EDNS(0)</T>로 더 큰 크기를 알려 주고 주고받습니다. 그래도 답이 너무 크면 서버가 "잘렸음" 표시를 붙여 보내고, 리졸버는 TCP로 다시 묻습니다.
      </p>
      <p>
        기본 DNS는 암호화도 서명도 없습니다. 같은 네트워크의 누군가가 내가 어떤 이름을 묻는지 볼 수 있고, 가짜 답을 먼저 끼워 넣으려는 공격도 있었습니다. 답이 진짜인지 서명으로 확인하는 <T en="DNS Security Extensions">DNSSEC</T>, 그리고 스텁과 리졸버 사이의 대화를 암호화하는 DNS over TLS(DoT)와 DNS over HTTPS(DoH)가 그 대책입니다. DoH는 DNS 질문을 다음 장에서 볼 HTTPS 요청에 담아 보내므로, 보통의 웹 트래픽과 구별하기 어렵습니다.
      </p>

      <Callout kind="key">
        DNS는 이름의 나무를 영역으로 잘라 여러 관리자에게 위임한 분산 데이터베이스입니다. 재귀 리졸버는 루트 → TLD → 권한 서버로 반복 질의를 하며 위임을 따라 내려가고, 받은 답은 TTL 동안 캐시합니다. 캐시 덕분에 대부분의 조회는 서버에 묻지 않고 끝나고, 루트는 거의 질문을 받지 않습니다. TTL은 질문의 양과 변경이 퍼지는 속도 사이의 맞바꿈이고, 바뀐 주소가 모두에게 퍼지기까지의 상한입니다.
      </Callout>
      <Quiz
        q="내일 웹 서버를 새 IP 주소로 옮긴다. www의 A 레코드 TTL은 지금 86,400초(하루)다. 사용자가 옛 서버로 가는 시간을 가장 줄이는 방법은?"
        options={['옮기는 순간에 TTL을 60초로 낮추고 주소를 바꾼다', '루트 서버와 com 서버에 캐시를 지워 달라고 요청한다', '지금 바로 TTL을 60초로 낮춰 두고, 하루가 지난 뒤 주소를 바꾸고, 안정되면 TTL을 다시 늘린다', 'NS 레코드의 TTL만 60초로 낮춘다']}
        answer={2}
        explain={<>리졸버들은 이미 받은 레코드를 그 레코드에 붙어 있던 TTL만큼 믿습니다. 옮기는 순간에 TTL을 낮춰도, 그 전에 하루짜리 TTL로 캐시한 리졸버는 최대 하루 동안 옛 주소를 줍니다. 미리 낮춘 TTL이 퍼지도록 원래 TTL(하루) 이상 기다린 뒤에 주소를 바꿔야 합니다. 루트와 com은 A 레코드를 갖고 있지도 않고, 세상의 리졸버 캐시를 지울 방법도 없습니다. NS의 TTL은 위임에 대한 것이라 A 레코드의 캐시와는 상관없습니다.</>}
      />
    </>
  );
}
