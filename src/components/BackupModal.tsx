import React, { useRef, useState } from 'react';
import { DatabaseBackup, Download, Lock, Trash2, Upload } from 'lucide-react';
import { exportPhotos, importPhotos, wipePhotos } from '../lib/photoStore';
import { autoEncryptionOn, decryptWithPassphrase, disableAutoEncryption, enableAutoEncryption, encryptIfEnabled, isEncryptedBackup } from '../lib/cryptoBackup';
import { WorkoutSession } from '../types/health';
import { ColorPalette } from '../types/theme';
import { Modal } from './ui/Modal';
import {
  applyBackup,
  buildBackup,
  clearAppData,
  downloadTextFile,
  parseBackup,
  workoutsToCsv,
} from '../lib/backup';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  workouts: WorkoutSession[];
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose, theme, workouts }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [encOn, setEncOn] = useState(() => autoEncryptionOn());
  const [pass, setPass] = useState('');

  const stamp = new Date().toISOString().slice(0, 10);

  const exportJson = async () => {
    try {
      const backup = buildBackup(localStorage);
      const photos = await exportPhotos().catch(() => []);
      if (photos.length) backup.photos = photos;
      await downloadTextFile(`ky-fitness-backup-${stamp}.json`, await encryptIfEnabled(JSON.stringify(backup)));
      setMessage({ kind: 'ok', text: `Exported ${Object.keys(backup.data).length} data sets${photos.length ? ` and ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}.` });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'Export failed.' });
    }
  };

  const exportCsv = async () => {
    try {
      await downloadTextFile(`ky-fitness-workouts-${stamp}.csv`, workoutsToCsv(workouts), 'text/csv');
      setMessage({ kind: 'ok', text: `Exported ${workouts.length} workouts.` });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'Export failed.' });
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      let text = await file.text();
      if (isEncryptedBackup(text)) text = await decryptWithPassphrase(text, window.prompt('This backup is encrypted. Enter its passphrase:') ?? '');
      setPending(parseBackup(text));
      setMessage(null);
    } catch (err: any) {
      setPending(null);
      setMessage({ kind: 'error', text: err?.message || 'Could not read that file.' });
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    applyBackup(pending, localStorage);
    // A backup without photos (an automatic one) leaves the phone's photos alone; one with photos replaces them.
    if (pending.photos?.length) await importPhotos(pending.photos);
    window.location.reload();
  };

  const erase = async () => {
    clearAppData(localStorage);
    await wipePhotos();
    window.location.reload();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Backup & Export"
      icon={<DatabaseBackup className="w-4 h-4" style={{ color: theme.primary }} />}
    >
      <div className="space-y-4">
        <p className="text-xs text-[#9AA3B2] leading-relaxed">
          Your data lives only in this browser. Export a backup to keep it safe or move it to another device.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportJson}
            className="py-3 rounded-xl border border-neutral-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 hover:border-neutral-500"
          >
            <Download className="w-4 h-4" style={{ color: theme.primary }} /> Full backup (JSON)
          </button>
          <button
            onClick={exportCsv}
            className="py-3 rounded-xl border border-neutral-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 hover:border-neutral-500"
          >
            <Download className="w-4 h-4" style={{ color: theme.primary }} /> Workouts (CSV)
          </button>
        </div>

        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" aria-label="Choose backup file" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 rounded-xl border border-neutral-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 hover:border-neutral-500"
          >
            <Upload className="w-4 h-4" style={{ color: theme.primary }} /> Restore from backup
          </button>
          {pending && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-100">
                This backup ({Object.keys(pending.data).length} data sets{pending.photos?.length ? `, ${pending.photos.length} photos` : ''}
                {pending.exportedAt ? `, ${pending.exportedAt.slice(0, 10)}` : ''}) will replace everything currently in the
                app.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPending(null)} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300">
                  Cancel
                </button>
                <button onClick={confirmImport} className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold">
                  Replace my data
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#1A1E26] p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <Lock className="w-4 h-4" style={{ color: theme.primary }} /> Encrypt backups {encOn ? '(on)' : '(off)'}
          </div>
          <p className="text-xs text-[#9AA3B2] leading-relaxed">
            Seals backup files with a passphrase (AES-256) so a file sitting in Drive is unreadable to anyone else. The passphrase is not stored: keep it safe, because without it a backup cannot be opened. The daily folder backup follows this setting.
          </p>
          {encOn ? (
            <button
              onClick={() => {
                disableAutoEncryption();
                setEncOn(false);
                setMessage({ kind: 'ok', text: 'New backups will not be encrypted. Old encrypted ones still need their passphrase.' });
              }}
              className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300"
            >
              Turn off
            </button>
          ) : (
            <div className="flex gap-2">
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase (8+ characters)" aria-label="Backup passphrase" className="flex-1 min-w-0 px-3 py-2 text-xs" />
              <button
                onClick={async () => {
                  try {
                    await enableAutoEncryption(pass);
                    setPass('');
                    setEncOn(true);
                    setMessage({ kind: 'ok', text: 'Backups are now encrypted. Write the passphrase down somewhere safe.' });
                  } catch (err: any) {
                    setMessage({ kind: 'error', text: err?.message || 'Could not turn it on.' });
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-bold text-black"
                style={{ backgroundColor: theme.primary }}
              >
                Turn on
              </button>
            </div>
          )}
        </div>

        {message && (
          <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${message.kind === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
            {message.text}
          </p>
        )}

        <div className="pt-3 border-t border-[#1A1E26] space-y-2">
          {!confirmErase ? (
            <button
              onClick={() => setConfirmErase(true)}
              className="w-full py-2.5 rounded-xl border border-red-500/30 bg-red-950/10 text-red-400 text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Erase all data on this device
            </button>
          ) : (
            <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 space-y-2">
              <p className="text-xs text-red-200">This permanently deletes your workouts, logs, profile and settings. Export a backup first if you might want them back.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmErase(false)} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300">
                  Cancel
                </button>
                <button onClick={erase} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">
                  Yes, erase everything
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
