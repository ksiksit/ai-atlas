import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, M, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { AGE_BANDS, AGE_MAX, BOUNDARY_TESTS, BRANCHES, COV_SRC, COV_TESTS, EXEC_LINES, HOUR_BANDS, HOUR_MAX, HOUR_MIN, MUTANTS, PART_TESTS, PROPS, TRIALS, cellOf, holds, killers, mySort, randomTests, runCov, runPbt, sameNum, ticketPrice, type PTest, type PropId } from './suites';
import './software.css';

/* ─────────────── Figure 1: partitions and mutants ─────────────── */

const MAX_TESTS = 30;
const won = (v: number) => v.toLocaleString('ko-KR');
const sameTest = (a: PTest, b: PTest) => a.age === b.age && a.hour === b.hour;

function PartitionFigure() {
  const P = usePalette();
  const [tests, setTests] = useState<PTest[]>(PART_TESTS.slice(0, 3));
  const [age, setAge] = useState('13');
  const [hour, setHour] = useState('15');
  const seed = useRef(3);
  const kill = killers(tests);
  const killedIdx = new Set(kill.filter((k) => k >= 0));
  const cells = new Set(tests.map(cellOf));
  const nKilled = kill.filter((k) => k >= 0).length;
  const real = MUTANTS.filter((m) => !m.equivalent).length;

  const add = (ts: PTest[]) => {
    const out = tests.slice();
    for (const t of ts) if (!out.some((o) => sameTest(o, t)) && out.length < MAX_TESTS) out.push(t);
    setTests(out);
  };
  const toggle = (t: PTest) => (tests.some((o) => sameTest(o, t)) ? setTests(tests.filter((o) => !sameTest(o, t))) : add([t]));

  const pad = { l: 40, r: 10, t: 12, b: 34 };
  const nH = HOUR_MAX - HOUR_MIN + 1;
  const { wrapRef, canvasRef, size } = useCanvas2D(
    (ctx, { w, h }) => {
      const pw = w - pad.l - pad.r;
      const ph = h - pad.t - pad.b;
      const X = (a: number) => pad.l + (a / (AGE_MAX + 1)) * pw;
      const Y = (hr: number) => pad.t + ((HOUR_MAX + 1 - hr) / nH) * ph;
      // the nine partitions
      AGE_BANDS.forEach((ab, i) =>
        HOUR_BANDS.forEach((hb, j) => {
          const x0 = X(ab.lo);
          const x1 = X(ab.hi + 1);
          const y0 = Y(hb.hi + 1);
          const y1 = Y(hb.lo);
          const covered = cells.has(i * 3 + j);
          ctx.fillStyle = covered ? alpha(P.good, P.dark ? 0.2 : 0.13) : (i + j) % 2 ? P.surface2 : P.surface;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          const price = ticketPrice(ab.lo, hb.lo);
          // the spec's value, in the cell's top-right corner (tests mostly sit left of it)
          ctx.fillStyle = covered ? P.good : P.ink3;
          ctx.font = `${x1 - x0 < 60 ? 10 : 11}px ${P.fontMono}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(x1 - x0 < 60 ? won(price) : `${won(price)}원`, x1 - 4, y0 + 4);
        }),
      );
      ctx.strokeStyle = P.lineStrong;
      ctx.lineWidth = 1;
      ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw - 1, ph - 1);
      // partition boundaries
      ctx.strokeStyle = alpha(P.ink, 0.55);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      for (const a of [13, 65]) {
        ctx.beginPath();
        ctx.moveTo(X(a), pad.t);
        ctx.lineTo(X(a), pad.t + ph);
        ctx.stroke();
      }
      for (const hr of [10, 22]) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(hr));
        ctx.lineTo(pad.l + pw, Y(hr));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // axes
      ctx.fillStyle = P.ink3;
      ctx.font = `11px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      // tick labels sit on the partition boundaries
      for (const a of [0, 13, 65, AGE_MAX + 1]) ctx.fillText(String(Math.min(a, AGE_MAX)), X(a) + (a === 0 ? 4 : a > AGE_MAX ? -6 : 0), pad.t + ph + 4);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const hr of [HOUR_MIN, 10, 22]) ctx.fillText(`${hr}시`, pad.l - 4, Y(hr));
      ctx.font = `12px ${P.fontBody}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = P.ink2;
      ctx.fillText('나이 →', pad.l + pw, h - 2);
      // tests
      tests.forEach((t, k) => {
        const cx = X(t.age + 0.5);
        const cy = Y(t.hour + 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = killedIdx.has(k) ? P.pos : P.ink2;
        ctx.fill();
        ctx.strokeStyle = P.surface;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      });
    },
    [P, tests],
    { aspect: 1.45, maxHeight: 400, minHeight: 280 },
  );

  const onClick = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const pw = size.w - pad.l - pad.r;
    const ph = size.h - pad.t - pad.b;
    if (x < pad.l || x > pad.l + pw || y < pad.t || y > pad.t + ph) return;
    const a = Math.min(AGE_MAX, Math.max(0, Math.floor(((x - pad.l) / pw) * (AGE_MAX + 1))));
    const hr = Math.min(HOUR_MAX, Math.max(HOUR_MIN, HOUR_MAX - Math.floor(((y - pad.t) / ph) * nH)));
    // clicking near an existing test removes it
    const near = tests.find((t) => Math.abs(t.age - a) <= 1 && t.hour === hr);
    toggle(near ?? { age: a, hour: hr });
  };

  const typed = { age: Number(age), hour: Number(hour) };
  const typedOk = Number.isInteger(typed.age) && typed.age >= 0 && typed.age <= AGE_MAX && Number.isInteger(typed.hour) && typed.hour >= HOUR_MIN && typed.hour <= HOUR_MAX;

  return (
    <Figure
      no={1}
      title="입력 공간을 나누고 돌연변이 잡기"
      hint="평면을 눌러 테스트를 넣고 빼 보세요"
      caption={<>가로는 나이(0~90세), 세로는 상영 시각(7~23시)입니다. 점선이 명세의 경계이고, 아홉 칸이 각각 하나의 파티션이며 칸 안의 숫자는 명세가 정한 값입니다. 점 하나가 테스트 하나이고, 기대값은 명세에서 계산합니다. 주황 점은 어떤 돌연변이를 처음으로 잡은 테스트입니다. 오른쪽 열 개의 돌연변이는 명세의 한 곳을 살짝 바꾼 버그 있는 구현입니다.</>}
    >
      <div className="fig-split">
        <div className="sw-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`나이와 상영 시각 평면 위의 테스트 ${tests.length}개. 아홉 파티션 중 ${cells.size}개를 덮고, 돌연변이 ${MUTANTS.length}개 중 ${nKilled}개를 잡습니다.`}>
            <canvas ref={canvasRef} onPointerDown={onClick} style={{ cursor: 'crosshair' }} />
          </div>
          <form
            className="sw-addrow"
            onSubmit={(e) => {
              e.preventDefault();
              if (typedOk) add([typed]);
            }}
          >
            <label>
              나이
              <input className="sw-input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </label>
            <label>
              시각
              <input className="sw-input" inputMode="numeric" value={hour} onChange={(e) => setHour(e.target.value)} />
            </label>
            <button type="submit" className="btn small" disabled={!typedOk}>
              테스트 추가
            </button>
            <span className="sw-label">{typedOk ? `기대값 ${won(ticketPrice(typed.age, typed.hour))}원` : `나이 0~${AGE_MAX}, 시각 ${HOUR_MIN}~${HOUR_MAX}`}</span>
          </form>
          <div className="btn-row">
            <Button small onClick={() => setTests(PART_TESTS)}>
              파티션마다 하나
            </Button>
            <Button small onClick={() => add(BOUNDARY_TESTS)}>
              + 경계값 8개
            </Button>
            <Button small onClick={() => setTests(randomTests(10, ++seed.current))}>
              무작위 10개
            </Button>
            <Button small onClick={() => setTests([])}>
              비우기
            </Button>
          </div>
        </div>
        <div className="controls">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="테스트" value={tests.length} />
            <Readout label="파티션" value={`${cells.size}/9`} color={cells.size === 9 ? 'var(--good)' : undefined} />
            <Readout label="돌연변이 점수" value={`${Math.round((nKilled / MUTANTS.length) * 100)}%`} color="var(--pos)" />
          </div>
          <div className="sw-mutants" aria-live="polite">
            {MUTANTS.map((m, k) => (
              <div key={m.id} className="sw-mutant" data-killed={kill[k] >= 0 || undefined}>
                <span className="nm">
                  {m.id}. {m.name}
                </span>
                <span className="sw-badge" data-t={kill[k] >= 0 ? 'good' : 'dim'}>
                  {kill[k] >= 0 ? `잡힘 (${tests[kill[k]].age}세 ${tests[kill[k]].hour}시)` : '살아남음'}
                </span>
                <span className="cd">{m.line}</span>
              </div>
            ))}
          </div>
          <div className="sw-note">
            {nKilled === real
              ? '잡을 수 있는 돌연변이는 모두 잡았습니다. 마지막 10번은 시각이 정수인 한 원래 코드와 똑같이 동작하는 "같은 뜻의 돌연변이"라서 어떤 테스트로도 잡을 수 없습니다.'
              : cells.size === 9
                ? '아홉 파티션을 모두 덮었는데도 경계의 돌연변이 1~4번이 살아 있습니다. 경계 바로 그 값을 넣어 보세요.'
                : '아직 덮지 않은 파티션이 있습니다. 6, 8, 9번 돌연변이는 특정 칸 하나에서만 잘못 동작합니다.'}
          </div>
        </div>
      </div>
      <Legend
        items={[
          { color: 'var(--pos)', label: '돌연변이를 잡은 테스트', shape: 'dot' },
          { color: 'var(--ink-2)', label: '새로 잡은 것이 없는 테스트', shape: 'dot' },
          { color: 'var(--good)', label: '테스트가 있는 파티션', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 2: property-based testing and shrinking ─────────────── */

const arr = (xs: number[]) => `[${xs.join(', ')}]`;

function PropertyFigure() {
  const [prop, setProp] = useState<PropId>('length');
  const [buggy, setBuggy] = useState(true);
  const [seed, setSeed] = useState(2);
  const run = useMemo(() => runPbt(prop, buggy, seed), [prop, buggy, seed]);
  const s = useStepper(Math.max(1, run.shrink.length), 2, `${prop}|${buggy}|${seed}`);
  const found = run.failAt >= 0;
  const cur = found ? run.shrink[s.i].xs : null;
  const out = cur ? mySort(cur, buggy) : null;
  const last = found && s.i === run.shrink.length - 1;

  return (
    <Figure
      no={2}
      title="무작위 입력으로 성질 검사하기"
      hint="성질과 구현을 바꾸고, 반례가 줄어드는 과정을 따라가 보세요"
      caption={<>무작위 배열을 만들어 정렬 함수에 넣고, 결과가 고른 성질을 지키는지 봅니다. 배열은 처음에는 짧게 시작해 시도할수록 길어집니다(최대 길이 8, 원소 0~9). 위의 작은 칸 하나가 시도 한 번이고, 초록은 성질이 지켜진 경우, 빨강은 처음으로 깨진 경우입니다. 반례를 찾으면 원소를 하나 빼거나 값을 줄인 후보를 차례로 시도해, 여전히 실패하는 더 작은 입력으로 옮겨 갑니다. 더 줄일 수 없으면 멈춥니다.</>}
    >
      <div className="controls row">
        <Seg label="검사할 성질" value={prop} onChange={setProp} options={PROPS.map((p) => ({ value: p.id, label: p.label }))} />
        <Seg
          label="정렬 구현"
          value={buggy ? 'b' : 'f'}
          onChange={(v) => setBuggy(v === 'b')}
          options={[
            { value: 'b', label: '버그 있음' },
            { value: 'f', label: '고친 것' },
          ]}
        />
        <div className="ctl" style={{ flex: '0 0 auto' }}>
          <Button small onClick={() => setSeed((x) => x + 1)}>
            새 무작위 입력
          </Button>
        </div>
      </div>
      <Code label="검사하는 정렬 함수">{`
function mySort(xs) {
  if (xs.length <= 1) return xs;
  const [p, ...rest] = xs;                 // 첫 원소를 피벗으로
  const left = rest.filter((x) => x < p);
  const right = rest.filter((x) => ${buggy ? 'x > p);   // 버그: p와 같은 값은 어디로?' : 'x >= p);  // 고침: 같은 값은 오른쪽으로'}
  return [...mySort(left), p, ...mySort(right)];
}`}</Code>
      <div className="sw-trials" role="img" aria-label={found ? `시도 ${run.failAt + 1}번째에서 반례 발견` : `시도 ${TRIALS}번 모두 통과`}>
        {Array.from({ length: TRIALS }, (_, k) => (
          <i key={k} data-s={k < run.trials.length ? (run.trials[k].ok ? 'ok' : 'bad') : undefined} />
        ))}
      </div>
      <div className="sw-note" data-tone={found ? 'bad' : buggy ? 'bad' : 'good'}>
        {found
          ? `${run.failAt + 1}번째 시도에서 성질이 깨졌습니다: mySort(${arr(run.trials[run.failAt].xs)}).`
          : buggy
            ? `${TRIALS}번 모두 통과했습니다. 그런데 이 구현에는 버그가 있습니다. 이 성질은 버그를 볼 수 없는 성질입니다.`
            : `${TRIALS}번 모두 통과했습니다.`}
      </div>
      {found && cur && out && (
        <div className="fig-split">
          <div className="sw-col">
            <div className="sw-label">반례 줄이기 (shrinking)</div>
            <div className="sw-shrink">
              {run.shrink.map((st, k) => (
                <button key={k} type="button" className="sw-shrink-row" data-cur={k === s.i || undefined} data-past={k > s.i || undefined} onClick={() => s.go(k)}>
                  <span className="k">{k === 0 ? '찾음' : `${k}단계`}</span>
                  <span className="mono">{arr(st.xs)}</span>
                  <span className="t">{k === 0 ? '' : `후보 ${st.tried}개째에서`}</span>
                </button>
              ))}
            </div>
            <div className="sw-io">
              <div>
                <span className="sw-label">입력</span> <span className="mono">{arr(cur)}</span>
              </div>
              <div>
                <span className="sw-label">출력</span> <span className="mono">{arr(out)}</span>
              </div>
              <div>
                <span className="sw-label">성질</span> <span className="mono">{PROPS.find((p) => p.id === prop)!.code}</span> <span className="sw-mark-bad">{holds(prop, cur, out) ? '' : '✗ 거짓'}</span>
              </div>
            </div>
          </div>
          <div className="controls">
            <StepControls s={s} id="pbt-speed" maxSpeed={6} />
            <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Readout label="처음 반례 길이" value={run.shrink[0].xs.length} />
              <Readout label="지금 길이" value={cur.length} color="var(--pos)" />
            </div>
            <div className="sw-note">{last ? `더 줄일 수 없는 반례입니다. 후보를 모두 ${run.totalTried}번 시도했습니다. 같은 값 두 개만 있으면 버그가 드러난다는 것이 한눈에 보입니다.` : '재생하거나 한 단계씩 넘겨 보세요.'}</div>
          </div>
        </div>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 3: coverage ─────────────── */

function CoverageFigure() {
  const [on, setOn] = useState<Record<string, boolean>>({ A: true, B: true });
  const chosen = COV_TESTS.filter((t) => on[t.id]);
  const runs = useMemo(() => COV_TESTS.map(runCov), []);
  const sel = COV_TESTS.map((t, k) => (on[t.id] ? runs[k] : null)).filter(Boolean) as ReturnType<typeof runCov>[];
  const hits = COV_SRC.map((_, i) => sel.reduce((s, r) => s + r.hits[i], 0));
  const br = BRANCHES.map((_, b) => [sel.some((r) => r.br[b][0]), sel.some((r) => r.br[b][1])]);
  const lineCov = EXEC_LINES.filter((i) => hits[i] > 0).length;
  const brCov = br.reduce((s, x) => s + (x[0] ? 1 : 0) + (x[1] ? 1 : 0), 0);
  const fails = COV_TESTS.filter((t, k) => on[t.id] && !sameNum(runs[k].got, t.expect)).length;
  const full = lineCov === EXEC_LINES.length && brCov === BRANCHES.length * 2;

  return (
    <Figure
      no={3}
      title="커버리지 100%와 버그"
      hint="테스트를 켜고 끄며 색이 어떻게 바뀌는지 보세요"
      caption={<>명세: 점수의 평균을 돌려준다. dropLowest가 참이면 가장 낮은 점수 하나를 빼고 평균을 낸다. 점수가 없으면 0을 돌려주고, 빼고 나면 남는 점수가 없을 때는 빼지 않는다. 초록 줄은 고른 테스트가 실행한 줄, 빨간 줄은 한 번도 실행하지 않은 줄이고, 왼쪽 숫자는 실행 횟수입니다. 조건 옆의 표시는 참과 거짓 쪽을 각각 한 번이라도 지나갔는지입니다.</>}
    >
      <div className="fig-split">
        <pre className="sw-code" aria-label="average 함수와 줄마다의 실행 여부">
          {COV_SRC.map((line, i) => {
            const exec = EXEC_LINES.includes(i);
            const b = BRANCHES.findIndex((x) => x.line === i);
            return (
              <div key={i} className="sw-line" data-s={exec && sel.length ? (hits[i] ? 'hit' : 'miss') : undefined}>
                <span className="sw-ln">{i + 1}</span>
                <span className="sw-hits">{exec && sel.length ? `×${hits[i]}` : ''}</span>
                <span className="sw-src">{line}</span>
                {b >= 0 && sel.length > 0 && (
                  <span className="sw-tag">
                    참 <span className={br[b][0] ? 'sw-mark-ok' : 'sw-mark-bad'}>{br[b][0] ? '✓' : '✗'}</span> 거짓 <span className={br[b][1] ? 'sw-mark-ok' : 'sw-mark-bad'}>{br[b][1] ? '✓' : '✗'}</span>
                  </span>
                )}
              </div>
            );
          })}
        </pre>
        <div className="controls">
          <div className="ctl" style={{ gap: 4 }}>
            <span className="ctl-label">
              <span>테스트 고르기</span>
            </span>
            {COV_TESTS.map((t, k) => {
              const ok = sameNum(runs[k].got, t.expect);
              return (
                <div key={t.id} className="sw-covtest" data-pass={on[t.id] ? (ok ? 'y' : 'n') : undefined}>
                  <Check label={<span className="mono">{`average([${t.scores.join(', ')}], ${t.drop})`}</span>} checked={!!on[t.id]} onChange={(v) => setOn({ ...on, [t.id]: v })} />
                  <span className="r">
                    기대 {t.expect}
                    {on[t.id] && <> · 결과 {Number.isNaN(runs[k].got) ? 'NaN' : runs[k].got} <span className={ok ? 'sw-mark-ok' : 'sw-mark-bad'}>{ok ? '✓' : '✗'}</span></>}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="줄 커버리지" value={`${Math.round((lineCov / EXEC_LINES.length) * 100)}%`} color={lineCov === EXEC_LINES.length ? 'var(--good)' : undefined} />
            <Readout label="분기 커버리지" value={`${Math.round((brCov / (BRANCHES.length * 2)) * 100)}%`} color={brCov === BRANCHES.length * 2 ? 'var(--good)' : undefined} />
            <Readout label="통과" value={chosen.length - fails} color={chosen.length && !fails ? 'var(--good)' : undefined} />
            <Readout label="실패" value={fails} color={fails ? 'var(--bad)' : undefined} />
          </div>
          <div className="sw-note" data-tone={full && !fails ? 'bad' : undefined}>
            {!chosen.length
              ? '테스트를 하나 이상 고르세요.'
              : full && !fails
                ? '줄과 분기를 100% 덮었고 테스트도 모두 통과합니다. 그런데 이 함수에는 버그가 두 개 있습니다. D와 E를 켜 보세요.'
                : fails
                  ? '실패한 테스트가 버그를 찾았습니다. 둘 다 0을 0으로 나눠 NaN이 나옵니다. 이 입력들은 새 줄도 새 분기도 지나가지 않습니다.'
                  : '아직 실행되지 않은 줄이나 분기가 있습니다.'}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Testing() {
  return (
    <>
      <h2>테스트는 무엇을 증명하나</h2>
      <p>
        <a href={lessonHref('cs-programming', 'testing')}>프로그래밍 입문의 테스트 장</a>에서는 입력과 기대값을 짝지어 적고, 경계값을 넣어야 버그가 잡힌다는 것을 봤습니다. 이 장에서는 한 걸음 더 들어가, 테스트를 <strong>어떻게 골라야 하는지</strong>와 <strong>얼마나 잘 골랐는지 어떻게 재는지</strong>를 봅니다.
      </p>
      <p>
        먼저 한계부터 인정해야 합니다. 32비트 정수 두 개를 받는 함수에는 가능한 입력이 <M>{'2^{64}'}</M>가지 있습니다. 1초에 10억 개를 시험해도 500년이 넘게 걸립니다. 모든 입력을 시험하는 것은 불가능하니, 테스트는 늘 일부만 봅니다. 에츠허르 데이크스트라(Edsger Dijkstra)의 말처럼 "테스트는 버그가 있다는 것을 보여 줄 수는 있지만, 없다는 것은 보여 줄 수 없습니다." 그래서 테스트의 기술은 적은 수의 입력으로 버그가 숨어 있을 만한 곳을 최대한 많이 찔러 보는 것입니다.
      </p>

      <h2>입력 공간 나누기</h2>
      <p>
        체계적인 방법은 입력 공간을 <T en="partition">파티션</T>으로 나누는 것입니다. 명세를 읽고, 함수가 "같은 방식으로" 동작할 것 같은 입력끼리 묶습니다. 각 묶음 안에서는 어느 값을 골라도 비슷한 결과를 낼 것이므로 하나씩만 고르면 되고, 버그는 주로 묶음과 묶음 사이의 <T en="boundary">경계</T>에 숨으므로 경계 양쪽의 값을 더합니다.
      </p>
      <Code label="영화표 가격의 명세와 구현">{`
// 명세: 13세 미만 7000원, 65세 이상 6000원, 나머지 12000원.
//       10시 전에 시작하면 2000원, 22시 이후면 3000원 할인.
//       단, 할인 후에도 5000원보다 싸지는 않다.
function ticketPrice(age, hour) {
  const base = age < 13 ? 7000 : age >= 65 ? 6000 : 12000;
  const disc = hour < 10 ? 2000 : hour >= 22 ? 3000 : 0;
  return Math.max(5000, base - disc);
}`}</Code>
      <p>
        입력이 둘이면 파티션은 평면 위의 칸이 됩니다. 나이는 어린이·일반·경로의 세 묶음, 시각은 조조·낮·심야의 세 묶음이니 둘을 곱해 아홉 칸입니다. 그림 1에서 테스트가 얼마나 좋은지는 <T en="mutation testing">돌연변이 테스트</T>로 잽니다. 구현의 한 곳을 일부러 살짝 바꾼 <T en="mutant">돌연변이</T>들을 만들고, 내 테스트 묶음을 돌려 몇 개나 실패시키는지(잡는지) 세는 것입니다. 잡은 비율이 <T en="mutation score">돌연변이 점수</T>입니다. 진짜 버그도 대개 이런 작은 실수이므로, 돌연변이를 잘 잡는 테스트는 진짜 버그도 잘 잡습니다.
      </p>
      <PartitionFigure />
      <p>
        처음의 세 테스트는 모두 어린이 줄에 있어서 일부만 잡습니다. "파티션마다 하나"를 누르면 아홉 칸을 모두 덮어 5번부터 9번까지 잡지만, 경계의 1~4번은 그대로 살아 있습니다. <code>age &lt; 13</code>을 <code>age &lt;= 13</code>으로 바꾼 돌연변이는 13세에서만 다르게 동작하는데, 칸의 가운데만 고르면 13세를 넣을 일이 없기 때문입니다. 경계값 8개를 더하면 점수가 90%가 됩니다. 테스트 17개로 1,547가지 입력 중 잡을 수 있는 실수는 모두 잡은 셈입니다.
      </p>
      <p>
        6번(심야 할인액)은 일반 관객의 심야 칸에서만, 9번(어린이 조조 할인 누락)은 어린이의 조조 칸에서만 드러납니다. 다른 칸에서는 최저가 5000원에 가려지기 때문입니다. 나이 파티션 셋과 시각 파티션 셋을 각각 한 번씩만 덮으면 테스트 세 개로 충분해 보이지만, 이런 <strong>조합</strong>의 버그를 놓칩니다. 칸이 너무 많아 곱을 다 덮을 수 없을 때는 두 차원씩의 조합만 모두 덮는 <T en="pairwise testing">쌍별 테스트</T>가 흔한 절충입니다.
      </p>
      <Callout kind="note">
        10번처럼 원래 코드와 겉보기에 똑같이 동작하는 돌연변이를 <T en="equivalent mutant">동등 돌연변이</T>라고 합니다. 시각이 정수라면 <code>hour &lt; 10</code>과 <code>hour &lt;= 9</code>는 같은 뜻이므로, 어떤 테스트로도 잡을 수 없습니다. 그래서 돌연변이 점수 100%는 대개 불가능하고, 살아남은 돌연변이를 하나씩 보며 "테스트가 부족한가, 동등한가"를 사람이 판단합니다. JavaScript에는 Stryker, Java에는 PIT 같은 도구가 돌연변이를 자동으로 수백 개 만들어 이 점수를 계산해 줍니다.
      </Callout>

      <h2>명세를 보고, 코드를 보고</h2>
      <p>
        위의 파티션은 명세만 보고 만들었습니다. 구현을 모른 채 명세로 테스트를 고르는 것을 <T en="black-box testing">블랙박스 테스트</T>라고 합니다. 구현이 바뀌어도 테스트가 그대로 유효하다는 장점이 있습니다. 반대로 코드를 읽고 고르는 <T en="glass-box testing">글래스박스 테스트</T>는 명세에 드러나지 않는 경계를 찾아냅니다. 예를 들어 Java의 기본 정렬은 배열이 47개보다 작으면 삽입 정렬로 바꿔 탑니다. 명세에는 없는 경계이지만, 46개와 47개, 48개짜리 배열을 넣어 봐야 두 알고리즘 모두를 시험할 수 있습니다.
      </p>

      <h2>단위 테스트와 테스트 피라미드</h2>
      <p>
        함수 하나, 클래스 하나를 떼어 시험하는 것을 <T en="unit test">단위 테스트</T>, 여러 모듈을 이어 붙여 시험하는 것을 <T en="integration test">통합 테스트</T>, 실제 사용자처럼 브라우저를 띄우고 화면을 눌러 보는 것을 <T en="end-to-end test">종단 간 테스트</T>라고 합니다. 위로 갈수록 실제 사용에 가깝지만 느리고, 실패했을 때 원인을 찾기 어렵고, 네트워크나 시간 같은 우연에 따라 결과가 흔들리기 쉽습니다.
      </p>
      <div className="sw-pyramid" role="img" aria-label="테스트 피라미드: 아래는 단위 테스트 수백 개, 가운데는 통합 테스트 수십 개, 위는 종단 간 테스트 몇 개">
        <div style={{ width: '34%' }}>
          <strong>종단 간</strong> 몇 개 · 수십 초
        </div>
        <div style={{ width: '62%' }}>
          <strong>통합</strong> 수십 개 · 수 초
        </div>
        <div style={{ width: '92%' }}>
          <strong>단위</strong> 수백~수천 개 · 하나에 몇 ms
        </div>
      </div>
      <p>
        그래서 흔히 권하는 모양이 <T en="test pyramid">테스트 피라미드</T>입니다. 한 줄로 줄이면 <strong>작고 빠른 테스트를 많이, 크고 느린 테스트는 조금</strong>입니다. 단위 테스트가 대부분의 논리를 몇 초 안에 확인하고, 통합 테스트는 모듈이 서로 맞물리는지를, 종단 간 테스트는 가장 중요한 사용 흐름 몇 개만 확인합니다. 이 테스트들은 보통 코드를 올릴 때마다 서버에서 자동으로 돌아갑니다(<T en="continuous integration">지속적 통합</T>, CI). 버그를 고칠 때마다 그 버그를 재현하는 테스트를 하나씩 남겨 두면, 같은 실수가 돌아왔을 때 CI가 바로 알려 줍니다.
      </p>

      <h2>무작위 입력으로 성질 검사하기</h2>
      <p>
        사람이 고른 테스트는 사람이 떠올린 경우만 시험합니다. 반대로 컴퓨터에게 입력을 수백 개 무작위로 만들게 할 수도 있습니다. 문제는 기대값입니다. 무작위 배열을 정렬한 정답을 미리 적어 둘 수는 없습니다. 대신 정답이 반드시 지켜야 할 <strong>성질</strong>을 적습니다. "결과는 정렬되어 있다", "결과의 길이는 입력과 같다"처럼요. 이것이 <T en="property-based testing">성질 기반 테스트</T>입니다. 2000년 하스켈의 QuickCheck에서 시작해, 지금은 Python의 Hypothesis, JavaScript의 fast-check 같은 도구가 있습니다.
      </p>
      <Code label="fast-check로 적은 성질 기반 테스트">{`
import fc from 'fast-check';

test('정렬 결과는 입력과 길이가 같고 정렬되어 있다', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (xs) => {   // 무작위 정수 배열 xs마다
      const out = mySort(xs);
      return out.length === xs.length && isSorted(out);
    }),
  );   // 기본 100번 시도, 실패하면 가장 작은 반례로 줄여서 보고한다
});`}</Code>
      <p>
        무작위로 찾은 반례는 대개 크고 지저분합니다. <code>[7, 3, 9, 3, 0, 5]</code>에서 실패했다는 말만으로는 원인이 잘 보이지 않습니다. 그래서 도구는 반례를 찾은 뒤 <T en="shrinking">축소</T>를 합니다. 원소를 하나 빼 보거나 값을 줄여 본 후보 중 여전히 실패하는 것으로 옮겨 가기를, 더 줄일 수 없을 때까지 반복합니다. 그림 2에서 이 과정을 따라가 보세요.
      </p>
      <PropertyFigure />
      <p>
        "길이가 같다"를 고르면 반례는 금방 <code>[3, 3]</code>처럼 같은 값 두 개짜리로 줄어듭니다. 이 정도면 원인이 거의 보입니다. 피벗과 같은 값이 왼쪽에도 오른쪽에도 들어가지 못하고 사라지는 것입니다. 그런데 "정렬되어 있다"만 고르면 100번 모두 통과합니다. 값이 사라져도 남은 것은 여전히 정렬되어 있기 때문입니다. 성질 기반 테스트는 성질을 고르는 만큼만 강합니다. 정렬이라면 "정렬되어 있다"와 "원소가 같다"를 함께 써야 정렬의 명세 전체를 확인합니다.
      </p>
      <Callout kind="intuition">
        좋은 성질은 명세에서 나옵니다. 사후 조건을 코드로 쓸 수 있으면 그것이 곧 성질입니다. 그 밖에 자주 쓰는 모양이 있습니다. 거꾸로 돌리면 원래대로 돌아온다(<code>decode(encode(x)) === x</code>), 두 번 해도 한 번 한 것과 같다(<code>sort(sort(xs))</code>와 <code>sort(xs)</code>), 느리지만 확실한 구현과 결과가 같다(새 정렬과 <code>Array.prototype.sort</code>).
      </Callout>

      <h2>커버리지가 말해 주는 것</h2>
      <p>
        테스트를 돌리면서 어떤 줄이 실행되었는지 기록하면 <T en="code coverage">코드 커버리지</T>를 얻습니다. 실행된 줄의 비율이 <T en="line coverage">줄 커버리지</T>, 조건문마다 참과 거짓 양쪽을 모두 지나간 비율이 <T en="branch coverage">분기 커버리지</T>입니다. 한 번도 실행되지 않은 줄은 테스트가 전혀 확인하지 않은 줄이므로, 커버리지는 빠뜨린 곳을 찾는 데 아주 쓸모 있습니다.
      </p>
      <CoverageFigure />
      <p>
        처음의 두 테스트 A, B만으로 줄과 분기를 모두 100% 덮고, 둘 다 통과합니다. 하지만 이 함수는 빈 배열에서 <code>0 / 0</code>, 점수 하나에 dropLowest가 참일 때도 <code>0 / 0</code>을 계산해 NaN을 돌려줍니다. D와 E는 새로운 줄이나 분기를 하나도 지나가지 않는데도 버그를 찾아냅니다. 커버리지는 코드가 <strong>실행되었는지</strong>를 셀 뿐, 결과가 <strong>확인되었는지</strong>나 중요한 입력을 넣었는지는 알려 주지 않습니다. 기대값을 비교하지 않는 테스트도 커버리지는 똑같이 올려 줍니다.
      </p>
      <Callout kind="warn">
        "커버리지 90% 이상"을 목표로 정하면, 커버리지를 올리기 쉬운 테스트가 늘어나기 쉽습니다. 측정치가 목표가 되면 좋은 측정치가 아니게 된다는 굿하트의 법칙 그대로입니다. 커버리지는 "여기는 아직 아무도 안 봤다"를 알려 주는 지도로 쓰고, 파티션과 경계값, 성질로 테스트를 고르세요.
      </Callout>

      <Callout kind="key">
        모든 입력을 시험할 수는 없으니, 명세에서 입력 공간을 파티션으로 나눠 칸마다 하나와 경계값을 고릅니다. 테스트 묶음의 힘은 돌연변이 점수로 잴 수 있습니다. 성질 기반 테스트는 무작위 입력 수백 개로 성질을 확인하고 반례를 가장 작게 줄여 줍니다. 커버리지는 빠뜨린 곳을 알려 줄 뿐, 100%라고 버그가 없다는 뜻은 아닙니다.
      </Callout>
      <Quiz
        q={
          <>
            <code>discount(price, coupon)</code>를 테스트하는데, 줄 커버리지와 분기 커버리지가 모두 100%이고 모든 테스트가 통과합니다. 그런데 이 함수의 조건 하나를 <code>&gt;=</code>에서 <code>&gt;</code>로 바꿔도 테스트가 모두 통과합니다. 무엇을 알 수 있나요?
          </>
        }
        options={['커버리지가 100%이므로 그 조건은 중요하지 않다', '테스트가 그 조건의 경계값을 넣어 보지 않았다', '커버리지 도구가 고장 났다', '>와 >=는 언제나 같은 결과를 낸다']}
        answer={1}
        explain={<>바꾼 코드는 돌연변이이고, 아무 테스트도 실패하지 않았으니 살아남은 돌연변이입니다. 조건의 참·거짓 양쪽은 지나갔지만(분기 100%), 두 연산자가 다르게 동작하는 경계값 바로 그 값은 넣지 않았다는 뜻입니다. 그림 1의 10번처럼 두 조건이 실제로 같은 뜻인 동등 돌연변이가 아니라면, 경계값 테스트를 더해야 합니다.</>}
      />
    </>
  );
}
