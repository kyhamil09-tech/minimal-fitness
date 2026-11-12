import React, { useId, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * A small "?" that opens an explanation under it. Screens show numbers and a few words; the longer reasoning (what a setting does, where the
 * data goes) sits behind this, so it is there when wanted and out of the way when not.
 */
export const LearnMore: React.FC<{ text: React.ReactNode; label?: string; className?: string }> = ({ text, label = 'More about this', className = '' }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} aria-label={label} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#A1A1AA]">
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="note" className="mt-1 block max-w-prose text-xs leading-relaxed text-[#A1A1AA]">
          {text}
        </span>
      )}
    </span>
  );
};
