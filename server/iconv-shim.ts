// Workers build only: wrangler aliases `iconv-lite` here. Its stream module doesn't bundle for
// Workers, and Express's body parser only needs these three calls. The API takes UTF-8 JSON only.
const supported = (enc: string) => /^utf-?8$/i.test(enc);

export function encodingExists(enc: string) {
  return supported(enc);
}

export function decode(buf: Uint8Array, enc: string) {
  if (!supported(enc)) throw new Error(`Unsupported encoding ${enc}`);
  return new TextDecoder().decode(buf);
}

export function getDecoder(enc: string) {
  if (!supported(enc)) throw new Error(`Unsupported encoding ${enc}`);
  const d = new TextDecoder();
  return { write: (buf: Uint8Array) => d.decode(buf, { stream: true }), end: () => d.decode() };
}

export default { encodingExists, decode, getDecoder };
