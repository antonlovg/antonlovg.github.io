// The emulated PC that ReactOS runs on. The page and scripts/make-reactos.mjs (which boots it once
// and saves the state the page starts from) must use exactly the same machine, or the state
// won't restore, so both take it from here.
export const BASE = new URL('../', import.meta.url);

// ReactOS 0.4.16 (the combined boot and live CD), split into 1 MB parts for GitHub Pages.
export const ISO = { size: 406847488, chunk: 1 << 20, sha256: '6f15ca6e1edf5527b8489958d16c54f0da0e7948c305d7c89e74687c6cbf6855' };
// C: — a FAT16 disk with Jazz Jackrabbit, the desktop and Documents. Its contents are in the state.
export const DISK_SIZE = 32 << 20;
export const MEMORY = 256 << 20;
export const STATE = 'reactos/state.bin.gz';
export const STATE_SIZE = 46045827; // bytes; make-reactos.mjs writes it
// Change when the machine changes: sessions saved in browsers from another version won't restore.
export const VERSION = '0.4.16-1';

export function machine({ screen, state = null, disk = null }) {
  return {
    wasm_path: new URL('vendor/v86/v86.wasm', BASE).href,
    bios: { url: new URL('vendor/v86/seabios.bin', BASE).href },
    vga_bios: { url: new URL('vendor/v86/vgabios.bin', BASE).href },
    memory_size: MEMORY,
    vga_memory_size: 8 << 20,
    cdrom: { url: new URL('reactos/iso/.img', BASE).href, size: ISO.size, async: true, fixed_chunk_size: ISO.chunk, use_parts: true },
    hda: { buffer: disk || new ArrayBuffer(DISK_SIZE) },
    boot_order: 0x123, // CD first
    initial_state: state ? { buffer: state } : undefined,
    screen_container: screen,
    autostart: true,
    disable_speaker: false
  };
}
