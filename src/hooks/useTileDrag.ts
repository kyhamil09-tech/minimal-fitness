import React, { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';

const HOLD_MS = 450;
const SLOP_PX = 14;

const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
};

/**
 * Press and hold a tile, then drag it over another and let go to put it in that tile's place. A short tap still opens the tile and
 * a swipe still scrolls: the drag only starts after the finger has stayed put for a moment. While dragging, the list scrolls when
 * the finger nears the top or bottom edge, and the tile under the finger is outlined. {@code onDrop} is called once, when you let
 * go. Nothing is rearranged while the finger is down, because moving the pressed element in the page would end the touch.
 */
export function useTileDrag(onDrop: (dragId: string, targetId: string) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const over = useRef<string | null>(null);
  const st = useRef({ timer: 0, x: 0, y: 0, active: false, raf: 0, py: 0, scroller: null as HTMLElement | null, cleanup: null as (() => void) | null });
  const suppress = useRef(false);

  useEffect(() => () => st.current.cleanup?.(), []);

  const stopTimer = () => {
    window.clearTimeout(st.current.timer);
    st.current.timer = 0;
  };

  const activate = (id: string, el: HTMLElement) => {
    const s = st.current;
    s.active = true;
    s.scroller = scrollParent(el);
    setDragId(id);
    haptic.select();

    const onPointerMove = (e: PointerEvent) => {
      s.py = e.clientY;
      setPos({ x: e.clientX, y: e.clientY });
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-widget]') as HTMLElement | null;
      const tid = target?.dataset.widget ?? null;
      if (tid !== over.current) {
        over.current = tid;
        setOverId(tid && tid !== id ? tid : null);
        if (tid && tid !== id) haptic.tick();
      }
    };
    // Stops the page from scrolling under the finger once the drag has begun.
    const onTouchMove = (e: TouchEvent) => e.preventDefault();
    const end = (e?: Event) => {
      const target = over.current;
      over.current = null;
      s.active = false;
      cancelAnimationFrame(s.raf);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.removeEventListener('touchmove', onTouchMove);
      s.cleanup = null;
      setDragId(null);
      setPos(null);
      setOverId(null);
      suppress.current = true;
      window.setTimeout(() => (suppress.current = false), 350);
      // Letting go over another tile puts this one in its place; a cancelled touch drops nothing.
      if (e && e.type === 'pointerup' && target && target !== id) dropRef.current(id, target);
    };
    const edgeScroll = () => {
      const sc = s.scroller;
      if (sc && s.active) {
        const r = sc.getBoundingClientRect();
        if (s.py < r.top + 80) sc.scrollTop -= 10;
        else if (s.py > r.bottom - 130) sc.scrollTop += 10;
      }
      s.raf = requestAnimationFrame(edgeScroll);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    s.cleanup = end;
    s.raf = requestAnimationFrame(edgeScroll);
  };

  /** Props to spread on the element that wraps one tile. */
  const bind = (id: string) => ({
    'data-widget': id,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.currentTarget;
      const s = st.current;
      s.x = e.clientX;
      s.y = e.clientY;
      stopTimer();
      s.timer = window.setTimeout(() => activate(id, el), HOLD_MS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current;
      if (s.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) stopTimer();
    },
    onPointerUp: stopTimer,
    onPointerCancel: () => {
      if (!st.current.active) stopTimer();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // A drag that ends over a tile must not also open it.
    onClickCapture: (e: React.MouseEvent) => {
      if (suppress.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });

  return { dragId, overId, pos, bind };
}
