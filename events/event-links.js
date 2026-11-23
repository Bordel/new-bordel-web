/* event-links.js — links inside event descriptions, shared by the calendar and the list.
 *   ev.links = { 'phrase from the description': 'https://...' }
 * withLinks(parent, text, links): fills `parent` with the text, each phrase turned into a link
 *   (new tab; only http(s) URLs; text is always textContent, never HTML).
 * linkLines(ev): the same links as "phrase: url" lines for the .ics export.
 */
(function () {
  'use strict';

  // valid links: non-empty phrase -> http(s) URL string
  const linkEntries = (links) => (links && typeof links === 'object')
    ? Object.entries(links).filter(([t, u]) => typeof t === 'string' && t && typeof u === 'string' && /^https?:\/\//i.test(u)) : [];
  function withLinks(parent, text, links) {
    const map = linkEntries(links);
    parent.replaceChildren();
    let rest = String(text || '');
    while (rest) {
      let best = null;
      for (const [t, u] of map) { const i = rest.indexOf(t); if (i !== -1 && (!best || i < best.i || (i === best.i && t.length > best.t.length))) best = { i, t, u }; }
      if (!best) { parent.append(rest); break; }
      if (best.i) parent.append(rest.slice(0, best.i));
      const a = document.createElement('a');
      a.href = best.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = best.t;
      parent.append(a);
      rest = rest.slice(best.i + best.t.length);
    }
    return parent;
  }
  const linkLines = (ev) => linkEntries(ev.links).map(([t, u]) => t + ': ' + u);

  window.BordelLinks = { withLinks, linkLines };
})();
