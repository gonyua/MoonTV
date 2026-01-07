const WEAPI_NONCE = '0CoJUm6Qyw8W8jud';
const WEAPI_IV = '0102030405060708';
const WEAPI_PUBKEY = '010001';
// eslint-disable-next-line max-len
const WEAPI_MODULUS =
  'e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

function toUtf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function fromUtf8Bytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function pkcs7Pad(input: Uint8Array, blockSize = 16): Uint8Array {
  const remainder = input.length % blockSize;
  const padLen = remainder === 0 ? blockSize : blockSize - remainder;
  const out = new Uint8Array(input.length + padLen);
  out.set(input, 0);
  out.fill(padLen, input.length);
  return out;
}

function pkcs7Unpad(input: Uint8Array): Uint8Array {
  if (input.length === 0) return input;
  const padLen = input[input.length - 1] ?? 0;
  if (padLen <= 0 || padLen > 16) return input;
  const start = input.length - padLen;
  for (let i = start; i < input.length; i += 1) {
    if (input[i] !== padLen) return input;
  }
  return input.slice(0, start);
}

async function aesCbcEncryptBase64(
  plainText: string,
  key: string
): Promise<string> {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) throw new Error('WebCrypto subtle not available');

  const iv = toUtf8Bytes(WEAPI_IV);
  const keyBytes = toUtf8Bytes(key);
  const data = pkcs7Pad(toUtf8Bytes(plainText), 16);

  const cryptoKey = await cryptoImpl.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  const encrypted = await cryptoImpl.subtle.encrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    data
  );

  return bytesToBase64(new Uint8Array(encrypted));
}

export async function aesCbcDecryptBase64(
  cipherBase64: string,
  key: string
): Promise<string> {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) throw new Error('WebCrypto subtle not available');

  const iv = toUtf8Bytes(WEAPI_IV);
  const keyBytes = toUtf8Bytes(key);
  const cipherBytes = base64ToBytes(cipherBase64);

  const cryptoKey = await cryptoImpl.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  const decrypted = await cryptoImpl.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    cipherBytes
  );

  const unpadded = pkcs7Unpad(new Uint8Array(decrypted));
  return fromUtf8Bytes(unpadded);
}

function randomSecretKey(length = 16): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  const zero = BigInt(0);
  const one = BigInt(1);
  if (mod === one) return zero;
  let result = one;
  let b = base % mod;
  let e = exp;
  while (e > zero) {
    if ((e & one) === one) result = (result * b) % mod;
    e >>= one;
    b = (b * b) % mod;
  }
  return result;
}

export function rsaEncryptSecretKey(secretKey: string): string {
  const reversed = secretKey.split('').reverse().join('');
  const textHex = toHex(toUtf8Bytes(reversed));
  const base = BigInt(`0x${textHex}`);
  const exp = BigInt(`0x${WEAPI_PUBKEY}`);
  const mod = BigInt(`0x${WEAPI_MODULUS}`);
  const encrypted = modPow(base, exp, mod);
  const out = encrypted.toString(16);
  return out.padStart(WEAPI_MODULUS.length, '0');
}

export async function encryptWeapiPayload(
  data: Record<string, unknown>,
  secretKeyOverride?: string
): Promise<{ params: string; encSecKey: string }> {
  const text = JSON.stringify(data);
  const secretKey = secretKeyOverride ?? randomSecretKey(16);

  const firstPass = await aesCbcEncryptBase64(text, WEAPI_NONCE);
  const params = await aesCbcEncryptBase64(firstPass, secretKey);
  const encSecKey = rsaEncryptSecretKey(secretKey);

  return { params, encSecKey };
}

export function parseCookieValue(cookie: string, name: string): string | null {
  const parts = cookie.split(';');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return part.slice(idx + 1);
  }
  return null;
}

export async function weapiPostJson(
  path: string,
  data: Record<string, unknown>,
  options: {
    cookie: string;
    csrfToken: string;
    referer?: string;
    timeoutMs?: number;
  }
): Promise<unknown> {
  const url = new URL(path, 'https://music.163.com');
  url.searchParams.set('csrf_token', options.csrfToken);

  const { params, encSecKey } = await encryptWeapiPayload(data);
  const body = new URLSearchParams({ params, encSecKey }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.trunc(options.timeoutMs ?? 12_000))
  );

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://music.163.com',
        Referer:
          options.referer ?? 'https://music.163.com/discover/recommend/taste',
        Cookie: options.cookie,
      },
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { ok: false, status: response.status, raw: text };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
