// Minimal zip support with no dependencies: reading stored and deflated entries (deflate uses the
// browser's DecompressionStream) and writing stored (uncompressed) archives. No zip64 or encryption.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const decoder = new TextDecoder();
const cp437 = bytes => Array.from(bytes, byte => (byte < 0x80 ? String.fromCharCode(byte) : '_')).join('');

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns [{ path, dir, bytes(): Promise<Uint8Array>, size, date }] for every entry.
export function readZip(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This is not a zip file.');
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (offset === 0xffffffff || count === 0xffff) throw new Error('Zip64 archives are not supported.');
  // Self-extracting archives (PKSFX .EXE files) have a program in front of the zip whose length the
  // stored offsets often don't include; the gap between where the directory should end and where
  // it does is that length.
  const shift = end - (offset + centralSize);
  if (shift < 0) throw new Error('The zip file is damaged.');
  offset += shift;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const time = view.getUint16(offset + 12, true);
    const day = view.getUint16(offset + 14, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true) + shift;
    const rawName = data.subarray(offset + 46, offset + 46 + nameLength);
    const name = (flags & 0x800 ? decoder.decode(rawName) : cp437(rawName)).replace(/\\/g, '/');
    offset += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw new Error(`${name} is encrypted.`);
    const date = new Date(1980 + (day >> 9), ((day >> 5) & 15) - 1, day & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2);
    entries.push({
      path: name.replace(/\/$/, ''),
      dir: name.endsWith('/'),
      size,
      date: Number.isNaN(date.getTime()) ? new Date() : date,
      async bytes() {
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const raw = data.subarray(start, start + compressed);
        if (method === 0) return raw.slice();
        if (method === 8) return inflate(raw);
        throw new Error(`${name} uses an unsupported compression method (${method}).`);
      }
    });
  }
  return entries.filter(entry => entry.path && !entry.path.split('/').includes('..'));
}

// files: [{ path, bytes: Uint8Array, date? }] → Uint8Array of a stored zip archive.
export function writeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path.replace(/\\/g, '/'));
    const bytes = file.bytes;
    const crc = crc32(bytes);
    const d = file.date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x800, true);
    header.setUint16(10, time, true);
    header.setUint16(12, day, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(header.buffer), name, bytes);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, day, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + bytes.length;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const result = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of all) { result.set(chunk, at); at += chunk.length; }
  return result;
}

// If every entry sits in one top-level folder ("jazz/JAZZ.EXE", "jazz/…"), returns that folder name.
export function commonFolder(paths) {
  const tops = new Set(paths.map(path => path.split('/')[0]));
  return tops.size === 1 && paths.every(path => path.includes('/')) ? [...tops][0] : '';
}
