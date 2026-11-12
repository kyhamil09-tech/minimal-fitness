import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ColorPalette } from '../../types/theme';

interface SegmentedProps<T extends string> {
  options: { id: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  /** Only used for the text color of the chosen option; the glow follows the app's accent. */
  theme?: ColorPalette;
  ariaLabel: string;
  /** md is the big tab bar; sm is the small switch inside a card or a sheet. */
  size?: 'md' | 'sm';
  /** What it means for a screen reader: tabs switch a screen, a group of toggles picks a range, a radio group picks one setting. */
  semantics?: 'tabs' | 'group' | 'radio';
  /** The options share the width equally (the default), or take only what their words need. */
  fill?: boolean;
  className?: string;
}

/**
 * Every tab-style switch in the app: the chosen option sits on a glowing accent pill that slides to it (the same look as the bottom
 * tab bar) and flashes once when it lands, so it is always clear which one is selected.
 */
export function Segmented<T extends string>({ options, value, onChange, theme, ariaLabel, size = 'md', semantics = 'tabs', fill = true, className = '' }: SegmentedProps<T>) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  // Where the glowing pill goes: over the chosen button, measured so it fits whatever width the labels take.
  const measure = useCallback(() => {
    const b = buttons.current.get(value);
    if (!b || b.offsetWidth === 0) {
      setThumb(null);
      return;
    }
    setThumb((t) => (t && t.left === b.offsetLeft && t.width === b.offsetWidth ? t : { left: b.offsetLeft, width: b.offsetWidth }));
    // A long row scrolls sideways: bring the chosen option into view.
    const o = outer.current;
    if (o) {
      if (b.offsetLeft < o.scrollLeft) o.scrollLeft = b.offsetLeft - 6;
      else if (b.offsetLeft + b.offsetWidth > o.scrollLeft + o.clientWidth) o.scrollLeft = b.offsetLeft + b.offsetWidth - o.clientWidth + 6;
    }
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, options.length]);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // The labels change width when fonts load or the screen turns, and a hidden bar has no size until it is shown.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const role = semantics === 'tabs' ? 'tablist' : semantics === 'radio' ? 'radiogroup' : 'group';
  const itemRole = semantics === 'tabs' ? 'tab' : semantics === 'radio' ? 'radio' : undefined;

  return (
    <div ref={outer} role={role} aria-label={ariaLabel} className={`seg ${size === 'sm' ? 'seg-sm' : ''} no-scrollbar ${className}`}>
      <div ref={inner} className="seg-in">
        <span aria-hidden="true" className="seg-thumb" style={{ left: thumb?.left ?? 0, width: thumb?.width ?? 0, opacity: thumb ? 1 : 0 }}>
          <i key={value} className="seg-flash" />
        </span>
        {options.map((o) => {
          const active = o.id === value;
          const aria =
            semantics === 'tabs' ? { 'aria-selected': active } : semantics === 'radio' ? { 'aria-checked': active } : { 'aria-pressed': active };
          return (
            <button
              key={o.id}
              ref={(el) => {
                if (el) buttons.current.set(o.id, el);
                else buttons.current.delete(o.id);
              }}
              type="button"
              role={itemRole}
              {...aria}
              onClick={() => onChange(o.id)}
              className={`seg-btn ${size === 'sm' ? 'seg-btn-sm' : ''} ${fill ? 'flex-1' : 'px-4'} ${active ? 'seg-btn-on' : ''}`}
              style={active && theme ? { color: theme.primary } : undefined}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
