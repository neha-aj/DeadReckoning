/* Offline identity. No server: every survivor's ID is a cryptographic key pair made on the phone.
   - Survivor ID  = fingerprint of the public key (DR-XXXX-XXXX). Cannot be faked without the private key.
   - Private key  = encrypted with the PIN (PBKDF2 + AES-GCM) and stored only on this phone.
   - Every post / alert is signed, so other phones can verify who wrote it, offline.
   - Several people can share one phone: each account has its own isolated data. */
(function () {
  const DR = window.DR = window.DR || {};
  const acc = DR.account = {};
  const A_KEY = 'dr-accounts', S_KEY = 'dr-session';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  acc.b64 = b64; acc.unb64 = unb64;

  const read = (store, k, d) => { try { return JSON.parse(store.getItem(k)) ?? d; } catch (e) { return d; } };
  acc.list = () => read(localStorage, A_KEY, []);
  const saveList = l => localStorage.setItem(A_KEY, JSON.stringify(l));
  const session = read(sessionStorage, S_KEY, null);
  acc.current = session && acc.list().find(a => a.id === session.id) || null;
  acc.crypto = !!(window.crypto && crypto.subtle);

  acc.fingerprint = async pubRaw => {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', pubRaw));
    let bits = '', out = '';
    for (let i = 0; i < 5; i++) bits += h[i].toString(2).padStart(8, '0');
    for (let i = 0; i < 40; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
    return `DR-${out.slice(0, 4)}-${out.slice(4)}`;
  };
  const pinKey = async (pin, salt) => {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  };
  acc.newKeys = async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
    return { kp, pub: b64(pubRaw), id: await acc.fingerprint(pubRaw), privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  };

  acc.register = async f => {
    if (!acc.crypto) throw new Error('This browser has no secure crypto. Open the app over https or localhost.');
    if (!/^\d{4,6}$/.test(f.pin)) throw new Error('PIN must be 4 to 6 digits.');
    if (!f.name.trim()) throw new Error('Enter your name.');
    const k = await acc.newKeys();
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pinKey(f.pin, salt), enc.encode(JSON.stringify(k.privJwk)));
    const a = {
      id: k.id, pub: k.pub, name: f.name.trim().slice(0, 24), partner: (f.partner || '').trim().slice(0, 24),
      blood: f.blood || '', medical: (f.medical || '').slice(0, 120), contact: (f.contact || '').slice(0, 60),
      salt: b64(salt), iv: b64(iv), priv: b64(ct), created: Date.now(),
    };
    saveList(acc.list().concat(a));
    sessionStorage.setItem(S_KEY, JSON.stringify({ id: a.id, jwk: k.privJwk }));
    return a;
  };
  acc.login = async (id, pin) => {
    const a = acc.list().find(x => x.id === id);
    if (!a) throw new Error('No such survivor on this phone.');
    let jwk;
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(a.iv) }, await pinKey(pin, unb64(a.salt)), unb64(a.priv));
      jwk = JSON.parse(dec.decode(pt));
    } catch (e) { throw new Error('Wrong PIN.'); }
    sessionStorage.setItem(S_KEY, JSON.stringify({ id: a.id, jwk }));
    return a;
  };
  acc.logout = () => { sessionStorage.removeItem(S_KEY); location.reload(); };
  acc.update = patch => {
    const l = acc.list(), i = l.findIndex(x => x.id === acc.current.id);
    Object.assign(l[i], patch); saveList(l); Object.assign(acc.current, patch);
  };
  acc.remove = id => { saveList(acc.list().filter(a => a.id !== id)); localStorage.removeItem('dead-reckoning-v1:' + id); };

  // ---------- signing ----------
  let privKey = null;
  const pubCache = new Map();
  acc.sign = async text => {
    if (!privKey) privKey = await crypto.subtle.importKey('jwk', session.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(text)));
  };
  // a key you hold for someone else (demo survivors)
  acc.signWith = async (jwk, text) => {
    const k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, enc.encode(text)));
  };
  // valid = signature checks out AND the ID really is the fingerprint of that key
  acc.verify = async (id, pub, text, sig) => {
    try {
      if (!pubCache.has(pub)) {
        const raw = unb64(pub);
        pubCache.set(pub, { key: await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']), id: await acc.fingerprint(raw) });
      }
      const c = pubCache.get(pub);
      return c.id === id && await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, c.key, unb64(sig), enc.encode(text));
    } catch (e) { return false; }
  };
})();
