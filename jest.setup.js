import { TextDecoder, TextEncoder } from 'util';
import '@testing-library/jest-dom/extend-expect';

// Allow router mocks.
// eslint-disable-next-line no-undef
jest.mock('next/router', () => require('next-router-mock'));

if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder;
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder;

if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto');
  globalThis.crypto = nodeCrypto.webcrypto;
}

if (!globalThis.btoa) {
  globalThis.btoa = (input) =>
    Buffer.from(String(input), 'binary').toString('base64');
}

if (!globalThis.atob) {
  globalThis.atob = (input) =>
    Buffer.from(String(input), 'base64').toString('binary');
}
