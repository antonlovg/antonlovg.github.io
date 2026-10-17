const ALLOWED_ORIGINS = new Set([
  'https://lovgren.dev',
  'https://www.lovgren.dev',
  'https://antonlovg.github.io'
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  });
  if (ALLOWED_ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Origin not allowed.', { status: 403 });
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'GET') {
      headers.set('Allow', 'GET, OPTIONS');
      return new Response('Method not allowed.', { status: 405, headers });
    }

    const requestUrl = new URL(request.url);
    const appId = requestUrl.searchParams.get('appids');
    if (requestUrl.pathname !== '/appdetails' || !/^\d{1,10}$/.test(appId || '')) {
      return Response.json({ error: 'Provide one numeric Steam app ID.' }, { status: 400, headers });
    }

    const steamUrl = new URL('https://store.steampowered.com/api/appdetails');
    steamUrl.searchParams.set('appids', appId);
    steamUrl.searchParams.set('cc', 'se');
    steamUrl.searchParams.set('l', 'english');

    try {
      const steamResponse = await fetch(steamUrl);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      if (steamResponse.ok) headers.set('Cache-Control', 'public, max-age=300');
      return new Response(await steamResponse.text(), { status: steamResponse.status, headers });
    } catch {
      return Response.json({ error: 'Could not reach Steam.' }, { status: 502, headers });
    }
  }
};