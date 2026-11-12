/**
 * Watches, from a computer connected with adb, which internet addresses this app talks to. It runs outside the app, so it does not
 * rely on anything the app says about itself.
 *
 *   npx tsx tools/network-check.ts --serial <adb serial> [--minutes 3] [--package com.kyfitness.app] [--adb <path to adb>]
 *
 * Two kinds of evidence:
 *  - the phone's socket tables (/proc/net/tcp, tcp6, udp, udp6), sampled every second, which name the owner (user id) of every connection,
 *    so only this app's connections are listed. A very short connection can fall between two samples, so this shows destinations, not totals.
 *  - Android's own byte counter for the app's user id, read before and after through the app's debug web view (only when that is reachable:
 *    a debug build with the screen on). This one counts every byte, so it is the total.
 * The Google pieces the app relies on (Health Connect, activity recognition, the Wear OS link) run inside Google's own apps under their own
 * user ids, so their traffic is not this app's and does not appear here.
 */
import { execFileSync } from 'node:child_process';
import dns from 'node:dns/promises';
import { ProcSocket, addressKind, connectionsOf, parseProcNet } from '../src/lib/netProc';

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const serial = arg('serial');
const minutes = Number(arg('minutes', '3'));
const pkg = arg('package', 'com.kyfitness.app') as string;
const adbPath = arg('adb', process.env.ADB ?? 'adb') as string;
if (!serial) throw new Error('Give the phone with --serial (see "adb devices").');

const adb = (...args: string[]) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

const uidLine = adb('shell', 'cmd', 'package', 'list', 'packages', '-U', pkg);
const uid = Number(/uid:(\d+)/.exec(uidLine)?.[1]);
if (!uid) throw new Error(`Could not find ${pkg} on the phone: ${uidLine}`);

const readTables = (): ProcSocket[] => {
  const text = adb('shell', 'for t in tcp tcp6 udp udp6; do echo "==$t"; cat /proc/net/$t; done');
  const out: ProcSocket[] = [];
  for (const part of text.split('==').slice(1)) {
    const nl = part.indexOf('\n');
    out.push(...parseProcNet(part.slice(nl + 1), part.slice(0, nl).trim() as ProcSocket['proto']));
  }
  return out;
};

/** The bytes Android has counted for this app, read through the app's debug web view; null when that is not reachable. */
const counters = async (): Promise<{ tx: number; rx: number } | null> => {
  try {
    const pid = adb('shell', 'pidof', pkg).trim().split(/\s+/)[0];
    if (!pid) return null;
    adb('forward', 'tcp:9444', `localabstract:webview_devtools_remote_${pid}`);
    const targets = (await (await fetch('http://127.0.0.1:9444/json')).json()) as { type: string; webSocketDebuggerUrl: string }[];
    const page = targets.find((t) => t.type === 'page');
    if (!page) return null;
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.Capacitor.Plugins.Privacy.info().then(i => ({ tx: i.txBytes, rx: i.rxBytes }))', awaitPromise: true, returnByValue: true } }));
    const msg = await Promise.race([
      new Promise<{ result?: { result?: { value?: { tx: number; rx: number } } } }>((res) => {
        ws.onmessage = (e) => {
          const m = JSON.parse(String(e.data));
          if (m.id === 1) res(m);
        };
      }),
      new Promise<null>((res) => setTimeout(() => res(null), 8000)),
    ]);
    ws.close();
    return msg?.result?.result?.value ?? null;
  } catch {
    return null;
  } finally {
    try {
      adb('forward', '--remove', 'tcp:9444');
    } catch {
      // nothing was forwarded
    }
  }
};

interface Seen {
  proto: string;
  ip: string;
  port: number;
  kind: string;
  first: number;
  last: number;
  samples: number;
}

const main = async () => {
  console.log(`Watching ${pkg} (user id ${uid}) on ${serial} for ${minutes} minute(s). Use the app normally; try the screens that sync.`);
  const before = await counters();
  const seen = new Map<string, Seen>();
  const start = Date.now();
  let udpSockets = 0;
  while (Date.now() - start < minutes * 60_000) {
    const now = Date.now();
    const mine = connectionsOf(readTables(), uid);
    for (const s of mine) {
      const key = `${s.proto.replace('6', '')}|${s.remoteIp}|${s.remotePort}`;
      const e = seen.get(key) ?? { proto: s.proto.replace('6', ''), ip: s.remoteIp, port: s.remotePort, kind: addressKind(s.remoteIp), first: now, last: now, samples: 0 };
      e.last = now;
      e.samples++;
      seen.set(key, e);
    }
    udpSockets = Math.max(udpSockets, mine.filter((s) => s.proto.startsWith('udp')).length);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const after = await counters();

  console.log('\n=== Result ===');
  if (before && after && before.tx >= 0 && after.tx >= 0) {
    console.log(`Android's counter for this app, over the window: sent ${after.tx - before.tx} bytes, received ${after.rx - before.rx} bytes.`);
  } else {
    console.log('Android\'s byte counter could not be read (needs a debug build running with the screen on). Only destinations are shown.');
  }
  const rows = [...seen.values()].sort((a, b) => b.samples - a.samples);
  const internet = rows.filter((r) => r.kind === 'internet');
  if (internet.length === 0) {
    console.log('No connection from this app to the internet was seen in the window.');
  } else {
    console.log(`Internet destinations seen (${internet.length}):`);
    for (const r of internet) {
      let name = '';
      try {
        name = (await dns.reverse(r.ip))[0] ?? '';
      } catch {
        // no reverse name: the address alone is shown
      }
      const secs = Math.max(1, Math.round((r.last - r.first) / 1000));
      console.log(`  ${r.proto} ${r.ip}:${r.port}${name ? `  (${name})` : ''}  seen in ${r.samples} sample(s) over ${secs}s`);
    }
  }
  const other = rows.filter((r) => r.kind !== 'internet');
  if (other.length) console.log(`Not on the internet (this phone or the home network): ${other.map((r) => `${r.ip}:${r.port} ${r.kind}`).join(', ')}`);
  console.log(`Most UDP sockets open at once: ${udpSockets}.`);
  console.log('\nThis list is only this app. Google\'s own components work inside Google\'s apps and are not part of it.');
};

void main();
