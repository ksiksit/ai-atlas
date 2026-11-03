import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import { STRATEGY_NAME, bruteForceMax, chars, firstCounterexample, fixedBits, greedyCoins, greedyMeetings, huffman, makeMeetings, minCoins, showChar, slotTime, strategyOrder, type HNode, type Strategy } from './optimize';
import '../../algorithms/lessons/algorithms.css';
import './optimize.css';

/* ─────────────── Figure 1: greedy change vs the optimum ─────────────── */

type CoinSys = 'kr' | '134' | '1710' | 'custom';
const SYSTEMS: Record<Exclude<CoinSys, 'custom'>, { coins: number[]; start: number }> = {
  kr: { coins: [10, 50, 100, 500], start: 1260 },
  '134': { coins: [1, 3, 4], start: 9 },
  '1710': { coins: [1, 7, 10], start: 12 },
};
const SYS_LABEL: Record<CoinSys, string> = { kr: '한국 동전', '134': '1·3·4', '1710': '1·7·10', custom: '직접' };
const SYS_ORDER: CoinSys[] = ['kr', '134', '1710', 'custom'];

function parseCoins(text: string): number[] {
  const vals = text
    .split(/[^0-9]+/)
    .map((x) => parseInt(x, 10))
    .filter((v) => v > 0 && v <= 1000);
  const out = [...new Set(vals)].sort((p, q) => p - q).slice(0, 8);
  return out.length ? out : [1];
}
const gcd = (p: number, q: number): number => (q ? gcd(q, p % q) : p);
/** Slider range: steps of the coins' gcd, up to 2,000원 for Korean coins and 4 × the largest coin otherwise. */
const rangeFor = (sys: CoinSys, coins: number[]) => {
  const step = coins.reduce(gcd);
  const max = sys === 'kr' ? 2000 : Math.max(40, coins[coins.length - 1] * 4);
  return { step, max: Math.floor(max / step) * step };
};

function CoinGroups({ coins }: { coins: number[] }) {
  const groups: [number, number][] = [];
  for (const c of coins) {
    const g = groups.find(([v]) => v === c);
    if (g) g[1]++;
    else groups.push([c, 1]);
  }
  return (
    <div className="change-coins">
      {groups.map(([v, k]) => (
        <span key={v} className="coin-group">
          <span className="coin">{v}</span>×{k}
        </span>
      ))}
    </div>
  );
}

function ChangeFigure() {
  const [sys, setSys] = useState<CoinSys>('kr');
  const [customText, setCustomText] = useState('1, 5, 6, 9');
  const [amount, setAmount] = useState(SYSTEMS.kr.start);
  const [found, setFound] = useState<string | null>(null);
  const coins = sys === 'custom' ? parseCoins(customText) : SYSTEMS[sys].coins;
  const { step, max } = rangeFor(sys, coins);
  const amt = Math.min(max, Math.max(step, Math.round(amount / step) * step));
  const g = greedyCoins(coins, amt);
  const opt = useMemo(() => minCoins(coins, amt), [coins, amt]);
  const greedyOk = g.left === 0;
  const worse = opt !== null && (!greedyOk || g.coins.length > opt.length);

  const pickSys = (v: CoinSys) => {
    setSys(v);
    setFound(null);
    setAmount(v === 'custom' ? 10 : SYSTEMS[v].start);
  };
  const findCounter = () => {
    const x = firstCounterexample(coins, max);
    if (x === null) setFound(`1원부터 ${max.toLocaleString('ko-KR')}원까지 모두 확인 → 반례 없음`);
    else {
      setAmount(x);
      setFound(`가장 작은 반례: ${x.toLocaleString('ko-KR')}원`);
    }
  };

  const verdict =
    opt === null
      ? '이 동전들로는 만들 수 없는 금액입니다.'
      : !greedyOk
        ? `큰 동전부터 내다 보니 ${g.left}원이 남아 막혔습니다. 처음부터 다르게 고르면 ${opt.length}개로 됩니다.`
        : worse
          ? `탐욕이 동전을 ${g.coins.length - opt.length}개 더 씁니다.`
          : '이 금액에서는 탐욕이 고른 개수가 최소입니다.';

  return (
    <Figure
      no={1}
      title="큰 동전부터 내면 최소일까"
      hint="동전 종류와 금액을 바꾸고 반례를 찾아보세요"
      caption={<>탐욕은 남은 금액보다 크지 않은 동전 중 가장 큰 것을 계속 냅니다. 최적은 <a href="#cs-algorithm-design/dynamic-programming">동적 계획법</a>으로 모든 경우를 따져 구한 최소 개수입니다. 탐욕이 더 많이 쓰거나 중간에 막히면 빨간 테두리가 쳐집니다. "반례 찾기"는 작은 금액부터 하나씩 두 방법을 비교해, 탐욕이 처음으로 틀리는 금액으로 옮겨 갑니다.</>}
    >
      <div className="change-panels">
        <div className="change-panel" data-worse={worse || undefined}>
          <div className="change-head">
            <span>
              <strong>탐욕</strong> 큰 동전부터
            </span>
            <span className="change-count">{greedyOk ? `${g.coins.length}개` : '실패'}</span>
          </div>
          <CoinGroups coins={g.coins} />
          {!greedyOk && <div className="change-left">남은 금액 {g.left}원 → 낼 동전 없음</div>}
        </div>
        <div className="change-panel">
          <div className="change-head">
            <span>
              <strong>최적</strong> 동적 계획법
            </span>
            <span className="change-count">{opt ? `${opt.length}개` : '불가능'}</span>
          </div>
          {opt ? <CoinGroups coins={opt} /> : <div className="change-left">어떤 조합으로도 만들 수 없음</div>}
        </div>
      </div>
      <div className="opt-note" style={{ minHeight: '1.7em' }} aria-live="polite">
        {verdict}
        {found && <> · {found}</>}
      </div>
      <div className="controls row">
        <div className="ctl">
          <Seg label="동전 종류" value={sys} onChange={pickSys} options={SYS_ORDER.map((k) => ({ value: k, label: SYS_LABEL[k] }))} />
          {sys === 'custom' && (
            <div className="ctl" style={{ marginTop: 8 }}>
              <label className="ctl-label" htmlFor="gc-coins">
                <span>동전 (쉼표로 구분, 8개까지)</span>
              </label>
              <input
                id="gc-coins"
                className="text-input mono"
                type="text"
                value={customText}
                maxLength={40}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  setCustomText(e.target.value);
                  setFound(null);
                }}
              />
            </div>
          )}
        </div>
        <div className="ctl">
          <Slider
            id="gc-amount"
            label="금액"
            value={amt}
            min={step}
            max={max}
            step={step}
            onChange={(v) => {
              setAmount(v);
              setFound(null);
            }}
            format={(v) => `${v.toLocaleString('ko-KR')}원`}
            color="var(--c-cs-2)"
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <Button small primary onClick={findCounter}>
              반례 찾기
            </Button>
          </div>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-3)' }}>
        쓰는 동전: {coins.join(', ')}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: meeting room scheduling ─────────────── */

const MEET_N = 10;
const MEET_SLOTS = 18; // 09:00 – 18:00 in half hours
const FIRST_SEED = 135; // a list where both "early start" and "short first" fall short

function MeetingFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(FIRST_SEED);
  const [st, setSt] = useState<Strategy>('start');
  const ms = useMemo(() => makeMeetings(MEET_N, rng(seed), MEET_SLOTS), [seed]);
  const best = useMemo(() => bruteForceMax(ms), [ms]);
  const run = useMemo(() => greedyMeetings(ms, st), [ms, st]);
  const order = useMemo(() => strategyOrder(ms, st), [ms, st]);
  const s = useStepper(run.frames.length, 2, `${seed}|${st}`);
  const f = run.frames[s.i];
  const done = s.i === run.frames.length - 1;

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const padL = 24;
      const padR = 18;
      const top = 6;
      const bottom = 24;
      const rowH = (h - top - bottom) / ms.length;
      const X = (t: number) => padL + (t / MEET_SLOTS) * (w - padL - padR);
      // hour grid
      ctx.strokeStyle = P.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = P.ink3;
      ctx.font = `10.5px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const narrow = w < 480;
      for (let t = 0; t <= MEET_SLOTS; t += 2) {
        const x = Math.round(X(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, h - bottom);
        ctx.stroke();
        if (!narrow || t % 4 === 0) ctx.fillText(`${9 + t / 2}시`, x, h - bottom + 6);
      }
      ms.forEach((m, k) => {
        const y = top + k * rowH;
        const bh = Math.min(18, rowH * 0.72);
        const by = y + (rowH - bh) / 2;
        const isCur = f.cur === m.id;
        const isChosen = f.chosen.includes(m.id);
        const isRej = f.rejected.includes(m.id);
        const isClash = f.clash === m.id;
        ctx.fillStyle = isCur ? P.ink : P.ink2;
        ctx.font = `${isCur ? 700 : 500} 12px ${P.fontMono}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.id, 4, y + rowH / 2 + 1);
        const x1 = X(m.s) + 1;
        const bw = X(m.e) - X(m.s) - 2;
        ctx.fillStyle = isCur ? P.hl : isChosen ? P.good : isRej ? alpha(P.bad, 0.16) : alpha(P.ink, 0.14);
        ctx.fillRect(x1, by, bw, bh);
        if (isRej && !isCur) {
          ctx.strokeStyle = alpha(P.bad, 0.7);
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x1 + 0.5, by + 0.5, bw - 1, bh - 1);
          ctx.setLineDash([]);
        }
        if (isClash || (isCur && f.clash)) {
          ctx.strokeStyle = P.bad;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x1 - 1, by - 1, bw + 2, bh + 2);
        }
      });
    },
    [P, ms, f],
    { height: MEET_N * 25 + 30 },
  );

  const result = done ? (run.chosen.length === best ? '최적 ✓' : `최적보다 ${best - run.chosen.length}개 적음`) : '—';

  return (
    <Figure
      no={2}
      title="회의실 하나에 회의를 가장 많이 넣기"
      hint="전략을 바꿔 가며 재생해 보세요"
      caption={<>회의실이 하나뿐이라 시간이 겹치는 회의는 함께 열 수 없습니다. 세 전략 모두 정해진 순서대로 회의를 하나씩 보며, 이미 고른 회의와 겹치지 않으면 고르고 겹치면 버립니다. 다른 점은 줄 세우는 기준뿐입니다. 노란 막대는 지금 보는 회의, 초록은 고른 회의, 점선은 버린 회의이고, 빨간 테두리는 부딪힌 두 회의입니다. "가능한 최대"는 회의 2<sup>10</sup> = 1,024가지 조합을 모두 확인해 구했습니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`회의 ${ms.length}개의 시간표: ${ms.map((m) => `${m.id} ${slotTime(m.s)}–${slotTime(m.e)}`).join(', ')}`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="opt-chips" aria-hidden="true">
            <span className="lbl">살펴보는 순서 ({STRATEGY_NAME[st]} 순)</span>
            {order.map((m) => (
              <span key={m.id} className="opt-chip" data-state={f.cur === m.id ? 'cur' : f.chosen.includes(m.id) ? 'chosen' : f.rejected.includes(m.id) ? 'rejected' : undefined}>
                {m.id}
              </span>
            ))}
          </div>
          <div className="opt-note" aria-live="polite">
            {f.note}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="줄 세우는 기준"
            value={st}
            onChange={setSt}
            options={(Object.keys(STRATEGY_NAME) as Strategy[]).map((k) => ({ value: k, label: STRATEGY_NAME[k] }))}
          />
          <StepControls s={s} id="mt-speed" maxSpeed={8} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((x) => x + 1)}>
              새 회의 목록
            </Button>
            <Button small onClick={() => setSeed(FIRST_SEED)} disabled={seed === FIRST_SEED}>
              처음 목록
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="고른 회의" value={`${f.chosen.length}개`} color="var(--good)" />
            <Readout label="가능한 최대" value={`${best}개`} />
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label="결과" value={result} color={done ? (run.chosen.length === best ? 'var(--good)' : 'var(--bad)') : undefined} />
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--hl)', label: '지금 보는 회의', shape: 'sq' },
          { color: 'var(--good)', label: '고름', shape: 'sq' },
          { color: 'color-mix(in srgb, var(--bad) 25%, transparent)', label: '겹쳐서 버림', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: Huffman coding ─────────────── */

const HUFF_MAX = 40;
const HUFF_PRESETS = [
  { value: 'abra', label: 'abracadabra', text: 'abracadabra' },
  { value: 'ganjang', label: '간장 공장', text: '간장 공장 공장장은 강 공장장이고' },
  { value: 'even', label: '가나다라', text: '가나다라마바사' },
];

function HuffmanFigure() {
  const P = usePalette();
  const [text, setText] = useState(HUFF_PRESETS[0].text);
  const hf = useMemo(() => huffman(text), [text]);
  const s = useStepper(hf.frames.length, 1, text);
  const f = hf.frames[s.i];
  const done = s.i === hf.frames.length - 1;
  const n = chars(text).length;
  const k = hf.codes.length;
  const preset = HUFF_PRESETS.find((p) => p.text === text)?.value ?? 'custom';
  const utf8 = useMemo(() => new TextEncoder().encode(text).length * 8, [text]);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const nodes = hf.nodes;
      if (!f.roots.length) {
        ctx.fillStyle = P.ink3;
        ctx.font = `14px ${P.fontBody}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('글자를 입력하세요', w / 2, h / 2);
        return;
      }
      const ht = (id: number): number => (nodes[id].ch !== undefined ? 0 : 1 + Math.max(ht(nodes[id].l!), ht(nodes[id].r!)));
      const H = Math.max(1, ht(hf.root));
      const side = 8;
      const slot = (w - 2 * side) / k;
      const leafW = Math.max(14, Math.min(38, slot - 4));
      const leafH = 32;
      const codeH = done ? 16 : 0;
      const top = 18;
      const leafY = h - 8 - codeH - leafH / 2;
      const dy = (leafY - top) / H;
      const rad = Math.max(8, Math.min(14, slot / 2 - 2));
      const pos = new Map<number, [number, number]>();
      let leafIdx = 0;
      const place = (id: number): number => {
        const nd = nodes[id];
        let x: number;
        if (nd.ch !== undefined) x = side + (leafIdx++ + 0.5) * slot;
        else x = (place(nd.l!) + place(nd.r!)) / 2;
        pos.set(id, [x, nd.ch !== undefined ? leafY : leafY - ht(id) * dy]);
        return x;
      };
      for (const r of f.roots) place(r);
      const merged = new Set(f.merged ?? []);

      // edges with 0 / 1
      const edges = (id: number) => {
        const nd: HNode = nodes[id];
        if (nd.ch !== undefined) return;
        const [x, y] = pos.get(id)!;
        ([
          [nd.l!, '0'],
          [nd.r!, '1'],
        ] as const).forEach(([c, bit]) => {
          const [cx, cy] = pos.get(c)!;
          const ey = nodes[c].ch !== undefined ? cy - leafH / 2 : cy;
          ctx.strokeStyle = P.lineStrong;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(cx, ey);
          ctx.stroke();
          // with many leaves the 0/1 labels would collide; the code table below still lists every code
          if (slot >= 22) {
            ctx.fillStyle = P.accent;
            ctx.font = `700 11px ${P.fontMono}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const mx = x + (cx - x) * 0.35;
            const my = y + (ey - y) * 0.35;
            ctx.fillText(bit, mx + (bit === '0' ? -7 : 7), my);
          }
          edges(c);
        });
      };
      for (const r of f.roots) edges(r);

      for (const [id, [x, y]] of pos) {
        const nd = nodes[id];
        const isNew = f.made === id;
        const isMerged = merged.has(id);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (nd.ch !== undefined) {
          ctx.fillStyle = isMerged ? P.hl : P.surface;
          ctx.fillRect(x - leafW / 2, y - leafH / 2, leafW, leafH);
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.3;
          ctx.strokeRect(x - leafW / 2, y - leafH / 2, leafW, leafH);
          ctx.fillStyle = isMerged ? '#1a1a1a' : P.ink;
          ctx.font = `700 ${leafW < 22 ? 11 : 14}px ${P.fontMono}`;
          ctx.fillText(showChar(nd.ch), x, y - 6);
          ctx.font = `${leafW < 22 ? 9 : 10.5}px ${P.fontMono}`;
          ctx.fillStyle = isMerged ? '#1a1a1a' : P.ink3;
          ctx.fillText(String(nd.w), x, y + 9);
          if (done && slot >= 26) {
            const code = hf.codes.find((c) => c.ch === nd.ch)?.code ?? '';
            ctx.fillStyle = P.accent;
            ctx.font = `600 10px ${P.fontMono}`;
            ctx.fillText(code, x, y + leafH / 2 + 9);
          }
        } else {
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = isNew ? P.pos : isMerged ? P.hl : P.surface2;
          ctx.fill();
          ctx.strokeStyle = P.ink;
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.fillStyle = isNew ? P.surface : isMerged ? '#1a1a1a' : P.ink;
          ctx.font = `600 ${rad < 11 ? 9 : 11}px ${P.fontMono}`;
          ctx.fillText(String(nd.w), x, y + 1);
        }
      }
    },
    [P, hf, f, done],
    { aspect: 1.8, maxHeight: 340, minHeight: 250 },
  );

  return (
    <Figure
      no={3}
      title="허프만 나무 만들기"
      hint="재생하거나 문장을 직접 입력해 보세요"
      caption={<>네모는 글자(아래 숫자는 나온 횟수), 동그라미는 합친 노드(숫자는 아래 글자들의 횟수 합)입니다. 단계마다 횟수가 가장 작은 두 나무(노란색)를 골라 새 노드(주황색) 아래로 합칩니다. 나무가 하나가 되면 뿌리에서 글자까지 내려가며 만난 0과 1이 그 글자의 부호입니다. 자주 나오는 글자일수록 뿌리에 가까워 부호가 짧습니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`허프만 나무: 글자 ${k}종류, 남은 나무 ${f.roots.length}그루`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="opt-note" aria-live="polite">
            {f.note}
          </div>
          {done && hf.codes.length > 0 ? (
            <div className="tbl-wrap" style={{ margin: 0 }}>
              <table className="tbl huff-table">
                <thead>
                  <tr>
                    <th>글자</th>
                    <th>횟수</th>
                    <th>부호</th>
                    <th>비트 (횟수 × 길이)</th>
                  </tr>
                </thead>
                <tbody>
                  {hf.codes.map((c) => (
                    <tr key={c.ch}>
                      <td className="mono">{showChar(c.ch)}</td>
                      <td className="num">{c.w}</td>
                      <td className="huff-code">{c.code}</td>
                      <td className="num">
                        {c.w} × {c.code.length} = {c.w * c.code.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ds-empty">나무가 다 만들어지면 글자별 부호표가 나옵니다.</div>
          )}
        </div>
        <div className="controls">
          <div className="seg-tight small">
            <Seg
              label="예시"
              value={preset}
              onChange={(v) => {
                const p = HUFF_PRESETS.find((x) => x.value === v);
                if (p) setText(p.text);
              }}
              options={HUFF_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          <div className="ctl">
            <label className="ctl-label" htmlFor="hf-input">
              <span>직접 입력 ({HUFF_MAX}자까지)</span>
            </label>
            <input id="hf-input" className="text-input" type="text" value={text} spellCheck={false} autoComplete="off" onChange={(e) => setText(chars(e.target.value).slice(0, HUFF_MAX).join(''))} />
          </div>
          <StepControls s={s} id="hf-speed" maxSpeed={6} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="허프만 부호" value={done && n ? `${hf.bits}비트` : '—'} color="var(--pos)" />
            <Readout label="글자당 평균" value={done && n ? `${(hf.bits / n).toFixed(2)}비트` : '—'} color="var(--pos)" />
            <Readout label={`고정 길이 (${fixedBits(k)}비트씩)`} value={`${n ? fixedBits(k) * n : 0}비트`} />
            <Readout label="UTF-8 그대로" value={`${utf8}비트`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Greedy() {
  return (
    <>
      <h2>지금 가장 좋아 보이는 것을 고른다</h2>
      <p>
        편의점 점원이 거스름돈 1,260원을 줄 때는 고민하지 않습니다. 500원을 넣을 수 있는 만큼 넣고, 다음은 100원, 그다음은 50원, 10원 순으로 채웁니다. 이렇게 <strong>매 단계에서 당장 가장 좋아 보이는 선택을 하고 다시 돌아보지 않는</strong> 방법을 <T en="greedy algorithm">탐욕 알고리즘</T>이라고 합니다.
      </p>
      <p>
        탐욕 알고리즘은 빠르고 단순합니다. 보통 후보를 어떤 기준으로 한 번 정렬하고 앞에서부터 훑으면 끝나므로 <M>{'O(n \\log n)'}</M>이면 됩니다. <a href="#cs-algorithm-design/dynamic-programming">동적 계획법</a>이 가능한 모든 선택을 표에 적어 가며 비교하는 것과 대조적입니다. 문제는 당장의 최선이 전체의 최선이라는 보장이 없다는 것입니다. 이 장의 질문은 그래서 하나입니다. <strong>언제 탐욕이 정답이고, 언제 틀리는가?</strong>
      </p>

      <h2>거스름돈: 통할 때와 틀릴 때</h2>
      <Code label="큰 동전부터 내는 거스름돈">{`
function greedyChange(coins, amount) {
  const used = [];
  for (const c of [...coins].sort((a, b) => b - a)) {   // 큰 동전부터
    while (amount >= c) {
      used.push(c);
      amount -= c;
    }
  }
  return amount === 0 ? used : null;   // 남은 금액이 있으면 실패
}`}</Code>
      <p>
        한국 동전으로는 이 방법이 언제나 최소 개수를 냅니다. 그림 1에서 금액을 이리저리 바꿔도, "반례 찾기"를 눌러도 탐욕과 최적이 늘 같습니다. 그런데 동전을 1·3·4원으로 바꾸고 반례를 찾으면 곧바로 6원이 나옵니다. 탐욕은 4원을 먼저 집는 바람에 4 + 1 + 1로 3개를 내지만, 3 + 3이면 2개로 충분합니다. 1·7·10원에서는 14원에서 탐욕이 10 + 1 + 1 + 1 + 1로 5개를 내는데 7 + 7이면 2개입니다.
      </p>
      <ChangeFigure />
      <p>
        한국 동전이 안전한 이유는 동전마다 바로 아래 동전의 배수이기 때문입니다(50 = 10 × 5, 100 = 50 × 2, 500 = 100 × 5). 이런 체계에서는 작은 동전 여러 개를 큰 동전 하나로 바꾸는 것이 언제나 이득이라, 큰 동전을 최대한 많이 쓰는 탐욕이 최적과 같아집니다. 배수 관계가 깨진 동전 체계에서는 탐욕이 틀릴 수 있습니다(늘 틀리는 것은 아닙니다. 미국의 1·5·10·25센트는 배수 관계가 아니지만 탐욕이 통합니다). "직접"을 골라 동전을 바꿔 가며 확인해 보세요. 동전이 2·5원뿐이면 6원에서 탐욕은 5원을 먼저 내고 1원이 남아 아예 막히지만, 2 + 2 + 2로 만들 수 있습니다.
      </p>
      <Callout kind="note">
        반례를 찾을 때 금액을 끝없이 확인할 필요는 없습니다. 1원짜리가 있는 동전 체계에서 탐욕이 틀리는 금액이 있다면, 가장 작은 반례는 가장 큰 두 동전의 합보다 작다는 것이 증명되어 있습니다(Kozen & Zaks, 1994). 1·7·10원이라면 17원 미만만 보면 됩니다. 그림 1의 "반례 찾기"는 이보다 넉넉하게 슬라이더의 최댓값까지 확인합니다.
      </Callout>

      <h2>회의실 배정</h2>
      <p>
        회의실이 하나 있고, 회의 신청이 여러 건 들어왔습니다. 시간이 겹치는 회의는 함께 열 수 없을 때 <strong>가장 많은 회의</strong>를 열려면 어떤 회의를 골라야 할까요? 이 문제를 <T en="activity selection">활동 선택 문제</T>라고도 합니다. 탐욕스러운 기준이 몇 가지 떠오릅니다.
      </p>
      <ul>
        <li>
          <strong>빨리 시작하는 것부터</strong>: 아침 일찍부터 회의실을 채운다.
        </li>
        <li>
          <strong>짧은 것부터</strong>: 짧은 회의가 시간을 덜 잡아먹으니 많이 넣을 수 있다.
        </li>
        <li>
          <strong>빨리 끝나는 것부터</strong>: 회의실을 가장 빨리 비워 주는 회의를 고른다.
        </li>
      </ul>
      <p>셋 다 그럴듯합니다. 그림 2에서 세 기준을 하나씩 돌려 보세요.</p>
      <MeetingFigure />
      <p>
        처음 목록에서 "빨리 시작"은 9시에 시작해 12시까지 이어지는 A를 먼저 잡는 바람에 오전에 회의를 하나밖에 열지 못하고, 모두 2개로 끝납니다. "짧은 것"은 4개, "빨리 끝남"은 5개를 고르는데, 모든 조합을 확인해 보면 5개가 최대입니다. 이 글을 쓰며 그림 2와 같은 방식으로 회의 10개짜리 목록을 1,000개 만들어 보니, "빨리 시작"은 338개 목록에서, "짧은 것"은 31개 목록에서 최대보다 적게 골랐고, "빨리 끝남"은 한 번도 틀리지 않았습니다.
      </p>
      <p>
        "짧은 것"이 틀리는 경우는 드물지만 분명히 있습니다. 짧은 회의 하나가 긴 회의 두 개의 경계에 걸쳐 있으면, 짧은 회의 하나를 고르느라 회의 두 개를 버리게 됩니다. 반례가 하나라도 있으면 그 기준은 정답이 아닙니다.
      </p>
      <Code label="회의실 배정: 끝나는 시각 순">{`
function maxMeetings(meetings) {      // meetings: [{ start, end }, ...]
  const sorted = [...meetings].sort((a, b) => a.end - b.end);
  const chosen = [];
  let freeAt = -Infinity;             // 회의실이 비는 시각
  for (const m of sorted) {
    if (m.start >= freeAt) {          // 앞 회의가 끝난 뒤에 시작하면
      chosen.push(m);
      freeAt = m.end;
    }
  }
  return chosen;
}`}</Code>
      <p>
        끝나는 시각으로 정렬했으므로 겹치는지 확인할 때 마지막으로 고른 회의의 끝 시각 하나만 보면 됩니다. 정렬에 <M>{'O(n \\log n)'}</M>, 훑는 데 <M>{'O(n)'}</M>입니다. 모든 조합을 보는 방법은 <M>{'2^n'}</M>가지를 확인해야 하므로 회의가 40개만 되어도 1조 가지가 넘습니다.
      </p>

      <h2>왜 끝나는 시각인가: 교환 논증</h2>
      <p>
        몇 번 돌려서 맞았다고 언제나 맞는 것은 아닙니다. 탐욕 알고리즘이 옳다는 것은 보통 <T en="exchange argument">교환 논증</T>으로 보입니다. "어떤 최적 해든, 그 일부를 탐욕의 선택으로 바꿔 끼워도 손해가 없다"를 보이는 방법입니다.
      </p>
      <ol>
        <li>가장 먼저 끝나는 회의를 g라고 합시다. 아무 최적 해나 하나 가져와, 그 안의 회의를 끝나는 시각 순으로 늘어놓습니다. 첫 회의를 f라고 합시다.</li>
        <li>g는 모든 회의 중 가장 먼저 끝나므로 f보다 늦게 끝나지 않습니다. 그래서 f를 빼고 g를 넣어도, f 다음 회의들(모두 f가 끝난 뒤에 시작)과 겹치지 않습니다.</li>
        <li>바꿔 끼운 해도 회의 수가 같으니 여전히 최적입니다. 즉, g를 고르고도 최적에 도달할 수 있습니다.</li>
        <li>g와 겹치는 회의를 지우면 남은 것은 "g가 끝난 뒤의 회의들"이라는 같은 모양의 더 작은 문제이고, 같은 논리를 되풀이할 수 있습니다.</li>
      </ol>
      <p>"빨리 시작"이나 "짧은 것"으로는 2번 단계가 성립하지 않습니다. 가장 먼저 시작하는 회의나 가장 짧은 회의는 f보다 늦게 끝날 수 있어서, 바꿔 끼우면 다음 회의와 겹칠 수 있기 때문입니다.</p>

      <h2>탐욕이 통하는 조건</h2>
      <p>교환 논증이 보여 주는 것을 일반적으로 말하면, 탐욕 알고리즘이 정답이 되려면 두 가지가 필요합니다.</p>
      <ul>
        <li>
          <T en="greedy-choice property">탐욕 선택 속성</T>: 지금 하는 탐욕 선택을 포함하는 최적 해가 존재한다. 회의실 문제의 1~3단계가 이것을 보였습니다.
        </li>
        <li>
          <T en="optimal substructure">최적 부분 구조</T>: 그 선택을 하고 남은 문제의 최적 해에 선택을 더하면 전체의 최적 해가 된다. 4단계가 이것입니다.
        </li>
      </ul>
      <p>
        최적 부분 구조는 동적 계획법에도 필요한 조건입니다. 차이는 선택하는 방식에 있습니다. DP는 "마지막에 무엇을 했나"의 모든 경우를 따져 가장 좋은 것을 고르고, 탐욕은 증명된 한 가지 선택만 하고 나머지는 보지 않습니다. 그래서 탐욕이 통하는 문제에서는 탐욕이 훨씬 빠르고, 통하지 않는 문제에서는 DP처럼 모든 경우를 따져야 합니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>문제</th>
              <th>탐욕 기준</th>
              <th>최적?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>거스름돈 (한국 동전)</td>
              <td>큰 동전부터</td>
              <td>예</td>
            </tr>
            <tr>
              <td>거스름돈 (1·3·4원)</td>
              <td>큰 동전부터</td>
              <td>아니요 → DP</td>
            </tr>
            <tr>
              <td>회의실 배정</td>
              <td>빨리 끝나는 것부터</td>
              <td>예</td>
            </tr>
            <tr>
              <td>쪼갤 수 있는 배낭</td>
              <td>무게당 가치가 큰 것부터</td>
              <td>예</td>
            </tr>
            <tr>
              <td>0/1 배낭</td>
              <td>무게당 가치가 큰 것부터</td>
              <td>아니요 → DP</td>
            </tr>
            <tr>
              <td>최단 경로 (음수 간선 없음)</td>
              <td>지금까지 비용이 가장 작은 노드부터</td>
              <td>예 (다익스트라)</td>
            </tr>
            <tr>
              <td>최소 신장 트리</td>
              <td>가장 싼 간선부터</td>
              <td>예 (크루스칼)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <a href="#cs-algorithms/graph-search">기초 알고리즘의 다익스트라 알고리즘</a>도 탐욕입니다. 아직 확정하지 않은 노드 중 지금까지의 비용이 가장 작은 것을 골라 확정하고 돌아보지 않습니다. 간선 비용이 음수가 아니면 나중에 더 싼 길이 나타날 수 없다는 것이 이 선택을 정당화합니다. 모든 점을 가장 싸게 잇는 크루스칼 알고리즘은 <a href="#cs-algorithm-design/union-find-mst">다음 장</a>에서 봅니다.
      </p>

      <h2>허프만 부호화</h2>
      <p>
        탐욕이 빛나는 또 하나의 예는 데이터 압축입니다. 컴퓨터는 글자를 비트로 저장합니다. 영문 ASCII는 글자마다 8비트를 쓰고, 한글은 UTF-8에서 음절 하나에 24비트(3바이트)를 씁니다. 글자 종류가 k개뿐이라면 글자마다 <M>{'\\lceil \\log_2 k \\rceil'}</M>비트의 고정 길이 부호로 충분합니다. 그런데 자주 나오는 글자에 짧은 부호를, 드문 글자에 긴 부호를 주면 더 줄일 수 있습니다.
      </p>
      <p>
        길이가 제각각인 부호에는 함정이 있습니다. a = 0, b = 01이라면 "01"이 b인지 a 다음의 무엇인지 알 수 없습니다. 그래서 <strong>어떤 부호도 다른 부호의 앞부분이 되지 않게</strong> 만듭니다. 이런 부호를 <T en="prefix code">접두사 부호</T>라고 하며, 글자를 이진 트리의 잎에만 두고 뿌리에서 잎까지의 길(왼쪽 0, 오른쪽 1)을 부호로 쓰면 저절로 이 조건이 지켜집니다.
      </p>
      <p>
        남은 질문은 어떤 트리가 전체 비트 수를 가장 작게 하느냐입니다. 1952년 데이비드 허프만이 낸 답은 탐욕입니다. <strong>가장 드문 두 글자는 트리의 가장 깊은 곳에 형제로 있어도 손해가 없다</strong>(교환 논증으로 보일 수 있습니다). 그러니 횟수가 가장 작은 두 개를 하나로 합치고, 합친 것을 횟수의 합을 가진 새 글자처럼 취급해 같은 일을 반복합니다. "가장 작은 두 개 꺼내기"와 "합친 것 다시 넣기"를 반복하므로 <a href="#cs-algorithms/stack-queue-heap">최소 힙</a>이 딱 맞는 자료구조입니다.
      </p>
      <HuffmanFigure />
      <p>
        abracadabra는 11글자에 글자 종류가 5개입니다. 고정 길이라면 글자마다 3비트씩 33비트가 필요하지만, 허프만 부호로는 23비트면 됩니다. 절반 가까이를 차지하는 a에 1비트짜리 부호가 돌아가기 때문입니다. 반대로 "가나다라"처럼 모든 글자가 한 번씩만 나오면 허프만도 21비트를 20비트로 줄이는 데 그칩니다. 압축은 글자 빈도가 고르지 않을 때 효과가 큽니다.
      </p>
      <Code label="허프만 부호 만들기">{`
function huffmanCodes(text) {
  const freq = new Map();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);

  // 우선순위 큐. 여기서는 간단히 무게 순으로 정렬된 배열을 쓴다.
  // 글자 종류가 많으면 앞 과목의 MinHeap처럼 힙을 쓰는 것이 좋다.
  const pq = [...freq].map(([ch, w]) => ({ ch, w }));
  pq.sort((a, b) => a.w - b.w);

  while (pq.length > 1) {
    const a = pq.shift(), b = pq.shift();          // 가장 가벼운 두 개
    const node = { w: a.w + b.w, left: a, right: b };
    let i = 0;
    while (i < pq.length && pq[i].w <= node.w) i++;
    pq.splice(i, 0, node);                         // 무게 순서를 지키며 넣기
  }

  const codes = {};
  const walk = (node, code) => {
    if (node.ch !== undefined) codes[node.ch] = code || '0';  // 글자가 한 종류뿐이면 '0'
    else {
      walk(node.left, code + '0');
      walk(node.right, code + '1');
    }
  };
  if (pq.length) walk(pq[0], '');
  return codes;
}`}</Code>
      <p>
        글자 종류가 k개면 합치기를 k − 1번 하고, 힙을 쓰면 한 번에 <M>{'O(\\log k)'}</M>이므로 전체는 <M>{'O(k \\log k)'}</M>입니다. 실제로 쓰려면 받는 쪽도 같은 트리를 알아야 하므로 부호표나 글자별 빈도를 압축한 데이터와 함께 보냅니다. 허프만 부호화는 ZIP과 gzip, PNG가 쓰는 DEFLATE 압축, 그리고 JPEG와 MP3의 마지막 단계에 들어 있습니다.
      </p>

      <Callout kind="key">
        탐욕 알고리즘은 매 단계에서 당장 가장 좋아 보이는 선택을 하고 되돌아보지 않습니다. 빠르고 단순하지만, 그 선택을 포함하는 최적 해가 있다는 것(탐욕 선택 속성)과 남은 문제도 같은 방식으로 풀린다는 것(최적 부분 구조)이 증명될 때만 정답입니다. 증명은 보통 교환 논증으로 하고, 반례가 하나라도 있으면 동적 계획법처럼 모든 경우를 따지는 방법으로 돌아가야 합니다.
      </Callout>
      <Quiz
        q="동전이 1원, 5원, 6원, 9원일 때 11원을 거슬러 주려 한다. 큰 동전부터 내는 탐욕은 동전을 몇 개 쓰고, 최소 개수는 몇 개인가?"
        options={['탐욕 3개, 최소도 3개', '탐욕 3개, 최소 2개', '탐욕 2개, 최소도 2개', '탐욕 4개, 최소 3개']}
        answer={1}
        explain={<>탐욕은 9원을 먼저 내고 남은 2원을 1원 두 개로 채워 9 + 1 + 1, 3개를 씁니다. 하지만 5 + 6이면 2개로 충분합니다. 동전 하나로는 11원을 만들 수 없으니 2개가 최소입니다. 9원을 먼저 집는 "당장 최선"의 선택이 전체로는 손해였던 것입니다. 그림 1에서 "직접"을 고르고 이 동전들로 반례를 찾으면, 11원이 가장 작은 반례로 나옵니다.</>}
      />
    </>
  );
}
