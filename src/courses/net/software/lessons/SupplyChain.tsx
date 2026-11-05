import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Code, Figure, Legend, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { ADVISORY, POPULAR, SAMPLE_FILE, appDeps, flatten, isVulnerable, nearest, rangeText, resolve, sbom, stats, type TreeNode } from './deps';
import './software.css';
import './supply.css';

/* ─────────────── shared: the dependency tree as an indented list ─────────────── */

function Tree({ tree, mark, label }: { tree: TreeNode[]; mark?: boolean; label: string }) {
  const rows = flatten(tree);
  // nodes that lie on a path to a vulnerable node
  const onPath = new Set<TreeNode>();
  const visit = (n: TreeNode): boolean => {
    const below = n.children.map(visit).some(Boolean);
    const hit = !!n.version && isVulnerable(n.name, n.version);
    if (below || hit) onPath.add(n);
    return below || hit;
  };
  if (mark) tree.forEach(visit);
  return (
    <ul className="sc-tree" aria-label={label}>
      <li data-d="0" style={{ ['--d' as string]: 0 }}>
        <span className="sc-name">주문앱</span>
        <span className="sc-range">package.json</span>
      </li>
      {rows.map((n, i) => {
        const vuln = mark && !!n.version && isVulnerable(n.name, n.version);
        const fixed = mark && n.name === ADVISORY.pkg && !vuln;
        return (
          <li key={i} data-d={n.depth} style={{ ['--d' as string]: n.depth }} data-vuln={vuln || undefined} data-onpath={(mark && onPath.has(n) && !vuln) || undefined} data-fixed={fixed || undefined}>
            <span className="sc-name">{n.name}</span>
            <span className="sc-range">{n.range}</span>
            <span aria-hidden="true">→</span>
            {n.version ? (
              <span className="sc-ver">{n.version}</span>
            ) : (
              <span className="sc-ver" data-missing="">
                맞는 버전 없음
              </span>
            )}
            {vuln && <span className="sc-tag">취약 ({ADVISORY.id})</span>}
            {fixed && (
              <span className="sc-tag" data-good="">
                고친 버전
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────── Figure 1: ranges decide what gets installed ─────────────── */

const RANGES = ['^2.1.0', '~2.1.0', '2.1.0', '>=2.1.0'];

function ResolveFigure() {
  const [range, setRange] = useState('^2.1.0');
  const [view, setView] = useState<'tree' | 'sbom'>('tree');
  const tree = useMemo(() => resolve(appDeps(range), 0), [range]);
  const st = stats(tree);
  const failed = flatten(tree).some((n) => !n.version);
  const wk = tree[0].version;
  const note = failed
    ? `>=2.1.0은 메이저 버전이 올라가도 받아들이므로 web-kit ${wk}을 고릅니다. 그런데 ${wk}은 body-parse ^5.0.0을 요구하고, 아직 그런 버전이 없어 설치가 실패합니다. 설치가 됐더라도 메이저 버전이 바뀌면 API가 달라져 코드가 깨질 수 있습니다.`
    : range === '^2.1.0'
      ? `^2.1.0은 ${rangeText(range)}을 허용하므로, 레지스트리에 있는 2.x 중 가장 높은 web-kit ${wk}을 고릅니다. 버그 수정과 기능 추가는 받고, 호환이 깨지는 3.0.0은 받지 않습니다.`
      : range === '~2.1.0'
        ? `~2.1.0은 ${rangeText(range)}만 허용해 web-kit ${wk}에 머뭅니다. 2.1.0은 body-parse를 ^4.0.0으로 요구하지만, 그 범위에서도 가장 높은 4.1.3이 골라져 결과는 같습니다.`
        : `정확한 버전 2.1.0을 적으면 web-kit은 바뀌지 않습니다. 그러나 web-kit이 요구하는 하위 의존성은 여전히 범위로 적혀 있어 계속 바뀔 수 있습니다.`;
  return (
    <Figure
      no={1}
      title="범위 하나가 정하는 설치 결과"
      hint="web-kit의 버전 범위를 바꿔 보세요"
      caption={
        <>
          가상의 레지스트리와 가상의 앱 "주문앱"입니다. package.json에는 직접 의존성 3개의 버전 범위만 적고, 실제 버전은 설치할 때 레지스트리에서 범위에 맞는 가장 높은 버전으로 정해집니다. 각 패키지가 다시 자기 의존성을 범위로 적어 두므로 트리 전체가 이렇게 결정됩니다. SBOM 보기는 설치될 구성 요소를 중복 없이 나열합니다.
        </>
      }
    >
      <div className="controls row">
        <Seg label="web-kit 범위" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
        <Seg
          label="보기"
          value={view}
          onChange={setView}
          options={[
            { value: 'tree', label: '의존성 트리' },
            { value: 'sbom', label: 'SBOM' },
          ]}
        />
      </div>
      {view === 'tree' ? (
        <Tree tree={tree} label={`주문앱의 의존성 트리. web-kit ${range}은 ${wk ?? '찾을 수 없음'}으로 정해집니다.`} />
      ) : (
        <div className="sc-sbom">
          <Code label="CycloneDX 형식을 흉내 낸 SBOM">{sbom(tree)}</Code>
        </div>
      )}
      <div className="readouts">
        <Readout label="직접 의존성" value={st.direct} />
        <Readout label="트리의 노드" value={st.nodes} />
        <Readout label="내려받는 패키지" value={st.unique} />
        <Readout label="가장 깊은 단계" value={st.maxDepth} />
      </div>
      <div className="ss-note" data-bad={failed || undefined} aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: an advisory deep in the tree ─────────────── */

type Mode = 'lock' | 'update' | 'override';

function AdvisoryFigure() {
  const [mode, setMode] = useState<Mode>('lock');
  const tree = useMemo(() => resolve(appDeps(), mode === 'lock' ? 0 : 1, mode === 'override' ? { 'qs-parse': '6.9.1' } : {}), [mode]);
  const st = stats(tree);
  const qsVersions = [...new Set(flatten(tree).filter((n) => n.name === 'qs-parse').map((n) => n.version))];
  const note =
    mode === 'lock'
      ? `잠금 파일은 지난달 해석한 그대로 qs-parse 6.5.2를 설치합니다. 앱은 qs-parse를 직접 쓰지 않지만, web-kit → body-parse와 log-tiny 두 길로 취약한 버전이 들어옵니다.`
      : mode === 'update'
        ? `다시 해석하면 body-parse의 ^6.5.0은 새로 나온 6.9.1을 받아 고쳐집니다. 그러나 log-tiny는 qs-parse를 ~6.5.0으로 묶어 두어 6.5.x만 허용하므로 그 길에는 6.5.2가 남습니다. 이제 qs-parse가 두 버전 설치됩니다.`
        : `overrides로 트리 전체의 qs-parse를 6.9.1로 강제했습니다. 취약한 길이 없어졌지만, log-tiny는 6.5.x에서만 시험된 코드이므로 테스트를 돌려 동작을 확인해야 합니다. log-tiny가 범위를 넓힌 새 버전을 내면 override를 지웁니다.`;
  return (
    <Figure
      no={2}
      title="깊은 곳의 취약점이 닿는 길"
      hint="설치 방법을 바꿔 보세요"
      caption={
        <>
          가상의 보안 공지 {ADVISORY.id}: <code>qs-parse</code> {ADVISORY.below} 미만은 조작된 쿼리 문자열로 객체의 원형(prototype)을 바꿀 수 있다. 수정 버전 6.9.1은 잠금 파일을 만든 뒤에 나왔습니다. 빨간 줄은 취약한 버전, 왼쪽에 빨간 선이 있는 줄은 그 버전으로 가는 길 위의 패키지입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="설치 방법"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'lock', label: '잠금 파일대로' },
            { value: 'update', label: '범위 안에서 다시 해석' },
            { value: 'override', label: '다시 해석 + override' },
          ]}
        />
      </div>
      <Tree tree={tree} mark label={`주문앱의 의존성 트리. 취약한 qs-parse로 가는 길 ${st.vulnPaths}개.`} />
      <div className="readouts">
        <Readout label="취약한 길" value={st.vulnPaths} color={st.vulnPaths ? 'var(--bad)' : 'var(--good)'} />
        <Readout label="설치되는 qs-parse" value={qsVersions.join(', ')} />
        <Readout label="내려받는 패키지" value={st.unique} />
      </div>
      <div className="ss-note" aria-live="polite">
        {note}
      </div>
      <Legend
        items={[
          { color: 'var(--bad)', label: '취약한 버전과 그 길', shape: 'sq' },
          { color: 'var(--good)', label: '고친 버전', shape: 'sq' },
        ]}
      />
    </Figure>
  );
}

/* ─────────────── Figure 3: integrity hashes ─────────────── */

async function sha512(text: string): Promise<{ hex: string; b64: string } | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text));
  const bytes = new Uint8Array(buf);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return { hex, b64: btoa(bin) };
}

/** Change one character near the middle of the file: the colour code of "green" from 32 to 33. */
const tamper = (s: string) => s.replace('green: 32', 'green: 33');

function IntegrityFigure() {
  const [text, setText] = useState(SAMPLE_FILE);
  const [locked, setLocked] = useState<{ hex: string; b64: string } | null>(null);
  const [now, setNow] = useState<{ hex: string; b64: string } | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => {
    let live = true;
    sha512(SAMPLE_FILE).then((h) => {
      if (!live) return;
      if (!h) setUnsupported(true);
      setLocked(h);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    sha512(text).then((h) => live && setNow(h));
    return () => {
      live = false;
    };
  }, [text]);
  const same = !!locked && !!now && locked.hex === now.hex;
  const diffChars = locked && now ? [...locked.hex].filter((c, i) => c !== now.hex[i]).length : 0;
  const changedChars = [...text].filter((c, i) => c !== SAMPLE_FILE[i]).length + Math.abs(text.length - SAMPLE_FILE.length);
  // show the downloaded hash with the differing hex digits in bold
  const hexDiff = locked && now ? [...now.hex.slice(0, 64)].map((c, i) => (c === locked.hex[i] ? c : <b key={i}>{c}</b>)) : null;
  return (
    <Figure
      no={3}
      title="잠금 파일의 해시와 내려받은 파일"
      hint="파일을 고치거나 한 글자 바꾸기를 눌러 보세요"
      caption={
        <>
          잠금 파일은 버전과 함께 패키지 파일의 SHA-512 해시를 <code>integrity</code> 값으로 적어 둡니다. 설치할 때 내려받은 파일의 해시를 다시 계산해 다르면 설치를 멈춥니다. 해시는 이 브라우저의 Web Crypto로 실제로 계산합니다. 아래 16진수는 512비트(128자리) 중 앞 64자리이고, 굵은 글자가 잠금 파일과 다른 자리입니다.
        </>
      }
    >
      <label className="ss-small" htmlFor="sc-file">
        내려받은 파일 (color-ink 2.4.1의 index.js, 고칠 수 있습니다)
      </label>
      <textarea id="sc-file" className="sc-file" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="btn-row">
        <Button small onClick={() => setText(tamper(SAMPLE_FILE))}>
          한 글자 바꾸기 (32 → 33)
        </Button>
        <Button small onClick={() => setText(SAMPLE_FILE)} disabled={text === SAMPLE_FILE}>
          원래대로
        </Button>
      </div>
      {unsupported ? (
        <div className="ss-note">이 브라우저에서는 Web Crypto를 쓸 수 없어 해시를 계산하지 못했습니다.</div>
      ) : (
        <>
          <div className="sc-hashes">
            <div className="sc-hash">
              <span className="ss-small">잠금 파일의 값</span>
              <code>sha512-{locked?.b64 ?? '계산 중'}</code>
            </div>
            <div className="sc-hash">
              <span className="ss-small">내려받은 파일의 값</span>
              <code>sha512-{now?.b64 ?? '계산 중'}</code>
            </div>
            <div className="sc-hash">
              <span className="ss-small">16진수 앞 64자리</span>
              <code>{hexDiff}</code>
            </div>
          </div>
          <div className="readouts">
            <Readout label="바뀐 글자 (파일)" value={changedChars} />
            <Readout label="다른 자리 (해시 128자리 중)" value={diffChars} color={diffChars ? 'var(--bad)' : undefined} />
          </div>
          <div className="sc-verdict" data-good={same || undefined} data-bad={(!same && !!now && !!locked) || undefined} aria-live="polite">
            {!locked || !now ? '해시를 계산하는 중입니다.' : same ? '일치합니다. 잠금 파일을 만들 때와 같은 파일이므로 설치를 계속합니다.' : '일치하지 않습니다 (EINTEGRITY). 내용이 바뀐 파일이므로 설치를 멈춥니다.'}
          </div>
        </>
      )}
    </Figure>
  );
}

/* ─────────────── Figure 4: names one keystroke apart ─────────────── */

const PRESETS = ['web-klt', 'log-tinny', 'qs_parse', 'colour-ink', 'date-pal'];

function NameFigure() {
  const [name, setName] = useState('web-klt');
  const near = useMemo(() => nearest(name), [name]);
  const top = near.slice(0, 3);
  const exact = near[0]?.d === 0;
  const close = !exact && near[0] && near[0].d <= 2;
  const maxLen = Math.max(...POPULAR.map((p) => p.length));
  return (
    <Figure
      no={4}
      title="이름이 한 글자 다른 패키지"
      hint="패키지 이름을 입력해 보세요"
      caption={
        <>
          편집 거리는 한 이름을 다른 이름으로 바꾸는 데 필요한 글자 넣기, 지우기, 바꾸기의 최소 횟수입니다. 가상의 인기 패키지 {POPULAR.length}개와 비교해 가장 가까운 셋을 보여 주고, 거리가 1이나 2인데 같은 이름은 아니면 경고합니다. 일부 레지스트리는 새 이름을 등록할 때 이런 검사를 합니다.
        </>
      }
    >
      <div className="controls row">
        <div className="ctl">
          <label className="ctl-label" htmlFor="sc-name">
            <span>설치하려는 이름</span>
          </label>
          <input id="sc-name" className="sc-name-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="btn-row" role="group" aria-label="예시 이름">
          {PRESETS.map((p) => (
            <Button key={p} small onClick={() => setName(p)}>
              {p}
            </Button>
          ))}
        </div>
      </div>
      <div className="sc-near" aria-live="polite">
        {top.map((n) => (
          <div key={n.name} className="sc-near-row">
            <code>{n.name}</code>
            <span className="mono">거리 {n.d}</span>
            <span className="sc-bar" aria-hidden="true">
              <i style={{ width: `${(1 - Math.min(n.d, maxLen) / maxLen) * 100}%` }} data-warn={(n.d > 0 && n.d <= 2) || undefined} />
            </span>
          </div>
        ))}
      </div>
      <div className="ss-note" data-bad={close || undefined} data-good={exact || undefined}>
        {exact
          ? `${near[0].name}는 알려진 패키지 이름과 정확히 같습니다.`
          : close
            ? `"${name.trim()}"은 인기 패키지 ${near[0].name}와 ${near[0].d}글자 다릅니다. 오타라면 전혀 다른 사람이 올린 패키지를 설치하게 됩니다. 이름을 다시 확인하세요.`
            : '알려진 인기 패키지와 충분히 다른 이름입니다.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function SupplyChain() {
  const base = stats(resolve(appDeps(), 0));
  const upd = stats(resolve(appDeps(), 1));
  return (
    <>
      <h2>내가 쓴 코드는 일부일 뿐</h2>
      <p>
        웹 서비스를 하나 만들 때 날짜 계산, 요청 해석, 로그 출력을 처음부터 짜는 사람은 거의 없습니다. 패키지 관리자(npm, pip, cargo 등)로 남이 만든 라이브러리를 가져다 씁니다. 내가 package.json에 적은 <T en="direct dependency">직접 의존성</T>은 몇 개뿐이어도, 그 라이브러리들이 다시 다른 라이브러리를 쓰므로 실제로 설치되는 <T en="transitive dependency">간접 의존성</T>은 수백 개가 되는 일이 흔합니다. 그 코드도 내 서버에서 내 권한으로 실행됩니다.
      </p>
      <p>
        패키지 버전은 보통 <T en="semantic versioning">유의적 버전</T> <code>주.부.수</code>로 적습니다. 호환이 깨지는 변경이면 주 버전, 호환되는 기능 추가면 부 버전, 버그 수정이면 수 버전을 올리기로 약속합니다. 의존성은 정확한 버전 대신 범위로 적습니다.
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>범위</th>
              <th>허용하는 버전</th>
              <th>뜻</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['^2.1.0', '주 버전이 같으면 받는다 (기본값)'],
              ['~2.1.0', '부 버전까지 같으면 받는다'],
              ['^0.6.0', '0.x에서는 부 버전이 같아야 받는다'],
              ['2.1.0', '정확히 이 버전만'],
              ['>=2.1.0', '호환이 깨지는 버전까지 모두'],
            ].map(([r, m]) => (
              <tr key={r}>
                <td>
                  <code>{r}</code>
                </td>
                <td>{rangeText(r)}</td>
                <td>{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResolveFigure />
      <p>
        기본 설정에서 주문앱은 직접 의존성 {base.direct}개를 적었지만 트리에는 노드가 {base.nodes}개 있고, 중복을 빼면 패키지 {base.unique}개를 내려받습니다. qs-parse는 서로 다른 두 길로 들어와 두 번 나타납니다. 범위를 <code>&gt;=2.1.0</code>으로 넓히면 호환이 깨지는 web-kit 3.0.0이 골라지고, 3.0.0이 요구하는 body-parse 5.x는 아직 없어 설치가 실패합니다. 범위는 "어디까지 믿고 자동으로 받을지"를 정하는 일입니다.
      </p>
      <p>
        <strong>SBOM</strong> 보기를 눌러 보세요. <T en="software bill of materials">소프트웨어 자재 명세서</T>(SBOM)는 제품에 들어간 구성 요소를 이름과 버전으로 모두 적은 목록입니다. 새 취약점이 공개됐을 때 "우리 서비스 중 어디에 그 버전이 들어 있나"를 몇 분 만에 답하려면 이런 목록이 미리 있어야 합니다. CycloneDX와 SPDX가 널리 쓰는 형식입니다.
      </p>

      <h2>깊은 곳의 취약점</h2>
      <p>
        2021년 말에 공개된 Log4j의 취약점(Log4Shell)이 큰 혼란을 일으킨 이유 중 하나는, 많은 회사가 자기 서비스에 Log4j가 들어 있는지조차 몰랐다는 것입니다. 직접 쓰지 않고 다른 라이브러리를 거쳐 들어와 있었기 때문입니다. 그림 2는 가상의 공지 하나가 주문앱에 닿는 길을 보여 줍니다.
      </p>
      <AdvisoryFigure />
      <p>
        잠금 파일대로 설치하면 취약한 qs-parse로 가는 길이 {base.vulnPaths}개입니다. 범위 안에서 다시 해석하면(<code>npm update</code>) 하나는 고쳐지지만, log-tiny가 <code>~6.5.0</code>으로 묶어 둔 길은 그대로 남아 {upd.vulnPaths}개가 됩니다. 내가 아무리 업데이트해도 중간의 패키지가 범위를 좁게 잡아 두면 고친 버전이 들어오지 못합니다. 이때는 중간 패키지가 고칠 때까지 기다리거나, 패키지 관리자의 <code>overrides</code>(yarn은 <code>resolutions</code>)로 버전을 강제하고 테스트로 확인합니다.
      </p>
      <Callout kind="note">
        <code>npm audit</code>, GitHub의 Dependabot 같은 도구는 잠금 파일을 공개된 취약점 데이터베이스와 대조해, 어떤 길로 취약한 버전이 들어왔는지와 고친 버전이 있는지를 알려 줍니다. 알림이 너무 많아지면 실제로 그 코드가 호출되는지(도달 가능성)까지 보는 도구를 쓰기도 합니다. <a href={lessonHref('net-software-security', 'static-analysis')}>정적 분석</a>의 데이터 흐름 분석이 여기서도 쓰입니다.
      </Callout>

      <h2>잠금 파일과 해시</h2>
      <p>
        범위로만 적어 두면 오늘 설치한 것과 다음 주에 설치한 것이 다를 수 있습니다. 그래서 패키지 관리자는 실제로 고른 버전을 <T en="lockfile">잠금 파일</T>(package-lock.json, poetry.lock, Cargo.lock 등)에 적어 두고, 저장소에 함께 올립니다. 잠금 파일이 있으면 누가 언제 설치하든 같은 트리가 나옵니다. 그림 2에서 본 것처럼 이것은 고친 버전이 저절로 들어오지 않는다는 뜻이기도 하므로, 업데이트는 의도적으로, 검토를 거쳐 합니다.
      </p>
      <p>
        잠금 파일은 버전 말고도 각 패키지 파일의 <a href={lessonHref('net-security', 'symmetric')}>해시</a>를 적어 둡니다. 레지스트리나 중간의 미러가 같은 버전 번호로 다른 파일을 내놓아도 설치하는 쪽이 알아챌 수 있습니다.
      </p>
      <IntegrityFigure />
      <p>
        한 글자 바꾸기를 누르면 파일에서는 한 글자만 바뀌는데 해시는 거의 모든 자리가 달라집니다. 좋은 해시 함수는 입력이 조금만 달라도 출력이 예측할 수 없게 완전히 바뀌므로, 해시가 같도록 내용을 몰래 고치는 것은 사실상 불가능합니다. 다만 해시는 "잠금 파일을 만들 때와 같은 파일"임을 보장할 뿐, 그때 받은 파일이 안전했는지는 말해 주지 않습니다.
      </p>

      <h2>이름 하나 차이</h2>
      <p>
        공격자가 남의 패키지를 고칠 수 없다면, 사람들이 실수로 자기 패키지를 설치하게 만들 수도 있습니다. 인기 패키지와 한 글자 다른 이름으로 패키지를 올려 두고 오타를 기다리는 것을 <T en="typosquatting">타이포스쿼팅</T>이라고 합니다.
      </p>
      <NameFigure />
      <p>
        비슷한 문제로 <T en="dependency confusion">의존성 혼동</T>이 있습니다. 회사 안에서만 쓰는 패키지 이름을 누군가 공개 레지스트리에 더 높은 버전 번호로 올려 두면, 설정에 따라 패키지 관리자가 공개 쪽을 더 새 버전으로 보고 가져올 수 있습니다. 회사 패키지에는 <code>@회사/</code> 같은 범위 이름을 붙이고, 그 범위는 내부 레지스트리에서만 받도록 설정해 막습니다.
      </p>

      <h2>누가 만들었는지 확인하기</h2>
      <p>
        해시는 파일이 바뀌지 않았음을 보여 주고, <a href={lessonHref('net-security', 'public-key')}>전자 서명</a>은 그 파일을 누가 만들었는지 보여 줍니다. 오픈소스 생태계에서는 개발자마다 키를 오래 관리하기 어려워서, 빌드 서버의 신원으로 짧은 시간만 유효한 인증서를 받아 서명하고 그 기록을 누구나 볼 수 있는 투명성 로그에 남기는 Sigstore 같은 방식이 퍼지고 있습니다. npm도 패키지가 어느 저장소의 어느 빌드에서 만들어졌는지 증명하는 출처 정보(provenance)를 붙일 수 있습니다. SLSA는 빌드 과정을 얼마나 믿을 수 있는지를 단계로 나눈 기준입니다.
      </p>
      <Callout kind="warn">
        서명과 출처 증명은 "누가, 어디서 만들었는가"를 확인할 뿐 "만든 사람이 믿을 만한가"는 확인하지 못합니다. 2024년 압축 라이브러리 xz utils에서는 몇 년에 걸쳐 신뢰를 쌓은 관리자가 직접 백도어를 넣은 것이 배포 직전에 발견됐습니다. 그래서 의존성을 줄이고, 업데이트의 변경 내용을 읽고, 이상한 동작을 감시하는 일이 함께 필요합니다.
      </Callout>

      <h2>실무 습관</h2>
      <ol>
        <li>의존성을 늘리기 전에 묻습니다. 몇 줄이면 직접 쓸 수 있는 기능인가, 관리가 활발한가, 그 패키지가 다시 무엇을 끌고 오는가.</li>
        <li>잠금 파일을 저장소에 올리고, CI는 잠금 파일 그대로 설치합니다(npm ci).</li>
        <li>업데이트는 자동 알림으로 받되, 변경 내용을 읽고 테스트를 통과한 뒤에 합칩니다. 주 버전 업데이트는 따로 다룹니다.</li>
        <li>설치 스크립트처럼 설치하는 순간 실행되는 코드는 꼭 필요한 경우에만 허용합니다.</li>
        <li>SBOM을 만들어 두어, 공지가 나오면 영향받는 곳을 바로 찾습니다.</li>
      </ol>

      <Callout kind="key">
        프로그램에 들어가는 코드의 대부분은 간접 의존성이고, 버전 범위가 실제로 설치될 트리를 정합니다. 깊은 곳의 취약점은 여러 길로 들어오며, 중간 패키지가 범위를 좁게 묶어 두면 업데이트해도 남습니다. 잠금 파일은 버전과 해시를 고정해 같은 트리를 재현하고 바뀐 파일을 막지만, 고친 버전도 자동으로는 들어오지 않습니다. 비슷한 이름과 내부 이름을 노리는 공격은 이름 검사와 범위 이름으로, 출처는 서명으로 확인하고, SBOM으로 무엇이 들어 있는지 늘 알고 있어야 합니다.
      </Callout>
      <Quiz
        q="package.json에는 qs-parse가 없는데 보안 공지가 떴다. npm update를 했는데도 취약한 qs-parse 6.5.2가 남아 있다. 가장 그럴듯한 이유는?"
        options={['잠금 파일이 저장소에 올라가 있지 않아서', '어떤 의존성이 qs-parse를 ~6.5.0처럼 좁은 범위로 요구해서', 'SBOM을 만들지 않아서', '레지스트리가 해시를 검사하지 않아서']}
        answer={1}
        explain={<>npm update는 각 범위 안에서 가장 높은 버전을 고를 뿐입니다. 그림 2의 log-tiny처럼 중간 패키지가 ~6.5.0으로 묶어 두면 6.9.1은 그 범위에 들지 않아 6.5.2가 남습니다. 중간 패키지가 범위를 넓힌 새 버전을 내거나, overrides로 강제하고 테스트해야 합니다.</>}
      />
    </>
  );
}
