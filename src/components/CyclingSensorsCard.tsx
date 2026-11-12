import React from 'react';
import { Bluetooth, Zap } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { CyclingSensors } from '../hooks/useCyclingSensors';

/** Pairing for Bluetooth power meters and speed or cadence sensors, shown on the start screen for cycling. */
export const CyclingSensorsCard: React.FC<{ theme: ColorPalette; sensors: CyclingSensors }> = ({ theme, sensors }) => {
  if (!sensors.supported) return null;
  const { live } = sensors;
  return (
    <div className="mt-4 rounded-[22px] border px-4 py-3" style={{ backgroundColor: theme.surface, borderColor: sensors.connected.length ? theme.primary : theme.surfaceBorder }}>
      <div className="flex items-center justify-between gap-3">
        <span className="stat-label flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Cycling sensors
        </span>
        <button type="button" onClick={() => void sensors.scan()} disabled={sensors.scanning} className="text-xs font-bold underline text-neutral-300 disabled:opacity-50">
          {sensors.scanning ? 'Looking...' : 'Find sensors'}
        </button>
      </div>
      {sensors.connected.map((c) => (
        <div key={c.id} className="flex items-center justify-between mt-2 text-xs text-white">
          <span className="flex items-center gap-1.5"><Bluetooth className="w-3.5 h-3.5" style={{ color: theme.primary }} /> {c.name}</span>
          <button type="button" onClick={() => void sensors.disconnect(c.id)} className="text-xs text-neutral-400 underline">Disconnect</button>
        </div>
      ))}
      {sensors.connected.length > 0 && (
        <p className="text-xs font-mono text-neutral-300 mt-2">
          {live.powerW !== undefined ? `${live.powerW} W` : 'no power'} · {live.cadenceRpm !== undefined ? `${live.cadenceRpm} rpm` : 'no cadence'} · {live.speedKmh !== undefined ? `${live.speedKmh} km/h` : 'no wheel speed'}
        </p>
      )}
      {sensors.devices
        .filter((d) => !sensors.connected.some((c) => c.id === d.id))
        .map((d) => (
          <button key={d.id} type="button" onClick={() => void sensors.connectTo(d)} className="w-full mt-2 text-left text-xs text-white px-3 py-2 rounded-xl border border-[#1A1E26] bg-black/40">
            {d.name} <span className="text-neutral-400">· {d.kind === 'power' ? 'power meter' : d.kind === 'both' ? 'power and cadence' : 'speed or cadence'}</span>
          </button>
        ))}
      {sensors.error && <p className="text-xs text-amber-300 mt-2">{sensors.error}</p>}
      {sensors.connected.length === 0 && !sensors.scanning && sensors.devices.length === 0 && !sensors.error && (
        <p className="text-xs text-neutral-400 mt-2">Pair a power meter or a speed or cadence sensor. Power, cadence and speed show live and are saved with the ride.</p>
      )}
    </div>
  );
};
