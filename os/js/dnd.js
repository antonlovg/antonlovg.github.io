// Dragging files and folders with the mouse or a finger. Elements with data-drop="<folder path>"
// (or "recycle") accept drops. Resolves with { target, x, y, copy } once dropped, or null for a
// plain click (the pointer moved less than a few pixels).
import { h, icon, capture } from './dom.js';

export function dragItems(event, { count = 1, label = '', iconName = 'file', threshold = 6 } = {}) {
  return new Promise(resolve => {
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    let hover = null;
    const source = event.currentTarget;
    capture(source, event.pointerId);
    const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]') || null;
    const move = e => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < threshold) return;
        ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' }, icon(iconName, 32), h('span', { text: count > 1 ? `${count} items` : label }));
        document.body.append(ghost);
        document.body.classList.add('dragging-files');
      }
      ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
      const target = targetAt(e.clientX, e.clientY);
      if (target !== hover) {
        hover?.classList.remove('drop-hover');
        hover = target;
        hover?.classList.add('drop-hover');
      }
    };
    const finish = e => {
      source.removeEventListener('pointermove', move);
      source.removeEventListener('pointerup', finish);
      source.removeEventListener('pointercancel', cancel);
      hover?.classList.remove('drop-hover');
      document.body.classList.remove('dragging-files');
      if (!ghost) { resolve(null); return; }
      ghost.remove();
      resolve({ target: targetAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY, copy: e.ctrlKey });
    };
    const cancel = () => {
      source.removeEventListener('pointermove', move);
      source.removeEventListener('pointerup', finish);
      source.removeEventListener('pointercancel', cancel);
      hover?.classList.remove('drop-hover');
      document.body.classList.remove('dragging-files');
      ghost?.remove();
      resolve(null);
    };
    source.addEventListener('pointermove', move);
    source.addEventListener('pointerup', finish);
    source.addEventListener('pointercancel', cancel);
  });
}
