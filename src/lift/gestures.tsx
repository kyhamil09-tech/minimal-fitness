import React, { useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { Sheet } from './ui';

const REVEAL = 88;

/**
 * A row you can swipe left to delete: drag it past the red label and let go. Vertical scrolling is left to the page; only a mostly
 * sideways drag moves the row. Screen-reader and keyboard users have a menu item for the same thing, so this is a shortcut.
 */
export const SwipeDelete: React.FC<{ onDelete: () => void; label: string; children: React.ReactNode; className?: string }> = ({ onDelete, label, children, className }) => {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);

  const reset = () => {
    start.current = null;
    dragging.current = false;
    setDx(0);
  };

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ touchAction: 'pan-y' }}>
      <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-5 text-xs font-bold" style={{ width: REVEAL + 40, background: 'var(--l-fail)', color: 'var(--l-on-fail)' }} aria-hidden="true">
        <Trash2 className="mr-1 h-4 w-4" />
        Delete
      </div>
      <div
        data-swipe={label}
        style={{
          transform: `translateX(${leaving ? -420 : dx}px)`,
          transition: dragging.current ? 'none' : 'transform 160ms ease-out',
          background: 'var(--l-bg)',
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!dragging.current) {
            if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.6 && mx < 0) {
              dragging.current = true;
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                // capture is optional
              }
            } else if (Math.abs(my) > 12) {
              start.current = null; // a scroll, not a swipe
              return;
            } else return;
          }
          setDx(Math.max(-REVEAL - 40, Math.min(0, mx)));
        }}
        onPointerUp={() => {
          if (dragging.current && dx <= -REVEAL) {
            setLeaving(true);
            window.setTimeout(onDelete, 150);
            return;
          }
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
};

const ROW_H = 52;

/**
 * Put the exercises in a new order by dragging the grip, or with the arrow buttons (which also work with a keyboard or a screen reader).
 * `onMove(from, to)` is called once, when the drag ends.
 */
export const ReorderSheet: React.FC<{ open: boolean; onClose: () => void; names: string[]; onMove: (from: number, to: number) => void }> = ({ open, onClose, names, onMove }) => {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);
  const to = drag ? Math.max(0, Math.min(names.length - 1, drag.from + Math.round(drag.dy / ROW_H))) : -1;

  return (
    <Sheet open={open} onClose={onClose} title="Reorder exercises">
      <p className="l-dim mb-2 text-xs">Hold the grip and drag, or use the arrows.</p>
      <ul className="space-y-1" aria-label="Exercises in order">
        {names.map((n, i) => {
          const offset = drag
            ? i === drag.from
              ? drag.dy
              : drag.from < to && i > drag.from && i <= to
                ? -ROW_H
                : drag.from > to && i < drag.from && i >= to
                  ? ROW_H
                  : 0
            : 0;
          return (
            <li
              key={n + i}
              className="l-card flex items-center gap-2 px-2"
              style={{ height: ROW_H - 4, transform: `translateY(${offset}px)`, transition: drag && i === drag.from ? 'none' : 'transform 120ms ease-out', zIndex: drag && i === drag.from ? 2 : 1, position: 'relative', boxShadow: drag && i === drag.from ? '0 6px 18px rgba(0,0,0,.5)' : undefined }}
            >
              <span
                role="img"
                aria-label={`Drag ${n}`}
                className="l-dim flex h-10 w-10 shrink-0 cursor-grab items-center justify-center"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  startY.current = e.clientY;
                  setDrag({ from: i, dy: 0 });
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // capture is optional
                  }
                }}
                onPointerMove={(e) => {
                  if (drag && drag.from === i) setDrag({ from: i, dy: e.clientY - startY.current });
                }}
                onPointerUp={() => {
                  if (drag && to !== drag.from) onMove(drag.from, to);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n}</span>
              <button type="button" className="l-icon-btn" disabled={i === 0} onClick={() => onMove(i, i - 1)} aria-label={`Move ${n} up`}>
                ↑
              </button>
              <button type="button" className="l-icon-btn" disabled={i === names.length - 1} onClick={() => onMove(i, i + 1)} aria-label={`Move ${n} down`}>
                ↓
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
};
