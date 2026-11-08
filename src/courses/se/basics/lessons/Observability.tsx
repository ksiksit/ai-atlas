import { useMemo, useState } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import {
  ALERT_BASE,
  ALERT_MINUTES,
  ALERT_REQ,
  DAYS,
  FAST_MEDIAN,
  INCIDENTS,
  REQ_PER_HOUR,
  atLeastOneSlow,
  budgetBurn,
  errorSeries,
  evaluateAlert,
  latencySample,
  logHistogram,
  summarize,
} from './metrics';
import './basics.css';
import './observability.css';

const num = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(/\.0+$/, '')}%`;
const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2).replace(/\.?0+$/, '')}초` : `${Math.round(x)}ms`);

/* ─────────────── Figure 1: what the mean hides ─────────────── */

const N = 2000;
const LO = 10;
const HI = 20000;
const PER = 10;
const HW = 600;
const HL = 40;
const HR = 12;
const HT = 18;
const HB = 192;
const HH = 214;
const hx = (v: number) => HL + (Math.log10(v / LO) / Math.log10(HI / LO)) * (HW - HL - HR);

const MARKS = [
  { key: 'mean', label: '평균', color: 'var(--c-se-2)' },
  { key: 'p50', label: 'p50', color: 'var(--ink)' },
  { key: 'p95', label: 'p95', color: 'var(--c-se-3)' },
  { key: 'p99', label: 'p99', color: 'var(--bad)' },
] as const;

function LatencyFigure() {
  const [tail, setTail] = useState(0.01);
  const [slow, setSlow] = useState(2000);
  const [logY, setLogY] = useState(false);
  const [seed, setSeed] = useState(1);
  const xs = useMemo(() => latencySample(N, tail, slow, seed), [tail, slow, seed]);
  const s = useMemo(() => summarize(xs), [xs]);
  const bins = useMemo(() => logHistogram(xs, LO, HI, PER), [xs]);
  const maxC = Math.max(...bins.map((b) => b.count));
  const yOf = (c: number) => {
    if (c <= 0) return HB;
    const f = logY ? Math.log10(1 + c) / Math.log10(1 + maxC) : c / maxC;
    return HB - f * (HB - HT);
  };
  const slowCount = xs.filter((x) => x > 500).length;

  return (
    <Figure
      no={1}
      title="평균이 숨기는 것"
      hint="느린 요청의 비율과 느린 정도를 바꿔 보세요"
      caption={
        <>
          할 일 서비스의 <code>GET /todos</code> 요청 {num(N)}개의 응답 시간입니다. 대부분은 {FAST_MEDIAN}ms 안팎이고, 고른 비율만큼은 데이터베이스 잠금을 기다리느라 훨씬 느립니다. 가로축은 로그 눈금이라 칸 하나 오른쪽으로 갈 때마다 약 1.26배씩 느려집니다. 세로선은 평균과 백분위수입니다. p99는 "요청의 99%가 이보다 빠르다"는 값입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ob-scroll">
            <svg className="ob-chart" viewBox={`0 0 ${HW} ${HH}`} role="img" aria-label={`응답 시간 히스토그램. 평균 ${ms(s.mean)}, p50 ${ms(s.p50)}, p95 ${ms(s.p95)}, p99 ${ms(s.p99)}`}>
              {[10, 100, 1000, 10000].map((v) => (
                <g key={v}>
                  <line className="ob-grid" x1={hx(v)} x2={hx(v)} y1={HT} y2={HB} />
                  <text className="ob-ax" x={hx(v)} y={HH - 4} textAnchor="middle">
                    {ms(v)}
                  </text>
                </g>
              ))}
              {bins.map((b, i) => (
                <rect key={i} className="ob-bar" data-slow={b.from >= 500 || undefined} x={hx(b.from) + 0.5} width={Math.max(0, hx(b.to) - hx(b.from) - 1)} y={yOf(b.count)} height={HB - yOf(b.count)} />
              ))}
              <line className="ob-base" x1={HL} x2={HW - HR} y1={HB} y2={HB} />
              <text className="ob-ax" x={HL - 6} y={HT + 4} textAnchor="end">
                {maxC}
              </text>
              <text className="ob-ax" x={HL - 6} y={HB} textAnchor="end">
                0
              </text>
              {MARKS.map((m, i) => (
                <g key={m.key}>
                  <line x1={hx(s[m.key])} x2={hx(s[m.key])} y1={HT - 4} y2={HB} stroke={m.color} strokeWidth={m.key === 'mean' ? 2.4 : 1.6} strokeDasharray={m.key === 'mean' ? undefined : '4 3'} />
                  <text className="ob-mark" x={hx(s[m.key]) + 4} y={HT + 8 + i * 13} fill={m.color}>
                    {m.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <Legend items={MARKS.map((m) => ({ color: m.color, label: m.label, shape: 'ln' as const }))} />
        </div>
        <div className="controls">
          <Slider label="느린 요청의 비율" value={tail} min={0} max={0.2} step={0.005} onChange={setTail} format={(v) => pct(v)} />
          <Slider label="느린 요청의 가운데 값" value={slow} min={200} max={5000} step={50} onChange={setSlow} format={ms} />
          <Check label="세로축을 로그 눈금으로" checked={logY} onChange={setLogY} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다시 뽑기 (씨앗 {seed})
          </Button>
        </div>
      </div>
      <div className="controls row ob-readouts">
        <Readout label="평균" value={ms(s.mean)} color="var(--c-se-2)" />
        <Readout label="p50 (중앙값)" value={ms(s.p50)} />
        <Readout label="p95" value={ms(s.p95)} color="var(--c-se-3)" />
        <Readout label="p99" value={ms(s.p99)} color="var(--bad)" />
        <Readout label="최댓값" value={ms(s.max)} />
        <Readout label="0.5초보다 느린 요청" value={`${slowCount}개`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: alert threshold and duration ─────────────── */

const AW = 640;
const AL = 40;
const AR = 10;
const AT = 22;
const AB = 176;
const BAR_Y = 188;
const AH = 222;
const YMAX = 0.16;
const ax = (t: number) => AL + (t / ALERT_MINUTES) * (AW - AL - AR);
const ay = (r: number) => AB - (Math.min(r, YMAX) / YMAX) * (AB - AT);

function AlertFigure() {
  const [threshold, setThreshold] = useState(0.03);
  const [forMin, setForMin] = useState(1);
  const [seed, setSeed] = useState(1);
  const series = useMemo(() => errorSeries(seed), [seed]);
  const res = useMemo(() => evaluateAlert(series.rate, threshold, forMin), [series, threshold, forMin]);
  const line = series.rate.map((r, t) => `${t ? 'L' : 'M'}${ax(t + 0.5).toFixed(1)},${ay(r).toFixed(1)}`).join(' ');

  return (
    <Figure
      no={2}
      title="경보가 울리는 조건 정하기"
      hint="임계값과 지속 시간을 바꿔 보세요"
      caption={
        <>
          어느 오후 네 시간 동안 1분마다 잰 오류율입니다(분당 요청 {ALERT_REQ}개, 평소 오류율 {pct(ALERT_BASE)}). 빨갛게 칠한 두 구간이 실제 장애입니다. 그 밖에 저절로 2분 만에 가라앉는 튐이 세 번 있습니다. 규칙은 "오류율이 임계값을 N분 연속 넘으면 울린다"입니다. 아래 막대가 경보가 울린 구간입니다. 초록은 장애를 잡은 경보, 주황은 헛경보입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ob-scroll">
            <svg className="ob-chart ob-wide" viewBox={`0 0 ${AW} ${AH}`} role="img" aria-label={`오류율 시계열. 장애 ${res.caught}개를 잡고 ${res.missed}개를 놓쳤으며 헛경보 ${res.falseAlarms}번`}>
              {INCIDENTS.map((inc, i) => (
                <g key={i}>
                  <rect className="ob-incident" x={ax(inc.from)} width={ax(inc.to) - ax(inc.from)} y={AT} height={AB - AT} />
                  <text className="ob-ax ob-inc-label" x={ax(inc.from) + 2} y={AT - 6} data-missed={res.delays[i] === null || undefined}>
                    {inc.name}
                    {res.delays[i] === null ? ' (놓침)' : ''}
                  </text>
                </g>
              ))}
              {[0, 0.04, 0.08, 0.12, 0.16].map((r) => (
                <g key={r}>
                  <line className="ob-grid" x1={AL} x2={AW - AR} y1={ay(r)} y2={ay(r)} />
                  <text className="ob-ax" x={AL - 6} y={ay(r) + 3.5} textAnchor="end">
                    {pct(r, 0)}
                  </text>
                </g>
              ))}
              <path className="ob-line" d={line} />
              <line className="ob-threshold" x1={AL} x2={AW - AR} y1={ay(threshold)} y2={ay(threshold)} />
              <line className="ob-grid" x1={AL} x2={AW - AR} y1={BAR_Y + 5} y2={BAR_Y + 5} />
              {res.episodes.map((e, i) => (
                <rect key={i} className="ob-episode" data-false={e.incident === null || undefined} x={ax(e.from)} width={Math.max(2.5, ax(e.to) - ax(e.from))} y={BAR_Y} height={10} />
              ))}
              {[0, 60, 120, 180, 240].map((t) => (
                <text key={t} className="ob-ax" x={ax(t)} y={AH - 4} textAnchor={t === 0 ? 'start' : t === 240 ? 'end' : 'middle'}>
                  {`${14 + t / 60}:00`}
                </text>
              ))}
            </svg>
          </div>
          <Legend
            items={[
              { color: 'var(--c-se-2)', label: '오류율 (1분)', shape: 'ln' },
              { color: 'var(--bad)', label: '임계값', shape: 'ln' },
              { color: 'var(--c-se-1)', label: '장애를 잡은 경보', shape: 'sq' },
              { color: 'var(--c-se-3)', label: '헛경보', shape: 'sq' },
            ]}
          />
        </div>
        <div className="controls">
          <Slider label="임계값" value={threshold} min={0.005} max={0.1} step={0.0025} onChange={setThreshold} format={(v) => pct(v, 2)} />
          <Slider label="지속 시간 (for)" value={forMin} min={1} max={20} step={1} onChange={setForMin} format={(v) => `${v}분`} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 오후 (씨앗 {seed})
          </Button>
        </div>
      </div>
      <div className="controls row ob-readouts">
        <Readout label="잡은 장애" value={`${res.caught} / ${INCIDENTS.length}`} color={res.missed ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="헛경보" value={`${res.falseAlarms}번`} color={res.falseAlarms ? 'var(--bad)' : 'var(--good)'} />
        {INCIDENTS.map((inc, i) => (
          <Readout key={i} label={`${inc.name}까지 걸린 시간`} value={res.delays[i] === null ? '놓침' : `${res.delays[i]}분`} />
        ))}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: error budget ─────────────── */

const SLOS = [
  { value: 0.99, label: '99%' },
  { value: 0.995, label: '99.5%' },
  { value: 0.999, label: '99.9%' },
  { value: 0.9999, label: '99.99%' },
];
const BW = 600;
const BL = 46;
const BR = 10;
const BT = 12;
const BB = 170;
const BH = 196;

function BudgetFigure() {
  const [slo, setSlo] = useState(0.999);
  const [seed, setSeed] = useState(1);
  const b = useMemo(() => budgetBurn(slo, seed), [slo, seed]);
  const hours = DAYS * 24;
  const worst = Math.min(...b.remaining);
  const lo = worst >= 0 ? 0 : -Math.ceil(-worst); // whole budgets overspent: -1, -2, …
  const bx = (h: number) => BL + (h / hours) * (BW - BL - BR);
  const by = (f: number) => BB - ((Math.max(lo, Math.min(1, f)) - lo) / (1 - lo)) * (BB - BT);
  const path = `M${bx(0)},${by(1)} ` + b.remaining.map((f, h) => `L${bx(h + 1).toFixed(1)},${by(f).toFixed(1)}`).join(' ');
  const used = 1 - b.remaining[b.remaining.length - 1];
  const ticks = lo === 0 ? [1, 0.5, 0] : lo === -1 ? [1, 0.5, 0, -0.5, -1] : [1, 0, Math.round(lo / 2), lo];

  return (
    <Figure
      no={3}
      title="한 달 치 오류 예산 쓰기"
      hint="목표를 바꿔 보세요"
      caption={
        <>
          한 시간에 요청이 {num(REQ_PER_HOUR)}개씩 들어오는 30일입니다. 평소에는 요청의 0.04% 안팎이 실패하고, 씨앗에 따라 정해지는 장애 몇 번(아래 눈금)에는 훨씬 많이 실패합니다. 선은 이번 달 오류 예산이 얼마나 남았는지입니다. 0 아래로 내려가면 목표를 어긴 것입니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="ob-scroll">
            <svg className="ob-chart" viewBox={`0 0 ${BW} ${BH}`} role="img" aria-label={`남은 오류 예산. 이번 달에 ${pct(used, 0)} 사용${b.outAt === null ? '' : `, ${Math.floor(b.outAt / 24) + 1}일째에 바닥`}`}>
              {ticks.map((f) => (
                <g key={f}>
                  <line className={f === 0 ? 'ob-zero' : 'ob-grid'} x1={BL} x2={BW - BR} y1={by(f)} y2={by(f)} />
                  <text className="ob-ax" x={BL - 6} y={by(f) + 3.5} textAnchor="end">
                    {pct(f, 0)}
                  </text>
                </g>
              ))}
              {b.incidents.map((inc, i) => (
                <rect key={i} className="ob-inc-tick" x={bx(inc.hour)} width={Math.max(2, bx(inc.hour + inc.hours) - bx(inc.hour))} y={BB + 4} height={6} />
              ))}
              <path className="ob-budget" d={path} />
              {b.outAt !== null && <line className="ob-out" x1={bx(b.outAt + 1)} x2={bx(b.outAt + 1)} y1={BT} y2={BB} />}
              {[1, 10, 20, 30].map((d) => (
                <text key={d} className="ob-ax" x={bx((d - 1) * 24 + (d === 30 ? 24 : 0))} y={BH - 4} textAnchor={d === 1 ? 'start' : d === 30 ? 'end' : 'middle'}>
                  {d}일
                </text>
              ))}
            </svg>
          </div>
        </div>
        <div className="controls">
          <Seg label="가용성 목표 (SLO)" value={slo} onChange={setSlo} options={SLOS} />
          <Button small onClick={() => setSeed((x) => x + 1)}>
            다른 달 (씨앗 {seed})
          </Button>
        </div>
      </div>
      <div className="controls row ob-readouts">
        <Readout label="한 달 동안 실패해도 되는 요청" value={`${num(b.budgetRequests)}개`} />
        <Readout label="전부 멈춘다면 허용되는 시간" value={b.budgetMinutes >= 120 ? `${(b.budgetMinutes / 60).toFixed(1)}시간` : `${b.budgetMinutes.toFixed(1)}분`} />
        <Readout label="이번 달에 쓴 예산" value={pct(used, 0)} color={used > 1 ? 'var(--bad)' : undefined} />
        <Readout label="바닥난 날" value={b.outAt === null ? '남음' : `${Math.floor(b.outAt / 24) + 1}일째`} color={b.outAt === null ? 'var(--good)' : 'var(--bad)'} />
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Observability() {
  const pageSlow = Math.round(atLeastOneSlow(20, 0.99) * 100);
  return (
    <>
      <h2>로그, 지표, 추적: 무엇을 언제 쓰나</h2>
      <p>
        <a href={lessonHref('se-basics', 'deploy')}>배포와 롤백</a>에서 본 카나리도, 순차 배포를 멈추는 결정도 모두 누군가 서비스 안을 보고 있어야 할 수 있습니다. 돌아가는 서비스의 상태를 바깥에서 알아낼 수 있는 정도를 <T en="observability">관측 가능성</T>이라고 합니다. 이를 위해 서비스가 내보내는 신호는 크게 세 가지입니다.
      </p>
      <ul>
        <li>
          <T en="log">로그</T>: 일이 하나 일어날 때마다 남기는 기록입니다. "할 일 42번 저장 실패, 데이터베이스 연결 시간 초과"처럼 무슨 일이 왜 일어났는지 자세히 알려 줍니다.
        </li>
        <li>
          <T en="metric">지표</T>: 숫자를 시간에 따라 모은 것입니다. 분당 요청 수, 오류율, 응답 시간 분포처럼 미리 정한 숫자만 셉니다. 저장 공간이 적게 들어 오래 보관하고 그래프와 경보에 씁니다.
        </li>
        <li>
          <T en="trace">추적</T>: 요청 하나가 여러 서비스를 거치는 동안 각 구간에서 얼마나 걸렸는지 이은 기록입니다. 어디서 느려졌는지 찾을 때 씁니다.
        </li>
      </ul>
      <p>보통의 순서는 이렇습니다. 지표의 경보가 "무언가 잘못됐다"고 알리고, 추적이 "어디서"를 좁히고, 로그가 "왜"를 알려 줍니다.</p>

      <h2>구조화된 로그</h2>
      <p>
        로그를 사람이 읽는 문장으로만 남기면, 하루에 수백만 줄이 쌓였을 때 원하는 줄을 찾기 어렵습니다. "사용자 u-381의 요청 가운데 1초보다 오래 걸린 것"을 찾으려면 문장마다 숫자를 뽑아내는 정규식을 짜야 합니다. 그래서 요즘은 한 줄을 이름 붙은 필드의 묶음, 보통 JSON 한 줄로 남기는 <T en="structured logging">구조화된 로그</T>를 씁니다.
      </p>
      <Code label="문장 로그와 구조화된 로그">{`
# 사람에게는 읽기 쉽지만 기계가 쪼개기 어렵다
2026-11-07 14:03:12 ERROR Failed to save todo 42 for user u-381 (took 1830ms)

# 같은 사건을 JSON 한 줄로
{"ts":"2026-11-07T14:03:12.481Z","level":"error","service":"todo-api",
 "msg":"save failed","todo_id":42,"user":"u-381","duration_ms":1830,
 "error":"timeout acquiring db connection","trace_id":"4bf92f3577b34da6"}`}</Code>
      <p>
        이제 로그 저장소에서 <code>level = "error" AND duration_ms &gt; 1000</code>처럼 필드로 걸러 낼 수 있습니다. 마지막의 <code>trace_id</code>가 중요합니다. 요청이 들어올 때 붙인 이 값을 그 요청이 거치는 모든 서비스의 로그에 함께 남기면, 서로 다른 서버의 로그를 요청 하나로 묶어 볼 수 있습니다. 추적은 이 아이디로 구간들을 이은 것입니다.
      </p>
      <Code label="추적 하나 (trace_id 4bf92f3577b34da6)">{`
POST /todos                                   1,912ms
└─ todo-api       요청 처리                      1,905ms
   ├─ auth-svc    토큰 확인                         12ms
   └─ postgres    INSERT INTO todos            1,861ms  ← 대부분이 여기`}</Code>
      <Callout kind="warn">
        로그에는 비밀번호, 토큰, 카드 번호 같은 값을 남기지 않습니다. 로그는 많은 사람이 보고 오래 남는 곳입니다. <a href={lessonHref('se-basics', 'config')}>설정과 환경</a>에서 비밀 값을 코드에서 떼어 냈듯이, 로그 출력에서도 가리는 규칙을 둡니다.
      </Callout>

      <h2>평균이 숨기는 것: p50, p95, p99</h2>
      <p>
        "응답 시간 평균 116ms"는 좋은 소식처럼 들립니다. 하지만 사용자 백 명 중 한 명이 2초씩 기다리고 있을 수도 있습니다. 평균은 대부분의 빠른 요청 속에 소수의 느린 요청을 녹여 버립니다. 그래서 응답 시간은 <T en="percentile">백분위수</T>로 봅니다. 요청을 빠른 순서로 줄 세웠을 때 50% 지점이 p50(중앙값), 99% 지점이 p99입니다. p99가 2초라면 요청 백 개 중 하나는 2초보다 오래 걸린다는 뜻입니다. 평균과 중앙값의 차이는 <a href={lessonHref('stats-basics', 'summary')}>데이터 요약하기</a>에서도 봤습니다.
      </p>
      <LatencyFigure />
      <p>
        느린 요청 비율을 0%에서 1%로 올려 보세요. 평균은 수십 ms 늘 뿐이고 p50과 p95는 거의 그대로인데, p99는 몇 배로 뜁니다. 비율을 5%로 올리면 이번에는 p95가 뜁니다. 꼬리가 얼마나 두꺼운지에 따라 어느 백분위수가 먼저 반응하는지가 달라집니다. 세로축을 로그 눈금으로 바꾸면 보통 눈금에서는 바닥에 붙어 안 보이던 느린 요청들이 오른쪽에 따로 모인 것이 보입니다.
      </p>
      <Callout kind="key">
        1%는 작아 보이지만, 화면 하나를 그리려고 요청을 20개 보내는 페이지라면 그 페이지를 여는 사람의 {pageSlow}%가 p99보다 느린 요청을 적어도 하나 겪습니다(1 − 0.99<sup>20</sup>). 자주 오는 사용자일수록 꼬리를 자주 만납니다. 그래서 응답 시간의 목표는 평균이 아니라 p95나 p99로 정합니다.
      </Callout>
      <p>
        백분위수는 평균처럼 서버마다 따로 구한 값을 다시 평균 낼 수 없습니다. 서버 열 대의 p99를 평균 내도 전체의 p99가 되지 않습니다. 그래서 지표 시스템은 응답 시간을 칸(버킷)마다 센 <T en="histogram">히스토그램</T>으로 모으고, 칸의 개수를 모두 더한 뒤 백분위수를 계산합니다. Prometheus라면 서비스가 <code>/metrics</code> 주소로 이런 숫자를 내놓습니다.
      </p>
      <Code label="터미널 (Prometheus 형식의 지표)">{`
$ curl -s localhost:8080/metrics | grep http_server
http_server_requests_total{route="/todos",status="200"} 182311
http_server_requests_total{route="/todos",status="500"} 941
http_server_duration_seconds_bucket{route="/todos",le="0.1"} 151208
http_server_duration_seconds_bucket{route="/todos",le="0.25"} 180977
http_server_duration_seconds_bucket{route="/todos",le="1"} 181402
http_server_duration_seconds_bucket{route="/todos",le="+Inf"} 183252
http_server_duration_seconds_sum{route="/todos"} 21940.7
http_server_duration_seconds_count{route="/todos"} 183252`}</Code>

      <h2>경보 설계: 너무 자주도 너무 늦게도 울리지 않게</h2>
      <p>
        지표를 그래프로만 두면 누군가 계속 쳐다봐야 합니다. <T en="alert">경보</T>는 조건이 맞을 때 당번 개발자의 전화를 울립니다. 경보에는 두 가지 실패가 있습니다. 진짜 장애인데 울리지 않는 것(놓침)과, 장애가 아닌데 울리는 것(헛경보)입니다. 헛경보가 잦으면 사람들은 경보를 무시하기 시작하고, 결국 진짜 경보도 무시당합니다.
      </p>
      <p>
        경보 규칙은 보통 임계값과 <strong>지속 시간</strong>을 함께 정합니다. "오류율이 3%를 넘으면"이 아니라 "오류율이 3%를 5분 동안 계속 넘으면"입니다. 지속 시간은 저절로 가라앉는 짧은 튐을 걸러 주지만, 그만큼 경보가 늦게 울리고, 지속 시간보다 짧은 장애는 아예 못 잡습니다.
      </p>
      <AlertFigure />
      <p>
        처음 설정(3%, 1분)에서는 튐 세 번이 모두 헛경보가 됩니다. 지속 시간을 10분으로 늘리면 헛경보는 사라지지만 8분짜리 큰 장애도 놓치고, 3%에 가까운 느린 장애도 놓칩니다. 임계값을 1%로 내리면 느린 장애는 바로 잡지만, 평소의 잡음이 임계값을 넘나들어 헛경보가 쏟아집니다. 임계값을 평소보다 확실히 높되 느린 장애보다는 낮게(예: 1.5%), 지속 시간은 튐보다 길되 짧은 장애보다는 짧게(예: 3분) 잡아 보세요. 두 장애를 모두 잡고 헛경보가 없는 칸이 생각보다 좁다는 것을 알 수 있습니다.
      </p>
      <Code label="alerts.yml (Prometheus 경보 규칙)">{`
groups:
  - name: todo-api
    rules:
      - alert: TodoApiHighErrorRate
        expr: |
          sum(rate(http_server_requests_total{status=~"5.."}[1m]))
            / sum(rate(http_server_requests_total[1m])) > 0.015
        for: 3m                 # 3분 동안 계속 넘어야 울린다
        labels:
          severity: page        # 당번의 전화를 울린다
        annotations:
          summary: "todo-api 오류율 {{ $value | humanizePercentage }}"
      - alert: TodoApiSlow
        expr: |
          histogram_quantile(0.99,
            sum by (le) (rate(http_server_duration_seconds_bucket[5m]))) > 1
        for: 10m`}</Code>
      <Callout kind="note">
        좋은 경보는 사용자가 겪는 증상(오류율, 응답 시간)에 겁니다. CPU 사용률 90% 같은 원인에 경보를 걸면, 사용자는 아무 문제가 없는데 새벽에 전화가 울리기 쉽습니다. 원인 지표는 경보가 울린 뒤 찾아볼 대시보드에 둡니다.
      </Callout>

      <h2>서비스 수준 목표(SLO)와 오류 예산</h2>
      <p>
        임계값을 몇으로 할지는 결국 "이 서비스는 얼마나 믿을 만해야 하는가"라는 질문으로 돌아옵니다. 이 답을 숫자로 적은 것이 <T en="service level objective">서비스 수준 목표</T>(SLO)입니다. 예를 들어 "30일 동안 요청의 99.9%가 성공한다". 이렇게 정하면 나머지 0.1%는 실패해도 되는 몫, 곧 <T en="error budget">오류 예산</T>이 됩니다. 99.9%라면 한 달에 서비스 전체가 43분 멈춰도 되는 만큼입니다.
      </p>
      <BudgetFigure />
      <p>
        목표를 99.99%로 올려 보세요. 같은 달인데 며칠 만에 예산이 바닥납니다. 목표에 9를 하나 더 붙일 때마다 허용되는 실패는 10분의 1로 줄고, 그만큼 비용(더 많은 서버, 더 느린 배포, 더 많은 당번)이 듭니다. 100%는 목표가 될 수 없습니다. 사용자의 와이파이도 그보다는 자주 끊깁니다.
      </p>
      <p>
        오류 예산은 팀의 결정을 돕습니다. 예산이 넉넉하면 새 기능을 자주 배포하고, 바닥나면 기능 배포를 멈추고 안정성을 고치는 데 시간을 씁니다. 경보도 예산으로 겁니다. 지금의 오류율이 예산을 몇 배 빠르기로 쓰는지를 <T en="burn rate">소진 속도</T>라고 하는데, 99.9% 목표에서 오류율이 1.44%면 소진 속도는 14.4배이고, 이대로면 한 달 예산이 이틀 남짓 만에 사라집니다. "1시간 동안 소진 속도 14.4배 이상"이면 전화를 울리고, "6시간 동안 6배 이상"이면 업무 시간에 볼 일감을 만드는 식으로, 급한 정도에 따라 경보를 나눕니다.
      </p>

      <Quiz
        q={
          <>
            <code>GET /todos</code> 요청 1,000개 중 985개는 100ms, 15개는 3,000ms가 걸렸습니다. 평균은 143.5ms, p50은 100ms입니다. p99는 얼마일까요?
          </>
        }
        options={['100ms', '143.5ms', '약 1,500ms', '3,000ms']}
        answer={3}
        explain={
          <>
            빠른 순서로 줄 세우면 986번째부터 1,000번째까지 15개가 3,000ms입니다. 99% 지점(990번째 근처)은 이 느린 무리 안에 있으므로 p99는 3,000ms입니다. 평균 143.5ms만 보면 모두 괜찮아 보이지만, 사용자 백 명 중 한 명 이상은 3초를 기다립니다. 느린 요청이 1% 아래(예: 9개)였다면 p99는 100ms로 내려갔을 것입니다.
          </>
        }
      />
    </>
  );
}
