import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import { humanTime } from '../../../cs/shared';
import { useMathColors } from './parts';
import { choose, factorial, sci } from './numbers';
import './discrete.css';

/* ─────────────── Figure 1: how many passwords? ─────────────── */

const CHARSETS = [
  { id: 'lower', label: '소문자 a–z', n: 26 },
  { id: 'upper', label: '대문자 A–Z', n: 26 },
  { id: 'digit', label: '숫자 0–9', n: 10 },
  { id: 'symbol', label: '특수문자 !@#…', n: 33 },
];
type Attack = 'online' | 'slow' | 'fast';
const ATTACKS: Record<Attack, { label: string; rate: number; note: string }> = {
  online: { label: '로그인 창', rate: 10, note: '서버가 로그인 시도를 초당 10번 정도로 제한할 때' },
  slow: { label: '느린 해시', rate: 1e4, note: '유출된 비밀번호 해시를 bcrypt처럼 일부러 느린 함수로 저장했을 때' },
  fast: { label: '빠른 해시', rate: 1e11, note: '유출된 해시가 MD5처럼 빠른 함수라 GPU로 초당 천억 번 시도할 때' },
};
const YEAR = 365 * 86400;

function PasswordFigure() {
  const [on, setOn] = useState<Record<string, boolean>>({ lower: true, upper: false, digit: true, symbol: false });
  const [len, setLen] = useState(8);
  const [attack, setAttack] = useState<Attack>('fast');
  const k = CHARSETS.reduce((a, c) => a + (on[c.id] ? c.n : 0), 0);
  const lg = k > 0 ? len * Math.log10(k) : 0;
  const rate = ATTACKS[attack].rate;
  const secs = k > 0 ? Math.pow(10, lg - Math.log10(rate)) : 0;
  const yearLine = Math.log10(rate * YEAR);
  const lens = Array.from({ length: 17 }, (_, i) => i + 4);
  const top = Math.max(40, ...lens.map((L) => (k > 0 ? L * Math.log10(k) : 0)));

  return (
    <Figure
      no={1}
      title="비밀번호는 몇 개나 만들 수 있나"
      hint="문자 종류와 길이를 바꿔 보세요"
      caption={<>문자 종류가 k가지이고 길이가 n이면 자리마다 k가지를 고를 수 있으므로 비밀번호는 kⁿ개입니다(곱의 법칙). 쓸 수 있는 문자 수 k는 서로 겹치지 않는 문자 묶음의 크기를 더한 것입니다(합의 법칙). 막대는 길이별 경우의 수를 로그 눈금으로 그린 것이고, 점선은 공격자가 1년 동안 시도할 수 있는 개수입니다. 점선보다 높은 막대만 1년을 버팁니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="dm-bars" role="img" aria-label={`길이 4부터 20까지 비밀번호 경우의 수 막대그래프, 문자 ${k}종류`}>
            <span className="dm-bars-line" style={{ bottom: `${(Math.min(yearLine, top) / top) * 100}%` }}>
              <span>1년 동안 시도할 수 있는 개수 ({sci(yearLine)})</span>
            </span>
            {lens.map((L) => {
              const v = k > 0 ? L * Math.log10(k) : 0;
              return (
                <span key={L} className="dm-bar" data-cur={L === len || undefined} data-safe={v > yearLine || undefined} style={{ height: `${(v / top) * 100}%` }}>
                  <span className="lbl">{L}</span>
                </span>
              );
            })}
          </div>
          <div className="dm-bars-axis">길이 n →</div>
        </div>
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>쓸 수 있는 문자</span>
              <span className="val">k = {k}</span>
            </span>
            {CHARSETS.map((c) => (
              <Check key={c.id} label={`${c.label} (${c.n})`} checked={on[c.id]} onChange={(v) => setOn({ ...on, [c.id]: v })} />
            ))}
          </div>
          <Slider id="pw-len" label="길이 n" value={len} min={1} max={20} step={1} onChange={setLen} />
          <Seg label="공격 속도" value={attack} onChange={setAttack} options={(Object.keys(ATTACKS) as Attack[]).map((a) => ({ value: a, label: ATTACKS[a].label }))} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr' }}>
            <Readout label={`경우의 수 ${k}^${len}`} value={k > 0 ? (lg < 7 ? Math.round(Math.pow(10, lg)).toLocaleString('ko-KR') : sci(lg)) : '0'} />
            <Readout label="모두 시도하는 데 걸리는 시간" value={k > 0 ? humanTime(secs) : '–'} color={secs > YEAR ? 'var(--good)' : 'var(--bad)'} />
          </div>
          <div className="dm-note">{ATTACKS[attack].note}.</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: permutations versus combinations ─────────────── */

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const TOKEN_COLORS = ['var(--c-math-1)', 'var(--c-math-2)', 'var(--c-math-3)', 'var(--good)', 'var(--neg)'];

function combos(n: number, r: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, cur: number[]) => {
    if (cur.length === r) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}
function perms(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs.slice()];
  return xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

function Word({ w }: { w: number[] }) {
  return (
    <span className="dm-word">
      {w.map((i, k) => (
        <span key={k} style={{ background: TOKEN_COLORS[i] }}>
          {LETTERS[i]}
        </span>
      ))}
    </span>
  );
}

function PermCombFigure() {
  const [n, setN] = useState(4);
  const [r, setR] = useState(2);
  const [view, setView] = useState<'perm' | 'comb'>('perm');
  const rr = Math.min(r, n);
  const groups = useMemo(() => combos(n, rr).map((c) => ({ c, ps: perms(c) })), [n, rr]);
  const P = factorial(n) / factorial(n - rr);
  const C = choose(n, rr);

  return (
    <Figure
      no={2}
      title="순서가 있을 때와 없을 때"
      hint="n과 r을 바꾸고 보기를 전환해 보세요"
      caption={<>n개의 글자에서 r개를 뽑아 줄 세운 것이 순열, 뽑기만 한 것이 조합입니다. 한 줄이 조합 하나이고, 그 줄의 칸들이 같은 글자로 만든 서로 다른 순서입니다. 줄마다 순서가 r!개씩 있으므로 순열의 수는 조합의 수에 r!을 곱한 것입니다.</>}
    >
      <div className="controls row">
        <Slider id="pc-n" label="글자 수 n" value={n} min={2} max={5} step={1} onChange={(v) => { setN(v); if (r > v) setR(v); }} />
        <Slider id="pc-r" label="뽑는 수 r" value={rr} min={1} max={n} step={1} onChange={setR} />
        <Seg label="보기" value={view} onChange={setView} options={[{ value: 'perm', label: '순열 (순서 있음)' }, { value: 'comb', label: '조합 (순서 없음)' }]} />
      </div>
      <div className="dm-groups" aria-label={view === 'perm' ? `순열 ${P}개` : `조합 ${C}개`}>
        {groups.map((g, i) => (
          <div key={i} className="dm-group">
            <span className="dm-group-set mono">{'{' + g.c.map((x) => LETTERS[x]).join(',') + '}'}</span>
            <span className="dm-group-items">
              {view === 'perm' ? g.ps.map((p, k) => <Word key={k} w={p} />) : <Word w={g.c} />}
              {view === 'comb' && g.ps.length > 1 && <span className="dm-group-more">← 순서 {g.ps.length}가지가 하나로</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <Readout label={`순열 P(${n}, ${rr}) = ${n}!/${n - rr}!`} value={P} color={view === 'perm' ? 'var(--c-math-3)' : undefined} />
        <Readout label={`한 묶음의 순서 ${rr}!`} value={factorial(rr)} />
        <Readout label={`조합 C(${n}, ${rr}) = P/${rr}!`} value={C} color={view === 'comb' ? 'var(--c-math-3)' : undefined} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: the birthday paradox ─────────────── */

const DAYS = 365;
const KMAX = 80;
const birthdayP = (k: number) => {
  let q = 1;
  for (let i = 0; i < k; i++) q *= (DAYS - i) / DAYS;
  return 1 - q;
};
const TRIALS = 200;

function BirthdayFigure() {
  const P = usePalette();
  const [c1, c2] = useMathColors(P);
  const [k, setK] = useState(23);
  const [runs, setRuns] = useState<{ k: number; frac: number }[]>([]);
  const [seed, setSeed] = useState(1);
  const room = useMemo(() => {
    const r = rng(seed * 7919 + k);
    return Array.from({ length: k }, () => Math.floor(r() * DAYS));
  }, [k, seed]);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    room.forEach((d) => m.set(d, (m.get(d) ?? 0) + 1));
    return m;
  }, [room]);
  const shared = [...counts.values()].filter((c) => c > 1).length;
  const p = birthdayP(k);
  const last = runs.filter((x) => x.k === k).slice(-1)[0];

  const experiment = () => {
    const r = rng(seed * 104729 + k * 31);
    let hit = 0;
    for (let t = 0; t < TRIALS; t++) {
      const seen = new Set<number>();
      for (let i = 0; i < k; i++) {
        const d = Math.floor(r() * DAYS);
        if (seen.has(d)) {
          hit++;
          break;
        }
        seen.add(d);
      }
    }
    setRuns((xs) => [...xs.slice(-30), { k, frac: hit / TRIALS }]);
    setSeed((s) => s + 1);
  };

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const stripH = 54;
      const plot = new Plot(ctx, w, h - stripH, P, { xMin: 0, xMax: KMAX, yMin: 0, yMax: 1, pad: { l: 40, r: 14, t: 12, b: 28 } });
      plot.grid({ xStep: 10, yStep: 0.25, xLabel: '사람 수 k', fmt: (v) => (v <= 1 && v > 0 && v !== Math.round(v) ? `${Math.round(v * 100)}%` : v === 1 ? '100%' : String(v)) });
      plot.line(0, 0.5, KMAX, 0.5, alpha(P.ink, 0.35), 1, [4, 4]);
      ctx.strokeStyle = c2;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let x = 1; x <= KMAX; x++) {
        const y = birthdayP(x);
        if (x === 1) ctx.moveTo(plot.X(x), plot.Y(y));
        else ctx.lineTo(plot.X(x), plot.Y(y));
      }
      ctx.stroke();
      for (const run of runs) plot.dot(run.k, run.frac, 4, alpha(c1, 0.85), P.surface, 1.2);
      plot.line(k, 0, k, 1, alpha(P.ink, 0.25), 1);
      plot.dot(k, p, 6, c2, P.surface, 2);

      // one sample room as a strip of 365 days
      const y0 = h - stripH + 18;
      const x0 = 40;
      const x1 = w - 14;
      const dx = (x1 - x0) / DAYS;
      ctx.fillStyle = P.surface2;
      ctx.fillRect(x0, y0, x1 - x0, 20);
      for (const [d, c] of counts) {
        ctx.fillStyle = c > 1 ? P.bad : alpha(P.ink, 0.55);
        ctx.fillRect(x0 + d * dx, y0, Math.max(1.5, dx), 20);
        if (c > 1) {
          ctx.beginPath();
          ctx.arc(x0 + (d + 0.5) * dx, y0 - 6, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('1월 1일', x0, y0 + 23);
      ctx.textAlign = 'right';
      ctx.fillText('12월 31일', x1, y0 + 23);
      ctx.textAlign = 'center';
      ctx.fillText(`한 방의 ${k}명: 생일이 겹친 날 ${shared}개`, (x0 + x1) / 2, y0 + 23);
    },
    [P, c1, c2, k, p, runs, counts, shared],
    { aspect: 1.9, maxHeight: 380, minHeight: 280 },
  );

  return (
    <Figure
      no={3}
      title="생일 역설: 공식과 실험"
      hint="사람 수를 바꾸고 실험을 돌려 보세요"
      caption={<>곡선은 k명 중 생일이 같은 두 사람이 있을 확률을 공식으로 계산한 것이고, 점은 k명짜리 방을 {TRIALS}번 무작위로 만들어 실제로 센 비율입니다. 아래 띠는 1년 365일이고, 한 방의 생일이 찍혀 있습니다. 빨간 점이 찍힌 날은 두 명 이상이 같은 생일입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box" role="img" aria-label={`생일 역설 그래프: ${k}명일 때 생일이 겹칠 확률 ${(p * 100).toFixed(1)}%. ${last ? `실험 결과 ${(last.frac * 100).toFixed(0)}%.` : ''}`}>
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="bd-k" label="사람 수 k" value={k} min={2} max={KMAX} step={1} onChange={setK} />
          <div className="btn-row">
            <Button small primary onClick={experiment}>
              방 {TRIALS}개로 실험
            </Button>
            <Button small onClick={() => setSeed((s) => s + 1)}>
              다른 방 보기
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="공식" value={`${(p * 100).toFixed(1)}%`} color="var(--c-math-2)" />
            <Readout label="실험" value={last ? `${(last.frac * 100).toFixed(0)}%` : '–'} color="var(--c-math-1)" />
            <Readout label={`두 사람 짝 C(${k}, 2)`} value={`${choose(k, 2)}쌍`} />
            <Readout label="이 방의 겹친 날" value={`${shared}개`} />
          </div>
          <Legend
            items={[
              { color: 'var(--c-math-2)', label: '공식', shape: 'ln' },
              { color: 'var(--c-math-1)', label: `실험 (${TRIALS}번)` },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: pigeonholes and hash buckets ─────────────── */

function PigeonFigure() {
  const [n, setN] = useState(13);
  const [m, setM] = useState(6);
  const [mode, setMode] = useState<'rand' | 'even'>('rand');
  const [seed, setSeed] = useState(1);
  const buckets = useMemo(() => {
    const r = rng(seed * 131 + 7);
    const b: number[][] = Array.from({ length: m }, () => []);
    for (let i = 0; i < n; i++) b[mode === 'even' ? i % m : Math.floor(r() * m)].push(i);
    return b;
  }, [n, m, mode, seed]);
  const max = Math.max(...buckets.map((b) => b.length));
  const bound = Math.ceil(n / m);

  return (
    <Figure
      no={4}
      title="비둘기집 원리: 해시 버킷"
      hint="키와 버킷 수를 바꾸고, 해시 함수를 바꿔 보세요"
      caption={<>키 n개를 버킷 m개에 나눠 담습니다. 어떤 해시 함수를 쓰든 가장 꽉 찬 버킷에는 적어도 ⌈n/m⌉개가 들어갑니다. "가장 고르게"를 고르면 그 하한이 정확히 맞아떨어지는 것을, "다른 해시 함수"를 눌러 보면 무작위 배정은 보통 그보다 더 몰린다는 것을 볼 수 있습니다.</>}
    >
      <div className="controls row">
        <Slider id="ph-n" label="키 n" value={n} min={1} max={40} step={1} onChange={setN} />
        <Slider id="ph-m" label="버킷 m" value={m} min={2} max={12} step={1} onChange={setM} />
        <Seg label="배정" value={mode} onChange={setMode} options={[{ value: 'rand', label: '무작위 해시' }, { value: 'even', label: '가장 고르게' }]} />
      </div>
      <div className="dm-buckets" role="img" aria-label={`버킷 ${m}개에 키 ${n}개: 가장 많이 든 버킷 ${max}개, 보장되는 최소 ${bound}개`}>
        {buckets.map((b, i) => (
          <div key={i} className="dm-bucket" data-max={b.length === max && max > 1 ? '' : undefined}>
            <div className="dm-bucket-stack">
              {b.map((key) => (
                <span key={key} className="dm-pigeon" />
              ))}
            </div>
            <span className="dm-bucket-no mono">{i}</span>
          </div>
        ))}
      </div>
      <div className="controls row">
        <div className="readouts dm-readouts-text" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', flex: '1 1 400px' }}>
          <Readout label="가장 꽉 찬 버킷" value={`${max}개`} color="var(--c-math-3)" />
          <Readout label="보장되는 최소 ⌈n/m⌉" value={`${bound}개`} />
          <Readout label="충돌" value={n > m ? '반드시 (n > m)' : max > 1 ? '있음 (운이 나쁨)' : '없음'} color={n > m ? 'var(--bad)' : undefined} />
        </div>
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Button small onClick={() => setSeed((s) => s + 1)} disabled={mode === 'even'}>
            다른 해시 함수
          </Button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Counting() {
  return (
    <>
      <h2>세는 것이 왜 어려운가</h2>
      <p>
        경우의 수를 세는 일은 단순해 보이지만, 빠뜨리거나 두 번 세기 쉽습니다. 알고리즘이 몇 번 반복하는지, 비밀번호가 얼마나 안전한지, 해시 충돌이 얼마나 자주 나는지 모두 세는 문제입니다. 이 장에서는 빠짐없이, 겹치지 않게 세는 기본 규칙 몇 가지를 익힙니다. 기호 <M>{'|A|'}</M>는 3장에서처럼 집합 A의 원소 개수입니다.
      </p>

      <h2>곱의 법칙과 합의 법칙</h2>
      <p>
        <T en="product rule">곱의 법칙</T>: 일을 두 단계로 나눠서, 첫 단계를 m가지로, 그 각각에 대해 둘째 단계를 n가지로 할 수 있으면 전체는 <M>{'m \\times n'}</M>가지입니다. 셔츠 3벌과 바지 4벌이면 차림은 12가지입니다. 집합으로 쓰면 <M>{'|A \\times B| = |A| \\cdot |B|'}</M>입니다.
      </p>
      <p>
        <T en="sum rule">합의 법칙</T>: 일을 하는 방법이 서로 겹치지 않는 두 무리로 나뉘고, 각 무리에 m가지와 n가지가 있으면 전체는 <M>{'m + n'}</M>가지입니다. 집합으로 쓰면 A와 B가 겹치지 않을 때 <M>{'|A \\cup B| = |A| + |B|'}</M>입니다.
      </p>
      <PasswordFigure />
      <p>
        그림 1에서 특수문자를 켜서 k를 62에서 95로 늘리는 것보다, 길이를 8에서 12로 늘리는 쪽이 경우의 수를 훨씬 크게 키웁니다. k는 밑이고 n은 지수이기 때문입니다. 길이가 6~8자 중 아무것이어도 되는 규칙이라면 합의 법칙으로 <M>{'k^6 + k^7 + k^8'}</M>가지이고, 가장 긴 쪽이 거의 전부를 차지합니다.
      </p>
      <Callout kind="note">
        이 계산은 공격자가 모든 조합을 똑같이 시도해야 할 때의 이야기입니다. 실제 비밀번호는 사람이 고르므로 "password1"이나 생일처럼 흔한 것부터 시도하는 사전 공격에 훨씬 빨리 뚫립니다. 경우의 수는 상한일 뿐이고, 무작위로 고른 비밀번호만 그 상한을 누립니다. 비밀번호 해시를 왜 일부러 느린 함수로 만드는지는 <a href={lessonHref('net-security', 'symmetric')}>대칭 암호와 해시</a>에서 이어집니다.
      </Callout>

      <h2>순열과 조합</h2>
      <p>
        서로 다른 n개에서 r개를 골라 <strong>줄 세우는</strong> 방법의 수를 <T en="permutation">순열</T>이라고 합니다. 첫 자리에 n가지, 둘째 자리에 남은 n − 1가지, …, r번째 자리에 n − r + 1가지가 오므로 곱의 법칙으로 셉니다. 1부터 n까지의 곱 <M>{'n!'}</M>(n 팩토리얼)을 쓰면 짧게 적을 수 있습니다.
      </p>
      <MB note="0! = 1로 약속합니다. 아무것도 늘어놓지 않는 방법은 한 가지이기 때문입니다.">{'P(n, r) = n(n-1)\\cdots(n-r+1) = \\frac{n!}{(n-r)!}'}</MB>
      <p>
        순서는 상관없이 r개를 <strong>고르기만</strong> 하는 방법의 수가 <T en="combination">조합</T>입니다. 뽑은 r개를 늘어놓는 방법이 <M>{'r!'}</M>가지씩 있으므로, 순열을 <M>{'r!'}</M>로 나누면 됩니다. 이처럼 "같은 것을 몇 번씩 셌는지 알면 나눠서 바로잡는다"는 생각을 나눗셈 법칙이라고도 합니다.
      </p>
      <MB note="'n개 중 r개'라고 읽고, 이항계수라고도 부릅니다.">{'C(n, r) = \\binom{n}{r} = \\frac{P(n, r)}{r!} = \\frac{n!}{r!\\,(n-r)!}'}</MB>
      <PermCombFigure />
      <p>
        그림 2에서 n = 5, r = 3이면 순열은 60개, 조합은 10개입니다. 경주에서 1·2·3등을 정하는 것은 순열이고, 세 명을 대표로 뽑는 것은 조합입니다. 로또 6/45의 당첨 번호 조합은 <M>{'\\binom{45}{6} = 8{,}145{,}060'}</M>가지입니다.
      </p>
      <Code label="순열과 조합을 세는 함수">{`
function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

// n개 중 r개를 줄 세우기: n × (n-1) × ... × (n-r+1)
const perm = (n, r) => factorial(n) / factorial(n - r);

// n개 중 r개 고르기. 큰 팩토리얼을 만들지 않도록 곱하면서 바로 나눈다
function choose(n, r) {
  let c = 1;
  for (let i = 1; i <= r; i++) c = (c * (n - r + i)) / i; // 매 단계 정수
  return c;
}

choose(45, 6); // 8145060`}</Code>

      <h2>포함·배제의 원리</h2>
      <p>
        합의 법칙은 무리가 겹치지 않을 때만 씁니다. 겹치면 겹친 부분을 두 번 세게 되므로 한 번 빼야 합니다. 3장의 벤 다이어그램에서 본 식입니다. 세 집합이면 둘씩 겹친 부분을 빼고 나서, 셋 모두 겹친 부분이 너무 많이 빠졌으므로 다시 더합니다. 이것을 <T en="inclusion–exclusion principle">포함·배제의 원리</T>라고 합니다.
      </p>
      <MB note="더하고, 빼고, 더하고: 겹치는 집합의 개수가 홀수면 더하고 짝수면 뺍니다.">{'|A \\cup B \\cup C| = |A| + |B| + |C| - |A \\cap B| - |A \\cap C| - |B \\cap C| + |A \\cap B \\cap C|'}</MB>
      <p>
        예를 들어 1부터 100까지 중 2, 3, 5 중 하나로라도 나누어떨어지는 수는 몇 개일까요? 2의 배수 50개, 3의 배수 33개, 5의 배수 20개를 더하고, 6의 배수 16개, 10의 배수 10개, 15의 배수 6개를 빼고, 30의 배수 3개를 다시 더하면 <M>{'50 + 33 + 20 - 16 - 10 - 6 + 3 = 74'}</M>개입니다. 나머지 26개는 2, 3, 5와 모두 서로소인 수입니다.
      </p>

      <h2>생일 역설</h2>
      <p>
        한 반에 몇 명이 있으면 생일이 같은 두 사람이 있을 확률이 절반을 넘을까요? 많은 사람이 183명쯤을 떠올리지만 답은 23명입니다. 직접 세기보다 반대 사건, 즉 "모두 생일이 다를" 경우를 세는 편이 쉽습니다. 첫 사람은 365일 중 아무 날, 둘째는 남은 364일, …이므로 곱의 법칙으로 셉니다.
      </p>
      <MB note="k = 23이면 약 0.507. 사람 수가 아니라 두 사람 짝의 수 C(k, 2)가 빠르게 늘어나는 것이 핵심입니다.">{'P(\\text{겹침}) = 1 - \\frac{365 \\cdot 364 \\cdots (365 - k + 1)}{365^k}'}</MB>
      <BirthdayFigure />
      <p>
        23명이면 두 사람 짝이 <M>{'\\binom{23}{2} = 253'}</M>쌍이나 됩니다. 짝마다 겹칠 확률은 1/365로 작지만, 짝이 253개면 하나쯤 겹치는 것이 이상하지 않습니다. 일반적으로 m칸에 무작위로 넣으면 약 <M>{'1.2\\sqrt{m}'}</M>개를 넣을 때 충돌 확률이 절반이 됩니다. 해시 테이블에서 충돌이 생각보다 일찍 나는 이유이고, 해시값이 n비트인 해시 함수의 충돌을 찾는 데 <M>{'2^{n}'}</M>번이 아니라 약 <M>{'2^{n/2}'}</M>번이면 되는 <T en="birthday attack">생일 공격</T>의 원리입니다. 확률을 더 다루려면 <a href={lessonHref('ai-basics', 'probability')}>확률과 분포</a>를 보세요.
      </p>

      <h2>비둘기집 원리</h2>
      <p>
        <T en="pigeonhole principle">비둘기집 원리</T>는 수학에서 가장 단순해 보이는 원리입니다. 비둘기 n마리가 비둘기집 m개에 들어가는데 <M>{'n > m'}</M>이면, 두 마리 이상 들어간 집이 반드시 있습니다. 더 일반적으로는 어떤 집에 적어도 <M>{'\\lceil n/m \\rceil'}</M>마리가 들어갑니다. <M>{'\\lceil x \\rceil'}</M>은 x보다 작지 않은 가장 작은 정수(올림)입니다.
      </p>
      <p>
        증명은 귀류법 한 줄입니다. 모든 집에 <M>{'\\lceil n/m \\rceil - 1'}</M>마리 이하가 들어갔다면 전체는 <M>{'m(\\lceil n/m \\rceil - 1) < m \\cdot (n/m) = n'}</M>마리 미만이어서 n마리라는 데 모순입니다.
      </p>
      <PigeonFigure />
      <p>
        그림 4에서 키 13개를 버킷 6개에 넣으면, 해시 함수를 아무리 바꿔도 3개 이상 든 버킷이 꼭 생깁니다. 이 원리는 놀랄 만큼 많은 곳에서 불가능을 증명합니다. 어떤 무손실 압축 프로그램도 모든 파일을 줄일 수는 없습니다. n비트 파일은 <M>{'2^n'}</M>개인데 그보다 짧은 파일은 모두 합쳐 <M>{'2^n - 1'}</M>개뿐이라, 서로 다른 두 파일이 같은 압축 결과로 가야 하기 때문입니다. 계산 이론에서는 상태가 유한한 기계가 긴 입력을 읽으면 어떤 상태를 두 번 방문한다는 사실로 그 기계가 인식할 수 없는 언어를 찾아냅니다(<a href={lessonHref('cs-computation', 'finite-automata')}>유한 오토마타</a>).
      </p>
      <Callout kind="intuition">
        비둘기집 원리는 어느 집이 꽉 찼는지는 알려 주지 않고, 그런 집이 <em>있다</em>는 것만 말합니다. 그래서 존재를 보이는 증명에 강합니다. "서울에 머리카락 수가 같은 두 사람이 있다"도 이 원리로 증명됩니다. 사람의 머리카락은 많아야 수십만 가닥이고, 서울 인구는 그보다 훨씬 많습니다.
      </Callout>

      <Callout kind="key">
        곱의 법칙은 단계를 이어 붙일 때 곱하고, 합의 법칙은 겹치지 않는 무리를 더합니다. 겹치면 포함·배제로 바로잡습니다. 순서가 있으면 순열 n!/(n−r)!, 없으면 조합 n!/(r!(n−r)!)입니다. 생일 역설은 짝의 수가 사람 수의 제곱으로 늘기 때문에 생기고, 비둘기집 원리는 n &gt; m이면 충돌이 반드시 있음을 보장합니다.
      </Callout>
      <Quiz
        q={<>해시 함수가 32비트 값을 낸다. 서로 다른 입력을 무작위로 넣을 때, 충돌이 생길 확률이 절반쯤 되는 입력 개수는 대략 얼마인가?</>}
        options={['약 32개', '약 7만 7천 개 (2¹⁶ 남짓)', '약 21억 개 (2³¹)', '약 43억 개 (2³²)']}
        answer={1}
        explain={<>칸이 m = 2³²개일 때 충돌 확률이 절반이 되는 개수는 약 1.2√m = 1.2 × 2¹⁶ ≈ 7만 7천 개입니다. 생일 역설에서 365칸에 23명이면 충분했던 것과 같은 원리입니다. 그래서 충돌에 강해야 하는 암호 해시는 출력이 256비트처럼 넉넉합니다.</>}
      />
    </>
  );
}
