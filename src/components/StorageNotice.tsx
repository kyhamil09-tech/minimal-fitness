import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { STORAGE_FULL_EVENT, StorageUsage, megabytes, storageUsage } from '../lib/storageHealth';

interface StorageNoticeProps {
  /** Takes the person to Settings > Data & backup. */
  onOpenBackup: () => void;
}

// Cheap to check (it adds up the lengths of a few dozen entries), so it can follow changes closely.
const CHECK_EVERY_MS = 60_000;
// The app re-saves its data (squeezing it) just after it starts, so look again once that has happened.
const FIRST_RECHECK_MS = 2_000;

const read = (): StorageUsage | null => {
  try {
    return storageUsage(localStorage);
  } catch {
    return null;
  }
};

/** A thin strip that appears only when the app's storage is nearly full or a save was refused, so nothing is lost without a warning. */
export const StorageNotice: React.FC<StorageNoticeProps> = ({ onOpenBackup }) => {
  const [usage, setUsage] = useState<StorageUsage | null>(read);
  // Dismissing hides a warning; a refused save shows it again.
  const [dismissed, setDismissed] = useState<'warn' | 'full' | null>(null);

  useEffect(() => {
    const refresh = () => setUsage(read());
    const onFull = () => {
      setDismissed(null);
      refresh();
    };
    window.addEventListener(STORAGE_FULL_EVENT, onFull);
    const first = setTimeout(refresh, FIRST_RECHECK_MS);
    const timer = setInterval(refresh, CHECK_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(STORAGE_FULL_EVENT, onFull);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (!usage || usage.level === 'ok' || dismissed === usage.level) return null;
  const level = usage.level; // narrowed to 'warn' | 'full' here
  const full = level === 'full';
  return (
    <div
      role={full ? 'alert' : 'status'}
      className="relative z-[2] flex items-start gap-2.5 px-4 py-2 text-xs"
      style={{ background: full ? '#3b1618' : '#3a2f12', color: full ? '#fecaca' : '#fde68a' }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 leading-snug">
        {full
          ? `Storage is full (${megabytes(usage.used)}). New changes may not be saved. `
          : `Storage is ${Math.round(usage.fraction * 100)}% full (${megabytes(usage.used)}). `}
        <button onClick={onOpenBackup} className="font-bold underline">
          Back up your data
        </button>
        {full ? ' now, then free space.' : ' soon.'}
      </p>
      <button onClick={() => setDismissed(level)} aria-label="Dismiss" className="shrink-0 p-0.5 opacity-80 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
