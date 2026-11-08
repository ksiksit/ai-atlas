import { useMemo, useState } from 'react';
import { Callout, Check, Code, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { lessonHref } from '../../../index';
import { condText, DEPENDENCIES, evaluate, report, short, startup, type Bean, type Cond, type Evaluation, type Outcome, type Startup } from './conditions';
import '../../basics/lessons/basics.css';
import './backend.css';
import './autoconfig.css';

/* ─────────────── shared views ─────────────── */

function CondRow({ c, state, ko }: { c: Cond; state: 'ok' | 'bad' | 'skip'; ko?: string }) {
  return (
    <li className="ac-cond" data-state={state}>
      <span className="ac-cond-mark" aria-hidden="true">
        {state === 'ok' ? '✓' : state === 'bad' ? '✗' : '·'}
      </span>
      <span className="ac-cond-body">
        <code>{condText(c)}</code>
        {state === 'skip' ? <span>앞 조건이 실패해 보지 않음</span> : state === 'bad' || (c.kind !== 'class' && c.kind !== 'web') ? <span>{ko}</span> : null}
      </span>
    </li>
  );
}

function OutcomeCard({ o, n }: { o: Outcome; n: number }) {
  return (
    <li className="ac-card" data-matched={o.matched || undefined}>
      <div className="ac-card-head">
        <span className="ac-card-no">{n}</span>
        <span className="ac-card-name">{o.candidate.name}</span>
        <span className="ac-card-tag">{o.matched ? '켜짐' : '꺼짐'}</span>
      </div>
      <ul className="ac-conds">
        {o.results.map((r, i) => (
          <CondRow key={i} c={r.cond} state={r.ok ? 'ok' : 'bad'} ko={r.ko} />
        ))}
        {o.skipped.map((c, i) => (
          <CondRow key={'s' + i} c={c} state="skip" />
        ))}
      </ul>
      <div className="ac-card-beans">
        {o.candidate.beans.map((b) => (
          <span key={b.name} className="ac-bean" data-on={o.matched || undefined}>
            {o.matched ? '+ ' : ''}
            {b.name}: {b.cls}
          </span>
        ))}
      </div>
    </li>
  );
}

function Verdict({ s }: { s: Startup }) {
  return (
    <div className="be-verdict" data-tone={s.ok ? 'good' : 'bad'} aria-live="polite">
      {s.ok ? (
        <span>
          <strong>애플리케이션이 떴습니다.</strong> {s.text}
        </span>
      ) : (
        <>
          <code>{s.exception}</code>
          <span>{s.text}</span>
        </>
      )}
    </div>
  );
}

/* ─────────────── Figure 1: the condition evaluator ─────────────── */

type UrlChoice = 'none' | 'h2' | 'pg';
const URLS: Record<UrlChoice, string | undefined> = { none: undefined, h2: 'jdbc:h2:mem:todo', pg: 'jdbc:postgresql://db.internal:5432/todo' };

const USER_BEANS: Record<'ds' | 'om' | 'mail', Bean> = {
  ds: { name: 'myDataSource', cls: 'HikariDataSource', provides: ['DataSource'], source: 'user', url: 'jdbc:h2:file:./data/todo' },
  om: { name: 'myObjectMapper', cls: 'ObjectMapper', provides: ['ObjectMapper'], source: 'user' },
  mail: { name: 'fakeMailSender', cls: 'FakeMailSender', provides: ['JavaMailSender', 'MailSender'], source: 'user' },
};

function gradleText(deps: Set<string>) {
  const lines = DEPENDENCIES.filter((d) => deps.has(d.id)).map((d) => `    ${d.conf} '${d.coord}'`);
  return ['dependencies {', ...(lines.length ? lines : ['    // 아무것도 없음']), '}'].join('\n');
}

function ymlText(props: Record<string, string>) {
  const keys = Object.keys(props);
  if (!keys.length) return '# 비어 있음';
  // group by the first two segments the way people write YAML
  const tree: Record<string, Record<string, string[]>> = {};
  for (const k of keys) {
    const [a, b, ...rest] = k.split('.');
    ((tree[a] ??= {})[b] ??= []).push(`${rest.join('.')}: ${props[k]}`);
  }
  const out: string[] = [];
  for (const [a, bs] of Object.entries(tree)) {
    out.push(`${a}:`);
    for (const [b, kvs] of Object.entries(bs)) {
      out.push(`  ${b}:`);
      for (const kv of kvs) {
        const [k, ...v] = kv.split(': ');
        const parts = k.split('.');
        parts.forEach((p, i) => out.push(`${'  '.repeat(i + 2)}${p}:${i === parts.length - 1 ? ' ' + v.join(': ') : ''}`));
      }
    }
  }
  return out.join('\n');
}

/** A generated config file, shown as plain text. */
function FileView({ name, text }: { name: string; text: string }) {
  return (
    <div className="ac-file">
      <div className="se-label">{name}</div>
      <pre className="code" aria-label={name}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function EvaluatorFigure() {
  const [deps, setDeps] = useState(() => new Set(['web', 'jdbc', 'h2', 'mail']));
  const [url, setUrl] = useState<UrlChoice>('none');
  const [console_, setConsole] = useState(false);
  const [mailHost, setMailHost] = useState(true);
  const [mine, setMine] = useState({ ds: false, om: false, mail: false });

  const props = useMemo(() => {
    const p: Record<string, string> = {};
    if (URLS[url]) p['spring.datasource.url'] = URLS[url]!;
    if (console_) p['spring.h2.console.enabled'] = 'true';
    if (mailHost) p['spring.mail.host'] = 'smtp.example.com';
    return p;
  }, [url, console_, mailHost]);
  const e = useMemo(() => {
    const userBeans = (Object.keys(mine) as (keyof typeof mine)[]).filter((k) => mine[k]).map((k) => USER_BEANS[k]);
    return evaluate({ deps: [...deps], props, userBeans });
  }, [deps, props, mine]);
  const s = useMemo(() => startup(e), [e]);
  const on = e.outcomes.filter((o) => o.matched).length;
  const toggle = (id: string) => {
    const n = new Set(deps);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setDeps(n);
  };

  return (
    <Figure
      no={1}
      title="자동 구성 조건 평가기"
      hint="의존성, 설정 값, 내 빈을 바꿔 보세요"
      caption={
        <>
          카드는 Spring Boot가 자동 구성 후보를 평가하는 순서입니다. 조건은 위에서부터 차례로 확인하고, 하나라도 ✗이면 그 아래는 보지 않고 카드 전체가 꺼집니다. 켜진 카드만 아래의 빈을 등록하고, 등록된 빈은 뒤에 오는 카드의 빈 조건에 보입니다. 맨 아래 상자는 이렇게 모인 빈으로 할 일 서비스의 TodoController를 만들 수 있는지 <a href={lessonHref('se-backend', 'di')}>앞 장의 컨테이너</a>로 확인한 결과입니다.
        </>
      }
    >
      <div className="fig-split left">
        <div className="controls">
          <div className="ctl">
            <span className="ctl-label">
              <span>build.gradle 의존성</span>
            </span>
            <div className="se-chips" role="group" aria-label="의존성 켜고 끄기">
              {DEPENDENCIES.map((d) => (
                <button key={d.id} type="button" className="se-chip" aria-pressed={deps.has(d.id)} data-on={deps.has(d.id) || undefined} onClick={() => toggle(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <Seg
            label="spring.datasource.url"
            value={url}
            onChange={setUrl}
            options={[
              { value: 'none', label: '없음' },
              { value: 'h2', label: 'H2 메모리' },
              { value: 'pg', label: 'PostgreSQL' },
            ]}
          />
          <div className="ctl">
            <span className="ctl-label">
              <span>application.yml</span>
            </span>
            <Check label="spring.h2.console.enabled: true" checked={console_} onChange={setConsole} />
            <Check label="spring.mail.host: smtp.example.com" checked={mailHost} onChange={setMailHost} />
          </div>
          <div className="ctl">
            <span className="ctl-label">
              <span>내가 @Bean으로 만든 빈</span>
            </span>
            <Check label="DataSource (H2 파일 DB)" checked={mine.ds} onChange={(v) => setMine({ ...mine, ds: v })} />
            <Check label="ObjectMapper" checked={mine.om} onChange={(v) => setMine({ ...mine, om: v })} />
            <Check label="JavaMailSender (가짜 메일)" checked={mine.mail} onChange={(v) => setMine({ ...mine, mail: v })} />
          </div>
          <Readout label="켜진 자동 구성" value={`${on} / ${e.outcomes.length}`} />
          <Readout label="DataSource가 연결하는 곳" value={e.beans.find((b) => b.provides.includes('DataSource'))?.url ?? '없음'} />
        </div>
        <div className="se-col">
          <div className="ac-files">
            <FileView name="build.gradle" text={gradleText(deps)} />
            <FileView name="application.yml" text={ymlText(props)} />
          </div>
          <ol className="ac-cards" aria-label="자동 구성 후보와 조건 평가 결과">
            {e.outcomes.map((o, i) => (
              <OutcomeCard key={o.candidate.name} o={o} n={i + 1} />
            ))}
          </ol>
          <Verdict s={s} />
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: my bean wins, and the report says why ─────────────── */

type DsChoice = 0 | 1 | 2 | 3;
const PG = 'jdbc:postgresql://db.internal:5432/todo';

function dsBeans(c: DsChoice): Bean[] {
  if (c === 0) return [];
  if (c === 1) return [{ name: 'todoDataSource', cls: 'HikariDataSource', provides: ['DataSource'], source: 'user', url: PG }];
  return [
    { name: 'todoDataSource', cls: 'HikariDataSource', provides: ['DataSource'], source: 'user', url: PG, primary: c === 3 },
    { name: 'reportDataSource', cls: 'HikariDataSource', provides: ['DataSource'], source: 'user', url: 'jdbc:postgresql://replica.internal:5432/todo' },
  ];
}

function DsTable({ e }: { e: Evaluation }) {
  const ds = e.beans.filter((b) => b.provides.includes('DataSource'));
  const jt = e.beans.find((b) => b.name === 'jdbcTemplate');
  return (
    <div className="se-scroll">
      <table className="ac-ds" aria-label="컨테이너의 DataSource 빈">
        <thead>
          <tr>
            <th>DataSource 빈</th>
            <th>누가 만들었나</th>
            <th>연결하는 곳</th>
            <th>JdbcTemplate</th>
          </tr>
        </thead>
        <tbody>
          {ds.map((b) => (
            <tr key={b.name} data-user={b.source === 'user' || undefined}>
              <td>
                {b.name}
                {b.primary ? ' @Primary' : ''}
              </td>
              <td>{b.source === 'user' ? '내 @Bean' : short(b.source)}</td>
              <td>{b.url}</td>
              <td className="ac-ds-used">{jt?.uses === b.name ? '← 이것을 씀' : ''}</td>
            </tr>
          ))}
          {!ds.length && (
            <tr>
              <td colSpan={4}>DataSource 빈이 없습니다</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Tags report lines for colour: matched headers, negative headers, and the condition that failed. */
function reportLines(text: string): [string, string | undefined][] {
  let inBad = false;
  return text.split('\n').map((l) => {
    if (/Did not match:$/.test(l)) inBad = true;
    else if (!/^ {9}- /.test(l)) inBad = false;
    const kind = / matched:$/.test(l) ? 'pos' : /^ {3}\w+:$/.test(l) ? 'neg' : inBad && /^ {9}- /.test(l) ? 'bad' : undefined;
    return [l, kind];
  });
}

function BackOffFigure() {
  const [c, setC] = useState<DsChoice>(1);
  const [autoFirst, setAutoFirst] = useState(false);
  const e = useMemo(() => evaluate({ deps: ['web', 'jdbc', 'h2', 'postgres', 'mail'], props: { 'spring.mail.host': 'smtp.example.com' }, userBeans: dsBeans(c), autoFirst }), [c, autoFirst]);
  const s = useMemo(() => startup(e), [e]);
  const text = useMemo(() => report(e), [e]);
  const jt = e.beans.find((b) => b.name === 'jdbcTemplate');
  const autoDs = e.outcomes.find((o) => o.candidate.name === 'DataSourceAutoConfiguration')!;

  return (
    <Figure
      no={2}
      title="내가 만든 DataSource와 자동 구성 보고서"
      hint="DataSource를 직접 등록해 보세요"
      caption={
        <>
          의존성은 starter-web, starter-jdbc, h2, postgresql, starter-mail로 고정했습니다. 표는 컨테이너에 들어간 DataSource 빈이고, 오른쪽 끝 칸이 JdbcTemplate이 실제로 받은 것입니다. 아래는 같은 평가를 Spring Boot가 <code>--debug</code>로 시작할 때 찍는 조건 평가 보고서 형식으로 적은 것입니다. 마지막 체크 상자는 실제 Spring Boot에는 없는, "만약 순서가 반대라면" 하는 가정입니다.
        </>
      }
    >
      <div className="se-col">
        <div className="controls row">
          <Seg
            label="내가 등록한 DataSource 빈"
            value={c}
            onChange={setC}
            options={[
              { value: 0, label: '없음' },
              { value: 1, label: '하나' },
              { value: 2, label: '둘' },
              { value: 3, label: '둘 + @Primary' },
            ]}
          />
          <Check label="(가정) 자동 구성을 내 빈보다 먼저 평가하기" checked={autoFirst} onChange={setAutoFirst} />
          <Readout label="DataSource 빈 개수" value={`${e.beans.filter((b) => b.provides.includes('DataSource')).length}개`} />
        </div>
        <DsTable e={e} />
        <div className="controls row">
          <Readout label="DataSourceAutoConfiguration" value={autoDs.matched ? '켜짐' : '물러남'} color={autoDs.matched ? undefined : 'var(--c-se-1)'} />
          <Readout label="JdbcTemplate이 받은 DataSource" value={jt?.uses ?? '없음 (JdbcTemplate을 못 만듦)'} color={jt ? undefined : 'var(--bad)'} />
        </div>
        <Verdict s={s} />
        <pre className="ac-report" aria-label="조건 평가 보고서" tabIndex={0}>
          {reportLines(text).map(([l, kind], i) => (
            <span key={i} data-kind={kind}>
              {l + '\n'}
            </span>
          ))}
        </pre>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function AutoConfig() {
  return (
    <>
      <h2>한 줄을 더했을 뿐인데</h2>
      <p>
        할 일 서비스에 데이터베이스를 붙이려고 build.gradle에 두 줄을 더합니다. 그리고 애플리케이션을 다시 띄우면, 아무 설정도 안 했는데 데이터베이스 연결 풀이 생기고, JdbcTemplate을 주입받아 쓸 수 있습니다. <a href={lessonHref('se-backend', 'di')}>의존성 주입</a>에서는 빈을 하나하나 등록했는데, 이 빈들은 누가 만들었을까요?
      </p>
      <Code label="build.gradle">{`
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-jdbc'   // 더한 줄
    runtimeOnly 'com.h2database:h2'                                     // 더한 줄
}`}</Code>
      <p>
        <code>spring-boot-starter-jdbc</code> 같은 의존성을 <T en="starter">스타터</T>라고 합니다. 스타터 자체에는 코드가 거의 없습니다. 함께 쓰는 라이브러리들(여기서는 spring-jdbc와 커넥션 풀 HikariCP)을 서로 맞는 버전으로 묶어 둔 목록입니다. 진짜 일은 Spring Boot 안에 미리 들어 있는 <T en="auto-configuration">자동 구성</T> 클래스들이 합니다. Spring Boot는 이런 클래스를 백 개 넘게 가지고 있고, 시작할 때마다 하나씩 "지금 이 프로젝트에 이 빈이 필요한가"를 따져서 필요한 것만 켭니다.
      </p>

      <h2>조건부 빈</h2>
      <p>"필요한가"는 조건으로 적혀 있습니다. 자동 구성 클래스나 그 안의 @Bean 메서드에 조건 애너테이션이 붙어 있고, 조건이 모두 맞을 때만 빈을 등록합니다. 자주 보는 조건은 네 가지입니다.</p>
      <ul>
        <li>
          <code>@ConditionalOnClass</code>: 어떤 클래스가 클래스패스에 있을 때. 즉 그 라이브러리를 의존성에 넣었을 때입니다. 스타터를 더하면 켜지는 이유가 이것입니다.
        </li>
        <li>
          <code>@ConditionalOnProperty</code>: application.yml에 어떤 설정 값이 있을 때, 또는 그 값이 정해진 값일 때. 기능을 켜고 끄는 스위치로 씁니다.
        </li>
        <li>
          <code>@ConditionalOnMissingBean</code>: 그 타입의 빈이 아직 없을 때. "네가 안 만들었으면 내가 기본값을 만들어 줄게"라는 뜻입니다.
        </li>
        <li>
          <code>@ConditionalOnBean</code>, <code>@ConditionalOnSingleCandidate</code>: 그 타입의 빈이 이미 있을 때(뒤의 것은 딱 하나이거나 @Primary가 하나일 때). 다른 빈 위에 쌓는 빈에 붙습니다.
        </li>
      </ul>
      <p>실제 Spring Boot의 JdbcTemplateAutoConfiguration을 조금 줄이면 이렇습니다. 조건 세 개가 모두 맞아야 JdbcTemplate이 생깁니다.</p>
      <Code label="JdbcTemplateAutoConfiguration.java (줄임)">{`
@AutoConfiguration(after = DataSourceAutoConfiguration.class)   // DataSource 평가가 끝난 뒤에
@ConditionalOnClass({ DataSource.class, JdbcTemplate.class })    // spring-jdbc가 있고
@ConditionalOnSingleCandidate(DataSource.class)                  // DataSource 빈이 하나 있을 때
public class JdbcTemplateAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(JdbcOperations.class)              // 내가 만든 JdbcTemplate이 없으면
    JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}`}</Code>
      <p>
        아래 그림은 이 장을 위해 만든 조건 평가기(<code>conditions.ts</code>)입니다. 실제 자동 구성 여덟 개를 조건과 함께 옮겨 두었고, 의존성이 클래스패스에 어떤 클래스를 올리는지, application.yml에 무엇이 있는지, 내가 어떤 빈을 만들었는지를 받아 Spring Boot와 같은 순서로 조건을 평가합니다.
      </p>
      <EvaluatorFigure />
      <p>몇 가지를 해 보세요.</p>
      <ul>
        <li>starter-mail을 끄면 MailSenderAutoConfiguration이 꺼지고, JavaMailSender가 필요한 EmailNotifier를 만들 수 없어 시작에 실패합니다. 의존성은 있는데 <code>spring.mail.host</code>만 지워도 마찬가지입니다.</li>
        <li>h2를 끄면 DataSource 조건은 맞는데 연결할 곳이 없습니다. url도 내장 데이터베이스도 없을 때 나오는 이 오류는 Spring Boot를 처음 쓸 때 가장 많이 만나는 오류 가운데 하나입니다.</li>
        <li>url을 PostgreSQL로 바꾸면 postgresql 드라이버도 의존성에 넣어야 합니다.</li>
        <li>
          <code>spring.h2.console.enabled</code>를 켜면 H2 콘솔이 생깁니다. 개발할 때만 켜는 기능이라 기본값이 꺼짐입니다. 설정 값을 환경마다 다르게 주는 방법은 <a href={lessonHref('se-basics', 'config')}>설정과 환경</a>에서 다뤘습니다.
        </li>
      </ul>
      <Callout kind="key">
        자동 구성은 마법이 아니라 조건문의 목록입니다. "이 라이브러리가 있고, 이 설정이 있고, 네가 직접 만든 게 없으면 기본값을 만든다." 무엇이 켜질지는 의존성, 설정, 내 빈 세 가지로 정해집니다.
      </Callout>

      <h2>내가 만든 빈이 이긴다</h2>
      <p>
        기본값이 마음에 들지 않으면 같은 타입의 빈을 직접 만들면 됩니다. 운영 데이터베이스에 연결하는 DataSource를 @Bean으로 등록하면, DataSourceAutoConfiguration의 <code>@ConditionalOnMissingBean(DataSource.class)</code>가 그 빈을 보고 물러납니다. 그리고 JdbcTemplate은 내 DataSource 위에 만들어집니다.
      </p>
      <Code label="DataSourceConfig.java">{`
@Configuration
public class DataSourceConfig {

    @Bean
    DataSource todoDataSource() {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(System.getenv("TODO_DB_URL"));   // 운영 데이터베이스 주소
        ds.setMaximumPoolSize(20);
        return ds;
    }
}`}</Code>
      <p>
        이것이 늘 통하는 것은 순서 덕분입니다. Spring Boot는 내 코드의 빈(컴포넌트 스캔과 @Configuration)을 먼저 모두 등록하고, 자동 구성은 맨 마지막으로 미뤄 평가합니다. 그래서 "빈이 없으면"이라는 조건이 내 빈을 확실히 볼 수 있습니다. 자동 구성끼리도 <code>@AutoConfiguration(after = …)</code>로 순서를 정해, JdbcTemplate은 DataSource에 대한 판정이 끝난 뒤에 평가됩니다.
      </p>
      <BackOffFigure />
      <p>
        DataSource를 둘 등록하면 JdbcTemplate의 <code>@ConditionalOnSingleCandidate</code>가 하나를 고르지 못해 JdbcTemplate이 생기지 않습니다. <a href={lessonHref('se-backend', 'di')}>의존성 주입</a>에서 본 것처럼 @Primary로 하나를 정해 주면 다시 생깁니다. 마지막 체크 상자를 켜 보면 순서가 왜 중요한지 보입니다. 자동 구성이 먼저 돌면 그 순간에는 DataSource가 없으므로 기본 H2 DataSource를 만들고, JdbcTemplate도 그것을 받습니다. 애플리케이션은 아무 오류 없이 뜨지만 할 일은 운영 데이터베이스가 아니라 메모리에 저장됩니다. 오류보다 무서운 경우입니다.
      </p>

      <h2>무엇이 왜 켜졌는지 확인하기</h2>
      <p>
        자동 구성이 기대와 다르게 동작할 때 추측할 필요가 없습니다. application.yml에 <code>debug: true</code>를 넣거나 <code>--debug</code>로 시작하면, 그림 2 아래와 같은 조건 평가 보고서가 로그에 찍힙니다. Positive matches는 켜진 자동 구성과 그 이유, Negative matches는 꺼진 자동 구성과 어떤 조건에서 막혔는지입니다. 운영 중인 서버라면 Actuator의 <code>/actuator/conditions</code>가 같은 내용을 JSON으로 보여 줍니다.
      </p>
      <Code label="application.yml">{`
debug: true                     # 시작할 때 조건 평가 보고서를 찍는다

spring:
  datasource:
    url: jdbc:h2:mem:todo
  h2:
    console:
      enabled: true             # H2ConsoleAutoConfiguration을 켠다
  mail:
    host: smtp.example.com      # MailSenderAutoConfiguration을 켠다
  autoconfigure:
    exclude:                    # 조건과 상관없이 아예 빼고 싶을 때
      - org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration`}</Code>
      <Callout kind="note">
        자동 구성 클래스 목록은 Spring Boot jar 안의 <code>META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports</code>라는 텍스트 파일에 한 줄에 하나씩 적혀 있습니다. 라이브러리를 만드는 사람도 같은 파일에 자기 자동 구성 클래스를 적어 두면, 그 라이브러리를 의존성에 넣는 것만으로 빈이 켜지게 할 수 있습니다. 스타터가 동작하는 방식이 바로 이것입니다.
      </Callout>
      <p>
        <a href={lessonHref('se-backend', 'aop')}>앞 장</a>의 @Transactional이 동작하려면 TransactionManager 빈이 있어야 하는데, 그림 1에서 그것을 만든 것도 DataSourceTransactionManagerAutoConfiguration이라는 자동 구성입니다. 그 트랜잭션의 경계를 어디에 둘지는 <a href={lessonHref('se-backend', 'transactions')}>트랜잭션 경계</a>에서 다룹니다.
      </p>

      <Quiz
        q={
          <>
            build.gradle에 <code>spring-boot-starter-web</code>과 <code>spring-boot-starter-jdbc</code>만 있고, application.yml에는 <code>spring.datasource.url</code>이 없습니다. h2 같은 내장 데이터베이스 의존성도 없습니다. 애플리케이션을 시작하면?
          </>
        }
        options={['DataSource 없이 정상으로 뜬다', 'H2 메모리 데이터베이스로 뜬다', "시작에 실패한다: 'url' attribute is not specified and no embedded datasource could be configured", 'JdbcTemplate만 생기고 DataSource는 생기지 않는다']}
        answer={2}
        explain={
          <>
            starter-jdbc가 DataSourceAutoConfiguration의 클래스 조건을 맞추고, 내가 만든 DataSource도 없으므로 자동 구성이 켜집니다. 그런데 막상 DataSource를 만들려고 보니 연결할 url도, 대신 쓸 내장 데이터베이스도 없어 시작 단계에서 멈춥니다. 그림 1에서 h2를 끄고 url을 "없음"으로 두면 같은 오류를 볼 수 있습니다. 고치려면 url을 주거나, h2를 넣거나, 데이터베이스가 정말 필요 없다면 starter-jdbc를 뺍니다.
          </>
        }
      />
    </>
  );
}
