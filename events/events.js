/*
 * Your events. Edit this list — nothing else needs to change.
 * (Events added through the signed GitHub issue form go to signed-events.js instead.)
 *
 *   id          unique, no spaces
 *   title       event name
 *   start       "YYYY-MM-DD HH:MM" in your local time (time zone is set in bbs.js)
 *   durationMin optional, default 120
 *   type        workshop | talk | ctf | meetup | party | event   (sets the color)
 *   location    optional
 *   bring       optional
 *   description optional
 *   links       optional: { 'phrase from the description': 'https://...' } makes that phrase a link
 *
 * Multi-day events: just set a long durationMin, e.g. 4 days = 4 * 24 * 60.
 * The event is then shown on every day it covers.
 *
 * Repeating events:
 *   repeat: 'weekly', until: 'YYYY-MM-DD'      → every week on the same weekday
 *   except: ['2026-12-23', '2026-12-30']        → skip these dates
 */
window.EVENTS = [
  /* Template: copy this block (without the comment markers), fill it in, and separate events with a comma.
  {
    id: 'soldering-2026-12',
    title: 'Soldering for beginners',
    start: '2026-12-12 17:00',
    durationMin: 150,
    type: 'workshop',
    location: 'Bordel',
    bring: 'Nothing, kits provided',
    description: 'Build a small blinky kit.'
  },
  */
    {
        id: 'ccc-bordel-assembly-2026',
        title: 'CCC Bordel Assembly',
        start: '2026-12-27 10:00',
        durationMin: 4800,   // 4 days: Sun 27 Dec 10:00 – Wed 30 Dec 18:00
        type: 'meetup',
        location: 'Hamburg Messe',
        bring: '',
        description: 'Bordel assembly will take place as part of the CDC (Critical Decentralisation Cluster) at the CCC (Chaos Communication Congress). Come contribute your chaos to our projects focused on collecting entropy, chat about privacy, free and open-source software (FOSS), and the latest news from our community.',
        links: { 'Chaos Communication Congress': 'https://events.ccc.de/congress/2026/infos/startpage.html' }
    },
];
