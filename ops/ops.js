// /ops, /status and /changelog: relative times, the pipeline replay and the architecture diagram.
// The pages are complete without JavaScript; this only adds interaction.
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // ---------- Relative times ("3 hours ago"), with the exact time kept as a tooltip ----------

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  function relative(iso) {
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return 'just now';
  }
  for (const node of document.querySelectorAll('time[data-relative]')) {
    if (Number.isNaN(Date.parse(node.dateTime))) continue;
    node.title = node.textContent;
    node.textContent = relative(node.dateTime);
  }

  // ---------- Pipeline replay ----------

  const replay = document.querySelector('[data-replay]');
  if (replay) {
    const button = replay.querySelector('[data-replay-button]');
    const log = replay.querySelector('[data-replay-log]');
    const steps = [...replay.querySelectorAll('.replay-step')];
    let playing = false;
    button.hidden = false;

    const line = text => { log.append(`${text}\n`); log.scrollTop = log.scrollHeight; };

    button.addEventListener('click', async () => {
      if (playing) return;
      playing = true;
      button.disabled = true;
      log.hidden = false;
      log.replaceChildren();
      replay.classList.add('is-playing');
      steps.forEach(step => step.classList.remove('is-running', 'is-done', 'is-failed'));
      line('$ git push origin main');
      for (const step of steps) {
        const name = step.querySelector('.step-name').textContent;
        const time = step.querySelector('.step-time').textContent;
        step.classList.add('is-running');
        line(`▶ ${name}`);
        // Real durations, sped up so a one-minute run replays in a few seconds.
        if (!reducedMotion.matches) await sleep(Math.min(1600, Math.max(260, Number(step.dataset.duration) / 14)));
        step.classList.remove('is-running');
        const failed = step.dataset.conclusion === 'failure';
        step.classList.add(failed ? 'is-failed' : 'is-done');
        line(`${failed ? '✗' : '✓'} ${name} (${time})`);
      }
      line(steps.some(step => step.dataset.conclusion === 'failure') ? '✗ Deploy blocked.' : '✓ Deployed to lovgren.dev');
      playing = false;
      button.disabled = false;
      button.textContent = '↻ Replay again';
    });
  }

  // ---------- Architecture diagram ----------

  const arch = document.querySelector('.arch');
  if (arch) {
    const svg = arch.querySelector('.arch-edges');
    const edges = arch.dataset.edges.split(/\s+/).map(edge => edge.split('>'));
    const nodes = Object.fromEntries([...arch.querySelectorAll('.arch-node')].map(node => [node.dataset.node, node]));
    let selected = null;

    function anchor(rect, toward) {
      // Point on the box edge facing the other box.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = toward.x - cx;
      const dy = toward.y - cy;
      const scale = Math.min(Math.abs((rect.width / 2) / (dx || 1e-6)), Math.abs((rect.height / 2) / (dy || 1e-6)));
      return { x: cx + dx * scale, y: cy + dy * scale };
    }

    function drawEdges() {
      svg.querySelectorAll('line').forEach(line => line.remove());
      if (getComputedStyle(svg).display === 'none') return;
      const base = arch.getBoundingClientRect();
      for (const [from, to] of edges) {
        const a = nodes[from]?.querySelector('.arch-button').getBoundingClientRect();
        const b = nodes[to]?.querySelector('.arch-button').getBoundingClientRect();
        if (!a || !b) continue;
        const shift = r => ({ left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height });
        const ra = shift(a);
        const rb = shift(b);
        const start = anchor(ra, { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 });
        const end = anchor(rb, { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 });
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', start.x.toFixed(1));
        line.setAttribute('y1', start.y.toFixed(1));
        line.setAttribute('x2', end.x.toFixed(1));
        line.setAttribute('y2', end.y.toFixed(1));
        line.dataset.from = from;
        line.dataset.to = to;
        if (selected && (from === selected || to === selected)) line.classList.add('is-active');
        svg.append(line);
      }
    }

    function select(key) {
      selected = selected === key ? null : key;
      arch.classList.toggle('has-selection', Boolean(selected));
      for (const [name, node] of Object.entries(nodes)) {
        const open = name === selected;
        node.querySelector('.arch-button').setAttribute('aria-expanded', String(open));
        node.querySelector('.arch-detail').hidden = !open;
        node.classList.toggle('is-linked', Boolean(selected) && edges.some(([a, b]) => (a === selected && b === name) || (b === selected && a === name)));
      }
      drawEdges();
    }

    for (const [key, node] of Object.entries(nodes)) {
      const button = node.querySelector('.arch-button');
      button.addEventListener('click', () => select(key));
      // Arrow keys move between boxes in reading order.
      button.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...arch.querySelectorAll('.arch-button')];
        const index = buttons.indexOf(button) + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
        buttons[(index + buttons.length) % buttons.length].focus();
      });
    }
    arch.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selected) {
        const key = selected;
        select(key);
        nodes[key].querySelector('.arch-button').focus();
      }
    });
    new ResizeObserver(drawEdges).observe(arch);
    drawEdges();
  }
})();
