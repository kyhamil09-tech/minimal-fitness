import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { GrabHandle } from './GrabHandle';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Set false for blocking flows such as first-run onboarding. */
  dismissible?: boolean;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  dismissible = true,
  footer,
}) => {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (which would steal input focus).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [isOpen, dismissible]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center min-[1000px]:items-stretch min-[1000px]:justify-end p-0 sm:p-4 min-[1000px]:p-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md min-[1000px]:max-w-[34rem] glass-sheet animate-sheet rounded-t-[28px] sm:rounded-[28px] min-[1000px]:rounded-r-none min-[1000px]:max-h-none text-white max-h-[92vh] flex flex-col outline-none"
      >
        {dismissible && <GrabHandle onClose={onClose} />}
        <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-2 border-b border-[#1A1E26] shrink-0">
          <h2 id={titleId} className="text-base font-bold text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {dismissible && (
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="text-neutral-300 hover:text-white flex h-11 w-11 -mr-2 items-center justify-center rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 pb-5 pt-3 border-t border-[#1A1E26] shrink-0">{footer}</div>}
      </div>
    </div>
  );
};

export const fieldClass =
  'w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 font-mono';
export const labelClass = 'text-xs text-neutral-400';
