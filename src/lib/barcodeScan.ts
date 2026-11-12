/**
 * Reading a food barcode from the camera. Android's WebView usually has no built-in BarcodeDetector, so when it is missing the
 * frames are decoded here with ZXing (an open-source decoder that runs on the phone: the picture never leaves the page and is never
 * saved). Only EAN and UPC codes, the ones printed on food, are looked for.
 */

type Zx = typeof import('@zxing/library');
let zx: { lib: Zx; reader: InstanceType<Zx['MultiFormatOneDReader']>; hints: Map<import('@zxing/library').DecodeHintType, unknown> } | null = null;

/** Loads the decoder the first time it is needed (it is left out of the first page load) and keeps it for the next frames. */
const decoder = async () => {
  if (zx) return zx;
  const lib = await import('@zxing/library');
  const hints = new Map<import('@zxing/library').DecodeHintType, unknown>();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.UPC_A, lib.BarcodeFormat.UPC_E]);
  hints.set(lib.DecodeHintType.TRY_HARDER, true);
  // The one-dimensional reader only: no time is spent looking for QR codes and the like in every frame.
  zx = { lib, reader: new lib.MultiFormatOneDReader(hints), hints };
  return zx;
};

/** Reads the first food barcode from a picture given as one grey byte per pixel, or returns null when there is none. */
export const decodeLuminance = async (luma: Uint8ClampedArray, width: number, height: number): Promise<string | null> => {
  const { lib, reader, hints } = await decoder();
  try {
    const bitmap = new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(luma, width, height)));
    return reader.decode(bitmap, hints).getText();
  } catch {
    // nothing readable in this frame
    return null;
  }
};
/** Turns camera pixels (RGBA) into one grey byte per pixel. */
export const toLuminance = (rgba: Uint8ClampedArray, pixels: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0; i < pixels; i++) {
    const p = i * 4;
    out[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return out;
};

export interface FrameReader {
  /** Looks at the current video frame; returns the digits of a barcode, or null. */
  read: (video: HTMLVideoElement) => Promise<string | null>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const MAX_SIDE = 960;

/** The quickest reader this phone offers: the built-in detector when there is one, otherwise ZXing on a scaled-down copy of the frame. */
export const makeFrameReader = (): FrameReader => {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: FORMATS });
      return { read: async (v) => (await detector.detect(v))[0]?.rawValue ?? null };
    } catch {
      // the detector exists but does not take these formats: use ZXing
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    read: async (video) => {
      if (!ctx || !video.videoWidth || !video.videoHeight) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      return decodeLuminance(toLuminance(data, w * h), w, h);
    },
  };
};

/** Reads a QR code (the text inside it) from the camera frames, with the built-in detector when there is one, else with ZXing on a scaled-down frame. */
export const makeQrReader = (): FrameReader => {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Native) {
    try {
      const detector = new Native({ formats: ['qr_code'] });
      return { read: async (v) => (await detector.detect(v))[0]?.rawValue ?? null };
    } catch {
      // fall through to ZXing
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    read: async (video) => {
      if (!ctx || !video.videoWidth || !video.videoHeight) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const lib = await import('@zxing/library');
      try {
        const bitmap = new lib.BinaryBitmap(new lib.HybridBinarizer(new lib.RGBLuminanceSource(toLuminance(data, w * h), w, h)));
        return new lib.QRCodeReader().decode(bitmap).getText();
      } catch {
        return null;
      }
    },
  };
};
