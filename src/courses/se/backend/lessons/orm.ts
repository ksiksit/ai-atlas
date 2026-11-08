/**
 * A tiny ORM over an in-memory database, for the ORM lesson.
 *
 * The database holds four tables (users, todos, tags, todo_tags). A Session plays the part of
 * JPA's EntityManager: it turns rows into entity objects, keeps one object per (type, id) in its
 * persistence context (identity map), hands out uninitialised proxies for lazy references, and
 * writes down every SQL statement it would send, with the number of rows that came back.
 * Nothing here talks to a real database; the SQL text is what Hibernate would log.
 */

import { rng } from '../../../../lib/math';

/* ─────────────── tables ─────────────── */

export interface UserRow {
  id: number;
  name: string;
  email: string;
}
export interface TodoRow {
  id: number;
  title: string;
  done: boolean;
  owner_id: number;
}
export interface TagRow {
  id: number;
  name: string;
}
export interface Db {
  users: UserRow[];
  todos: TodoRow[];
  tags: TagRow[];
  /** join table of the many-to-many Todo.tags: [todo_id, tag_id] */
  todoTags: [number, number][];
}

/** How many to-dos the seeded database has. The list page shows the first N of them. */
export const TOTAL_TODOS = 100;

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIVEN = ['민준', '서연', '지호', '유나', '하준', '수아', '도윤', '서윤', '지안', '예준', '시우', '하은', '주원', '지유', '은우', '채원', '건우', '소율', '현우', '다인'];
const TASKS = ['보고서 초안 쓰기', '우유 사기', '치과 예약', '코드 리뷰', '운동 30분', '책 반납', '세금 신고', '회의록 정리', '화분 물 주기', '이력서 고치기', '빨래 개기', '발표 연습', '택배 보내기', '영어 단어 20개', '방 청소'];
const TAGS = ['업무', '집', '급함', '공부', '운동', '장보기'];

/**
 * owners: 'distinct' gives every to-do its own owner (100 users), 'shared' lets 8 users share
 * all the to-dos. Same seed, same data.
 */
export function seedDb(owners: 'distinct' | 'shared', seed = 7): Db {
  const r = rng(seed);
  const userCount = owners === 'distinct' ? TOTAL_TODOS : 8;
  const users: UserRow[] = [];
  for (let i = 1; i <= userCount; i++) {
    const name = SURNAMES[Math.floor(r() * SURNAMES.length)] + GIVEN[Math.floor(r() * GIVEN.length)];
    users.push({ id: i, name, email: `user${i}@todo.example` });
  }
  // distinct owners: a shuffled permutation, so the owner ids are not simply 1, 2, 3 …
  const perm = users.map((u) => u.id);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const todos: TodoRow[] = [];
  const todoTags: [number, number][] = [];
  for (let i = 1; i <= TOTAL_TODOS; i++) {
    const owner = owners === 'distinct' ? perm[i - 1] : 1 + Math.floor(r() * userCount);
    todos.push({ id: i, title: TASKS[Math.floor(r() * TASKS.length)], done: r() < 0.3, owner_id: owner });
    const k = Math.floor(r() * 4); // 0..3 tags
    const picked = new Set<number>();
    while (picked.size < k) picked.add(1 + Math.floor(r() * TAGS.length));
    for (const g of [...picked].sort((a, b) => a - b)) todoTags.push([i, g]);
  }
  return { users, todos, tags: TAGS.map((name, i) => ({ id: i + 1, name })), todoTags };
}

/* ─────────────── entities ─────────────── */

export interface UserE {
  kind: 'User';
  id: number;
  /** false while this is a lazy proxy: only the id is known */
  loaded: boolean;
  name: string;
  email: string;
  /** a number the session gives each Java object it creates, so identity can be shown */
  obj: number;
}
export interface TagE {
  kind: 'Tag';
  id: number;
  name: string;
  obj: number;
}
export interface TagBag {
  todoId: number;
  loaded: boolean;
  items: TagE[];
}
export interface TodoE {
  kind: 'Todo';
  id: number;
  title: string;
  done: boolean;
  owner: UserE;
  tags: TagBag;
  obj: number;
}

export interface Stmt {
  sql: string;
  rows: number;
  /** 'load': while running the repository query. 'render': while the page reads fields. */
  phase: 'load' | 'render';
  /** why the ORM sent it, in Korean */
  why: string;
}

const USER_COLS = 'u.id, u.name, u.email';
const list = (ids: number[]) => ids.join(', ');

/**
 * One persistence context. `batch` is Hibernate's default_batch_fetch_size: when a lazy proxy or
 * collection is first touched, up to `batch` others of the same kind that are still waiting in
 * this context are loaded with it in one `in (…)` query. 1 means no batching.
 */
export class Session {
  log: Stmt[] = [];
  warnings: string[] = [];
  phase: 'load' | 'render' = 'load';
  private users = new Map<number, UserE>();
  private todos = new Map<number, TodoE>();
  private tags = new Map<number, TagE>();
  private bags: TagBag[] = [];
  private snapshots = new Map<number, string>();
  private nextObj = 1;

  constructor(
    public db: Db,
    public batch = 1,
  ) {}

  private emit(sql: string, rows: number, why: string) {
    this.log.push({ sql, rows, phase: this.phase, why });
  }

  /** The managed User for this id: the one already in the context, or a new lazy proxy. */
  userRef(id: number): UserE {
    let u = this.users.get(id);
    if (!u) {
      u = { kind: 'User', id, loaded: false, name: '', email: '', obj: this.nextObj++ };
      this.users.set(id, u);
    }
    return u;
  }

  /** Put a row into the context. If the entity is already there, the row is thrown away. */
  private hydrateUser(row: UserRow): UserE {
    const u = this.userRef(row.id);
    if (!u.loaded) {
      u.loaded = true;
      u.name = row.name;
      u.email = row.email;
      this.snapshots.set(u.id, row.name);
    }
    return u;
  }

  private tagRef(row: TagRow): TagE {
    let g = this.tags.get(row.id);
    if (!g) {
      g = { kind: 'Tag', id: row.id, name: row.name, obj: this.nextObj++ };
      this.tags.set(row.id, g);
    }
    return g;
  }

  private hydrateTodo(row: TodoRow): TodoE {
    let t = this.todos.get(row.id);
    if (!t) {
      const bag: TagBag = { todoId: row.id, loaded: false, items: [] };
      this.bags.push(bag);
      t = { kind: 'Todo', id: row.id, title: row.title, done: row.done, owner: this.userRef(row.owner_id), tags: bag, obj: this.nextObj++ };
      this.todos.set(row.id, t);
    }
    return t;
  }

  /** What touching a proxy does: load it, and with batching also other waiting proxies. */
  initUser(u: UserE, why = `${u.id}번 사용자의 프록시를 처음 건드림`) {
    if (u.loaded) return;
    const waiting = [...this.users.values()].filter((x) => !x.loaded && x !== u).map((x) => x.id);
    const ids = [u.id, ...waiting.slice(0, Math.max(0, this.batch - 1))];
    const rows = this.db.users.filter((r) => ids.includes(r.id));
    if (ids.length === 1) this.emit(`select ${USER_COLS} from users u where u.id = ${u.id}`, rows.length, why);
    else this.emit(`select ${USER_COLS} from users u where u.id in (${list(ids)})`, rows.length, `${why} → 기다리던 프록시 ${ids.length - 1}개도 함께`);
    for (const r of rows) this.hydrateUser(r);
  }

  private tagRowsFor(todoIds: number[]) {
    return this.db.todoTags.filter(([t]) => todoIds.includes(t)).map(([t, g]) => ({ todo: t, tag: this.db.tags[g - 1] }));
  }

  initTags(bag: TagBag) {
    if (bag.loaded) return;
    const waiting = this.bags.filter((b) => !b.loaded && b !== bag).map((b) => b.todoId);
    const ids = [bag.todoId, ...waiting.slice(0, Math.max(0, this.batch - 1))];
    const rows = this.tagRowsFor(ids);
    const base = 'select tt.todo_id, g.id, g.name from todo_tags tt join tags g on g.id = tt.tag_id';
    if (ids.length === 1) this.emit(`${base} where tt.todo_id = ${bag.todoId}`, rows.length, `${bag.todoId}번 할 일의 tags 컬렉션을 처음 건드림`);
    else this.emit(`${base} where tt.todo_id in (${list(ids)})`, rows.length, `${bag.todoId}번 할 일의 tags 컬렉션 → 기다리던 컬렉션 ${ids.length - 1}개도 함께`);
    for (const b of this.bags) {
      if (!ids.includes(b.todoId)) continue;
      b.loaded = true;
      b.items = rows.filter((x) => x.todo === b.todoId).map((x) => this.tagRef(x.tag));
    }
  }

  /* ── EntityManager-like calls, for the identity-map figure ── */

  /** em.find(User.class, id): the context first, the database only on a miss. */
  findUser(id: number): { user: UserE | null; hit: boolean } {
    const u = this.users.get(id);
    if (u?.loaded) return { user: u, hit: true };
    const row = this.db.users.find((r) => r.id === id);
    this.emit(`select ${USER_COLS} from users u where u.id = ${id}`, row ? 1 : 0, `find(User, ${id}): 영속성 컨텍스트에 없음`);
    return { user: row ? this.hydrateUser(row) : null, hit: false };
  }

  /** A JPQL query always goes to the database, but a row for an entity already managed is discarded. */
  queryUserById(id: number): { user: UserE | null; discarded: boolean } {
    const row = this.db.users.find((r) => r.id === id);
    this.emit(`select ${USER_COLS} from users u where u.id = ${id}`, row ? 1 : 0, `JPQL 쿼리는 항상 데이터베이스로 감`);
    if (!row) return { user: null, discarded: false };
    const had = this.users.get(id)?.loaded ?? false;
    return { user: this.hydrateUser(row), discarded: had };
  }

  findTodo(id: number): { todo: TodoE | null; hit: boolean } {
    const t = this.todos.get(id);
    if (t) return { todo: t, hit: true };
    const row = this.db.todos.find((r) => r.id === id);
    this.emit(`select t.id, t.title, t.done, t.owner_id from todos t where t.id = ${id}`, row ? 1 : 0, `find(Todo, ${id}): 영속성 컨텍스트에 없음`);
    return { todo: row ? this.hydrateTodo(row) : null, hit: false };
  }

  /** Dirty checking: compare every loaded User with the snapshot taken when it was loaded. */
  flush(): number {
    let n = 0;
    for (const u of this.users.values()) {
      if (!u.loaded || this.snapshots.get(u.id) === u.name) continue;
      this.emit(`update users set name = '${u.name}', email = '${u.email}' where id = ${u.id}`, 1, `flush: ${u.id}번 사용자가 읽었을 때와 달라짐`);
      const row = this.db.users.find((r) => r.id === u.id);
      if (row) row.name = u.name;
      this.snapshots.set(u.id, u.name);
      n++;
    }
    return n;
  }

  clear() {
    this.users.clear();
    this.todos.clear();
    this.tags.clear();
    this.bags = [];
    this.snapshots.clear();
  }

  managed(): { key: string; loaded: boolean; obj: number; label: string }[] {
    const out: { key: string; loaded: boolean; obj: number; label: string }[] = [];
    for (const u of this.users.values()) out.push({ key: `User#${u.id}`, loaded: u.loaded, obj: u.obj, label: u.loaded ? u.name : '프록시 (id만 앎)' });
    for (const t of this.todos.values()) out.push({ key: `Todo#${t.id}`, loaded: true, obj: t.obj, label: t.title });
    return out;
  }

  /* ── the list-page queries ── */

  /** select t from Todo t order by t.id, page of n */
  queryTodos(n: number): TodoE[] {
    const rows = this.db.todos.slice(0, n);
    this.emit(`select t.id, t.title, t.done, t.owner_id from todos t order by t.id limit ${n}`, rows.length, 'TodoRepository.findAll(첫 페이지)');
    return rows.map((r) => this.hydrateTodo(r));
  }

  /** select t from Todo t join fetch t.owner order by t.id, page of n */
  queryTodosJoinOwner(n: number): TodoE[] {
    const rows = this.db.todos.slice(0, n);
    this.emit(`select t.id, t.title, t.done, ${USER_COLS} from todos t join users u on u.id = t.owner_id order by t.id limit ${n}`, rows.length, '페치 조인: 할 일과 주인을 한 번에');
    for (const r of rows) this.hydrateUser(this.db.users[r.owner_id - 1]);
    return rows.map((r) => this.hydrateTodo(r));
  }

  /**
   * select t from Todo t join fetch t.owner left join fetch t.tags, page of n.
   * A page limit cannot be put into SQL when a collection is fetch-joined (one to-do spans
   * several rows), so Hibernate reads every row and cuts the page in memory.
   */
  queryTodosJoinAll(n: number): TodoE[] {
    let rows = 0;
    for (const t of this.db.todos) rows += Math.max(1, this.db.todoTags.filter(([x]) => x === t.id).length);
    this.emit(
      `select t.id, t.title, t.done, ${USER_COLS}, g.id, g.name from todos t join users u on u.id = t.owner_id left join todo_tags tt on tt.todo_id = t.id left join tags g on g.id = tt.tag_id order by t.id`,
      rows,
      '페치 조인: 할 일, 주인, 태그를 한 번에 (limit 없음)',
    );
    this.warnings.push('firstResult/maxResults specified with collection fetch; applying in memory');
    const out: TodoE[] = [];
    for (const r of this.db.todos) {
      this.hydrateUser(this.db.users[r.owner_id - 1]);
      const t = this.hydrateTodo(r);
      t.tags.loaded = true;
      t.tags.items = this.tagRowsFor([r.id]).map((x) => this.tagRef(x.tag));
      out.push(t);
    }
    return out.slice(0, n);
  }
}

/* ─────────────── the list page ─────────────── */

export type Strategy = 'lazy' | 'eager' | 'join' | 'batch' | 'joinBatch';

export const STRATEGY_NAME: Record<Strategy, string> = {
  lazy: '지연 로딩',
  eager: '즉시 로딩 (EAGER)',
  join: '페치 조인',
  batch: '배치 로딩',
  joinBatch: '조인 + 배치',
};

export interface PageRow {
  id: number;
  title: string;
  owner: string;
  tags: string[];
}
export interface PageResult {
  log: Stmt[];
  queries: number;
  rows: number;
  page: PageRow[];
  warnings: string[];
  /** distinct owners among the to-dos on the page */
  owners: number;
}

/**
 * Render "a list page of the first n to-dos with their owner's name (and tags)".
 * `batch` only matters for the strategies that load lazily with batching.
 */
export function renderList(db: Db, n: number, strategy: Strategy, batch: number, withTags: boolean): PageResult {
  const batched = strategy === 'batch' || strategy === 'joinBatch';
  const s = new Session(db, batched ? Math.max(1, batch) : 1);
  let todos: TodoE[];
  if (strategy === 'join' && withTags) todos = s.queryTodosJoinAll(n);
  else if (strategy === 'join' || strategy === 'joinBatch') todos = s.queryTodosJoinOwner(n);
  else todos = s.queryTodos(n);
  if (strategy === 'eager') {
    // @ManyToOne(fetch = EAGER) with a JPQL query: the query result arrives first, then Hibernate
    // loads every owner that is still missing, one select each, before returning to the caller.
    for (const t of todos) s.initUser(t.owner, `owner가 EAGER라 쿼리 직후 바로 채움 (${t.id}번 할 일)`);
  }
  s.phase = 'render';
  const page: PageRow[] = todos.map((t) => {
    s.initUser(t.owner, `${t.id}번 할 일의 owner.getName()`);
    if (withTags) s.initTags(t.tags);
    return { id: t.id, title: t.title, owner: t.owner.name, tags: withTags ? t.tags.items.map((g) => g.name) : [] };
  });
  return {
    log: s.log,
    queries: s.log.length,
    rows: s.log.reduce((a, x) => a + x.rows, 0),
    page,
    warnings: s.warnings,
    owners: new Set(db.todos.slice(0, n).map((t) => t.owner_id)).size,
  };
}

/* ─────────────── the identity-map figure: a script of EntityManager calls ─────────────── */

export type Action = 'find1' | 'find2' | 'jpql1' | 'todoOwner' | 'rename1' | 'flush' | 'clear';

export const ACTION_CODE: Record<Action, string> = {
  find1: 'em.find(User.class, 1L)',
  find2: 'em.find(User.class, 2L)',
  jpql1: 'em.createQuery("select u from User u where u.id = 1")',
  todoOwner: 'em.find(Todo.class, 3L).getOwner().getName()',
  rename1: 'em.find(User.class, 1L).setName("김민지")',
  flush: 'em.flush()  // 커밋 직전에 저절로',
  clear: 'em.clear()  // 트랜잭션이 끝나면 저절로',
};

export interface ActionStep {
  action: Action;
  sql: string[];
  /** what came back, e.g. "User@3 (김민준)" */
  result: string;
  note: string;
}

/** A tiny database for the identity-map figure: to-do 3 belongs to user 1. */
export function smallDb(): Db {
  return {
    users: [
      { id: 1, name: '김민준', email: 'minjun@todo.example' },
      { id: 2, name: '이서연', email: 'seoyeon@todo.example' },
    ],
    todos: [
      { id: 1, title: '보고서 초안 쓰기', done: false, owner_id: 2 },
      { id: 2, title: '우유 사기', done: true, owner_id: 2 },
      { id: 3, title: '치과 예약', done: false, owner_id: 1 },
    ],
    tags: [],
    todoTags: [],
  };
}

const userStr = (u: UserE | null) => (u ? `User@${u.obj} (${u.name})` : 'null');

export function runScript(actions: Action[]): { steps: ActionStep[]; session: Session; db: Db } {
  const db = smallDb();
  const s = new Session(db);
  const steps: ActionStep[] = [];
  for (const a of actions) {
    const before = s.log.length;
    let result = '';
    let note = '';
    if (a === 'find1' || a === 'find2') {
      const r = s.findUser(a === 'find1' ? 1 : 2);
      result = userStr(r.user);
      note = r.hit ? '1차 캐시에 있어 쿼리 없이 같은 객체를 돌려줌' : '데이터베이스에서 읽어 컨텍스트에 넣음';
    } else if (a === 'jpql1') {
      const r = s.queryUserById(1);
      result = userStr(r.user);
      note = r.discarded ? '쿼리는 나갔지만 이미 관리 중인 엔티티라 읽은 행은 버리고 같은 객체를 돌려줌' : '읽은 행으로 새 엔티티를 만들어 컨텍스트에 넣음';
    } else if (a === 'todoOwner') {
      const r = s.findTodo(3);
      const owner = r.todo!.owner;
      const wasLoaded = owner.loaded;
      s.initUser(owner, '3번 할 일의 owner 프록시를 처음 건드림');
      result = `"${owner.name}" (owner = User@${owner.obj})`;
      note = wasLoaded ? (r.hit ? '할 일도 주인도 이미 컨텍스트에 있음' : 'owner는 이미 읽은 1번 사용자라 프록시가 아니라 그 객체를 가리킴') : 'owner는 프록시였다가 getName()에서 채워짐';
    } else if (a === 'rename1') {
      const r = s.findUser(1);
      if (r.user) r.user.name = r.user.name === '김민지' ? '김민준' : '김민지';
      result = userStr(r.user);
      note = '객체만 바꿈. update는 아직 나가지 않음';
    } else if (a === 'flush') {
      const n = s.flush();
      result = n ? `update ${n}건` : '바뀐 것 없음';
      note = n ? '스냅숏과 비교해 달라진 엔티티만 update' : '스냅숏과 같으면 아무것도 보내지 않음';
    } else {
      s.clear();
      result = '컨텍스트 비움';
      note = '다음 find는 다시 데이터베이스로 감';
    }
    steps.push({ action: a, sql: s.log.slice(before).map((x) => x.sql), result, note });
  }
  return { steps, session: s, db };
}
