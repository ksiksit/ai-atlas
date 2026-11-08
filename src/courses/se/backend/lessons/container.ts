/**
 * A tiny IoC container: bean definitions say which types a class provides and which types its
 * constructor needs. resolve() builds the object graph the way Spring does for singleton beans —
 * depth-first through constructor arguments — and reports the first wiring error it meets.
 */

export interface BeanDef {
  /** Class name, e.g. "TodoService". */
  name: string;
  /** Types this bean can be injected as: its own class and the interfaces it implements. */
  provides: string[];
  /** Constructor parameter types, in order. */
  deps: string[];
  /** Wins when several beans provide the same type (Spring's @Primary). */
  primary?: boolean;
}

export type Fail =
  | { kind: 'missing'; type: string; by: string | null }
  | { kind: 'ambiguous'; type: string; by: string | null; candidates: string[] }
  | { kind: 'cycle'; path: string[] };

export interface Step {
  kind: 'need' | 'create' | 'reuse';
  bean: string;
  depth: number;
}

export interface Result {
  /** Beans in the order their constructors ran. */
  created: string[];
  /** "needs" edges between beans that were reached: [from, to]. */
  edges: [string, string][];
  /** How deep below the root each reached bean was first met. */
  depth: Map<string, number>;
  steps: Step[];
  fail: Fail | null;
  /** The same wiring written out by hand, one `new` per line. */
  code: string[];
}

export const varName = (cls: string) => cls[0].toLowerCase() + cls.slice(1);

export function candidates(defs: BeanDef[], type: string): BeanDef[] {
  return defs.filter((d) => d.provides.includes(type));
}

export function resolve(defs: BeanDef[], rootType: string): Result {
  const created: string[] = [];
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  const depth = new Map<string, number>();
  const steps: Step[] = [];
  const code: string[] = [];
  const stack: string[] = [];
  let fail: Fail | null = null;

  const edge = (a: string | null, b: string) => {
    if (a === null) return;
    const k = a + '>' + b;
    if (!seen.has(k)) {
      seen.add(k);
      edges.push([a, b]);
    }
  };

  /** Returns the bean name that was injected for `type`, or null after recording a failure. */
  function get(type: string, by: string | null, d: number): string | null {
    let cs = candidates(defs, type);
    if (cs.length > 1) {
      const prim = cs.filter((c) => c.primary);
      if (prim.length === 1) cs = prim;
    }
    if (cs.length === 0) {
      fail = { kind: 'missing', type, by };
      return null;
    }
    if (cs.length > 1) {
      fail = { kind: 'ambiguous', type, by, candidates: cs.map((c) => c.name) };
      return null;
    }
    const def = cs[0];
    edge(by, def.name);
    if (!depth.has(def.name)) depth.set(def.name, d);
    if (created.includes(def.name)) {
      steps.push({ kind: 'reuse', bean: def.name, depth: d });
      return def.name;
    }
    const at = stack.indexOf(def.name);
    if (at >= 0) {
      fail = { kind: 'cycle', path: [...stack.slice(at), def.name] };
      return null;
    }
    stack.push(def.name);
    steps.push({ kind: 'need', bean: def.name, depth: d });
    const args: string[] = [];
    for (const t of def.deps) {
      const got = get(t, def.name, d + 1);
      if (got === null) return null;
      args.push(varName(got));
    }
    stack.pop();
    created.push(def.name);
    steps.push({ kind: 'create', bean: def.name, depth: d });
    code.push(`const ${varName(def.name)} = new ${def.name}(${args.join(', ')});`);
    return def.name;
  }

  get(rootType, null, 0);
  return { created, edges, depth, steps, fail, code };
}

/** The error in the words Spring would use, plus a plain explanation. */
export function explain(f: Fail): { exception: string; text: string } {
  switch (f.kind) {
    case 'missing':
      return {
        exception: 'NoSuchBeanDefinitionException',
        text: `${f.by ?? '시작점'}을(를) 만들려면 ${f.type}이(가) 필요한데, 그 타입을 주는 빈이 하나도 없습니다.`,
      };
    case 'ambiguous':
      return {
        exception: 'NoUniqueBeanDefinitionException',
        text: `${f.by ?? '시작점'}에 넣을 ${f.type}이(가) ${f.candidates.length}개(${f.candidates.join(', ')})라서 어느 것을 넣을지 정할 수 없습니다.`,
      };
    case 'cycle':
      return {
        exception: 'BeanCurrentlyInCreationException',
        text: `생성자끼리 서로를 기다립니다: ${f.path.join(' → ')}. 어느 쪽도 먼저 만들 수 없습니다.`,
      };
  }
}
