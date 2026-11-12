import React, { useRef } from 'react';

/**
 * The little bar at the top of every bottom sheet. Dragging it down moves the whole sheet (its parent element) with the finger and
 * closes it when let go past a short distance, so every sheet closes the same way.
 */
export const GrabHandle: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const start = useRef<number | null>(null);
  const panel = (e: React.PointerEvent) => e.currentTarget.parentElement as HTMLElement | null;

  const move = (e: React.PointerEvent) => {
    if (start.current === null) return;
    const dy = Math.max(0, e.clientY - start.current);
    const el = panel(e);
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
    }
  };
  const end = (e: React.PointerEvent) => {
    if (start.current === null) return;
    const dy = e.clientY - start.current;
    start.current = null;
    const el = panel(e);
    if (el) {
      el.style.transition = 'transform 180ms ease';
      el.style.transform = '';
    }
    if (dy > 80) onClose();
  };

  return (
    <div
      className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 sm:hidden"
      onPointerDown={(e) => {
        start.current = e.clientY;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-hidden="true"
    >
      <span className="h-1.5 w-10 rounded-full bg-white/25" />
    </div>
  );
};
