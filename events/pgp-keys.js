/* pgp-keys.js — fills the PGP KEYS section with the organizer keys from keys/keys.js.
 * Markup: <div id="org-keys" data-base="keys/" data-arrow="►"></div>
 * keys/keys.js is generated from events/keys/*.asc by .github/scripts/build_keys.py. */
(function () {
  'use strict';
  const box = document.getElementById('org-keys');
  if (!box) return;
  const base = box.dataset.base || 'keys/';
  const arrow = box.dataset.arrow || '►';
  const keys = Array.isArray(window.ORGANIZER_KEYS) ? window.ORGANIZER_KEYS : [];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;      // textContent: no HTML injection
    return n;
  };
  // 40 hex chars → "ABCD EF01 ... (5 groups)\n... (5 groups)", like real fingerprints are printed
  const pretty = (fpr) => {
    const g = String(fpr).toUpperCase().match(/.{1,4}/g) || [];
    return g.slice(0, 5).join(' ') + (g.length > 5 ? '\n' + g.slice(5).join(' ') : '');
  };

  if (!keys.length) {
    box.append(el('p', '', 'NO ORGANIZER KEYS PUBLISHED YET.'));
    return;
  }
  keys.forEach((k) => {
    box.append(el('p', 'org-keys__handle', String(k.handle || '').toUpperCase()));
    (k.fingerprints || []).forEach((f) => box.append(el('pre', 'fingerprint', pretty(f))));
    const p = el('p');
    const a = el('a', '', arrow + ' DOWNLOAD ' + String(k.file || '').toUpperCase());
    a.href = base + encodeURIComponent(k.file || '');
    p.append(a);
    box.append(p);
  });
})();
