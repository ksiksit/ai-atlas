import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { APP_YML, ARGS_DEFAULT, ENV_DEFAULT, HISTORY, PROFILES, PROFILE_YML, SOURCE_ORDER, diffFile, hashes, isSecretKey, mask, resolve, rewrite, scan, snapshot, startup, todoLayers, type Present, type Profile, type SourceId } from './configlayers';
import './basics.css';
import './config.css';

/** A listing like <Code>, but a comment (# or //) must start a line or follow a space, so jdbc:postgresql://… stays undimmed. */
function Src({ children, label }: { children: string; label?: string }) {
  const lines = children.replace(/^\n+|\s+$/g, '').split('\n');
  return (
    <pre className="code" aria-label={label}>
      <code>
        {lines.map((line, i) => {
          const c = line.search(/(^|\s)(#(?![{!])|\/\/)/);
          return (
            <span key={i}>
              {c >= 0 ? (
                <>
                  {line.slice(0, c)}
                  <span className="cm">{line.slice(c)}</span>
                </>
              ) : (
                line
              )}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

/* ─────────────── Figure 1: where did each value come from? ─────────────── */

const SOURCE_LABEL = (p: Profile): Record<SourceId, string> => ({
  default: '코드 기본값',
  app: 'application.yml',
  profile: `application-${p}.yml`,
  env: '환경 변수',
  args: '명령줄 인자',
});

function LayersFigure() {
  const [profile, setProfile] = useState<Profile>('prod');
  const [present, setPresent] = useState<Present>({
    app: true,
    profile: true,
    env: true,
    args: false,
  });
  const [envText, setEnvText] = useState(ENV_DEFAULT);
  const [argsText, setArgsText] = useState(ARGS_DEFAULT);
  const { layers, envNames, skipped } = useMemo(() => todoLayers(profile, present, envText, argsText), [profile, present, envText, argsText]);
  const rows = useMemo(() => resolve(layers), [layers]);
  const boot = startup(rows);
  const labels = SOURCE_LABEL(profile);
  const on = (id: SourceId) => id === 'default' || present[id as keyof Present];
  const set = (k: keyof Present) => (v: boolean) => setPresent((p) => ({ ...p, [k]: v }));
  const show = (key: string, v: string) => (isSecretKey(key) ? mask(v) : v);

  return (
    <Figure
      no={1}
      title="이 값은 어디서 왔나"
      hint="프로필을 바꾸고 출처를 켜고 끄세요"
      caption={
        <>
          표의 열은 오른쪽으로 갈수록 우선순위가 높습니다. 한 줄에서 값을 가진 칸 가운데 가장 오른쪽 칸이 이기고(굵은 테두리), 그보다 왼쪽 값은 가려집니다(취소선). 꺼진 출처의 열은 흐리게 보입니다. 비밀번호는 화면에서도 가립니다. 맨 아래는
          애플리케이션이 시작하면서 최종 값을 검사한 결과입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="cf-controls">
          <Seg label="활성 프로필 (SPRING_PROFILES_ACTIVE)" value={profile} onChange={setProfile} options={PROFILES.map((p) => ({ value: p, label: p }))} />
          <div className="cf-src">
            <Check label="application.yml" checked={present.app} onChange={set('app')} />
            <Check label={`application-${profile}.yml`} checked={present.profile} onChange={set('profile')} />
          </div>
          <div className="cf-src">
            <Check label="환경 변수" checked={present.env} onChange={set('env')} />
            <textarea className="se-input cf-text cf-in" aria-label="환경 변수 (한 줄에 NAME=value)" value={envText} onChange={(e) => setEnvText(e.target.value)} disabled={!present.env} rows={2} wrap="off" spellCheck={false} />
          </div>
          <div className="cf-src">
            <Check label="명령줄 인자" checked={present.args} onChange={set('args')} />
            <input className="se-input cf-in" aria-label="명령줄 인자 (--key=value)" value={argsText} onChange={(e) => setArgsText(e.target.value)} disabled={!present.args} spellCheck={false} autoComplete="off" />
          </div>
        </div>
        <div className="cf-scroll">
          <table className="cf-table" aria-label="설정 키별 출처와 최종 값">
            <thead>
              <tr>
                <th>키</th>
                {SOURCE_ORDER.map((id) => (
                  <th key={id} data-off={!on(id) || undefined}>
                    {labels[id]}
                  </th>
                ))}
                <th>최종 값</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="cf-key">{r.key}</td>
                  {SOURCE_ORDER.map((id) => {
                    const v = r.cells[id];
                    return (
                      <td key={id} data-off={!on(id) || undefined} data-win={(v !== undefined && r.from === id) || undefined} data-lose={(v !== undefined && r.from !== id) || undefined}>
                        {v === undefined ? <span className="cf-none">·</span> : show(r.key, v)}
                        {id === 'env' && v !== undefined && envNames[r.key] && <small>{envNames[r.key]}</small>}
                      </td>
                    );
                  })}
                  <td className="cf-final" data-missing={r.from === null || undefined}>
                    {r.value === undefined ? '없음' : show(r.key, r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cf-boot" data-tone={boot.ok ? 'good' : 'bad'} aria-live="polite">
          <div className="cf-boot-head">{boot.ok ? '애플리케이션 시작' : '시작 실패: 설정을 고치세요'}</div>
          {(boot.ok ? boot.lines : boot.problems).map((l) => (
            <div key={l}>{l}</div>
          ))}
          {skipped.map((s) => (
            <div key={s} className="cf-skip">
              읽지 못한 줄 · {s}
            </div>
          ))}
        </div>
        <div className="cf-files">
          <div className="se-col" data-off={!present.app || undefined}>
            <Src label="application.yml">{APP_YML}</Src>
          </div>
          <div className="se-col" data-off={!present.profile || undefined}>
            <Src label={`application-${profile}.yml`}>{PROFILE_YML[profile]}</Src>
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: a secret in history ─────────────── */

const ORIGINAL_FINDINGS = scan(HISTORY, 'history');
const ORIGINAL_HASHES = hashes(HISTORY);

function SecretFigure() {
  const [scope, setScope] = useState<'head' | 'history'>('head');
  const [rewritten, setRewritten] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [sel, setSel] = useState(1);
  const history = useMemo(
    () =>
      rewritten
        ? rewrite(
            HISTORY,
            ORIGINAL_FINDINGS.map((f) => f.value),
          )
        : HISTORY,
    [rewritten],
  );
  const hs = useMemo(() => hashes(history), [history]);
  const findings = useMemo(() => scan(history, scope), [history, scope]);
  const allFound = useMemo(() => scan(history, 'history'), [history]);
  const before = sel > 0 ? snapshot(history, sel - 1) : {};
  const commit = history[sel];
  const status = rotated
    ? {
        tone: 'good',
        text: '안전: 새어 나간 값은 이미 폐기되어 쓸 수 없습니다',
      }
    : rewritten
      ? {
          tone: 'bad',
          text: '아직 위험: 다시 쓰기 전에 받아 간 복제본과 포크에는 그대로 있습니다',
        }
      : {
          tone: 'bad',
          text: '유출: 저장소를 받을 수 있는 누구나 옛 커밋에서 꺼낼 수 있습니다',
        };

  return (
    <Figure
      no={2}
      title="지운 비밀은 기록에 남는다"
      hint="커밋을 눌러 보고, 검사 범위를 바꿔 보세요"
      caption={
        <>
          할 일 서비스 저장소의 커밋 여섯 개입니다(위가 오래된 것). 스캐너는 정규식 규칙 세 개로 줄마다 비밀처럼 보이는 값을 찾고, <code>{'${DB_PASSWORD}'}</code>나 <code>{'<비밀번호>'}</code> 같은 자리 표시는 건너뜁니다. "모든 커밋"은 각 커밋이 더한
          줄을 검사합니다. 커밋을 누르면 그 커밋이 바꾼 내용이 보이고, 빨간 줄이 스캐너가 찾은 곳입니다. 해시는 내용과 부모 해시로 계산하므로, 기록을 다시 쓰면 그 뒤의 해시가 모두 바뀝니다.
        </>
      }
    >
      <div className="fig-split">
        <div className="se-col">
          <ol className="cf-commits" aria-label="커밋 기록">
            {history.map((c, i) => {
              const n = allFound.filter((f) => f.commit === i).length;
              const changed = hs[i] !== ORIGINAL_HASHES[i];
              return (
                <li key={i}>
                  <button type="button" className="cf-commit" data-on={i === sel || undefined} onClick={() => setSel(i)}>
                    <span className="cf-hash">
                      {changed && <s>{ORIGINAL_HASHES[i]}</s>}
                      {hs[i]}
                    </span>
                    <span className="cf-msg">{c.msg}</span>
                    {n > 0 && <span className="cf-badge">비밀 {n}</span>}
                    {i === history.length - 1 && <span className="cf-head">HEAD</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="cf-diff" aria-label={`${hs[sel]} 커밋의 변경 내용`}>
            {Object.entries(commit.files).map(([file, content]) => (
              <div key={file}>
                <div className="cf-diff-file">{file}</div>
                {diffFile(before[file], content).map((d, k) => {
                  const hit = d.kind === 'add' && allFound.find((f) => f.commit === sel && f.file === file && f.line === d.no);
                  return (
                    <div key={k} className="cf-line" data-k={d.kind} data-hit={hit ? true : undefined}>
                      <span className="cf-sign">{d.kind === 'add' ? '+' : d.kind === 'del' ? '−' : ' '}</span>
                      <span className="cf-code">{d.text || ' '}</span>
                      {hit && <span className="cf-rule">{hit.rule.label}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="controls">
          <Seg
            label="검사 범위"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'head', label: '지금 코드(HEAD)만' },
              { value: 'history', label: '모든 커밋' },
            ]}
          />
          <Check label="기록 다시 쓰기 (찾은 값을 ***REMOVED***로)" checked={rewritten} onChange={setRewritten} />
          <Check label="유출된 비밀번호와 키 교체하기" checked={rotated} onChange={setRotated} />
          <Readout label="스캐너가 찾은 비밀" value={`${findings.length}개`} color={findings.length ? 'var(--bad)' : undefined} />
          <ul className="cf-findings">
            {findings.map((f, i) => (
              <li key={i}>
                <button type="button" onClick={() => setSel(f.commit)}>
                  {hs[f.commit]} · {f.file}:{f.line}
                </button>
                <span>
                  {f.rule.label} <code>{mask(f.value)}</code>
                  {rotated && <em> 폐기됨</em>}
                </span>
              </li>
            ))}
          </ul>
          <div className="cf-status" data-tone={status.tone} aria-live="polite">
            <span className="se-label">실제 상태</span>
            {status.text}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Config() {
  return (
    <>
      <h2>코드에 박힌 값이 문제가 되는 순간</h2>
      <p>
        <a href={lessonHref('se-basics', 'http-api')}>앞 장</a>의 할 일 API를 실제 서버로 띄운다고 합시다. 서버는 몇 번 포트에서 요청을 받을지, 어느 데이터베이스에 어떤 사용자로 접속할지 알아야 합니다. 처음에는 이 값들을 코드에 그냥 적기 쉽습니다.
      </p>
      <Src label="값이 코드에 박힌 저장소 (Java)">{`
public class JdbcTodoRepository {
    private final DataSource ds = DataSource.create(
        "jdbc:postgresql://db.internal:5432/todo",   // 운영 DB 주소
        "todo_app",
        "Tod0-prod-2026");                          // 운영 비밀번호
}`}</Src>
      <p>
        그런데 같은 코드가 적어도 세 곳에서 돕니다. 개발자 노트북에서는 메모리 데이터베이스를, 자동 테스트에서는 매번 새로 만드는 테스트 데이터베이스를, 실제 서비스에서는 운영 데이터베이스를 써야 합니다. 값을 코드에 적어 두면 환경마다 코드를 고쳐
        따로 빌드해야 하고, 그러면 테스트한 것과 내보낸 것이 같은 프로그램이라고 말할 수 없습니다. 게다가 운영 비밀번호가 저장소에 들어가 버립니다.
      </p>
      <p>
        그래서 환경에 따라 달라지는 값, 곧 <T en="configuration">설정</T>을 코드에서 떼어 냅니다. 목표는 <strong>한 번 빌드한 결과물 하나를 모든 환경에 그대로 내보내고</strong>, 환경마다 설정만 바꿔 주는 것입니다. 웹 서비스 운영 경험을 정리한 "12요소
        앱(The Twelve-Factor App)"도 설정을 코드가 아니라 환경에 두라고 권합니다.
      </p>

      <h2>설정 파일, 환경 변수, 명령줄 인자</h2>
      <p>
        설정을 프로그램에 건네는 길은 크게 세 가지입니다. 다음 과목에서 쓰는 Spring Boot를 예로 듭니다. 첫째는 <T en="configuration file">설정 파일</T>입니다. Spring Boot는 <code>application.yml</code>을 읽고, 들여쓰기로 묶인 이름을 점으로 이어{' '}
        <code>spring.datasource.url</code> 같은 키로 만듭니다. 코드는 키 이름으로 값을 받기만 하고, 기본값도 그 자리에 적을 수 있습니다.
      </p>
      <Src label="application.yml">{APP_YML}</Src>
      <Code label="코드에서 설정 받기 (Java, Spring Boot)">{`
@Service
public class TodoService {
    private final int pageSize;

    public TodoService(@Value("\${todo.page-size:20}") int pageSize) {   // 없으면 20
        this.pageSize = pageSize;
    }
}`}</Code>
      <p>
        둘째는 <T en="environment variable">환경 변수</T>입니다. 운영체제가 프로세스를 띄울 때 함께 넘겨주는 이름과 값의 쌍으로, 파일을 고치지 않고 실행할 때마다 다른 값을 줄 수 있습니다. 컨테이너와 클라우드 서비스가 설정을 넘기는 기본 방법이기도
        합니다. 환경 변수 이름에는 점과 하이픈을 쓸 수 없어서, Spring Boot는 점을 밑줄로 바꾸고 하이픈을 빼고 대문자로 쓴 이름을 같은 키로 봅니다. <code>todo.page-size</code>는 <code>TODO_PAGESIZE</code>가 됩니다. 셋째는{' '}
        <T en="command-line argument">명령줄 인자</T>로, 프로그램을 띄우는 그 순간에 값을 하나 콕 집어 바꿀 때 씁니다.
      </p>
      <Src label="같은 jar를 환경 변수와 명령줄 인자로 띄우기 (셸)">{`
$ export SPRING_PROFILES_ACTIVE=prod
$ export SPRING_DATASOURCE_PASSWORD='…'          # 비밀 저장소에서 가져온 값
$ java -jar build/libs/todo-1.4.0.jar --server.port=9090

# 컨테이너라면
$ docker run -e SPRING_PROFILES_ACTIVE=prod -e SPRING_DATASOURCE_PASSWORD todo:1.4.0`}</Src>

      <h2>환경별 설정과 우선순위</h2>
      <p>
        환경마다 다른 값만 따로 모아 둔 것을 Spring Boot는 <T en="profile">프로필</T>이라고 부릅니다. <code>application-prod.yml</code>에는 운영에서만 다른 값을 적고, 실행할 때 <code>SPRING_PROFILES_ACTIVE=prod</code>로 프로필을 켭니다. 그러면 공통
        파일을 먼저 읽고, 프로필 파일이 같은 키를 덮어씁니다.
      </p>
      <p>출처가 여럿이면 같은 키에 값이 둘 이상 생깁니다. 그래서 순서를 정해 둡니다. 할 일 서비스는 Spring Boot의 규칙을 줄인 다음 순서를 씁니다. 아래로 갈수록 이깁니다.</p>
      <ol>
        <li>코드에 적은 기본값</li>
        <li>application.yml (모든 환경 공통)</li>
        <li>application-프로필.yml (그 환경에서만)</li>
        <li>환경 변수 (그 서버, 그 컨테이너에서만)</li>
        <li>명령줄 인자 (이번 실행에서만)</li>
      </ol>
      <p>규칙은 하나로 외우면 됩니다. 더 좁은 범위에, 실행하는 순간에 더 가까이 정한 값이 이깁니다. 저장소에 커밋된 파일은 모두가 함께 쓰는 기본이고, 운영자는 파일을 고치지 않고도 환경 변수와 인자로 그 위를 덮을 수 있습니다.</p>
      <LayersFigure />
      <p>
        처음 상태(prod 프로필)에서 "환경 변수"를 꺼 보세요. 운영 데이터베이스 비밀번호를 줄 곳이 사라져, 애플리케이션이 시작하지 않습니다. 설정이 잘못되었을 때는 이렇게 시작할 때 바로 멈추는 것이 좋습니다. 첫 요청에서야 데이터베이스 접속이
        실패하거나, 엉뚱한 기본값으로 조용히 돌아가는 것보다 훨씬 찾기 쉽습니다. 환경 변수 칸에 <code>SERVER_PORT=8081</code>을 한 줄 더해 보거나, test 프로필로 바꿔 데이터베이스가 어떻게 바뀌는지도 보세요.
      </p>
      <Callout kind="note">
        실제 Spring Boot의 우선순위 목록은 이보다 깁니다. jar 바깥의 <code>config/application.yml</code>, 테스트용 속성, <code>SPRING_APPLICATION_JSON</code> 등 열 가지가 넘는 출처가 있습니다. 하지만 "파일 &lt; 프로필 파일 &lt; 환경 변수 &lt;
        명령줄"이라는 뼈대는 같습니다. 무엇이 어디서 왔는지 헷갈리면 Spring Boot Actuator의 <code>/actuator/env</code>가 키마다 이긴 출처를 보여 줍니다. 그 출처 위에서 Spring Boot가 빈을 자동으로 켜고 끄는 방식은{' '}
        <a href={lessonHref('se-backend', 'auto-config')}>자동 구성</a>에서 봅니다.
      </Callout>

      <h2>비밀 값 다루기</h2>
      <p>
        설정 가운데 데이터베이스 비밀번호, 외부 API 키, 서명용 개인 키처럼 새어 나가면 안 되는 것을 <T en="secret">비밀 값</T>이라고 합니다. 비밀 값에는 규칙이 하나 더 붙습니다. <strong>저장소에 넣지 않는다</strong>. 저장소는 팀원 모두, CI 서버,
        때로는 외부 협력사까지 복제해 가는 곳이기 때문입니다. 그림 1의 application-prod.yml에도 비밀번호는 없고, 환경 변수로만 들어왔습니다.
      </p>
      <p>
        그러면 비밀 값은 어디에 두느냐. 운영에서는 <T en="secret manager">비밀 저장소</T>(HashiCorp Vault, AWS Secrets Manager, Kubernetes Secret 등)에 두고, 서버가 뜰 때 환경 변수나 파일로 넘겨받습니다. 누가 언제 어떤 비밀을 읽었는지 기록이 남고,
        값을 바꾸기도 쉽습니다. CI에서도 마찬가지로, GitHub Actions라면 저장소 설정의 Secrets에 넣고 워크플로에서는 이름으로만 가리킵니다. 로그에 찍힐 때는 자동으로 가려집니다.
      </p>
      <Src label=".github/workflows/deploy.yml (일부)">{`
- name: 운영 서버에 배포
  run: ./deploy.sh
  env:
    SPRING_PROFILES_ACTIVE: prod
    SPRING_DATASOURCE_PASSWORD: \${{ secrets.DB_PASSWORD }}   # 값은 저장소에 없다`}</Src>
      <p>
        개발자 노트북에서 쓰는 비밀은 <code>.env</code> 같은 파일에 두고 <code>.gitignore</code>에 넣어 커밋되지 않게 합니다. 그래도 실수는 생깁니다. 그래서 커밋에 비밀처럼 보이는 문자열이 있는지 기계로 찾는 <T en="secret scanning">비밀 스캐닝</T>{' '}
        도구(gitleaks, GitHub의 push protection 등)를 커밋 전과 CI에서 돌립니다. 이 도구들의 핵심은 아래 그림의 스캐너처럼 알려진 키 모양을 찾는 정규식 규칙 목록입니다.
      </p>
      <SecretFigure />
      <p>
        "지금 코드(HEAD)만"으로 검사하면 아무것도 나오지 않습니다. 비밀번호를 지우는 커밋을 이미 했으니까요. "모든 커밋"으로 바꾸면 세 개가 나옵니다. git은 모든 커밋의 내용을 보관하므로, <code>git show {ORIGINAL_HASHES[1]}</code> 한 줄이면 누구나 옛
        비밀번호를 볼 수 있습니다. 기록을 다시 쓰면 스캐너는 조용해지지만, 해시가 모두 바뀌어 팀 전체가 저장소를 새로 받아야 하고, 그 전에 복제해 간 사본과 포크, CI 캐시에는 여전히 남아 있습니다.
      </p>
      <Callout kind="key">
        비밀 값을 커밋했다면 가장 먼저 할 일은 <strong>그 값을 교체(폐기)하는 것</strong>입니다. 새 비밀번호와 새 키를 발급하고 옛 것을 못 쓰게 만들면, 기록에 무엇이 남아 있든 더는 위험하지 않습니다. 기록을 지우는 일은 그다음이고, 그것만으로는
        충분하지 않습니다.
      </Callout>

      <h2>기능 플래그</h2>
      <p>
        설정은 연결 정보만 담는 것이 아닙니다. 그림 1의 <code>todo.reminder.enabled</code>처럼 기능을 켜고 끄는 스위치도 설정으로 둘 수 있습니다. 이런 스위치를 <T en="feature flag">기능 플래그</T>라고 합니다. 마감일 알림 코드를 운영에 미리 배포해
        두되 꺼 두었다가, 준비가 되면 설정만 바꿔 켭니다. 문제가 생기면 다시 배포하지 않고 끌 수 있습니다. 코드를 내보내는 일(배포)과 사용자에게 기능을 여는 일(출시)을 떼어 놓는 것입니다.
      </p>
      <p>
        더 나아가면 사용자의 5%에게만 켜거나, 사내 직원에게만 켜는 식으로 쓸 수 있습니다. 이런 플래그는 서버를 다시 띄우지 않고 바꿀 수 있게 전용 플래그 서비스에 두는 경우가 많습니다. 이 생각은{' '}
        <a href={lessonHref('se-basics', 'deploy')}>배포와 롤백</a>의 카나리 배포와 이어집니다. 다만 플래그는 하나 늘 때마다 코드의 갈림길이 하나 늘어나므로, 기능을 다 연 뒤에는 플래그와 꺼진 쪽 코드를 지워야 합니다.
      </p>
      <p>
        다음 장 <a href={lessonHref('se-basics', 'ci')}>지속적 통합</a>에서는 커밋할 때마다 빌드와 테스트를 자동으로 돌리는 파이프라인을 만들고, 이 장의 비밀 스캐닝도 그 단계 가운데 하나로 넣습니다.
      </p>

      <Quiz
        q={
          <>
            application.yml에 <code>server.port: 8080</code>, application-prod.yml에 <code>server.port: 80</code>이 있고, 서버에는 환경 변수 <code>SERVER_PORT=8081</code>이 있습니다. prod 프로필로 명령줄 인자 없이 띄우면 몇 번 포트에서 요청을 받나요?
          </>
        }
        options={['8080', '80', '8081', '셋이 부딪혀 시작하지 않는다']}
        answer={2}
        explain={
          <>
            환경 변수가 프로필 파일보다 우선합니다. SERVER_PORT는 server.port에 붙는 이름이므로 8081이 이깁니다. 여기에 <code>--server.port=9090</code>을 붙여 띄우면 명령줄 인자가 다시 이겨 9090이 됩니다. 그림 1의 환경 변수 칸에 직접 적어 확인해
            보세요.
          </>
        }
      />
    </>
  );
}
