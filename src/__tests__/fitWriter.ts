/** A tiny FIT file writer for tests, built from the public file layout. Fields are (number, base type, value, scale). */
export interface FitField {
  num: number;
  /** FIT base type: 0 enum, 1 sint8, 2 uint8, 3 sint16, 4 uint16, 5 sint32, 6 uint32. */
  type: number;
  value: number | number[];
}

const SIZE: Record<number, number> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4 };

const crc16 = (bytes: number[]): number => {
  const table = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
  let crc = 0;
  for (const b of bytes) {
    let tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[b & 0xf];
    tmp = table[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ table[(b >> 4) & 0xf];
  }
  return crc;
};

const put = (out: number[], size: number, v: number, little: boolean) => {
  const bytes: number[] = [];
  for (let i = 0; i < size; i++) bytes.push(Math.floor(v / 2 ** (8 * i)) & 0xff);
  // two's complement for negatives
  if (v < 0) {
    const m = 2 ** (8 * size) + v;
    bytes.length = 0;
    for (let i = 0; i < size; i++) bytes.push(Math.floor(m / 2 ** (8 * i)) & 0xff);
  }
  out.push(...(little ? bytes : bytes.reverse()));
};

export class FitWriter {
  private body: number[] = [];
  private defined = new Map<number, string>();
  constructor(private little = true) {}

  /** Writes a data message, defining its layout first when the local slot does not already hold it. */
  message(global: number, fields: FitField[], local = 0, developerBytes = 0) {
    const sig = `${global}:${fields.map((f) => `${f.num}/${f.type}/${Array.isArray(f.value) ? f.value.length : 1}`).join(',')}:${developerBytes}`;
    if (this.defined.get(local) !== sig) {
      this.defined.set(local, sig);
      this.body.push(0x40 | local | (developerBytes ? 0x20 : 0), 0, this.little ? 0 : 1);
      put(this.body, 2, global, this.little);
      this.body.push(fields.length);
      for (const f of fields) this.body.push(f.num, SIZE[f.type] * (Array.isArray(f.value) ? f.value.length : 1), f.type);
      if (developerBytes) this.body.push(1, 0, developerBytes, 0);
    }
    this.body.push(local);
    for (const f of fields) for (const v of Array.isArray(f.value) ? f.value : [f.value]) put(this.body, SIZE[f.type], v, this.little);
    for (let i = 0; i < developerBytes; i++) this.body.push(0xaa);
  }

  /** A data message with a compressed timestamp header (the timestamp field is carried by the 5 bit offset). */
  compressed(global: number, local: number, offset: number, fields: FitField[]) {
    // the layout of this local slot must already be defined by an earlier message(); fields here must match it, without timestamp
    this.body.push(0x80 | (local << 5) | (offset & 0x1f));
    for (const f of fields) for (const v of Array.isArray(f.value) ? f.value : [f.value]) put(this.body, SIZE[f.type], v, this.little);
    void global;
  }

  /** Defines a layout without writing data, for use with compressed(). */
  define(global: number, fields: Omit<FitField, 'value'>[], local: number) {
    this.defined.set(local, `manual:${global}`);
    this.body.push(0x40 | local, 0, this.little ? 0 : 1);
    put(this.body, 2, global, this.little);
    this.body.push(fields.length);
    for (const f of fields) this.body.push(f.num, SIZE[f.type], f.type);
  }

  /** The finished file: header, records, and the closing checksum. */
  bytes(): Uint8Array {
    const header: number[] = [14, 0x20];
    put(header, 2, 2140, true);
    put(header, 4, this.body.length, true);
    header.push(0x2e, 0x46, 0x49, 0x54);
    put(header, 2, crc16(header), true);
    const all = [...header, ...this.body];
    put(all, 2, crc16(all), true);
    return Uint8Array.from(all);
  }
}
