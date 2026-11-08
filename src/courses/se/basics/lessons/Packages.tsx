import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, Slider, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { compare, describe, fmt, installOn, maxSatisfying, parseRange, parseVersion, satisfies, type Release, type Version } from './semver';
import './basics.css';

/* ─────────────── Figure 1: which versions does a range allow? ─────────────── */

const PUBLISHED: Version[] = ['0.9.0', '1.0.0', '1.0.1', '1.1.0', '1.2.0', '1.2.3', '1.2.4', '1.3.0', '1.4.0', '2.0.0', '2.1.0', '3.0.0'].map((s) => parseVersion(s)!);

const RANGE_PRESETS = ['^1.2.0', '~1.2.0', '1.2.3', '1.x', '>=1.2.0 <2.0.0', '^0.9.0', '^1.0.0 || ^2.0.0', '*'];

function RangeFigure() {
  const [text, setText] = useState('^1.2.0');
  const range = useMemo(() => parseRange(text), [text]);
  const pick = range ? maxSatisfying(range, PUBLISHED) : null;
  const count = range ? PUBLISHED.filter((v) => satisfies(range, v)).length : 0;

  return (
    <Figure
      no={1}
      title="범위는 어떤 버전을 허락하나"
      hint="범위를 고르거나 직접 적어 보세요"
      caption={<>날짜 형식을 바꿔 주는 가상의 패키지 datefmt에 지금까지 나온 버전들입니다. 진한 칸은 범위가 허락하는 버전이고, 굵은 테두리가 설치 도구가 실제로 고르는 버전(허락된 것 가운데 가장 높은 버전)입니다.</>}
    >
      <div className="se-col">
        <div className="se-chips" role="group" aria-label="범위 예시">
          {RANGE_PRESETS.map((p) => (
            <button key={p} type="button" className="se-chip" data-on={p === text || undefined} onClick={() => setText(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="se-label" htmlFor="se-range">
          package.json의 <code>"datefmt": "…"</code>
        </label>
        <input id="se-range" className="se-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
        <div className="se-vers" aria-label="게시된 버전">
          {PUBLISHED.map((v) => {
            const ok = !!range && satisfies(range, v);
            const chosen = !!pick && compare(v, pick) === 0;
            return (
              <div key={fmt(v)} className="se-ver" data-ok={ok || undefined} data-pick={chosen || undefined}>
                {fmt(v)}
              </div>
            );
          })}
        </div>
        <div className="controls row">
          <Readout label="뜻" value={range ? describe(range) : '읽을 수 없는 범위'} />
          <Readout label="허락된 버전" value={range ? `${count}개` : '–'} />
          <Readout label="설치되는 버전" value={pick ? fmt(pick) : '없음'} color={pick ? 'var(--good)' : 'var(--bad)'} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: the build that broke overnight ─────────────── */

const RELEASES: Release[] = [
  { v: [1, 0, 0], day: -200 },
  { v: [1, 1, 0], day: -120 },
  { v: [1, 2, 0], day: -40 },
  { v: [1, 2, 1], day: -10 },
  { v: [1, 3, 0], day: 12 },
  { v: [1, 3, 1], day: 25, broken: true },
  { v: [1, 3, 2], day: 33 },
  { v: [2, 0, 0], day: 45 },
];

const SPEC_OPTS = [
  { value: '^1.2.0', label: '^1.2.0' },
  { value: '~1.2.0', label: '~1.2.0' },
  { value: '1.2.1', label: '1.2.1' },
];

function Machine({ who, day, r }: { who: string; day: string; r: Release | null }) {
  const tone = !r ? 'bad' : r.broken ? 'bad' : 'good';
  return (
    <div className="se-machine" data-tone={tone}>
      <div className="se-label">{who}</div>
      <div className="se-machine-day">{day}</div>
      <div className="se-machine-ver">datefmt {r ? fmt(r.v) : '설치 실패'}</div>
      <div className="se-machine-result">{!r ? '맞는 버전 없음' : r.broken ? '빌드 실패: formatDate가 없습니다' : '빌드 성공'}</div>
    </div>
  );
}

function LockFigure() {
  const [spec, setSpec] = useState('^1.2.0');
  const [day, setDay] = useState(20);
  const [lock, setLock] = useState(false);
  const range = parseRange(spec)!;
  const mine = installOn(range, RELEASES, 0, null);
  const ci = installOn(range, RELEASES, day, lock && mine ? mine.v : null);

  return (
    <Figure
      no={2}
      title="어젯밤에 깨진 빌드"
      hint="날짜를 넘기고 잠금 파일을 켜 보세요"
      caption={<>0일째에 프로젝트를 만들고 내 노트북에서 설치했습니다. CI 서버는 날마다 새로 설치합니다. 25일에 나온 1.3.1은 버전 번호로는 패치지만, 실수로 formatDate 함수의 이름을 바꿔 버렸습니다. 잠금 파일이 있으면 CI도 0일에 고른 버전을 그대로 씁니다.</>}
    >
      <div className="fig-split">
        <div className="se-col">
          <div className="se-timeline" aria-label="게시 일정">
            {RELEASES.map((x) => (
              <div key={fmt(x.v)} className="se-tl-item" data-out={x.day <= day || undefined} data-broken={x.broken || undefined} data-ok={satisfies(range, x.v) || undefined}>
                <span className="se-tl-ver">{fmt(x.v)}</span>
                <span className="se-tl-day">{x.day < 0 ? `${-x.day}일 전` : `${x.day}일`}</span>
              </div>
            ))}
          </div>
          <div className="se-machines">
            <Machine who="내 노트북" day="0일째에 설치" r={mine} />
            <Machine who="CI 서버" day={`${day}일째에 새로 설치`} r={ci} />
          </div>
        </div>
        <div className="controls">
          <Seg label="package.json의 범위" value={spec} options={SPEC_OPTS} onChange={setSpec} />
          <Slider label="오늘" value={day} min={0} max={60} step={1} onChange={setDay} format={(v) => `${v}일째`} />
          <Check label="잠금 파일(package-lock.json) 커밋하기" checked={lock} onChange={setLock} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Packages() {
  return (
    <>
      <h2>남의 코드 위에 짓기</h2>
      <p>
        날짜를 "2026년 11월 7일"처럼 바꿔 주는 함수가 필요하다면 직접 짤 수도 있지만, 대개는 누군가 이미 만들어 둔 것을 가져다 씁니다. 이렇게 다른 프로젝트에서 가져다 쓸 수 있게 묶어 둔 코드를 <T en="package">패키지</T>라고 하고, 내 프로젝트가 기대는 패키지를 <T en="dependency">의존성</T>이라고 합니다. JavaScript의 npm, Java의 Maven과 Gradle, Python의 pip이 패키지를 내려받고 관리하는 도구입니다.
      </p>
      <p>
        문제는 패키지도 계속 바뀐다는 것입니다. 버그가 고쳐지고, 기능이 늘고, 가끔은 예전 방식이 없어집니다. 그래서 의존성을 적을 때는 이름만이 아니라 <strong>어느 버전까지 받아들일지</strong>를 함께 적습니다.
      </p>

      <h2>버전 번호의 약속</h2>
      <p>
        많은 패키지가 <T en="Semantic Versioning">유의적 버전</T>(SemVer)이라는 규칙으로 번호를 붙입니다. <code>MAJOR.MINOR.PATCH</code> 세 숫자이고, 어느 숫자를 올렸는지가 곧 약속입니다.
      </p>
      <ul>
        <li>PATCH(1.2.3 → 1.2.4): 버그만 고쳤다. 쓰는 쪽은 아무것도 바꿀 필요가 없다.</li>
        <li>MINOR(1.2.4 → 1.3.0): 기능을 더했다. 예전 코드는 그대로 돈다.</li>
        <li>MAJOR(1.3.0 → 2.0.0): 예전 코드가 깨질 수 있는 변경이 있다.</li>
      </ul>
      <p>
        이 약속을 믿는다면, 1.2.0으로 개발한 프로그램은 2.0.0 전까지의 모든 버전에서 돌아야 합니다. 그래서 의존성에는 버전 하나 대신 <T en="version range">버전 범위</T>를 적습니다. <code>^1.2.0</code>은 "1.2.0 이상, 2.0.0 미만"이라는 뜻입니다. 0으로 시작하는 버전(0.x)은 아직 불안정하다는 뜻이라, <code>^0.9.0</code>은 0.10.0도 받아들이지 않습니다.
      </p>
      <Code label="package.json (주석은 설명용)">{`
{
  "dependencies": {
    "datefmt": "^1.2.0",   // 1.2.0 이상 2.0.0 미만
    "colors":  "~3.1.0",   // 3.1.0 이상 3.2.0 미만 (패치만)
    "uuid":    "9.0.1"     // 정확히 이 버전만
  }
}`}</Code>
      <RangeFigure />
      <Callout kind="key">설치 도구는 범위가 허락하는 버전 가운데 <strong>가장 높은 것</strong>을 고릅니다. 그래서 같은 package.json이라도 언제 설치하느냐에 따라 다른 버전이 깔릴 수 있습니다.</Callout>

      <h2>약속은 깨진다</h2>
      <p>
        버전 번호는 사람이 붙입니다. 패치라고 올린 버전에 실수로 함수 이름이 바뀌어 있을 수도 있고, 만든 사람에게는 사소한 동작 변화가 내 프로그램에는 치명적일 수도 있습니다. 그러면 이런 일이 생깁니다. 어제 내 노트북에서 잘 되던 빌드가, 오늘 아침 새로 설치한 CI 서버에서 깨집니다. 내 코드는 한 줄도 바뀌지 않았는데 말입니다.
      </p>
      <p>
        이것을 막는 것이 <T en="lock file">잠금 파일</T>입니다. 설치 도구는 실제로 고른 버전을 package-lock.json(Gradle이라면 gradle.lockfile) 같은 파일에 정확히 적어 둡니다. 이 파일을 함께 커밋하면 다른 컴퓨터도 범위를 다시 풀지 않고 적힌 버전을 그대로 설치합니다.
      </p>
      <LockFigure />
      <p>
        잠금 파일을 켜고 날짜를 25일 뒤로 넘겨 보세요. 1.3.1이 나와도 CI는 0일째의 1.2.1을 계속 씁니다. 대신 1.3.2의 버그 수정도 저절로 들어오지는 않습니다. 의존성을 올리는 일은 잠금 파일을 고치는 커밋으로, 테스트를 거쳐 일부러 하게 됩니다. 잠금 파일은 "언제 바뀌는가"를 사람이 정하게 해 줄 뿐, 업데이트를 하지 말라는 뜻이 아닙니다.
      </p>
      <Callout kind="note">
        Spring Boot 같은 프레임워크는 이 문제를 한 단계 더 줄입니다. 함께 써도 문제없다고 확인한 라이브러리 버전 묶음(BOM)을 프레임워크가 정해 주므로, 프로젝트에서는 프레임워크 버전 하나만 고르면 됩니다. 이 이야기는 다음 과목들에서 다시 만납니다.
      </Callout>
      <p>
        다음 장 <a href={lessonHref('se-basics', 'build')}>빌드와 증분 빌드</a>에서는 이렇게 모은 패키지와 내 소스 파일을 실행할 수 있는 프로그램 하나로 묶는 과정을 봅니다.
      </p>

      <Quiz
        q={
          <>
            의존성을 <code>^2.4.1</code>로 적었고 지금 2.4.1, 2.4.9, 2.5.0, 3.0.0이 나와 있습니다. 잠금 파일 없이 새로 설치하면 어느 버전이 깔리나요?
          </>
        }
        options={['2.4.1', '2.4.9', '2.5.0', '3.0.0']}
        answer={2}
        explain={<>^2.4.1은 2.4.1 이상 3.0.0 미만입니다. 그 가운데 가장 높은 2.5.0이 깔립니다. 3.0.0은 MAJOR가 바뀌었으므로 범위 밖입니다. 위의 그림 1에 직접 적어 확인해 보세요.</>}
      />
    </>
  );
}
