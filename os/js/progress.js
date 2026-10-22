// A small progress box for long file operations; it only appears if the work takes a moment.
import { h } from './dom.js';

export function progress(text) {
  const bar = h('div', { class: 'progress-fill' });
  const label = h('p', { text });
  const box = h('div', { class: 'progress-box', role: 'status' }, label, h('div', { class: 'progress-track' }, bar));
  let shown = false;
  const timer = setTimeout(() => { shown = true; document.body.append(box); }, 300);
  return {
    update(fraction, message) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
      if (message) label.textContent = message;
    },
    close() {
      clearTimeout(timer);
      if (shown) box.remove();
    }
  };
}
