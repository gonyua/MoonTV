import {
  aesCbcDecryptBase64,
  encryptWeapiPayload,
  rsaEncryptSecretKey,
} from '../weapi';

test('rsaEncryptSecretKey output length is stable', () => {
  const enc = rsaEncryptSecretKey('0123456789abcdef');
  expect(enc).toMatch(/^[0-9a-f]+$/);
  expect(enc.length).toBe(256);
});

test('encryptWeapiPayload can roundtrip AES layers', async () => {
  const secretKey = '0123456789abcdef';
  const payload = { csrf_token: 'd58ff0a09de29128d3703759a266eb24' };
  const { params, encSecKey } = await encryptWeapiPayload(payload, secretKey);

  expect(params).toMatch(/^[A-Za-z0-9+/=]+$/);
  expect(encSecKey).toBe(rsaEncryptSecretKey(secretKey));

  const first = await aesCbcDecryptBase64(params, secretKey);
  const json = await aesCbcDecryptBase64(first, '0CoJUm6Qyw8W8jud');
  expect(json).toBe(JSON.stringify(payload));
});
