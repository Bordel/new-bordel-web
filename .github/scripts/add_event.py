#!/usr/bin/env python3
"""Verify a PGP clearsigned event from a GitHub issue and add it to the calendar.

Input (env):  ISSUE_BODY, ISSUE_NUMBER
Output:       events/signed-events.json + events/signed-events.js (on success),
              comment.md (always), and result/commit_msg in $GITHUB_OUTPUT.

Security notes:
  * Only keys in events/keys/*.asc are trusted (imported into a fresh, temporary keyring).
  * Event fields are read ONLY from the signed text gpg returns, never from the raw
    issue body, so lines added outside the signature are ignored.
  * Exactly one good signature is required; bad, expired or revoked ones are rejected.
"""
import datetime
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KEYS_DIR = os.path.join(ROOT, 'events', 'keys')
DATA_JSON = os.path.join(ROOT, 'events', 'signed-events.json')
DATA_JS = os.path.join(ROOT, 'events', 'signed-events.js')
HAND_EDITED = os.path.join(ROOT, 'events', 'events.js')
COMMENT = os.path.join(ROOT, 'comment.md')

TYPES = {'workshop', 'talk', 'ctf', 'meetup', 'party', 'event'}
FIELDS = {'title', 'start', 'duration', 'type', 'location', 'bring', 'description'}
MAX_LEN = {'title': 100, 'location': 120, 'bring': 200, 'description': 1000}
BAD_STATUS = {'BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG', 'NO_PUBKEY'}
BLOCK_RE = re.compile(r'-----BEGIN PGP SIGNED MESSAGE-----.*?-----END PGP SIGNATURE-----', re.S)


class Reject(Exception):
    pass


def output(**kv):
    path = os.environ.get('GITHUB_OUTPUT')
    for k, v in kv.items():
        print(f'{k}={v}')
        if path:
            with open(path, 'a', encoding='utf-8') as f:
                f.write(f'{k}={v}\n')


def gpg(home, *args, data=None):
    return subprocess.run(['gpg', '--homedir', home, '--batch', '--no-tty', *args],
                          input=data, capture_output=True)


def trusted_keys(home):
    """Import every key file; return {primary fingerprint: handle (file name)}."""
    keys = {}
    for path in sorted(glob.glob(os.path.join(KEYS_DIR, '*.asc'))):
        handle = os.path.splitext(os.path.basename(path))[0]
        shown = gpg(home, '--with-colons', '--show-keys', path)
        lines = shown.stdout.decode('utf-8', 'replace').splitlines()
        for i, line in enumerate(lines):
            if line.startswith('pub:') and i + 1 < len(lines) and lines[i + 1].startswith('fpr:'):
                keys[lines[i + 1].split(':')[9]] = handle
        gpg(home, '--import', path)
    if not keys:
        raise Reject('No trusted keys found in `events/keys/` yet, so no event can be accepted.')
    return keys


def verify(home, block, keys):
    """Return (signed plaintext, signer handle) or raise Reject."""
    status_path = os.path.join(home, 'status')
    res = gpg(home, '--status-file', status_path, '--decrypt', data=block.encode('utf-8'))
    with open(status_path, encoding='utf-8', errors='replace') as f:
        status = [l.split() for l in f if l.startswith('[GNUPG:] ')]
    names = [s[1] for s in status if len(s) > 1]
    if 'NO_PUBKEY' in names or 'ERRSIG' in names:
        raise Reject('The signature was made with a key that is **not** in `events/keys/`.')
    if BAD_STATUS & set(names):
        raise Reject('The signature is **not valid** (bad, expired or revoked: `%s`). '
                     'Was the text changed after signing?' % ', '.join(sorted(BAD_STATUS & set(names))))
    validsig = [s for s in status if len(s) > 11 and s[1] == 'VALIDSIG']
    if res.returncode != 0 or names.count('GOODSIG') != 1 or len(validsig) != 1:
        raise Reject('Could not verify the signature. Paste the whole block from `gpg --clearsign`.')
    primary = validsig[0][11]
    if primary not in keys:
        raise Reject('The signing key is not one of the trusted keys in `events/keys/`.')
    return res.stdout.decode('utf-8'), keys[primary]


def parse(text):
    ev, last = {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r'^([A-Za-z]+)\s*:\s*(.*)$', line)
        if m and m.group(1).lower() in FIELDS:
            last = m.group(1).lower()
            if last in ev:
                raise Reject(f'`{last}` appears twice.')
            ev[last] = m.group(2).strip()
        elif last == 'description':
            ev[last] += ' ' + line           # let the description run over several lines
        else:
            raise Reject(f'Unknown line: `{line[:60]}`. Allowed keys: ' + ', '.join(sorted(FIELDS)))

    for req in ('title', 'start', 'type'):
        if not ev.get(req):
            raise Reject(f'Missing required field `{req}`.')
    try:
        start = datetime.datetime.strptime(ev['start'], '%Y-%m-%d %H:%M')
    except ValueError:
        raise Reject('`start` must look like `2026-12-12 17:00` (YYYY-MM-DD HH:MM).')
    ev['type'] = ev['type'].lower()
    if ev['type'] not in TYPES:
        raise Reject('`type` must be one of: ' + ', '.join(sorted(TYPES)) + '.')
    if 'duration' in ev:
        if not ev['duration'].isdigit() or not 15 <= int(ev['duration']) <= 24 * 60:
            raise Reject('`duration` must be a number of minutes between 15 and 1440.')
    for k, n in MAX_LEN.items():
        if len(ev.get(k, '')) > n:
            raise Reject(f'`{k}` is too long (max {n} characters).')

    slug = re.sub(r'[^a-z0-9]+', '-', ev['title'].lower()).strip('-')[:40].strip('-') or 'event'
    out = {'id': f"{slug}-{start:%Y%m%d}", 'title': ev['title'], 'start': ev['start']}
    if 'duration' in ev:
        out['durationMin'] = int(ev['duration'])
    out['type'] = ev['type']
    for k in ('location', 'bring', 'description'):
        if ev.get(k):
            out[k] = ev[k]
    return out


def load_signed():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, encoding='utf-8') as f:
            return json.load(f)
    return []


def save_signed(events):
    events.sort(key=lambda e: e['start'])
    with open(DATA_JSON, 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
        f.write('\n')
    js = json.dumps(events, ensure_ascii=False, indent=2).replace('</', '<\\/')
    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write('/* Generated by .github/scripts/add_event.py from signed-events.json. Do not edit by hand. */\n'
                'window.EVENTS = (window.EVENTS || []).concat(' + js + ');\n')


def main():
    body = os.environ.get('ISSUE_BODY', '').replace('\r\n', '\n')
    issue = os.environ.get('ISSUE_NUMBER', '?')
    try:
        blocks = BLOCK_RE.findall(body)
        if len(blocks) != 1:
            raise Reject('Paste exactly one signed block (from `-----BEGIN PGP SIGNED MESSAGE-----` '
                         'to `-----END PGP SIGNATURE-----`).')
        with tempfile.TemporaryDirectory() as home:
            os.chmod(home, 0o700)
            text, signer = verify(home, blocks[0], trusted_keys(home))
        ev = parse(text)
        ev['signedBy'] = signer

        events = load_signed()
        with open(HAND_EDITED, encoding='utf-8') as f:
            existing = set(re.findall(r"""\bid:\s*['"]([^'"]+)['"]""", f.read()))
        existing |= {e['id'] for e in events}
        if ev['id'] in existing:
            raise Reject(f"An event with id `{ev['id']}` (same title and date) already exists.")

        events.append(ev)
        save_signed(events)
        lines = [f"✅ **Added** to the calendar, signed by **{signer}**. It goes live within a few minutes.", '',
                 f"- **{ev['title']}**", f"- {ev['start']} · {ev['type']}"]
        if ev.get('location'):
            lines.append(f"- {ev['location']}")
        with open(COMMENT, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
        output(result='added', commit_msg=f"Add event: {ev['title']} ({ev['start']}), signed by {signer}, #{issue}")
    except Reject as e:
        with open(COMMENT, 'w', encoding='utf-8') as f:
            f.write(f'❌ **Event not added.** {e}\n\nFix it and edit this issue (or open a new one) to try again.\n')
        output(result='rejected')
        print('Rejected:', e, file=sys.stderr)


if __name__ == '__main__':
    main()
