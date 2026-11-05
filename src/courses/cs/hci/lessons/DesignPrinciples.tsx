import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Callout, Check, Figure, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { rng } from '../../../../lib/math';
import { lessonHref } from '../../../index';
import './hci.css';
import './design.css';

/* ─────────────── Figure 1: where can I press? ─────────────── */

type CandId = 'title' | 'address' | 'badge' | 'cancel' | 'info' | 'photo';
const CANDS: { id: CandId; click: boolean; name: string }[] = [
  { id: 'title', click: false, name: '주문 번호' },
  { id: 'photo', click: false, name: '상품 사진' },
  { id: 'badge', click: false, name: '무료 배송 표시' },
  { id: 'address', click: true, name: '배송지 변경' },
  { id: 'info', click: true, name: '도착 예정일 안내' },
  { id: 'cancel', click: true, name: '주문 취소' },
];
const CLICKABLE = CANDS.filter((c) => c.click).length;

function SignifierFigure() {
  const [signs, setSigns] = useState(false);
  const [hits, setHits] = useState<CandId[]>([]);
  const [reveal, setReveal] = useState(false);
  const found = new Set(hits.filter((h) => CANDS.find((c) => c.id === h)!.click));
  const misses = hits.filter((h) => !CANDS.find((c) => c.id === h)!.click).length;
  const last = hits[hits.length - 1];
  const lastC = last ? CANDS.find((c) => c.id === last)! : null;

  const press = (id: CandId) => setHits((h) => [...h, id]);
  const flip = (v: boolean) => {
    setSigns(v);
    setHits([]);
    setReveal(false);
  };
  const state = (id: CandId) => {
    const c = CANDS.find((x) => x.id === id)!;
    if (reveal) return c.click ? 'yes' : 'no';
    if (!hits.includes(id)) return undefined;
    return c.click ? 'yes' : 'no';
  };
  const cand = (id: CandId, children: ReactNode, extra = '') => (
    <button type="button" className={`dz-cand ${extra}`} data-id={id} data-state={state(id)} onClick={() => press(id)} aria-label={`${CANDS.find((c) => c.id === id)!.name}: 눌러 보기`}>
      {children}
    </button>
  );

  const note = !hits.length
    ? `이 화면에서 누를 수 있는 것은 ${CLICKABLE}개입니다. 눌러서 무언가 일어날 것 같은 곳을 모두 눌러 보세요.`
    : lastC!.click
      ? `"${lastC!.name}"은(는) 누를 수 있습니다. ${found.size}/${CLICKABLE}개를 찾았습니다.`
      : `"${lastC!.name}"은(는) 아무 일도 일어나지 않습니다. 누를 수 있어 보였다면 화면이 잘못 알려 준 것입니다.`;

  return (
    <Figure
      no={1}
      title="어디를 누를 수 있을까요?"
      hint="누를 수 있어 보이는 곳을 눌러 보세요"
      caption={
        <>
          같은 주문 확인 화면을 두 가지로 그렸습니다. "기표 없음"은 누를 수 있는 글자와 그냥 글자가 똑같이 생겼고, 누를 수 없는 표시가 버튼처럼 둥근 상자에 담겨 있습니다. "기표 있음"은 누를 수 있는 것에만 밑줄, 테두리, 글자 이름표를 붙였습니다. 기능은 똑같고 생김새만 다릅니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="화면"
          value={signs ? 'on' : 'off'}
          onChange={(v) => flip(v === 'on')}
          options={[
            { value: 'off', label: '기표 없음' },
            { value: 'on', label: '기표 있음' },
          ]}
        />
        <div className="btn-row">
          <Button small onClick={() => setReveal((r) => !r)}>
            {reveal ? '정답 숨기기' : '정답 보기'}
          </Button>
          <Button small onClick={() => flip(signs)} disabled={!hits.length && !reveal}>
            처음부터
          </Button>
        </div>
      </div>
      <div className="dz-card" data-signs={signs || undefined}>
        <div className="dz-card-top">
          {cand('title', <span className="dz-order">주문 #2048</span>)}
          {cand('badge', <span>무료 배송</span>, 'dz-badge')}
        </div>
        <div className="dz-card-mid">
          {cand(
            'photo',
            <span className="dz-photo" aria-hidden="true">
              <i />
            </span>,
          )}
          <div className="dz-card-text">
            <div className="dz-item">면 셔츠, 하늘색, M</div>
            <div className="dz-ship">
              서울시 마포구 ○○로 12 · {cand('address', <span>배송지 변경</span>, 'dz-link')}
            </div>
            <div className="dz-ship">
              도착 예정 목요일 {cand('info', <span>{signs ? 'ⓘ 자세히' : 'ⓘ'}</span>, 'dz-icon')}
            </div>
          </div>
        </div>
        <div className="dz-card-bot">{cand('cancel', <span>주문 취소</span>, 'dz-action')}</div>
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="찾은 버튼" value={`${found.size} / ${CLICKABLE}`} color={found.size === CLICKABLE ? 'var(--good)' : undefined} />
        <Readout label="헛누름" value={`${misses}번`} color={misses ? 'var(--bad)' : undefined} />
        <Readout label="누른 횟수" value={`${hits.length}번`} />
      </div>
      <div className="hc-note" data-bad={(lastC && !lastC.click) || undefined} aria-live="polite">
        {note}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: stove knobs ─────────────── */

/** Burners by grid position: 0 왼쪽 뒤, 1 오른쪽 뒤, 2 왼쪽 앞, 3 오른쪽 앞. */
const BURNER_KO = ['왼쪽 뒤', '오른쪽 뒤', '왼쪽 앞', '오른쪽 앞'];
/** A common real layout: knobs in one row, left to right = 왼쪽 앞, 왼쪽 뒤, 오른쪽 뒤, 오른쪽 앞. */
const ROW_ORDER = [2, 0, 1, 3];
const TRIALS = 8;
type Layout = 'row' | 'grid';

function targets(seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  while (out.length < TRIALS) {
    const t = Math.floor(r() * 4);
    if (t !== out[out.length - 1]) out.push(t);
  }
  return out;
}

interface StoveResult {
  mistakes: number;
  ms: number[];
}

function StoveFigure() {
  const [layout, setLayout] = useState<Layout>('row');
  const [icons, setIcons] = useState(false);
  const [seed, setSeed] = useState(4);
  const [trial, setTrial] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  const [cur, setCur] = useState<StoveResult>({ mistakes: 0, ms: [] });
  const [done, setDone] = useState<Partial<Record<string, StoveResult>>>({});
  const t0 = useRef(0);
  const goal = targets(seed);
  const key = layout === 'row' ? (icons ? 'row-icons' : 'row') : 'grid';
  const finished = trial >= TRIALS;

  useEffect(() => {
    t0.current = performance.now();
  }, [trial, key, seed]);

  const restart = (l: Layout, ic: boolean) => {
    setLayout(l);
    setIcons(ic);
    setTrial(0);
    setLit(null);
    setWrong(false);
    setCur({ mistakes: 0, ms: [] });
    setSeed((s) => s + 1);
  };

  const turn = (burner: number) => {
    if (finished) return;
    setLit(burner);
    if (burner === goal[trial]) {
      const ms = [...cur.ms, performance.now() - t0.current];
      const next = { mistakes: cur.mistakes, ms };
      setCur(next);
      setWrong(false);
      if (trial + 1 >= TRIALS) setDone((d) => ({ ...d, [key]: next }));
      setTrial((t) => t + 1);
    } else {
      setCur((c) => ({ ...c, mistakes: c.mistakes + 1 }));
      setWrong(true);
    }
  };

  const knobOrder = layout === 'row' ? ROW_ORDER : [0, 1, 2, 3];
  const avg = (r?: StoveResult) => (r && r.ms.length ? (r.ms.reduce((a, b) => a + b, 0) / r.ms.length / 1000).toFixed(2) + '초' : '–');
  const LABEL: Record<string, string> = { row: '한 줄', 'row-icons': '한 줄 + 그림', grid: '같은 배치' };

  return (
    <Figure
      no={2}
      title="이 버너를 켜려면 어느 손잡이를?"
      hint={`점선 버너를 켜는 손잡이를 누르세요. ${TRIALS}번 합니다`}
      caption={
        <>
          가스레인지의 버너 네 개는 2×2로 놓여 있는데 손잡이는 앞쪽에 한 줄로 붙어 있는 경우가 많습니다. "한 줄"은 실제로 흔한 배치(왼쪽부터 왼쪽 앞, 왼쪽 뒤, 오른쪽 뒤, 오른쪽 앞)이고, "같은 배치"는 손잡이를 버너와 똑같이 2×2로 놓았습니다. 걸린 시간은 이 브라우저에서 잰 값이고 어디에도 저장하거나 보내지 않습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="손잡이 배치"
          value={layout}
          onChange={(v) => restart(v, icons)}
          options={[
            { value: 'row', label: '한 줄' },
            { value: 'grid', label: '버너와 같은 배치' },
          ]}
        />
        {layout === 'row' && <Check label="손잡이마다 작은 그림" checked={icons} onChange={(v) => restart('row', v)} />}
        <Button small onClick={() => restart(layout, icons)}>
          다시 하기
        </Button>
      </div>
      <div className="dz-stove-wrap">
        <div className="dz-stove" aria-label="가스레인지">
          <div className="dz-burners">
            {[0, 1, 2, 3].map((b) => (
              <div key={b} className="dz-burner" data-goal={(!finished && goal[trial] === b) || undefined} data-lit={lit === b || undefined} data-wrong={(lit === b && wrong) || undefined}>
                <span>{BURNER_KO[b]}</span>
              </div>
            ))}
          </div>
          <div className={'dz-knobs ' + layout}>
            {knobOrder.map((b, i) => (
              <button key={i} type="button" className="dz-knob" onClick={() => turn(b)} disabled={finished} aria-label={layout === 'grid' || icons ? `${BURNER_KO[b]} 버너 손잡이` : `${i + 1}번 손잡이`}>
                <i aria-hidden="true" />
                {(layout === 'row' && icons) && (
                  <span className="dz-mini" aria-hidden="true">
                    {[0, 1, 2, 3].map((q) => (
                      <b key={q} data-on={q === b || undefined} />
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="hc-col">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="진행" value={`${Math.min(trial, TRIALS)} / ${TRIALS}`} />
            <Readout label="잘못 켠 횟수" value={`${cur.mistakes}번`} color={cur.mistakes ? 'var(--bad)' : undefined} />
          </div>
          <table className="dz-table">
            <thead>
              <tr>
                <th>배치</th>
                <th>실수</th>
                <th>한 번에 걸린 시간</th>
              </tr>
            </thead>
            <tbody>
              {(['row', 'row-icons', 'grid'] as const).map((k) => (
                <tr key={k} data-cur={k === key || undefined}>
                  <td>{LABEL[k]}</td>
                  <td className="mono">{done[k] ? `${done[k]!.mistakes}번` : '–'}</td>
                  <td className="mono">{avg(done[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hc-note" data-bad={wrong || undefined} aria-live="polite">
            {finished
              ? `끝났습니다. 실수 ${cur.mistakes}번, 평균 ${avg(cur)}. 다른 배치로 바꿔 비교해 보세요.`
              : wrong
                ? `${BURNER_KO[lit!]} 버너가 켜졌습니다. 켜야 할 것은 ${BURNER_KO[goal[trial]]} 버너입니다.`
                : `${trial + 1}번째: ${BURNER_KO[goal[trial]]} 버너를 켜세요.`}
          </div>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: feedback ─────────────── */

const DELAY = 1500;

function FeedbackFigure() {
  const [fb, setFb] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [orders, setOrders] = useState(0);
  const [pending, setPending] = useState(0);
  const [doneOrders, setDoneOrders] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  useEffect(() => {
    if (!fb || start === null || pending === 0) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 50);
    return () => clearInterval(id);
  }, [fb, start, pending]);

  const reset = (v: boolean) => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    setFb(v);
    setClicks(0);
    setOrders(0);
    setPending(0);
    setDoneOrders(0);
    setStart(null);
  };
  const pay = () => {
    setClicks((c) => c + 1);
    if (fb && pending > 0) return;
    setOrders((o) => o + 1);
    setPending((p) => p + 1);
    if (start === null || pending === 0) setStart(performance.now());
    timers.current.push(
      window.setTimeout(() => {
        setPending((p) => p - 1);
        setDoneOrders((d) => d + 1);
      }, DELAY),
    );
  };

  const busy = fb && pending > 0;
  const progress = busy && start !== null ? Math.min(1, (performance.now() - start) / DELAY) : 0;
  const dup = Math.max(0, orders - 1);

  return (
    <Figure
      no={3}
      title="결제 버튼을 눌렀는데 아무 일도 없다면"
      hint="결제하기를 눌러 보세요. 처리에 1.5초 걸립니다"
      caption={
        <>
          두 버튼 모두 누르면 서버에 주문을 보내고, 답이 오기까지 1.5초가 걸립니다. "피드백 없음"은 그동안 화면이 그대로이고, 다시 누르면 주문이 또 들어갑니다. "피드백 있음"은 누르는 즉시 버튼이 "결제 중"으로 바뀌고 진행 막대가 차며, 처리가 끝날 때까지 다시 누를 수 없습니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="버튼"
          value={fb ? 'on' : 'off'}
          onChange={(v) => reset(v === 'on')}
          options={[
            { value: 'off', label: '피드백 없음' },
            { value: 'on', label: '피드백 있음' },
          ]}
        />
        <Button small onClick={() => reset(fb)}>
          처음부터
        </Button>
      </div>
      <div className="dz-pay">
        <div className="dz-pay-box">
          <div className="dz-pay-sum">
            <span>합계</span>
            <strong className="mono">39,000원</strong>
          </div>
          <button type="button" className="btn primary dz-pay-btn" onClick={pay} aria-disabled={busy || undefined} data-busy={busy || undefined}>
            {busy ? '결제 중…' : '결제하기'}
            {busy && <i className="dz-bar" style={{ width: `${progress * 100}%` }} aria-hidden="true" />}
          </button>
          <div className="dz-pay-msg" aria-live="polite">
            {doneOrders > 0 && pending === 0 ? (doneOrders > 1 ? `주문 ${doneOrders}건이 결제되었습니다.` : '주문 1건이 결제되었습니다.') : fb && busy ? '결제를 처리하고 있습니다. 창을 닫지 마세요.' : ''}
          </div>
        </div>
        <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Readout label="누른 횟수" value={`${clicks}번`} />
          <Readout label="들어간 주문" value={`${orders}건`} color={dup ? 'var(--bad)' : undefined} />
          <Readout label="중복 결제" value={`${dup}건`} color={dup ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
      <div className="hc-note" data-bad={dup > 0 || undefined}>
        {!clicks
          ? '결제하기를 눌러 보세요. 1초쯤 지나도 아무 반응이 없으면 다시 누르고 싶어집니다.'
          : dup
            ? `${dup}건이 중복으로 결제되었습니다. 사용자는 첫 클릭이 먹히지 않았다고 생각했을 뿐입니다.`
            : fb
              ? '버튼이 바로 바뀌어서 눌렸다는 것을 알 수 있고, 다시 눌러도 주문이 하나만 들어갑니다.'
              : '아직은 주문이 하나입니다. 기다리지 말고 한 번 더 눌러 보세요.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: slips, confirmation and undo ─────────────── */

type DelMode = 'now' | 'confirm' | 'undo';
const FILES = ['여행 사진 2024', '졸업 논문 최종', '가계부.xlsx', '이력서_수정본', '아이 첫돌 영상', '세금 영수증'];
const UNDO_MS = 6000;

function UndoFigure() {
  const [mode, setMode] = useState<DelMode>('now');
  const [files, setFiles] = useState(FILES);
  const [lost, setLost] = useState<string[]>([]);
  const [restored, setRestored] = useState(0);
  const [ask, setAsk] = useState<string | null>(null);
  const [toast, setToast] = useState<{ name: string; at: number; idx: number } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [seed, setSeed] = useState(2);
  const timer = useRef<number | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (ask) confirmRef.current?.focus();
  }, [ask]);

  const reset = (m: DelMode) => {
    if (timer.current) clearTimeout(timer.current);
    setMode(m);
    setFiles(FILES);
    setLost([]);
    setRestored(0);
    setAsk(null);
    setToast(null);
    setOpened(null);
  };
  const remove = (name: string) => {
    const idx = files.indexOf(name);
    setFiles((f) => f.filter((x) => x !== name));
    if (mode === 'undo') {
      if (timer.current) clearTimeout(timer.current);
      // the previous toast's file is gone for good once a new one replaces it
      if (toast) setLost((l) => [...l, toast.name]);
      setToast({ name, at: performance.now(), idx });
      timer.current = window.setTimeout(() => {
        setLost((l) => [...l, name]);
        setToast(null);
      }, UNDO_MS);
    } else setLost((l) => [...l, name]);
  };
  const del = (name: string) => {
    setOpened(null);
    if (mode === 'confirm') setAsk(name);
    else remove(name);
  };
  const undo = () => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    const { name, idx } = toast;
    setFiles((f) => {
      const n = [...f];
      n.splice(Math.min(idx, n.length), 0, name);
      return n;
    });
    setRestored((r) => r + 1);
    setToast(null);
  };
  /** A slip: the hand meant "열기" but landed on the "삭제" right next to it. */
  const slip = () => {
    if (!files.length) return;
    const r = rng(seed);
    setSeed((s) => s + 1);
    del(files[Math.floor(r() * files.length)]);
  };

  return (
    <Figure
      no={4}
      title="손이 미끄러졌을 때"
      hint="'미끄러진 클릭'을 눌러 실수를 흉내 내 보세요"
      caption={
        <>
          파일마다 "열기"와 "삭제"가 바로 붙어 있어서, 열려던 손이 삭제를 누르기 쉽습니다. "미끄러진 클릭"은 무작위 파일의 삭제를 대신 눌러 줍니다. "확인 창"은 지우기 전에 묻고, 초점이 처음부터 "삭제"에 가 있습니다. 습관처럼 엔터를 누르는 사람을 흉내 낸 것입니다. "되돌리기"는 묻지 않고 지운 뒤 {UNDO_MS / 1000}초 동안 되돌릴 기회를 줍니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="삭제 방식"
          value={mode}
          onChange={reset}
          options={[
            { value: 'now', label: '바로 삭제' },
            { value: 'confirm', label: '확인 창' },
            { value: 'undo', label: '되돌리기' },
          ]}
        />
        <div className="btn-row">
          <Button small primary onClick={slip} disabled={!files.length || !!ask}>
            미끄러진 클릭
          </Button>
          <Button small onClick={() => reset(mode)}>
            처음부터
          </Button>
        </div>
      </div>
      <div className="dz-files-wrap">
        <ul className="dz-files">
          {files.map((f) => (
            <li key={f} data-open={opened === f || undefined}>
              <span className="dz-fname">{f}</span>
              <span className="dz-fbtns">
                <button type="button" onClick={() => setOpened(f)}>
                  열기
                </button>
                <button type="button" onClick={() => del(f)} aria-label={`${f} 삭제`}>
                  삭제
                </button>
              </span>
            </li>
          ))}
          {!files.length && <li className="dz-empty">파일이 없습니다.</li>}
        </ul>
        {ask && (
          <div className="dz-ask" role="alertdialog" aria-label="삭제 확인">
            <p>"{ask}"을(를) 삭제할까요?</p>
            <div className="btn-row">
              <button
                ref={confirmRef}
                type="button"
                className="btn primary small"
                onClick={() => {
                  remove(ask);
                  setAsk(null);
                }}
              >
                삭제
              </button>
              <button type="button" className="btn small" onClick={() => setAsk(null)}>
                취소
              </button>
            </div>
          </div>
        )}
        {toast && (
          <div className="dz-toast" role="status">
            <span>"{toast.name}"을(를) 삭제했습니다.</span>
            <button type="button" onClick={undo}>
              되돌리기
            </button>
            <i className="dz-toast-bar" key={toast.at} style={{ animationDuration: `${UNDO_MS}ms` }} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout label="되살린 파일" value={`${restored}개`} color={restored ? 'var(--good)' : undefined} />
        <Readout label="영영 잃은 파일" value={`${lost.length}개`} color={lost.length ? 'var(--bad)' : undefined} />
        <Readout label="남은 파일" value={`${files.length}개`} />
      </div>
      <div className="hc-note" data-bad={lost.length > 0 || undefined} aria-live="polite">
        {opened
          ? `"${opened}"을(를) 열었습니다.`
          : lost.length
            ? `잃은 파일: ${lost.join(', ')}.${mode === 'confirm' ? ' 확인 창이 떴지만 손은 이미 엔터로 가 있었습니다.' : ''}`
            : mode === 'undo' && toast
              ? '지워졌지만 아직 되돌릴 수 있습니다. 아래 막대가 다 줄기 전에 되돌리기를 누르세요.'
              : '"미끄러진 클릭"을 눌러 보세요.'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 5: a cancel flow, two ways ─────────────── */

type Step = 'home' | 'settings' | 'more' | 'shame' | 'last' | 'kept' | 'renewed' | 'cancelled' | 'h-home' | 'h-ask';
const PATTERNS: Record<string, { name: string; en: string; what: string }> = {
  hidden: { name: '숨겨진 출구', en: 'roach motel', what: '가입은 첫 화면의 큰 버튼 하나인데, 해지는 설정 → 기타 → 구독 관리로 세 겹 아래 숨어 있습니다.' },
  shame: { name: '망신 주기', en: 'confirmshaming', what: '거절하는 쪽 선택지를 "저는 아끼는 것을 싫어합니다"처럼 스스로를 깎아내리는 문장으로 씁니다.' },
  preselect: { name: '미리 체크된 상자', en: 'preselection', what: '해지 마지막 화면에 "3개월 더 이용하기"가 이미 체크되어 있어, 그대로 누르면 해지 대신 연장됩니다.' },
  emphasis: { name: '거꾸로 된 강조', en: 'visual interference', what: '사용자가 원하는 "해지"는 작은 회색 글자이고, 서비스가 원하는 "유지"는 크고 진한 버튼입니다.' },
};

function DarkPatternFigure() {
  const [honest, setHonest] = useState(false);
  const [step, setStep] = useState<Step>('home');
  const [clicks, setClicks] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const [box, setBox] = useState(true);

  const go = (s: Step, pattern?: string) => {
    setClicks((c) => c + 1);
    setStep(s);
    if (pattern) setSeen((p) => (p.includes(pattern) ? p : [...p, pattern]));
  };
  const reset = (h: boolean) => {
    setHonest(h);
    setStep(h ? 'h-home' : 'home');
    setClicks(0);
    setSeen([]);
    setBox(true);
  };

  const screen = (() => {
    switch (step) {
      case 'home':
        return (
          <>
            <h4>내 계정</h4>
            <p className="dz-sub">별빛 구독 · 프리미엄 · 매달 12,900원</p>
            <button type="button" className="btn primary" onClick={() => go('home')}>
              프리미엄 혜택 더 보기
            </button>
            <button type="button" className="dz-faint" onClick={() => go('settings', 'hidden')}>
              설정
            </button>
          </>
        );
      case 'settings':
        return (
          <>
            <h4>설정</h4>
            <ul className="dz-menu">
              {['알림', '언어', '결제 수단'].map((x) => (
                <li key={x}>
                  <button type="button" onClick={() => go('settings')}>
                    {x}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => go('more')}>
                  기타
                </button>
              </li>
            </ul>
          </>
        );
      case 'more':
        return (
          <>
            <h4>기타</h4>
            <ul className="dz-menu">
              {['이용 약관', '개인정보 처리방침'].map((x) => (
                <li key={x}>
                  <button type="button" onClick={() => go('more')}>
                    {x}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => go('shame')}>
                  구독 관리
                </button>
              </li>
            </ul>
          </>
        );
      case 'shame':
        return (
          <>
            <h4>정말 떠나시겠어요?</h4>
            <p className="dz-sub">지금 떠나면 저장한 목록 128개와 맞춤 추천이 모두 사라집니다.</p>
            <button type="button" className="btn primary" onClick={() => go('kept', 'emphasis')}>
              혜택 계속 누리기
            </button>
            <button type="button" className="dz-faint" onClick={() => go('last', 'shame')}>
              아니요, 저는 아끼는 것을 싫어합니다
            </button>
          </>
        );
      case 'last':
        return (
          <>
            <h4>해지 전 마지막 단계</h4>
            <label className="dz-box">
              <input
                type="checkbox"
                checked={box}
                onChange={(e) => {
                  setBox(e.target.checked);
                  setClicks((c) => c + 1);
                }}
              />
              할인가 9,900원으로 3개월 더 이용하기
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSeen((p) => (p.includes('preselect') ? p : [...p, 'preselect']));
                go(box ? 'renewed' : 'cancelled');
              }}
            >
              계속
            </button>
          </>
        );
      case 'kept':
        return (
          <>
            <h4>구독을 유지했습니다</h4>
            <p className="dz-sub">다음 결제일에 12,900원이 결제됩니다.</p>
            <button type="button" className="btn" onClick={() => go('home')}>
              내 계정으로
            </button>
          </>
        );
      case 'renewed':
        return (
          <>
            <h4>3개월 연장되었습니다</h4>
            <p className="dz-sub">해지하려고 들어왔는데, 미리 체크된 상자 때문에 29,700원이 결제되었습니다.</p>
          </>
        );
      case 'cancelled':
      case 'h-ask':
        if (step === 'h-ask')
          return (
            <>
              <h4>구독을 해지할까요?</h4>
              <p className="dz-sub">해지해도 이번 달 말일까지는 계속 쓸 수 있고, 저장한 목록은 1년 동안 보관합니다.</p>
              <div className="btn-row">
                <button type="button" className="btn primary" onClick={() => go('cancelled')}>
                  해지하기
                </button>
                <button type="button" className="btn" onClick={() => go('h-home')}>
                  취소
                </button>
              </div>
            </>
          );
        return (
          <>
            <h4>해지되었습니다</h4>
            <p className="dz-sub">이번 달 말일까지 쓸 수 있습니다. 더 이상 결제되지 않습니다.</p>
          </>
        );
      case 'h-home':
        return (
          <>
            <h4>내 계정</h4>
            <p className="dz-sub">별빛 구독 · 프리미엄 · 매달 12,900원 · 다음 결제일 6월 1일</p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => go('h-home')}>
                요금제 바꾸기
              </button>
              <button type="button" className="btn" onClick={() => go('h-ask')}>
                구독 해지
              </button>
            </div>
          </>
        );
    }
  })();

  const end = step === 'cancelled' || step === 'renewed';
  return (
    <Figure
      no={5}
      title="구독 해지하기"
      hint="별빛 구독을 해지해 보세요"
      caption={
        <>
          "별빛 구독"은 이 그림을 위해 지어낸 서비스입니다. "속이는 흐름"은 실제 서비스에서 흔히 보고된 다크 패턴 네 가지를 한데 모았고, "정직한 흐름"은 같은 해지를 숨김없이 만들었습니다. 해지를 마치면 지나온 다크 패턴이 아래에 정리됩니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="흐름"
          value={honest ? 'h' : 'd'}
          onChange={(v) => reset(v === 'h')}
          options={[
            { value: 'd', label: '속이는 흐름' },
            { value: 'h', label: '정직한 흐름' },
          ]}
        />
        <Button small onClick={() => reset(honest)}>
          처음부터
        </Button>
      </div>
      <div className="dz-flow">
        <div className="dz-phone" aria-live="polite">
          {screen}
        </div>
        <div className="hc-col">
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Readout label="누른 횟수" value={`${clicks}번`} />
            <Readout label="결과" value={step === 'cancelled' ? '해지됨' : step === 'renewed' ? '연장됨' : '구독 중'} color={step === 'cancelled' ? 'var(--good)' : step === 'renewed' ? 'var(--bad)' : undefined} />
          </div>
          {!honest && (
            <ul className="dz-patterns">
              {Object.entries(PATTERNS).map(([k, p]) => (
                <li key={k} data-seen={seen.includes(k) || undefined}>
                  <strong>
                    {p.name} <span className="en">({p.en})</span>
                  </strong>
                  <span>{seen.includes(k) || end ? p.what : '아직 지나지 않았습니다.'}</span>
                </li>
              ))}
            </ul>
          )}
          {honest && <p className="hc-small">해지 버튼이 요금제 바꾸기와 같은 모양, 같은 크기로 계정 화면에 있습니다. 확인 화면은 해지하면 무엇이 남고 무엇이 사라지는지 정확히 알려 주고, 두 선택지를 같은 무게로 보여 줍니다.</p>}
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function DesignPrinciples() {
  return (
    <>
      <h2>누를 수 있는 것은 누를 수 있어 보여야 합니다</h2>
      <p>
        유리문 앞에서 밀어야 할지 당겨야 할지 몰라 멈칫한 적이 있을 것입니다. 손잡이가 달렸는데 밀어야 하는 문도 있고, 평평한 판이 붙었는데 당겨야 하는 문도 있습니다. 인지 과학자 도널드 노먼(Donald Norman)은 『디자인과 인간 심리』(The Design of Everyday Things)에서 이런 문을 예로 들어, 사용자가 헤매는 것은 사용자 탓이 아니라 설계 탓이라고 말했습니다. 이 장은 그 책이 정리한 원칙들을 화면 위의 인터페이스에 옮겨 봅니다.
      </p>
      <p>
        먼저 두 낱말을 구별합니다. <T en="affordance">어포던스</T>는 물건과 사람 사이에 가능한 행동입니다. 손잡이는 잡을 수 있고, 버튼은 누를 수 있습니다. <T en="signifier">기표</T>는 그 행동이 가능하다고 알려 주는 신호입니다. 화면 속 버튼은 손가락에 실제로 눌리는 감촉이 없으므로, 누를 수 있다는 사실은 전적으로 기표, 즉 테두리, 그림자, 밑줄, 색, 손 모양 커서 같은 겉모습이 전해야 합니다. 그림 1에서 직접 찾아보세요.
      </p>
      <SignifierFigure />
      <p>
        "기표 없음" 화면에서는 "무료 배송"을 눌러 보고, "배송지 변경"과 "ⓘ"는 지나치기 쉽습니다. 둥근 상자는 버튼의 기표인데 누를 수 없는 표시에 쓰였고, 누를 수 있는 글자에는 아무 기표도 없기 때문입니다. 깔끔해 보이려고 테두리와 밑줄을 모두 지운 이른바 평면 디자인이 한때 유행했는데, 이후 사용성 연구들이 사람들이 누를 곳을 찾느라 더 오래 헤맨다는 결과를 내면서 다시 기표를 조금씩 되살리는 쪽으로 돌아왔습니다.
      </p>

      <h2>대응 관계: 손잡이와 버너</h2>
      <p>
        <T en="mapping">대응 관계</T>는 조작하는 것과 그 결과 사이의 관계입니다. 가장 좋은 대응은 공간 배치를 그대로 따르는 것입니다. 자동차 창문 스위치를 위로 올리면 창문이 올라가고, 좌석 모양으로 생긴 조절 버튼의 등받이 부분을 뒤로 밀면 등받이가 뒤로 갑니다. 설명서가 필요 없습니다. 반대로 버너는 2×2로 놓였는데 손잡이가 한 줄이면, 사람은 어느 손잡이가 어느 버너인지 매번 외우거나 손잡이 옆 작은 그림을 읽어야 합니다.
      </p>
      <StoveFigure />
      <p>
        한 줄 배치로 여덟 번을 하면 엉뚱한 버너를 켜기 쉽고, 맞게 켜더라도 한 번에 걸리는 시간이 깁니다. 위의 표에서 세 배치를 비교해 보세요. 작은 그림을 붙이면 실수는 줄지만 그림을 읽는 시간이 듭니다. 손잡이를 버너와 같은 모양으로 놓으면 그림도 설명도 필요 없이 빠르고 정확해집니다. 기표로 나쁜 대응을 보완할 수는 있어도, 좋은 대응을 이기지는 못합니다.
      </p>
      <Callout kind="note">
        <T en="constraint">제약</T>은 잘못된 행동을 아예 할 수 없게 만드는 방법입니다. USB-C처럼 위아래 구별이 없는 플러그, 필수 칸을 다 채우기 전에는 눌리지 않는 제출 버튼, 날짜 입력란에 달력만 띄워 엉뚱한 글자를 못 쓰게 하는 것이 모두 제약입니다. 사용자에게 무엇이 잘못인지 설명하는 것보다 잘못을 할 수 없게 하는 편이 낫습니다.
      </Callout>

      <h2>피드백: 눌렀다는 것을 알려 주기</h2>
      <p>
        <T en="feedback">피드백</T>은 행동의 결과를 즉시, 알아볼 수 있게 돌려주는 것입니다. 엘리베이터 버튼에 불이 들어오지 않으면 사람들은 버튼을 몇 번이고 다시 누릅니다. 화면에서도 같습니다. 오래전부터 쓰여 온 대략의 기준이 있습니다. 반응이 0.1초 안에 오면 사람은 자기가 직접 조작한다고 느끼고, 1초 안이면 흐름이 끊기지 않지만 기다렸다는 것은 느끼며, 10초가 넘으면 다른 일로 관심을 돌립니다. 그림 3의 결제는 1.5초가 걸립니다.
      </p>
      <FeedbackFigure />
      <p>
        "피드백 없음"에서 1초쯤 지나도 아무 반응이 없으면, 사람들은 첫 클릭이 먹히지 않았다고 생각하고 다시 누릅니다. 그 결과가 중복 결제입니다. 서버에서도 같은 주문을 두 번 받지 않게 막아야 하지만(이런 성질을 <T en="idempotency">멱등성</T>이라고 합니다), 사람을 헷갈리게 하지 않는 일은 화면의 몫입니다. 버튼을 바로 "결제 중"으로 바꾸고, 진행 상황을 보여 주고, 끝나면 무엇이 일어났는지 문장으로 알려 주세요.
      </p>

      <h2>실수와 되돌리기</h2>
      <p>
        사람은 반드시 실수합니다. 노먼은 실수를 두 가지로 나눕니다. <T en="slip">미끄러짐</T>은 목표는 맞았는데 행동이 어긋난 것입니다. 열려고 했는데 옆의 삭제를 누르고, 저장하려다 닫기를 누릅니다. 익숙한 일을 생각 없이 할 때 많이 일어납니다. <T en="mistake">착오</T>는 목표나 계획 자체가 틀린 것입니다. 시스템이 어떻게 동작하는지 잘못 이해해서, 예를 들어 휴지통을 비우면 파일이 백업된다고 믿는 경우입니다. 미끄러짐은 조작부를 떨어뜨리고 되돌리기를 주어 막고, 착오는 시스템이 지금 무엇을 하는지 더 잘 보여 주어 막습니다.
      </p>
      <UndoFigure />
      <p>
        "바로 삭제"는 미끄러진 클릭마다 파일을 하나씩 잃습니다. "확인 창"은 안전해 보이지만, 같은 창을 수십 번 본 사람은 내용을 읽지 않고 엔터를 누릅니다. 이 그림처럼 초점이 처음부터 "삭제"에 가 있으면 더욱 그렇습니다. 확인 창은 정말 드물고 되돌릴 수 없는 일에만 아껴 쓰고, 일상적인 삭제에는 <strong>되돌리기</strong>를 주는 편이 낫습니다. 휴지통, 편집기의 실행 취소, 메일 앱의 "보내기 취소"가 모두 같은 생각입니다. 지운 것을 바로 없애지 않고 잠시 보관하는 데 드는 비용은, 잃어버린 졸업 논문에 비하면 아주 작습니다.
      </p>

      <h2>다크 패턴: 사용자를 속이는 설계</h2>
      <p>
        지금까지의 원칙은 사용자가 원하는 일을 쉽게 하도록 돕습니다. 같은 지식을 거꾸로 쓰면 사용자가 원하지 않는 일을 하게 만들 수도 있습니다. 2010년 해리 브리그널(Harry Brignull)은 이런 설계에 <T en="dark pattern">다크 패턴</T>이라는 이름을 붙였습니다. 그림 5에서 지어낸 서비스의 구독을 해지해 보세요.
      </p>
      <DarkPatternFigure />
      <p>
        속이는 흐름은 가장 짧게 가도 여섯 번을 눌러야 해지되고, 마지막 상자를 놓치면 해지하러 들어왔다가 연장하고 나옵니다. 정직한 흐름은 두 번입니다. 다크 패턴은 단기 지표(해지율, 전환율)를 올리지만, 속았다는 것을 안 사용자의 신뢰를 잃고, 여러 나라에서 가입만큼 해지도 쉬워야 한다는 소비자 보호 규제의 대상이 되고 있습니다. 설계자가 할 질문은 "사용자가 이 화면이 무엇을 하는지 정확히 알았어도 이렇게 눌렀을까?"입니다.
      </p>

      <h2>열 가지 휴리스틱</h2>
      <p>
        제이콥 닐슨(Jakob Nielsen)은 1990년 롤프 몰리히(Rolf Molich)와 함께 인터페이스를 점검하는 원칙들을 처음 내놓았고, 1994년 사용성 문제 249개를 분석해 지금의 열 가지 <T en="usability heuristics">휴리스틱</T>으로 다듬었습니다. 이 장에서 본 원칙들이 대부분 들어 있습니다.
      </p>
      <ol>
        <li>시스템 상태 보여 주기: 무엇이 일어나고 있는지 적절한 시간 안에 알린다 (그림 3).</li>
        <li>현실 세계와 맞추기: 사용자의 말과 익숙한 개념을 쓴다.</li>
        <li>사용자에게 통제권과 자유 주기: 잘못 들어간 곳에서 쉽게 빠져나오고 되돌릴 수 있게 한다 (그림 4).</li>
        <li>일관성과 표준 지키기: 같은 것은 같은 모양으로, 다른 앱의 관례를 따른다.</li>
        <li>오류 예방: 실수할 여지를 줄이고, 위험한 일은 확인한다.</li>
        <li>기억 대신 알아보기: 선택지와 정보를 보이게 두어 외우지 않게 한다 (그림 2).</li>
        <li>유연성과 효율: 숙련자를 위한 단축키와 지름길을 둔다.</li>
        <li>간결한 설계: 필요 없는 정보로 중요한 정보를 가리지 않는다.</li>
        <li>오류를 알아보고 고치도록 돕기: 오류 메시지는 쉬운 말로 원인과 해결책을 알린다.</li>
        <li>도움말과 문서: 필요할 때 찾기 쉽고 할 일 중심으로 쓴다.</li>
      </ol>
      <p>
        이 목록으로 전문가 몇 명이 화면을 하나씩 점검하는 방법을 휴리스틱 평가라고 합니다. 실제 사용자를 관찰하는 방법과 함께 <a href={lessonHref('cs-hci', 'usability-testing')}>사용성 평가</a> 장에서 다룹니다. 그 전에, 화면을 보지 못하거나 마우스를 쓰지 못하는 사람에게도 이 원칙들이 통하게 하는 법을 <a href={lessonHref('cs-hci', 'accessibility')}>접근성</a> 장에서 봅니다.
      </p>

      <Callout kind="key">
        누를 수 있는 것은 누를 수 있어 보여야 하고(기표), 조작부는 결과와 같은 모양으로 놓여야 하며(대응 관계), 할 수 없는 것은 아예 못 하게 하고(제약), 모든 행동에는 즉시 알아볼 수 있는 반응이 돌아와야 합니다(피드백). 사람은 반드시 실수하므로 확인 창보다 되돌리기를 주는 편이 낫습니다. 같은 지식으로 사용자를 원하지 않는 쪽으로 이끄는 다크 패턴은 신뢰를 잃게 하고 규제의 대상이 됩니다.
      </Callout>
      <Quiz
        q="사진 앱에서 '전체 삭제' 버튼이 '전체 선택' 바로 옆에 같은 모양으로 붙어 있어, 사용자들이 가끔 사진을 모두 지운다. 확인 창을 이미 띄우고 있는데도 사고가 줄지 않는다. 가장 알맞은 고침은?"
        options={['확인 창의 문구를 빨간색 굵은 글씨로 바꾼다', '확인 창을 두 번 띄운다', '두 버튼을 떨어뜨리고 모양을 다르게 하며, 지운 사진을 30일 동안 휴지통에 보관해 되살릴 수 있게 한다', '사용 설명서에 주의 문구를 넣는다']}
        answer={2}
        explain={<>이것은 목표는 맞았는데 손이 옆을 누르는 미끄러짐입니다. 매번 뜨는 확인 창은 습관적으로 넘기게 되므로, 문구를 바꾸거나 두 번 띄워도 같은 습관이 생깁니다. 미끄러짐은 조작부를 떨어뜨리고 생김새를 달리해 줄이고, 그래도 일어난 실수는 되돌릴 수 있게 해야 합니다.</>}
      />
    </>
  );
}
