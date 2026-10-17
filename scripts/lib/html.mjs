// Escaping and template helpers for build-time HTML. Everything that comes from data
// (commit messages, incident notes, game titles) must pass through escapeHtml / escapeXml.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

// XML 1.0 also forbids most control characters, so they are dropped.
export function escapeXml(value) {
  return escapeHtml(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

// Only http(s) URLs may be used as links.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

// Replaces the content between <!-- build:name --> and <!-- /build:name --> (markers kept).
export function fillSlot(template, name, html) {
  const start = `<!-- build:${name} -->`;
  const end = `<!-- /build:${name} -->`;
  const from = template.indexOf(start);
  const to = template.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`Template slot "${name}" not found`);
  return template.slice(0, from + start.length) + html + template.slice(to);
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '–';
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

export function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Stockholm' });
}

export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm', timeZoneName: 'short' });
}
