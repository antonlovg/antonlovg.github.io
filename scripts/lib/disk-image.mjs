// Small writers for the files scripts/make-reactos.mjs puts on ReactOS's C: drive: a FAT16 hard
// disk image, a Windows shortcut (.lnk) and an icon (.ico). No dependencies.

const SECTOR = 512;

// A hard disk with one FAT16 partition. tree is { NAME: Uint8Array | tree } with 8.3 names
// (ReactOS can rename them to long names afterwards).
export function fat16(tree, { size = 32 << 20, label = 'DISK', date = new Date(2026, 0, 1) } = {}) {
  const START = 2048, PER_CLUSTER = 4, CLUSTER = SECTOR * PER_CLUSTER, ROOT_ENTRIES = 512, RESERVED = 4;
  const total = size / SECTOR, part = total - START;
  const clusters = Math.floor((part - RESERVED - ROOT_ENTRIES * 32 / SECTOR) / PER_CLUSTER);
  if (clusters < 4085 || clusters > 65524) throw new Error('size does not fit FAT16');
  const fatSectors = Math.ceil((clusters + 2) * 2 / SECTOR);
  const rootSector = START + RESERVED + 2 * fatSectors, dataSector = rootSector + ROOT_ENTRIES * 32 / SECTOR;
  const img = new Uint8Array(size), view = new DataView(img.buffer);
  const ascii = (text, at, length) => { for (let i = 0; i < length; i++) img[at + i] = text.charCodeAt(i) || 32; };
  // Master boot record: one partition, type 6 (FAT16), CHS fields set to "use LBA".
  img.set([0x80, 0xfe, 0xff, 0xff, 0x06, 0xfe, 0xff, 0xff], 446);
  view.setUint32(454, START, true); view.setUint32(458, part, true);
  img[510] = 0x55; img[511] = 0xaa;
  // Boot sector with the BIOS parameter block.
  const b = START * SECTOR;
  img.set([0xeb, 0x3c, 0x90], b); ascii('MSWIN4.1', b + 3, 8);
  view.setUint16(b + 11, SECTOR, true); img[b + 13] = PER_CLUSTER; view.setUint16(b + 14, RESERVED, true); img[b + 16] = 2;
  view.setUint16(b + 17, ROOT_ENTRIES, true); view.setUint16(b + 19, part < 65536 ? part : 0, true); img[b + 21] = 0xf8;
  view.setUint16(b + 22, fatSectors, true); view.setUint16(b + 24, 63, true); view.setUint16(b + 26, 255, true);
  view.setUint32(b + 28, START, true); view.setUint32(b + 32, part >= 65536 ? part : 0, true);
  img[b + 36] = 0x80; img[b + 38] = 0x29; view.setUint32(b + 39, 0x19940801, true); ascii(label, b + 43, 11); ascii('FAT16', b + 54, 8);
  img[b + 510] = 0x55; img[b + 511] = 0xaa;

  const fat = new Uint16Array(clusters + 2);
  fat[0] = 0xfff8; fat[1] = 0xffff;
  let next = 2;
  const time = (date.getHours() << 11) | (date.getMinutes() << 5);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const clusterOffset = cluster => (dataSector + (cluster - 2) * PER_CLUSTER) * SECTOR;
  const allocate = length => {
    const count = Math.max(1, Math.ceil(length / CLUSTER)), first = next;
    if (first + count > clusters + 2) throw new Error('the disk is full');
    for (let i = 0; i < count; i++) fat[first + i] = i === count - 1 ? 0xffff : first + i + 1;
    next += count;
    return first;
  };
  const entry = (out, at, name, attributes, cluster, length) => {
    const [base, ext = ''] = name.startsWith('.') ? [name] : name.split('.');
    if (base.length > 8 || ext.length > 3 || name !== name.toUpperCase()) throw new Error(`${name} is not an 8.3 name`);
    for (let i = 0; i < 8; i++) out[at + i] = base.charCodeAt(i) || 32;
    for (let i = 0; i < 3; i++) out[at + 8 + i] = ext.charCodeAt(i) || 32;
    const d = new DataView(out.buffer, out.byteOffset);
    out[at + 11] = attributes;
    for (const [t, dd] of [[14, 16], [22, 24]]) { d.setUint16(at + t, time, true); d.setUint16(at + dd, day, true); }
    d.setUint16(at + 18, day, true); d.setUint16(at + 26, cluster, true); d.setUint32(at + 28, length, true);
  };
  const writeFolder = (node, self, parentCluster) => {
    const names = Object.keys(node);
    const out = new Uint8Array(self ? Math.max(1, Math.ceil((names.length + 2) * 32 / CLUSTER)) * CLUSTER : ROOT_ENTRIES * 32);
    if (!self && names.length + 1 > ROOT_ENTRIES) throw new Error('too many files in the root folder');
    const cluster = self ? allocate(out.length) : 0;
    let i = 0;
    if (self) { entry(out, 0, '.', 0x10, cluster, 0); entry(out, 32, '..', 0x10, parentCluster, 0); i = 2; }
    else { for (let k = 0; k < 11; k++) out[k] = label.charCodeAt(k) || 32; out[11] = 0x08; i = 1; }
    for (const name of names) {
      const item = node[name];
      if (item instanceof Uint8Array) {
        const first = item.length ? allocate(item.length) : 0;
        if (item.length) img.set(item, clusterOffset(first));
        entry(out, i++ * 32, name, 0x20, first, item.length);
      } else {
        entry(out, i++ * 32, name, 0x10, writeFolder(item, true, cluster), 0);
      }
    }
    img.set(out, self ? clusterOffset(cluster) : rootSector * SECTOR);
    return cluster;
  };
  writeFolder(tree, false, 0);
  const fatBytes = new Uint8Array(fat.buffer);
  img.set(fatBytes, (START + RESERVED) * SECTOR);
  img.set(fatBytes, (START + RESERVED + fatSectors) * SECTOR);
  return img;
}

// Reads the files of a FAT16 image made by fat16() back (8.3 names), for tests.
export function readFat16(img) {
  const view = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const b = view.getUint32(454, true) * SECTOR;
  const perCluster = img[b + 13], reserved = view.getUint16(b + 14, true), fats = img[b + 16];
  const rootEntries = view.getUint16(b + 17, true), fatSectors = view.getUint16(b + 22, true);
  const fatAt = b + reserved * SECTOR, rootAt = fatAt + fats * fatSectors * SECTOR, dataAt = rootAt + rootEntries * 32;
  const chain = first => { const list = []; for (let c = first; c >= 2 && c < 0xfff8; c = view.getUint16(fatAt + c * 2, true)) list.push(c); return list; };
  const read = (first, length) => { const out = new Uint8Array(chain(first).length * perCluster * SECTOR); chain(first).forEach((c, i) => out.set(img.subarray(dataAt + (c - 2) * perCluster * SECTOR, dataAt + (c - 1) * perCluster * SECTOR), i * perCluster * SECTOR)); return length == null ? out : out.subarray(0, length); };
  const list = (bytes, prefix) => {
    const files = {};
    for (let at = 0; at + 32 <= bytes.length && bytes[at]; at += 32) {
      const attributes = bytes[at + 11];
      if (bytes[at] === 0xe5 || attributes & 0x08) continue;
      const text = String.fromCharCode(...bytes.subarray(at, at + 11));
      const name = text.slice(0, 8).trim() + (text.slice(8).trim() ? `.${text.slice(8).trim()}` : '');
      if (name === '.' || name === '..') continue;
      const d = new DataView(bytes.buffer, bytes.byteOffset + at);
      const first = d.getUint16(26, true), length = d.getUint32(28, true);
      if (attributes & 0x10) Object.assign(files, list(read(first), `${prefix}${name}/`));
      else files[`${prefix}${name}`] = length ? read(first, length) : new Uint8Array(0);
    }
    return files;
  };
  return list(img.subarray(rootAt, dataAt), '');
}

// A shell link (MS-SHLLINK) to a program on a local drive, with arguments, a working folder,
// an icon and how its window opens (1 normal, 7 minimised without focus).
export function shellLink({ target, args = '', workingDir = '', icon = '', iconIndex = 0, description = '', show = 1 }) {
  const HAS_LINK_INFO = 0x2, HAS_NAME = 0x4, HAS_WORKING_DIR = 0x10, HAS_ARGUMENTS = 0x20, HAS_ICON = 0x40, IS_UNICODE = 0x80;
  const flags = HAS_LINK_INFO | IS_UNICODE | (description && HAS_NAME) | (workingDir && HAS_WORKING_DIR) | (args && HAS_ARGUMENTS) | (icon && HAS_ICON);
  const header = new Uint8Array(76), h = new DataView(header.buffer);
  h.setUint32(0, 0x4c, true);
  header.set([0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46], 4); // {00021401-0000-0000-C000-000000000046}
  h.setUint32(20, flags, true); h.setUint32(24, 0x20, true); h.setInt32(56, iconIndex, true); h.setUint32(60, show, true);
  // LinkInfo: a fixed-disk volume and the target's local path.
  const volume = new Uint8Array(17), v = new DataView(volume.buffer);
  v.setUint32(0, volume.length, true); v.setUint32(4, 3, true); v.setUint32(12, 0x10, true);
  const base = new Uint8Array([...Buffer.from(target, 'latin1'), 0]);
  const infoHeader = 0x1c, infoLength = infoHeader + volume.length + base.length + 1;
  const info = new Uint8Array(infoLength), i = new DataView(info.buffer);
  i.setUint32(0, infoLength, true); i.setUint32(4, infoHeader, true); i.setUint32(8, 1, true);
  i.setUint32(12, infoHeader, true); i.setUint32(16, infoHeader + volume.length, true); i.setUint32(24, infoLength - 1, true);
  info.set(volume, infoHeader); info.set(base, infoHeader + volume.length);
  const text = value => { const out = new Uint8Array(2 + value.length * 2), d = new DataView(out.buffer); d.setUint16(0, value.length, true); for (let k = 0; k < value.length; k++) d.setUint16(2 + k * 2, value.charCodeAt(k), true); return out; };
  const strings = [description, workingDir, args, icon].filter(Boolean).map(text);
  const parts = [header, info, ...strings, new Uint8Array(4)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// An .ico with one 32-bit image per size; images are { size, rgba } with rows top to bottom.
export function ico(images) {
  const bodies = images.map(({ size, rgba }) => {
    const mask = Math.ceil(size / 32) * 4 * size;
    const out = new Uint8Array(40 + size * size * 4 + mask), d = new DataView(out.buffer);
    d.setUint32(0, 40, true); d.setInt32(4, size, true); d.setInt32(8, size * 2, true); d.setUint16(12, 1, true); d.setUint16(14, 32, true);
    d.setUint32(20, size * size * 4 + mask, true);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4, to = 40 + ((size - 1 - y) * size + x) * 4;
      out[to] = rgba[from + 2]; out[to + 1] = rgba[from + 1]; out[to + 2] = rgba[from]; out[to + 3] = rgba[from + 3];
    }
    return out;
  });
  const header = new Uint8Array(6 + 16 * images.length), d = new DataView(header.buffer);
  d.setUint16(2, 1, true); d.setUint16(4, images.length, true);
  let offset = header.length;
  images.forEach(({ size }, n) => {
    const at = 6 + n * 16;
    header[at] = size % 256; header[at + 1] = size % 256; d.setUint16(at + 4, 1, true); d.setUint16(at + 6, 32, true);
    d.setUint32(at + 8, bodies[n].length, true); d.setUint32(at + 12, offset, true);
    offset += bodies[n].length;
  });
  const out = new Uint8Array(offset);
  out.set(header);
  let at = header.length;
  for (const body of bodies) { out.set(body, at); at += body.length; }
  return out;
}
