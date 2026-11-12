import React, { useState } from 'react';
import { Bike } from 'lucide-react';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { ColorPalette } from '../types/theme';
import {
  STRAVA_REDIRECT,
  authorizeUrl,
  clearAuth,
  connectWithCode,
  getAutoUpload,
  isConnected,
  parseAuthCode,
  readAuth,
  setAutoUpload,
  writeAuth,
} from '../lib/strava';

/** Connect your own Strava API app so finished workouts can be sent to your Strava account. */
export const StravaSettings: React.FC<{ theme: ColorPalette; hideTitle?: boolean }> = ({ theme, hideTitle = false }) => {
  const [auth, setAuth] = useState(readAuth);
  const [clientId, setClientId] = useState(auth.clientId ?? '');
  const [secret, setSecret] = useState(auth.clientSecret ?? '');
  const [pasted, setPasted] = useState('');
  const [step, setStep] = useState<'keys' | 'approve'>(isConnected(auth) ? 'keys' : 'keys');
  const [auto, setAuto] = useState(getAutoUpload);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const connected = isConnected(auth);
  const android = Capacitor.isNativePlatform();

  const openStrava = async () => {
    setMessage('');
    if (!clientId.trim() || !secret.trim()) {
      setMessage('Enter both the Client ID and the Client Secret first.');
      return;
    }
    writeAuth({ ...readAuth(), clientId: clientId.trim(), clientSecret: secret.trim() });
    const url = authorizeUrl(clientId);
    try {
      if (android) await AppLauncher.openUrl({ url });
      else window.open(url, '_blank');
      setStep('approve');
    } catch {
      setMessage('Could not open the browser.');
    }
  };

  const finish = async () => {
    const code = parseAuthCode(pasted);
    if (!code) {
      setMessage('That does not look like the address from Strava. It should start with http://localhost/strava and contain "code=".');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const next = await connectWithCode(code);
      setAuth(next);
      setPasted('');
      setStep('keys');
      setMessage(`Connected${next.athlete ? ` as ${next.athlete}` : ''}.`);
    } catch (e: any) {
      setMessage(e?.message || 'Could not connect.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    clearAuth();
    setAuth({ clientId: '', clientSecret: '' });
    setClientId('');
    setSecret('');
    setStep('keys');
    setMessage('Disconnected. Your keys were removed from this phone.');
  };

  const field = 'w-full px-3 py-2.5 text-sm text-white';
  const primary = 'px-4 py-2.5 rounded-full text-xs font-extrabold disabled:opacity-40';

  return (
    <div className="space-y-2.5">
      {!hideTitle && (<div className="px-1 text-sm font-bold text-neutral-200 flex items-center gap-1.5">
        <Bike className="w-3.5 h-3.5" style={{ color: theme.primary }} />
        Strava
      </div>)}
      <div className="rounded-2xl bg-[#0B0D11] border border-[#1A1E26] p-4 space-y-3">
        {connected ? (
          <>
            <p className="text-sm text-white font-semibold">Connected{auth.athlete ? ` as ${auth.athlete}` : ''}</p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-xs text-neutral-300">Send every finished workout to Strava automatically</span>
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  setAutoUpload(e.target.checked);
                }}
              />
            </label>
            <p className="text-xs text-neutral-400">Or send one workout at a time from its details screen. Runs with a GPS route go up with the route and heart rate.</p>
            <button onClick={disconnect} className="text-sm font-bold text-neutral-200 hover:text-rose-400">
              Disconnect and remove keys
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Strava lets you create your own free API app, so no one else sees your data. In Strava go to Settings, then My API Application
              (strava.com/settings/api). Create one and set Authorization Callback Domain to <b className="text-white">localhost</b>. Then copy its
              Client ID and Client Secret here. The keys stay on this phone and are not included in backups.
            </p>
            <input aria-label="Strava Client ID" inputMode="numeric" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} className={field} />
            <input aria-label="Strava Client Secret" type="password" placeholder="Client Secret" value={secret} onChange={(e) => setSecret(e.target.value)} className={field} />
            <button onClick={openStrava} className={primary} style={{ backgroundColor: theme.primary, color: '#000' }}>
              Open Strava to approve
            </button>
            {step === 'approve' && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-neutral-400 leading-relaxed">
                  After you tap Authorize, your browser will say it cannot open {STRAVA_REDIRECT}. That is expected. Copy the whole address from
                  the browser bar and paste it here.
                </p>
                <input aria-label="Address from Strava" placeholder="http://localhost/strava?code=..." value={pasted} onChange={(e) => setPasted(e.target.value)} className={field} />
                <button onClick={finish} disabled={busy || !pasted.trim()} className={primary} style={{ backgroundColor: theme.primary, color: '#000' }}>
                  {busy ? 'Connecting…' : 'Finish connecting'}
                </button>
              </div>
            )}
          </>
        )}
        {message && (
          <p role="status" className="text-xs font-semibold" style={{ color: message.startsWith('Connected') || message.startsWith('Disconnected') ? theme.primary : '#ff9a7a' }}>
            {message}
          </p>
        )}
        {!android && <p className="text-xs text-neutral-400">Strava connections work in the Android app.</p>}
      </div>
    </div>
  );
};
