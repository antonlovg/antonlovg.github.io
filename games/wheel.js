// Spin-the-wheel picker for "Pick a game". The winner is chosen first (uniformly at random by the
// caller); the wheel is then rotated so the pointer at the top lands inside the winner's segment.
// The geometry is pure and unit-tested; rendering uses SVG built with DOM APIs (no innerHTML).
(function attachWheel(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameWheel = api;
})(globalThis, () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Segment colours alternate; every one carries white text at 4.5:1 or better.
  const COLORS = ['#4f46e5', '#0e7490', '#7c3aed', '#b45309', '#be185d', '#1d4ed8', '#047481', '#9333ea'];
  const MAX_SEGMENTS = 12;

  // Final rotation (degrees, clockwise) that puts the pointer (at 0°, the top) inside segment `winner`.
  // `jitter` in [-1, 1] moves the stop point within the segment so spins don't look identical.
  function targetRotation(count, winner, { current = 0, turns = 5, jitter = 0 } = {}) {
    const segment = 360 / count;
    const centre = (winner + 0.5) * segment;
    const offset = Math.max(-0.38, Math.min(0.38, jitter * 0.38)) * segment;
    const base = Math.ceil(current / 360) * 360;
    return base + turns * 360 + (360 - centre) - offset;
  }

  // Which segment is under the pointer for a given rotation.
  function segmentAt(count, rotation) {
    const segment = 360 / count;
    const angle = ((360 - (rotation % 360)) % 360 + 360) % 360;
    return Math.floor(angle / segment) % count;
  }

  // Up to MAX_SEGMENTS games including the winner, in random order.
  function sample(items, winnerIndex, random = Math.random) {
    const others = items.filter((_, index) => index !== winnerIndex);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const picked = [items[winnerIndex], ...others.slice(0, MAX_SEGMENTS - 1)];
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    return { items: picked, winner: picked.indexOf(items[winnerIndex]) };
  }

  function label(text, max) {
    const chars = Array.from(text);
    return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
  }

  function point(angle, radius) {
    const radians = (angle - 90) * Math.PI / 180;
    return [100 + radius * Math.cos(radians), 100 + radius * Math.sin(radians)];
  }

  function create(container) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'wheel');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const rotor = document.createElementNS(SVG_NS, 'g');
    rotor.setAttribute('class', 'wheel-rotor');
    const pointer = document.createElementNS(SVG_NS, 'path');
    pointer.setAttribute('class', 'wheel-pointer');
    pointer.setAttribute('d', 'M92 2h16l-8 16z');
    const hub = document.createElementNS(SVG_NS, 'circle');
    hub.setAttribute('class', 'wheel-hub');
    hub.setAttribute('cx', '100');
    hub.setAttribute('cy', '100');
    hub.setAttribute('r', '13');
    svg.append(rotor, hub, pointer);
    container.replaceChildren(svg);
    let rotation = 0;

    function draw(titles) {
      rotor.replaceChildren();
      const count = titles.length;
      const segment = 360 / count;
      titles.forEach((title, index) => {
        const start = index * segment;
        const end = start + segment;
        const [x1, y1] = point(start, 96);
        const [x2, y2] = point(end, 96);
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', count === 1 ? 'M100 4a96 96 0 1 1 0 192a96 96 0 1 1 0-192z' : `M100 100L${x1.toFixed(2)} ${y1.toFixed(2)}A96 96 0 ${segment > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}z`);
        path.setAttribute('fill', COLORS[index % COLORS.length]);
        path.setAttribute('class', 'wheel-segment');
        const text = document.createElementNS(SVG_NS, 'text');
        const middle = start + segment / 2;
        const [tx, ty] = point(middle, 58);
        text.setAttribute('x', tx.toFixed(2));
        text.setAttribute('y', ty.toFixed(2));
        text.setAttribute('class', 'wheel-label');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('transform', `rotate(${(middle - 90 + (middle > 180 ? 180 : 0)).toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)})`);
        text.textContent = label(title, count > 8 ? 13 : 17);
        rotor.append(path, text);
      });
    }

    function spin(titles, winner, { duration = 3600, reducedMotion = false } = {}) {
      draw(titles);
      rotation = targetRotation(titles.length, winner, { current: rotation, jitter: Math.random() * 2 - 1 });
      if (reducedMotion || titles.length < 2) {
        rotor.style.transition = 'none';
        rotor.style.transform = `rotate(${rotation}deg)`;
        return Promise.resolve();
      }
      return new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        rotor.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, duration + 300);
        rotor.style.transition = 'none';
        // Force a style flush so the new transition starts from the current angle.
        void rotor.getBoundingClientRect();
        rotor.style.transition = `transform ${duration}ms cubic-bezier(.12, .7, .14, 1)`;
        rotor.style.transform = `rotate(${rotation}deg)`;
      });
    }

    return { spin };
  }

  return { COLORS, MAX_SEGMENTS, targetRotation, segmentAt, sample, create };
});
