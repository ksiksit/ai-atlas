import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface CanvasSize {
  w: number; // CSS pixels
  h: number;
  dpr: number;
}

/**
 * Track the CSS size of an element. `aspect` = width / height. If `height` is given,
 * it is used directly instead of the aspect ratio. Height is clamped by maxHeight.
 */
export function useElementSize(
  ref: RefObject<HTMLElement>,
  opts: { aspect?: number; height?: number; maxHeight?: number; minHeight?: number } = {},
): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ w: 600, h: 400, dpr: 1 });
  const { aspect = 1.6, height, maxHeight = 640, minHeight = 160 } = opts;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(100, Math.floor(el.clientWidth));
      let h = height ?? Math.round(w / aspect);
      h = Math.max(minHeight, Math.min(maxHeight, h));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      setSize((s) => (s.w === w && s.h === h && s.dpr === dpr ? s : { w, h, dpr }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, aspect, height, maxHeight, minHeight]);
  return size;
}

/**
 * Set up a HiDPI 2D canvas inside a wrapper div. Calls `draw(ctx, size)` whenever deps
 * or size change. Returns refs for the wrapper and canvas plus the current size.
 */
export function useCanvas2D(
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize) => void,
  deps: unknown[],
  opts: { aspect?: number; height?: number; maxHeight?: number; minHeight?: number } = {},
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(wrapRef, opts);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const { w, h, dpr } = size;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, ...deps]);

  return { wrapRef, canvasRef, size };
}

/** Prepare a canvas for imperative drawing (e.g. inside an animation loop). */
export function prepCanvas(c: HTMLCanvasElement, size: CanvasSize): CanvasRenderingContext2D | null {
  const { w, h, dpr } = size;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** requestAnimationFrame loop while `running` is true. Callback receives dt in seconds. */
export function useAnimationFrame(cb: (dt: number, t: number) => void, running: boolean) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // rAF's timestamp is the frame's start, which can precede the performance.now() taken above
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      cbRef.current(dt, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** True while the element is (nearly) on screen. Used to pause offscreen animations. */
export function useInView(ref: RefObject<HTMLElement>, rootMargin = '120px'): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? true), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pointer position relative to an element, in CSS px. */
export function localPoint(e: { clientX: number; clientY: number }, el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export interface DragHandlers {
  /** Return an id for the thing grabbed at (x,y) or null. */
  hit: (x: number, y: number) => string | number | null;
  onDrag: (id: string | number, x: number, y: number) => void;
  onEnd?: (id: string | number) => void;
  /** Called on pointer down when nothing was hit. */
  onEmpty?: (x: number, y: number) => void;
  onHover?: (id: string | number | null, x: number, y: number) => void;
}

/** Attach pointer-drag behaviour to a canvas (mouse + touch). */
export function useDrag(ref: RefObject<HTMLElement>, h: DragHandlers) {
  const hRef = useRef(h);
  hRef.current = h;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active: string | number | null = null;
    const down = (e: PointerEvent) => {
      const p = localPoint(e, el);
      const id = hRef.current.hit(p.x, p.y);
      if (id !== null) {
        active = id;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        e.preventDefault();
        hRef.current.onDrag(id, p.x, p.y);
      } else {
        hRef.current.onEmpty?.(p.x, p.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = localPoint(e, el);
      if (active !== null) {
        hRef.current.onDrag(active, p.x, p.y);
      } else {
        const id = hRef.current.hit(p.x, p.y);
        el.style.cursor = id !== null ? 'grab' : '';
        hRef.current.onHover?.(id, p.x, p.y);
      }
    };
    const up = (e: PointerEvent) => {
      if (active !== null) {
        hRef.current.onEnd?.(active);
        active = null;
        el.style.cursor = '';
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };
    const leave = () => {
      if (active === null) hRef.current.onHover?.(null, -1, -1);
    };
    // Let the page scroll on touch unless the finger lands on something draggable.
    const touchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const p = localPoint(t, el);
      if (hRef.current.hit(p.x, p.y) !== null) e.preventDefault();
    };
    el.addEventListener('touchstart', touchStart, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref]);
}
