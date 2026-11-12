/**
 * A small reader for the FIT activity file format, written for this app from the openly documented file layout (a 12 or 14 byte
 * header, then definition and data records). It reads only what the importer needs: the per-second records (time, position, altitude,
 * heart rate, distance), the session summary, and heart-rate messages from chest straps. Nothing here comes from any vendor's code.
 */

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31 00:00:00 UTC). */
const FIT_EPOCH_S = 631_065_600;

const MSG_SESSION = 18;
const MSG_RECORD = 20;
const MSG_HR = 132;

type FieldValue = number | number[];
export type FitFields = Map<number, FieldValue>;

interface Definition {
  global: number;
  little: boolean;
  fields: { num: number; size: number; type: number }[];
  devSize: number;
  /** Total bytes of one data record for this definition. */
  total: number;
}

/** Base type number (low 5 bits) -> byte size and how to read it. `invalid` is FIT's "no value" marker. */
const BASE: Record<number, { size: number; invalid?: number }> = {
  0: { size: 1, invalid: 0xff }, // enum
  1: { size: 1, invalid: 0x7f }, // sint8
  2: { size: 1, invalid: 0xff }, // uint8
  3: { size: 2, invalid: 0x7fff }, // sint16
  4: { size: 2, invalid: 0xffff }, // uint16
  5: { size: 4, invalid: 0x7fffffff }, // sint32
  6: { size: 4, invalid: 0xffffffff }, // uint32
  7: { size: 1 }, // string
  8: { size: 4 }, // float32
  9: { size: 8 }, // float64
  10: { size: 1, invalid: 0 }, // uint8z
  11: { size: 2, invalid: 0 }, // uint16z
  12: { size: 4, invalid: 0 }, // uint32z
  13: { size: 1, invalid: 0xff }, // byte
  14: { size: 8 }, // sint64
  15: { size: 8 }, // uint64
  16: { size: 8, invalid: 0 }, // uint64z
};

const readOne = (dv: DataView, at: number, type: number, little: boolean): number | undefined => {
  const t = type & 0x1f;
  let v: number;
  switch (t) {
    case 1: v = dv.getInt8(at); break;
    case 3: v = dv.getInt16(at, little); break;
    case 4: case 11: v = dv.getUint16(at, little); break;
    case 5: v = dv.getInt32(at, little); break;
    case 6: case 12: v = dv.getUint32(at, little); break;
    case 8: v = dv.getFloat32(at, little); return Number.isFinite(v) ? v : undefined;
    case 9: v = dv.getFloat64(at, little); return Number.isFinite(v) ? v : undefined;
    case 14: v = Number(dv.getBigInt64(at, little)); return v;
    case 15: case 16: v = Number(dv.getBigUint64(at, little)); return t === 16 && v === 0 ? undefined : v;
    default: v = dv.getUint8(at); // enum, uint8, uint8z, byte, string
  }
  const bad = BASE[t]?.invalid;
  return bad !== undefined && v === bad ? undefined : v;
};

/** Reads a field's value: a number, or an array of numbers when the field holds several. Undefined when it holds only "no value". */
const readField = (dv: DataView, at: number, size: number, type: number, little: boolean): FieldValue | undefined => {
  const unit = BASE[type & 0x1f]?.size ?? 1;
  if (size < unit) return undefined;
  if (size === unit || (type & 0x1f) === 7) return readOne(dv, at, type, little);
  const out: number[] = [];
  for (let o = 0; o + unit <= size; o += unit) {
    const v = readOne(dv, at + o, type, little);
    if (v !== undefined) out.push(v);
  }
  return out.length ? out : undefined;
};

export interface FitMessages {
  records: FitFields[];
  sessions: FitFields[];
  hrs: FitFields[];
}

/** Quick check that these bytes start like a FIT file (the ".FIT" marker in the header). */
export const isFit = (bytes: Uint8Array): boolean =>
  bytes.length >= 14 && (bytes[0] === 12 || bytes[0] === 14) && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;

/** Reads every FIT file in the bytes (some files hold several one after another). Throws on a file that is cut off or damaged. */
export const readFit = (bytes: Uint8Array): FitMessages => {
  if (!isFit(bytes)) throw new Error('Not a FIT file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: FitMessages = { records: [], sessions: [], hrs: [] };
  let base = 0;
  while (base + 14 <= bytes.length && isFit(bytes.subarray(base))) {
    const headerSize = bytes[base];
    const dataSize = dv.getUint32(base + 4, true);
    const end = Math.min(bytes.length, base + headerSize + dataSize);
    let p = base + headerSize;
    const defs: (Definition | undefined)[] = new Array(16).fill(undefined);
    let lastTs = 0;
    while (p < end) {
      const header = bytes[p++];
      let local: number;
      let timeOffset: number | undefined;
      if (header & 0x80) {
        // compressed timestamp header: a 5 bit time offset and a 2 bit record number
        local = (header >> 5) & 0x03;
        timeOffset = header & 0x1f;
      } else if (header & 0x40) {
        // definition record
        local = header & 0x0f;
        const hasDev = (header & 0x20) !== 0;
        if (p + 5 > end) throw new Error('Truncated FIT definition');
        const little = bytes[p + 1] === 0;
        const global = dv.getUint16(p + 2, little);
        const count = bytes[p + 4];
        p += 5;
        if (p + count * 3 > end) throw new Error('Truncated FIT definition');
        const fields: Definition['fields'] = [];
        let total = 0;
        for (let i = 0; i < count; i++) {
          fields.push({ num: bytes[p], size: bytes[p + 1], type: bytes[p + 2] });
          total += bytes[p + 1];
          p += 3;
        }
        let devSize = 0;
        if (hasDev) {
          const devCount = bytes[p++];
          for (let i = 0; i < devCount; i++) {
            devSize += bytes[p + 1];
            p += 3;
          }
        }
        defs[local] = { global, little, fields, devSize, total: total + devSize };
        continue;
      } else {
        local = header & 0x0f;
      }
      const def = defs[local];
      if (!def) throw new Error('FIT data before its definition');
      if (p + def.total > end) throw new Error('Truncated FIT data');
      const wanted = def.global === MSG_RECORD || def.global === MSG_SESSION || def.global === MSG_HR;
      if (wanted) {
        const f: FitFields = new Map();
        let at = p;
        for (const fd of def.fields) {
          const v = readField(dv, at, fd.size, fd.type, def.little);
          if (v !== undefined) f.set(fd.num, v);
          at += fd.size;
        }
        const ts = f.get(253);
        if (typeof ts === 'number') lastTs = ts;
        else if (timeOffset !== undefined && lastTs) {
          // the offset is the low 5 bits of the timestamp: roll forward from the last full one
          let t = (lastTs & ~0x1f) + timeOffset;
          if (timeOffset < (lastTs & 0x1f)) t += 0x20;
          lastTs = t;
          f.set(253, t);
        }
        (def.global === MSG_RECORD ? out.records : def.global === MSG_SESSION ? out.sessions : out.hrs).push(f);
      } else {
        // keep the running timestamp honest when a skipped message carries one
        const tsField = def.fields.find((fd) => fd.num === 253 && fd.size === 4);
        if (tsField) {
          let at = p;
          for (const fd of def.fields) {
            if (fd === tsField) {
              const v = readOne(dv, at, 6, def.little);
              if (v !== undefined) lastTs = v;
              break;
            }
            at += fd.size;
          }
        }
      }
      p += def.total;
    }
    base += headerSize + dataSize + 2; // the file's closing 2 byte checksum
  }
  return out;
};

/** A FIT timestamp (seconds since 1989-12-31) as Unix milliseconds. */
export const fitTimeMs = (v: FieldValue | undefined): number | undefined =>
  typeof v === 'number' && v > 0 ? (v + FIT_EPOCH_S) * 1000 : undefined;

const SPORTS: Record<number, string> = {
  1: 'running', 2: 'cycling', 4: 'fitnessEquipment', 5: 'swimming', 10: 'training', 11: 'walking', 12: 'crossCountrySkiing', 13: 'alpineSkiing',
  14: 'snowboarding', 15: 'rowing', 16: 'mountaineering', 17: 'hiking', 19: 'paddling', 21: 'eBiking', 31: 'rockClimbing', 32: 'sailing',
  33: 'iceSkating', 37: 'standUpPaddleboarding', 38: 'surfing', 41: 'kayaking', 62: 'hiit', 83: 'dance',
};

const SUB_SPORTS: Record<number, string> = {
  1: 'treadmill', 3: 'trail', 4: 'track', 5: 'spin', 6: 'indoorCycling', 8: 'mountain', 14: 'indoorRowing', 15: 'elliptical', 16: 'stairClimbing',
  17: 'lapSwimming', 18: 'openWater', 19: 'flexibilityTraining', 20: 'strengthTraining', 26: 'cardioTraining', 27: 'indoorWalking', 43: 'yoga',
  44: 'pilates', 45: 'indoorRunning', 46: 'gravelCycling', 58: 'virtualActivity',
};

/** The sport and sub-sport as words ("running", "trail"); anything not in the short lists above reads as empty and is treated as generic. */
export const fitSportName = (sport: FieldValue | undefined): string | undefined => (typeof sport === 'number' ? SPORTS[sport] : undefined);
export const fitSubSportName = (sub: FieldValue | undefined): string | undefined => (typeof sub === 'number' ? SUB_SPORTS[sub] : undefined);
