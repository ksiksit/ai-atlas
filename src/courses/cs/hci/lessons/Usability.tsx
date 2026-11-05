import { useMemo, useState } from 'react';
import { Button, Callout, Check, Figure, Legend, MB, Quiz, Readout, Slider, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { Plot } from '../../../../lib/plot';
import { alpha, usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { StepControls, useStepper } from '../../shared';
import { HEURISTICS, H_PROBLEMS, PROBLEM_P, SESSION, SEVERITY, SUS_ITEMS, SUS_SAMPLE, distinctFound, foundShare, foundShareMixed, simulateEvaluators, simulateStudy, susContrib, susScore, usersFor } from './usability';
import './hci.css';
import './usability.css';

const SEV_CSS = ['var(--ink-3)', 'var(--c-stats-1)', 'var(--hl)', 'var(--pos)', 'var(--bad)'];

/* ─────────────── Figure 1: watch a session, tag the problems ─────────────── */

const KIND_KO = { say: '참가자', do: '관찰', ask: '진행자' } as const;

function SessionFigure() {
  // opens on the whole session; ⏮ or ▶ replays it line by line
  const s = useStepper(SESSION.length, 1.5, 'session', true);
  const [tags, setTags] = useState<Record<number, number>>({});
  const [reveal, setReveal] = useState(false);
  const shown = SESSION.slice(0, s.i + 1);
  const atEnd = s.i >= SESSION.length - 1;

  const tag = (k: number, sev: number) =>
    setTags((t) => {
      const n = { ...t };
      if (n[k] === sev) delete n[k];
      else n[k] = sev;
      return n;
    });

  const problems = SESSION.map((l, k) => ({ l, k })).filter((x) => x.l.problem);
  const same = problems.filter(({ l, k }) => tags[k] === l.problem!.severity).length;
  const missed = problems.filter(({ k }) => !tags[k]).length;
  const extra = Object.entries(tags).filter(([k, v]) => v > 0 && !SESSION[+k].problem).length;

  return (
    <Figure
      no={1}
      title="소리 내어 생각하는 사용성 평가 한 회"
      hint="재생하며 문제가 보이는 순간에 심각도를 매겨 보세요"
      caption={
        <>
          가상의 도서관 앱으로 한 참가자에게 "빌린 책의 반납 기한 연장하기"를 시킨 기록입니다. 참가자의 말, 관찰자가 본 행동, 진행자의 말이 시간 순서로 나옵니다. 말이나 행동 옆의 0~4를 눌러 그 순간을 문제로 기록하세요. 같은 숫자를 다시 누르면 지워집니다. "관찰자 합의 보기"를 켜면 관찰자 세 명이 녹화를 다시 보고 합의한 심각도가 나란히 나옵니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <ol className="us-log" aria-label="세션 기록" aria-live="polite">
            {shown.map((l, k) => (
              <li key={k} data-kind={l.kind} data-now={k === s.i || undefined}>
                <span className="us-t mono">{l.t}</span>
                <span className="us-who">{KIND_KO[l.kind]}</span>
                <span className="us-text">{l.text}</span>
                {l.kind !== 'ask' && (
                  <span className="us-tags" role="group" aria-label={`${l.t} 순간의 심각도`}>
                    {SEVERITY.map((name, v) => (
                      <button key={v} type="button" aria-pressed={tags[k] === v} title={name} onClick={() => tag(k, v)} style={{ ['--c' as string]: SEV_CSS[v] }}>
                        {v}
                      </button>
                    ))}
                  </span>
                )}
                {reveal && l.problem && (
                  <span className="us-ref" style={{ ['--c' as string]: SEV_CSS[l.problem.severity] }}>
                    합의 {l.problem.severity} · {l.problem.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="controls">
          <StepControls s={s} id="us-speed" maxSpeed={6} />
          <Check label="관찰자 합의 보기" checked={reveal} onChange={setReveal} />
          <div className="hc-small">
            심각도: {SEVERITY.map((n, v) => `${v} ${n}`).join(' · ')}
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="매긴 순간" value={`${Object.keys(tags).length}곳`} />
            <Readout label="합의와 같은 심각도" value={`${same} / ${problems.length}`} color={same === problems.length ? 'var(--good)' : undefined} />
            <Readout label="놓친 문제" value={`${missed}곳`} color={atEnd && missed ? 'var(--bad)' : undefined} />
            <Readout label="합의에 없는 문제" value={`${extra}곳`} />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: how many users find how many problems ─────────────── */

const STUDY_USERS = 15;
const N_PROB = PROBLEM_P.length;

function DiscoveryFigure() {
  const P = usePalette();
  const [p, setP] = useState(0.31);
  const [n, setN] = useState(5);
  const [seed, setSeed] = useState(1);
  const hits = useMemo(() => simulateStudy(PROBLEM_P, STUDY_USERS, seed), [seed]);
  const found = distinctFound(hits, n);
  const uni = foundShare(p, n);
  const mixed = foundShareMixed(PROBLEM_P, n);
  let need = 1;
  while (foundShare(p, need) < 0.85 && need < 200) need++;
  const needMixed = usersFor(PROBLEM_P, 0.85);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pl = new Plot(ctx, w, h, P, { xMin: 0, xMax: 20, yMin: 0, yMax: 1, pad: { l: 44, r: 14, t: 14, b: 34 } });
      // x ticks are 0, 5, 10 …; y ticks are 0 … 1, shown in percent
      pl.grid({ xStep: 5, yStep: 0.25, fmt: (v) => (v > 1 ? String(v) : v === 0 ? '0' : `${Math.round(v * 100)}%`) });
      pl.line(n, 0, n, 1, alpha(P.ink, 0.35), 1, [4, 3]);
      pl.fn((x) => (x < 0 ? 0 : foundShare(p, x)), P.neg, 2.5);
      pl.fn((x) => (x < 0 ? 0 : foundShareMixed(PROBLEM_P, x)), P.pos, 2.5, { dash: [6, 4] });
      for (let k = 1; k <= STUDY_USERS; k++) pl.dot(k, distinctFound(hits, k) / N_PROB, k === n ? 5 : 3.5, k <= n ? P.ink : P.surface, P.ink, 1.5);
      pl.dot(n, uni, 4.5, P.neg, P.surface, 1.5);
      pl.dot(n, mixed, 4.5, P.pos, P.surface, 1.5);
      pl.text('사용자 수', w - 14, h - 8, P.ink3, { align: 'right', base: 'bottom', font: `11px ${P.fontBody}` });
    },
    [P, p, n, hits, uni, mixed],
    { height: 280 },
  );

  return (
    <Figure
      no={2}
      title="사용자 몇 명이면 문제를 몇 개 찾을까"
      hint="p와 사용자 수를 바꾸고, 다른 실험을 굴려 보세요"
      caption={
        <>
          파란 실선은 모든 문제가 같은 확률 p로 발견된다고 할 때의 기댓값 1 − (1 − p)ⁿ입니다. 주황 점선은 같은 평균(0.31)이지만 문제마다 발견 확률이 0.80에서 0.02까지 다른 가상의 제품 20개 문제의 기댓값입니다. 검은 점은 그 제품으로 사용자 {STUDY_USERS}명을 차례로 관찰한 실험 하나에서 실제로 찾은 문제의 비율입니다. 아래 표의 칸 하나는 사용자 한 명이 문제 하나를 겪었는지를 나타내고, 열은 발견 확률이 높은 문제부터 놓았습니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <div ref={wrapRef} className="canvas-box" role="img" aria-label={`사용자 수에 따른 발견 비율 그래프. 사용자 ${n}명일 때 같은 확률 모형은 ${(uni * 100).toFixed(1)}%, 확률이 제각각인 모형은 ${(mixed * 100).toFixed(1)}%, 이번 실험은 ${N_PROB}개 중 ${found}개를 찾았습니다.`}>
            <canvas ref={canvasRef} />
          </div>
          <div className="us-grid-wrap">
            <table className="us-grid" aria-label={`사용자 ${n}명이 겪은 문제 표`}>
              <thead>
                <tr>
                  <th scope="col">사용자</th>
                  {PROBLEM_P.map((q, i) => (
                    <th key={i} scope="col" title={`문제 ${i + 1}: 발견 확률 ${q}`}>
                      <span className="us-pbar" style={{ height: `${Math.round(q * 22) + 2}px` }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hits.map((row, u) => (
                  <tr key={u} data-off={u >= n || undefined}>
                    <th scope="row" className="mono">
                      {u + 1}
                    </th>
                    {row.map((hit, i) => (
                      <td key={i} data-hit={hit || undefined} />
                    ))}
                  </tr>
                ))}
                <tr className="us-union">
                  <th scope="row">찾음</th>
                  {PROBLEM_P.map((_, i) => {
                    const f = hits.slice(0, n).some((r) => r[i]);
                    return <td key={i} data-hit={f || undefined} />;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="controls">
          <Slider id="us-p" label="문제 하나를 한 명이 겪을 확률 p" value={p} min={0.05} max={0.6} step={0.01} onChange={setP} format={(v) => v.toFixed(2)} color="var(--neg)" />
          <Slider id="us-n" label="관찰한 사용자 수" value={n} min={1} max={STUDY_USERS} step={1} onChange={setN} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 실험 굴리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="같은 p 모형" value={`${(uni * 100).toFixed(1)}%`} color="var(--neg)" />
            <Readout label="제각각 모형" value={`${(mixed * 100).toFixed(1)}%`} color="var(--pos)" />
            <Readout label="이번 실험" value={`${found} / ${N_PROB}`} />
            <Readout label="85%에 필요한 인원" value={`${need}명 · ${needMixed}명`} />
          </div>
          <Legend
            items={[
              { color: 'var(--neg)', label: '같은 p', shape: 'ln' },
              { color: 'var(--pos)', label: '제각각 (평균 0.31)', shape: 'ln' },
              { color: 'var(--ink)', label: '실험 하나', shape: 'dot' },
            ]}
          />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: heuristic evaluation ─────────────── */

function HeuristicFigure() {
  const [evals, setEvals] = useState(5);
  const [seed, setSeed] = useState(1);
  const found = useMemo(() => simulateEvaluators(H_PROBLEMS, 8, seed), [seed]);
  const used = found.slice(0, evals);
  const union = H_PROBLEMS.map((_, i) => used.some((r) => r[i]));
  const nFound = union.filter(Boolean).length;
  const severe = H_PROBLEMS.map((pr, i) => ({ pr, i })).filter(({ pr }) => pr.severity >= 3);
  const severeFound = severe.filter(({ i }) => union[i]).length;
  const perEval = used.map((r) => r.filter(Boolean).length);

  return (
    <Figure
      no={3}
      title="평가자 여럿이 따로 찾고 합치기"
      hint="평가자 수를 바꿔 보세요"
      caption={
        <>
          같은 도서관 앱에 숨어 있는 문제 {H_PROBLEMS.length}개를 평가자 여덟 명이 각자 원칙 목록을 들고 찾은 가상의 결과입니다. 행은 평가자, 열은 문제이고, 색칠된 칸이 그 평가자가 보고한 문제입니다. 열 위의 숫자는 관찰자들이 매긴 심각도입니다. 마지막 행은 평가자 {evals}명의 보고를 합친 목록입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="hc-col">
          <div className="us-grid-wrap">
            <table className="us-grid us-heur" aria-label={`평가자 ${evals}명의 발견 표`}>
              <thead>
                <tr>
                  <th scope="col">평가자</th>
                  {H_PROBLEMS.map((pr, i) => (
                    <th key={i} scope="col" title={pr.name}>
                      <span className="us-sev mono" style={{ ['--c' as string]: SEV_CSS[pr.severity] }}>
                        {pr.severity}
                      </span>
                      <span className="us-colno mono">{i + 1}</span>
                    </th>
                  ))}
                  <th scope="col">개수</th>
                </tr>
              </thead>
              <tbody>
                {found.map((row, e) => (
                  <tr key={e} data-off={e >= evals || undefined}>
                    <th scope="row" className="mono">
                      {String.fromCharCode(65 + e)}
                    </th>
                    {row.map((hit, i) => (
                      <td key={i} data-hit={hit || undefined} />
                    ))}
                    <td className="mono us-count">{row.filter(Boolean).length}</td>
                  </tr>
                ))}
                <tr className="us-union">
                  <th scope="row">합침</th>
                  {union.map((f, i) => (
                    <td key={i} data-hit={f || undefined} />
                  ))}
                  <td className="mono us-count">{nFound}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ol className="us-plist">
            {H_PROBLEMS.map((pr, i) => (
              <li key={i} data-found={union[i] || undefined}>
                <span className="mono">{i + 1}</span> {pr.name} <span className="hc-small">· {HEURISTICS[pr.h]}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="controls">
          <Slider id="us-evals" label="평가자 수" value={evals} min={1} max={8} step={1} onChange={setEvals} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 평가단 굴리기
          </Button>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="찾은 문제" value={`${nFound} / ${H_PROBLEMS.length}`} />
            <Readout label="심각도 3 이상" value={`${severeFound} / ${severe.length}`} color={severeFound === severe.length ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="한 명 평균" value={`${(perEval.reduce((a, b) => a + b, 0) / perEval.length).toFixed(1)}개`} />
            <Readout label="한 명 최소·최대" value={`${Math.min(...perEval)}·${Math.max(...perEval)}개`} />
          </div>
          <div className="hc-small">열 위의 숫자: 심각도 (0 문제 아님 ~ 4 치명적). 문제 목록에서 흐린 줄은 아직 아무도 보고하지 않은 문제입니다.</div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: SUS ─────────────── */

function SusFigure() {
  const [ans, setAns] = useState<number[]>(SUS_SAMPLE);
  const contrib = susContrib(ans);
  const score = susScore(ans);
  const set = (i: number, v: number) => setAns((a) => a.map((x, k) => (k === i ? v : x)));

  return (
    <Figure
      no={4}
      title="시스템 사용성 척도(SUS) 점수 매기기"
      hint="1(전혀 아니다)~5(매우 그렇다)를 골라 보세요"
      caption={
        <>
          처음 값은 그림 1의 참가자가 과제를 마치고 고른 답입니다. 홀수 번 문항은 좋은 말이라 고른 값에서 1을 빼고, 짝수 번 문항은 나쁜 말이라 5에서 고른 값을 뺍니다. 그러면 문항마다 0~4점이 되고, 합(0~40)에 2.5를 곱해 0~100점으로 만듭니다. 백분율이 아니라 점수라는 점에 주의하세요.
        </>
      }
    >
      <div className="us-sus">
        {SUS_ITEMS.map((q, i) => (
          <div key={i} className="us-sus-row">
            <span className="mono us-sus-no">{i + 1}</span>
            <span className="us-sus-q">{q}</span>
            <span className="us-sus-pick" role="radiogroup" aria-label={`${i + 1}번 문항`}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={ans[i] === v} onClick={() => set(i, v)}>
                  {v}
                </button>
              ))}
            </span>
            <span className="mono us-sus-c" title={i % 2 === 0 ? `${ans[i]} − 1` : `5 − ${ans[i]}`}>
              {i % 2 === 0 ? `${ans[i]}−1` : `5−${ans[i]}`} = {contrib[i]}
            </span>
          </div>
        ))}
      </div>
      <div className="us-sus-total">
        <div className="us-scale" role="img" aria-label={`SUS 점수 ${score}점, 0에서 100 사이`}>
          <span className="us-scale-fill" style={{ width: `${score}%` }} />
          <span className="us-scale-mark" style={{ left: '68%' }}>
            <i>68</i>
          </span>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Readout label="문항 점수 합" value={`${contrib.reduce((a, b) => a + b, 0)} / 40`} />
          <Readout label="SUS 점수" value={`${score}`} color={score >= 68 ? 'var(--good)' : 'var(--bad)'} />
          <Readout label="자주 인용되는 평균" value="68" />
        </div>
        <div className="btn-row">
          <Button small onClick={() => setAns(SUS_SAMPLE)}>
            참가자의 답으로
          </Button>
          <Button small onClick={() => setAns([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])}>
            가장 좋은 답
          </Button>
          <Button small onClick={() => setAns([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])}>
            모두 보통(3)
          </Button>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Usability() {
  const at5 = foundShare(0.31, 5);
  const mixed5 = foundShareMixed(PROBLEM_P, 5);
  return (
    <>
      <h2>만든 사람은 자기 문제를 보지 못합니다</h2>
      <p>
        인터페이스를 설계한 사람은 버튼이 어디 있는지, 아이콘이 무슨 뜻인지, 다음 화면에 무엇이 나올지 이미 압니다. 그래서 처음 쓰는 사람이 어디서 막힐지 상상하기 어렵습니다. <a href={lessonHref('cs-hci', 'design-principles')}>설계 원칙</a>을 잘 지켜도 마찬가지입니다. 원칙은 무엇을 피해야 하는지 알려 줄 뿐, 이 앱의 이 화면에서 사람들이 실제로 무엇을 헷갈려하는지는 알려 주지 않습니다. 그것을 알아내는 가장 확실한 방법은 실제 사용자에게 써 보게 하고 지켜보는 것입니다. 이것을 <T en="usability testing">사용성 평가</T>라고 합니다.
      </p>
      <p>
        가장 흔한 형식은 <T en="task-based observation">과제 기반 관찰</T>입니다. 참가자에게 "빌린 책의 반납 기한을 연장하세요"처럼 실제로 할 법한 일을 주고, 진행자는 도와주지 않고 지켜봅니다. 참가자에게는 머릿속에 드는 생각을 그대로 말해 달라고 부탁합니다. 이것을 <T en="think-aloud">소리 내어 생각하기</T>라고 합니다. "이 사람 모양이 내 정보인가?" 같은 혼잣말이 화면만 봐서는 알 수 없는 오해를 드러냅니다. 그림 1은 그런 세션 한 회의 기록입니다.
      </p>
      <SessionFigure />
      <p>
        이 세션은 2분이 안 걸렸지만 문제가 다섯 군데에서 드러났습니다. 가장 심각한 것은 01:12의 순간입니다. 연장 버튼을 누른 뒤 아무 표시가 없어서(01:09) 참가자가 한 번 더 눌렀고, 두 번째 누름이 연장 기회를 써 버린 것으로 처리되어 오류가 떴습니다. 확인 메시지가 없다는 문제(심각도 3)가 실제 손해로 이어지는 문제(심각도 4)를 불렀습니다. 관찰자는 이렇게 문제마다 심각도를 매겨 무엇부터 고칠지 정합니다. 흔히 쓰는 척도는 0(문제 아님)부터 4(치명적: 출시 전에 반드시 고칠 것)까지이고, 얼마나 자주 일어나는지, 일어나면 얼마나 손해인지, 사용자가 스스로 피해 갈 수 있는지를 함께 따집니다.
      </p>
      <Callout kind="note">
        참가자가 막힐 때 진행자가 "그 아래에 있어요"라고 알려 주면 기록이 망가집니다. 대신 "지금 무엇을 찾고 계세요?"처럼 생각을 말하게 하는 질문만 합니다. 참가자가 자책하면("제가 잘못 눌렀나 봐요") 문제는 사람이 아니라 인터페이스에 있다고 미리 말해 둡니다. 그리고 녹화와 기록에는 동의를 받고, 이름 대신 번호로 남깁니다.
      </Callout>

      <h2>몇 명을 관찰해야 할까</h2>
      <p>
        한 명으로는 부족합니다. 그림 1의 참가자는 탭 아이콘에서 막혔지만, 다른 사람은 처음부터 "내 정보"를 눌렀을 수도 있습니다. 1993년 닐슨(Jakob Nielsen)과 란다워(Thomas Landauer)는 여러 연구를 모아, 사용자 한 명이 제품의 문제 하나를 겪을 확률이 평균 0.31쯤이라고 보고했습니다. 모든 문제를 같은 확률 p로 겪는다면, n명을 관찰했을 때 어떤 문제를 적어도 한 명이 겪을 확률은 아무도 겪지 않을 확률을 뺀 것입니다.
      </p>
      <MB note="p: 한 사용자가 한 문제를 겪을 확률, n: 관찰한 사용자 수">{String.raw`\text{찾은 비율} = 1 - (1-p)^n`}</MB>
      <p>
        p = 0.31이면 5명으로 {(at5 * 100).toFixed(1)}%를 찾습니다. "사용자 5명이면 문제의 85%를 찾는다"는 유명한 말이 여기서 나왔습니다. 그림 2에서 이 공식(파란 실선)과, 문제마다 발견 확률이 다른 좀 더 현실적인 제품(주황 점선)을 비교해 보세요.
      </p>
      <DiscoveryFigure />
      <p>
        두 모형은 평균 확률이 0.31로 같은데 결과가 꽤 다릅니다. 5명일 때 파란 선은 {(at5 * 100).toFixed(1)}%, 주황 선은 {(mixed5 * 100).toFixed(1)}%이고, 85%에 닿으려면 파란 선은 6명, 주황 선은 {usersFor(PROBLEM_P, 0.85)}명이 필요합니다. 아래 표를 보면 이유가 드러납니다. 왼쪽의 흔한 문제는 첫 한두 명이 바로 찾지만, 오른쪽의 드문 문제(발견 확률 0.02~0.06)는 5명 안에 아무도 겪지 않는 일이 많습니다. 처음 실험에서는 5명이 20개 중 12개를 찾았고, 15명을 다 봐도 18개였습니다. 평균만 같다고 같은 결과가 나오지 않는 것은 1 − (1 − p)ⁿ이 p에 대해 오목한 함수이기 때문입니다.
      </p>
      <Callout kind="intuition">
        "5명이면 충분하다"는 법칙이 아니라 경험칙입니다. 원래 권고도 5명씩 여러 번 하라는 것이었습니다. 5명으로 흔한 문제를 찾아 고치고, 고친 설계로 다시 5명을 보면, 앞의 문제에 가려 있던 문제가 드러나고 고친 것이 정말 나아졌는지도 확인됩니다. 반대로 사용자 집단이 여럿(어린이와 노인, 처음 쓰는 사람과 숙련자)이면 집단마다 따로 몇 명씩 봐야 합니다. 드물지만 치명적인 문제(결제 실패, 데이터 손실)를 찾는 데는 관찰보다 로그 분석이나 대규모 베타 테스트가 맞습니다.
      </Callout>

      <h2>사용자 없이 찾기: 휴리스틱 평가</h2>
      <p>
        사용자를 모으기 어려운 초기에는 전문가가 원칙 목록을 들고 화면을 하나씩 훑어볼 수 있습니다. 이것을 <T en="heuristic evaluation">휴리스틱 평가</T>라고 하고, 가장 널리 쓰는 목록은 닐슨의 10가지 원칙입니다. "시스템 상태를 보여 주기", "오류 예방", "기억하기보다 알아보기" 같은 항목입니다. 평가자는 원칙에 어긋나는 곳을 찾을 때마다 위치, 어긴 원칙, 심각도를 적습니다.
      </p>
      <p>
        핵심은 평가자를 여럿 두고 <strong>각자 따로</strong> 찾게 한 뒤 합치는 것입니다. 사람마다 눈에 띄는 문제가 다르기 때문입니다. 그림 3에서 평가자 수를 1명부터 늘려 보세요.
      </p>
      <HeuristicFigure />
      <p>
        처음 평가단에서 평가자 A 혼자는 14개 중 4개만 찾았고, 다섯 명을 합치면 11개가 됩니다. 평가자 B처럼 9개를 찾는 사람도 있고 E처럼 2개만 찾는 사람도 있어서, 누구를 혼자 보내느냐에 따라 결과가 크게 달라집니다. 평가자를 여럿 두면 이런 차이가 평균으로 묻힙니다. 다만 평가자 수를 계속 늘려도 같은 문제를 거듭 찾을 뿐이라 3~5명 넘어서는 얻는 것이 빠르게 줄어듭니다. 합친 뒤에는 각 문제의 심각도를 평가자들이 다시 매겨 평균을 내고, 높은 것부터 고칩니다.
      </p>
      <p>
        휴리스틱 평가는 빠르고 싸지만 한계가 있습니다. 원칙에 어긋나 보이지만 실제 사용자는 아무 문제 없이 쓰는 것(헛경보)을 찾기도 하고, 그 분야를 모르면 업무 흐름에서 생기는 문제를 놓칩니다. 그래서 휴리스틱 평가로 뻔한 문제를 먼저 치우고, 그다음 실제 사용자 평가를 하는 순서를 많이 씁니다.
      </p>

      <h2>숫자 하나로 비교하기: SUS</h2>
      <p>
        관찰은 무엇이 문제인지 알려 주지만, "새 설계가 예전보다 쓰기 쉬워졌는가"를 숫자로 비교하려면 설문이 편합니다. 1986년 브룩(John Brooke)이 만든 <T en="System Usability Scale, SUS">시스템 사용성 척도</T>는 문항 10개짜리 짧은 설문으로, 어떤 제품에나 그대로 쓸 수 있어 지금도 가장 널리 쓰입니다. 좋은 말과 나쁜 말을 번갈아 놓아, 응답자가 생각 없이 같은 번호만 고르지 못하게 했습니다.
      </p>
      <SusFigure />
      <p>
        그림 1의 참가자는 <strong>{susScore(SUS_SAMPLE)}점</strong>을 주었습니다. 여러 연구를 모은 자료에서 SUS의 평균은 68점쯤으로 자주 인용되므로, 이 앱은 평균보다 꽤 낮습니다. 모든 문항에 보통(3)을 고르면 정확히 50점이 된다는 점도 확인해 보세요. 점수 하나로는 무엇을 고쳐야 할지 알 수 없으므로, SUS는 관찰과 함께 쓰고, 설계를 바꾸기 전과 후를 같은 과제로 비교할 때 가장 쓸모 있습니다. 바꾼 설계가 정말 나아졌는지를 많은 사용자로 확인하는 방법은 다음 장의 <a href={lessonHref('cs-hci', 'ab-testing')}>A/B 테스트</a>에서 다룹니다.
      </p>

      <Callout kind="key">
        사용성 평가는 실제 사용자에게 과제를 주고 소리 내어 생각하게 하면서 어디서 막히는지 관찰하고, 찾은 문제마다 심각도를 매겨 고칠 순서를 정합니다. 한 사람이 한 문제를 겪을 확률이 p면 n명이 찾는 비율은 1 − (1 − p)ⁿ이고, p ≈ 0.31이면 5명으로 85%쯤 찾지만, 드문 문제가 섞이면 훨씬 많이 필요하므로 작게 여러 번 반복합니다. 휴리스틱 평가는 전문가 여럿이 원칙 목록으로 따로 찾아 합치는 빠른 방법이고, SUS 설문은 설계 사이의 비교를 숫자 하나로 보여 줍니다.
      </Callout>
      <Quiz
        q="사용자 5명으로 사용성 평가를 했더니 문제 9개가 나왔다. 다음 중 가장 알맞은 결론은?"
        options={['5명이면 85%를 찾으므로 남은 문제는 2개쯤이다', '흔한 문제는 대부분 찾았을 것이니, 고친 뒤 다시 5명을 관찰해 새 문제와 고친 효과를 확인한다', '9개 중 5명 모두가 겪지 않은 문제는 고칠 필요가 없다', '5명은 통계적으로 너무 적으므로 결과를 버리고 100명으로 다시 한다']}
        answer={1}
        explain={<>85%는 모든 문제의 발견 확률이 0.31로 같다는 가정에서 나온 값이라 남은 문제 수를 알려 주지 않습니다. 드문 문제는 5명으로 잘 드러나지 않으므로, 찾은 문제를 고치고 다시 관찰하는 것이 맞습니다. 한 명만 겪은 문제도 심각도가 높으면 먼저 고쳐야 하고, 관찰 평가의 목적은 비율을 추정하는 것이 아니라 문제를 찾는 것이므로 적은 인원도 쓸모 있습니다.</>}
      />
    </>
  );
}
