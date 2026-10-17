// Headless Chrome over the DevTools protocol, plus a tiny static server for the built site.
// Shared by audit-site.mjs and make-og.mjs; no dependencies.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon' };

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Serves dir like GitHub Pages: /path/ → index.html, missing files → 404.html.
export function startServer(dir) {
  const server = createServer(async (request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = path.join(dir, urlPath);
    if (!file.startsWith(dir)) { response.writeHead(403).end(); return; }
    if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      const notFound = await readFile(path.join(dir, '404.html')).catch(() => 'Not found');
      response.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(notFound);
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const chrome = candidates.find(candidate => candidate && existsSync(candidate));
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  return chrome;
}

export async function launchChrome(chromePath, profileDir) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chromeArgs = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
  if (process.env.CI) chromeArgs.unshift('--no-sandbox');
  const child = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page) return { child, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not ready yet */ }
  }
  child.kill();
  throw new Error('Chrome did not start.');
}

export async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    else listeners.forEach(listener => listener(message));
  });
  const send = (method, params = {}) => new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, on: listener => listeners.add(listener), close: () => socket.close() };
}
