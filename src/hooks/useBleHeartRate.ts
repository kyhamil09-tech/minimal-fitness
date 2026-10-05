import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export type BleStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface BleDevice {
  id: string;
  name: string;
}

/** Parses a GATT Heart Rate Measurement characteristic value (0x2A37). */
export const parseHeartRateMeasurement = (view: DataView): number => {
  const flags = view.getUint8(0);
  return flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1);
};

/** Native Bluetooth LE client inside the Android app (see BleHeartRatePlugin.java). */
interface BleNativePlugin {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  connect(options: { id: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(event: 'device', cb: (d: BleDevice) => void): Promise<PluginListenerHandle>;
  addListener(event: 'scanStopped', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'heartRate', cb: (s: { bpm: number; ts: number }) => void): Promise<PluginListenerHandle>;
  addListener(
    event: 'connection',
    cb: (c: { state: 'connected' | 'disconnected'; name: string; failed?: boolean; reason?: string }) => void
  ): Promise<PluginListenerHandle>;
}

const BleNative = registerPlugin<BleNativePlugin>('BleHeartRate');
const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** A reading older than this is treated as lost (sensor out of range or removed). */
const STALE_MS = 12_000;

/**
 * Live heart rate from any standard Bluetooth LE sensor (service 0x180D).
 * In the Android app this scans and connects natively (the in-app browser has no Web Bluetooth),
 * and `connect()` starts a scan whose results appear in `devices`; call `connectTo(id)` to pick one.
 * In a desktop/Android Chrome tab it uses Web Bluetooth and `connect()` opens the browser's picker.
 */
export function useBleHeartRate() {
  const native = isNativeAndroid();
  const [status, setStatus] = useState<BleStatus>('idle');
  const [bpm, setBpm] = useState<number | null>(null);
  const [lastSampleAt, setLastSampleAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [deviceName, setDeviceName] = useState<string>('');
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [error, setError] = useState<string>('');
  const deviceRef = useRef<any>(null);
  const charRef = useRef<any>(null);

  const webSupported = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
  const supported = native || webSupported;

  const sample = useCallback((value: number) => {
    setBpm(value);
    setLastSampleAt(Date.now());
  }, []);

  // ---- native (Android app) ----
  useEffect(() => {
    if (!native) return;
    const handles: PluginListenerHandle[] = [];
    let cancelled = false;
    const keep = (p: Promise<PluginListenerHandle>) =>
      p.then((h) => {
        if (cancelled) h.remove();
        else handles.push(h);
      });
    keep(
      BleNative.addListener('device', (d) =>
        setDevices((prev) => (prev.some((x) => x.id === d.id) ? prev : [...prev, d]))
      )
    );
    keep(BleNative.addListener('scanStopped', () => setStatus((s) => (s === 'scanning' ? 'idle' : s))));
    keep(BleNative.addListener('heartRate', (s) => sample(s.bpm)));
    keep(
      BleNative.addListener('connection', (c) => {
        if (c.state === 'connected') {
          setDeviceName(c.name);
          setStatus('connected');
          setError('');
        } else {
          setBpm(null);
          setStatus(c.failed ? 'error' : 'idle');
          if (c.failed) setError(c.reason || 'Lost the connection to the sensor.');
        }
      })
    );
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove());
      BleNative.disconnect().catch(() => {});
      BleNative.stopScan().catch(() => {});
    };
  }, [native, sample]);

  // Clear a stale number if the sensor goes quiet.
  useEffect(() => {
    if (status !== 'connected') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const scan = useCallback(async () => {
    setError('');
    setDevices([]);
    setStatus('scanning');
    try {
      await BleNative.startScan();
    } catch (err: any) {
      setError(err?.message || 'Could not start scanning.');
      setStatus('error');
    }
  }, []);

  const connectTo = useCallback(async (id: string) => {
    setError('');
    setStatus('connecting');
    try {
      await BleNative.connect({ id });
    } catch (err: any) {
      setError(err?.message || 'Could not connect to the sensor.');
      setStatus('error');
    }
  }, []);

  // ---- Web Bluetooth (browser) ----
  const handleChange = useCallback(
    (e: any) => {
      const value: DataView | undefined = e?.target?.value;
      if (value) sample(parseHeartRateMeasurement(value));
    },
    [sample]
  );

  const onDisconnected = useCallback(() => {
    setStatus('idle');
    setBpm(null);
  }, []);

  const disconnect = useCallback(() => {
    if (native) {
      BleNative.disconnect().catch(() => {});
      BleNative.stopScan().catch(() => {});
      setStatus('idle');
      setBpm(null);
      return;
    }
    try {
      charRef.current?.removeEventListener('characteristicvaluechanged', handleChange);
      deviceRef.current?.removeEventListener('gattserverdisconnected', onDisconnected);
      if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    } catch {
      // ignore
    }
    deviceRef.current = null;
    charRef.current = null;
    setStatus('idle');
    setBpm(null);
  }, [native, handleChange, onDisconnected]);

  const connectWeb = useCallback(async () => {
    if (!webSupported) {
      setError('Web Bluetooth is not available in this browser. Try Chrome or Edge.');
      setStatus('error');
      return;
    }
    setError('');
    setStatus('connecting');
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });
      deviceRef.current = device;
      setDeviceName(device.name || 'Heart-rate sensor');
      device.addEventListener('gattserverdisconnected', onDisconnected);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      charRef.current = characteristic;
      characteristic.addEventListener('characteristicvaluechanged', handleChange);
      await characteristic.startNotifications();
      setStatus('connected');
    } catch (err: any) {
      // User closing the chooser is not an error worth showing.
      if (err?.name === 'NotFoundError') {
        setStatus('idle');
        return;
      }
      setError(err?.message || 'Could not connect to the sensor.');
      setStatus('error');
    }
  }, [webSupported, handleChange, onDisconnected]);

  useEffect(() => {
    if (native) return;
    return () => disconnect();
  }, [native, disconnect]);

  const fresh = status === 'connected' && bpm !== null && now - lastSampleAt <= STALE_MS;

  return {
    supported,
    native,
    status,
    bpm: fresh ? bpm : null,
    deviceName,
    devices,
    error,
    /** Native: start scanning. Web: open the browser's device picker and connect. */
    connect: native ? scan : connectWeb,
    connectTo,
    disconnect,
  };
}

export type BleHeartRate = ReturnType<typeof useBleHeartRate>;
