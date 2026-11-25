'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'lifeos-v1'; // nombre interno antiguo: no cambiar, o se perderían los datos ya guardados
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ENERGY = ['Baja', 'Media', 'Alta'];
const COLORS = ['#d9e8d3', '#f3e2c7', '#e1dcef', '#f2d9d6', '#d3e6ea', '#eadfc9'];
const MIN_GAP = 30; // minutos mínimos para contar como hueco libre

const initial = {
  tasks: [],
  dump: [],
  spaces: [],
  routines: [],
  events: [],
  plan: [],
  log: [],
  sky: { best: {}, seen: 0 },
  settings: { dayStart: '08:00', dayEnd: '22:00', season: 'auto', phase: 'auto', workLimit: 6 },
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
  ['tasks', 'activities', 'events', 'spaces', 'routines', 'dump', 'plan', 'log'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  d.sky = Object.assign({ best: {}, seen: 0 }, d.sky && typeof d.sky === 'object' ? d.sky : {});
  if (!d.sky.best || typeof d.sky.best !== 'object') d.sky.best = {};
  d.settings = Object.assign({ dayStart: '08:00', dayEnd: '22:00', season: 'auto', phase: 'auto', workLimit: 6 }, d.settings);
  return d;
}
let data;
try { data = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { data = normalize(null); }
function save() {
  const before = skyList().length; updateSky(); const after = skyList().length;
  if (after > before) celebrate(before, after);
  data.meta = { updatedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  if (window.LifeSync) window.LifeSync.push();
}
/* Puente con sync.js (inicio de sesión y sincronización) */
window.LifeApp = {
  get: () => data,
  pristine: () => !(data.meta && data.meta.updatedAt),
  apply(raw) { // sustituye los datos locales sin volver a subirlos
    data = normalize(raw);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    applyTheme();
    const a = document.activeElement;
    if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && $('#app').contains(a))) render();
  },
  reset() { data = normalize(null); try { localStorage.removeItem(KEY); } catch {} applyTheme(); render(); }
};
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
/* ---------- Trabajo, tracker y variedad ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const WORK_RE = /trabaj|work|curro|oficina|empresa/i;
const isWorkSpace = sp => !!sp && (sp.work !== undefined ? !!sp.work : WORK_RE.test(sp.name || ''));
const isWorkRoutine = r => r.work !== undefined ? !!r.work : WORK_RE.test(r.name || '');
function workMinutes(ds) {
  const dow = parseYmd(ds).getDay();
  return data.routines.filter(r => r.days.includes(dow) && isWorkRoutine(r)).reduce((t, r) => t + Math.max(0, toMin(r.end) - toMin(r.start)), 0);
}
const workLimitMin = () => Math.max(1, +data.settings.workLimit || 6) * 60;
const goalOf = a => Math.max(0, Math.min(14, Math.round(+a.goal || 0)));
const weekStartYmd = () => ymd(mondayOf(new Date()));
const daysBetween = ds => Math.round((parseYmd(today()) - parseYmd(ds)) / 864e5);
const ago = ds => { if (!ds) return 'aún no'; const n = daysBetween(ds); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
const logsOf = id => data.log.filter(l => same(l.activityId, id));
const lastDone = id => logsOf(id).reduce((m, l) => l.date > m ? l.date : m, '');
const weekCount = id => logsOf(id).filter(l => l.date >= weekStartYmd()).length;
function neglect(a) { // cuanto mayor, más ganas de proponerlo: hace tiempo que no lo haces o va por debajo de su objetivo
  const last = lastDone(a.id), since = last ? Math.min(daysBetween(last), 30) : 30;
  const g = goalOf(a), wk = weekCount(a.id);
  return since + (g ? (wk < g ? 10 + (g - wk) * 3 : -15) : 0);
}
function seeded(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; }
function rankActs(list, seed) { // seed fijo: orden estable durante el día; sin seed: distinto cada vez
  return list.map(a => ({ a, v: neglect(a) + (seed ? seeded(seed + a.id) : Math.random()) * 4 })).sort((x, y) => y.v - x.v).map(x => x.a);
}
function pickAlternatives(list, seed, n = 2) { // n opciones, de categorías distintas si es posible
  const r = rankActs(list, seed), out = [];
  for (const a of r) if (out.length < n && !out.some(o => o.stack === a.stack)) out.push(a);
  for (const a of r) if (out.length < n && !out.includes(a)) out.push(a);
  return out;
}
function pickMix(list, budget, seed) { // combinación que cabe en el tiempo: primero 1 por categoría, luego hasta 2
  const ranked = rankActs(list, seed), chosen = [];
  let left = budget;
  for (const pass of [1, 2]) {
    for (const a of ranked) {
      if (chosen.includes(a) || a.minutes > left) continue;
      if (chosen.filter(c => c.stack === a.stack).length >= pass) continue;
      chosen.push(a); left -= a.minutes;
      if (left < 10) return chosen;
    }
  }
  return chosen;
}
function streak() {
  const days = new Set(data.log.map(l => l.date));
  const d = new Date(); if (!days.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0; while (days.has(ymd(d)) && n < 3650) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const opts = (list, sel) => list.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');

/* ---------- Tema: estación y momento del día ---------- */
const SEASONS = {
  primavera: { name: 'Primavera', h: 142, bg: 62, ah: 340, glyph: '🌸', day: 'Un paso cada vez. Hoy huele a flores nuevas.', night: 'Ventana entreabierta y luz suave. Ya has hecho bastante.' },
  verano: { name: 'Verano', h: 188, bg: 46, ah: 32, glyph: '☀️', day: 'Sin prisa. Hoy toca luz, sombra y algo fresquito.', night: 'Noche templada. Buen momento para bajar el ritmo.' },
  otono: { name: 'Otoño', h: 18, bg: 36, ah: 42, glyph: '🍂', day: 'Un paso cada vez, con algo calentito en las manos.', night: 'Manta, luz cálida y cero prisas.' },
  invierno: { name: 'Invierno', h: 212, bg: 32, ah: 36, glyph: '❄️', day: 'Abrígate y ve a tu ritmo. Lo importante también es vivir.', night: 'Fuera hace frío; aquí dentro, calorcito. Descansa.' }
};
const PHASES = ['manana', 'tarde', 'noche'];
const NIGHT_START = { invierno: 18.5 * 60, otono: 19.5 * 60, primavera: 20.5 * 60, verano: 21.5 * 60 };
function seasonOf(d) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 1221 || md < 320 ? 'invierno' : md < 621 ? 'primavera' : md < 923 ? 'verano' : 'otono';
}
function phaseOf(d, season) {
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= NIGHT_START[season] || m < 7 * 60 ? 'noche' : m < 13 * 60 ? 'manana' : 'tarde';
}
function themeNow() {
  const d = new Date(), t = data.settings;
  const season = SEASONS[t.season] ? t.season : seasonOf(d);
  const phase = PHASES.includes(t.phase) ? t.phase : phaseOf(d, season);
  return { season, phase };
}
const themeGlyph = () => { const t = themeNow(); return t.phase === 'noche' ? '🌙' : SEASONS[t.season].glyph; };
const themeLine = () => { const t = themeNow(); return SEASONS[t.season][t.phase === 'noche' ? 'night' : 'day']; };
function applyTheme() {
  const { season, phase } = themeNow();
  const S = SEASONS[season], h = S.h, bg = S.bg;
  const L = (hue, sat, l, a) => a === undefined ? `hsl(${hue}, ${sat}%, ${l}%)` : `hsla(${hue}, ${sat}%, ${l}%, ${a})`;
  let v;
  if (phase !== 'noche') {
    const tarde = phase === 'tarde';
    v = {
      '--forest': L(h, 42, 22), '--forest2': L(h, 34, 33), '--head': L(h, 42, 22), '--head2': L(h, 34, 33),
      '--cream': L(bg, tarde ? 52 : 40, tarde ? 91 : 95), '--paper': L(bg, 60, 98), '--field': L(bg, 60, 99),
      '--ink': L(h, 24, 17), '--muted': L(h, 10, 42), '--faint': L(h, 8, 58),
      '--line': L(bg, 26, 86), '--line2': L(h, 18, 78), '--sage': L(h, 24, 89), '--soft': L(h, 28, 92), '--soft2': L(h, 24, 88),
      '--accent': L(S.ah, 45, 62), '--free': L(h, 22, 42), '--ontop': L(bg, 50, 95), '--topline': L(h, 22, 72), '--topsoft': L(h, 22, 80),
      '--glow': tarde ? L(32, 95, 72, .38) : L(50, 95, 82, .45), '--glow2': L(S.ah, 70, 82, .28), '--shadow': L(h, 40, 20, .35),
      '--routine-bg': L(210, 38, 90), '--routine-fg': L(210, 38, 26), '--event-bg': L(38, 70, 86), '--event-fg': L(32, 60, 24),
      '--allday-bg': L(255, 35, 90), '--allday-fg': L(255, 32, 32), '--alta-bg': L(8, 60, 89), '--alta-fg': L(8, 50, 30),
      '--baja-bg': L(h, 25, 89), '--baja-fg': L(h, 35, 28), '--danger': L(8, 48, 48)
    };
  } else {
    v = {
      '--forest': L(h, 34, 30), '--forest2': L(h, 32, 38), '--head': L(h, 38, 80), '--head2': L(h, 34, 72),
      '--cream': L(h, 26, 9), '--paper': L(h, 22, 13), '--field': L(h, 20, 17),
      '--ink': L(bg, 26, 90), '--muted': L(h, 12, 66), '--faint': L(h, 10, 52),
      '--line': L(h, 18, 22), '--line2': L(h, 18, 30), '--sage': L(h, 20, 21), '--soft': L(h, 22, 17), '--soft2': L(h, 22, 23),
      '--accent': L(S.ah, 55, 68), '--free': L(h, 30, 66), '--ontop': L(bg, 40, 92), '--topline': L(h, 22, 60), '--topsoft': L(h, 25, 72),
      '--glow': L(h, 60, 38, .20), '--glow2': L(S.ah, 60, 46, .10), '--shadow': 'rgba(0, 0, 0, .5)',
      '--routine-bg': L(210, 28, 22), '--routine-fg': L(210, 45, 82), '--event-bg': L(36, 40, 22), '--event-fg': L(38, 70, 82),
      '--allday-bg': L(255, 22, 24), '--allday-fg': L(255, 50, 86), '--alta-bg': L(8, 32, 24), '--alta-fg': L(8, 70, 84),
      '--baja-bg': L(h, 22, 22), '--baja-fg': L(h, 40, 80), '--danger': L(8, 65, 68)
    };
  }
  const root = document.documentElement;
  if (!root) return;
  for (const k in v) root.style.setProperty(k, v[k]);
  root.dataset.season = season; root.dataset.phase = phase;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', v['--forest']);
}

/* ---------- Estado de interfaz ---------- */
const ui = { editRoutine: null, view: 'today', dumpNote: '', editTask: null, calSettings: false, editActivity: null, weekOffset: 0, shuffle: {} };

function page(view) {
  ui.view = view;
  render();
  window.scrollTo({ top: 0 });
}
function render() {
  $$('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  ({ today: renderHome, tasks: renderTasks, calendar: renderCalendar, brain: renderBrain, tracker: renderTracker, sky: renderSky, space: renderSpace }[ui.view] || renderHome)();
}
const head = (t, sub) => `<p class="eyebrow">PLANET ME</p><h1 class="view-title">${t}</h1><p class="view-intro">${sub}</p>`;

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
  data.plan.forEach(p => {
    if (p.date === ds) blocks.push({ s: toMin(p.start), e: toMin(p.end), name: p.text, kind: 'plan', id: p.id, done: !!p.done });
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
  const del = x.kind === 'event' ? `<button class="icon-btn" data-act="del-event" data-id="${esc(x.id)}" aria-label="Eliminar plan">×</button>`
    : x.kind === 'plan' ? `<button class="icon-btn" data-act="del-plan" data-id="${esc(x.id)}" aria-label="Quitar de mi día">×</button>` : '';
  return `<div class="slot ${x.kind}${x.done ? ' done-slot' : ''}">${label}<span>${esc(x.name)}</span>${del}</div>`;
}

/* ---------- Mi día ---------- */
const PRIOS = ['Alta', 'Media', 'Baja'];
const PRIO_RANK = { Alta: 0, Media: 1, Baja: 2 };
const TASK_MINUTES = [0, 15, 30, 45, 60, 90, 120, 180, 240];
const prioOf = t => PRIOS.includes(t.priority) ? t.priority : 'Media';
const minOf = t => +t.minutes > 0 ? +t.minutes : 0;
const minutesSelect = (sel, name = 'minutes') => `<select name="${name}" aria-label="Duración estimada">${TASK_MINUTES.map(m => `<option value="${m}"${m === sel ? ' selected' : ''}>${m ? '⏱ ' + dur(m) : '⏱ Sin estimar'}</option>`).join('')}</select>`;
const prioritySelect = (sel, name = 'priority') => `<select name="${name}" aria-label="Prioridad">${PRIOS.map(p => `<option value="${p}"${p === sel ? ' selected' : ''}>Prioridad ${p.toLowerCase()}</option>`).join('')}</select>`;

function taskEditForm(t) {
  return `<div class="item editing"><form class="task-edit" data-form="task-edit-form" data-id="${esc(t.id)}">
    <input class="field" name="name" value="${esc(t.name)}" required aria-label="Nombre de la tarea">
    <div class="edit-row">
      <select name="space" aria-label="Espacio"><option value="">General</option>${data.spaces.map(s => `<option value="${esc(s.id)}"${same(s.id, t.spaceId) ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <input class="field date" name="date" type="date" value="${esc(t.date || '')}" aria-label="Fecha">
      ${minutesSelect(minOf(t))}${prioritySelect(prioOf(t))}
    </div>
    <div class="card-actions"><button class="primary">Guardar</button><button type="button" class="text-button" data-act="cancel-task-edit">Cancelar</button></div>
  </form></div>`;
}
function taskRow(t, showSpace = true) {
  if (ui.view === 'tasks' && same(ui.editTask, t.id)) return taskEditForm(t);
  const sp = byId(data.spaces, t.spaceId);
  const meta = `<span class="chip-p p-${prioOf(t).toLowerCase()}">${prioOf(t)}</span>`
    + (minOf(t) ? `<span class="meta-t">⏱ ${dur(minOf(t))}</span>` : '')
    + (sp && showSpace ? `<span class="pill" style="background:${sp.color}">${esc(sp.name)}</span>` : '')
    + (t.date ? `<span class="meta-t">${fmtDate(t.date)}</span>` : '');
  return `<div class="item task-item"><input type="checkbox" data-task="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Hecha">
    <div class="task-main"><span class="${t.done ? 'done' : ''}">${esc(t.name)}</span><div class="meta">${meta}</div></div>
    ${ui.view === 'tasks' ? `<button class="icon-btn" data-act="edit-task" data-id="${esc(t.id)}" aria-label="Editar tarea">✎</button>` : ''}
    <button class="icon-btn" data-act="del-task" data-id="${esc(t.id)}" aria-label="Eliminar tarea">×</button></div>`;
}
/* Sugerencias para los huecos libres de hoy */
function suggestionsForToday(info, nowMin) {
  const ts = today();
  const d3 = new Date(); d3.setDate(d3.getDate() + 3);
  const soon = ymd(d3);
  const urgency = t => !t.date ? 2 : t.date <= ts ? 0 : t.date <= soon ? 1 : 2;
  const score = t => PRIO_RANK[prioOf(t)] + urgency(t);
  const heavy = workMinutes(ts) >= workLimitMin(); // día de mucho trabajo: solo tareas de trabajo prioritarias
  const planned = kind => new Set(data.plan.filter(p => p.date === ts && p.kind === kind).map(p => String(p.refId)));
  const plannedTasks = planned('task'), plannedActs = planned('hobby');
  const pending = data.tasks
    .filter(t => !t.done && !plannedTasks.has(String(t.id)) && !(heavy && isWorkSpace(byId(data.spaces, t.spaceId)) && prioOf(t) !== 'Alta'))
    .sort((a, b) => score(a) - score(b) || (a.date || '9999').localeCompare(b.date || '9999') || minOf(b) - minOf(a));
  const usedTasks = new Set(), usedActs = new Set(plannedActs);
  const planUsed = { tasks: new Set(), acts: new Set(plannedActs) };
  const out = [];
  for (const f of info.slots.filter(x => x.kind === 'free')) {
    const start = Math.ceil(Math.max(f.s, nowMin) / 5) * 5;
    const len = f.e - start;
    if (len < MIN_GAP) continue;
    const options = [];
    const task = pending.find(t => !usedTasks.has(t.id) && (!minOf(t) || minOf(t) <= len));
    if (task) {
      usedTasks.add(task.id);
      const sp = byId(data.spaces, task.spaceId);
      const late = task.date && task.date < ts ? ' (atrasada)' : task.date === ts ? ' (para hoy)' : '';
      options.push({ icon: '☷', kind: 'task', ref: task.id, min: Math.min(minOf(task) || 45, len),
        text: `Avanzar con «${esc(task.name)}»${sp ? ' · ' + esc(sp.name) : ''}${minOf(task) ? ' · ⏱ ' + dur(minOf(task)) : ''}${prioOf(task) === 'Alta' ? ' · prioridad alta' : ''}${late}` });
    }
    const evening = start >= 20 * 60;
    const fit = data.activities.filter(a => a.minutes <= len && !usedActs.has(a.id) && (!evening || a.energy === 'Baja'));
    for (const a of pickAlternatives(fit, ts + '|' + f.s, 2)) {
      usedActs.add(a.id);
      const g = goalOf(a), wk = weekCount(a.id);
      options.push({ icon: '✧', kind: 'hobby', ref: a.id, min: a.minutes,
        text: `${esc(a.name)} <small>(${a.minutes} min · ${esc(a.stack)}${g && wk < g ? ` · ${wk}/${g} esta semana` : ''})</small>` });
    }
    options.push({ icon: '☾', kind: 'rest', ref: '', min: Math.min(30, len), text: len >= 90 ? 'Descansar un rato, un paseo o no hacer nada' : 'Descansar un rato' });
    out.push({ s: start, e: f.e, len, options, plan: planForGap(start, f.e, pending, evening, planUsed) });
  }
  return out;
}
/* Plan completo para un hueco: una tarea (si hay), una mezcla de hobbies de distintas categorías y un descanso */
function planForGap(start, end, pending, evening, used) {
  const len = end - start, n = ui.shuffle[start] || 0, seed = today() + '|' + start + '|' + n;
  const items = []; let left = len;
  const cands = pending.filter(t => !used.tasks.has(t.id) && (!minOf(t) || minOf(t) <= len));
  if (cands.length) {
    const t = cands[n % cands.length], m = Math.min(minOf(t) || 45, len);
    used.tasks.add(t.id); items.push({ kind: 'task', ref: t.id, min: m, text: t.name, icon: '☷' }); left -= m;
  }
  const fit = data.activities.filter(a => !used.acts.has(a.id) && (!evening || a.energy === 'Baja'));
  const mix = pickMix(fit, Math.max(0, left - (left >= 60 ? 15 : 0)), seed);
  for (const a of mix.slice(0, 3)) { used.acts.add(a.id); items.push({ kind: 'hobby', ref: a.id, min: a.minutes, text: a.name, icon: '✧', cat: a.stack }); left -= a.minutes; }
  if (left >= 15 && items.length) { const m = Math.min(20, left); items.push({ kind: 'rest', ref: '', min: m, text: 'Descansar un rato', icon: '☾' }); left -= m; }
  let t = start; items.forEach(i => { i.s = t; t += i.min; });
  return items;
}
function planRow(p) {
  const icon = p.kind === 'task' ? '☷' : p.kind === 'hobby' ? '✧' : '☾';
  return `<div class="item task-item"><input type="checkbox" data-plan="${esc(p.id)}" ${p.done ? 'checked' : ''} aria-label="Hecho">
    <div class="task-main"><span class="${p.done ? 'done' : ''}">${icon} ${esc(p.text)}</span><div class="meta"><span class="meta-t">${esc(p.start)}–${esc(p.end)}</span></div></div>
    <button class="icon-btn" data-act="del-plan" data-id="${esc(p.id)}" aria-label="Quitar de mi día">×</button></div>`;
}
const HIDE_SIGNIN_KEY = 'planetme-hide-signin';
function showSignin() {
  const S = window.LifeSync && window.LifeSync.state;
  if (!S || !S.configured || !S.ready || S.user) return false;
  try { return !localStorage.getItem(HIDE_SIGNIN_KEY); } catch { return true; }
}
/* Botón de cuenta en la cabecera: siempre visible */
function renderTopAccount() {
  const el = $('#top-account'); if (!el) return;
  const S = window.LifeSync && window.LifeSync.state;
  if (!S || S.loading || !S.configured || !S.ready) { el.hidden = true; return; }
  el.hidden = false;
  if (!S.user) { el.className = 'top-account'; el.title = 'Entrar con Google'; el.innerHTML = '<span>Entrar con Google</span>'; return; }
  const name = (S.user.name || S.user.email || '').split(' ')[0];
  const stat = S.status === 'syncing' ? 'Sincronizando…' : S.status === 'offline' ? 'Sin conexión' : S.status === 'error' ? 'Error al sincronizar' : 'Sincronizado';
  el.className = 'top-account signed' + (S.status === 'error' || S.status === 'offline' ? ' warn' : '');
  el.title = `${S.user.email} · ${stat}`;
  el.innerHTML = (S.user.photo ? `<img src="${esc(S.user.photo)}" alt="" referrerpolicy="no-referrer">` : `<i>${esc((name[0] || '?').toUpperCase())}</i>`) + `<span>${esc(name)}</span>`;
}
function skyCard() {
  const total = skyList().length, level = levelOf(total), into = total % STARS_PER_LEVEL;
  const cur = weekStats()[weekStartYmd()] || { tp: 0, h: 0, r: 0 };
  const next = PLANETS[level - 1];
  return `<button type="button" class="sky-card" data-act="go" data-id="sky" aria-label="Abrir Mi cielo">
    <span class="sc-icon" aria-hidden="true">✦</span>
    <span class="sc-main"><small>MI CIELO · NIVEL ${level}</small><b>${esc(LEVELS[Math.min(level - 1, LEVELS.length - 1)])}</b>
      <span class="bar"><i style="width:${Math.round(into / STARS_PER_LEVEL * 100)}%"></i></span>
      <small>${total} ${total === 1 ? 'estrella' : 'estrellas'} · faltan ${STARS_PER_LEVEL - into} para el nivel ${level + 1}${next ? ' (' + next[0] + ')' : ''}</small></span>
    <span class="sc-go" aria-hidden="true">→</span></button>`;
}
function renderHome() {
  const d = new Date(), ts = today(), nowMin = d.getHours() * 60 + d.getMinutes();
  const greeting = { manana: 'Buenos días.', tarde: 'Buenas tardes.', noche: 'Buenas noches.' }[themeNow().phase];
  const todays = data.tasks.filter(t => t.date === ts);
  const info = dayInfo(ts);
  const slots = info.slots.filter(x => x.kind !== 'free' || x.e > nowMin);
  const plans = data.plan.filter(p => p.date === ts).sort((a, b) => a.start.localeCompare(b.start));
  const work = workMinutes(ts), heavy = work >= workLimitMin();
  $('#app').innerHTML = `
    <section class="welcome"><div><p class="eyebrow">${esc(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase())}</p><h1>${greeting}</h1><p class="muted">${esc(themeLine())}</p></div><div class="sun" aria-hidden="true">${themeGlyph()}</div></section>
    <section class="stats">
      <article class="stat"><span class="eyebrow">TAREAS PENDIENTES</span><strong>${data.tasks.filter(t => !t.done).length}</strong><small>Sin prisa, pero sin perderlas</small></article>
      <article class="stat"><span class="eyebrow">TIEMPO LIBRE HOY</span><strong>${dur(info.freeTotal)}</strong><small>Entre tus planes y tu horario</small></article>
    </section>
    ${skyCard()}
    ${recapCard()}
    ${showSignin() ? `<section class="panel suggestion signin-card">
      <div><p class="eyebrow">TUS DATOS, EN TODAS PARTES</p><h2>Entra para no perder nada</h2>
        <p class="muted">Con tu cuenta de Google, tus tareas y planes se guardan y se sincronizan entre tu móvil y tu ordenador.</p></div>
      <div class="signin-actions"><button class="primary" data-act="sync-signin">Entrar con Google</button><button class="text-button" data-act="signin-dismiss">Ahora no</button></div>
    </section>` : ''}
    <section class="panel">
      <div class="section-head"><div><p class="eyebrow">HOY</p><h2>Tu lista de hoy</h2></div><button class="text-button" data-act="go" data-id="tasks">Ver tareas →</button></div>
      ${todays.length ? todays.map(t => taskRow(t)).join('') : '<div class="empty">Todavía no has añadido tareas para hoy.</div>'}
    </section>
    <section class="panel">
      <div class="section-head"><div><p class="eyebrow">AGENDA</p><h2>Tu día</h2></div><button class="text-button" data-act="go" data-id="calendar">Ver semana →</button></div>
      ${info.allDay.map(ev => `<div class="slot allday"><b>Todo el día</b><span>${esc(ev.name)}</span></div>`).join('')}
      ${slots.length ? `<div class="slots">${slots.map(slotHtml).join('')}</div>` : '<div class="empty">Nada en la agenda de hoy.</div>'}
    </section>
    <section class="panel life-panel">
      <p class="eyebrow">TU RATO PARA TI</p><h2>Mi vida más allá del trabajo</h2>
      ${plans.length ? plans.map(planRow).join('') : '<p class="empty">Toca una de las sugerencias de abajo y se añade a tu día.</p>'}
    </section>
    <section class="panel">
      <p class="eyebrow">SUGERENCIAS</p><h2>Para tus huecos de hoy</h2>
      ${heavy ? `<p class="note">Hoy ya llevas ${dur(work)} de trabajo, así que no te propongo tareas de trabajo, salvo las de prioridad alta.</p>` : ''}
      ${suggestionsForToday(info, nowMin).map(g => `
        <div class="sugg"><div class="sugg-head"><b>${fmtMin(g.s)}–${fmtMin(g.e)}</b><span>Tienes un hueco libre de ${dur(g.len)}. Te propongo este plan:</span></div>
          ${g.plan.length ? `<ul class="plan-list">${g.plan.map(i => `<li><i>${i.icon}</i> <b>${esc(i.text)}</b> <small>${fmtMin(i.s)} · ${i.min} min${i.cat ? ' · ' + esc(i.cat) : ''}</small></li>`).join('')}</ul>
          <div class="form-actions"><button type="button" class="primary small" data-act="plan-add-all" data-start="${g.s}" data-items="${esc(JSON.stringify(g.plan.map(i => ({ kind: i.kind, ref: i.ref, min: i.min }))))}">＋ Añadir este plan a mi día</button><button type="button" class="text-button" data-act="sugg-shuffle" data-id="${g.s}">↻ Otra combinación</button></div>` : ''}
          <details class="sugg-more"><summary>Prefiero elegir cosas sueltas</summary><ul>${g.options.map(o => `<li><button type="button" class="sugg-opt" data-act="plan-add" data-kind="${o.kind}" data-ref="${esc(o.ref)}" data-start="${g.s}" data-min="${o.min}"><i>${o.icon}</i><span>${o.text}</span><em>＋</em></button></li>`).join('')}</ul></details></div>`).join('')
        || '<div class="empty">Hoy no te quedan huecos libres. Disfruta lo que tienes en la agenda.</div>'}
    </section>
    <section class="panel suggestion">
      <div><p class="eyebrow">UNA IDEA PARA TU TIEMPO LIBRE</p><h2>¿Un ratito para ti?</h2><p class="muted">Tus hobbies pueden ayudarte a elegir algo que encaje con tu tiempo y energía.</p></div>
      <button class="primary" data-act="go" data-id="brain">Buscar un plan ✧</button>
    </section>`;
}

/* ---------- Tareas con espacios ---------- */
function spaceCard(sp) {
  const id = sp ? sp.id : '';
  const list = data.tasks
    .filter(t => sp ? same(t.spaceId, sp.id) : !t.spaceId || !byId(data.spaces, t.spaceId))
    .sort((a, b) => (a.done - b.done) || (PRIO_RANK[prioOf(a)] - PRIO_RANK[prioOf(b)]) || (a.date || '9999').localeCompare(b.date || '9999'));
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
      <div class="mini-row">
        <input class="field date" name="date" type="date" value="${today()}" aria-label="Fecha">
        ${minutesSelect(0)}${prioritySelect('Media')}
        <button class="primary" aria-label="Añadir tarea">+</button>
      </div>
    </form>
    ${sp ? `<div class="card-actions"><button class="text-button" data-act="toggle-work" data-id="${esc(sp.id)}">${isWorkSpace(sp) ? 'Espacio de trabajo ✓' : 'Marcar como trabajo'}</button><button class="text-button" data-act="rename-space" data-id="${esc(sp.id)}">Renombrar</button><button class="text-button danger" data-act="del-space" data-id="${esc(sp.id)}">Eliminar</button></div>` : ''}
  </article>`;
}
function renderTasks() {
  const loose = data.tasks.some(t => !t.spaceId || !byId(data.spaces, t.spaceId));
  $('#app').innerHTML = head('Mis tareas', 'Saca las ideas de tu cabeza y dales un lugar.') + `
    <section class="panel">
      <h2>Crea un espacio</h2>
      <form id="space-form" class="form-row"><input class="field" name="name" placeholder="Ej. Trabajo, Máster, Boda…" required maxlength="40"><button class="primary">Guardar</button>
        <label class="check span-all"><input type="checkbox" name="work"> Es un espacio de trabajo (si ya has trabajado mucho ese día, no te sugeriré sus tareas, salvo las prioritarias)</label></form>
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
  const er = byId(data.routines, ui.editRoutine);
  const rv = er || { name: '', start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5], work: true };
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
    <section class="panel" id="routine-form-wrap">
      <p class="eyebrow">HORARIO FIJO</p><h2>Trabajo, clases y rutinas</h2>
      <p class="muted">Lo que se repite cada semana. Se bloquea solo en los días que elijas. Pulsa ✎ para cambiar uno.</p>
      ${data.routines.map(r => `<div class="item${er && same(er.id, r.id) ? ' editing-row' : ''}"><span><b>${esc(r.name)}</b>${isWorkRoutine(r) ? ' <span class="tiny">· trabajo</span>' : ''}</span><small>${WEEK_ORDER.filter(d => r.days.includes(d)).map(d => DAY_SHORT[d]).join(' ')} · ${esc(r.start)}–${esc(r.end)}</small><button class="icon-btn" data-act="edit-routine" data-id="${esc(r.id)}" aria-label="Editar horario">✎</button><button class="icon-btn" data-act="del-routine" data-id="${esc(r.id)}" aria-label="Eliminar horario">×</button></div>`).join('') || '<p class="empty">Aún no has añadido ningún horario fijo.</p>'}
      <h3 class="sub-title">${er ? 'Editar «' + esc(er.name) + '»' : 'Añadir un horario fijo'}</h3>
      <form id="routine-form" class="form-grid">
        <label class="fld span2"><span>Nombre</span><input class="field" name="name" placeholder="Ej. Trabajo" value="${esc(rv.name)}" required></label>
        <label class="fld"><span>Desde</span><input class="field" name="start" type="time" value="${esc(rv.start)}" required></label>
        <label class="fld"><span>Hasta</span><input class="field" name="end" type="time" value="${esc(rv.end)}" required></label>
        <div class="fld span2"><span>Días</span><div class="days">${WEEK_ORDER.map(d => `<label><input type="checkbox" name="day" value="${d}"${rv.days.includes(d) ? ' checked' : ''}><span>${DAY_SHORT[d]}</span></label>`).join('')}</div></div>
        <label class="check span2"><input type="checkbox" name="work"${isWorkRoutine(rv) ? ' checked' : ''}> Cuenta como trabajo (los días largos no te sugeriré más tareas de trabajo, salvo las prioritarias)</label>
        <div class="form-actions span2"><button class="primary">${er ? 'Guardar cambios' : 'Añadir horario'}</button>${er ? '<button type="button" class="text-button" data-act="cancel-routine-edit">Cancelar</button>' : ''}</div>
      </form>
    </section>

    <section class="panel">
      <p class="eyebrow">AJUSTES</p><h2>Tu jornada</h2>
      <p class="muted">Los huecos libres se calculan dentro de este margen horario.</p>
      <form id="settings-form" class="form-grid">
        <label class="fld"><span>Empiezo a las</span><input class="field" name="dayStart" type="time" value="${esc(data.settings.dayStart)}" required></label>
        <label class="fld"><span>Termino a las</span><input class="field" name="dayEnd" type="time" value="${esc(data.settings.dayEnd)}" required></label>
        <label class="fld span2"><span>Si trabajo más de (horas), no me sugieras tareas de trabajo, salvo las prioritarias</span><input class="field" name="workLimit" type="number" min="1" max="16" step="0.5" value="${esc(data.settings.workLimit || 6)}"></label>
        <div class="form-actions span2"><button class="primary">Guardar</button></div>
      </form>
    </section>

    <section class="panel">
      <p class="eyebrow">GOOGLE CALENDAR</p><h2>Traer tu calendario de Google</h2>
      <p class="muted">En <b>calendar.google.com → Configuración → Importar y exportar → Exportar</b> se descarga un .zip. Descomprímelo y sube aquí el archivo .ics de tu calendario. Se importan los eventos de los últimos 60 días en adelante; los que se repiten solo entran con su primera fecha. Cada plan tiene además un botón «+ Google» para enviarlo a tu Google Calendar.</p>
      <label class="primary file-btn">Importar archivo .ics<input type="file" id="import-ics" accept=".ics,text/calendar" hidden></label>
      ${importedCount ? `<button class="text-button danger" data-act="clear-ics">Quitar los ${importedCount} eventos importados</button>` : ''}
      <p class="tiny">Una sincronización automática y continua con Google necesita un servidor y la autorización de tu cuenta; esta versión funciona solo en tu dispositivo.</p>
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
    </section>`;
  const wk = $('.week'), td = $('.day.today');
  if (wk && td && wk.scrollWidth > wk.clientWidth) wk.scrollLeft = Math.max(0, td.offsetLeft - wk.offsetLeft - 4);
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

/* ---------- Hobbies ---------- */
// [palabras clave, minutos, energía, categoría, etiquetas, veces por semana]
const HOBBY_DB = [
  [/leer|libro|lectura|capitulo|novela|comic|manga/, 30, 'Baja', 'Desconexión', 'tranquilo, sofá', 4],
  [/pelicula|\bpeli\b|cine|documental/, 110, 'Baja', 'Sofá', 'sofá, sin preparar', 1],
  [/serie|netflix|anime/, 45, 'Baja', 'Sofá', 'sofá, sin preparar', 3],
  [/puzzle|rompecabezas|crucigrama|sudoku|murdoku|pasatiempo|sopa de letras/, 30, 'Baja', 'Sofá', 'sin preparar, sofá', 3],
  [/videojuego|consola|switch|playstation|ps5|xbox|gaming|partida/, 60, 'Baja', 'Sofá', 'sofá, entretenido', 2],
  [/juegos? de mesa|parchis|ajedrez|cartas|domino/, 60, 'Media', 'Juegos', 'en compañía', 1],
  [/colorear|dibujar|dibujo|pintar|pintura|acuarela|lettering|caligrafia|manualidad|collage|scrapbook|bullet/, 40, 'Media', 'Creatividad', 'creativo, sentado', 2],
  [/tejer|ganchillo|crochet|bordar|coser|costura|macrame|punto de cruz|calceta/, 45, 'Baja', 'Creatividad', 'creativo, manos', 2],
  [/escribir|diario|journaling|poesia|relato/, 25, 'Baja', 'Creatividad', 'creativo, tranquilo', 3],
  [/fotografia|fotos|\bfoto\b/, 45, 'Media', 'Creatividad', 'creativo, salir', 1],
  [/guitarra|piano|ukelele|cantar|violin|bateria|instrumento|musica/, 30, 'Media', 'Música', 'creativo', 3],
  [/senderismo|excursion|montana|\bruta\b|trekking/, 120, 'Media', 'Naturaleza', 'al aire libre', 1],
  [/correr|running|trotar|ciclismo|bici|nadar|natacion|gimnasio|\bgym\b|entrenar|pesas|crossfit|padel|tenis|futbol|baloncesto|escalada/, 45, 'Alta', 'Movimiento', 'ejercicio', 3],
  [/bailar|baile|zumba/, 30, 'Alta', 'Movimiento', 'ejercicio, música', 2],
  [/yoga|pilates|estiramiento|meditar|meditacion|mindfulness|respiracion/, 20, 'Baja', 'Bienestar', 'relajante', 3],
  [/pasear|paseo|caminar|\bandar\b/, 30, 'Baja', 'Naturaleza', 'al aire libre, tranquilo', 4],
  [/jardin|plantas|huerto|regar/, 30, 'Baja', 'Naturaleza', 'al aire libre', 2],
  [/cocinar|cocina|reposteria|hornear|receta|tarta/, 60, 'Media', 'Cocina', 'en casa', 2],
  [/idioma|ingles|frances|aleman|italiano|duolingo|curso|aprender|estudiar/, 25, 'Media', 'Aprender', 'mente activa', 4],
  [/podcast|audiolibro|escuchar/, 30, 'Baja', 'Desconexión', 'tranquilo', 3],
  [/\bspa\b|masaje|skincare|mascarilla|autocuidado|\bbano\b/, 30, 'Baja', 'Bienestar', 'relajante', 1],
  [/siesta|descansar/, 20, 'Baja', 'Bienestar', 'relajante', 2],
  [/amigos|quedar|\bcafe\b|llamar/, 60, 'Media', 'Social', 'en compañía', 1]
];
function suggestHobby(name) {
  const n = norm(name).trim();
  for (const [re, minutes, energy, stack, tags, goal] of HOBBY_DB) if (re.test(n)) return { known: true, minutes, energy, stack, tags, goal };
  return { known: false, minutes: 30, energy: 'Media', stack: '', tags: '', goal: 2 };
}
function applyHobbyHint(f) {
  const el = $('#hobby-hint'); if (!el) return;
  const name = f.name.value.trim();
  if (name.length < 3) { el.innerHTML = ''; return; }
  const s = suggestHobby(name);
  const stacks = [...new Set(data.activities.map(a => a.stack))];
  const stack = s.stack ? (stacks.find(x => norm(x) === norm(s.stack)) || s.stack) : '';
  if (!f.dataset.tminutes) f.minutes.value = s.minutes;
  if (!f.dataset.tenergy) f.energy.value = s.energy;
  if (stack && !f.dataset.tstack) f.stack.value = stack;
  if (s.tags && !f.dataset.ttags) f.tags.value = s.tags;
  if (!f.dataset.tgoal) f.goal.value = s.goal;
  const d = new Date(), nowM = d.getHours() * 60 + d.getMinutes();
  const gap = dayInfo(today()).slots.find(x => x.kind === 'free' && x.e - Math.max(x.s, nowM) >= s.minutes);
  const fit = gap ? ` Hoy te cabe a las ${fmtMin(Math.ceil(Math.max(gap.s, nowM) / 5) * 5)}.` : '';
  el.innerHTML = `💡 Para «${esc(name)}» te sugiero unos <b>${s.minutes} min</b>, energía ${s.energy.toLowerCase()}${s.goal ? `, ${s.goal} ${s.goal === 1 ? 'vez' : 'veces'} por semana` : ''}.${s.known ? '' : ' No lo conozco aún: es una primera idea, ajústala a tu gusto.'}${fit}`;
}

function bestStreak() {
  const days = [...new Set(data.log.map(l => l.date))].sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev && Math.round((parseYmd(d) - parseYmd(prev)) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}
const bars = (rows, unit) => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map(r => `<div class="hbar"><span class="hb-l">${esc(r.l)}</span><div class="hb-t"><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${r.v}${unit || ''}</b></div>`).join(''); };
function renderTracker() {
  const ws = weekStartYmd(), mon = mondayOf(new Date());
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(x.getDate() + i); return x; });
  const wl = data.log.filter(l => l.date >= ws && l.date <= ymd(days[6]));
  const mins = wl.reduce((t, l) => t + (+l.minutes || 0), 0);
  const st = streak(), best = bestStreak();
  const strip = days.map(d => {
    const ds = ymd(d), n = wl.filter(l => l.date === ds).length;
    return `<div class="wd${n ? ' on' : ''}${ds === today() ? ' today' : ''}"><span>${DAY_SHORT[d.getDay()]}</span><i>${n || ''}</i></div>`;
  }).join('');
  // últimas 8 semanas (minutos)
  const wk = Array.from({ length: 8 }, (_, i) => { const x = new Date(mon); x.setDate(x.getDate() - 7 * (7 - i)); return x; }).map(x => {
    const a = ymd(x), e = new Date(x); e.setDate(e.getDate() + 6);
    const ls = data.log.filter(l => l.date >= a && l.date <= ymd(e));
    return { l: fmtDate(a), v: ls.reduce((t, l) => t + (+l.minutes || 0), 0), n: ls.length };
  });
  const wmax = Math.max(1, ...wk.map(w => w.v));
  const chart = `<div class="wk-chart" role="img" aria-label="Minutos de hobbies por semana">${wk.map((w, i) => `<div class="wk-col${i === 7 ? ' cur' : ''}"><b>${w.v ? dur(w.v) : ''}</b><div class="wk-bar"><i style="height:${Math.round(w.v / wmax * 100)}%"></i></div><small>${esc(w.l)}</small></div>`).join('')}</div>`;
  // últimos 30 días: por categoría y por día de la semana
  const d30 = new Date(); d30.setDate(d30.getDate() - 29); const from = ymd(d30);
  const l30 = data.log.filter(l => l.date >= from && l.date <= today());
  const catMap = {}; l30.forEach(l => { const a = byId(data.activities, l.activityId); const c = a ? a.stack : 'Otros'; catMap[c] = (catMap[c] || 0) + (+l.minutes || 0); });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v }));
  const dow = [1, 2, 3, 4, 5, 6, 0].map(g => ({ l: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][g], v: l30.filter(l => parseYmd(l.date).getDay() === g).length }));
  const topDay = dow.slice().sort((a, b) => b.v - a.v)[0];
  // por hobby
  const per = data.activities.map(a => ({ a, n: logsOf(a.id).length, m: logsOf(a.id).reduce((t, l) => t + (+l.minutes || 0), 0), w: weekCount(a.id), g: goalOf(a) }))
    .filter(x => x.n || x.g).sort((x, y) => y.n - x.n);
  const rows = per.map(({ a, n, m, w, g }) => `<div class="trk-row"><div class="trk-top"><b>${esc(a.name)}</b><small>${n} ${n === 1 ? 'sesión' : 'sesiones'} · ${dur(m)} en total · última: ${ago(lastDone(a.id))}</small></div>
    ${g ? `<div class="bar" role="progressbar" aria-valuenow="${w}" aria-valuemin="0" aria-valuemax="${g}"><i style="width:${Math.min(100, Math.round(w / g * 100))}%"></i></div><small class="muted">Esta semana ${w} de ${g}</small>` : ''}</div>`).join('');
  const never = data.activities.filter(a => !logsOf(a.id).length && !goalOf(a));
  const recent = [...data.log].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 10).map(l => {
    const a = byId(data.activities, l.activityId);
    return `<div class="item"><span>✓ ${esc(a ? a.name : 'Hobby eliminado')}</span><small>${+l.minutes ? l.minutes + ' min · ' : ''}<input type="date" class="date-edit" data-logdate="${esc(l.id)}" value="${esc(l.date)}" max="${today()}" aria-label="Fecha en la que lo hiciste"></small><button class="icon-btn" data-act="del-log" data-id="${esc(l.id)}" aria-label="Borrar sesión">×</button></div>`;
  }).join('');
  const empty = !data.log.length;
  $('#app').innerHTML = head('Tracker', 'Cómo van tus hobbies: lo que haces, cuánto y cuándo. Para disfrutarlo, no para exigirte.') + `
    <section class="stats stats4">
      <article class="stat"><span class="eyebrow">SESIONES ESTA SEMANA</span><strong>${wl.length}</strong><small>${dur(mins) === '0 min' ? 'Aún nada, sin prisa' : dur(mins) + ' en total'}</small></article>
      <article class="stat"><span class="eyebrow">RACHA ACTUAL</span><strong>${st}</strong><small>${st === 1 ? 'día' : 'días'} seguidos</small></article>
      <article class="stat"><span class="eyebrow">MEJOR RACHA</span><strong>${best}</strong><small>${best === 1 ? 'día' : 'días'} seguidos</small></article>
      <article class="stat"><span class="eyebrow">SESIONES EN TOTAL</span><strong>${data.log.length}</strong><small>${new Set(data.log.map(l => l.activityId)).size} hobbies distintos</small></article>
    </section>
    <section class="panel tracker"><p class="eyebrow">ESTA SEMANA</p><h2>Tus días</h2>
      <p class="muted">Cada 5 sesiones de hobby te dan una estrella. <button class="text-button" data-act="go" data-id="sky">Ver mi cielo ✦ →</button></p>
      <div class="week-strip" aria-label="Días de esta semana con algún hobby">${strip}</div>
      <p class="muted">${wl.length ? `${wl.length} ${wl.length === 1 ? 'sesión' : 'sesiones'} · ${dur(mins)}` : 'Todavía no has registrado nada esta semana.'}</p>
      ${empty ? '<p class="empty small">Pulsa «✓ Hecho hoy» en un hobby, o márcalo como hecho en tu día, y aquí empezarán a salir tus estadísticas.</p>' : ''}
    </section>
    <section class="panel"><p class="eyebrow">EVOLUCIÓN</p><h2>Últimas 8 semanas</h2>${chart}</section>
    ${l30.length ? `<section class="panel"><p class="eyebrow">ÚLTIMOS 30 DÍAS</p><h2>Dónde pones tu tiempo</h2>${bars(cats.map(c => ({ l: c.l, v: c.v })), ' min')}
      <p class="eyebrow sub">POR DÍA DE LA SEMANA</p>${bars(dow)}${topDay && topDay.v ? `<p class="muted">Tu día más hobbyista: ${topDay.l.toLowerCase()}.</p>` : ''}</section>` : ''}
    <section class="panel"><p class="eyebrow">POR HOBBY</p><h2>Tus hobbies en números</h2>
      ${rows || '<p class="empty small">Aquí verás cuántas veces haces cada hobby.</p>'}
      ${never.length ? `<p class="muted">Aún sin estrenar: ${never.map(a => esc(a.name)).join(', ')}.</p>` : ''}</section>
    <section class="panel"><p class="eyebrow">REGISTRO</p><h2>Tus sesiones</h2>
      ${data.activities.length ? `<p class="eyebrow sub">¿SE TE OLVIDÓ APUNTAR ALGO?</p>
      <form id="log-form" class="log-form"><select name="hobby" aria-label="Hobby">${data.activities.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
        <input type="date" name="date" value="${ymd(new Date(Date.now() - 864e5))}" max="${today()}" aria-label="Día en que lo hiciste" required>
        <button class="primary small">Registrar</button></form>` : ''}
      ${recent ? `<p class="eyebrow sub">ÚLTIMAS SESIONES <small>(toca la fecha para cambiarla)</small></p>${recent}` : ''}
    </section>`;
}

function renderBrain() {
  const edit = byId(data.activities, ui.editActivity);
  const stacks = [...new Set(data.activities.map(a => a.stack))];
  const v = edit || { name: '', stack: '', minutes: 20, energy: 'Baja', tags: '', goal: 0 };
  $('#app').innerHTML = head('Hobbies', 'Tus hobbies organizados por categorías para que elegir qué hacer sea más fácil.') + `<p class="muted">¿Quieres ver cómo vas? <button class="text-button" data-act="go" data-id="tracker">Abrir mi tracker →</button></p>` + `
    <div class="section-head"><div><p class="eyebrow">TUS ACTIVIDADES</p><h2>Mis hobbies</h2></div></div>
    ${stacks.map(s => `
      <div class="stack-head"><h3>${esc(s)}</h3><button class="text-button" data-act="rename-stack" data-id="${esc(s)}">Renombrar</button></div>
      <div class="stack-grid">${data.activities.filter(a => a.stack === s).map(a => {
        const wk = weekCount(a.id), g = goalOf(a), tn = logsOf(a.id).filter(l => l.date === today()).length;
        return `<article class="stack-card${edit && same(edit.id, a.id) ? ' editing' : ''}"><span class="pill">${esc(a.stack)}</span><h3>${esc(a.name)}</h3>
          <p>${esc(a.minutes)} min · Energía ${esc(a.energy.toLowerCase())}${g ? ` · objetivo ${g}/semana` : ''}</p><span class="tiny">${esc(a.tags || '')}</span>
          <p class="trk-line">Esta semana: ${wk}${g ? '/' + g : ''} · última vez: ${ago(lastDone(a.id))}${tn ? ` · hoy ✓${tn > 1 ? ' ×' + tn : ''}` : ''}</p>
          <div class="card-actions"><button class="primary small" data-act="log-hobby" data-id="${esc(a.id)}">✓ Hecho hoy</button><button class="text-button" data-act="edit-activity" data-id="${esc(a.id)}">Editar</button><button class="text-button danger" data-act="del-activity" data-id="${esc(a.id)}">Eliminar</button></div>
        </article>`; }).join('')}</div>`).join('') || '<p class="empty">Aún no hay hobbies. Añade el primero más abajo.</p>'}
    <section class="panel" id="activity-form-panel">
      <h2>${edit ? 'Editar hobby' : 'Añade un hobby'}</h2>
      <form id="activity-form" class="form-grid" autocomplete="off">
        <label class="fld span2"><span>Hobby</span><input class="field" name="name" placeholder="Ej. Hacer un puzzle" value="${esc(v.name)}" required></label>
        <p class="hint span2" id="hobby-hint" aria-live="polite"></p>
        <label class="fld"><span>Categoría</span><input class="field" name="stack" list="stack-list" placeholder="Sofá, Creatividad…" value="${esc(v.stack)}" required></label>
        <datalist id="stack-list">${stacks.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
        <label class="fld"><span>Minutos por sesión</span><input class="field" name="minutes" type="number" min="5" max="300" step="5" value="${esc(v.minutes)}"></label>
        <label class="fld"><span>Energía</span><select name="energy">${opts(ENERGY, v.energy)}</select></label>
        <label class="fld"><span>Veces por semana (opcional)</span><input class="field" name="goal" type="number" min="0" max="14" placeholder="Ej. 3" value="${goalOf(v) || ''}"></label>
        <label class="fld span2"><span>Etiquetas</span><input class="field" name="tags" placeholder="Ej. sin preparar, sofá" value="${esc(v.tags)}"></label>
        <div class="form-actions span2"><button class="primary">${edit ? 'Guardar cambios' : 'Guardar'}</button>${edit ? '<button type="button" class="text-button" data-act="cancel-edit">Cancelar</button>' : ''}</div>
      </form>
    </section>
    <section class="plan"><p class="eyebrow">PLAN SUGERIDO</p><h3>¿Qué encaja ahora?</h3><p class="muted">Dinos cuánto tiempo tienes y te proponemos una combinación de categorías distintas.</p>
      <div class="form-row"><select id="free-time" aria-label="Tiempo"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60" selected>1 hora</option><option value="90">1 hora y media</option><option value="120">2 horas</option></select>
      <select id="free-energy" aria-label="Energía">${opts(ENERGY, 'Baja')}</select><button class="primary" data-act="suggest">Buscar mi plan ✧</button></div>
      <div id="plan-result" class="muted"></div></section>`;
}
function suggest() {
  const mins = +$('#free-time').value, energy = $('#free-energy').value;
  const allowed = data.activities.filter(a => ENERGY.indexOf(a.energy) <= ENERGY.indexOf(energy));
  const chosen = pickMix(allowed, mins);
  const total = chosen.reduce((t, a) => t + a.minutes, 0), cats = new Set(chosen.map(a => a.stack)).size;
  $('#plan-result').innerHTML = chosen.length
    ? `<ul class="plan-list">${chosen.map(a => `<li><b>${esc(a.name)}</b> <small>${a.minutes} min · ${esc(a.stack)}</small></li>`).join('')}</ul>
       <p>Un plan de ${total} minutos${cats > 1 ? ` con ${cats} categorías distintas` : ''}. Púlsalo de nuevo para otra combinación.</p>`
    : 'Aún no hay actividades que encajen. Añade alguna más o prueba con más tiempo.';
}

/* ---------- Mi cielo: estrellas, niveles y planetas ---------- */
const STARS_PER_LEVEL = 15;
const LEVELS = ['Soñadora', 'Exploradora', 'Navegante', 'Astrónoma', 'Cartógrafa del cielo', 'Guardiana de estrellas', 'Viajera cósmica', 'Maestra de constelaciones', 'Leyenda del cielo'];
const PLANETS = [['Luna', '#f1eee4', '#b4ad9b'], ['Mercurio', '#d8cdbd', '#8c7e6c'], ['Venus', '#f8dcae', '#cf9455'], ['Marte', '#eba384', '#a84b33'], ['Júpiter', '#efcfa6', '#b0764a'], ['Saturno', '#f4e0a4', '#c49a45'], ['Urano', '#c0e8ea', '#68acb5'], ['Neptuno', '#a2bff5', '#4561c2']];
const STAR_KINDS = { t: { name: 'tarea', color: '#e8b64a' }, h: { name: 'hobby', color: '#c58ad8' }, r: { name: 'descanso', color: '#7fb6e6' }, b: { name: 'equilibrio', color: '#fff3c4' } };
const levelOf = n => 1 + Math.floor(n / STARS_PER_LEVEL);
const weekKey = ds => ymd(mondayOf(parseYmd(ds)));
function weekStats() { // puntos de cada semana: tareas (la prioridad alta vale doble), sesiones de hobby y descansos hechos
  const w = {}, g = k => w[k] || (w[k] = { tp: 0, h: 0, r: 0 });
  data.tasks.forEach(t => { if (t.done && t.doneAt) g(weekKey(t.doneAt)).tp += prioOf(t) === 'Alta' ? 2 : 1; });
  data.log.forEach(l => { if (l.date) g(weekKey(l.date)).h++; });
  data.plan.forEach(p => { if (p.kind === 'rest' && p.done && p.date) g(weekKey(p.date)).r++; });
  return w;
}
const starsOfWeek = c => ({ t: Math.floor(c.tp / 3), h: Math.floor(c.h / 5), r: Math.floor(c.r / 3), b: c.tp >= 1 && c.h >= 1 && c.r >= 1 ? 1 : 0 });
function updateSky() { // las estrellas ganadas no se pierden aunque luego desmarques algo
  const st = weekStats(), best = data.sky.best;
  for (const k in st) {
    const c = starsOfWeek(st[k]);
    if (!best[k] && !(c.t || c.h || c.r || c.b)) continue;
    const b = best[k] || (best[k] = { t: 0, h: 0, r: 0, b: 0 });
    for (const x in c) b[x] = Math.max(+b[x] || 0, c[x]);
  }
}
function skyList() {
  const out = [];
  Object.keys(data.sky.best).sort().forEach(k => { const b = data.sky.best[k]; for (const x of ['t', 'h', 'r', 'b']) for (let i = 0; i < (+b[x] || 0); i++) out.push({ k, x }); });
  return out;
}
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 4500);
}
function celebrate(b, a) {
  const lb = levelOf(b), la = levelOf(a);
  toast(la > lb ? `🪐 ¡Subes al nivel ${la}!${PLANETS[la - 2] ? ' Nuevo planeta: ' + PLANETS[la - 2][0] : ''}` : '✦ ¡Has ganado una estrella para tu cielo!');
}
function rnd(str) { // hash con buena dispersión (0–1) para colocar las estrellas
  let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function skySvg(stars, base, seen, mini) {
  const W = 400, H = 260, N = STARS_PER_LEVEL;
  const pts = stars.map((s, j) => ({ k: s.k, kind: s.x, x: 28 + j * (W - 56) / (N - 1) + (rnd('x' + (base + j)) - .5) * 24, y: 36 + rnd('y' + (base + j)) * (H - 72), isNew: base + j >= seen }));
  const line = pts.length > 1 ? `<polyline class="c-line" points="${pts.map(q => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' ')}"/>` : '';
  const dots = pts.map((q, j) => `<circle class="c-star${q.isNew && !mini ? ' new' : ''}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${mini ? 3 : 4}" fill="${STAR_KINDS[q.kind].color}" style="--d:${(j % 5) * .5}s;color:${STAR_KINDS[q.kind].color}"><title>Semana del ${fmtDate(q.k)} · estrella de ${STAR_KINDS[q.kind].name}</title></circle>`).join('');
  return `<svg class="${mini ? 'sky-mini' : 'sky-svg'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Constelación">${line}${dots}</svg>`;
}
function weekRecap(wk) { // resumen de una semana (lunes = wk)
  const e = new Date(parseYmd(wk)); e.setDate(e.getDate() + 6); const end = ymd(e);
  const inW = d => d && d >= wk && d <= end;
  const tasks = data.tasks.filter(t => t.done && inW(t.doneAt)).length;
  const logs = data.log.filter(l => inW(l.date)), rests = data.plan.filter(p => p.kind === 'rest' && p.done && inW(p.date)).length;
  const mins = logs.reduce((t, l) => t + (+l.minutes || 0), 0);
  const cnt = {}; logs.forEach(l => { cnt[l.activityId] = (cnt[l.activityId] || 0) + 1; });
  const topId = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0], top = topId ? byId(data.activities, topId) : null;
  const b = data.sky.best[wk] || {}, stars = ['t', 'h', 'r', 'b'].reduce((t, x) => t + (+b[x] || 0), 0);
  return { wk, tasks, sessions: logs.length, mins, rests, top, topN: top ? cnt[topId] : 0, b, stars, any: tasks || logs.length || rests };
}
function recapMsg(r) {
  if (!r.any) return 'Semana tranquila. A veces el cielo también descansa; cuando quieras, aquí seguimos.';
  if (r.b.b) return 'Semana equilibrada: trabajaste, disfrutaste y descansaste. Eso es vivir bien.';
  if (r.stars) return '¡Qué semana! Tu cielo tiene luz nueva.';
  return 'Buen avance. Un poco más y aparece tu próxima estrella.';
}
function recapHtml(r, title) {
  const starRow = ['t', 'h', 'r', 'b'].map(x => +r.b[x] ? `<i style="color:${STAR_KINDS[x].color}">${'★'.repeat(+r.b[x])}</i>` : '').join('');
  return `<p class="eyebrow">RESUMEN</p><h2>${esc(title)}</h2>
    <div class="recap-grid"><div><strong>${r.tasks}</strong><small>${r.tasks === 1 ? 'tarea hecha' : 'tareas hechas'}</small></div>
      <div><strong>${r.sessions}</strong><small>${r.sessions === 1 ? 'sesión de hobby' : 'sesiones de hobby'}</small></div>
      <div><strong>${r.rests}</strong><small>${r.rests === 1 ? 'descanso' : 'descansos'}</small></div>
      <div><strong>${r.stars}</strong><small>${r.stars === 1 ? 'estrella' : 'estrellas'} ${starRow}</small></div></div>
    <p class="muted">${r.mins ? `Dedicaste ${dur(r.mins)} a tus hobbies${r.top ? `; el que más repetiste fue «${esc(r.top.name)}» (${r.topN} ${r.topN === 1 ? 'vez' : 'veces'})` : ''}. ` : ''}${recapMsg(r)}</p>`;
}
function recapCard() { // domingo: tu semana; lunes: la semana pasada
  const dow = new Date().getDay();
  if (dow !== 0 && dow !== 1) return '';
  const wk = dow === 0 ? weekStartYmd() : (() => { const x = mondayOf(new Date()); x.setDate(x.getDate() - 7); return ymd(x); })();
  const r = weekRecap(wk);
  return `<section class="panel recap-card">${recapHtml(r, dow === 0 ? 'Tu semana, de un vistazo' : 'Tu semana pasada')}
    <div class="form-actions"><button class="text-button" data-act="go" data-id="sky">Ver mi cielo →</button><button class="text-button" data-act="go" data-id="tracker">Ver mi tracker →</button></div></section>`;
}
function renderSky() {
  const list = skyList(), total = list.length, level = levelOf(total), seen = data.sky.seen || 0;
  const into = total % STARS_PER_LEVEL, pct = Math.round(into / STARS_PER_LEVEL * 100);
  const cur = weekStats()[weekStartYmd()] || { tp: 0, h: 0, r: 0 };
  const done = Math.floor(total / STARS_PER_LEVEL);
  const chunk = list.slice(done * STARS_PER_LEVEL);
  const minis = Array.from({ length: done }, (_, i) => `<div class="mini-wrap">${skySvg(list.slice(i * STARS_PER_LEVEL, (i + 1) * STARS_PER_LEVEL), i * STARS_PER_LEVEL, seen, true)}<small>Constelación ${i + 1}</small></div>`).join('');
  const planets = PLANETS.slice(0, Math.max(0, level - 1)), next = PLANETS[level - 1];
  const weeks = Object.keys(data.sky.best).sort().reverse().slice(0, 6).map(k => {
    const b = data.sky.best[k], n = ['t', 'h', 'r', 'b'].reduce((t, x) => t + (+b[x] || 0), 0);
    return `<div class="wk"><span>Semana del ${fmtDate(k)}</span><span class="wk-stars">${['t', 'h', 'r', 'b'].map(x => `<i style="color:${STAR_KINDS[x].color}">${'★'.repeat(+b[x] || 0)}</i>`).join('')}</span><small>${n}</small></div>`;
  }).join('');
  const nextTxt = (v, n, noun) => `${v % n} de ${n} ${noun}`;
  const bal = [['tarea', cur.tp >= 1], ['hobby', cur.h >= 1], ['descanso', cur.r >= 1]];
  $('#app').innerHTML = head('Mi cielo', 'Cada cosa que haces suma, también descansar. Aquí crece tu constelación.') + `
    <section class="panel sky-hero">
      <div class="sky-top"><div><p class="eyebrow">NIVEL ${level}</p><h2>${esc(LEVELS[Math.min(level - 1, LEVELS.length - 1)])}</h2></div><div class="sky-total"><strong>${total}</strong><small>${total === 1 ? 'estrella' : 'estrellas'}</small></div></div>
      <div class="sky-stage">${total ? skySvg(chunk, done * STARS_PER_LEVEL, seen, false) : '<p class="sky-empty">Tu cielo está esperando su primera estrella ✦</p>'}</div>
      <div class="bar" role="progressbar" aria-valuenow="${into}" aria-valuemin="0" aria-valuemax="${STARS_PER_LEVEL}"><i style="width:${pct}%"></i></div>
      <p class="muted">${into} de ${STARS_PER_LEVEL} estrellas para el nivel ${level + 1}${next ? ' y desbloquear a ' + next[0] : ''}.</p>
    </section>
    <section class="panel">
      <p class="eyebrow">ESTA SEMANA</p><h2>Tu próxima estrella</h2>
      <div class="trk-row"><div class="trk-top"><b><i style="color:${STAR_KINDS.t.color}">★</i> Tareas</b><small>${nextTxt(cur.tp, 3, 'puntos')} · las de prioridad alta valen doble</small></div><div class="bar"><i style="width:${(cur.tp % 3) / 3 * 100}%"></i></div></div>
      <div class="trk-row"><div class="trk-top"><b><i style="color:${STAR_KINDS.h.color}">★</i> Hobbies</b><small>${nextTxt(cur.h, 5, 'sesiones')}</small></div><div class="bar"><i style="width:${(cur.h % 5) / 5 * 100}%"></i></div></div>
      <div class="trk-row"><div class="trk-top"><b><i style="color:${STAR_KINDS.r.color}">★</i> Descansos</b><small>${nextTxt(cur.r, 3, 'descansos de tu día')}</small></div><div class="bar"><i style="width:${(cur.r % 3) / 3 * 100}%"></i></div></div>
      <div class="trk-row"><div class="trk-top"><b><i style="color:${STAR_KINDS.b.color}">★</i> Equilibrio</b><small>${bal.map(([n, ok]) => (ok ? '✓ ' : '○ ') + n).join(' · ')}</small></div></div>
      <p><button class="text-button" data-act="go" data-id="tracker">Ver mis estadísticas de hobbies →</button></p>
      <details class="sugg-more"><summary>¿Cómo se ganan las estrellas?</summary>
        <p class="muted">★ Una por cada 3 puntos de tareas (1 punto por tarea, 2 si es de prioridad alta).<br>★ Una por cada 5 sesiones de hobby.<br>★ Una por cada 3 descansos que añadas a tu día y marques como hechos.<br>★ Una extra si en la misma semana haces una tarea, un hobby y un descanso.<br>Las semanas empiezan el lunes. Las estrellas ganadas nunca se pierden.</p></details>
    </section>
    <section class="panel recap-card">${recapHtml(weekRecap(weekStartYmd()), 'Resumen de esta semana')}</section>
    ${(() => { const x = mondayOf(new Date()); x.setDate(x.getDate() - 7); const r = weekRecap(ymd(x)); return r.any ? `<section class="panel recap-card">${recapHtml(r, 'Semana pasada')}</section>` : ''; })()}
    <section class="panel">
      <p class="eyebrow">TUS PLANETAS</p><h2>Planetas desbloqueados</h2>
      <div class="planets">${planets.map(([n, a, b]) => `<div class="planet${n === 'Saturno' ? ' ringed' : ''}" style="--a:${a};--b:${b}"><i></i><span>${n}</span></div>`).join('')}
        ${next ? `<div class="planet locked"><i></i><span>Nivel ${level + 1}</span></div>` : ''}</div>
      ${planets.length ? '' : '<p class="muted">Llega al nivel 2 (15 estrellas) y aparecerá tu primer planeta.</p>'}
    </section>
    ${done ? `<section class="panel"><p class="eyebrow">CONSTELACIONES COMPLETADAS</p><h2>Tu mapa del cielo</h2><div class="minis">${minis}</div></section>` : ''}
    ${weeks ? `<section class="panel"><p class="eyebrow">HISTORIAL</p><h2>Últimas semanas</h2>${weeks}</section>` : ''}`;
  if (data.sky.seen !== total) { data.sky.seen = total; save(); }
}

/* ---------- Mi espacio ---------- */
function dumpRow(d) {
  return `<div class="item dump-item"><div class="task-main"><span>${esc(d.text)}</span><div class="meta"><span class="meta-t">${fmtDate(d.created.slice(0, 10))}</span></div></div>
    <div class="dump-actions"><select aria-label="Espacio de la tarea"><option value="">General</option>${data.spaces.map(sp => `<option value="${esc(sp.id)}">${esc(sp.name)}</option>`).join('')}</select>
      <button class="text-button" data-act="dump-to-task" data-id="${esc(d.id)}">→ Tarea</button>
      <button class="icon-btn" data-act="del-dump" data-id="${esc(d.id)}" aria-label="Borrar idea">×</button></div></div>`;
}
function accountInner() {
  const S = window.LifeSync && window.LifeSync.state;
  const top = '<p class="eyebrow">CUENTA</p><h2>Tu cuenta y sincronización</h2>';
  if (S && S.loading) return top + '<p class="muted">Comprobando tu cuenta…</p>';
  if (!S || !S.configured) return top + '<p class="muted">La sincronización entre dispositivos todavía no está activada: tus datos se guardan solo en este dispositivo.</p>';
  if (!S.ready) return top + `<p class="muted">${esc(S.error || 'No se ha podido conectar con el servicio de Google.')} Tus datos siguen guardados en este dispositivo.</p>`;
  const err = (S.error ? `<p class="note warn">${esc(S.error)}</p>` : '') + (S.info ? `<p class="note">${esc(S.info)}</p>` : '');
  if (!S.user) return top + `<p class="muted">Entra con Google para tener tus tareas, hobbies y calendario en todos tus dispositivos.</p>
    <button class="primary" data-act="sync-signin">Entrar con Google</button>${err}`;
  const stat = S.status === 'syncing' ? 'Sincronizando…' : S.status === 'offline' ? 'Sin conexión: los cambios se subirán al volver.'
    : S.status === 'error' ? 'No se ha podido sincronizar.' : S.lastSync ? `Sincronizado a las ${hm(new Date(S.lastSync))}` : 'Conectado';
  const conflict = S.conflict ? `<div class="note"><b>Hay datos distintos en la nube y en este dispositivo.</b> ¿Qué quieres hacer? (Se guarda antes una copia de seguridad de lo de este dispositivo.)</div>
    <div class="conflict-actions"><button class="primary" data-act="sync-resolve" data-id="merge">Combinar ambos</button>
    <button class="text-button" data-act="sync-resolve" data-id="cloud">Usar los de la nube</button>
    <button class="text-button" data-act="sync-resolve" data-id="local">Usar los de este dispositivo</button></div>` : '';
  return top + `<div class="account-user">${S.user.photo ? `<img src="${esc(S.user.photo)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div><b>${esc(S.user.name || 'Tu cuenta')}</b><small>${esc(S.user.email)}</small></div></div>
    <p class="muted">${stat}</p>${conflict}${err}
    <div class="card-actions"><button class="text-button" data-act="sync-signout">Cerrar sesión</button>
      <button class="text-button danger" data-act="sync-delete">Borrar mis datos de la nube</button></div>`;
}
window.addEventListener('lifesync', () => {
  const el = $('#account-panel'); if (el) el.innerHTML = accountInner();
  renderTopAccount();
  if (ui.view === 'today') renderHome();
});
function renderSpace() {
  const items = [...data.dump].sort((a, b) => b.created.localeCompare(a.created));
  const note = ui.dumpNote; ui.dumpNote = '';
  $('#app').innerHTML = head('Mi espacio', 'Un lugar para tus notas, preferencias y pequeñas ideas.') + `
    <section class="panel"><p class="eyebrow">BRAIN DUMP</p><h2>Vuelca tu cabeza</h2>
      <p class="muted">Escribe sin ordenar todo lo que te ronde: pendientes, ideas, preocupaciones. Una idea por línea. Luego decides qué pasa a Mis tareas.</p>
      <form id="dump-form" class="dump-form"><textarea class="field" name="text" rows="5" placeholder="Ej.&#10;Llamar al fontanero&#10;Mirar vuelos para la luna de miel&#10;Preparar el índice del TFM" required></textarea>
        <button class="primary">Guardar ideas</button></form>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      ${items.length ? `<div class="dump-list">${items.map(dumpRow).join('')}</div>` : '<p class="empty">Tu cabeza está despejada por ahora.</p>'}
    </section>
    <section class="panel" id="account-panel">${accountInner()}</section>
    <section class="panel"><p class="eyebrow">APARIENCIA</p><h2>Tu ambiente</h2>
      <p class="muted">Los colores cambian solos con la estación del año y con el momento del día (mañana, tarde y noche). Si prefieres, fija uno.</p>
      <form id="theme-form" class="form-row">
        <select name="season" aria-label="Estación"><option value="auto">Estación: automática</option>${Object.keys(SEASONS).map(k => `<option value="${k}"${data.settings.season === k ? ' selected' : ''}>${SEASONS[k].name}</option>`).join('')}</select>
        <select name="phase" aria-label="Momento del día"><option value="auto">Momento: automático</option>${[['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']].map(([k, n]) => `<option value="${k}"${data.settings.phase === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </form></section>
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
  'edit-activity': id => { ui.editActivity = id; render(); const p = $('#activity-form-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  'cancel-edit': () => { ui.editActivity = null; render(); },
  'sync-signin': () => window.LifeSync && window.LifeSync.signIn(),
  'signin-dismiss': () => { try { localStorage.setItem(HIDE_SIGNIN_KEY, '1'); } catch {} render(); },
  'sync-signout': () => {
    if (!window.LifeSync) return;
    const clear = confirm('¿Quieres borrar también los datos de este dispositivo? Seguirán guardados en tu cuenta.\n\nAceptar: borrarlos de aquí.\nCancelar: conservarlos en este dispositivo.');
    window.LifeSync.signOut(clear);
  },
  'sync-resolve': id => window.LifeSync && window.LifeSync.resolve(id),
  'sync-delete': () => {
    if (window.LifeSync && confirm('¿Borrar tus datos de la nube y cerrar sesión? Los datos de este dispositivo no se tocan.')) window.LifeSync.deleteCloud();
  },
  'del-dump': id => { data.dump = data.dump.filter(d => !same(d.id, id)); save(); render(); },
  'dump-to-task': (id, btn) => {
    const d = byId(data.dump, id); if (!d) return;
    const sel = btn.parentElement.querySelector('select');
    data.tasks.push({ id: uid(), name: d.text, date: '', spaceId: sel ? sel.value : '', minutes: 0, priority: 'Media', done: false });
    data.dump = data.dump.filter(x => !same(x.id, id));
    ui.dumpNote = `«${d.text}» ya está en Mis tareas. Allí puedes ponerle duración y prioridad.`;
    save(); render();
  },
  'edit-task': id => { ui.editTask = id; render(); },
  'cancel-task-edit': () => { ui.editTask = null; render(); },
  'del-activity': id => {
    const a = byId(data.activities, id);
    if (!a || !confirm(`¿Eliminar «${a.name}»?`)) return;
    data.activities = data.activities.filter(x => !same(x.id, id));
    data.log = data.log.filter(l => !same(l.activityId, id));
    if (same(ui.editActivity, id)) ui.editActivity = null;
    save(); render();
  },
  'rename-stack': name => {
    const n = prompt('Nuevo nombre de la categoría', name);
    if (n && n.trim()) { data.activities.forEach(a => { if (a.stack === name) a.stack = n.trim(); }); save(); render(); }
  },
  suggest,
  'toggle-settings': () => { ui.calSettings = !ui.calSettings; render(); },
  'week-prev': () => { ui.weekOffset--; render(); },
  'week-next': () => { ui.weekOffset++; render(); },
  'week-today': () => { ui.weekOffset = 0; render(); },
  'del-event': id => { data.events = data.events.filter(e => !same(e.id, id)); save(); render(); },
  'del-routine': id => { data.routines = data.routines.filter(r => !same(r.id, id)); if (same(ui.editRoutine, id)) ui.editRoutine = null; save(); render(); },
  'edit-routine': id => { ui.editRoutine = id; ui.calSettings = true; render(); const p = $('#routine-form'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  'cancel-routine-edit': () => { ui.editRoutine = null; render(); },
  'toggle-work': id => { const sp = byId(data.spaces, id); if (!sp) return; sp.work = !isWorkSpace(sp); save(); render(); },
  'log-hobby': id => {
    const a = byId(data.activities, id); if (!a) return;
    data.log.push({ id: uid(), date: today(), activityId: a.id, minutes: +a.minutes || 0 });
    save(); render();
  },
  'plan-add-all': (id, b) => {
    let items; try { items = JSON.parse(b.dataset.items); } catch { return; }
    let st = +b.dataset.start;
    for (const i of items) {
      const m = Math.max(5, Math.min(+i.min || 30, 1439 - st));
      let text = 'Descansar un rato';
      if (i.kind === 'task') { const t = byId(data.tasks, i.ref); if (!t) continue; text = t.name; }
      else if (i.kind === 'hobby') { const a = byId(data.activities, i.ref); if (!a) continue; text = a.name; }
      data.plan.push({ id: uid(), date: today(), start: fmtMin(st), end: fmtMin(st + m), kind: i.kind, refId: i.ref || '', text, done: false });
      st += m;
    }
    save(); render();
  },
  'sugg-shuffle': id => { ui.shuffle[id] = (ui.shuffle[id] || 0) + 1; render(); },
  'del-log': id => { data.log = data.log.filter(l => !same(l.id, id)); save(); render(); },
  'plan-add': (id, b) => {
    const d = b.dataset, st = +d.start, m = Math.max(5, Math.min(+d.min || 30, 1439 - st));
    let text = 'Descansar un rato';
    if (d.kind === 'task') { const t = byId(data.tasks, d.ref); if (!t) return; text = t.name; }
    else if (d.kind === 'hobby') { const a = byId(data.activities, d.ref); if (!a) return; text = a.name; }
    data.plan.push({ id: uid(), date: today(), start: fmtMin(st), end: fmtMin(st + m), kind: d.kind, refId: d.ref || '', text, done: false });
    save(); render();
  },
  'del-plan': id => {
    data.plan = data.plan.filter(p => !same(p.id, id));
    data.log = data.log.filter(l => !same(l.planId, id));
    save(); render();
  },
  'clear-ics': () => {
    if (!confirm('¿Quitar todos los eventos importados desde .ics?')) return;
    data.events = data.events.filter(e => e.src !== 'ics'); save(); render();
  },
  export: () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'planet-me-backup.json'; a.click();
    URL.revokeObjectURL(a.href);
  }
};

/* ---------- Formularios ---------- */
const forms = {
  'task-form': f => {
    data.tasks.push({ id: uid(), name: f.name.value.trim(), date: f.date.value, spaceId: f.space.value, minutes: +f.minutes.value || 0, priority: f.priority.value, done: false });
    save(); render();
  },
  'dump-form': f => {
    const n = new Date(), created = `${ymd(n)}T${hm(n)}`;
    f.text.value.split(/\r?\n/).map(l => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean)
      .forEach(text => data.dump.push({ id: uid(), text, created }));
    save(); render();
  },
  'task-edit-form': f => {
    const t = byId(data.tasks, f.dataset.id); if (!t) return;
    Object.assign(t, { name: f.name.value.trim(), date: f.date.value, spaceId: f.space.value, minutes: +f.minutes.value || 0, priority: f.priority.value });
    ui.editTask = null; save(); render();
  },
  'space-form': f => {
    const name = f.name.value.trim(); if (!name) return;
    const sp = { id: uid(), name, color: COLORS[data.spaces.length % COLORS.length], work: !!(f.work && f.work.checked) || WORK_RE.test(name) };
    data.spaces.push(sp); save(); render();
  },
  'log-form': f => {
    const a = byId(data.activities, f.hobby.value), date = f.date.value;
    if (!a || !date) return;
    if (date > today()) { alert('Esa fecha todavía no ha llegado.'); return; }
    data.log.push({ id: uid(), date, activityId: a.id, minutes: +a.minutes || 0 });
    save(); render();
  },
  'activity-form': f => {
    const item = { name: f.name.value.trim(), stack: f.stack.value.trim(), minutes: +f.minutes.value || 20, energy: f.energy.value, tags: f.tags.value.trim(), goal: Math.max(0, Math.min(14, Math.round(+f.goal.value || 0))) };
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
    const r = { name: f.name.value.trim(), days, start: f.start.value, end: f.end.value, work: !!f.work.checked };
    const edit = byId(data.routines, ui.editRoutine);
    if (edit) Object.assign(edit, r); else data.routines.push({ id: uid(), ...r });
    ui.editRoutine = null; save(); render();
  },
  'settings-form': f => {
    if (toMin(f.dayEnd.value) <= toMin(f.dayStart.value)) { alert('El final de la jornada debe ser posterior al inicio.'); return; }
    Object.assign(data.settings, { dayStart: f.dayStart.value, dayEnd: f.dayEnd.value, workLimit: Math.max(1, Math.min(16, +f.workLimit.value || 6)) });
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
    if (task) { task.done = t.checked; task.doneAt = t.checked ? today() : ''; save(); render(); }
  } else if (t.dataset.plan !== undefined) {
    const pl = byId(data.plan, t.dataset.plan);
    if (pl) {
      pl.done = t.checked;
      if (pl.kind === 'task') { const tk = byId(data.tasks, pl.refId); if (tk) { tk.done = t.checked; tk.doneAt = t.checked ? pl.date : ''; } }
      if (pl.kind === 'hobby') { // hacerlo en tu día cuenta como sesión en el tracker
        data.log = data.log.filter(l => !same(l.planId, pl.id));
        const a = byId(data.activities, pl.refId);
        if (t.checked && a) data.log.push({ id: uid(), date: pl.date, activityId: a.id, minutes: Math.max(5, toMin(pl.end) - toMin(pl.start)), planId: pl.id });
      }
      save(); render();
    }
  } else if (t.dataset.logdate !== undefined) {
    const l = byId(data.log, t.dataset.logdate);
    if (l && t.value && t.value <= today()) { l.date = t.value; save(); }
    render();
  } else if (t.closest && t.closest('#theme-form')) {
    data.settings.season = t.form.season.value; data.settings.phase = t.form.phase.value;
    save(); applyTheme(); render();
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

app.addEventListener('input', e => { // al escribir un hobby, sugiere minutos, energía, categoría y veces por semana
  const t = e.target, f = t.form;
  if (!f || f.id !== 'activity-form') return;
  if (t.name === 'name' && !ui.editActivity) applyHobbyHint(f);
  else if (['minutes', 'energy', 'stack', 'tags', 'goal'].includes(t.name)) f.dataset['t' + t.name] = '1';
});

$$('.nav').forEach(b => b.onclick = () => page(b.dataset.view));
$('.brand').addEventListener('click', e => { e.preventDefault(); page('today'); });
$('#top-account').addEventListener('click', () => {
  const S = window.LifeSync && window.LifeSync.state;
  if (!S) return;
  if (!S.user) { window.LifeSync.signIn(); return; }
  page('space');
  const p = $('#account-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
applyTheme();
render();
setInterval(applyTheme, 10 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) applyTheme(); });

if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {})); }
