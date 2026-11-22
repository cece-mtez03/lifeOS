/* Planet Me · inicio de sesión con Google y sincronización (Firebase)
   Si firebase-config.js vale null, no hace nada y la app funciona solo en este dispositivo. */
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const UID_KEY = 'lifeos-sync-uid';
const BACKUP_KEY = 'lifeos-backup-before-sync';
const LISTS = ['tasks', 'activities', 'events', 'spaces', 'routines', 'dump'];

const state = { configured: false, ready: false, loading: true, user: null, status: 'idle', lastSync: 0, error: '', info: '', conflict: false };
const emit = () => window.dispatchEvent(new Event('lifesync'));
const Sync = { state, push() {}, async signIn() {}, async signOut() {}, async resolve() {}, async deleteCloud() {} };
window.LifeSync = Sync;

const app = () => window.LifeApp;
const stamp = d => (d && d.meta && d.meta.updatedAt) || 0;
const noMeta = d => JSON.stringify({ ...d, meta: 0 });

function friendlyAuth(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/unauthorized-domain') return 'Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (c === 'auth/operation-not-allowed') return 'El acceso con Google no está activado en Firebase (Authentication → Método de acceso).';
  if (c === 'auth/network-request-failed') return 'Sin conexión. Inténtalo de nuevo cuando vuelvas a tener internet.';
  return `No se ha podido iniciar sesión${c ? ' (' + c + ')' : ''}.`;
}
function friendlyDb(e) {
  const c = (e && e.code) || '';
  if (c === 'permission-denied') return 'Firebase ha rechazado el acceso: revisa las reglas de Firestore.';
  if (c === 'unavailable') return 'Sin conexión con el servidor de Google.';
  return `Error al sincronizar${c ? ' (' + c + ')' : ''}.`;
}
function merge(local, cloud) { // une por id; si un elemento está en ambos, gana el de la nube
  const out = JSON.parse(JSON.stringify(cloud));
  for (const k of LISTS) {
    out[k] = Array.isArray(out[k]) ? out[k] : [];
    const seen = new Set(out[k].map(x => String(x.id)));
    for (const x of local[k] || []) if (!seen.has(String(x.id))) out[k].push(x);
  }
  return out;
}

async function main() {
  let cfg = null;
  try { cfg = (await import('./firebase-config.js')).default; } catch { /* sin configuración */ }
  if (!cfg || !cfg.apiKey) { state.loading = false; emit(); return; }
  state.configured = true;

  let A, F, auth, db;
  try {
    [A, F] = await Promise.all([import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    const { initializeApp } = await import(SDK + 'firebase-app.js');
    const fb = initializeApp(cfg);
    auth = A.getAuth(fb);
    try { db = F.initializeFirestore(fb, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
    catch { db = F.getFirestore(fb); }
  } catch {
    state.loading = false; state.error = 'No se ha podido cargar el servicio de Google (¿sin conexión?).'; emit(); return;
  }
  state.ready = true;

  let ref = null, unsub = null, timer = null, dirty = false;
  const parse = d => {
    try { const o = JSON.parse(d.json); o.meta = { updatedAt: d.updatedAt || stamp(o) }; return o; } catch { return null; }
  };
  const stopListening = () => { if (unsub) { unsub(); unsub = null; } };

  async function upload() {
    if (!ref || state.conflict) return;
    timer = null;
    if (!navigator.onLine) { dirty = true; state.status = 'offline'; emit(); return; }
    const d = app().get();
    const updatedAt = stamp(d) || Date.now();
    try {
      await F.setDoc(ref, { json: JSON.stringify(d), updatedAt, v: 1 });
      dirty = false; state.status = 'ok'; state.lastSync = Date.now(); state.error = '';
    } catch (e) { state.status = 'error'; state.error = friendlyDb(e); }
    emit();
  }
  Sync.push = () => {
    if (!ref || state.conflict) return;
    clearTimeout(timer); state.status = 'syncing'; emit();
    timer = setTimeout(upload, 800);
  };
  window.addEventListener('online', () => { if (dirty) upload(); });

  function listen() {
    stopListening();
    unsub = F.onSnapshot(ref, snap => {
      if (snap.metadata.hasPendingWrites || !snap.exists() || state.conflict) return;
      const cloud = parse(snap.data());
      if (cloud && stamp(cloud) > stamp(app().get())) {
        app().apply(cloud); state.status = 'ok'; state.lastSync = Date.now(); state.error = ''; emit();
      }
    }, e => { state.status = 'error'; state.error = friendlyDb(e); emit(); });
  }

  const backupLocal = () => { try { localStorage.setItem(BACKUP_KEY, JSON.stringify(app().get())); } catch { /* sin espacio */ } };

  async function start(uid) {
    state.status = 'syncing'; state.error = ''; state.conflict = false; emit();
    ref = F.doc(db, 'users', uid);
    let snap;
    try { snap = await F.getDoc(ref); } catch (e) { state.status = 'error'; state.error = friendlyDb(e); emit(); ref = null; return; }
    const local = app().get();
    const cloud = snap.exists() ? parse(snap.data()) : null;
    let knownDevice = false;
    try { knownDevice = localStorage.getItem(UID_KEY) === uid; } catch { /* ignorar */ }

    if (!snap.exists() || (snap.exists() && !cloud)) {
      await upload();
    } else if (app().pristine()) {
      app().apply(cloud); state.status = 'ok'; state.lastSync = Date.now();
    } else if (noMeta(local) === noMeta(cloud)) {
      state.status = 'ok'; state.lastSync = Date.now();
    } else if (knownDevice) { // este dispositivo ya estaba sincronizado con esta cuenta: gana lo más reciente
      if (stamp(cloud) > stamp(local)) { backupLocal(); app().apply(cloud); state.status = 'ok'; state.lastSync = Date.now(); }
      else await upload();
    } else {
      state.conflict = true; state.status = 'idle';
    }
    try { localStorage.setItem(UID_KEY, uid); } catch { /* ignorar */ }
    listen(); emit();
  }

  Sync.signIn = async () => {
    state.error = ''; state.info = ''; emit();
    const provider = new A.GoogleAuthProvider();
    try { await A.signInWithPopup(auth, provider); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        try { await A.signInWithRedirect(auth, provider); return; } catch (e2) { e = e2; }
      }
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') state.error = friendlyAuth(e);
      emit();
    }
  };

  Sync.resolve = async choice => {
    if (!ref || !state.conflict) return;
    let cloud;
    try { cloud = parse((await F.getDoc(ref)).data()); } catch (e) { state.error = friendlyDb(e); emit(); return; }
    if (!cloud) { state.error = 'No se han podido leer los datos de la nube.'; emit(); return; }
    backupLocal();
    const local = JSON.parse(JSON.stringify(app().get()));
    const next = choice === 'cloud' ? cloud : choice === 'local' ? local : merge(local, cloud);
    if (choice !== 'cloud') next.meta = { updatedAt: Math.max(Date.now(), stamp(cloud) + 1) };
    state.conflict = false;
    app().apply(next);
    if (choice !== 'cloud') await upload(); else { state.status = 'ok'; state.lastSync = Date.now(); }
    emit();
  };

  Sync.signOut = async clearLocal => {
    if (ref && !state.conflict && timer) { clearTimeout(timer); await upload(); }
    if (clearLocal && (state.conflict || state.status !== 'ok')) {
      clearLocal = false; // quedan cambios sin subir: no se borra nada de este dispositivo
      state.error = 'No se han borrado los datos de este dispositivo porque tenían cambios sin subir a la nube.';
    }
    stopListening(); ref = null;
    await A.signOut(auth);
    if (clearLocal) { try { localStorage.removeItem(UID_KEY); } catch { /* ignorar */ } app().reset(); }
    emit();
  };

  Sync.deleteCloud = async () => {
    if (!ref) return;
    stopListening(); clearTimeout(timer);
    try { await F.deleteDoc(ref); } catch (e) { state.error = friendlyDb(e); emit(); listen(); return; }
    ref = null;
    try { localStorage.removeItem(UID_KEY); } catch { /* ignorar */ }
    await A.signOut(auth);
    state.info = 'Se han borrado tus datos de la nube.'; emit();
  };

  A.getRedirectResult(auth).catch(e => { state.error = friendlyAuth(e); emit(); });
  A.onAuthStateChanged(auth, async user => {
    state.loading = false;
    state.user = user ? { uid: user.uid, name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' } : null;
    stopListening(); ref = null;
    if (user) await start(user.uid);
    else { state.status = 'idle'; state.conflict = false; }
    emit();
  });
}
main().catch(() => { state.loading = false; emit(); });
