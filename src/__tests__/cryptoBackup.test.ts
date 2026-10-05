import test from 'node:test';
import assert from 'node:assert/strict';
import { autoEncryptionOn, decryptWithPassphrase, disableAutoEncryption, enableAutoEncryption, encryptIfEnabled, encryptWithPassphrase, isEncryptedBackup } from '../lib/cryptoBackup';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

const SAMPLE = JSON.stringify({ app: 'ky-fitness', version: 1, data: { kyfit_workouts: '[{"id":"a","note":"héllo ✓"}]' } });

test('a backup round-trips with the right passphrase and is unreadable without it', async () => {
  const sealed = await encryptWithPassphrase(SAMPLE, 'correct horse battery');
  assert.equal(isEncryptedBackup(sealed), true);
  assert.equal(isEncryptedBackup(SAMPLE), false);
  assert.ok(!sealed.includes('workouts'));
  assert.equal(await decryptWithPassphrase(sealed, 'correct horse battery'), SAMPLE);
  await assert.rejects(() => decryptWithPassphrase(sealed, 'wrong passphrase!'), /Wrong passphrase/);
  // tampering is detected
  const j = JSON.parse(sealed);
  j.data = j.data.slice(0, -4) + 'AAAA';
  await assert.rejects(() => decryptWithPassphrase(JSON.stringify(j), 'correct horse battery'), /Wrong passphrase/);
  await assert.rejects(() => decryptWithPassphrase(SAMPLE, 'x'), /not an encrypted/);
});

test('two encryptions of the same text differ (fresh salt and nonce)', async () => {
  const a = await encryptWithPassphrase(SAMPLE, 'passphrase one');
  const b = await encryptWithPassphrase(SAMPLE, 'passphrase one');
  assert.notEqual(a, b);
});

test('automatic backups use a stored key, and the passphrase from setup still opens them', async () => {
  const store = memory();
  assert.equal(autoEncryptionOn(store), false);
  assert.equal(await encryptIfEnabled(SAMPLE, store), SAMPLE);
  await assert.rejects(() => enableAutoEncryption('short', store), /8 characters/);
  await enableAutoEncryption('my long passphrase', store);
  assert.equal(autoEncryptionOn(store), true);
  assert.ok(!(store.getItem('ky_secret_backup_key') ?? '').includes('my long passphrase'));
  const sealed = await encryptIfEnabled(SAMPLE, store);
  assert.equal(isEncryptedBackup(sealed), true);
  // a restore on a new phone only has the passphrase: the salt in the file lets it derive the same key
  assert.equal(await decryptWithPassphrase(sealed, 'my long passphrase'), SAMPLE);
  disableAutoEncryption(store);
  assert.equal(autoEncryptionOn(store), false);
});
