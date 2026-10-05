/**
 * Encrypted backups. A passphrase is stretched into a key with PBKDF2 (SHA-256, many rounds, a random salt) and the backup is sealed
 * with AES-256-GCM, which also detects tampering or a wrong passphrase. The passphrase itself is never stored. For the automatic
 * daily backup the app keeps the derived key (not the passphrase) in storage that is private to the app and left out of backups, so
 * the file in your Drive folder is unreadable without the passphrase while nothing has to be typed every day.
 */

const ITERATIONS = 310_000;
const KEY_STORE = 'ky_secret_backup_key';

export interface EncryptedBackup {
  app: 'ky-fitness';
  encrypted: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('This device cannot encrypt here.');
  return c;
};

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

export const isEncryptedBackup = (text: string): boolean => {
  try {
    const j = JSON.parse(text) as Partial<EncryptedBackup>;
    return j?.app === 'ky-fitness' && j.encrypted === 1 && typeof j.data === 'string';
  } catch {
    return false;
  }
};

const importKey = (raw: Uint8Array) => subtle().subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** The raw 256-bit key for a passphrase and salt. */
export const deriveKeyBytes = async (passphrase: string, salt: Uint8Array, iter = ITERATIONS): Promise<Uint8Array> => {
  const base = await subtle().subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, 256);
  return new Uint8Array(bits);
};

const seal = async (plain: string, keyBytes: Uint8Array, salt: Uint8Array, iter: number): Promise<string> => {
  const iv = subtle().getRandomValues(new Uint8Array(12));
  const ct = await subtle().subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, await importKey(keyBytes), new TextEncoder().encode(plain));
  const out: EncryptedBackup = { app: 'ky-fitness', encrypted: 1, kdf: 'PBKDF2-SHA256', iter, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
  return JSON.stringify(out);
};

/** Encrypts with a passphrase (a fresh salt each time). */
export const encryptWithPassphrase = async (plain: string, passphrase: string): Promise<string> => {
  const salt = subtle().getRandomValues(new Uint8Array(16));
  return seal(plain, await deriveKeyBytes(passphrase, salt), salt, ITERATIONS);
};

/** Decrypts a backup with its passphrase. Throws "Wrong passphrase" when it does not match. */
export const decryptWithPassphrase = async (text: string, passphrase: string): Promise<string> => {
  if (!isEncryptedBackup(text)) throw new Error('That file is not an encrypted backup.');
  const j = JSON.parse(text) as EncryptedBackup;
  try {
    const key = await importKey(await deriveKeyBytes(passphrase, fromB64(j.salt), j.iter));
    const plain = await subtle().subtle.decrypt({ name: 'AES-GCM', iv: fromB64(j.iv) as BufferSource }, key, fromB64(j.data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Wrong passphrase, or the file was changed.');
  }
};

interface StoredKey {
  key: string;
  salt: string;
  iter: number;
}

/** Turns on encryption for automatic backups: derives the key once and keeps it on the phone (never the passphrase). */
export const enableAutoEncryption = async (passphrase: string, storage: Pick<Storage, 'setItem'> = localStorage): Promise<void> => {
  if (passphrase.length < 8) throw new Error('Use at least 8 characters.');
  const salt = subtle().getRandomValues(new Uint8Array(16));
  const key = await deriveKeyBytes(passphrase, salt);
  const stored: StoredKey = { key: toB64(key), salt: toB64(salt), iter: ITERATIONS };
  storage.setItem(KEY_STORE, JSON.stringify(stored));
};

export const disableAutoEncryption = (storage: Pick<Storage, 'removeItem'> = localStorage) => storage.removeItem(KEY_STORE);

export const autoEncryptionOn = (storage: Pick<Storage, 'getItem'> = localStorage): boolean => {
  try {
    return !!storage.getItem(KEY_STORE);
  } catch {
    return false;
  }
};

/** Seals text with the stored key, or returns it unchanged when encryption is off. */
export const encryptIfEnabled = async (plain: string, storage: Pick<Storage, 'getItem'> = localStorage): Promise<string> => {
  const raw = storage.getItem(KEY_STORE);
  if (!raw) return plain;
  const s = JSON.parse(raw) as StoredKey;
  return seal(plain, fromB64(s.key), fromB64(s.salt), s.iter);
};
