import { useEffect, useRef } from 'react';

/**
 * Android's back button, for screens stacked on top of each other (a sheet over a detail over a tab). The app's own back handling turns
 * the button into an Escape key press when a dialog is open; this keeps a list of the screens that can be closed and hands Escape to
 * the top one first. If nothing is registered the key goes on to the rest of the app as before.
 */
const stack: (() => void)[] = [];
let installed = false;

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopImmediatePropagation();
  e.preventDefault();
  stack[stack.length - 1]();
};

/** Registers a close action; call the returned function to remove it. */
export const pushBack = (fn: () => void): (() => void) => {
  if (!installed && typeof document !== 'undefined') {
    // Capture phase, so it runs before the main app's dialogs see the same key.
    document.addEventListener('keydown', onKey, true);
    installed = true;
  }
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
};

/** While `active`, the back button runs `handler` (when this is the top-most screen). */
export const useBack = (active: boolean, handler: () => void) => {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    return pushBack(() => ref.current());
  }, [active]);
};

let overlays = 0;

/** While `active`, the page behind the Lift side cannot be reached by keyboard or screen reader. */
export const useInertPage = (active: boolean) => {
  useEffect(() => {
    if (!active) return undefined;
    const root = document.getElementById('root');
    overlays++;
    if (root) root.setAttribute('inert', '');
    return () => {
      overlays = Math.max(0, overlays - 1);
      if (overlays === 0 && root) root.removeAttribute('inert');
    };
  }, [active]);
};
