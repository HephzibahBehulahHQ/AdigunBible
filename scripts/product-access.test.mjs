import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, mock } from 'node:test';
import worker from '../worker/index.mjs';

const origin = 'https://adigunbible.hephzibahbehulah.com';
const chapter = '/reader/Matthew/chapter-1.js';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
  BIBLE_SESSION_SECRET: 'test-only-Bible-signing-material',
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) }
};

function request(path, options, bindings = env) {
  return worker.fetch(new Request(origin + path, options), bindings);
}

function credentials(intent, from = origin) {
  return {
    method: 'POST',
    headers: { Origin: from },
    body: new URLSearchParams({ email: 'test@example.com', password: 'test-password', intent })
  };
}

test('anonymous visitors can use the landing page but cannot load the reader or chapter files', async () => {
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/reader/')).headers.get('Location'), '/');
  assert.equal((await request(chapter)).status, 401);
  assert.equal((await request(chapter, { method: 'HEAD' })).status, 401);
  assert.equal((await request('/Matthew/chapter-1.js')).status, 404);
  assert.equal((await request(chapter, { headers: { Cookie: '__Host-adigunsps=foreign' } })).status, 401);
  assert.equal((await request('/session', credentials('login', 'https://adigunsps.hephzibahbehulah.com'))).status, 403);
});

test('login issues a Bible-only cookie and registration waits for email confirmation', async () => {
  const provider = mock.method(globalThis, 'fetch', async url => {
    if (url.pathname === '/auth/v1/signup') return Response.json({ user: {} });
    assert.equal(url.pathname, '/auth/v1/token');
    return Response.json({ access_token: 'provider-token', expires_in: 3600 });
  });

  try {
    const registration = await request('/session', credentials('register'));
    assert.equal(registration.headers.get('Set-Cookie'), null);
    assert.match(await registration.text(), /check your email/);

    const login = await request('/session', credentials('login'));
    assert.equal(login.headers.get('Location'), '/reader/');
    const cookie = login.headers.get('Set-Cookie');
    assert.match(cookie, /^__Host-adigunbible=.*; Path=\/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax$/);
    const session = cookie.split(';')[0];
    const authenticated = { headers: { Cookie: session } };
    for (const path of ['/reader/', chapter]) {
      const response = await request(path, authenticated);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(await response.text(), path);
    }
    assert.equal((await request(chapter, authenticated, { ...env, BIBLE_SESSION_SECRET: 'foreign-product-key' })).status, 401);
    const modified = session.slice(0, -1) + (session.endsWith('0') ? '1' : '0');
    assert.equal((await request(chapter, { headers: { Cookie: modified } })).status, 401);
    const logout = await request('/sign-out', { method: 'POST', headers: { Origin: origin } });
    assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  } finally {
    provider.mock.restore();
  }
});

test('the packaged reader includes sign-out and all chapter scripts it references', async () => {
  const reader = await readFile('dist-worker/reader/index.html', 'utf8');
  assert.match(reader, /action="\/sign-out"/);
  const scripts = [...reader.matchAll(/<script[^>]*src=["']((?:Matthew|Mark|Luke|John)\/[^"']+)["']/g)];
  assert.ok(scripts.length > 0);
  await Promise.all(scripts.map(([, path]) => readFile('dist-worker/reader/' + path)));
});
