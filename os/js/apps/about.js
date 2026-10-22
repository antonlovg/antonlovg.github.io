// About LövOS: version, credits and licences.
import { h, icon } from '../dom.js';
import { formatSize } from '../lib/path.js';

export default async function open(ctx) {
  const win = ctx.window({ width: 420, height: 'auto', resizable: false, className: 'dialog' });
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  win.body.append(h('div', { class: 'about' },
    h('div', { class: 'about-banner' }, icon('logo', 48), h('div', {}, h('p', { class: 'about-name' }, h('b', { text: 'Löv' }), 'OS'), h('p', { text: 'Version 1.0 · a desktop in your browser' }))),
    h('p', { text: 'Made for lovgren.dev. Everything runs on this device: files are kept in this browser, and nothing is sent anywhere unless you turn on GitHub Sync.' }),
    h('p', {}, 'DOS runs in ', h('a', { href: 'https://js-dos.com', target: '_blank', rel: 'noopener noreferrer', text: 'js-dos' }), ' (DOSBox for the web, GPL-2.0). Its files are served from this site; see ', h('a', { href: 'vendor/js-dos/NOTICE.txt', target: '_blank', rel: 'noopener', text: 'the notice' }), ' for the source and licence.'),
    h('p', { text: 'The look is a nod to ReactOS and the desktops of the 1990s. LövOS is not affiliated with ReactOS or Microsoft.' }),
    estimate?.quota ? h('p', { class: 'about-small', text: `Browser storage available to LövOS: ${formatSize(estimate.quota)}` }) : null,
    h('div', { class: 'dialog-buttons' }, h('button', { class: 'button default', type: 'button', text: 'OK', dataset: { autofocus: '' }, onclick: () => win.close() }))));
  win.el.addEventListener('keydown', event => { if (event.key === 'Escape') win.close(); });
  win.rect.h = win.el.offsetHeight;
  win.keepInside();
}
