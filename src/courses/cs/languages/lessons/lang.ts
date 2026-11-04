/**
 * 꼬마 언어: the tiny JavaScript-like language used across this course.
 *
 * Expressions: numbers, strings, true/false, names, + - * / % < > <= >= == != && || !, c ? a : b,
 * arrow functions `(a, b) => expr` or `(a) => { statements }` (parameters may carry a type, `x: number`),
 * and calls `f(a, b)`. Statements: `let x = e;`, `x = e;`, `if (c) { } else { }`, `while (c) { }`,
 * `return e;` and expression statements such as `print(x);`.
 *
 * Every node carries an id and the character span it came from, so figures can highlight the code.
 */

export type TokType = 'num' | 'str' | 'name' | 'kw' | 'op' | 'punc' | 'eof';
export interface Token {
  type: TokType;
  text: string;
  start: number;
  end: number;
}

export class LangError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

const KEYWORDS = new Set(['let', 'if', 'else', 'while', 'return', 'true', 'false']);
const OPS = ['=>', '==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '=', '!', '?', ':'];
const PUNC = new Set(['(', ')', '{', '}', ',', ';']);

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c)) {
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')) {
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      out.push({ type: 'num', text: src.slice(start, i), start, end: i });
      continue;
    }
    if (/[\p{L}_$]/u.test(c)) {
      while (i < src.length && /[\p{L}\p{N}_$]/u.test(src[i])) i++;
      const text = src.slice(start, i);
      out.push({ type: KEYWORDS.has(text) ? 'kw' : 'name', text, start, end: i });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i++;
      if (src[i] !== c) throw new LangError('문자열을 닫는 따옴표가 없습니다.', start);
      i++;
      out.push({ type: 'str', text: src.slice(start, i), start, end: i });
      continue;
    }
    if (PUNC.has(c)) {
      out.push({ type: 'punc', text: c, start, end: i + 1 });
      i++;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      out.push({ type: 'op', text: op, start, end: i + op.length });
      i += op.length;
      continue;
    }
    throw new LangError(`'${c}'는 이 언어에서 쓸 수 없는 글자입니다.`, i);
  }
  out.push({ type: 'eof', text: '', start: src.length, end: src.length });
  return out;
}

/* ─────────────── AST ─────────────── */

export type TypeAnn = { k: 'base'; name: 'number' | 'boolean' | 'string' } | { k: 'fn'; params: TypeAnn[]; ret: TypeAnn };

interface Base {
  id: number;
  start: number;
  end: number;
}
export type Expr =
  | (Base & { k: 'num'; v: number })
  | (Base & { k: 'str'; v: string })
  | (Base & { k: 'bool'; v: boolean })
  | (Base & { k: 'var'; name: string })
  | (Base & { k: 'bin'; op: string; l: Expr; r: Expr })
  | (Base & { k: 'un'; op: string; e: Expr })
  | (Base & { k: 'cond'; c: Expr; a: Expr; b: Expr })
  | (Base & { k: 'fn'; params: { name: string; ann?: TypeAnn }[]; body: Expr | Block; name?: string })
  | (Base & { k: 'call'; f: Expr; args: Expr[] });
export type Stmt =
  | (Base & { k: 'let'; name: string; e: Expr })
  | (Base & { k: 'assign'; name: string; e: Expr })
  | (Base & { k: 'expr'; e: Expr })
  | (Base & { k: 'if'; c: Expr; then: Block; else?: Block })
  | (Base & { k: 'while'; c: Expr; body: Block })
  | (Base & { k: 'return'; e?: Expr });
export type Block = Base & { k: 'block'; body: Stmt[] };
export type Program = Base & { k: 'prog'; body: Stmt[] };
export type Node = Expr | Stmt | Block | Program;

const BIN_PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

class Parser {
  private i = 0;
  private nextId = 1;
  constructor(private toks: Token[]) {}

  private get t() {
    return this.toks[this.i];
  }
  private peek(k = 1) {
    return this.toks[Math.min(this.toks.length - 1, this.i + k)];
  }
  private is(text: string) {
    return (this.t.type === 'op' || this.t.type === 'punc' || this.t.type === 'kw') && this.t.text === text;
  }
  private eat(text: string, what?: string): Token {
    if (!this.is(text)) {
      const got = this.t.type === 'eof' ? '코드 끝' : `'${this.t.text}'`;
      throw new LangError(`${what ?? `'${text}'`}가 와야 하는데 ${got}이(가) 왔습니다.`, this.t.start);
    }
    return this.toks[this.i++];
  }
  private node<T extends object>(o: T, start: number, end?: number): T & Base {
    return { id: this.nextId++, start, end: end ?? this.toks[this.i - 1].end, ...o };
  }

  program(): Program {
    const body: Stmt[] = [];
    while (this.t.type !== 'eof') body.push(this.stmt());
    return this.node({ k: 'prog' as const, body }, 0, this.t.end);
  }

  private block(): Block {
    const start = this.eat('{').start;
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.t.type === 'eof') throw new LangError("블록을 닫는 '}'가 없습니다.", start);
      body.push(this.stmt());
    }
    this.eat('}');
    return this.node({ k: 'block' as const, body }, start);
  }

  private semi() {
    if (this.is(';')) this.i++;
    else if (!(this.is('}') || this.t.type === 'eof')) throw new LangError(`문장 끝에 ';'가 필요합니다.`, this.t.start);
  }

  private stmt(): Stmt {
    const start = this.t.start;
    if (this.is('let')) {
      this.i++;
      if (this.t.type !== 'name') throw new LangError('let 뒤에는 변수 이름이 와야 합니다.', this.t.start);
      const name = this.toks[this.i++].text;
      this.eat('=', "'='");
      const e = this.expr();
      this.semi();
      return this.node({ k: 'let' as const, name, e }, start, e.end);
    }
    if (this.is('if')) {
      this.i++;
      this.eat('(');
      const c = this.expr();
      this.eat(')');
      const then = this.block();
      let els: Block | undefined;
      if (this.is('else')) {
        this.i++;
        if (this.is('if')) {
          const s = this.stmt();
          els = this.node({ k: 'block' as const, body: [s] }, s.start, s.end);
        } else els = this.block();
      }
      return this.node({ k: 'if' as const, c, then, else: els }, start);
    }
    if (this.is('while')) {
      this.i++;
      this.eat('(');
      const c = this.expr();
      this.eat(')');
      const body = this.block();
      return this.node({ k: 'while' as const, c, body }, start);
    }
    if (this.is('return')) {
      this.i++;
      let e: Expr | undefined;
      if (!this.is(';') && !this.is('}')) e = this.expr();
      const end = e ? e.end : this.toks[this.i - 1].end;
      this.semi();
      return this.node({ k: 'return' as const, e }, start, end);
    }
    if (this.t.type === 'name' && this.peek().type === 'op' && this.peek().text === '=') {
      const name = this.toks[this.i].text;
      this.i += 2;
      const e = this.expr();
      this.semi();
      return this.node({ k: 'assign' as const, name, e }, start, e.end);
    }
    const e = this.expr();
    this.semi();
    return this.node({ k: 'expr' as const, e }, start, e.end);
  }

  expr(): Expr {
    return this.cond();
  }

  private cond(): Expr {
    const c = this.binary(1);
    if (!this.is('?')) return c;
    this.i++;
    const a = this.cond();
    this.eat(':', "':'");
    const b = this.cond();
    return this.node({ k: 'cond' as const, c, a, b }, c.start);
  }

  private binary(min: number): Expr {
    let l = this.unary();
    for (;;) {
      const t = this.t;
      const p = t.type === 'op' ? BIN_PREC[t.text] : undefined;
      if (p === undefined || p < min) return l;
      this.i++;
      const r = this.binary(p + 1);
      l = this.node({ k: 'bin' as const, op: t.text, l, r }, l.start);
    }
  }

  private unary(): Expr {
    if (this.t.type === 'op' && (this.t.text === '-' || this.t.text === '!')) {
      const t = this.toks[this.i++];
      const e = this.unary();
      return this.node({ k: 'un' as const, op: t.text, e }, t.start);
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    while (this.is('(')) {
      this.i++;
      const args: Expr[] = [];
      if (!this.is(')')) {
        args.push(this.expr());
        while (this.is(',')) {
          this.i++;
          args.push(this.expr());
        }
      }
      this.eat(')', "닫는 괄호 ')'");
      e = this.node({ k: 'call' as const, f: e, args }, e.start);
    }
    return e;
  }

  /** `(` starts an arrow function when its matching `)` is followed by `=>`. */
  private arrowAhead(): boolean {
    let depth = 0;
    for (let j = this.i; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.text === '(' && t.type === 'punc') depth++;
      else if (t.text === ')' && t.type === 'punc') {
        depth--;
        if (depth === 0) return this.toks[j + 1]?.text === '=>';
      } else if (t.type === 'eof') return false;
    }
    return false;
  }

  private typeAnn(): TypeAnn {
    if (this.is('(')) {
      this.i++;
      const params: TypeAnn[] = [];
      if (!this.is(')')) {
        params.push(this.typeAnn());
        while (this.is(',')) {
          this.i++;
          params.push(this.typeAnn());
        }
      }
      this.eat(')');
      this.eat('=>', "'=>'");
      return { k: 'fn', params, ret: this.typeAnn() };
    }
    const t = this.t;
    if (t.type === 'name' && (t.text === 'number' || t.text === 'boolean' || t.text === 'string')) {
      this.i++;
      return { k: 'base', name: t.text };
    }
    throw new LangError('타입 자리에는 number, boolean, string 또는 (number) => number 같은 함수 타입이 와야 합니다.', t.start);
  }

  private fnRest(start: number, params: { name: string; ann?: TypeAnn }[]): Expr {
    this.eat('=>', "'=>'");
    const body = this.is('{') ? this.block() : this.expr();
    return this.node({ k: 'fn' as const, params, body }, start);
  }

  private primary(): Expr {
    const t = this.t;
    if (t.type === 'num') {
      this.i++;
      return this.node({ k: 'num' as const, v: Number(t.text) }, t.start);
    }
    if (t.type === 'str') {
      this.i++;
      return this.node({ k: 'str' as const, v: t.text.slice(1, -1) }, t.start);
    }
    if (t.type === 'kw' && (t.text === 'true' || t.text === 'false')) {
      this.i++;
      return this.node({ k: 'bool' as const, v: t.text === 'true' }, t.start);
    }
    if (t.type === 'name') {
      if (this.peek().text === '=>') {
        this.i++;
        return this.fnRest(t.start, [{ name: t.text }]);
      }
      this.i++;
      return this.node({ k: 'var' as const, name: t.text }, t.start);
    }
    if (this.is('(')) {
      if (this.arrowAhead()) {
        this.i++;
        const params: { name: string; ann?: TypeAnn }[] = [];
        while (!this.is(')')) {
          if (this.t.type !== 'name') throw new LangError('매개변수 자리에는 이름이 와야 합니다.', this.t.start);
          const name = this.toks[this.i++].text;
          let ann: TypeAnn | undefined;
          if (this.is(':')) {
            this.i++;
            ann = this.typeAnn();
          }
          params.push({ name, ann });
          if (this.is(',')) this.i++;
          else if (!this.is(')')) throw new LangError("매개변수 사이에는 ','가 필요합니다.", this.t.start);
        }
        this.i++;
        return this.fnRest(t.start, params);
      }
      this.i++;
      const e = this.expr();
      this.eat(')', "닫는 괄호 ')'");
      // keep the parenthesised span so highlighting covers the brackets
      return { ...e, start: t.start, end: this.toks[this.i - 1].end };
    }
    if (t.type === 'eof') throw new LangError('식이 와야 하는데 코드가 끝났습니다.', t.start);
    throw new LangError(`여기에는 '${t.text}'가 올 수 없습니다. 값이나 이름이 와야 합니다.`, t.start);
  }
}

export function parseProgram(src: string): Program {
  const p = new Parser(tokenize(src));
  const prog = p.program();
  nameFunctions(prog);
  return prog;
}

/** Parse a single expression (the whole source must be one expression). */
export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  const p = new Parser(toks);
  const e = p.expr();
  const rest = (p as unknown as { i: number }).i;
  if (toks[rest].type !== 'eof') throw new LangError(`식이 끝났는데 '${toks[rest].text}'가 더 있습니다.`, toks[rest].start);
  return e;
}

/** `let f = (x) => …` gives the function the name f (shown in figures and stack labels). */
function nameFunctions(n: Node) {
  walk(n, (m) => {
    if ((m.k === 'let' || m.k === 'assign') && m.e.k === 'fn') m.e.name = m.name;
  });
}

/* ─────────────── tree helpers ─────────────── */

export function children(n: Node): Node[] {
  switch (n.k) {
    case 'bin':
      return [n.l, n.r];
    case 'un':
      return [n.e];
    case 'cond':
      return [n.c, n.a, n.b];
    case 'fn':
      return [n.body];
    case 'call':
      return [n.f, ...n.args];
    case 'let':
    case 'assign':
    case 'expr':
      return [n.e];
    case 'if':
      return n.else ? [n.c, n.then, n.else] : [n.c, n.then];
    case 'while':
      return [n.c, n.body];
    case 'return':
      return n.e ? [n.e] : [];
    case 'block':
    case 'prog':
      return n.body;
    default:
      return [];
  }
}

export function walk(n: Node, f: (n: Node) => void) {
  f(n);
  for (const c of children(n)) walk(c, f);
}

export function showAnn(t: TypeAnn): string {
  return t.k === 'base' ? t.name : `(${t.params.map(showAnn).join(', ')}) => ${showAnn(t.ret)}`;
}

/** Short label for a tree node. */
export function nodeLabel(n: Node): string {
  switch (n.k) {
    case 'num':
      return String(n.v);
    case 'str':
      return `"${n.v}"`;
    case 'bool':
      return String(n.v);
    case 'var':
      return n.name;
    case 'bin':
      return n.op;
    case 'un':
      return n.op;
    case 'cond':
      return '? :';
    case 'fn':
      return `(${n.params.map((p) => p.name + (p.ann ? ': ' + showAnn(p.ann) : '')).join(', ')}) =>`;
    case 'call':
      return '호출';
    case 'let':
      return `let ${n.name}`;
    case 'assign':
      return `${n.name} =`;
    case 'expr':
      return '식 문장';
    case 'if':
      return 'if';
    case 'while':
      return 'while';
    case 'return':
      return 'return';
    case 'block':
      return '{ }';
    case 'prog':
      return '프로그램';
  }
}

/** What kind of node, in Korean, for the token / tree legends. */
export function nodeKind(n: Node): string {
  const K: Record<Node['k'], string> = {
    num: '수',
    str: '문자열',
    bool: '참거짓',
    var: '이름',
    bin: '이항 연산',
    un: '단항 연산',
    cond: '조건식',
    fn: '함수',
    call: '호출',
    let: '변수 선언',
    assign: '대입',
    expr: '식 문장',
    if: 'if 문',
    while: 'while 문',
    return: 'return 문',
    block: '블록',
    prog: '프로그램',
  };
  return K[n.k];
}

export const TOKEN_KIND: Record<TokType, string> = { num: '수', str: '문자열', name: '이름', kw: '예약어', op: '연산자', punc: '구두점', eof: '끝' };

/** Line and column (1-based) of a character offset. */
export function lineCol(src: string, pos: number): { line: number; col: number } {
  const before = src.slice(0, pos).split('\n');
  return { line: before.length, col: before[before.length - 1].length + 1 };
}

/** Parse, returning either the program or a friendly error. */
export function tryParse(src: string): { prog: Program; err: null } | { prog: null; err: { msg: string; pos: number } } {
  try {
    return { prog: parseProgram(src), err: null };
  } catch (e) {
    if (e instanceof LangError) return { prog: null, err: { msg: e.message, pos: e.pos } };
    throw e;
  }
}
