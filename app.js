'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'lifeos-v1';
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ENERGY = ['Baja', 'Media', 'Alta'];
const COLORS = ['#d9e8d3', '#f3e2c7', '#e1dcef', '#f2d9d6', '#d3e6ea', '#eadfc9'];
const MIN_GAP = 30; // minutos mínimos para contar como hueco libre

const initial = {
  tasks: [],
  spaces: [],
  routines: [],
  events: [],
  settings: { dayStart: '08:00', dayEnd: '22:00' },
  activities: [
    { id: 1, name: 'Murdoku', stack: 'Sofá', minutes: 20, energy: 'Baja', tags: 'sin preparar, sofá' },
    { id: 2, name: 'Leer un capítulo', stack: 'Desconexión', minutes: 30, energy: 'Baja', tags: 'sofá, tranquilo' },
    { id: 3, name: 'Colorear por números', stack: 'Creatividad', minutes: 40, energy: 'Media', tags: 'creativo, sentado' },
    { id: 4, name: 'Ver una serie', stack: 'Sofá', minutes: 45, energy: 'Baja', tags: 'sofá, sin preparar' }
  ]
};

/* ---------- Datos ---------- */
function normalize(raw) {
  const d = Object.assign(structuredClone(initial), raw && typeof raw === 'object' ? raw : {});
  ['tasks', 'activities', 'events', 'spaces', 'routines'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  d.settings = Object.assign({ dayStart: '08:00', dayEnd: '22:00' }, d.settings);
  return d;
}
let data;
try { data = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { data = normalize(null); }
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const same = (a, b) => String(a) === String(b);
const byId = (arr, id) => arr.find(x => same(x.id, id));

/* ---------- Utilidades de fecha ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmtMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const dur = m => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${m} min`; };
const today = () => ymd(new Date());
const fmtDate = s => s ? parseYmd(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const opts = (list, sel) => list.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

/* ---------- Estado de interfaz ---------- */
const ui = { view: 'today', calSettings: false, editActivity: null, weekOffset: 0 };

function page(view) {
  ui.view = view;
  render();
  window.scrollTo({ top: 0 });
}
function render() {
  $$('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  ({ today: renderHome, tasks: renderTasks, calendar: renderCalendar, brain: renderBrain, space: renderSpace }[ui.view] || renderHome)();
}
const head = (t, sub) => `<p class="eyebrow">LIFEOS</p><h1 class="view-title">${t}</h1><p class="view-intro">${sub}</p>`;

/* ---------- Calendario: cálculo de bloques y huecos ---------- */
function dayInfo(ds) {
  const dow = parseYmd(ds).getDay();
  const blocks = [], allDay = [];
  data.routines.forEach(r => {
    if (r.days.includes(dow)) blocks.push({ s: toMin(r.start), e: toMin(r.end), name: r.name, kind: 'routine', id: r.id });
  });
  data.events.forEach(ev => {
    if (ev.date !== ds) return;
    if (ev.allDay) { allDay.push(ev); return; }
    const s = toMin(ev.time);
    const e = ev.end && toMin(ev.end) > s ? toMin(ev.end) : Math.min(s + 60, 1439);
    blocks.push({ s, e, name: ev.name, kind: 'event', id: ev.id });
  });
  blocks.sort((a, b) => a.s - b.s);
  const ws = toMin(data.settings.dayStart), we = toMin(data.settings.dayEnd);
  const free = [];
  let cursor = ws;
  for (const b of blocks) {
    if (b.s - cursor >= MIN_GAP) free.push({ s: cursor, e: Math.min(b.s, we) });
    cursor = Math.max(cursor, b.e);
  }
  if (we - cursor >= MIN_GAP) free.push({ s: cursor, e: we });
  const freeClean = free.filter(f => f.e - f.s >= MIN_GAP);
  const slots = [...blocks, ...freeClean.map(f => ({ ...f, kind: 'free' }))].sort((a, b) => a.s - b.s || (a.kind === 'free') - (b.kind === 'free'));
  return { slots, allDay, freeTotal: freeClean.reduce((t, f) => t + f.e - f.s, 0) };
}
function slotHtml(x) {
  const label = `<b>${fmtMin(x.s)}–${fmtMin(x.e)}</b>`;
  if (x.kind === 'free') return `<div class="slot free">${label}<span>Libre · ${dur(x.e - x.s)}</span></div>`;
  const del = x.kind === 'event' ? `<button class="icon-btn" data-act="del-event" data-id="${esc(x.id)}" aria-label="Eliminar plan">×</button>` : '';
  return `<div class="slot ${x.kind}">${label}<span>${esc(x.name)}</span>${del}</div>`;
}

/* ---------- Mi día ---------- */
function taskRow(t, showSpace = true) {
  const sp = byId(data.spaces, t.spaceId);
  return `<div class="item"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Hecha">
    <span class="${t.done ? 'done' : ''}">${esc(t.name)}</span>
    ${sp && showSpace ? `<span class="pill" style="background:${sp.color}">${esc(sp.name)}</span>` : ''}
    <small>${fmtDate(t.date)}</small>
    <button class="icon-btn" data-act="del-task" data-id="${esc(t.id)}" aria-label="Eliminar tarea">×</button></div>`;
}
/* Sugerencias para los huecos libres de hoy */
function suggestionsForToday(info, nowMin) {
  const usedTasks = new Set(), usedActs = new Set();
  const ts = today();
  const pending = data.tasks.filter(t => !t.done)
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const out = [];
  for (const f of info.slots.filter(x => x.kind === 'free')) {
    const start = Math.max(f.s, nowMin);
    const len = f.e - start;
    if (len < MIN_GAP) continue;
    const options = [];
    const task = pending.find(t => !usedTasks.has(t.id));
    if (task) {
      usedTasks.add(task.id);
      const sp = byId(data.spaces, task.spaceId);
      const late = task.date && task.date < ts ? ' (atrasada)' : task.date === ts ? ' (para hoy)' : '';
      options.push({ icon: '☷', text: `Avanzar con «${esc(task.name)}»${sp ? ' · ' + esc(sp.name) : ''}${late}` });
    }
    const evening = start >= 20 * 60;
    const acts = data.activities
      .filter(a => a.minutes <= len && !usedActs.has(a.id) && (!evening || a.energy === 'Baja'))
      .sort((a, b) => b.minutes - a.minutes);
    if (acts.length) {
      usedActs.add(acts[0].id);
      options.push({ icon: '✧', text: `${esc(acts[0].name)} <small>(${acts[0].minutes} min · ${esc(acts[0].stack)})</small>` });
    }
    options.push({ icon: '☾', text: len >= 90 ? 'Descansar un rato, un paseo o no hacer nada' : 'Descansar un rato' });
    out.push({ s: start, e: f.e, len, options });
  }
  return out;
}
function renderHome() {
  const d = new Date(), h = d.getHours(), ts = today();
  const greeting = h < 12 ? 'Buenos días.' : h < 20 ? 'Buenas tardes.' : 'Buenas noches.';
  const todays = data.tasks.filter(t => t.date === ts);
  const info = dayInfo(ts);
  const slots = info.slots.filter(x => x.kind !== 'free' || x.e > d.getHours() * 60 + d.getMinutes());
  $('#app').innerHTML = `
    <section class="welcome"><div><p class="eyebrow">${esc(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase())}</p><h1>${greeting}</h1><p class="muted">Un paso cada vez. Lo importante también es vivir.</p></div><div class="sun">✺</div></section>
    <section class="stats">
      <article class="stat"><span class="eyebrow">TAREAS PENDIENTES</span><strong>${data.tasks.filter(t => !t.done).length}</strong><small>Sin prisa, pero sin perderlas</small></article>
      <article class="stat"><span class="eyebrow">TIEMPO LIBRE HOY</span><strong>${dur(info.freeTotal)}</strong><small>Entre tus planes y tu horario</small></article>
    </section>
    <section class="panel">
      <div class="section-head"><div><p class="eyebrow">HOY</p><h2>Tu lista de hoy</h2></div><button class="text-button" data-act="go" data-id="tasks">Ver tareas →</button></div>
      ${todays.length ? todays.map(taskRow).join('') : '<div class="empty">Todavía no has añadido tareas para hoy.</div>'}
    </section>
    <section class="panel">
      <div class="section-head"><div><p class="eyebrow">AGENDA</p><h2>Tu día</h2></div><button class="text-button" data-act="go" data-id="calendar">Ver semana →</button></div>
      ${info.allDay.map(ev => `<div class="slot allday"><b>Todo el día</b><span>${esc(ev.name)}</span></div>`).join('')}
      ${slots.length ? `<div class="slots">${slots.map(slotHtml).join('')}</div>` : '<div class="empty">Nada en la agenda de hoy.</div>'}
    </section>
    <section class="panel">
      <p class="eyebrow">SUGERENCIAS</p><h2>Para tus huecos de hoy</h2>
      ${suggestionsForToday(info, d.getHours() * 60 + d.getMinutes()).map(g => `
        <div class="sugg"><div class="sugg-head"><b>${fmtMin(g.s)}–${fmtMin(g.e)}</b><span>Tienes un hueco libre de ${dur(g.len)}. Podrías:</span></div>
          <ul>${g.options.map((o, i) => `<li><i>${o.icon}</i><span>${i ? 'o ' : ''}${o.text}</span></li>`).join('')}</ul></div>`).join('')
        || '<div class="empty">Hoy no te quedan huecos libres. Disfruta lo que tienes en la agenda.</div>'}
    </section>
    <section class="panel suggestion">
      <div><p class="eyebrow">UNA IDEA PARA TU TIEMPO LIBRE</p><h2>¿Un ratito para ti?</h2><p class="muted">Brain Stack puede ayudarte a elegir algo que encaje con tu tiempo y energía.</p></div>
      <button class="primary" data-act="go" data-id="brain">Buscar un plan ✧</button>
    </section>`;
}

/* ---------- Tareas con espacios ---------- */
function spaceCard(sp) {
  const id = sp ? sp.id : '';
  const list = data.tasks
    .filter(t => sp ? same(t.spaceId, sp.id) : !t.spaceId || !byId(data.spaces, t.spaceId))
    .sort((a, b) => (a.done - b.done) || (a.date || '9999').localeCompare(b.date || '9999'));
  const pend = list.filter(t => !t.done).length;
  const name = sp ? sp.name : 'General';
  const color = sp ? sp.color : '#e6eee6';
  return `<article class="stack-card space-card">
    <div class="space-top"><span class="pill" style="background:${color}">${esc(name)}</span><small>${pend} pendiente${pend === 1 ? '' : 's'}</small></div>
    <h3>${esc(name)}</h3>
    <div class="space-tasks">${list.map(t => taskRow(t, false)).join('') || '<p class="empty small">Sin tareas todavía</p>'}</div>
    <form class="form-row mini" data-form="task-form">
      <input type="hidden" name="space" value="${esc(id)}">
      <input class="field" name="name" placeholder="Nueva tarea…" required aria-label="Nueva tarea">
      <input class="field date" name="date" type="date" value="${today()}" aria-label="Fecha">
      <button class="primary" aria-label="Añadir tarea">+</button>
    </form>
    ${sp ? `<div class="card-actions"><button class="text-button" data-act="rename-space" data-id="${esc(sp.id)}">Renombrar</button><button class="text-button danger" data-act="del-space" data-id="${esc(sp.id)}">Eliminar</button></div>` : ''}
  </article>`;
}
function renderTasks() {
  const loose = data.tasks.some(t => !t.spaceId || !byId(data.spaces, t.spaceId));
  $('#app').innerHTML = head('Mis tareas', 'Saca las ideas de tu cabeza y dales un lugar.') + `
    <section class="panel">
      <h2>Crea un espacio</h2>
      <form id="space-form" class="form-row"><input class="field" name="name" placeholder="Ej. Trabajo, Máster, Boda…" required maxlength="40"><button class="primary">Guardar</button></form>
    </section>
    <div class="section-head"><div><p class="eyebrow">TUS ESPACIOS</p><h2>Mis tareas</h2></div></div>
    <div class="stack-grid">${data.spaces.map(spaceCard).join('')}${loose || !data.spaces.length ? spaceCard(null) : ''}</div>`;
}

/* ---------- Calendario ---------- */
function gcalLink(ev) {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.name);
  const d = ev.date.replace(/-/g, '');
  if (ev.allDay) { const n = parseYmd(ev.date); n.setDate(n.getDate() + 1); return `${base}&dates=${d}/${ymd(n).replace(/-/g, '')}`; }
  const e = ev.end && toMin(ev.end) > toMin(ev.time) ? ev.end : fmtMin(Math.min(toMin(ev.time) + 60, 1439));
  return `${base}&dates=${d}T${ev.time.replace(':', '')}00/${d}T${e.replace(':', '')}00`;
}
function renderCalendar() {
  const ts = today();
  const monday = mondayOf(new Date()); monday.setDate(monday.getDate() + ui.weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(x.getDate() + i); return x; });
  const range = `${days[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  const upcoming = data.events.filter(e => e.date >= ts).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 12);
  const importedCount = data.events.filter(e => e.src === 'ics').length;
  $('#app').innerHTML = head('Mi calendario', 'Tu semana de un vistazo, con los huecos que te quedan libres.') + `
    <section class="panel">
      <div class="section-head"><div><p class="eyebrow">SEMANA</p><h2>${esc(range)}</h2></div>
        <div class="week-nav"><button class="text-button" data-act="toggle-settings">⚙ ${ui.calSettings ? 'Cerrar ajustes' : 'Ajustes'}</button><button class="icon-btn" data-act="week-prev" aria-label="Semana anterior">‹</button><button class="text-button" data-act="week-today">Hoy</button><button class="icon-btn" data-act="week-next" aria-label="Semana siguiente">›</button></div></div>
      <div class="week">${days.map(d => {
        const ds = ymd(d), info = dayInfo(ds);
        return `<article class="day ${ds === ts ? 'today' : ''}">
          <header><strong>${esc(d.toLocaleDateString('es-ES', { weekday: 'short' }))}</strong><span>${d.getDate()}</span></header>
          <small class="free-total">Libre: ${dur(info.freeTotal)}</small>
          ${info.allDay.map(ev => `<div class="slot allday"><span>${esc(ev.name)}</span><button class="icon-btn" data-act="del-event" data-id="${esc(ev.id)}" aria-label="Eliminar plan">×</button></div>`).join('')}
          ${info.slots.map(slotHtml).join('') || '<p class="empty small">—</p>'}
        </article>`;
      }).join('')}</div>
    </section>

    ${ui.calSettings ? `
    <section class="panel">
      <p class="eyebrow">HORARIO FIJO</p><h2>Trabajo, clases y rutinas</h2>
      <p class="muted">Lo que se repite cada semana. Se bloquea solo en los días que elijas.</p>
      ${data.routines.map(r => `<div class="item"><span><b>${esc(r.name)}</b></span><small>${WEEK_ORDER.filter(d => r.days.includes(d)).map(d => DAY_SHORT[d]).join(' ')} · ${esc(r.start)}–${esc(r.end)}</small><button class="icon-btn" data-act="del-routine" data-id="${esc(r.id)}" aria-label="Eliminar horario">×</button></div>`).join('') || '<p class="empty">Aún no has añadido ningún horario fijo.</p>'}
      <form id="routine-form" class="form-row">
        <input class="field" name="name" placeholder="Ej. Trabajo" required>
        <input class="field" name="start" type="time" value="09:00" required aria-label="Desde">
        <input class="field" name="end" type="time" value="17:00" required aria-label="Hasta">
        <div class="days">${WEEK_ORDER.map(d => `<label><input type="checkbox" name="day" value="${d}"${d >= 1 && d <= 5 ? ' checked' : ''}><span>${DAY_SHORT[d]}</span></label>`).join('')}</div>
        <button class="primary">Añadir horario</button>
      </form>
    </section>

    <section class="panel">
      <p class="eyebrow">AJUSTES</p><h2>Tu jornada</h2>
      <p class="muted">Los huecos libres se calculan dentro de este margen horario.</p>
      <form id="settings-form" class="form-row">
        <label class="inline">Empiezo a las <input class="field" name="dayStart" type="time" value="${esc(data.settings.dayStart)}" required></label>
        <label class="inline">Termino a las <input class="field" name="dayEnd" type="time" value="${esc(data.settings.dayEnd)}" required></label>
        <button class="primary">Guardar</button>
      </form>
    </section>
    ` : ''}
    <section class="panel">
      <p class="eyebrow">PLANES</p><h2>Añadir un plan</h2>
      <form id="event-form" class="form-row">
        <input class="field" name="name" placeholder="Nombre del plan" required>
        <input class="field" name="date" type="date" value="${ts}" required>
        <input class="field" name="time" type="time" value="17:00" required aria-label="Desde">
        <input class="field" name="end" type="time" value="18:00" required aria-label="Hasta">
        <button class="primary">Añadir</button>
      </form>
      <div class="calendar-list">${upcoming.map(e => `<div class="calendar-event"><b>${fmtDate(e.date)} · ${e.allDay ? 'Todo el día' : esc(e.time) + (e.end ? '–' + esc(e.end) : '')}</b>${esc(e.name)}
        <a class="text-button" href="${esc(gcalLink(e))}" target="_blank" rel="noopener">+ Google</a>
        <button class="icon-btn" data-act="del-event" data-id="${esc(e.id)}" aria-label="Eliminar plan">×</button></div>`).join('') || '<p class="empty">No hay planes próximos.</p>'}</div>
    </section>

    <section class="panel">
      <p class="eyebrow">GOOGLE CALENDAR</p><h2>Traer tu calendario de Google</h2>
      <p class="muted">En <b>calendar.google.com → Configuración → Importar y exportar → Exportar</b> se descarga un .zip. Descomprímelo y sube aquí el archivo .ics de tu calendario. Se importan los eventos de los últimos 60 días en adelante; los que se repiten solo entran con su primera fecha. Cada plan tiene además un botón «+ Google» para enviarlo a tu Google Calendar.</p>
      <label class="primary file-btn">Importar archivo .ics<input type="file" id="import-ics" accept=".ics,text/calendar" hidden></label>
      ${importedCount ? `<button class="text-button danger" data-act="clear-ics">Quitar los ${importedCount} eventos importados</button>` : ''}
      <p class="tiny">Una sincronización automática y continua con Google necesita un servidor y la autorización de tu cuenta; esta versión funciona solo en tu dispositivo.</p>
    </section>`;
}

/* ---------- Importar .ics ---------- */
function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur && cur.DTSTART) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase();
    if (['SUMMARY', 'DTSTART', 'DTEND', 'UID', 'STATUS'].includes(key)) cur[key] = line.slice(i + 1);
  }
  return out;
}
function parseDT(v) {
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (m[4] === undefined) return { date: new Date(y, mo, d), allDay: true };
  return { date: m[7] ? new Date(Date.UTC(y, mo, d, +m[4], +m[5])) : new Date(y, mo, d, +m[4], +m[5]), allDay: false };
}
function importICS(text) {
  const limit = new Date(); limit.setDate(limit.getDate() - 60);
  const minDate = ymd(limit);
  let added = 0;
  const push = ev => { if (ev.date >= minDate && !data.events.some(x => x.uid === ev.uid)) { data.events.push({ id: uid(), src: 'ics', ...ev }); added++; } };
  for (const ev of parseICS(text)) {
    if (ev.STATUS === 'CANCELLED') continue;
    const s = parseDT(ev.DTSTART); if (!s) continue;
    const e = ev.DTEND ? parseDT(ev.DTEND) : null;
    const name = (ev.SUMMARY || 'Sin título').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
    const base = (ev.UID || name) + '|' + ev.DTSTART;
    if (s.allDay) {
      const end = e ? e.date : new Date(s.date.getTime() + 864e5);
      const d = new Date(s.date);
      for (let n = 0; d < end && n < 31; n++, d.setDate(d.getDate() + 1)) push({ name, date: ymd(d), time: '00:00', end: '', allDay: true, uid: base + '|' + ymd(d) });
    } else {
      const ds = ymd(s.date);
      push({ name, date: ds, time: hm(s.date), end: e ? (ymd(e.date) === ds ? hm(e.date) : '23:59') : '', allDay: false, uid: base });
    }
  }
  return added;
}

/* ---------- Brain Stack ---------- */
function renderBrain() {
  const edit = byId(data.activities, ui.editActivity);
  const stacks = [...new Set(data.activities.map(a => a.stack))];
  const v = edit || { name: '', stack: '', minutes: 20, energy: 'Baja', tags: '' };
  $('#app').innerHTML = head('Brain Stack', 'Tus hobbies organizados para que elegir qué hacer sea más fácil.') + `
    <section class="panel">
      <h2>${edit ? 'Editar actividad' : 'Añade una actividad'}</h2>
      <form id="activity-form" class="form-row">
        <input class="field" name="name" placeholder="Ej. Hacer un puzzle" value="${esc(v.name)}" required>
        <input class="field" name="stack" list="stack-list" placeholder="Stack: sofá, creatividad..." value="${esc(v.stack)}" required>
        <datalist id="stack-list">${stacks.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <input class="field" name="minutes" type="number" min="5" max="300" value="${esc(v.minutes)}" aria-label="Minutos">
        <select name="energy" aria-label="Energía">${opts(ENERGY, v.energy)}</select>
        <input class="field" name="tags" placeholder="Etiquetas: sofá, sin preparar" value="${esc(v.tags)}">
        <button class="primary">${edit ? 'Guardar cambios' : 'Guardar'}</button>
        ${edit ? '<button type="button" class="text-button" data-act="cancel-edit">Cancelar</button>' : ''}
      </form>
    </section>
    <div class="section-head"><div><p class="eyebrow">TUS ACTIVIDADES</p><h2>Mis stacks</h2></div></div>
    ${stacks.map(s => `
      <div class="stack-head"><h3>${esc(s)}</h3><button class="text-button" data-act="rename-stack" data-id="${esc(s)}">Renombrar</button></div>
      <div class="stack-grid">${data.activities.filter(a => a.stack === s).map(a => `
        <article class="stack-card${edit && same(edit.id, a.id) ? ' editing' : ''}"><span class="pill">${esc(a.stack)}</span><h3>${esc(a.name)}</h3>
          <p>${esc(a.minutes)} min · Energía ${esc(a.energy.toLowerCase())}</p><span class="tiny">${esc(a.tags || '')}</span>
          <div class="card-actions"><button class="text-button" data-act="edit-activity" data-id="${esc(a.id)}">Editar</button><button class="text-button danger" data-act="del-activity" data-id="${esc(a.id)}">Eliminar</button></div>
        </article>`).join('')}</div>`).join('') || '<p class="empty">Aún no hay actividades. Añade la primera arriba.</p>'}
    <section class="plan"><p class="eyebrow">PLAN SUGERIDO</p><h3>¿Qué encaja ahora?</h3><p class="muted">Dinos cuánto tiempo tienes y te proponemos una combinación.</p>
      <div class="form-row"><select id="free-time" aria-label="Tiempo"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60" selected>1 hora</option><option value="90">1 hora y media</option></select>
      <select id="free-energy" aria-label="Energía">${opts(ENERGY, 'Baja')}</select><button class="primary" data-act="suggest">Buscar mi plan ✧</button></div>
      <div id="plan-result" class="muted"></div></section>`;
}
function suggest() {
  const mins = +$('#free-time').value, energy = $('#free-energy').value;
  const allowed = data.activities.filter(a => ENERGY.indexOf(a.energy) <= ENERGY.indexOf(energy)).sort((x, y) => x.minutes - y.minutes);
  const chosen = []; let left = mins;
  for (const a of allowed) { if (a.minutes <= left) { chosen.push(a); left -= a.minutes; } if (left < 10) break; }
  $('#plan-result').innerHTML = chosen.length
    ? `<strong>${chosen.map(a => esc(a.name)).join(' + ')}</strong><br>Un plan de ${mins - left} minutos para ti.`
    : 'Aún no hay actividades que encajen. Añade alguna más o prueba con más tiempo.';
}

/* ---------- Mi espacio ---------- */
function renderSpace() {
  $('#app').innerHTML = head('Mi espacio', 'Un lugar para tus notas, preferencias y pequeñas ideas.') + `
    <section class="panel"><h2>Tu espacio personal</h2>
      <p class="muted">Esta versión guarda tus datos en este navegador. Puedes exportarlos como copia de seguridad.</p>
      <button class="primary" data-act="export">Exportar mis datos</button>
      <label class="primary file-btn">Importar copia<input type="file" id="import" accept="application/json" hidden></label></section>`;
}

/* ---------- Acciones (clics) ---------- */
const actions = {
  go: id => page(id),
  'del-task': id => { data.tasks = data.tasks.filter(t => !same(t.id, id)); save(); render(); },
  'rename-space': id => {
    const s = byId(data.spaces, id); if (!s) return;
    const n = prompt('Nuevo nombre del espacio', s.name);
    if (n && n.trim()) { s.name = n.trim(); save(); render(); }
  },
  'del-space': id => {
    const s = byId(data.spaces, id); if (!s) return;
    if (!confirm(`¿Eliminar el espacio «${s.name}»? Sus tareas se mantienen, pero sin espacio.`)) return;
    data.tasks.forEach(t => { if (same(t.spaceId, s.id)) t.spaceId = ''; });
    data.spaces = data.spaces.filter(x => !same(x.id, s.id));
    save(); render();
  },
  'edit-activity': id => { ui.editActivity = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'cancel-edit': () => { ui.editActivity = null; render(); },
  'del-activity': id => {
    const a = byId(data.activities, id);
    if (!a || !confirm(`¿Eliminar «${a.name}»?`)) return;
    data.activities = data.activities.filter(x => !same(x.id, id));
    if (same(ui.editActivity, id)) ui.editActivity = null;
    save(); render();
  },
  'rename-stack': name => {
    const n = prompt('Nuevo nombre del stack', name);
    if (n && n.trim()) { data.activities.forEach(a => { if (a.stack === name) a.stack = n.trim(); }); save(); render(); }
  },
  suggest,
  'toggle-settings': () => { ui.calSettings = !ui.calSettings; render(); },
  'week-prev': () => { ui.weekOffset--; render(); },
  'week-next': () => { ui.weekOffset++; render(); },
  'week-today': () => { ui.weekOffset = 0; render(); },
  'del-event': id => { data.events = data.events.filter(e => !same(e.id, id)); save(); render(); },
  'del-routine': id => { data.routines = data.routines.filter(r => !same(r.id, id)); save(); render(); },
  'clear-ics': () => {
    if (!confirm('¿Quitar todos los eventos importados desde .ics?')) return;
    data.events = data.events.filter(e => e.src !== 'ics'); save(); render();
  },
  export: () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lifeos-backup.json'; a.click();
    URL.revokeObjectURL(a.href);
  }
};

/* ---------- Formularios ---------- */
const forms = {
  'task-form': f => {
    data.tasks.push({ id: uid(), name: f.name.value.trim(), date: f.date.value, spaceId: f.space.value, done: false });
    save(); render();
  },
  'space-form': f => {
    const name = f.name.value.trim(); if (!name) return;
    const sp = { id: uid(), name, color: COLORS[data.spaces.length % COLORS.length] };
    data.spaces.push(sp); save(); render();
  },
  'activity-form': f => {
    const item = { name: f.name.value.trim(), stack: f.stack.value.trim(), minutes: +f.minutes.value || 20, energy: f.energy.value, tags: f.tags.value.trim() };
    const edit = byId(data.activities, ui.editActivity);
    if (edit) Object.assign(edit, item); else data.activities.push({ id: uid(), ...item });
    ui.editActivity = null; save(); render();
  },
  'event-form': f => {
    if (toMin(f.end.value) <= toMin(f.time.value)) { alert('La hora de fin debe ser posterior a la de inicio.'); return; }
    data.events.push({ id: uid(), name: f.name.value.trim(), date: f.date.value, time: f.time.value, end: f.end.value });
    save(); render();
  },
  'routine-form': f => {
    const days = [...f.querySelectorAll('input[name=day]:checked')].map(c => +c.value);
    if (!days.length) { alert('Elige al menos un día.'); return; }
    if (toMin(f.end.value) <= toMin(f.start.value)) { alert('La hora de fin debe ser posterior a la de inicio.'); return; }
    data.routines.push({ id: uid(), name: f.name.value.trim(), days, start: f.start.value, end: f.end.value });
    save(); render();
  },
  'settings-form': f => {
    if (toMin(f.dayEnd.value) <= toMin(f.dayStart.value)) { alert('El final de la jornada debe ser posterior al inicio.'); return; }
    data.settings = { dayStart: f.dayStart.value, dayEnd: f.dayEnd.value };
    save(); render();
  }
};

const app = $('#app');
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act](b.dataset.id, b);
});
app.addEventListener('submit', e => {
  e.preventDefault();
  const fn = forms[e.target.dataset.form || e.target.id];
  if (fn) fn(e.target);
});
app.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.task !== undefined) {
    const task = byId(data.tasks, t.dataset.task);
    if (task) { task.done = t.checked; save(); render(); }
  } else if (t.id === 'import-ics' && t.files[0]) {
    try {
      const n = importICS(await t.files[0].text());
      save(); render(); alert(n ? `Se han importado ${n} eventos.` : 'No se ha encontrado ningún evento nuevo.');
    } catch { alert('No se ha podido leer ese archivo.'); }
  } else if (t.id === 'import' && t.files[0]) {
    try { data = normalize(JSON.parse(await t.files[0].text())); save(); render(); alert('Copia importada.'); }
    catch { alert('No se ha podido leer ese archivo.'); }
  }
});

$$('.nav').forEach(b => b.onclick = () => page(b.dataset.view));
$('.brand').addEventListener('click', e => { e.preventDefault(); page('today'); });
render();

if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }
