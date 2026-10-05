import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { CyclingDecoder, Live, hexToBytes } from '../lib/cyclingSensors';

export interface CyclingDevice {
  id: string;
  name: string;
  kind: 'power' | 'speedcadence' | 'both';
}

interface Native {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(o: { id: string; name?: string }): Promise<void>;
  disconnect(o: { id?: string }): Promise<void>;
  addListener(e: 'device', cb: (d: CyclingDevice) => void): Promise<PluginListenerHandle>;
  addListener(e: 'scanStopped', cb: () => void): Promise<PluginListenerHandle>;
  addListener(e: 'data', cb: (d: { id: string; char: string; hex: string; ts: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'connection', cb: (c: { id: string; name: string; state: 'connected' | 'disconnected'; failed?: boolean; reason?: string }) => void): Promise<PluginListenerHandle>;
}

const Ble = registerPlugin<Native>('BleCycling');
const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** A number from a sensor that has gone quiet for this long is treated as zero (coasting, or the sensor slept). */
const QUIET_MS = 3500;

export interface RideSamples {
  /** One watts value per second. */
  power: number[];
  /** One pedal rpm value per second. */
  cadence: number[];
  speedKmh: number[];
}

/**
 * Live power, cadence and wheel speed from Bluetooth cycling sensors (Android app only). Connect up to two sensors, for example a
 * power meter and a cadence sensor. While {@code recording} is true it keeps one sample per second for the ride summary.
 */
export function useCyclingSensors(wheelMm: number, recording: boolean) {
  const native = isNativeAndroid();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<CyclingDevice[]>([]);
  const [connected, setConnected] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState<Live>({});
  const decoders = useRef(new Map<string, CyclingDecoder>());
  const stamps = useRef({ power: 0, crank: 0, wheel: 0 });
  const liveRef = useRef<Live>({});
  const samples = useRef<RideSamples>({ power: [], cadence: [], speedKmh: [] });
  const wheelRef = useRef(wheelMm);
  wheelRef.current = wheelMm;

  useEffect(() => {
    if (!native) return;
    const handles: PluginListenerHandle[] = [];
    let cancelled = false;
    const keep = (p: Promise<PluginListenerHandle>) =>
      p.then((h) => {
        if (cancelled) void h.remove();
        else handles.push(h);
      });
    keep(Ble.addListener('device', (d) => setDevices((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d]))));
    keep(Ble.addListener('scanStopped', () => setScanning(false)));
    keep(
      Ble.addListener('connection', (c) => {
        if (c.state === 'connected') {
          setConnected((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, { id: c.id, name: c.name }]));
          setError('');
        } else {
          decoders.current.delete(c.id);
          setConnected((prev) => prev.filter((x) => x.id !== c.id));
          if (c.failed) setError(c.reason || `Lost the connection to ${c.name}.`);
        }
      })
    );
    keep(
      Ble.addListener('data', (d) => {
        let dec = decoders.current.get(d.id);
        if (!dec) {
          dec = new CyclingDecoder(wheelRef.current);
          decoders.current.set(d.id, dec);
        }
        dec.setWheel(wheelRef.current);
        const before = dec.live;
        const next = dec.push(d.char, hexToBytes(d.hex));
        const now = Date.now();
        if (next.powerW !== undefined && d.char === '2a63') stamps.current.power = now;
        if (next.cadenceRpm !== undefined && next.cadenceRpm !== before.cadenceRpm) stamps.current.crank = now;
        else if (next.cadenceRpm !== undefined && d.char === '2a5b') stamps.current.crank = now;
        if (next.speedKmh !== undefined) stamps.current.wheel = now;
        // Merge every sensor's numbers, the newest source for each wins.
        const merged: Live = { ...liveRef.current };
        if (next.powerW !== undefined) merged.powerW = next.powerW;
        if (next.cadenceRpm !== undefined) merged.cadenceRpm = next.cadenceRpm;
        if (next.speedKmh !== undefined) merged.speedKmh = next.speedKmh;
        liveRef.current = merged;
      })
    );
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
      Ble.disconnect({}).catch(() => {});
      Ble.stopScan().catch(() => {});
    };
  }, [native]);

  // Once a second: show the numbers (zero when quiet) and, during a ride, keep a sample.
  useEffect(() => {
    if (!native || connected.length === 0) {
      setLive({});
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const l = liveRef.current;
      const shown: Live = {
        powerW: l.powerW !== undefined ? (now - stamps.current.power > QUIET_MS ? 0 : l.powerW) : undefined,
        cadenceRpm: l.cadenceRpm !== undefined ? (now - stamps.current.crank > QUIET_MS ? 0 : l.cadenceRpm) : undefined,
        speedKmh: l.speedKmh !== undefined ? (now - stamps.current.wheel > QUIET_MS ? 0 : l.speedKmh) : undefined,
      };
      setLive(shown);
      if (recording) {
        if (shown.powerW !== undefined) samples.current.power.push(shown.powerW);
        if (shown.cadenceRpm !== undefined) samples.current.cadence.push(shown.cadenceRpm);
        if (shown.speedKmh !== undefined) samples.current.speedKmh.push(shown.speedKmh);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [native, connected.length, recording]);

  const scan = useCallback(async () => {
    setError('');
    setDevices([]);
    setScanning(true);
    try {
      await Ble.startScan();
    } catch (e: any) {
      setError(e?.message || 'Could not start scanning.');
      setScanning(false);
    }
  }, []);

  const connectTo = useCallback(async (d: CyclingDevice) => {
    setError('');
    try {
      await Ble.connect({ id: d.id, name: d.name });
    } catch (e: any) {
      setError(e?.message || 'Could not connect to the sensor.');
    }
  }, []);

  const disconnect = useCallback(async (id?: string) => {
    await Ble.disconnect({ id }).catch(() => {});
    if (!id) {
      setConnected([]);
      decoders.current.clear();
      liveRef.current = {};
    }
  }, []);

  /** Returns the samples kept since the last call and starts a fresh set. */
  const takeSamples = useCallback((): RideSamples => {
    const out = samples.current;
    samples.current = { power: [], cadence: [], speedKmh: [] };
    return out;
  }, []);

  return { supported: native, scanning, devices, connected, error, live, scan, connectTo, disconnect, takeSamples };
}

export type CyclingSensors = ReturnType<typeof useCyclingSensors>;
