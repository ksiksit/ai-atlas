/**
 * A small condition evaluator in the style of Spring Boot's auto-configuration.
 *
 * Inputs are what a project actually controls: the dependencies in build.gradle (which put classes
 * on the classpath), the keys in application.yml, and the beans the developer declared. The user's
 * beans are registered first; then every auto-configuration candidate is evaluated in order
 * (alphabetical, then moved after the configurations it names in `after`). A candidate whose
 * conditions all hold registers its beans, so later candidates can see them. The result reads like
 * the condition evaluation report Spring Boot prints with --debug.
 */

import { explain, resolve, type BeanDef } from './container';

/* ─────────────── the project: dependencies, properties, beans ─────────────── */

export interface Dependency {
  id: string;
  /** Gradle configuration and coordinates, as they appear in build.gradle. */
  conf: 'implementation' | 'runtimeOnly';
  coord: string;
  /** Short name for buttons. */
  label: string;
  /** Fully qualified class names this dependency puts on the classpath. */
  classes: string[];
}

export const DEPENDENCIES: Dependency[] = [
  {
    id: 'web',
    conf: 'implementation',
    coord: 'org.springframework.boot:spring-boot-starter-web',
    label: 'starter-web',
    classes: ['org.springframework.web.servlet.DispatcherServlet', 'org.apache.catalina.startup.Tomcat', 'com.fasterxml.jackson.databind.ObjectMapper'],
  },
  {
    id: 'jdbc',
    conf: 'implementation',
    coord: 'org.springframework.boot:spring-boot-starter-jdbc',
    label: 'starter-jdbc',
    classes: ['org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType', 'org.springframework.jdbc.core.JdbcTemplate', 'com.zaxxer.hikari.HikariDataSource', 'org.springframework.transaction.TransactionManager'],
  },
  { id: 'h2', conf: 'runtimeOnly', coord: 'com.h2database:h2', label: 'h2', classes: ['org.h2.Driver', 'org.h2.server.web.JakartaWebServlet'] },
  { id: 'postgres', conf: 'runtimeOnly', coord: 'org.postgresql:postgresql', label: 'postgresql', classes: ['org.postgresql.Driver'] },
  {
    id: 'mail',
    conf: 'implementation',
    coord: 'org.springframework.boot:spring-boot-starter-mail',
    label: 'starter-mail',
    classes: ['jakarta.mail.internet.MimeMessage', 'jakarta.activation.MimeType', 'org.springframework.mail.MailSender'],
  },
];

/** Classes that come with the JDK and are always there. */
const JDK_CLASSES = ['javax.sql.DataSource'];

export const short = (fqcn: string) => fqcn.slice(fqcn.lastIndexOf('.') + 1);

export function classpath(deps: Iterable<string>): Set<string> {
  const cp = new Set(JDK_CLASSES);
  for (const id of deps) for (const c of DEPENDENCIES.find((d) => d.id === id)?.classes ?? []) cp.add(c);
  return cp;
}

export interface Bean {
  name: string;
  /** Implementation class, short name. */
  cls: string;
  /** Types this bean can be injected as. */
  provides: string[];
  /** "user" for beans the developer declared, otherwise the auto-configuration that made it. */
  source: string;
  primary?: boolean;
  /** For beans built on a DataSource: the name of the DataSource bean they were given. */
  uses?: string;
  /** For a DataSource: the JDBC url it connects to. */
  url?: string;
}

/* ─────────────── conditions and candidates ─────────────── */

export type Cond =
  | { kind: 'class'; classes: string[] }
  | { kind: 'web' }
  | { kind: 'property'; key: string; havingValue?: string }
  | { kind: 'missingBean'; type: string }
  | { kind: 'singleCandidate'; type: string };

export interface Candidate {
  name: string;
  /** Auto-configurations this one must be evaluated after (@AutoConfiguration(after = …)). */
  after: string[];
  conditions: Cond[];
  beans: Omit<Bean, 'source'>[];
}

export const CANDIDATES: Candidate[] = [
  {
    name: 'JacksonAutoConfiguration',
    after: [],
    conditions: [
      { kind: 'class', classes: ['com.fasterxml.jackson.databind.ObjectMapper'] },
      { kind: 'missingBean', type: 'ObjectMapper' },
    ],
    beans: [{ name: 'jacksonObjectMapper', cls: 'ObjectMapper', provides: ['ObjectMapper'] }],
  },
  {
    name: 'ServletWebServerFactoryAutoConfiguration',
    after: [],
    conditions: [
      { kind: 'web' },
      { kind: 'class', classes: ['org.apache.catalina.startup.Tomcat'] },
      { kind: 'missingBean', type: 'ServletWebServerFactory' },
    ],
    beans: [{ name: 'tomcatServletWebServerFactory', cls: 'TomcatServletWebServerFactory', provides: ['ServletWebServerFactory'] }],
  },
  {
    name: 'DispatcherServletAutoConfiguration',
    after: ['ServletWebServerFactoryAutoConfiguration'],
    conditions: [{ kind: 'web' }, { kind: 'class', classes: ['org.springframework.web.servlet.DispatcherServlet'] }],
    beans: [{ name: 'dispatcherServlet', cls: 'DispatcherServlet', provides: ['DispatcherServlet'] }],
  },
  {
    name: 'DataSourceAutoConfiguration',
    after: [],
    conditions: [
      { kind: 'class', classes: ['javax.sql.DataSource', 'org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType'] },
      { kind: 'missingBean', type: 'DataSource' },
    ],
    beans: [{ name: 'dataSource', cls: 'HikariDataSource', provides: ['DataSource'] }],
  },
  {
    name: 'JdbcTemplateAutoConfiguration',
    after: ['DataSourceAutoConfiguration'],
    conditions: [
      { kind: 'class', classes: ['javax.sql.DataSource', 'org.springframework.jdbc.core.JdbcTemplate'] },
      { kind: 'singleCandidate', type: 'DataSource' },
      { kind: 'missingBean', type: 'JdbcOperations' },
    ],
    beans: [{ name: 'jdbcTemplate', cls: 'JdbcTemplate', provides: ['JdbcTemplate', 'JdbcOperations'] }],
  },
  {
    name: 'DataSourceTransactionManagerAutoConfiguration',
    after: ['DataSourceAutoConfiguration'],
    conditions: [
      { kind: 'class', classes: ['org.springframework.jdbc.core.JdbcTemplate', 'org.springframework.transaction.TransactionManager'] },
      { kind: 'singleCandidate', type: 'DataSource' },
      { kind: 'missingBean', type: 'TransactionManager' },
    ],
    beans: [{ name: 'transactionManager', cls: 'DataSourceTransactionManager', provides: ['TransactionManager'] }],
  },
  {
    name: 'H2ConsoleAutoConfiguration',
    after: ['DataSourceAutoConfiguration'],
    conditions: [{ kind: 'web' }, { kind: 'class', classes: ['org.h2.server.web.JakartaWebServlet'] }, { kind: 'property', key: 'spring.h2.console.enabled', havingValue: 'true' }],
    beans: [{ name: 'h2Console', cls: 'ServletRegistrationBean', provides: ['ServletRegistrationBean'] }],
  },
  {
    name: 'MailSenderAutoConfiguration',
    after: [],
    conditions: [
      { kind: 'class', classes: ['jakarta.mail.internet.MimeMessage', 'jakarta.activation.MimeType', 'org.springframework.mail.MailSender'] },
      { kind: 'property', key: 'spring.mail.host' },
      { kind: 'missingBean', type: 'MailSender' },
    ],
    beans: [{ name: 'mailSender', cls: 'JavaMailSenderImpl', provides: ['JavaMailSender', 'MailSender'] }],
  },
];

/** Evaluation order: alphabetical, then each candidate moved after the ones named in its `after`. */
export function evaluationOrder(cands: Candidate[]): Candidate[] {
  const byName = new Map(cands.map((c) => [c.name, c]));
  const left = [...cands].sort((a, b) => (a.name < b.name ? -1 : 1));
  const done = new Set<string>();
  const out: Candidate[] = [];
  while (left.length) {
    const i = left.findIndex((c) => c.after.every((a) => done.has(a) || !byName.has(a)));
    const [c] = left.splice(i < 0 ? 0 : i, 1);
    out.push(c);
    done.add(c.name);
  }
  return out;
}

/* ─────────────── evaluation ─────────────── */

export interface CondResult {
  cond: Cond;
  ok: boolean;
  /** The line Spring Boot's report would print, in English. */
  report: string;
  /** Plain Korean explanation. */
  ko: string;
}

export interface Outcome {
  candidate: Candidate;
  matched: boolean;
  /** Conditions that were checked, in order; evaluation stops at the first one that fails. */
  results: CondResult[];
  /** Conditions not checked because an earlier one failed. */
  skipped: Cond[];
  /** Beans this candidate registered. */
  beans: Bean[];
}

export interface Project {
  deps: string[];
  props: Record<string, string>;
  userBeans: Bean[];
  /** Thought experiment: evaluate auto-configurations before registering the user's beans. */
  autoFirst?: boolean;
}

export interface Evaluation {
  classpath: Set<string>;
  outcomes: Outcome[];
  /** Every bean in the container, in registration order. */
  beans: Bean[];
  /** Why the application could not start, if it could not. */
  startError: { exception: string; text: string } | null;
}

export const condName: Record<Cond['kind'], string> = {
  class: '@ConditionalOnClass',
  web: '@ConditionalOnWebApplication',
  property: '@ConditionalOnProperty',
  missingBean: '@ConditionalOnMissingBean',
  singleCandidate: '@ConditionalOnSingleCandidate',
};

export function condText(c: Cond): string {
  switch (c.kind) {
    case 'class':
      return `${condName.class}(${c.classes.map(short).join(', ')})`;
    case 'web':
      return `${condName.web}(SERVLET)`;
    case 'property':
      return `${condName.property}(${c.key}${c.havingValue ? ` = ${c.havingValue}` : ''})`;
    case 'missingBean':
    case 'singleCandidate':
      return `${condName[c.kind]}(${c.type})`;
  }
}

function check(c: Cond, cp: Set<string>, props: Record<string, string>, beans: Bean[]): CondResult {
  const ofType = (t: string) => beans.filter((b) => b.provides.includes(t));
  switch (c.kind) {
    case 'class': {
      const missing = c.classes.filter((x) => !cp.has(x));
      return missing.length
        ? { cond: c, ok: false, report: `@ConditionalOnClass did not find required class '${missing[0]}' (OnClassCondition)`, ko: `클래스패스에 ${short(missing[0])}이(가) 없음` }
        : { cond: c, ok: true, report: `@ConditionalOnClass found required class${c.classes.length > 1 ? 'es' : ''} ${c.classes.map((x) => `'${x}'`).join(', ')} (OnClassCondition)`, ko: `클래스패스에 ${c.classes.map(short).join(', ')} 있음` };
    }
    case 'web': {
      const ok = cp.has('org.springframework.web.servlet.DispatcherServlet');
      return ok
        ? { cond: c, ok, report: `found 'session' scope (OnWebApplicationCondition)`, ko: '서블릿 웹 애플리케이션임' }
        : { cond: c, ok, report: `not a servlet web application (OnWebApplicationCondition)`, ko: '웹 애플리케이션이 아님 (starter-web 없음)' };
    }
    case 'property': {
      const v = props[c.key];
      if (v === undefined) return { cond: c, ok: false, report: `@ConditionalOnProperty (${c.key}${c.havingValue ? '=' + c.havingValue : ''}) did not find property '${c.key}' (OnPropertyCondition)`, ko: `application.yml에 ${c.key}가 없음` };
      const ok = c.havingValue ? v === c.havingValue : v !== 'false';
      return ok
        ? { cond: c, ok, report: `@ConditionalOnProperty (${c.key}${c.havingValue ? '=' + c.havingValue : ''}) matched (OnPropertyCondition)`, ko: `${c.key} = ${v}` }
        : { cond: c, ok, report: `@ConditionalOnProperty (${c.key}=${c.havingValue}) found different value in property '${c.key}' (OnPropertyCondition)`, ko: `${c.key}가 ${v}라서 ${c.havingValue}가 아님` };
    }
    case 'missingBean': {
      const found = ofType(c.type);
      return found.length
        ? { cond: c, ok: false, report: `@ConditionalOnMissingBean (types: ${c.type}; SearchStrategy: all) found beans of type '${c.type}' ${found.map((b) => b.name).join(', ')} (OnBeanCondition)`, ko: `${c.type} 빈이 이미 있음: ${found.map((b) => b.name).join(', ')}` }
        : { cond: c, ok: true, report: `@ConditionalOnMissingBean (types: ${c.type}; SearchStrategy: all) did not find any beans (OnBeanCondition)`, ko: `${c.type} 빈이 아직 없음` };
    }
    case 'singleCandidate': {
      const found = ofType(c.type);
      const prim = found.filter((b) => b.primary);
      if (found.length === 1) return { cond: c, ok: true, report: `@ConditionalOnSingleCandidate (types: ${c.type}; SearchStrategy: all) found a single bean '${found[0].name}' (OnBeanCondition)`, ko: `${c.type} 빈이 하나: ${found[0].name}` };
      if (found.length > 1 && prim.length === 1) return { cond: c, ok: true, report: `@ConditionalOnSingleCandidate (types: ${c.type}; SearchStrategy: all) found a single primary bean '${prim[0].name}' from beans ${found.map((b) => `'${b.name}'`).join(', ')} (OnBeanCondition)`, ko: `${c.type} 빈 ${found.length}개 중 @Primary는 ${prim[0].name} 하나` };
      if (!found.length) return { cond: c, ok: false, report: `@ConditionalOnSingleCandidate (types: ${c.type}; SearchStrategy: all) did not find any beans (OnBeanCondition)`, ko: `${c.type} 빈이 없음` };
      return { cond: c, ok: false, report: `@ConditionalOnSingleCandidate (types: ${c.type}; SearchStrategy: all) found beans ${found.map((b) => `'${b.name}'`).join(', ')} but none is primary (OnBeanCondition)`, ko: `${c.type} 빈이 ${found.length}개라 하나를 고를 수 없음` };
    }
  }
}

const DRIVERS: [string, string][] = [
  ['jdbc:h2:', 'org.h2.Driver'],
  ['jdbc:postgresql:', 'org.postgresql.Driver'],
];

/**
 * What creating the auto-configured HikariDataSource does: use spring.datasource.url, or fall back
 * to an embedded in-memory database when one is on the classpath.
 */
function dataSourceUrl(cp: Set<string>, props: Record<string, string>): { url: string } | { exception: string; text: string } {
  const url = props['spring.datasource.url'];
  if (url) {
    const driver = DRIVERS.find(([p]) => url.startsWith(p))?.[1];
    if (driver && !cp.has(driver)) return { exception: 'IllegalStateException', text: `Cannot load driver class: ${driver}. ${url}에 연결할 드라이버가 클래스패스에 없습니다.` };
    return { url };
  }
  if (cp.has('org.h2.Driver')) return { url: 'jdbc:h2:mem:testdb' };
  return {
    exception: 'DataSourceBeanCreationException',
    text: "Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured. spring.datasource.url도 없고 내장 데이터베이스(H2 등)도 없습니다.",
  };
}

export function evaluate(p: Project, cands: Candidate[] = CANDIDATES): Evaluation {
  const cp = classpath(p.deps);
  const beans: Bean[] = [];
  const outcomes: Outcome[] = [];
  let startError: Evaluation['startError'] = null;

  if (!p.autoFirst) beans.push(...p.userBeans.map((b) => ({ ...b })));
  for (const cand of evaluationOrder(cands)) {
    const results: CondResult[] = [];
    let matched = true;
    let i = 0;
    for (; i < cand.conditions.length; i++) {
      const r = check(cand.conditions[i], cp, p.props, beans);
      results.push(r);
      if (!r.ok) {
        matched = false;
        i++;
        break;
      }
    }
    const made: Bean[] = [];
    if (matched) {
      for (const b of cand.beans) {
        const bean: Bean = { ...b, source: cand.name };
        if (b.provides.includes('DataSource')) {
          const u = dataSourceUrl(cp, p.props);
          if ('url' in u) bean.url = u.url;
          else startError ??= u;
        }
        if (cand.conditions.some((c) => c.kind === 'singleCandidate')) {
          const ds = beans.filter((x) => x.provides.includes('DataSource'));
          bean.uses = (ds.length === 1 ? ds[0] : ds.find((x) => x.primary))?.name;
        }
        made.push(bean);
      }
      beans.push(...made);
    }
    outcomes.push({ candidate: cand, matched, results, skipped: matched ? [] : cand.conditions.slice(i), beans: made });
  }
  if (p.autoFirst) beans.push(...p.userBeans.map((b) => ({ ...b })));
  return { classpath: cp, outcomes, beans, startError };
}

/* ─────────────── the report Spring Boot prints with --debug ─────────────── */

export function report(e: Evaluation): string {
  const pos = e.outcomes.filter((o) => o.matched);
  const neg = e.outcomes.filter((o) => !o.matched);
  const lines = ['============================', 'CONDITIONS EVALUATION REPORT', '============================', '', 'Positive matches:', '-----------------', ''];
  for (const o of pos) {
    lines.push(`   ${o.candidate.name} matched:`);
    for (const r of o.results) lines.push(`      - ${r.report}`);
    lines.push('');
  }
  if (!pos.length) lines.push('    None', '');
  lines.push('Negative matches:', '-----------------', '');
  for (const o of neg) {
    lines.push(`   ${o.candidate.name}:`, '      Did not match:');
    const bad = o.results[o.results.length - 1];
    lines.push(`         - ${bad.report}`);
    const okOnes = o.results.slice(0, -1);
    if (okOnes.length) {
      lines.push('      Matched:');
      for (const r of okOnes) lines.push(`         - ${r.report}`);
    }
    lines.push('');
  }
  if (!neg.length) lines.push('    None', '');
  return lines.join('\n');
}

/* ─────────────── does the to-do application start? ─────────────── */

/** The to-do service's own classes, as in the dependency injection lesson. */
export const APP_BEANS: BeanDef[] = [
  { name: 'TodoController', provides: ['TodoController'], deps: ['TodoService'] },
  { name: 'TodoService', provides: ['TodoService'], deps: ['TodoRepository', 'Notifier', 'Clock'] },
  { name: 'JdbcTodoRepository', provides: ['JdbcTodoRepository', 'TodoRepository'], deps: ['JdbcTemplate'] },
  { name: 'EmailNotifier', provides: ['EmailNotifier', 'Notifier'], deps: ['JavaMailSender'] },
  { name: 'SystemClock', provides: ['SystemClock', 'Clock'], deps: [] },
];

export interface Startup {
  ok: boolean;
  exception?: string;
  text: string;
  /** Beans created to build TodoController, in order. */
  created: string[];
}

export function startup(e: Evaluation, app: BeanDef[] = APP_BEANS): Startup {
  if (e.startError) return { ok: false, exception: e.startError.exception, text: e.startError.text, created: [] };
  const defs: BeanDef[] = [...e.beans.map((b) => ({ name: b.name, provides: b.provides, deps: [], primary: b.primary })), ...app];
  const r = resolve(defs, 'TodoController');
  if (r.fail) {
    const x = explain(r.fail);
    return { ok: false, exception: x.exception, text: x.text, created: r.created };
  }
  return { ok: true, text: `빈 ${r.created.length}개로 TodoController까지 만들었습니다.`, created: r.created };
}
