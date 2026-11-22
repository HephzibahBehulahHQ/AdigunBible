const cookieName = '__Host-adigunbible-enrolled';
const encoder = new TextEncoder();
const sessionSeconds = 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.pathname === '/') return landing();
      if (url.pathname === '/sign-in') return landing('login');
    }

    if (url.pathname === '/session' && request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      return authenticate(request, env);
    }

    if (url.pathname === '/sign-out' && request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      return redirect('/', cookie('', 0));
    }

    if (
      ['GET', 'HEAD'].includes(request.method) &&
      /^\/reader\/(?:index\.html|(?:Matthew|Mark|Luke|John)\/(?:chapter-\d+|render-verse)\.js)?$/.test(url.pathname)
    ) {
      if (!await hasSession(request, env)) {
        return url.pathname === '/reader/' ? redirect('/') : new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/reader/index.html') return redirect('/reader/');
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    }

    return new Response(null, { status: 404 });
  }
};

async function authenticate(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return landing('register', 'Invalid account form.', 400);
  }
  const email = form.get('email');
  const password = form.get('password');
  const intent = form.get('intent');
  if (!['login', 'register'].includes(intent)) return landing('register', 'Invalid account form.', 400);
  const unavailable = intent === 'register' ? 'Registration is temporarily unavailable.' : 'Sign-in is temporarily unavailable.';
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.BIBLE_SESSION_SECRET || !env.AUTH_LIMITER) {
    return landing(intent, unavailable, 503);
  }
  const rate = await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!rate.success) return landing(intent, 'Please wait before trying again.', 429);
  if (typeof email !== 'string' || email.length > 254 || !email.includes('@') ||
      typeof password !== 'string' || !password.length || password.length > 256) return landing(intent, 'Enter a valid email and password.', 400);
  if (intent === 'register' && password.length < 8) return landing(intent, 'Choose a password with at least eight characters.', 400);

  let authResponse;
  let auth;
  try {
    authResponse = await providerAuth(env, '/auth/v1/token?grant_type=password', email, password);
    auth = await authResponse.json();
  } catch {
    return landing(intent, unavailable, 503);
  }

  if (authResponse.status === 429) return landing(intent, 'Please wait before trying again.', 429);
  if (!authResponse.ok) {
    const code = auth?.error_code ?? auth?.code;
    if (code === 'email_not_confirmed') {
      return landing(intent, 'Confirm your email before continuing.', 401);
    }
    if (code !== 'invalid_credentials') return landing(intent, unavailable, 503);
    if (intent === 'login') {
      return landing(intent, 'Sign-in failed. Check your email, password, and email confirmation.', 401);
    }
    return registerIdentity(request, env, email, password, unavailable);
  }

  if (!auth?.access_token || !Number.isFinite(auth.expires_in) || auth.expires_in < 1) return landing(intent, unavailable, 503);
  if (!auth.user?.email_confirmed_at || auth.user.is_anonymous) {
    return landing(intent, 'Confirm your email before continuing.', 401);
  }

  let enrolled;
  try {
    enrolled = await bibleAccount(env, auth.access_token, intent === 'register');
  } catch {
    return landing(intent, unavailable, 503);
  }
  if (!enrolled) return landing('register', 'Create an AdigunBible account before signing in.', 403);

  const ttl = Math.floor(Math.min(sessionSeconds, auth.expires_in));
  const payload = `${Math.floor(Date.now() / 1000) + ttl}.${crypto.randomUUID()}`;
  const signature = await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload));
  return redirect('/reader/', cookie(`${payload}.${hex(signature)}`, ttl));
}

async function providerAuth(env, endpoint, email, password) {
  return fetch(new URL(endpoint, env.SUPABASE_URL), {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000)
  });
}

async function registerIdentity(request, env, email, password, unavailable) {
  try {
    const signup = new URL('/auth/v1/signup', env.SUPABASE_URL);
    signup.searchParams.set('redirect_to', new URL('/', request.url).href);
    const response = await providerAuth(env, signup, email, password);
    const result = await response.json();
    const code = result?.error_code ?? result?.code;
    if (response.status === 429) return landing('register', 'Please wait before trying again.', 429);
    if (code === 'weak_password') return landing('register', 'Choose a stronger password and try again.', 400);
    if (!result || (!response.ok && !['user_already_exists', 'email_exists'].includes(code))) {
      return landing('register', unavailable, 503);
    }
    return landing('register', 'Check your email for a confirmation link. After confirming, return and select Create account to finish.');
  } catch {
    return landing('register', unavailable, 503);
  }
}

async function bibleAccount(env, accessToken, enroll) {
  const prefix = env.PRODUCT_ACCOUNT_PREFIX;
  if (!['adigunbible', 'adigunbible_preview'].includes(prefix)) throw new Error('Product accounts are unavailable');
  const operation = enroll ? 'register_account' : 'has_account';
  const response = await fetch(new URL(`/rest/v1/rpc/${prefix}_${operation}`, env.SUPABASE_URL), {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: '{}',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Product accounts are unavailable');
  const result = await response.json();
  if (typeof result !== 'boolean') throw new Error('Malformed product account response');
  return result;
}

async function hasSession(request, env) {
  if (!env.BIBLE_SESSION_SECRET) return false;
  const value = request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!value || !/^\d{10}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(value)) return false;
  const [expires, id, mac] = value.split('.');
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const signature = Uint8Array.from(mac.match(/../g), pair => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', await key(env), signature, encoder.encode(`${expires}.${id}`));
}

function key(env) {
  return crypto.subtle.importKey('raw', encoder.encode('adigunbible-enrolled:' + env.BIBLE_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(value, age) {
  return `${cookieName}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}

function redirect(location, sessionCookie) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  if (sessionCookie) headers.set('Set-Cookie', sessionCookie);
  return new Response(null, { status: 303, headers });
}

function landing(intent = 'register', message = '', status = 200) {
  const registration = intent === 'register';
  const action = registration ? 'Create account' : 'Sign in';
  const help = registration
    ? 'Already have an account? <a href="/sign-in">Sign in</a>'
    : 'New to AdigunBible? <a href="/">Create account</a>';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdigunBible</title>
<style>body{margin:0;background:#111827;color:#f8fafc;font:1rem system-ui}main{max-width:35rem;margin:auto;padding:clamp(2rem,7vw,6rem) 1.25rem}h1{color:#f9d477;font-size:clamp(2.7rem,8vw,4.5rem);margin:0}p{line-height:1.65}form{display:grid;gap:.8rem;margin-top:2rem}input,button{font:inherit;padding:.7rem;border-radius:.4rem}button{background:#f9d477;color:#111827;border:0;cursor:pointer}label{display:grid;gap:.35rem}a{color:#f9d477}</style></head>
<body><main><h1>AdigunBible</h1><p>Explore Scripture in an interactive, multilingual reader from HB Evangelist.</p><h2>${action}</h2>${message ? `<p role="status">${message}</p>` : ''}
<form method="post" action="/session"><label>Email<input type="email" name="email" required autocomplete="email" maxlength="254"></label><label>Password<input type="password" name="password" required maxlength="256" autocomplete="${registration ? 'new-password' : 'current-password'}"${registration ? ' minlength="8"' : ''}></label><button name="intent" value="${intent}">${action}</button></form><p>${help}</p></main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

