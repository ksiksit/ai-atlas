import { useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, M, MB, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot, fmt } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { rng } from '../../../../lib/math';
import { StepControls, useStepper } from '../../shared';
import './algorithms.css';

/* ─────────────── Figure 1: binary search ─────────────── */

const N1 = 24;

/** 24 distinct sorted numbers between 1 and 99. */
function sortedValues(seed: number): number[] {
  const r = rng(seed);
  const set = new Set<number>();
  while (set.size < N1) set.add(1 + Math.floor(r() * 99));
  return [...set].sort((a, b) => a - b);
}

interface BStep {
  lo: number;
  hi: number;
  mid: number | null;
  found: number | null;
  end: boolean;
  cmp: number;
  note: string;
}

function binarySteps(a: number[], x: number): BStep[] {
  const out: BStep[] = [];
  let lo = 0;
  let hi = a.length - 1;
  let cmp = 0;
  out.push({ lo, hi, mid: null, found: null, end: false, cmp, note: `${x}을(를) 0~${hi}번 칸에서 찾기 시작` });
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    cmp++;
    if (a[mid] === x) {
      out.push({ lo, hi, mid, found: mid, end: true, cmp, note: `가운데 ${mid}번 칸의 ${a[mid]} = ${x} → 찾았습니다` });
      return out;
    }
    const goRight = a[mid] < x;
    out.push({ lo, hi, mid, found: null, end: false, cmp, note: `가운데 ${mid}번 칸의 ${a[mid]} ${goRight ? '<' : '>'} ${x} → ${goRight ? '오른쪽' : '왼쪽'} 절반만 남김` });
    if (goRight) lo = mid + 1;
    else hi = mid - 1;
  }
  out.push({ lo, hi, mid: null, found: null, end: true, cmp, note: `남은 칸이 없습니다 → ${x}은(는) 배열에 없습니다` });
  return out;
}

function BinarySearchFigure() {
  const P = usePalette();
  const [seed, setSeed] = useState(12);
  const a = useMemo(() => sortedValues(seed), [seed]);
  const [x, setX] = useState(() => sortedValues(12)[17]);
  const steps = useMemo(() => binarySteps(a, x), [a, x]);
  const s = useStepper(steps.length, 2, `${seed}|${x}`);
  const st = steps[s.i];
  const idx = a.indexOf(x);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const cols = 12;
      const cw = (w - 8) / cols;
      const ch = 40;
      for (let i = 0; i < N1; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x0 = 4 + col * cw;
        const y0 = 6 + row * (ch + 22);
        const inRange = i >= st.lo && i <= st.hi && !st.end;
        const isMid = st.mid === i;
        ctx.fillStyle = st.found === i ? alpha(P.good, 0.85) : isMid ? alpha(P.hl, 0.9) : inRange ? P.surface : P.surface2;
        ctx.fillRect(x0 + 1, y0, cw - 2, ch);
        ctx.strokeStyle = isMid || st.found === i ? P.ink : inRange ? P.lineStrong : P.line;
        ctx.lineWidth = isMid ? 2 : 1;
        ctx.strokeRect(x0 + 1.5, y0 + 0.5, cw - 3, ch - 1);
        ctx.fillStyle = inRange || isMid || st.found === i ? P.ink : alpha(P.ink3, 0.6);
        ctx.font = `600 ${cw < 30 ? 11 : 13}px ${P.fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(a[i]), x0 + cw / 2, y0 + ch / 2);
        ctx.fillStyle = P.ink3;
        ctx.font = `10px ${P.fontMono}`;
        ctx.fillText(String(i), x0 + cw / 2, y0 + ch + 9);
      }
    },
    [P, a, st],
    { height: 2 * (40 + 22) + 4 },
  );

  return (
    <Figure
      no={1}
      title="이진 탐색: 매번 절반을 버린다"
      hint="찾을 값을 정하고 한 단계씩 진행해 보세요"
      caption={<>정렬된 24개의 값입니다. 흰 칸이 아직 후보로 남은 구간, 노란 칸이 이번에 비교하는 가운데 값입니다. 가운데 값과 비교한 결과에 따라 왼쪽이나 오른쪽 절반을 통째로 버립니다. 배열에 없는 값을 고르면 후보가 0개가 될 때 멈춥니다.</>}
    >
      <div className="fig-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div ref={wrapRef} className="canvas-box">
            <canvas ref={canvasRef} />
          </div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', minHeight: '1.7em' }} aria-live="polite">
            {st.note}
          </div>
        </div>
        <div className="controls">
          <Slider id="bs-x" label="찾을 값" value={x} min={1} max={99} step={1} onChange={setX} format={(v) => `${v}${a.includes(v) ? '' : ' (없음)'}`} color="var(--c-cs-2)" />
          <StepControls s={s} id="bs-speed" maxSpeed={6} />
          <div className="btn-row">
            <Button small onClick={() => setSeed((k) => k + 1)}>
              새 배열
            </Button>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="이진 탐색 비교" value={`${st.cmp}번`} color="var(--c-cs-2)" />
            <Readout label="선형 탐색이었다면" value={`${idx >= 0 ? idx + 1 : N1}번`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a hash table with chaining ─────────────── */

const WORDS = '사과 바나나 포도 딸기 수박 참외 복숭아 자두 귤 레몬 키위 망고 체리 감 배 호두 밤 대추 앵두 오렌지 자몽 라임 매실 석류 무화과 블루베리 코코넛 파인애플 멜론 살구 모과 유자 한라봉 용과 두리안 아보카도 크랜베리 리치 구아바 파파야'.split(' ');

type HashKind = 'good' | 'bad';

/** FNV-1a over UTF-16 code units, then MurmurHash3's finalizer so nearby keys land far apart. */
function goodHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
const HASH: Record<HashKind, { name: string; f: (s: string) => number }> = {
  good: { name: '좋은 해시', f: goodHash },
  bad: { name: '나쁜 해시', f: (s) => s.length },
};

function HashFigure() {
  const P = usePalette();
  const [count, setCount] = useState(12);
  const [kind, setKind] = useState<HashKind>('good');
  const [m, setM] = useState(11);
  const keys = WORDS.slice(0, count);
  const h = HASH[kind].f;
  const buckets = useMemo(() => {
    const b: string[][] = Array.from({ length: m }, () => []);
    for (const k of keys) b[h(k) % m].push(k);
    return b;
  }, [keys.join(), m, kind]);
  const longest = Math.max(...buckets.map((b) => b.length));
  const used = buckets.filter((b) => b.length).length;
  const avgProbe = keys.length ? buckets.reduce((s, b) => s + (b.length * (b.length + 1)) / 2, 0) / keys.length : 0;
  const last = keys[keys.length - 1];

  const ROW = 26;
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w }) => {
      const labelW = 34;
      ctx.font = `12px ${P.fontBody}`;
      for (let i = 0; i < m; i++) {
        const y = 4 + i * ROW;
        ctx.fillStyle = P.ink3;
        ctx.font = `11px ${P.fontMono}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), labelW - 8, y + ROW / 2);
        ctx.strokeStyle = P.line;
        ctx.strokeRect(labelW + 0.5, y + 3.5, 10, ROW - 7);
        let x = labelW + 16;
        ctx.font = `12px ${P.fontBody}`;
        ctx.textAlign = 'left';
        buckets[i].forEach((k, j) => {
          if (x === Infinity) return; // row already full
          const tw = ctx.measureText(k).width + 12;
          if (x + tw > w - 30) {
            // no room left: show how many more keys are chained here
            ctx.fillStyle = P.bad;
            ctx.font = `600 11px ${P.fontMono}`;
            ctx.fillText(`+${buckets[i].length - j}`, x + 2, y + ROW / 2);
            ctx.font = `12px ${P.fontBody}`;
            x = Infinity;
            return;
          }
          const isLast = k === last;
          ctx.fillStyle = isLast ? P.pos : alpha(P.ink, 0.08);
          ctx.fillRect(x, y + 3, tw, ROW - 6);
          if (j > 0) {
            ctx.strokeStyle = P.ink3;
            ctx.beginPath();
            ctx.moveTo(x - 6, y + ROW / 2);
            ctx.lineTo(x, y + ROW / 2);
            ctx.stroke();
          }
          ctx.fillStyle = isLast ? P.surface : P.ink;
          ctx.fillText(k, x + 6, y + ROW / 2 + 0.5);
          x += tw + 6;
        });
      }
    },
    [P, buckets, last],
    { height: 4 + m * ROW + 4 },
  );

  return (
    <Figure
      no={2}
      title="해시 테이블: 키로 자리를 계산한다"
      hint="단어를 넣고 해시 함수를 바꿔 보세요"
      caption={<>왼쪽 숫자가 칸(버킷) 번호입니다. 단어를 해시 함수에 넣어 나온 수를 칸 수로 나눈 나머지가 그 단어의 자리입니다. 같은 칸에 여러 단어가 오면(충돌) 줄줄이 이어 붙입니다. 찾을 때도 같은 계산으로 칸을 바로 찾아가고, 그 칸의 줄만 확인하면 됩니다. 주황색은 마지막에 넣은 단어입니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Seg
            label="해시 함수"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'good', label: HASH.good.name },
              { value: 'bad', label: HASH.bad.name },
            ]}
          />
          <Seg
            label="칸 수 m"
            value={m}
            onChange={setM}
            options={[
              { value: 7, label: '7' },
              { value: 11, label: '11' },
              { value: 23, label: '23' },
            ]}
          />
          <div className="btn-row">
            <Button small onClick={() => setCount((c) => Math.min(WORDS.length, c + 1))} disabled={count >= WORDS.length}>
              +1개
            </Button>
            <Button small onClick={() => setCount((c) => Math.min(WORDS.length, c + 5))} disabled={count >= WORDS.length}>
              +5개
            </Button>
            <Button small onClick={() => setCount(0)}>
              비우기
            </Button>
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-2)', minHeight: '3em' }}>
            {last ? (
              <>
                <span className="mono">"{last}"</span> → h = <span className="mono">{h(last).toLocaleString('ko-KR')}</span> → {h(last).toLocaleString('ko-KR')} mod {m} = <strong>{h(last) % m}번 칸</strong>
              </>
            ) : (
              '단어를 넣어 보세요'
            )}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="적재율 α = n/m" value={fmt(keys.length / m, 2)} />
            <Readout label="쓰인 칸" value={`${used} / ${m}`} />
            <Readout label="가장 긴 줄" value={`${longest}개`} color={longest >= 5 ? 'var(--bad)' : undefined} />
            <Readout label="찾을 때 평균 비교" value={fmt(avgProbe, 2) + '번'} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: load factor ─────────────── */

function LoadFigure() {
  const P = usePalette();
  const [al, setAl] = useState(0.75);
  const chain = (a: number) => 1 + a / 2;
  const probe = (a: number) => 0.5 * (1 + 1 / (1 - a));
  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const plot = new Plot(ctx, w, h, P, { xMin: 0, xMax: 1, yMin: 0, yMax: 8, pad: { l: 36, r: 14, t: 14, b: 30 } });
      plot.grid({ xStep: 0.1, yStep: 1, xLabel: '적재율 α', fmt: (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : fmt(v, 1)) });
      plot.fn(chain, P.accent, 2.5);
      plot.fn(probe, P.pos, 2.5, { to: 0.99 });
      plot.line(al, 0, al, 8, P.ink3, 1, [4, 4]);
      plot.dot(al, chain(al), 5, P.accent, P.surface, 2);
      if (probe(al) < 8) plot.dot(al, probe(al), 5, P.pos, P.surface, 2);
    },
    [P, al],
    { aspect: 2.1, maxHeight: 300, minHeight: 220 },
  );
  return (
    <Figure
      no={3}
      title="테이블이 찰수록 느려진다"
      hint="적재율을 바꿔 보세요"
      caption={<>있는 키를 찾을 때 평균 비교 횟수의 이론값입니다. 파란 선은 그림 2처럼 칸마다 줄을 잇는 방식(체이닝), 주황 선은 충돌하면 옆 칸으로 옮겨 가는 방식(선형 탐사)입니다. 칸이 거의 다 차면 선형 탐사는 급격히 느려집니다. 그래서 해시 테이블은 적재율이 정해진 값을 넘으면 칸 수를 늘려 모든 키를 다시 배치합니다.</>}
    >
      <div className="fig-split">
        <div ref={wrapRef} className="canvas-box">
          <canvas ref={canvasRef} />
        </div>
        <div className="controls">
          <Slider id="lf-a" label="적재율 α" value={al} min={0.05} max={0.97} step={0.01} onChange={setAl} format={(v) => fmt(v, 2)} />
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="체이닝" value={fmt(chain(al), 2) + '번'} color="var(--accent)" />
            <Readout label="선형 탐사" value={fmt(probe(al), 2) + '번'} color="var(--pos)" />
          </div>
          <Legend
            items={[
              { color: 'var(--accent)', label: '체이닝: 1 + α/2', shape: 'ln' },
              { color: 'var(--pos)', label: '선형 탐사: ½(1 + 1/(1−α))', shape: 'ln' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function SearchHash() {
  return (
    <>
      <h2>처음부터 하나씩: 선형 탐색</h2>
      <p>
        배열에서 값 하나를 찾는 가장 단순한 방법은 앞에서부터 하나씩 확인하는 것입니다. 이것을 <T en="linear search">선형 탐색</T>이라고 하며, 운이 나쁘면(맨 끝에 있거나 없으면) n번을 모두 봐야 하므로 O(n)입니다. 배열의 <code>indexOf</code>, <code>includes</code>, <code>find</code>가 모두 이렇게 동작합니다.
      </p>

      <h2>정렬되어 있다면: 이진 탐색</h2>
      <p>
        전화번호부에서 이름을 찾을 때 첫 장부터 넘기는 사람은 없습니다. 중간을 펴고, 찾는 이름이 앞쪽인지 뒤쪽인지 보고, 반대쪽은 통째로 무시합니다. 데이터가 정렬되어 있으면 이렇게 비교 한 번마다 후보를 절반으로 줄일 수 있습니다. 이것이 <T en="binary search">이진 탐색</T>입니다.
      </p>
      <BinarySearchFigure />
      <p>
        24개에서는 많아야 5번이면 끝납니다. 후보가 n개에서 시작해 n/2, n/4, …로 줄어 1개가 될 때까지의 횟수는 <M>{'\\log_2 n'}</M>이기 때문입니다.
      </p>
      <MB note="데이터가 1000배로 늘어도 이진 탐색의 비교 횟수는 10번 남짓 늘어날 뿐입니다.">{'n = 1{,}000 \\to 10\\text{번} \\qquad n = 1{,}000{,}000 \\to 20\\text{번} \\qquad n = 10^{9} \\to 30\\text{번}'}</MB>
      <Callout kind="warn">
        이진 탐색은 데이터가 <strong>정렬되어 있을 때만</strong> 맞는 답을 줍니다. 그리고 정렬된 배열에 새 값을 끼워 넣으려면 뒤쪽 원소를 모두 한 칸씩 밀어야 하므로 삽입은 O(n)입니다. 자주 바뀌는 데이터라면 다른 자료구조가 필요합니다.
      </Callout>

      <h2>위치를 계산해 버리기: 해시 테이블</h2>
      <p>
        이진 탐색보다 더 빠를 수 있을까요? 아예 찾지 않고 <strong>자리를 계산</strong>하면 됩니다. 키(예: 단어)를 받아 정수 하나를 돌려주는 <T en="hash function">해시 함수</T>를 만들고, 그 수를 칸 수로 나눈 나머지 칸에 값을 넣습니다. 찾을 때도 같은 계산으로 그 칸에 바로 가면 됩니다. 계산은 키 길이에만 비례하고 데이터 개수와는 상관없으므로 평균 O(1)입니다.
      </p>
      <p>
        문제는 서로 다른 키가 같은 칸으로 갈 때, 즉 <T en="collision">충돌</T>입니다. 칸보다 키가 많으면 충돌은 피할 수 없으므로, 같은 칸에 온 키들을 줄줄이 이어 두는 방법(<T en="chaining">체이닝</T>)을 씁니다.
      </p>
      <HashFigure />
      <p>
        "나쁜 해시"로 바꿔 보세요. 단어의 글자 수를 해시값으로 쓰면 1~5밖에 나오지 않으니 칸을 아무리 늘려도 몇 칸에만 몰립니다. 그러면 한 칸의 줄이 길어지고, 그 칸에서 찾는 일은 결국 선형 탐색이 됩니다. 좋은 해시 함수는 비슷한 키도 전혀 다른 수로 흩어 놓아 모든 칸을 고르게 씁니다.
      </p>

      <h2>적재율과 재해싱</h2>
      <p>
        키 개수 n을 칸 수 m으로 나눈 값을 <T en="load factor">적재율</T> α라고 합니다. α가 1이면 칸마다 평균 한 개씩 들어 있다는 뜻입니다.
      </p>
      <LoadFigure />
      <p>
        그래서 실제 해시 테이블은 적재율이 일정 기준을 넘으면 칸 수를 약 두 배로 늘리고 모든 키를 새 칸에 다시 넣습니다(<T en="rehashing">재해싱</T>). Java의 <code>HashMap</code>은 기본 기준이 0.75입니다. 재해싱 한 번은 O(n)이지만 드물게 일어나므로, 삽입 한 번의 평균 비용은 여전히 O(1)입니다.
      </p>

      <h2>코드에서는</h2>
      <p>
        JavaScript의 <code>Set</code>과 <code>Map</code>, Python의 <code>set</code>과 <code>dict</code>가 해시 테이블입니다. 입문 개발자가 가장 자주 만드는 성능 문제 가운데 하나는 반복문 안에서 배열의 <code>includes</code>를 부르는 것입니다. 바깥 반복이 n번, <code>includes</code>가 매번 최대 n번이니 O(n²)이 됩니다.
      </p>
      <Code label="O(n²)을 O(n)으로">{`
// 느림: O(n × m). 10만 × 10만이면 100억 번 비교
const common = orders.filter((id) => blocked.includes(id));

// 빠름: O(n + m). Set에 한 번 넣고, 확인은 평균 O(1)
const blockedSet = new Set(blocked);
const common2 = orders.filter((id) => blockedSet.has(id));`}</Code>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>자료구조</th>
              <th>찾기</th>
              <th>넣기</th>
              <th>특징</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>정렬 안 된 배열</td>
              <td className="mono">O(n)</td>
              <td className="mono">O(1)</td>
              <td>끝에 붙이기는 빠르지만 찾기가 느림</td>
            </tr>
            <tr>
              <td>정렬된 배열</td>
              <td className="mono">O(log n)</td>
              <td className="mono">O(n)</td>
              <td>크기순 조회와 범위 검색이 쉬움</td>
            </tr>
            <tr>
              <td>해시 테이블</td>
              <td className="mono">평균 O(1)</td>
              <td className="mono">평균 O(1)</td>
              <td>크기순 조회와 범위 검색은 못 함, 나쁜 해시면 O(n)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Callout kind="key">
        정렬되지 않은 데이터에서 찾기는 O(n)입니다. 정렬되어 있으면 이진 탐색으로 O(log n)이 되고, 해시 테이블은 키로 자리를 계산해 평균 O(1)에 찾습니다. 해시 테이블의 속도는 키를 고르게 흩어 놓는 해시 함수와, 적재율이 높아지면 칸을 늘리는 재해싱에 달려 있습니다.
      </Callout>
      <Quiz
        q="회원 10만 명의 아이디 배열 users와 차단된 아이디 1만 개의 배열 blocked가 있다. 차단되지 않은 회원만 고르는 가장 효율적인 방법은?"
        options={['users.filter(u => !blocked.includes(u))', 'blocked를 Set으로 만든 뒤 users.filter(u => !set.has(u))', 'users를 정렬한 뒤 blocked의 각 원소를 선형 탐색', '두 배열을 합쳐 이중 반복문으로 비교']}
        answer={1}
        explain={<>①은 회원마다 blocked 전체를 훑으므로 10만 × 1만 = 10억 번까지 비교합니다. ②는 Set을 만드는 데 1만 번, 확인하는 데 10만 번이면 끝나는 O(n + m)입니다. ③은 정렬해 놓고도 이진 탐색이 아니라 선형 탐색을 해서 이득이 없습니다.</>}
      />
    </>
  );
}
