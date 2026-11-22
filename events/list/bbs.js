/* bbs.js — BBS-style event board. Plain JS, no dependencies. */
(function () {
  'use strict';

  /* ===== 1. Settings ===== */
  const CONFIG = {
    timeZone: 'Europe/Prague',      // times are shown in this zone
    sessionMinutes: 60,             // "TIME LEFT" countdown
    boot: true,                     // modem dial-up intro (once per visit)
    calendarName: 'Bordel events',
    defaultDurationMin: 120
  };

  const BOOT_LINES = [
    'ATZ',
    'OK',
    'ATDT 555-0199',
    '',
    'CONNECT 14400/ARQ/V.42BIS',
    '',
    'WELCOME TO BORDEL BBS'
  ];

  /* ===== 2. Grab elements ===== */
  const $ = (id) => document.getElementById(id);
  const el = {
    viewTitle: $('view-title'),
    lastUpdate: $('last-update'),
    rows: $('rows'),
    empty: $('empty'),
    status: $('status'),
    timeLeft: $('time-left'),
    boot: $('boot'),
    bootText: $('boot-text'),
    carrier: $('carrier'),
    views: {
      list: $('view-list'),
      detail: $('view-detail'),
      keys: $('view-keys'),
      help: $('view-help')
    },
    d: {
      title: $('d-title'), when: $('d-when'), where: $('d-where'),
      type: $('d-type'), bring: $('d-bring'), bringRow: $('d-bring-row'), desc: $('d-desc')
    }
  };

  /* ===== 3. Prepare the data =====
   * Same format as the calendar view: start is "YYYY-MM-DD HH:MM" in
   * CONFIG.timeZone (or full ISO with offset), weekly repeats are expanded. */
  const pad = (n) => String(n).padStart(2, '0');
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  function zoned(date) {
    const p = {};
    partsFmt.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
  }
  function offsetMs(date) {
    const z = zoned(date);
    return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s) - Math.floor(date.getTime() / 1000) * 1000;
  }
  function fromWallClock(y, m, d, h, min) {
    const guess = Date.UTC(y, m - 1, d, h, min);
    let t = guess - offsetMs(new Date(guess));
    t = guess - offsetMs(new Date(t));
    return new Date(t);
  }
  function parseStart(str) {
    if (/([zZ]|[+-]\d\d:?\d\d)$/.test(str)) { const d = new Date(str); return isNaN(d) ? null : d; }
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(str).trim());
    return m ? fromWallClock(+m[1], +m[2], +m[3], +m[4], +m[5]) : null;
  }
  const addDays = (k, n) => {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  };

  const all = [];
  (window.EVENTS || []).forEach((src) => {
    const start = parseStart(src.start);
    if (!start) { console.warn('[bbs] Bad start date, skipped:', src); return; }
    const dur = (src.durationMin || CONFIG.defaultDurationMin) * 60000;
    const add = (s, uid) => all.push(Object.assign({}, src, { id: uid, start: s, end: new Date(s.getTime() + dur) }));

    if (src.repeat === 'weekly') {
      const z = zoned(start);
      const first = z.y + '-' + pad(z.m) + '-' + pad(z.d);
      const until = src.until || addDays(first, 7 * 52);
      const except = src.except || [];
      for (let k = first; k <= until; k = addDays(k, 7)) {
        if (except.includes(k)) continue;
        const [y, m, d] = k.split('-').map(Number);
        add(fromWallClock(y, m, d, z.h, z.min), src.id + '-' + k);
      }
    } else {
      add(start, src.id);
    }
  });
  all.sort((a, b) => a.start - b.start);

  // Split into upcoming / archive. Re-run as time passes, so a tab left open stays correct.
  let upcoming = [], archive = [];
  function splitByNow() {
    const now = Date.now();
    const next = all.filter((e) => e.end.getTime() >= now);
    const changed = next.length !== upcoming.length;
    upcoming = next;
    archive = all.filter((e) => e.end.getTime() < now).reverse(); // newest first
    return changed;
  }
  splitByNow();

  const state = {
    view: 'list',
    listName: 'upcoming',
    list: upcoming,
    index: 0,
    booting: false,
    carrierLost: false
  };

  /* ===== 4. Date formatting ===== */
  const fmtShort = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtTime  = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtLong  = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtStamp = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

  function parts(fmt, d) {
    const out = {};
    fmt.formatToParts(d).forEach((p) => { out[p.type] = p.value; });
    return out;
  }
  const shortDate = (d) => { const p = parts(fmtShort, d); return (p.weekday + ' ' + p.day + '.' + p.month).toUpperCase(); };
  const typeKey = (t) => String(t || 'event').toLowerCase().replace(/[^a-z]/g, '') || 'event';

  /* ===== 5. Rendering ===== */
  function span(cls, text) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;           // textContent = safe, no HTML injection
    return s;
  }

  function renderList() {
    el.rows.replaceChildren();
    el.empty.hidden = state.list.length > 0;

    state.list.forEach((ev, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row cols';
      btn.append(
        span('date', shortDate(ev.start)),
        span('time', fmtTime.format(ev.start)),
        span('title', ev.title.toUpperCase()),
        span('type type--' + typeKey(ev.type), (ev.type || 'event').toUpperCase())
      );
      btn.addEventListener('click', () => { select(i, false); openDetail(); });
      btn.addEventListener('focus', () => select(i, false));
      li.append(btn);
      el.rows.append(li);
    });
    select(state.index, false);
  }

  function rowButtons() { return el.rows.querySelectorAll('.row'); }

  function select(i, focus = true) {
    const rows = rowButtons();
    if (!rows.length) return;
    state.index = Math.max(0, Math.min(i, rows.length - 1));
    rows.forEach((r, n) => r.classList.toggle('is-selected', n === state.index));
    if (focus) rows[state.index].focus();
  }

  function showView(name) {
    state.view = name;
    Object.entries(el.views).forEach(([key, node]) => { node.hidden = key !== name; });
    const titles = { list: state.listName === 'archive' ? 'ARCHIVE' : 'EVENTS', detail: 'DETAILS', keys: 'KEYS', help: 'HELP' };
    el.viewTitle.textContent = titles[name];
    if (name === 'list') select(state.index);
  }

  function setList(name) {
    splitByNow();
    state.listName = name;
    state.list = name === 'archive' ? archive : upcoming;
    state.index = 0;
    renderList();
    showView('list');
  }

  function openDetail() {
    const ev = state.list[state.index];
    if (!ev) return;
    el.d.title.textContent = ev.title.toUpperCase();
    const endDay = new Date(Math.max(ev.start.getTime(), ev.end.getTime() - 1));
    el.d.when.textContent = fmtLong.format(ev.start) === fmtLong.format(endDay)
      ? fmtLong.format(ev.start).toUpperCase() + ' · ' + fmtTime.format(ev.start) + '–' + fmtTime.format(ev.end)
      : (fmtLong.format(ev.start) + ' ' + fmtTime.format(ev.start) + ' – ' + fmtLong.format(ev.end) + ' ' + fmtTime.format(ev.end)).toUpperCase();
    el.d.where.textContent = (ev.location || 'TBA').toUpperCase();
    el.d.type.textContent = (ev.type || 'event').toUpperCase();
    el.d.bring.textContent = (ev.bring || '').toUpperCase();
    el.d.bringRow.hidden = !ev.bring;
    withLinks(el.d.desc, ev.description, ev.links);
    showView('detail');
  }

  function back() {
    if (state.view !== 'list') showView('list');
  }

  let statusTimer;
  function setStatus(text) {
    el.status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.status.textContent = ''; }, 3000);
  }

  /* Description text with optional links: ev.links = { 'phrase in the text': 'https://...' }.
     Each phrase becomes a link (new tab); only http(s) URLs are used, text stays textContent. */
  function withLinks(parent, text, links) {
    const map = links && typeof links === 'object'
      ? Object.entries(links).filter(([t, u]) => t && typeof u === 'string' && /^https?:\/\//i.test(u)) : [];
    parent.replaceChildren();
    let rest = String(text || '');
    while (rest) {
      let best = null;
      for (const [t, u] of map) { const i = rest.indexOf(t); if (i !== -1 && (!best || i < best.i)) best = { i, t, u }; }
      if (!best) { parent.append(rest); break; }
      if (best.i) parent.append(rest.slice(0, best.i));
      const a = document.createElement('a');
      a.href = best.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = best.t;
      parent.append(a);
      rest = rest.slice(best.i + best.t.length);
    }
    return parent;
  }
  // links also go into the .ics description, as "phrase: url" lines
  const linkLines = (ev) => (ev.links && typeof ev.links === 'object')
    ? Object.entries(ev.links).filter(([, u]) => /^https?:\/\//i.test(u)).map(([t, u]) => t + ': ' + u) : [];

  /* ===== 6. Calendar (.ics) export ===== */
  const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261121T180000Z
  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const utf8 = new TextEncoder();
  function fold(line) {                 // .ics lines: max 75 bytes (UTF-8), never split a character
    const out = [];
    let cur = '', bytes = 0;
    for (const ch of line) {            // for...of walks whole code points, so emoji stay intact
      const b = utf8.encode(ch).length;
      if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function buildIcs(events) {
    const stamp = icsDate(new Date());
    const host = location.hostname || 'localhost';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bordel-bbs//events//EN', 'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:' + icsText(CONFIG.calendarName)];
    events.forEach((ev) => {
      lines.push('BEGIN:VEVENT',
        'UID:' + icsText(ev.id) + '@' + host,
        'DTSTAMP:' + stamp,
        'DTSTART:' + icsDate(ev.start),
        'DTEND:' + icsDate(ev.end),
        'SUMMARY:' + icsText(ev.title));
      if (ev.location) lines.push('LOCATION:' + icsText(ev.location));
      const desc = [ev.description, ...linkLines(ev), ev.bring && 'Bring: ' + ev.bring].filter(Boolean).join('\n');
      if (desc) lines.push('DESCRIPTION:' + icsText(desc));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ===== 7. Menu actions (keyboard letter → function) ===== */
  const ACTIONS = {
    v: () => { location.href = '../'; },
    e: () => setList('upcoming'),
    a: () => setList('archive'),
    k: () => showView('keys'),
    h: () => showView('help'),
    b: back,
    q: hangUp,
    s: () => {
      splitByNow();
      if (!upcoming.length) return setStatus('NOTHING TO DOWNLOAD.');
      download('events.ics', buildIcs(upcoming));
      setStatus('DOWNLOADING EVENTS.ICS ...');
    },
    c: () => {
      if (state.view !== 'detail') return;
      const ev = state.list[state.index];
      download(ev.id + '.ics', buildIcs([ev]));
      setStatus('DOWNLOADING ' + ev.id.toUpperCase() + '.ICS ...');
    }
  };

  // Clicks on any [X] button
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn && ACTIONS[btn.dataset.key]) ACTIONS[btn.dataset.key]();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state.booting) { e.preventDefault(); finishBoot(); return; }
    if (state.carrierLost) { e.preventDefault(); redial(); return; }

    const key = e.key;
    if (key === 'F1' || key === '?') { e.preventDefault(); showView('help'); return; }
    if (key === 'Escape') { back(); return; }

    if (state.view === 'list') {
      if (key === 'ArrowDown') { e.preventDefault(); select(state.index + 1); return; }
      if (key === 'ArrowUp')   { e.preventDefault(); select(state.index - 1); return; }
      if (key === 'Home')      { e.preventDefault(); select(0); return; }
      if (key === 'End')       { e.preventDefault(); select(state.list.length - 1); return; }
      // Enter on a focused button already fires "click"
      if (key === 'Enter' && !e.target.closest('button')) { openDetail(); return; }
    }

    if (key.length === 1 && ACTIONS[key.toLowerCase()]) {
      e.preventDefault();
      ACTIONS[key.toLowerCase()]();
    }
  });

  /* ===== 8. Session timer + hang up ===== */
  let remaining = CONFIG.sessionMinutes * 60;
  function drawTimer() {
    const m = Math.floor(remaining / 60), s = remaining % 60;
    el.timeLeft.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  setInterval(() => {
    if (state.carrierLost || state.booting) return;
    remaining = Math.max(0, remaining - 1);
    drawTimer();
    if (remaining === 0) hangUp();
  }, 1000);

  function hangUp() {
    state.carrierLost = true;
    el.carrier.hidden = false;
  }
  function redial() {
    state.carrierLost = false;
    el.carrier.hidden = true;
    remaining = CONFIG.sessionMinutes * 60;
    drawTimer();
    setList('upcoming');
  }
  el.carrier.addEventListener('click', redial);

  // Once a minute: move events that just ended from upcoming to archive (only redraw the list view,
  // so an open event detail keeps pointing at the right event).
  setInterval(() => {
    if (!splitByNow() || state.view !== 'list') return;
    state.list = state.listName === 'archive' ? archive : upcoming;
    renderList();
  }, 60000);

  /* ===== 9. Dial-up intro ===== */
  let bootTimer;
  function runBoot() {
    let seen = false;
    try { seen = sessionStorage.getItem('bbs-booted') === '1'; } catch (err) { /* storage blocked */ }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!CONFIG.boot || seen || reduceMotion) return start();

    state.booting = true;
    el.boot.hidden = false;
    const text = BOOT_LINES.join('\n');
    let i = 0;
    (function tick() {
      i++;
      el.bootText.textContent = text.slice(0, i);
      if (i < text.length) bootTimer = setTimeout(tick, text[i - 1] === '\n' ? 350 : 35);
      else bootTimer = setTimeout(finishBoot, 700);
    })();
  }
  function finishBoot() {
    if (!state.booting) return;
    clearTimeout(bootTimer);
    state.booting = false;
    el.boot.hidden = true;
    try { sessionStorage.setItem('bbs-booted', '1'); } catch (err) { /* ignore */ }
    start();
  }
  el.boot.addEventListener('click', finishBoot);

  /* ===== 10. Start ===== */
  function start() {
    renderList();
    showView('list');
  }

  el.lastUpdate.textContent = fmtStamp.format(new Date(document.lastModified)).replace(/ /g, '-').toUpperCase();
  drawTimer();
  runBoot();
})();
