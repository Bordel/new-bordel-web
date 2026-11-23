/* calendar.js — teletext-style month calendar. Plain JS, no dependencies. */
(function () {
  'use strict';

  /* ===== 1. Settings ===== */
  const CONFIG = {
    timeZone: 'Europe/Prague',     // event times are in this zone
    weekStartsOn: 1,               // 1 = Monday, 0 = Sunday
    maxChipsPerDay: 3,             // more than this shows "+N MORE"
    upcomingCount: 5,              // items in "NEXT UP"
    calendarName: 'Bordel events',
    defaultDurationMin: 120
  };

  /* ===== 2. Elements ===== */
  const $ = (id) => document.getElementById(id);
  const el = {
    date: $('tt-date'),
    clock: $('tt-clock'),
    lastUpdate: $('last-update'),
    monthTitle: $('month-title'),
    prevLabel: $('prev-label'),
    nextLabel: $('next-label'),
    weekdays: $('weekdays'),
    grid: $('grid'),
    legendToday: $('legend-today'),
    dayTitle: $('day-title'),
    dayEvents: $('day-events'),
    upcoming: $('upcoming'),
    status: $('status'),
    views: { day: $('view-day'), keys: $('view-keys'), help: $('view-help') }
  };

  /* ===== 3. Date helpers =====
   * "Day keys" are plain strings like "2026-11-21"; all grid math uses them,
   * so the calendar is never off by a day because of time zones. */
  const pad = (n) => String(n).padStart(2, '0');
  const makeKey = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const splitKey = (k) => k.split('-').map(Number);
  const keyToUTC = (k) => { const [y, m, d] = splitKey(k); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (k, n) => { const t = keyToUTC(k); t.setUTCDate(t.getUTCDate() + n); return makeKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const weekday = (k) => keyToUTC(k).getUTCDay();
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  function zoned(date) {
    const p = {};
    partsFmt.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
  }
  const keyOf = (date) => { const z = zoned(date); return makeKey(z.y, z.m, z.d); };

  // "2026-11-21 19:00 in Prague" → real Date (handles summer/winter time)
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

  const fmtTime    = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtMonth   = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const fmtMon3    = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });
  const fmtDayLong = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWdShort = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' });
  const fmtHead    = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, weekday: 'short', day: '2-digit', month: 'short' });
  const fmtStamp   = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

  const up = (s) => String(s || '').toUpperCase();
  const typeKey = (t) => String(t || 'event').toLowerCase().replace(/[^a-z]/g, '') || 'event';
  function shortDay(k) {
    const [, m, d] = splitKey(k);
    return up(fmtWdShort.format(keyToUTC(k))).slice(0, 2) + ' ' + pad(d) + '.' + pad(m);
  }

  /* ===== 4. Load events (and expand weekly repeats) ===== */
  const occurrences = [];
  const MAX_DURATION_MIN = 14 * 24 * 60;   // same limit as the signed-event bot (add_event.py)
  // ids written in the data; a made-up id never takes one of them, and a repeated id gets -2, -3 ...
  const explicitIds = new Set((window.EVENTS || []).map((e) => (e && e.id != null ? String(e.id).trim() : '')).filter(Boolean));
  const takenIds = new Set();
  (window.EVENTS || []).forEach((src) => {
    const start = parseStart(src.start);
    if (!start) { console.warn('[calendar] Bad start date, skipped:', src); return; }
    const raw = src.durationMin;
    let mins = raw == null || raw === '' ? CONFIG.defaultDurationMin
             : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw)   // '240' is fine
             : raw;                                                            // true, '0x78', [90] are not
    if (typeof mins !== 'number' || !Number.isFinite(mins) || mins <= 0) {
      console.warn('[calendar] Bad durationMin (must be a number of minutes), using the default:', src);
      mins = CONFIG.defaultDurationMin;
    }
    // too long: shortened, not dropped. Weekly events stop before the next week starts.
    const maxMins = src.repeat === 'weekly' ? 7 * 24 * 60 : MAX_DURATION_MIN;
    if (mins > maxMins) {
      console.warn('[calendar] durationMin too long, shortened to ' + maxMins + ' minutes:', src);
      mins = maxMins;
    }
    const dur = mins * 60000;
    // every event needs a text id (file names, .ics UID, the ADD button); make one if it is missing
    const ownId = src.id == null ? '' : String(src.id).trim();
    let base = ownId;
    if (!base) {
      // title + local date, made the same way as add_event.py makes ids
      const z = zoned(start);
      base = (String(src.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
               .slice(0, 40).replace(/-+$/, '') || 'event') + '-' + z.y + pad(z.m) + pad(z.d);
    }
    const free = (u) => !takenIds.has(u) && (u === ownId || !explicitIds.has(u));
    let id = base;
    for (let n = 2; !free(id); n++) id = base + '-' + n;
    takenIds.add(id);
    if (!ownId) console.warn('[calendar] Event without an id, using "' + id + '":', src);
    else if (id !== ownId) console.warn('[calendar] Id "' + ownId + '" is used twice, this one becomes "' + id + '":', src);
    const add = (s, uid) => occurrences.push(Object.assign({}, src, {
      uid, start: s, end: new Date(s.getTime() + dur), dayKey: keyOf(s), type: typeKey(src.type)
    }));
    if (src.repeat === 'weekly') {
      const z = zoned(start);
      const first = makeKey(z.y, z.m, z.d);
      const until = src.until || addDays(first, 7 * 52);
      const except = src.except || [];
      for (let k = first; k <= until; k = addDays(k, 7)) {
        if (except.includes(k)) continue;
        const [y, m, d] = splitKey(k);
        add(fromWallClock(y, m, d, z.h, z.min), id + '-' + k);
      }
    } else {
      add(start, id);
    }
  });
  occurrences.sort((a, b) => a.start - b.start);

  // an event is listed on every day it covers (multi-day events, e.g. a 4-day congress)
  const byDay = new Map();
  occurrences.forEach((o) => {
    o.endKey = keyOf(new Date(Math.max(o.start.getTime(), o.end.getTime() - 1)));
    for (let k = o.dayKey; k <= o.endKey; k = addDays(k, 1)) {
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(o);
    }
  });

  /* ===== 5. State ===== */
  // `let`: updated by tick() when the date changes while the page stays open
  let todayKey = keyOf(new Date());
  let [ty, tm, td] = splitKey(todayKey);
  const endedCount = () => { const now = Date.now(); return occurrences.filter((o) => o.end.getTime() < now).length; };
  let ended = endedCount();
  let lastMinute = -1;
  const state = { y: ty, m: tm, selected: todayKey, view: 'day' };

  /* ===== 6. Rendering ===== */
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent = safe, no HTML injection
    return n;
  }

  function renderWeekdays() {
    el.weekdays.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const k = addDays('2024-01-01', (CONFIG.weekStartsOn + 6 + i) % 7);   // 2024-01-01 was a Monday
      const wd = weekday(k);
      el.weekdays.append(node('span', wd === 0 || wd === 6 ? 'is-weekend' : '', up(fmtWdShort.format(keyToUTC(k))).slice(0, 2)));
    }
  }

  function renderGrid() {
    const title = node('span', '', up(fmtMonth.format(keyToUTC(makeKey(state.y, state.m, 1)))));
    el.monthTitle.replaceChildren(title);
    const prev = new Date(Date.UTC(state.y, state.m - 2, 1));
    const next = new Date(Date.UTC(state.y, state.m, 1));
    const navLabel = (d) => [up(fmtMon3.format(d)).slice(0, 3), node('span', 'yr', ' ' + d.getUTCFullYear())];
    el.prevLabel.replaceChildren('◄ ', ...navLabel(prev));
    el.nextLabel.replaceChildren(...navLabel(next), ' ►');

    const first = makeKey(state.y, state.m, 1);
    const lead = (weekday(first) - CONFIG.weekStartsOn + 7) % 7;
    const start = addDays(first, -lead);
    const weeks = Math.ceil((lead + daysInMonth(state.y, state.m)) / 7);

    el.grid.replaceChildren();
    for (let i = 0; i < weeks * 7; i++) {
      const k = addDays(start, i);
      const [, m, d] = splitKey(k);

      // Days of other months stay empty, like on teletext
      if (m !== state.m) { const e = node('div', 'day--empty'); e.setAttribute('aria-hidden', 'true'); el.grid.append(e); continue; }

      const events = byDay.get(k) || [];
      const wd = weekday(k);
      const cell = node('button', 'day');
      cell.type = 'button';
      cell.dataset.day = k;
      cell.tabIndex = k === state.selected ? 0 : -1;
      if (k === todayKey) cell.classList.add('is-today');
      if (k < todayKey) cell.classList.add('is-past');
      if (wd === 0 || wd === 6) cell.classList.add('is-weekend');
      if (k === state.selected) { cell.classList.add('is-selected'); cell.setAttribute('aria-current', 'date'); }

      cell.append(node('span', 'day__num', k === todayKey ? '[' + d + ']' : String(d)));
      events.slice(0, CONFIG.maxChipsPerDay).forEach((ev) => {
        const chip = node('span', 'chip type--' + ev.type);
        chip.append(node('span', 'chip__time', k === ev.dayKey ? fmtTime.format(ev.start) : '»')   /* » = continues from an earlier day */, document.createTextNode(' '), node('span', 'chip__text', up(ev.title)));
        cell.append(chip);
      });
      if (events.length > CONFIG.maxChipsPerDay) {
        cell.append(node('span', 'more', '+' + (events.length - CONFIG.maxChipsPerDay) + ' MORE'));
      }

      cell.setAttribute('aria-label', fmtDayLong.format(keyToUTC(k)) + (k === todayKey ? ', today' : '') + ': ' +
        (events.length ? events.map((e) => e.title).join(', ') : 'no events'));
      el.grid.append(cell);
    }
  }

  function renderDayPanel() {
    const k = state.selected;
    el.dayTitle.textContent = up(fmtDayLong.format(keyToUTC(k))) + (k === todayKey ? ' · TODAY' : '');
    el.dayEvents.replaceChildren();

    const events = byDay.get(k) || [];
    if (!events.length) {
      const e = node('div', 'ev');
      e.append(node('p', 'empty', 'NO EVENTS ON THIS DAY.'));
      el.dayEvents.append(e);
    }

    events.forEach((ev) => {
      const art = node('article', 'ev');
      art.append(node('p', 'ev__time', ev.endKey !== ev.dayKey
        ? shortDay(ev.dayKey) + ' ' + fmtTime.format(ev.start) + ' – ' + shortDay(keyOf(ev.end)) + ' ' + fmtTime.format(ev.end)
        : fmtTime.format(ev.start) + '-' + fmtTime.format(ev.end)));
      art.append(node('h3', 'ev__title', up(ev.title)));
      const meta = node('p', 'ev__where');
      meta.append(node('span', 'tag type--' + ev.type, up(ev.type)));
      if (ev.location) meta.append(document.createTextNode(' ' + up(ev.location)));
      art.append(meta);
      if (ev.bring) {
        const b = node('p', 'ev__bring');
        b.append(node('span', 'ev__bring-label', 'BRING'), document.createTextNode(' ' + up(ev.bring)));
        art.append(b);
      }
      if (ev.description) art.append(withLinks(node('p', 'ev__desc'), ev.description, ev.links));
      if (ev.end.getTime() >= Date.now()) {
        const b = node('button', 'ev__ics', '► ADD TO MY CALENDAR');
        b.type = 'button';
        b.dataset.ics = ev.uid;
        art.append(b);
      }
      el.dayEvents.append(art);
    });

    el.upcoming.replaceChildren();
    const now = Date.now();
    const next = occurrences.filter((o) => o.end.getTime() >= now).slice(0, CONFIG.upcomingCount);
    if (!next.length) el.upcoming.append(node('li', 'empty', 'NOTHING SCHEDULED YET.'));
    next.forEach((o) => {
      const li = node('li');
      const b = node('button');
      b.type = 'button';
      b.dataset.goto = o.dayKey;
      b.append(node('span', 'u-date', shortDay(o.dayKey)), node('span', 'u-time', fmtTime.format(o.start)), node('span', 'u-title', up(o.title)));
      li.append(b);
      el.upcoming.append(li);
    });
  }

  function showView(name) {
    if (typeof showPage === 'function') showPage(name === 'keys' ? 400 : name === 'help' ? 500 : 300);
    state.view = name;
    Object.entries(el.views).forEach(([key, n]) => { n.hidden = key !== name; });
    document.querySelectorAll('[data-key="?"][aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', String(name === 'help')));
    document.querySelectorAll('[data-key="k"][aria-pressed]').forEach((b) => b.setAttribute('aria-pressed', String(name === 'keys')));
  }
  const toggleView = (name) => showView(state.view === name ? 'day' : name);

  /* ===== 7. Navigation ===== */
  function selectDay(k, focus) {
    const [y, m] = splitKey(k);
    state.selected = k;
    state.y = y;
    state.m = m;
    renderGrid();
    renderDayPanel();
    showView('day');
    try { history.replaceState(null, '', '#' + k); } catch (err) { /* file:// in some browsers */ }
    if (focus) {
      const cell = el.grid.querySelector('[data-day="' + k + '"]');
      if (cell) cell.focus();
    }
  }

  function changeMonth(delta, focus) {
    const t = new Date(Date.UTC(state.y, state.m - 1 + delta, 1));
    const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
    // Land on today if it's in that month, otherwise the first event, otherwise the 1st
    let k = makeKey(y, m, 1);
    if (y === ty && m === tm) k = todayKey;
    else {
      const monthEnd = makeKey(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());       // last day of the month
      const first = occurrences.find((o) => o.dayKey <= monthEnd && o.endKey >= k);   // overlaps this month
      if (first) k = first.dayKey > k ? first.dayKey : k;                             // still running on the 1st -> the 1st
    }
    selectDay(k, focus);
  }

  let statusTimer;
  function setStatus(text) {
    el.status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.status.textContent = ''; }, 3000);
  }

  // from event-links.js (shared with the other view). If that file failed to load (blocked, or an
  // old cached page), descriptions just show as plain text instead of breaking the whole page.
  if (!window.BordelLinks) console.warn('[calendar] event-links.js did not load: descriptions are shown without links (.ics exports still list them).');
  const { withLinks, linkLines } = window.BordelLinks || {
    withLinks: (parent, text) => { parent.replaceChildren(String(text || '')); return parent; },
    // .ics links don't need the shared file: same rules (http(s) URLs only), written out here
    linkLines: (ev) => (ev.links && typeof ev.links === 'object' ? Object.entries(ev.links) : [])
      .filter(([t, u]) => t && typeof u === 'string' && /^https?:\/\//i.test(u)).map(([t, u]) => t + ': ' + u)
  };

  /* ===== 8. Calendar (.ics) export ===== */
  const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
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
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hacktext//calendar//EN', 'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:' + icsText(CONFIG.calendarName)];
    events.forEach((ev) => {
      lines.push('BEGIN:VEVENT', 'UID:' + icsText(ev.uid) + '@' + host, 'DTSTAMP:' + stamp,
        'DTSTART:' + icsDate(ev.start), 'DTEND:' + icsDate(ev.end), 'SUMMARY:' + icsText(ev.title));
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

  /* ===== 9. Actions ===== */
  const ACTIONS = {
    p: () => changeMonth(-1, false),                 // red
    n: () => changeMonth(1, false),                  // yellow
    t: () => selectDay(todayKey, true),              // green
    s: () => {                                       // cyan / blue
      const next = occurrences.filter((o) => o.end.getTime() >= Date.now());
      if (!next.length) return setStatus('NOTHING TO DOWNLOAD.');
      download('events.ics', buildIcs(next));
      setStatus('DOWNLOADING EVENTS.ICS ...');
    },
    k: () => toggleView('keys'),                     // same key / link again closes it
    '?': () => toggleView('help'),
    back: () => showView('day'),
    v: () => { location.href = 'list/'; }
  };

  // Teletext remote: R G Y B = the 4 coloured Fastext buttons
  const KEYMAP = { r: 'p', g: 't', y: 'n', b: 's', p: 'p', n: 'n', t: 't', s: 's', k: 'k', '?': '?', v: 'v' };

  document.addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) return selectDay(day.dataset.day, false);
    const go = e.target.closest('[data-goto]');
    if (go) return selectDay(go.dataset.goto, true);
    const ics = e.target.closest('[data-ics]');
    if (ics) {
      const ev = occurrences.find((o) => o.uid === ics.dataset.ics);
      if (ev) { download(ev.uid + '.ics', buildIcs([ev])); setStatus('DOWNLOADING ' + up(ev.uid) + '.ICS ...'); }
      return;
    }
    const btn = e.target.closest('[data-key]');
    if (btn && ACTIONS[btn.dataset.key]) ACTIONS[btn.dataset.key]();
  });

  const ARROWS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const inGrid = !!e.target.closest('#grid') || e.target === document.body;
    if (ARROWS[e.key] && inGrid) { e.preventDefault(); selectDay(addDays(state.selected, ARROWS[e.key]), true); return; }
    if (e.key === 'PageUp')   { e.preventDefault(); changeMonth(-1, true); return; }
    if (e.key === 'PageDown') { e.preventDefault(); changeMonth(1, true); return; }
    if (e.key === 'Escape')   { showView('day'); return; }
    if (e.key === 'F1')       { e.preventDefault(); toggleView('help'); return; }

    const action = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : ''];
    if (action) { e.preventDefault(); ACTIONS[action](); }
  });

  /* ===== 9b. Teletext remote: type a 3-digit page number =====
   * Add or change pages here. */
  // Pages that go to another URL return LEFT, so the counter isn't changed
  // (otherwise the back button restores this page still showing e.g. P100).
  const LEFT = {};
  const leave = (url) => { location.href = url; return LEFT; };
  const PAGES = {
    100: () => leave('../'),                         // Bordel home
    200: () => leave('list/'),                       // event list
    300: () => selectDay(todayKey, true),            // calendar, today
    400: () => showView('keys'),
    500: () => showView('help')
  };
  for (let i = 1; i <= 12; i++) {                    // 301–312 = Jan–Dec (next time that month comes round)
    PAGES[300 + i] = () => {
      const y = i < tm ? ty + 1 : ty;
      changeMonth((y - state.y) * 12 + (i - state.m), true);
    };
  }

  const tt = { page: $('tt-page'), current: $('tt-current'), keypad: $('keypad') };
  const remote = { typed: '', shown: 300, timer: null, roll: null };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showPage(n) {
    remote.shown = n;
    tt.page.textContent = 'P' + n;
    tt.current.textContent = String(n);
  }
  function cancelTyping() {
    clearTimeout(remote.timer);
    remote.typed = '';
    tt.page.textContent = 'P' + remote.shown;
  }
  function typeDigit(d) {
    if (remote.roll) return;                         // still searching for the last page
    remote.typed += d;
    tt.page.textContent = 'P' + remote.typed.padEnd(3, '-');
    clearTimeout(remote.timer);
    if (remote.typed.length < 3) { remote.timer = setTimeout(cancelTyping, 4000); return; }

    const n = +remote.typed;
    remote.typed = '';
    if (!PAGES[n]) {
      setStatus('PAGE ' + n + ' NOT IN SERVICE · TRY 500 FOR THE INDEX');
      remote.timer = setTimeout(() => { tt.page.textContent = 'P' + remote.shown; }, 1500);
      return;
    }
    // Real teletext "searches": the page counter rolls until the page arrives
    const open = () => {
      remote.roll = null; closeKeypad();
      if (PAGES[n]() === LEFT) showPage(remote.shown); else showPage(n);
    };
    if (reduceMotion) return open();
    let c = remote.shown, steps = 0;
    remote.roll = setInterval(() => {
      c = c >= 899 ? 100 : c + 1 + Math.floor(Math.random() * 7);
      tt.current.textContent = String(c);
      if (++steps >= 12) { clearInterval(remote.roll); open(); }
    }, 45);
  }

  // Coming back via the browser's back/forward button: reset the remote
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    clearInterval(remote.roll); remote.roll = null;
    clearTimeout(remote.timer); remote.typed = '';
    closeKeypad();
    showPage(remote.shown);
  });

  function closeKeypad() { tt.keypad.hidden = true; tt.page.setAttribute('aria-expanded', 'false'); }
  tt.page.addEventListener('click', () => {
    tt.keypad.hidden = !tt.keypad.hidden;
    tt.page.setAttribute('aria-expanded', String(!tt.keypad.hidden));
  });
  tt.keypad.addEventListener('click', (e) => {
    const b = e.target.closest('[data-digit]');
    if (b) typeDigit(b.dataset.digit);
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(e.key); }
    else if (e.key === 'Escape') { cancelTyping(); closeKeypad(); }
  });


  function tick() {
    const now = new Date();
    const z = zoned(now);
    el.date.textContent = fmtHead.format(now).replace(',', '');
    el.clock.textContent = pad(z.h) + ':' + pad(z.min) + '/' + pad(z.s);
    if (z.min === lastMinute) return;   // the checks below only need to run once a minute
    lastMinute = z.min;                 // (not "when seconds == 0": background tabs may skip that tick)
    const k = keyOf(now);
    if (k !== todayKey) {               // midnight passed: move the TODAY marker
      todayKey = k;
      [ty, tm, td] = splitKey(k);
      el.legendToday.textContent = '[' + td + ']';
      renderGrid();
      renderDayPanel();
      ended = endedCount();
    } else if (endedCount() !== ended) { // an event just ended: refresh NEXT UP
      ended = endedCount();
      renderDayPanel();
    }
  }
  tick();
  setInterval(tick, 1000);

  /* ===== 11. Start ===== */
  el.lastUpdate.textContent = up(fmtStamp.format(new Date(document.lastModified)));
  el.legendToday.textContent = '[' + td + ']';
  renderWeekdays();

  // Open a shared link like page.html#2026-11-21 (or #2026-11)
  const hash = /^#(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(location.hash);
  const hy = hash && +hash[1], hm = hash && +hash[2], hd = hash && (hash[3] ? +hash[3] : 1);
  const validHash = hash && hy >= 1970 && hy <= 9999 && hm >= 1 && hm <= 12 && hd >= 1 && hd <= daysInMonth(hy, hm);   // not #2026-13, #2026-02-30 or #0005-03
  selectDay(validHash ? makeKey(hy, hm, hd) : todayKey, false);
})();
