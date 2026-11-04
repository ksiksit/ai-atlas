/* 리팩터링: the same change in a duplicated and a refactored codebase, and a refactoring done in small tested steps */

/* ─────────────── Figure 1: duplicated versus refactored ─────────────── */

export type Concern = 'vat' | 'fmt' | 'sum';

export interface SrcLine {
  text: string;
  tags?: Concern[];
}
export interface SrcFile {
  name: string;
  lines: SrcLine[];
}

const l = (text: string, ...tags: Concern[]): SrcLine => ({ text, tags });

export const DUP: SrcFile[] = [
  {
    name: 'cartPage.js',
    lines: [
      l('function cartSummary(items) {'),
      l('  let sum = 0;'),
      l('  for (const it of items) sum += it.price * it.qty;', 'sum'),
      l('  const total = Math.round(sum * 1.1);', 'vat'),
      l("  return total.toLocaleString('ko-KR') + '원';", 'fmt'),
      l('}'),
    ],
  },
  {
    name: 'checkoutPage.js',
    lines: [
      l('function checkoutTotal(items, coupon) {'),
      l('  let sum = 0;'),
      l('  for (const it of items) sum += it.price * it.qty;', 'sum'),
      l('  if (coupon) sum -= coupon;'),
      l('  const total = Math.round(sum * 1.1);', 'vat'),
      l("  return total.toLocaleString('ko-KR') + '원';", 'fmt'),
      l('}'),
    ],
  },
  {
    name: 'receiptEmail.js',
    lines: [
      l('function receiptLine(item) {'),
      l('  const price = Math.round(item.price * 1.1);', 'vat'),
      l("  return `${item.name}: ${price.toLocaleString('ko-KR')}원`;", 'fmt'),
      l('}'),
    ],
  },
  {
    name: 'adminReport.js',
    lines: [
      l('function monthlySales(orders) {'),
      l('  let sum = 0;'),
      l('  for (const o of orders) sum += o.amount;'),
      l('  const withTax = sum + sum / 10;', 'vat'),
      l("  return withTax.toFixed(0) + ' 원';", 'fmt'),
      l('}'),
    ],
  },
];

export const REF: SrcFile[] = [
  {
    name: 'money.js',
    lines: [
      l('export const VAT_RATE = 0.1;', 'vat'),
      l('export const withVat = (n) => Math.round(n * (1 + VAT_RATE));'),
      l("export const won = (n) => n.toLocaleString('ko-KR') + '원';", 'fmt'),
      l('export const subtotal = (items) =>'),
      l('  items.reduce((s, it) => s + it.price * it.qty, 0);', 'sum'),
    ],
  },
  { name: 'cartPage.js', lines: [l('const cartSummary = (items) => won(withVat(subtotal(items)));')] },
  { name: 'checkoutPage.js', lines: [l('const checkoutTotal = (items, coupon = 0) =>'), l('  won(withVat(subtotal(items) - coupon));')] },
  { name: 'receiptEmail.js', lines: [l('const receiptLine = (item) =>'), l('  `${item.name}: ${won(withVat(item.price))}`;')] },
  { name: 'adminReport.js', lines: [l('const monthlySales = (orders) =>'), l('  won(withVat(orders.reduce((s, o) => s + o.amount, 0)));')] },
];

/** grep: what someone would search for in the duplicated code; grepRef: in the refactored one */
export const REQUESTS: { id: Concern; label: string; ask: string; grep: string; grepRef: string }[] = [
  { id: 'vat', label: '세율 변경', ask: '부가세율이 10%에서 8%로 바뀝니다.', grep: '1.1', grepRef: 'VAT_RATE =' },
  { id: 'fmt', label: '표시 형식', ask: "금액을 '12,000원' 대신 '₩12,000'으로 보여 주세요.", grep: 'toLocaleString', grepRef: 'toLocaleString' },
  { id: 'sum', label: '수량 할인', ask: '같은 상품을 3개 이상 사면 그 상품은 5% 할인해 주세요.', grep: 'price * it.qty', grepRef: 'price * it.qty' },
];

export function editStats(files: SrcFile[], c: Concern, grep: string) {
  let sites = 0;
  let found = 0;
  let touched = 0;
  for (const f of files) {
    let any = false;
    for (const ln of f.lines) {
      const need = !!ln.tags?.includes(c);
      if (need) {
        sites++;
        any = true;
        if (ln.text.includes(grep)) found++;
      }
    }
    if (any) touched++;
  }
  return { sites, found, missed: sites - found, touched };
}

/* ─────────────── Figure 2: a refactoring in small steps ─────────────── */

export interface Step {
  title: string;
  technique: string;
  why: string;
  code: string;
}

const LOOKUP_GOOD = `const PRICING = {
  book: (line) => line.price * line.qty * (line.qty >= 10 ? 0.9 : 1),
  food: (line) => line.price * line.qty,
  gift: (line) => line.price * line.qty + 2000,   // 포장비
};

function amountFor(line) {
  const price = PRICING[line.type];
  return price ? price(line) : 0;   // 모르는 종류는 원래처럼 0원
}`;

const LOOKUP_BAD = `const PRICING = {
  book: (line) => line.price * line.qty * (line.qty >= 10 ? 0.9 : 1),
  food: (line) => line.price * line.qty,
  gift: (line) => line.price * line.qty + 2000,   // 포장비
};

function amountFor(line) {
  return PRICING[line.type](line);
}`;

export function steps(mistake: boolean): Step[] {
  const lookup = mistake ? LOOKUP_BAD : LOOKUP_GOOD;
  return [
    {
      title: '처음 코드',
      technique: '',
      why: '주문서를 만드는 함수 하나가 가격 계산, 반복, 문자열 꾸미기를 모두 합니다. 줄마다 하는 일이 섞여 있어, 새 상품 종류를 넣으려면 함수 한가운데를 고쳐야 합니다.',
      code: `function statement(order) {
  let total = 0;
  let result = \`주문서: \${order.customer}\\n\`;
  for (const l of order.lines) {
    let amt = 0;
    if (l.type === 'book') {
      amt = l.price * l.qty;
      if (l.qty >= 10) amt = amt * 0.9;
    } else if (l.type === 'food') {
      amt = l.price * l.qty;
    } else if (l.type === 'gift') {
      amt = l.price * l.qty + 2000;
    }
    total += amt;
    result += \`  \${l.name}: \${Math.round(amt).toLocaleString('ko-KR')}원\\n\`;
  }
  result += \`합계: \${Math.round(total).toLocaleString('ko-KR')}원\`;
  return result;
}`,
    },
    {
      title: '1. 함수 추출',
      technique: 'Extract Function',
      why: '한 줄의 가격을 계산하는 if 덩어리를 amountFor라는 이름의 함수로 떼어 냅니다. 반복문은 이제 "가격을 구해 더한다"만 합니다.',
      code: `function amountFor(l) {
  let amt = 0;
  if (l.type === 'book') {
    amt = l.price * l.qty;
    if (l.qty >= 10) amt = amt * 0.9;
  } else if (l.type === 'food') {
    amt = l.price * l.qty;
  } else if (l.type === 'gift') {
    amt = l.price * l.qty + 2000;
  }
  return amt;
}

function statement(order) {
  let total = 0;
  let result = \`주문서: \${order.customer}\\n\`;
  for (const l of order.lines) {
    const amt = amountFor(l);
    total += amt;
    result += \`  \${l.name}: \${Math.round(amt).toLocaleString('ko-KR')}원\\n\`;
  }
  result += \`합계: \${Math.round(total).toLocaleString('ko-KR')}원\`;
  return result;
}`,
    },
    {
      title: '2. 이름 바꾸기',
      technique: 'Rename Variable',
      why: 'l과 amt는 쓴 사람만 아는 이름입니다. line과 amount로 바꾸면 읽는 사람이 추측할 필요가 없습니다. 동작은 한 글자도 바뀌지 않습니다.',
      code: `function amountFor(line) {
  let amount = 0;
  if (line.type === 'book') {
    amount = line.price * line.qty;
    if (line.qty >= 10) amount = amount * 0.9;
  } else if (line.type === 'food') {
    amount = line.price * line.qty;
  } else if (line.type === 'gift') {
    amount = line.price * line.qty + 2000;
  }
  return amount;
}

function statement(order) {
  let total = 0;
  let result = \`주문서: \${order.customer}\\n\`;
  for (const line of order.lines) {
    const amount = amountFor(line);
    total += amount;
    result += \`  \${line.name}: \${Math.round(amount).toLocaleString('ko-KR')}원\\n\`;
  }
  result += \`합계: \${Math.round(total).toLocaleString('ko-KR')}원\`;
  return result;
}`,
    },
    {
      title: '3. 조건문을 표로',
      technique: 'Replace Conditional with Lookup',
      why: '종류마다 이어지는 if-else를 종류 → 계산 함수의 표로 바꿉니다. 새 종류는 표에 한 줄을 더하면 됩니다.',
      code: `${lookup}

function statement(order) {
  let total = 0;
  let result = \`주문서: \${order.customer}\\n\`;
  for (const line of order.lines) {
    const amount = amountFor(line);
    total += amount;
    result += \`  \${line.name}: \${Math.round(amount).toLocaleString('ko-KR')}원\\n\`;
  }
  result += \`합계: \${Math.round(total).toLocaleString('ko-KR')}원\`;
  return result;
}`,
    },
    {
      title: '4. 중복된 서식 추출',
      technique: 'Extract Function',
      why: "Math.round(…).toLocaleString('ko-KR') + '원'이 두 번 나옵니다. won 함수 하나로 모으면 표시 형식을 바꿀 곳이 한 곳이 됩니다.",
      code: `${lookup}

const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';

function statement(order) {
  let total = 0;
  let result = \`주문서: \${order.customer}\\n\`;
  for (const line of order.lines) {
    const amount = amountFor(line);
    total += amount;
    result += \`  \${line.name}: \${won(amount)}\\n\`;
  }
  result += \`합계: \${won(total)}\`;
  return result;
}`,
    },
    {
      title: '5. 반복문 쪼개기',
      technique: 'Split Loop',
      why: '반복문 하나가 합계와 문자열을 함께 만들고 있었습니다. 둘로 나누면 각각이 한 줄짜리 식이 됩니다. 반복을 두 번 하지만 줄 수십 개에서는 차이가 없습니다.',
      code: `${lookup}

const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';

function statement(order) {
  const rows = order.lines.map((line) => \`  \${line.name}: \${won(amountFor(line))}\\n\`);
  const total = order.lines.reduce((sum, line) => sum + amountFor(line), 0);
  return \`주문서: \${order.customer}\\n\${rows.join('')}합계: \${won(total)}\`;
}`,
    },
  ];
}

export interface Order {
  customer: string;
  lines: { name: string; type: string; price: number; qty: number }[];
}

export const TESTS: { name: string; order: Order }[] = [
  { name: '책 2권', order: { customer: '민지', lines: [{ name: '소설', type: 'book', price: 15000, qty: 2 }] } },
  { name: '책 10권 할인', order: { customer: '도서관', lines: [{ name: '사전', type: 'book', price: 12000, qty: 10 }] } },
  { name: '음식과 선물', order: { customer: '현우', lines: [{ name: '쿠키', type: 'food', price: 3500, qty: 3 }, { name: '꽃', type: 'gift', price: 20000, qty: 1 }] } },
  { name: '빈 주문', order: { customer: '수아', lines: [] } },
  { name: '모르는 종류', order: { customer: '지훈', lines: [{ name: '장난감', type: 'toy', price: 9000, qty: 1 }, { name: '빵', type: 'food', price: 4000, qty: 1 }] } },
];

type StatementFn = (o: Order) => string;

/** Compile a step's code (our own constant source) and return its statement function. */
export function compile(code: string): StatementFn {
  return new Function(`"use strict";\n${code}\nreturn statement;`)() as StatementFn;
}

export interface TestOutcome {
  pass: boolean;
  got: string;
}

export function runTests(code: string, expected: string[]): TestOutcome[] {
  let fn: StatementFn;
  try {
    fn = compile(code);
  } catch (e) {
    return TESTS.map(() => ({ pass: false, got: String(e) }));
  }
  return TESTS.map((t, i) => {
    try {
      const got = fn(structuredClone(t.order));
      return { pass: got === expected[i], got };
    } catch (e) {
      return { pass: false, got: `${(e as Error).name}: ${(e as Error).message}` };
    }
  });
}

/** Line diff (LCS) between two versions: which lines of `b` are new. */
export function diffLines(a: string[], b: string[]): { added: Set<number>; removed: number } {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added = new Set<number>();
  let i = 0;
  let j = 0;
  let removed = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed++;
      i++;
    } else {
      added.add(j);
      j++;
    }
  }
  removed += n - i;
  for (; j < m; j++) added.add(j);
  return { added, removed };
}

/** Deepest indentation (in levels of two spaces) of non-empty lines. */
export const maxDepth = (code: string) => Math.max(...code.split('\n').filter((s) => s.trim()).map((s) => Math.floor((s.length - s.trimStart().length) / 2)));
export const countIfs = (code: string) => (code.match(/\bif\b/g) ?? []).length;
