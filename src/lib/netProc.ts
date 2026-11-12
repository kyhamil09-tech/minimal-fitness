/**
 * Reads Linux's socket tables (/proc/net/tcp, tcp6, udp, udp6) as Android exposes them, so a computer connected with adb can see which
 * addresses an app's user id is talking to from OUTSIDE the app. Used by tools/network-check.ts; nothing in the app calls this.
 */
export type ProcProto = 'tcp' | 'tcp6' | 'udp' | 'udp6';

export interface ProcSocket {
  proto: ProcProto;
  localIp: string;
  localPort: number;
  remoteIp: string;
  remotePort: number;
  /** Linux TCP state in hex: 01 connected, 02 connecting, 0A listening, and so on. */
  state: string;
  uid: number;
}

const pad2 = (n: number) => n.toString(16);

/** The kernel prints each 32-bit word of an address in the machine's byte order (little-endian on phones). */
const wordBytes = (word: string): number[] => {
  const out: number[] = [];
  for (let i = 6; i >= 0; i -= 2) out.push(parseInt(word.slice(i, i + 2), 16));
  return out;
};

/** "0100007F" is 127.0.0.1; a 32-digit value is an IPv6 address (IPv4 ones are shown as ::ffff:a.b.c.d). */
export const hexToIp = (hex: string): string => {
  if (hex.length === 8) return wordBytes(hex).join('.');
  if (hex.length !== 32) return hex;
  const bytes = [0, 8, 16, 24].flatMap((i) => wordBytes(hex.slice(i, i + 8)));
  const isMapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isMapped) return bytes.slice(12).join('.');
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);
  // Collapse the longest run of zero groups into "::".
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hexGroups = groups.map(pad2);
  if (bestLen < 2) return hexGroups.join(':');
  return `${hexGroups.slice(0, bestStart).join(':')}::${hexGroups.slice(bestStart + bestLen).join(':')}`;
};

/** The sockets in one /proc/net table. */
export const parseProcNet = (text: string, proto: ProcProto): ProcSocket[] => {
  const out: ProcSocket[] = [];
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 8 || !f[0].endsWith(':')) continue;
    const [lip, lport] = f[1].split(':');
    const [rip, rport] = f[2].split(':');
    if (!lip || !rip) continue;
    out.push({
      proto,
      localIp: hexToIp(lip),
      localPort: parseInt(lport, 16),
      remoteIp: hexToIp(rip),
      remotePort: parseInt(rport, 16),
      state: f[3],
      uid: parseInt(f[7], 10),
    });
  }
  return out;
};

export type AddressKind = 'unspecified' | 'loopback' | 'local-network' | 'internet';

/** Whether an address is nothing, this phone itself, something on the home network, or out on the internet. */
export const addressKind = (ip: string): AddressKind => {
  if (ip === '0.0.0.0' || ip === '::') return 'unspecified';
  if (ip === '::1' || ip.startsWith('127.')) return 'loopback';
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip)) return 'local-network';
  if (/^(fe80|fc|fd)/i.test(ip)) return 'local-network';
  return 'internet';
};

/** Sockets that belong to `uid` and have a real far end (not a listening or unused socket). */
export const connectionsOf = (sockets: ProcSocket[], uid: number): ProcSocket[] =>
  sockets.filter((s) => s.uid === uid && addressKind(s.remoteIp) !== 'unspecified' && s.state !== '0A');
