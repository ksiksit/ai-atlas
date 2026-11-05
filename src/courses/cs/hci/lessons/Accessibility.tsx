import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent as RFocusEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import { Button, Callout, Check, Code, Figure, Legend, MB, Quiz, Readout, Seg, T } from '../../../../components/ui';
import { useCanvas2D } from '../../../../lib/canvas';
import { usePalette } from '../../../../lib/theme';
import { lessonHref } from '../../../index';
import { CVD_KO, THRESHOLDS, contrast, fmtRatio, hexToRgb, linDistance, luminance, rgbToHex, simulate, type Cvd } from './contrast';
import './hci.css';
import './a11y.css';

/* ─────────────── Figure 1: contrast checker ─────────────── */

const PRESETS: { fg: string; bg: string; label: string }[] = [
  { fg: '#999999', bg: '#ffffff', label: '연회색 안내 문구' },
  { fg: '#777777', bg: '#ffffff', label: '#777 회색' },
  { fg: '#767676', bg: '#ffffff', label: '#767676 회색' },
  { fg: '#ffffff', bg: '#f5c400', label: '노랑 위 흰 글씨' },
  { fg: '#6b675f', bg: '#fbfaf7', label: '이 사이트 보조 글자' },
  { fg: '#1c1b19', bg: '#fbfaf7', label: '이 사이트 본문' },
];

function ContrastFigure() {
  const [fg, setFg] = useState(PRESETS[0].fg);
  const [bg, setBg] = useState(PRESETS[0].bg);
  const f = hexToRgb(fg), b = hexToRgb(bg);
  const ratio = contrast(f, b);
  const shown = fmtRatio(ratio);
  const pass = (min: number) => Math.floor(ratio * 100) / 100 >= min;
  const aaNormal = pass(4.5);

  return (
    <Figure
      no={1}
      title="글자색과 바탕색의 명도 대비"
      hint="색을 고르거나 예시를 눌러 보세요"
      caption={
        <>
          WCAG의 기준입니다. 보통 글자는 4.5:1, 큰 글자(24px 이상, 또는 굵은 글씨 약 18.7px 이상)는 3:1을 넘어야 AA, 각각 7:1과 4.5:1을 넘어야 AAA입니다. 검사기들처럼 대비를 소수 둘째 자리에서 버림하므로, 4.499:1은 4.49:1로 보이고 통과하지 못합니다.
        </>
      }
    >
      <div className="ay-presets btn-row" role="group" aria-label="예시 색 조합">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="btn small"
            aria-pressed={p.fg === fg && p.bg === bg}
            onClick={() => {
              setFg(p.fg);
              setBg(p.bg);
            }}
          >
            <i className="ay-sw" style={{ background: p.bg, color: p.fg }} aria-hidden="true">
              가
            </i>
            {p.label}
          </button>
        ))}
      </div>
      <div className="ay-contrast">
        <div className="ay-preview" style={{ background: bg, color: fg }}>
          <p className="ay-big">큰 글자 24px</p>
          <p className="ay-normal">보통 글자 16px. 회원가입을 마치려면 이메일로 받은 인증 번호 여섯 자리를 입력하세요.</p>
          <p className="ay-small-t">작은 안내 13px · 비밀번호는 8자 이상</p>
        </div>
        <div className="hc-col">
          <div className="ay-pickers">
            <label>
              <span>글자색</span>
              <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
              <code>{fg}</code>
            </label>
            <label>
              <span>바탕색</span>
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              <code>{bg}</code>
            </label>
          </div>
          <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <Readout label="명도 대비" value={`${shown} : 1`} color={aaNormal ? 'var(--good)' : 'var(--bad)'} />
            <Readout label="글자 명도 L" value={luminance(f).toFixed(3)} />
            <Readout label="바탕 명도 L" value={luminance(b).toFixed(3)} />
          </div>
          <table className="ay-table">
            <thead>
              <tr>
                <th>등급</th>
                <th>글자</th>
                <th>기준</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {THRESHOLDS.map((t) => (
                <tr key={t.id} data-pass={pass(t.min) || undefined}>
                  <td>{t.level}</td>
                  <td>{t.size}</td>
                  <td className="mono">{t.min}:1</td>
                  <td>{pass(t.min) ? '✓ 통과' : '✕ 실패'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 2: colour-vision deficiency ─────────────── */

const RED = '#d0342c';
const GREEN = '#2e9a43';
const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const SERIES = [
  { name: '가게 A', color: RED, data: [12, 15, 17, 22, 25, 32, 34, 33, 31, 23, 19, 13] },
  { name: '가게 B', color: GREEN, data: [16, 14, 20, 19, 28, 27, 36, 32, 29, 26, 17, 16] },
];

function CvdFigure() {
  const P = usePalette();
  const [kind, setKind] = useState<Cvd>('normal');
  const [shapes, setShapes] = useState(false);
  const cols = SERIES.map((s) => rgbToHex(simulate(hexToRgb(s.color), kind)));
  const a = simulate(hexToRgb(RED), kind), b = simulate(hexToRgb(GREEN), kind);
  const dist = linDistance(a, b);

  const { wrapRef, canvasRef } = useCanvas2D(
    (ctx, { w, h }) => {
      const pad = { l: 36, r: shapes ? 58 : 14, t: 14, b: 28 };
      const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      const lo = 10, hi = 40;
      const X = (i: number) => pad.l + (i / (MONTHS.length - 1)) * pw;
      const Y = (v: number) => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
      ctx.font = `10px ${P.fontMono}`;
      ctx.textBaseline = 'middle';
      for (let v = lo; v <= hi; v += 10) {
        ctx.strokeStyle = P.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(v) + 0.5);
        ctx.lineTo(w - pad.r, Y(v) + 0.5);
        ctx.stroke();
        ctx.fillStyle = P.ink3;
        ctx.textAlign = 'right';
        ctx.fillText(String(v), pad.l - 6, Y(v));
      }
      ctx.textAlign = 'center';
      MONTHS.forEach((m, i) => ctx.fillText(m + '월', X(i), h - 12));
      SERIES.forEach((s, k) => {
        ctx.strokeStyle = cols[k];
        ctx.fillStyle = cols[k];
        ctx.lineWidth = 2.5;
        ctx.setLineDash(shapes && k === 1 ? [7, 4] : []);
        ctx.beginPath();
        s.data.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
        ctx.stroke();
        ctx.setLineDash([]);
        s.data.forEach((v, i) => {
          const x = X(i), y = Y(v);
          ctx.beginPath();
          if (shapes && k === 1) {
            ctx.moveTo(x, y - 5.5);
            ctx.lineTo(x + 5, y + 4);
            ctx.lineTo(x - 5, y + 4);
            ctx.closePath();
          } else ctx.arc(x, y, shapes ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
          if (shapes) {
            ctx.strokeStyle = P.surface;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        });
        if (shapes) {
          const last = s.data[s.data.length - 1];
          ctx.fillStyle = P.ink;
          ctx.font = `600 11px ${P.fontBody}`;
          ctx.textAlign = 'left';
          ctx.fillText(s.name, X(MONTHS.length - 1) + 9, Y(last) + (k === 0 ? 6 : -6));
          ctx.font = `10px ${P.fontMono}`;
        }
      });
    },
    [P, cols.join(), shapes],
    { aspect: 2.1, maxHeight: 320, minHeight: 200 },
  );

  return (
    <Figure
      no={2}
      title="빨강과 초록으로만 나눈 그래프"
      hint="색각 유형을 바꿔 보세요"
      caption={
        <>
          두 가게의 달별 손님 수(천 명)입니다. 색각 시뮬레이션은 Machado, Oliveira, Fernandes(2009)의 행렬로 계산한 근사이고, 색을 전혀 구별하지 못하는 경우(이색형)를 흉내 냅니다. 실제 색각 이상은 대부분 이보다 약한 정도이고 사람마다 다릅니다. "색 차이"는 선형 RGB 공간에서 두 색 사이의 거리입니다.
        </>
      }
    >
      <div className="controls row">
        <Seg
          label="이렇게 본다면"
          value={kind}
          onChange={setKind}
          options={(['normal', 'protan', 'deutan', 'tritan'] as Cvd[]).map((k) => ({ value: k, label: CVD_KO[k].split(' ')[0] }))}
        />
        <Check label="모양, 선 무늬, 이름표 더하기" checked={shapes} onChange={setShapes} />
      </div>
      <div ref={wrapRef} className="canvas-box" role="img" aria-label={`${CVD_KO[kind]}으로 본 선 그래프. 가게 A와 가게 B의 달별 손님 수가 엇갈리며 오르내립니다.${shapes ? ' 가게 A는 동그라미와 실선, 가게 B는 세모와 점선이고 선 끝에 이름이 붙어 있습니다.' : ' 두 선은 색으로만 구별됩니다.'}`}>
        <canvas ref={canvasRef} />
      </div>
      {!shapes && <Legend items={SERIES.map((s, k) => ({ color: cols[k], label: s.name, shape: 'ln' as const }))} />}
      <div className="readouts" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Readout
          label="보이는 두 색"
          value={
            <span className="ay-pair">
              <i style={{ background: cols[0] }} />
              <i style={{ background: cols[1] }} />
            </span>
          }
        />
        <Readout label="색 차이" value={dist.toFixed(2)} color={dist < 0.15 ? 'var(--bad)' : undefined} />
        <Readout label="두 색의 명도 대비" value={`${fmtRatio(contrast(a, b))} : 1`} />
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 3: keyboard only ─────────────── */

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.getClientRects().length > 0);
}
const nameOf = (el: Element | null) => (el ? (el as HTMLElement).dataset.name ?? el.textContent?.trim() ?? '' : '');

function KeyboardFigure() {
  const [fixDiv, setFixDiv] = useState(false);
  const [trap, setTrap] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [cart, setCart] = useState(0);
  const [order, setOrder] = useState<string[]>([]);
  const page = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const last = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setOrder(focusables(page.current).map(nameOf));
  }, [fixDiv, open]);

  useEffect(() => {
    if (open && trap) focusables(modal.current)[0]?.focus();
  }, [open, trap]);

  const onFocus = (e: RFocusEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    last.current = el;
    const n = nameOf(el);
    setFocused(n);
    setLog((l) => [...l.slice(-7), n]);
  };
  const close = useCallback(() => {
    setOpen(false);
    if (trap) requestAnimationFrame(() => opener.current?.focus());
  }, [trap]);
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (!open || !trap) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(modal.current);
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i < 0 || i >= list.length - 1 ? 0 : i + 1;
    list[next].focus();
  };
  /** For touch screens: move focus as Tab would. */
  const simTab = () => {
    const scope = open && trap ? modal.current : page.current;
    const list = focusables(scope);
    if (!list.length) return;
    const i = last.current ? list.indexOf(last.current) : -1;
    list[(i + 1) % list.length].focus();
  };

  const outside = open && focused !== null && last.current !== null && !modal.current?.contains(last.current);
  const divName = '장바구니 담기';

  return (
    <Figure
      no={3}
      title="마우스 없이 이 페이지 쓰기"
      hint="상자 안의 검색란을 누른 뒤 Tab과 Shift+Tab으로 다녀 보세요"
      caption={
        <>
          아래쪽 띠는 브라우저가 Tab 키로 초점을 옮기는 순서를 이 페이지의 실제 요소에서 읽은 것입니다. "장바구니 담기"는 처음에 버튼처럼 꾸민 div라서 마우스로는 눌리지만 Tab 순서에 없고 Enter로도 눌리지 않습니다. 휴대폰처럼 키보드가 없으면 "다음 초점" 버튼이 Tab 키를 대신합니다.
        </>
      }
    >
      <div className="controls row">
        <Check label="div를 진짜 button으로 고치기" checked={fixDiv} onChange={setFixDiv} />
        <Check label="모달 안에 초점 가두기" checked={trap} onChange={setTrap} />
        <Button small onClick={simTab}>
          다음 초점 (Tab 대신)
        </Button>
      </div>
      <div className="ay-page" ref={page} onFocus={onFocus} onKeyDown={onKey}>
        <div className="ay-page-bar">
          <a href="#cs-hci/accessibility" data-name="홈" onClick={(e) => e.preventDefault()}>
            ◆ 동네빵집
          </a>
          <input type="search" placeholder="빵 이름 검색" aria-label="빵 이름 검색" data-name="검색" />
        </div>
        <div className="ay-product">
          <div>
            <strong>통밀 식빵</strong>
            <span>4,500원</span>
          </div>
          <div className="btn-row">
            {fixDiv ? (
              <button type="button" className="ay-fake" data-name={divName} onClick={() => setCart((c) => c + 1)}>
                {divName}
              </button>
            ) : (
              <div className="ay-fake" data-name={divName} onClick={() => setCart((c) => c + 1)}>
                {divName}
              </div>
            )}
            <button type="button" className="btn small primary" data-name="주문하기" onClick={() => undefined}>
              주문하기
            </button>
          </div>
        </div>
        <div className="ay-foot">
          <span>장바구니 {cart}개</span>
          <button ref={opener} type="button" className="ay-linkbtn" data-name="약관 보기" onClick={() => setOpen(true)}>
            약관 보기
          </button>
        </div>
        {open && (
          <div className="ay-modal-back">
            <div ref={modal} className="ay-modal" role="dialog" aria-modal={trap || undefined} aria-label="이용 약관">
              <strong>이용 약관</strong>
              <p>주문한 빵은 당일 저녁 8시까지 찾아가야 합니다.</p>
              <a href="#cs-hci/accessibility" data-name="약관 전문" onClick={(e) => e.preventDefault()}>
                약관 전문 보기
              </a>
              <div className="btn-row">
                <button type="button" className="btn small primary" data-name="동의" onClick={close}>
                  동의
                </button>
                <button type="button" className="btn small" data-name="닫기" onClick={close}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="ay-order" aria-label="Tab 순서">
        <span className="lbl">Tab 순서</span>
        {order.map((n, i) => (
          <span key={i} className="ay-chip" data-on={n === focused || undefined}>
            {i + 1}. {n}
          </span>
        ))}
        {!order.includes(divName) && <span className="ay-chip" data-miss="">✕ {divName} (빠짐)</span>}
      </div>
      <div className="hc-note" data-bad={outside || undefined} aria-live="polite">
        {outside
          ? `모달이 열려 있는데 초점이 모달 뒤의 "${focused}"에 가 있습니다. 화면을 보지 않는 사람은 지금 어디에 있는지 알 수 없습니다.`
          : open && trap
            ? '초점이 모달 안에서만 돕니다. Esc를 누르면 모달이 닫히고 초점이 "약관 보기"로 돌아갑니다.'
            : focused
              ? `지금 초점: ${focused}. 최근 순서: ${log.join(' → ')}`
              : '검색란을 누른 뒤 Tab을 눌러 보세요. 장바구니 담기에 닿을 수 있나요?'}
      </div>
    </Figure>
  );
}

/* ─────────────── Figure 4: what a screen reader hears ─────────────── */

interface AxNode {
  role: string;
  name: string;
  states: string[];
  source: string;
}

const ROLE_KO: Record<string, string> = { heading: '제목', textbox: '편집 가능한 텍스트', checkbox: '체크 상자', button: '버튼' };

/** A simplified accessible-name computation over the real DOM the figure renders. */
function axTree(root: HTMLElement): AxNode[] {
  const out: AxNode[] = [];
  root.querySelectorAll<HTMLElement>('h4, input, button').forEach((el) => {
    let role = '';
    if (el.tagName === 'H4') role = 'heading';
    else if (el.tagName === 'BUTTON') role = 'button';
    else if ((el as HTMLInputElement).type === 'checkbox') role = 'checkbox';
    else role = 'textbox';
    let name = '';
    let source = '';
    const aria = el.getAttribute('aria-label');
    if (aria) {
      name = aria;
      source = 'aria-label';
    } else if (el.id) {
      const lab = root.querySelector(`label[for="${el.id}"]`);
      if (lab) {
        name = lab.textContent?.trim() ?? '';
        source = '연결된 label';
      }
    }
    if (!name && (role === 'button' || role === 'heading')) {
      // visible text, skipping anything hidden from assistive technology
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      name = clone.textContent?.trim() ?? '';
      source = name ? '안의 글자' : '';
    }
    if (!name && el.getAttribute('placeholder')) {
      name = el.getAttribute('placeholder')!;
      source = 'placeholder (입력하면 사라짐)';
    }
    const states: string[] = [];
    if (role === 'heading') states.push('수준 4');
    if ((el as HTMLInputElement).required) states.push('필수');
    if (role === 'checkbox') states.push((el as HTMLInputElement).checked ? '선택됨' : '선택 안 됨');
    out.push({ role, name, states, source: source || '없음' });
  });
  return out;
}

function ScreenReaderFigure() {
  const [labels, setLabels] = useState(false);
  const [aria, setAria] = useState(false);
  const [req, setReq] = useState(false);
  const [agree, setAgree] = useState(false);
  const [tree, setTree] = useState<AxNode[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    if (formRef.current) setTree(axTree(formRef.current));
  }, [labels, aria, req, agree]);

  const nameless = tree.filter((n) => !n.name).length;
  const speak = (n: AxNode) => [n.name || '(이름 없음)', ROLE_KO[n.role], ...n.states].join(', ');
  const html = `<form>
  <h4>뉴스레터 받기</h4>
  ${labels ? '<label for="email">이메일 주소</label>' : '<span>이메일 주소</span>'}${req ? ' <span aria-hidden="true">*</span>' : ' <span>*</span>'}
  <input id="email" type="email" placeholder="you@example.com"${req ? ' required' : ''}>
  <input id="agree" type="checkbox">
  ${labels ? '<label for="agree">개인정보 수집에 동의</label>' : '<span>개인정보 수집에 동의</span>'}
  <button${aria ? ' aria-label="신청하기"' : ''}><svg aria-hidden="true">…봉투 그림…</svg></button>
</form>`;

  return (
    <Figure
      no={4}
      title="스크린 리더가 듣는 이 양식"
      hint="고침을 하나씩 켜 보세요"
      caption={
        <>
          왼쪽은 실제로 그려진 양식이고, 오른쪽 표는 그 요소들에서 역할, 이름, 상태를 읽어 만든 접근성 트리입니다. 이름은 브라우저의 규칙을 단순하게 따라 aria-label, 연결된 label, 안의 글자, placeholder 순서로 찾습니다. 실제 스크린 리더가 읽는 말은 제품과 언어 설정마다 조금씩 다릅니다.
        </>
      }
    >
      <div className="controls row">
        <Check label="글자와 입력란을 label로 연결" checked={labels} onChange={setLabels} />
        <Check label="아이콘 버튼에 aria-label" checked={aria} onChange={setAria} />
        <Check label="필수를 required로 표시" checked={req} onChange={setReq} />
      </div>
      <div className="ay-sr">
        <form ref={formRef} className="ay-form" onSubmit={(e) => e.preventDefault()}>
          <h4>뉴스레터 받기</h4>
          <div className="ay-field">
            {labels ? <label htmlFor="ay-email">이메일 주소</label> : <span>이메일 주소</span>}
            <span className="ay-star" aria-hidden={req || undefined}>
              {' '}*
            </span>
            <input id="ay-email" type="email" placeholder="you@example.com" required={req} />
          </div>
          <div className="ay-check">
            <input id="ay-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            {labels ? <label htmlFor="ay-agree">개인정보 수집에 동의</label> : <span>개인정보 수집에 동의</span>}
          </div>
          <button type="submit" className="btn small primary ay-icon" aria-label={aria ? '신청하기' : undefined}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </form>
        <div className="hc-col">
          <table className="ay-table ay-tree">
            <thead>
              <tr>
                <th>역할</th>
                <th>이름</th>
                <th>이름을 가져온 곳</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((n, i) => (
                <tr key={i} data-bad={!n.name || n.source.startsWith('placeholder') || undefined}>
                  <td>{ROLE_KO[n.role]}</td>
                  <td>{n.name || '(없음)'}</td>
                  <td>{n.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ol className="ay-speech" aria-label="스크린 리더가 읽는 말">
            {tree.map((n, i) => (
              <li key={i}>“{speak(n)}”</li>
            ))}
          </ol>
          <Readout label="이름 없는 컨트롤" value={`${nameless}개`} color={nameless ? 'var(--bad)' : 'var(--good)'} />
        </div>
      </div>
      <Code label="지금 양식의 HTML">{html}</Code>
    </Figure>
  );
}

/* ─────────────── Lesson ─────────────── */

export default function Accessibility() {
  return (
    <>
      <h2>모든 사람이 쓰는 화면</h2>
      <p>
        세계보건기구(WHO)는 세계 인구의 약 16%, 열에 한두 명꼴인 13억 명쯤이 일상에 영향을 주는 장애를 가지고 산다고 추정합니다. 앞을 보지 못해 화면을 소리로 듣는 사람, 손을 떨거나 움직이기 어려워 마우스 대신 키보드나 스위치를 쓰는 사람, 색을 구별하기 어려운 사람, 소리를 듣지 못하는 사람이 모두 같은 은행 앱과 같은 쇼핑몰을 씁니다. 여기에 한 손에 아이를 안은 사람, 햇빛 아래서 휴대폰을 보는 사람, 팔에 깁스를 한 사람처럼 잠깐 같은 처지가 되는 사람까지 더하면, 장애를 위한 설계가 도움이 되는 사람은 훨씬 많습니다.
      </p>
      <p>
        <T en="accessibility">접근성</T>은 능력과 상황이 다른 사람들이 같은 서비스를 쓸 수 있게 만드는 일입니다. 웹에서는 W3C가 정한 <T en="Web Content Accessibility Guidelines">웹 콘텐츠 접근성 지침(WCAG)</T>이 기준으로 널리 쓰이고, 지금 권고안은 2.2판입니다. WCAG는 콘텐츠가 인식할 수 있고, 조작할 수 있고, 이해할 수 있고, 여러 보조 기술에서 견고하게 동작해야 한다는 네 원칙 아래 검사할 수 있는 기준들을 둡니다. <a href={lessonHref('cs-software-design', 'collaboration')}>협업과 책임 있는 소프트웨어</a> 장에서 접근성을 책임의 하나로 짧게 다뤘습니다. 이 장에서는 그 기준을 직접 계산하고 확인해 봅니다.
      </p>

      <h2>명도 대비 계산하기</h2>
      <p>
        회색 글자는 세련되어 보이지만 읽기 어렵습니다. 얼마나 어려운지를 WCAG는 수 하나로 정합니다. 먼저 색마다 <T en="relative luminance">상대 명도</T> L을 구합니다. RGB 값을 빛의 실제 세기로 되돌린(감마를 풀어낸) 뒤, 눈이 초록에 가장 민감하고 파랑에 가장 둔하다는 사실을 반영한 가중치로 더합니다. 두 색의 명도 중 큰 쪽을 L₁, 작은 쪽을 L₂라 하면 대비는 다음과 같습니다.
      </p>
      <MB note="0.05는 화면에 비치는 주변 빛을 흉내 낸 값입니다. 대비는 1:1(같은 색)부터 21:1(흰 바탕에 검은 글자)까지입니다.">{String.raw`L = 0.2126\,R + 0.7152\,G + 0.0722\,B, \qquad \text{대비} = \frac{L_1 + 0.05}{L_2 + 0.05}`}</MB>
      <ContrastFigure />
      <p>
        처음 조합(흰 바탕에 #999999)은 2.84:1로 네 기준을 모두 통과하지 못합니다. 많은 사이트가 입력란 안내 문구에 이런 연회색을 씁니다. 흰 바탕에서 AA를 통과하는 가장 연한 회색은 #767676으로 4.54:1이고, 한 단계 더 연한 #777777은 4.47:1로 떨어집니다. 노란 바탕에 흰 글씨는 1.64:1로 거의 보이지 않습니다. 이 사이트의 본문은 16.48:1, 보조 글자는 5.39:1입니다.
      </p>
      <Callout kind="note">
        큰 글자의 기준이 더 낮은 것은 글자가 크면 획이 굵어 대비가 낮아도 읽을 수 있기 때문입니다. 버튼 테두리, 입력란 경계, 그래프의 선처럼 글자가 아닌 화면 요소는 주변과 3:1 이상이어야 한다는 기준도 따로 있습니다.
      </Callout>

      <h2>색만으로 구별하지 않기</h2>
      <p>
        남성의 약 8%, 여성의 약 0.5%는 빨강과 초록을 구별하기 어려운 색각 이상을 가지고 있습니다. 빨강을 느끼는 원뿔세포가 없거나 약하면 적색맹 계열, 초록이면 녹색맹 계열이고, 파랑 쪽은 훨씬 드뭅니다. 그림 2는 빨강과 초록으로만 나눈 그래프를 각 색각으로 본 모습을 계산해 보여 줍니다.
      </p>
      <CvdFigure />
      <p>
        보통 색각에서 두 선의 색 차이는 0.67인데, 녹색맹으로 보면 0.06으로 줄어 열한 배 넘게 가까워집니다. 두 선이 엇갈리는 그래프에서는 어느 선이 어느 가게인지 알 길이 없습니다. 명도 대비도 1.10:1이라 밝기로도 구별되지 않습니다. 고치는 방법은 색을 버리는 것이 아니라 색 말고도 구별할 단서를 하나 더 주는 것입니다. "모양, 선 무늬, 이름표 더하기"를 켜면 동그라미와 세모, 실선과 점선, 선 끝의 이름으로 어떤 색각에서도 구별됩니다. 오류가 난 입력란을 빨간 테두리로만 알리지 말고 아이콘과 문장을 함께 쓰는 것도 같은 원칙입니다.
      </p>

      <h2>키보드만으로 쓰기</h2>
      <p>
        화면을 보지 못하는 사람과 마우스를 쓰기 어려운 사람은 키보드로 페이지를 다닙니다. Tab은 다음 컨트롤로, Shift+Tab은 앞 컨트롤로 <T en="focus">초점</T>을 옮기고, Enter나 스페이스로 누릅니다. 초점이 어디에 있는지 눈에 보여야 하고, 순서가 화면을 읽는 순서와 맞아야 하고, 마우스로 할 수 있는 일은 모두 키보드로도 할 수 있어야 합니다.
      </p>
      <KeyboardFigure />
      <p>
        "장바구니 담기"는 Tab 순서에 없습니다. 버튼처럼 보이게 꾸민 div에는 브라우저가 초점도, 키보드 동작도, 버튼이라는 역할도 주지 않기 때문입니다. 진짜 <code>&lt;button&gt;</code>으로 바꾸면 이 셋을 모두 공짜로 얻습니다. 모달을 열고 초점을 가두지 않으면, Tab을 누를 때 초점이 보이지 않는 모달 뒤의 버튼들로 빠져나갑니다. 화면을 보는 사람에게는 어두운 막 뒤에 숨은 요소지만, 키보드와 스크린 리더 사용자에게는 여전히 거기 있는 요소입니다. 모달이 열리면 초점을 안으로 옮기고, 안에서만 돌게 하고, Esc로 닫으면 연 버튼으로 돌려보내야 합니다. 요즘 브라우저의 <code>&lt;dialog&gt;</code> 요소와 <code>showModal()</code>은 이 일의 대부분을 대신해 줍니다.
      </p>

      <h2>스크린 리더가 듣는 것</h2>
      <p>
        <T en="screen reader">스크린 리더</T>는 화면 대신 브라우저가 만든 <T en="accessibility tree">접근성 트리</T>를 읽습니다. 페이지의 요소마다 무엇인지(역할), 무엇이라고 부르는지(이름), 지금 어떤 상태인지(선택됨, 필수, 펼쳐짐)를 정리한 나무입니다. 눈에 보이는 글자가 입력란 바로 옆에 있어도, 코드로 연결되어 있지 않으면 트리에서는 남남입니다.
      </p>
      <ScreenReaderFigure />
      <p>
        고침을 모두 끈 상태에서는 이메일 입력란이 placeholder를 이름 삼아 "you@example.com"이라고 읽히고, 글자를 입력하면 그 단서마저 사라집니다. 체크 상자와 아이콘 버튼은 이름이 아예 없어 역할과 상태만 들립니다. 무엇에 동의하는지, 무엇을 보내는 버튼인지 알 수 없습니다. <code>&lt;label for&gt;</code>로 글자를 연결하면 이름이 생기고, 덤으로 글자를 눌러도 체크 상자가 눌려 누를 수 있는 영역이 넓어집니다. 그림만 있는 버튼에는 <code>aria-label</code>로 이름을 붙이고, 빨간 별표 대신 <code>required</code>로 필수임을 알립니다.
      </p>
      <Callout kind="intuition" label="연석 경사로 효과">
        보도의 턱을 깎아 만든 경사로는 휠체어를 위해 생겼지만, 지금은 유모차, 여행 가방, 배달 수레, 자전거가 모두 씁니다. 이것을 연석 경사로 효과(curb-cut effect)라고 부릅니다. 화면에서도 같습니다. 자막은 청각 장애인을 위해 생겼지만 시끄러운 지하철에서 모두가 읽고, 높은 명도 대비는 햇빛 아래의 휴대폰에서, 키보드 단축키는 숙련자에게, label 연결은 손가락이 굵은 모든 사람에게 도움이 됩니다.
      </Callout>
      <Callout kind="warn">
        자동 검사기는 명도 대비나 이름 없는 버튼처럼 기계로 셀 수 있는 문제만 찾습니다. 탭 순서가 말이 되는지, 이미지 설명이 정말 내용을 전하는지는 사람이 키보드와 스크린 리더로 직접 써 봐야 압니다. 장애가 있는 사용자를 평가에 참여시키는 것이 가장 확실합니다. 방법은 <a href={lessonHref('cs-hci', 'usability-testing')}>사용성 평가</a> 장에서 다룹니다.
      </Callout>

      <Callout kind="key">
        접근성은 능력과 상황이 다른 사람이 같은 서비스를 쓰게 하는 일이고, WCAG가 그 기준입니다. 글자와 바탕은 상대 명도로 계산한 대비가 보통 글자 4.5:1, 큰 글자 3:1을 넘어야 하고, 정보를 색만으로 구별하게 하지 말고 모양이나 글자를 함께 써야 합니다. 마우스로 할 수 있는 일은 모두 키보드로도 할 수 있어야 하며, 스크린 리더가 읽는 접근성 트리에서 모든 컨트롤이 알맞은 역할과 이름과 상태를 가져야 합니다. 대부분은 div 대신 button, span 대신 label처럼 알맞은 HTML 요소를 쓰는 것만으로 해결됩니다.
      </Callout>
      <Quiz
        q="로그인 양식의 '로그인' 버튼이 <div class='btn' onclick='login()'>로그인</div>로 만들어져 있다. 마우스로는 잘 눌린다. 무엇이 문제이고 어떻게 고치는가?"
        options={['명도 대비가 낮다. 글자를 더 진하게 한다', 'Tab으로 초점이 가지 않고 Enter로 눌리지 않으며 버튼이라는 역할도 없다. <button type="submit">으로 바꾼다', '스크린 리더가 글자를 못 읽는다. title 속성을 붙인다', '문제없다. 클릭 이벤트가 있으면 브라우저가 알아서 버튼으로 취급한다']}
        answer={1}
        explain={<>div는 클릭 처리기를 달아도 초점을 받지 못하고, 키보드 동작도 없고, 접근성 트리에서 버튼 역할도 없습니다. tabindex와 role과 키 처리기를 직접 붙일 수도 있지만, button 요소는 이 모두를 기본으로 갖추고 양식 제출까지 해 줍니다. 알맞은 HTML 요소를 쓰는 것이 가장 쉽고 확실한 고침입니다.</>}
      />
    </>
  );
}
