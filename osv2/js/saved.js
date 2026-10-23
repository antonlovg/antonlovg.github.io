// A saved session: the whole machine (gzipped v86 state) in IndexedDB, only when you press Save.
// Database "lovgren-osv2", store "sessions", one record ("last"). Listed on /cookies/.
const NAME = 'lovgren-osv2';

function db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const request = action(database.transaction('sessions', mode).objectStore('sessions'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export const store = (blob, version) => run('readwrite', s => s.put({ blob, version, time: Date.now() }, 'last'));
export const remove = () => run('readwrite', s => s.delete('last'));

export async function info() {
  const record = await run('readonly', s => s.get('last'));
  return record ? { version: record.version, time: record.time, size: record.blob.size } : null;
}

export async function load() {
  const record = await run('readonly', s => s.get('last'));
  if (!record) throw new Error('There is no saved session.');
  return new Response(record.blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
