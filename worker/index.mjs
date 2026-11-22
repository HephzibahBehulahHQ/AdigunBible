const cookieName = '__Host-adigunbible-password-session';
const encoder = new TextEncoder();
const sessionSeconds = 3600;
const challengeName = '__Host-adigunbible-email-check';
const challengeSeconds = 600;
const guestCookie = '__Host-adigunbible-trial';
const guestDurationMs = 240000;
const guestCookieAge = 60 * 60 * 24 * 365;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.pathname === '/') {
        const expires = await guestExpiry(request, env);
        const expired = expires !== null && expires <= Date.now();
        return landing('register', expired ? 'Your four-minute trial ended. Create an account or sign in to continue.' : '', 200, false, undefined, !expired);
      }
      if (url.pathname === '/sign-in') return landing('login');
    }

    if (url.pathname === '/try' && request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      if (await hasSession(request, env)) return redirect('/reader/');
      if (!env.BIBLE_SESSION_SECRET) return landing('register', 'Guest access is temporarily unavailable.', 503);
      const previousExpiry = await guestExpiry(request, env);
      if (previousExpiry !== null) return redirect(previousExpiry > Date.now() ? '/reader/' : '/');
      const expiry = Date.now() + guestDurationMs;
      const payload = `${expiry}.${crypto.randomUUID()}`;
      const mac = await crypto.subtle.sign('HMAC', await key(env), encoder.encode('guest:' + payload));
      return redirect('/reader/', [namedCookie(guestCookie, `${payload}.${hex(mac)}`, guestCookieAge)]);
    }

    if (['/session', '/verify-email'].includes(url.pathname) && request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      return authenticate(request, env, url.pathname === '/verify-email');
    }

    if (url.pathname === '/sign-out' && request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 });
      return redirect('/', [cookie('', 0), namedCookie(challengeName, '', 0)]);
    }

    if (
      ['GET', 'HEAD'].includes(request.method) &&
      /^\/reader\/(?:index\.html|(?:Matthew|Mark|Luke|John)\/(?:chapter-\d+|render-verse)\.js)?$/.test(url.pathname)
    ) {
      const signedIn = await hasSession(request, env);
      const expires = signedIn ? null : await guestExpiry(request, env);
      if (!signedIn && (expires === null || expires <= Date.now())) {
        return url.pathname === '/reader/' ? redirect('/') : new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
      if (url.pathname === '/reader/index.html') return redirect('/reader/');
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (!signedIn && expires <= Date.now()) {
        return url.pathname === '/reader/' ? redirect('/') : new Response(null, { status: 401, headers });
      }
      const reader = new Response(response.body, { status: response.status, headers });
      if (!signedIn && request.method === 'GET' && url.pathname === '/reader/' && reader.ok) {
        return guestReader(reader, expires - Date.now());
      }
      return reader;
    }

    return new Response(null, { status: 404 });
  }
};

async function guestExpiry(request, env) {
  if (!env.BIBLE_SESSION_SECRET) return null;
  const value = readCookie(request, guestCookie);
  if (!value || !/^\d{13}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(value)) return null;
  const [expires, id, mac] = value.split('.');
  const valid = await crypto.subtle.verify('HMAC', await key(env), hexBytes(mac), encoder.encode(`guest:${expires}.${id}`));
  return valid ? Number(expires) : null;
}

function guestReader(response, milliseconds) {
  const script = `<script>(() => {
    const duration = ${Math.max(0, milliseconds)};
    const wallDeadline = Date.now() + duration;
    const monotonicDeadline = performance.now() + duration;
    function checkTrial() {
      const remaining = Math.min(wallDeadline - Date.now(), monotonicDeadline - performance.now());
      if (remaining > 0) {
        const seconds = Math.ceil(remaining / 1000);
        const clock = document.getElementById('adigunbible-trial-clock');
        if (clock) clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
        return;
      }
      window.stop();
      document.documentElement.replaceChildren();
      window.location.replace('/');
    }
    setTimeout(checkTrial, duration);
    setInterval(checkTrial, 250);
    document.addEventListener('visibilitychange', checkTrial);
    window.addEventListener('pageshow', checkTrial);
    window.addEventListener('focus', checkTrial);
  })()</script>`;
  return new HTMLRewriter()
    .on('head', { element(head) { head.prepend(script, { html: true }); } })
    .on('body', { element(body) {
      body.prepend('<aside aria-label="Guest access" style="padding:0.65rem 1rem;background:#1f2937;color:#fff;font:1rem system-ui">Guest access · <span id="adigunbible-trial-clock">4:00</span> remaining · <a style="color:#f9d477" href="/">Create account</a> · <a style="color:#f9d477" href="/sign-in">Sign in</a></aside>', { html: true });
    } })
    .on('form[action="/sign-out"]', { element(form) { form.remove(); } })
    .transform(response);
}

async function authenticate(request, env, verify) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.BIBLE_SESSION_SECRET ||
      !env.BIBLE_ACTIVATION_SECRET || !env.AUTH_LIMITER) {
    return landing('register', 'Account service is temporarily unavailable.', 503);
  }
  const rate = await env.AUTH_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!rate.success) return landing('register', 'Please wait before trying again.', 429);

  let form;
  try {
    form = await request.formData();
  } catch {
    return landing('register', 'Invalid account form.', 400);
  }
  const intent = form.get('intent');
  if (!['login', 'register'].includes(intent)) return landing('register', 'Invalid account form.', 400);

  try {
    if (!verify) {
      const email = typeof form.get('email') === 'string' ? form.get('email').trim().toLowerCase() : '';
      const password = form.get('password');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return landing(intent, 'Enter a valid email address.', 400);
      }
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
        return landing(intent, 'Enter a password between 12 and 256 characters.', 400);
      }
      const emailKey = hex(await crypto.subtle.sign('HMAC', await key(env), encoder.encode('limit:' + email)));
      if (!(await env.AUTH_LIMITER.limit({ key: emailKey })).success) {
        return landing(intent, 'Please wait before trying again.', 429);
      }
      const passwordProof = await productPasswordProof(env, email, password);
      if (intent === 'login' && !await bibleAccount(env, 'password_sign_in', { email_address: email, password_proof: passwordProof })) {
        return landing('login', 'Check your AdigunBible email and password, or create an account first.', 401);
      }
      const response = await providerRequest(env, '/auth/v1/otp', { email, create_user: intent === 'register' });
      if (response.status === 429) return landing(intent, 'Please wait before requesting another code.', 429);
      if (!response.ok) return landing(intent, 'Could not send a code. Please try again.', 503);
      const challenge = await makeChallenge(env, email, passwordProof, intent);
      return landing(intent, '', 200, true, namedCookie(challengeName, challenge, challengeSeconds));
    }

    const challenge = await readChallenge(request, env);
    if (!challenge || challenge.intent !== intent) return landing(intent, 'Request a new email code.', 400);
    const token = form.get('code');
    if (typeof token !== 'string' || !/^\d{6,10}$/.test(token)) {
      return landing(intent, 'Enter the numeric code from your email.', 400, true);
    }
    const response = await providerRequest(env, '/auth/v1/verify', { email: challenge.email, token, type: 'email' });
    if (response.status === 429) return landing(intent, 'Please wait before trying another code.', 429, true);
    if (response.status >= 500) return landing(intent, 'Code verification is temporarily unavailable.', 503, true);
    if (!response.ok) return landing(intent, 'That code is incorrect or expired.', 401, true);
    const auth = await response.json();
    if (!auth?.access_token || !auth.user?.email_confirmed_at || auth.user.is_anonymous ||
        auth.user.email?.toLowerCase() !== challenge.email || !Number.isFinite(auth.expires_in) || auth.expires_in < 1) {
      return landing(intent, 'Code verification is temporarily unavailable.', 503, true);
    }

    const credentials = { email_address: challenge.email, password_proof: challenge.passwordProof };
    const clearChallenge = namedCookie(challengeName, '', 0);
    if (intent === 'register') {
      const account = await bibleAccount(env, 'activate_password_account', credentials, auth.access_token);
      if (!account) return landing('login', 'This email could not be activated. If you already registered, sign in.', 409, false, clearChallenge);
      return landing('login', 'Your AdigunBible account is active. Sign in with your AdigunBible password.', 200, false, clearChallenge);
    }
    if (!await bibleAccount(env, 'password_sign_in', credentials)) {
      return landing('login', 'Check your AdigunBible email and password.', 401, false, clearChallenge);
    }
    const ttl = Math.floor(Math.min(sessionSeconds, auth.expires_in));
    const payload = `${Math.floor(Date.now() / 1000) + ttl}.${crypto.randomUUID()}`;
    const signature = await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload));
    return redirect('/reader/', [cookie(`${payload}.${hex(signature)}`, ttl), clearChallenge]);
  } catch {
    return landing(intent, 'Account service is temporarily unavailable.', 503, verify);
  }
}

function providerRequest(env, path, body, authorization) {
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = 'Bearer ' + authorization;
  return fetch(new URL(path, env.SUPABASE_URL), {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
}

async function bibleAccount(env, operation, body, accessToken) {
  const prefix = env.PRODUCT_ACCOUNT_PREFIX;
  if (!['adigunbible', 'adigunbible_preview'].includes(prefix)) throw new Error('Product accounts are unavailable');
  const response = await providerRequest(env, `/rest/v1/rpc/${prefix}_${operation}`, {
    ...body, activation_proof: env.BIBLE_ACTIVATION_SECRET
  }, accessToken);
  if (!response.ok) throw new Error('Product accounts are unavailable');
  const result = await response.json();
  if (typeof result !== 'boolean') throw new Error('Malformed product account response');
  return result;
}

async function productPasswordProof(env, email, password) {
  const scopedKey = await crypto.subtle.importKey('raw', encoder.encode('adigunbible-password-pepper:' + env.BIBLE_SESSION_SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', scopedKey, encoder.encode(JSON.stringify([email, password]))));
}

async function challengeKey(env) {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode('adigunbible-password-challenge:' + env.BIBLE_SESSION_SECRET));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function makeChallenge(env, email, passwordProof, intent) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify({email, passwordProof, intent, expires: Date.now() + challengeSeconds * 1000}));
  const sealed = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await challengeKey(env), data);
  return `${hex(iv)}.${hex(sealed)}`;
}

async function readChallenge(request, env) {
  const value = readCookie(request, challengeName);
  if (!value || !/^[0-9a-f]{24}\.[0-9a-f]{2,2048}$/.test(value)) return null;
  const [iv, sealed] = value.split('.');
  try {
    const data = await crypto.subtle.decrypt({name: 'AES-GCM', iv: hexBytes(iv)}, await challengeKey(env), hexBytes(sealed));
    const challenge = JSON.parse(new TextDecoder().decode(data));
    return challenge.expires > Date.now() ? challenge : null;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}

function hexBytes(mac) {
  return Uint8Array.from(mac.match(/../g), pair => parseInt(pair, 16));
}

async function hasSession(request, env) {
  if (!env.BIBLE_SESSION_SECRET) return false;
  const value = readCookie(request, cookieName);
  if (!value || !/^\d{10}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(value)) return false;
  const [expires, id, mac] = value.split('.');
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const signature = hexBytes(mac);
  return crypto.subtle.verify('HMAC', await key(env), signature, encoder.encode(`${expires}.${id}`));
}

function key(env) {
  return crypto.subtle.importKey('raw', encoder.encode('adigunbible-password:' + env.BIBLE_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function hex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(value, age) {
  return namedCookie(cookieName, value, age);
}

function namedCookie(name, value, age) {
  return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}

function redirect(location, sessionCookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of sessionCookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function landing(intent = 'register', message = '', status = 200, verify = false, setCookie, offerGuest = false) {
  const registration = intent === 'register';
  const action = registration ? 'Create account' : 'Sign in';
  const help = registration
    ? 'Already have an account? <a href="/sign-in">Sign in</a>'
    : 'New to AdigunBible? <a href="/">Create account</a>';
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff'
  });
  if (setCookie) headers.set('Set-Cookie', setCookie);
  const form = verify
    ? `<form method="post" action="/verify-email"><label>Email code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" required></label><button name="intent" value="${intent}">Verify code</button></form><p>Didn't get a code? <a href="${registration ? '/' : '/sign-in'}">Request another</a></p>`
    : `<form method="post" action="/session"><label>Email<input type="email" name="email" required autocomplete="email" maxlength="254"></label><label>AdigunBible password<input type="password" name="password" minlength="12" maxlength="256" autocomplete="${registration ? 'new-password' : 'current-password'}" required></label><button name="intent" value="${intent}">${action}</button></form><p>${help}</p>`;
  const instruction = verify ? 'Enter the one-time code from your email.' : registration ? 'Choose a separate password for AdigunBible. We’ll email you a code to activate your account.' : 'Enter your AdigunBible password. We’ll then email you a fresh sign-in code.';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AdigunBible</title>
<style>body{margin:0;background:#111827;color:#f8fafc;font:1rem system-ui}main{max-width:35rem;margin:auto;padding:clamp(2rem,7vw,6rem) 1.25rem}h1{color:#f9d477;font-size:clamp(2.7rem,8vw,4.5rem);margin:0}p{line-height:1.65}form{display:grid;gap:.8rem;margin-top:2rem}input,button{font:inherit;padding:.7rem;border-radius:.4rem}button{background:#f9d477;color:#111827;border:0;cursor:pointer}label{display:grid;gap:.35rem}a{color:#f9d477}</style></head>
<body><main><h1>AdigunBible</h1><p>Explore Scripture in an interactive, multilingual reader from HB Evangelist.</p><h2>${action}</h2><p>${instruction}</p>${message ? `<p role="status">${message}</p>` : ''}${form}${offerGuest ? '<form method="post" action="/try"><button>Try the reader for four minutes</button></form>' : ''}</main></body></html>`, { status, headers });
}
