import React, { useEffect, useRef } from 'react';
import { Check, ChevronRight, Minus, Plus } from 'lucide-react';
import { useT } from '../lib/i18n';

/** A button that acts once when pressed, then repeats faster the longer it is held. Keyboard and screen-reader clicks act once. */
const HoldButton: React.FC<{ onStep: () => void; label: string; children: React.ReactNode }> = ({ onStep, label, children }) => {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const timer = useRef<number | undefined>(undefined);
  const stop = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      className="l-step-btn"
      aria-label={label}
      // keep the typing focus where it is, so the number box stays selected and the keyboard stays up
      onPointerDown={(e) => {
        e.preventDefault();
        stepRef.current();
        stop();
        timer.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => stepRef.current(), 90);
        }, 380);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        if (e.detail === 0) stepRef.current();
      }}
    >
      {children}
    </button>
  );
};

/**
 * Sits above the keyboard while a weight, reps or effort box is being typed in: minus and plus (hold to repeat), the next box, and
 * ticking the set off. What is being edited is named on the left.
 */
export const StepperBar: React.FC<{ label: string; step: string; onStep: (dir: 1 | -1) => void; onNext: () => void; onDone: () => void }> = ({ label, step, onStep, onNext, onDone }) => {
  const tr = useT();
  return (
  <div className="l-stepper" data-stepper role="toolbar" aria-label={`Adjust ${label}`} onMouseDown={(e) => e.preventDefault()}>
    <div className="min-w-0 flex-1 pr-1">
      <div className="truncate text-xs font-bold" aria-hidden="true">{label.split(" · ").slice(1).join(" · ")}</div>
      <div className="l-dim text-[11px]">± {step}</div>
    </div>
    <HoldButton label={`Decrease ${label}`} onStep={() => onStep(-1)}>
      <Minus className="h-5 w-5" aria-hidden="true" />
    </HoldButton>
    <HoldButton label={`Increase ${label}`} onStep={() => onStep(1)}>
      <Plus className="h-5 w-5" aria-hidden="true" />
    </HoldButton>
    <button type="button" className="l-step-btn l-step-wide" onPointerDown={(e) => e.preventDefault()} onClick={onNext} aria-label="Next box">
      {tr('lift.wo.next')}
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
    <button type="button" className="l-step-btn l-step-fill" onPointerDown={(e) => e.preventDefault()} onClick={onDone} aria-label="Mark this set done">
      <Check className="h-5 w-5" aria-hidden="true" />
    </button>
  </div>
  );
};
