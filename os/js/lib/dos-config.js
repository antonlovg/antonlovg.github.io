// Builds the dosbox.conf for a DOS session. Games in games.json can override cycles, memory and
// the sound card; everything else uses settings that suit early-90s games like Jazz Jackrabbit.

const DEFAULTS = { cycles: 'auto', memsize: 16, machine: 'svga_s3', sbtype: 'sb16', core: 'auto' };
const SAFE_LINE = /^[\x20-\x7e]*$/;

export function dosboxConf(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const cycles = /^(auto|max|fixed \d{3,6}|\d{3,6})$/.test(String(o.cycles)) ? o.cycles : DEFAULTS.cycles;
  const memsize = Math.min(64, Math.max(1, Number(o.memsize) || DEFAULTS.memsize));
  const machine = ['svga_s3', 'vgaonly', 'ega', 'cga', 'tandy', 'hercules'].includes(o.machine) ? o.machine : DEFAULTS.machine;
  const sbtype = ['sb16', 'sbpro2', 'sbpro1', 'sb2', 'sb1', 'gb', 'none'].includes(o.sbtype) ? o.sbtype : DEFAULTS.sbtype;
  const core = ['auto', 'normal', 'simple', 'dynamic'].includes(o.core) ? o.core : DEFAULTS.core;
  const autoexec = (o.autoexec || []).filter(line => SAFE_LINE.test(line));
  return `[sdl]
autolock=false

[dosbox]
machine=${machine}
memsize=${memsize}

[cpu]
core=${core}
cputype=auto
cycles=${cycles}

[mixer]
rate=44100

[sblaster]
sbtype=${sbtype}
sbbase=220
irq=7
dma=1
hdma=5
oplmode=auto

[gus]
gus=false

[speaker]
pcspeaker=true

[dos]
xms=true
ems=true
umb=true
keyboardlayout=us

[autoexec]
@echo off
mount c .
c:
${autoexec.join('\n')}
`;
}

// The autoexec lines that start `program` (a file name in the mounted folder, e.g. "JAZZ.EXE").
// .bat files are started with CALL so the session stays open when they finish.
export function runLines(program, { exitAfter = false } = {}) {
  const name = String(program || '').trim();
  if (!name) return [];
  if (!/^[A-Za-z0-9_~!#$%&'()@^`{}\-.]+$/.test(name)) throw new Error(`Can't start "${name}" from DOS.`);
  const lines = [/\.bat$/i.test(name) ? `call ${name}` : name];
  if (exitAfter) lines.push('exit');
  return lines;
}

export const DOS_PROGRAMS = ['exe', 'com', 'bat'];
