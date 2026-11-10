// 브라우저 내장 Web Crypto API 만 사용합니다. (외부 전송 없음)
// 비밀번호 → PBKDF2(SHA-256, 60만 회) → AES-GCM 256bit 키

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface EncryptedBlob {
  format: 'admchk-vault';
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const randomSalt = () => crypto.getRandomValues(new Uint8Array(16));

export async function deriveKey(password: string, salt: Uint8Array, iter = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface KeyHandle {
  key: CryptoKey;
  salt: Uint8Array;
  iter: number;
}

export async function createKey(password: string): Promise<KeyHandle> {
  const salt = randomSalt();
  return { key: await deriveKey(password, salt), salt, iter: ITERATIONS };
}

export async function encryptJSON(handle: KeyHandle, data: unknown): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, handle.key, enc.encode(JSON.stringify(data)));
  return { format: 'admchk-vault', v: 1, iter: handle.iter, salt: toB64(handle.salt), iv: toB64(iv), ct: toB64(ct) };
}

/** 비밀번호가 틀리면 예외를 던집니다. */
export async function decryptJSON<T>(blob: EncryptedBlob, password: string): Promise<{ data: T; handle: KeyHandle }> {
  const salt = fromB64(blob.salt);
  const key = await deriveKey(password, salt, blob.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
  return { data: JSON.parse(dec.decode(pt)) as T, handle: { key, salt, iter: blob.iter } };
}

export const isEncryptedBlob = (x: unknown): x is EncryptedBlob =>
  !!x && typeof x === 'object' && (x as EncryptedBlob).format === 'admchk-vault' && typeof (x as EncryptedBlob).ct === 'string';
