// Synk mellan enheter utan server: allt du sparat packas (deflate) i en länk eller en fil som du öppnar på
// den andra enheten. I länken står det efter #, så det skickas aldrig till webbservern.
const PREFIX = '1.';

export async function pack(value) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return PREFIX + btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function unpack(code) {
  if (!code.startsWith(PREFIX)) throw new Error('Okänt format');
  const bytes = Uint8Array.from(atob(code.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

// En sparad fil: { app: "matschema", version: 1, saved, data }. En fil med bara datan går också.
export const fileText = (value, saved) => JSON.stringify({ app: 'matschema', version: 1, saved, data: value }, null, 2);
export function readFile(text) {
  const value = JSON.parse(text);
  return value && value.app === 'matschema' ? value.data : value;
}
