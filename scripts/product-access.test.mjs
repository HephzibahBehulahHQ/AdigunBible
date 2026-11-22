import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, mock } from 'node:test';
import worker from '../worker/index.mjs';

const origin = 'https://adigunbible.hephzibahbehulah.com';
const chapter = '/reader/Matthew/chapter-1.js';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable',
  PRODUCT_ACCOUNT_PREFIX: 'adigunbible_preview',
  BIBLE_SESSION_SECRET: 'test-session-key',
  BIBLE_ACTIVATION_SECRET: 'test-activation-proof',
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) }
};
const email = 'reader@example.com';
const password = 'a Bible-only password';

function request(path, options, bindings = env) {
  return worker.fetch(new Request(origin + path, options), bindings);
}

function post(path, fields, cookie = '', requestOrigin = origin) {
  return request(path, {
    method: 'POST',
    headers: { Origin: requestOrigin, Cookie: cookie },
    body: new URLSearchParams(fields)
  });
}

test('signed-out visitors can open product forms but cannot access any reader file', async () => {
  assert.match(await (await request('/')).text(), /value="register">Create account/);
  assert.match(await (await request('/sign-in')).text(), /value="login">Sign in/);
  assert.equal((await request('/reader/')).headers.get('Location'), '/');
  assert.equal((await request(chapter)).status, 401);
  assert.equal((await request(chapter, { method: 'HEAD' })).status, 401);
  assert.equal((await request('/Matthew/chapter-1.js')).status, 404);
  for (const name of ['__Host-adigunsps', '__Host-adigunbible-otp-session']) {
    assert.equal((await request(chapter, { headers: {Cookie: name + '=other-session'} })).status, 401);
  }
  assert.equal((await post('/session', {intent: 'register', email}, '', 'https://adigunsps.hephzibahbehulah.com')).status, 403);
});

test('a verified shared identity must enter an emailed code to activate, then sign in separately', async () => {
  let active = false;
  let registeredProof;
  let providerRequests = 0;
  const provider = mock.method(globalThis, 'fetch', async (url, options) => {
    providerRequests++;
    const data = JSON.parse(options.body);
    if (url.pathname === '/auth/v1/otp') {
      assert.equal(data.email, email);
      assert.equal(typeof data.create_user, 'boolean');
      return Response.json({});
    }
    if (url.pathname === '/auth/v1/verify') {
      assert.equal(data.email, email);
      assert.equal(data.type, 'email');
      if (data.token !== '123456') return Response.json({}, {status: 403});
      return Response.json({access_token: 'provider-otp-token', expires_in: 3600,
        user: { email, email_confirmed_at: '2026-11-22' }});
    }
    if (url.pathname.endsWith('_activate_password_account')) {
      assert.equal(options.headers.Authorization, 'Bearer provider-otp-token');
      assert.equal(data.activation_proof, env.BIBLE_ACTIVATION_SECRET);
      assert.equal(data.email_address, email);
      assert.match(data.password_proof, /^[a-f0-9]{64}$/);
      assert.equal(active, false);
      registeredProof = data.password_proof;
      active = true;
      return Response.json(true);
    }
    assert.equal(url.pathname, '/rest/v1/rpc/adigunbible_preview_password_sign_in');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(data.email_address, email);
    return Response.json(active && data.password_proof === registeredProof);
  });

  try {
    const start = async intent => {
      const response = await post('/session', {intent, email, password});
      assert.equal(response.status, 200);
      assert.match(await response.text(), /name="code".*autocomplete="one-time-code"/);
      return response.headers.get('Set-Cookie').split(';')[0];
    };
    const verify = (intent, cookie, code = '123456') => post('/verify-email', {intent, code}, cookie);

    const foreign = await post('/session', {intent: 'login', email, password});
    assert.equal(foreign.status, 401);
    assert.equal(active, false);

    const pending = await start('register');
    assert.equal(active, false);
    const beforeRejected = providerRequests;
    assert.equal((await verify('register', '')).status, 400);
    const tampered = pending.slice(0, -1) + (pending.endsWith('0') ? '1' : '0');
    assert.equal((await verify('register', tampered)).status, 400);
    assert.equal((await verify('login', pending)).status, 400);
    assert.equal(providerRequests, beforeRejected);
    assert.equal((await verify('register', pending, '000000')).status, 401);
    assert.equal(active, false);

    const registered = await verify('register', pending);
    assert.match(await registered.text(), /account is active/);
    assert.equal(active, true);
    assert.ok(!registered.headers.get('Set-Cookie').includes('__Host-adigunbible-password-session='));

    const wrongPassword = await post('/session', {intent: 'login', email, password: 'another product password'});
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.headers.get('Set-Cookie'), null);
    const pendingLogin = await start('login');
    assert.equal((await request(chapter, {headers: {Cookie: pendingLogin}})).status, 401);
    assert.equal((await verify('login', pendingLogin, '000000')).status, 401);
    const signedIn = await verify('login', pendingLogin);
    assert.equal(signedIn.headers.get('Location'), '/reader/');
    const sessionCookie = signedIn.headers.getSetCookie().find(value => value.startsWith('__Host-adigunbible-password-session='));
    assert.match(sessionCookie, /; Path=\/; Max-Age=3600; Secure; HttpOnly; SameSite=Lax$/);
    const signedInRequest = {headers: {Cookie: sessionCookie.split(';')[0]}};
    for (const path of ['/reader/', chapter]) {
      const response = await request(path, signedInRequest);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal((await request(chapter, signedInRequest, {...env, BIBLE_SESSION_SECRET: 'other-key'})).status, 401);
    const logout = await post('/sign-out', {});
    assert.ok(logout.headers.getSetCookie().every(value => value.includes('Max-Age=0')));
  } finally {
    provider.mock.restore();
  }
});

test('the packaged reader includes sign-out and every chapter script it references', async () => {
  const reader = await readFile('dist-worker/reader/index.html', 'utf8');
  assert.match(reader, /action="\/sign-out"/);
  const scripts = [...reader.matchAll(/<script[^>]*src=["']((?:Matthew|Mark|Luke|John)\/[^"']+)["']/g)];
  assert.ok(scripts.length > 0);
  await Promise.all(scripts.map(([, path]) => readFile('dist-worker/reader/' + path)));
});
