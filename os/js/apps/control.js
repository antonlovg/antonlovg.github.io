// Control Panel: Display, Sounds, GitHub Sync, Storage and General settings.
import { h, icon, download, pickFiles } from '../dom.js';
import * as vfs from '../vfs.js';
import * as settings from '../settings.js';
import * as sync from '../sync.js';
import { THEMES, WALLPAPERS } from '../appearance.js';
import { display, formatSize } from '../lib/path.js';
import { writeZip, readZip } from '../lib/zip.js';
import { fileDialog, confirmBox, errorBox, alertBox, messageBox } from '../dialogs.js';
import { extractEntries } from '../fileops.js';
import { play } from '../sound.js';
import { progress } from '../progress.js';

const PAGES = [
  { id: 'display', label: 'Display', icon: 'display', text: 'Theme and desktop background' },
  { id: 'sound', label: 'Sounds', icon: 'sound', text: 'System sounds and volume' },
  { id: 'sync', label: 'GitHub Sync', icon: 'sync', text: 'Keep your drive in a private GitHub repository' },
  { id: 'storage', label: 'Storage', icon: 'storage', text: 'Space used, backups and reset' },
  { id: 'general', label: 'General', icon: 'control', text: 'Start-up, clock and touch controls' }
];

export default async function open(ctx) {
  const win = ctx.window({ width: 620, height: 470, minWidth: 340, minHeight: 300 });
  const uid = win.id;
  const nav = h('nav', { class: 'cp-nav', 'aria-label': 'Control Panel' });
  const content = h('div', { class: 'cp-content' });
  win.body.classList.add('control');
  win.body.append(h('div', { class: 'cp' }, nav, content));
  let page = 'home';

  function show(id) {
    page = PAGES.some(p => p.id === id) ? id : 'home';
    win.sessionArgs = { page };
    win.setTitle(page === 'home' ? 'Control Panel' : `${PAGES.find(p => p.id === page).label} - Control Panel`);
    nav.replaceChildren(h('ul', {},
      h('li', {}, h('button', { type: 'button', class: `cp-link${page === 'home' ? ' current' : ''}`, 'aria-current': page === 'home' ? 'page' : null, onclick: () => show('home') }, icon('control', 16), h('span', { text: 'All settings' }))),
      ...PAGES.map(p => h('li', {}, h('button', { type: 'button', class: `cp-link${page === p.id ? ' current' : ''}`, 'aria-current': page === p.id ? 'page' : null, onclick: () => show(p.id) }, icon(p.icon, 16), h('span', { text: p.label }))))));
    content.replaceChildren();
    ({ home, display: displayPage, sound: soundPage, sync: syncPage, storage: storagePage, general: generalPage })[page]();
    content.scrollTop = 0;
  }

  const field = (label, control, hint) => {
    control.id ||= `cp-${uid}-${Math.random().toString(36).slice(2, 8)}`;
    return h('div', { class: 'cp-field' }, h('label', { for: control.id, text: label }), control, hint ? h('p', { class: 'cp-hint', text: hint }) : null);
  };
  const checkbox = (label, name, onChange) => {
    const input = h('input', { type: 'checkbox', checked: Boolean(settings.get(name)) });
    input.addEventListener('change', () => { settings.set({ [name]: input.checked }); onChange?.(input.checked); });
    return h('label', { class: 'check cp-check' }, input, h('span', { text: label }));
  };
  const select = (options, value, onChange) => {
    const el = h('select', {}, Object.entries(options).map(([v, label]) => h('option', { value: v, text: label, selected: v === value })));
    el.addEventListener('change', () => onChange(el.value));
    return el;
  };

  function home() {
    content.append(h('h2', { text: 'Control Panel' }), h('div', { class: 'cp-grid' }, PAGES.map(p => h('button', { type: 'button', class: 'cp-tile', onclick: () => show(p.id) }, icon(p.icon, 32), h('strong', { text: p.label }), h('span', { text: p.text })))));
  }

  // ---------- Display ----------
  function displayPage() {
    const preview = h('div', { class: 'cp-preview', 'aria-hidden': 'true' }, h('div', { class: 'cp-preview-win' }, h('div', { class: 'cp-preview-title', text: 'Active window' }), h('div', { class: 'cp-preview-body', text: 'Window text' })));
    const updatePreview = () => { preview.dataset.wallpaper = settings.get('wallpaper'); };
    const imageRow = h('div', { class: 'cp-row' });
    const renderImageRow = () => {
      imageRow.hidden = settings.get('wallpaper') !== 'image';
      imageRow.replaceChildren(
        h('span', { class: 'cp-path', text: settings.get('wallpaperImage') ? display(settings.get('wallpaperImage')) : 'No picture chosen' }),
        h('button', { class: 'button', type: 'button', text: 'Browse…', onclick: async () => {
          const path = await fileDialog({ owner: win, title: 'Choose a picture', folder: 'C:/Pictures', filters: [{ label: 'Pictures', ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
          if (path) { settings.set({ wallpaperImage: path, wallpaper: 'image' }); renderImageRow(); }
        } }),
        select({ cover: 'Fill', contain: 'Fit', center: 'Centre', tile: 'Tile' }, settings.get('wallpaperFit'), v => settings.set({ wallpaperFit: v })));
    };
    renderImageRow();
    updatePreview();
    content.append(h('h2', { text: 'Display' }), preview,
      field('Theme', select(THEMES, settings.get('theme'), v => settings.set({ theme: v }))),
      field('Desktop background', select(WALLPAPERS, settings.get('wallpaper'), v => { settings.set({ wallpaper: v }); renderImageRow(); updatePreview(); })),
      imageRow,
      h('p', { class: 'cp-hint', text: 'Tip: right-click a picture in File Explorer and choose "Set as desktop background".' }));
  }

  // ---------- Sounds ----------
  function soundPage() {
    const volume = h('input', { type: 'range', min: 0, max: 100, value: Math.round(settings.get('volume') * 100) });
    volume.addEventListener('input', () => settings.set({ volume: Number(volume.value) / 100, muted: false }));
    content.append(h('h2', { text: 'Sounds' }),
      checkbox('Play system sounds (start-up, dialogs, windows)', 'sounds'),
      field('Volume (also for DOS games)', volume),
      checkbox('Mute everything', 'muted'),
      h('div', { class: 'cp-row' }, ...['startup', 'ding', 'error', 'open', 'recycle'].map(name => h('button', { class: 'button small', type: 'button', text: `▶ ${name}`, 'aria-label': `Play the ${name} sound`, onclick: () => play(name) }))));
  }

  // ---------- GitHub Sync ----------
  async function syncPage() {
    const config = await sync.getConfig();
    const owner = h('input', { type: 'text', value: config.owner, autocomplete: 'off', spellcheck: false, placeholder: 'your-github-name' });
    const repo = h('input', { type: 'text', value: config.repo, autocomplete: 'off', spellcheck: false, placeholder: 'lovos-drive' });
    const branch = h('input', { type: 'text', value: config.branch, autocomplete: 'off', spellcheck: false, placeholder: 'the default branch' });
    const folder = h('input', { type: 'text', value: config.folder, autocomplete: 'off', spellcheck: false });
    const token = h('input', { type: 'password', value: config.token, autocomplete: 'off', spellcheck: false, placeholder: 'github_pat_…' });
    const auto = h('input', { type: 'checkbox', checked: config.auto });
    const result = h('p', { class: 'cp-result', role: 'status' });
    const status = h('p', { class: 'cp-status', text: sync.status().message });
    const onStatus = () => { status.textContent = sync.status().message; };
    sync.events.addEventListener('status', onStatus);
    win.on('close', () => sync.events.removeEventListener('status', onStatus));
    const values = () => ({ owner: owner.value, repo: repo.value, branch: branch.value, folder: folder.value, token: token.value, auto: auto.checked });
    const saveButton = h('button', { class: 'button default', type: 'submit', text: 'Save' });
    const form = h('form', { class: 'cp-form', onsubmit: async event => {
      event.preventDefault();
      if (!values().owner.trim() || !values().repo.trim() || !values().token.trim()) { result.textContent = 'Fill in the owner, repository and token.'; play('error'); return; }
      await sync.setConfig(values());
      result.textContent = 'Saved. Syncing now…';
      const plan = await sync.syncNow({ interactive: true });
      result.textContent = plan ? sync.status().message : `Not synced: ${sync.status().message}`;
    } },
    field('Owner (your GitHub user or organisation)', owner),
    field('Private repository', repo, 'Create an empty private repository for this on github.com first.'),
    field('Folder in the repository', folder, 'Your C: drive goes in this folder.'),
    field('Branch (optional)', branch),
    field('Access token', token, 'Stored only in this browser and sent only to api.github.com.'),
    h('label', { class: 'check cp-check' }, auto, h('span', { text: 'Sync automatically (on start-up and a minute after changes)' })),
    h('div', { class: 'cp-row' },
      saveButton,
      h('button', { class: 'button', type: 'button', text: 'Test connection', onclick: async () => {
        result.textContent = 'Testing…';
        try {
          const info = await sync.testConnection(values());
          result.textContent = `Connected to ${info.fullName} (${info.private ? 'private' : 'PUBLIC — anyone can see synced files!'}), branch ${info.branch}. ${info.canPush ? 'The token can upload.' : 'The token can only download.'}`;
          play('ding');
        } catch (error) { result.textContent = error.message; play('error'); }
      } }),
      h('button', { class: 'button', type: 'button', text: 'Sync now', onclick: () => sync.syncNow({ interactive: true }) }),
      h('button', { class: 'button', type: 'button', text: 'Forget', onclick: async () => {
        if (!(await confirmBox('Remove the GitHub settings and token from this browser? Files stay on the drive and on GitHub.', { title: 'GitHub Sync', owner: win }))) return;
        await sync.forget();
        show('sync');
      } })),
    result);
    content.append(h('h2', { text: 'GitHub Sync' }),
      h('p', { text: 'Keep your C: drive — documents, games and save games — in a private GitHub repository, so you can carry on from any device.' }),
      status,
      h('details', { class: 'cp-help' }, h('summary', { text: 'How to set it up (2 minutes)' }),
        h('ol', {},
          h('li', {}, 'Create a new ', h('strong', { text: 'private' }), ' repository on GitHub, e.g. "lovos-drive".'),
          h('li', {}, 'Create a ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener noreferrer', text: 'fine-grained personal access token' }), ': under Repository access choose "Only select repositories" and pick that repository; under Permissions set Contents to "Read and write" (or "Read-only" for a device that should only download).'),
          h('li', {}, 'Paste your user name, the repository name and the token here, then press Save.'),
          h('li', {}, 'Do the same on your other devices. The first sync on a new device downloads everything.'))),
      form);
  }

  // ---------- Storage ----------
  async function storagePage() {
    const { bytes, files } = await vfs.usage();
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const used = estimate?.quota ? Math.min(100, Math.round(estimate.usage / estimate.quota * 100)) : 0;
    const protect = h('button', { class: 'button', type: 'button', text: persisted ? 'Protected' : 'Protect from clean-up', disabled: persisted, onclick: async () => {
      const ok = await navigator.storage?.persist?.().catch(() => false);
      await alertBox(ok ? 'The browser will keep your drive even when space runs low.' : 'The browser declined. Installing LövOS as an app (browser menu → Install) usually helps.', { title: 'Storage', owner: win });
      show('storage');
    } });
    content.append(h('h2', { text: 'Storage' }),
      h('dl', { class: 'props' },
        h('dt', { text: 'Files on C:' }), h('dd', { text: `${files.toLocaleString()} files, ${formatSize(bytes)}` }),
        h('dt', { text: 'Browser storage' }), h('dd', { text: estimate?.quota ? `${formatSize(estimate.usage)} used of ${formatSize(estimate.quota)}` : 'Unknown' }),
        h('dt', { text: 'Protected' }), h('dd', { text: persisted ? 'Yes' : 'No — the browser may clear it if space runs low' })),
      h('div', { class: 'meter', role: 'img', 'aria-label': `${used}% of browser storage used` }, h('div', { class: 'meter-fill', style: { width: `${Math.max(1, used)}%` } })),
      h('div', { class: 'cp-row' },
        protect,
        h('button', { class: 'button', type: 'button', text: 'Back up drive (zip)…', onclick: backup }),
        h('button', { class: 'button', type: 'button', text: 'Restore from zip…', onclick: restoreBackup })),
      h('fieldset', { class: 'cp-danger' }, h('legend', { text: 'Start over' }),
        h('p', { text: 'Deletes every file and setting LövOS has stored in this browser. Files on GitHub are not touched.' }),
        h('button', { class: 'button', type: 'button', text: 'Reset LövOS…', onclick: reset })));
  }

  async function backup() {
    const done = progress('Packing the drive…');
    try {
      const entries = (await vfs.walk('C:')).filter(entry => entry.type === 'file' && !/^c:\/\$recycle\.bin/i.test(entry.path));
      const files = [];
      for (const entry of entries) files.push({ path: entry.path.slice(3), bytes: new Uint8Array(await (entry.data || new Blob([])).arrayBuffer()), date: new Date(entry.mtime) });
      download(`lovos-drive-${new Date().toISOString().slice(0, 10)}.zip`, new Blob([writeZip(files)], { type: 'application/zip' }));
    } catch (error) { errorBox(error, { owner: win }); } finally { done.close(); }
  }

  async function restoreBackup() {
    const [file] = await pickFiles({ accept: '.zip', multiple: false });
    if (!file) return;
    if (!(await confirmBox(`Copy everything in ${file.name} onto the C: drive? Files with the same names are replaced.`, { title: 'Restore', owner: win }))) return;
    try {
      const entries = readZip(new Uint8Array(await file.arrayBuffer())).filter(entry => !entry.dir);
      await extractEntries(entries, 'C:');
      await alertBox(`${entries.length} files restored.`, { title: 'Restore', owner: win });
    } catch (error) { errorBox(error, { owner: win }); }
  }

  async function reset() {
    const answer = await messageBox('This deletes all files, games, saves and settings stored by LövOS in this browser. This cannot be undone.', { title: 'Reset LövOS', kind: 'warning', buttons: ['Delete everything', 'Cancel'], defaultIndex: 1, owner: win });
    if (answer !== 'Delete everything') return;
    await vfs.wipe();
    if ('caches' in globalThis) for (const name of await caches.keys()) if (name.startsWith('lovos')) await caches.delete(name);
    location.reload();
  }

  // ---------- General ----------
  function generalPage() {
    content.append(h('h2', { text: 'General' }),
      checkbox('Show the start-up screen', 'bootScreen'),
      checkbox('Reopen my windows next time', 'restoreWindows'),
      checkbox('24-hour clock', 'clock24'),
      checkbox('Show hidden files', 'showHidden'),
      field('On-screen game controls (DOS)', select({ auto: 'On touch screens', on: 'Always', off: 'Never' }, settings.get('touchControls'), v => settings.set({ touchControls: v }))));
  }

  win.onArgs = args => show(args.page || 'home');
  show(ctx.args.page || 'home');
}
