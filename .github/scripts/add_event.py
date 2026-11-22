#!/usr/bin/env python3
"""Verify a PGP clearsigned event from a GitHub issue and add it to the calendar.

Input (env):  ISSUE_BODY, ISSUE_NUMBER
Output:       events/signed-events.json + .js and events/used-signatures.txt (on success),
              comment.md (always), and result/commit_msg in $GITHUB_OUTPUT.

`add_event.py --build-keys` instead regenerates events/keys/keys.js, the list of organizer
keys that the PGP KEYS section of the events pages shows.

Security notes:
  * Only keys in events/keys/*.asc are trusted (imported into a fresh, temporary keyring).
  * Event fields are read ONLY from the signed text gpg returns, never from the raw
    issue body, so lines added outside the signature are ignored.
  * Exactly one good signature is required; bad, expired or revoked ones are rejected.
  * Each signature can be used once (events/used-signatures.txt) and must be recent,
    so an old signed block copied from a closed issue can't re-publish a deleted event.
"""
import datetime
import glob
import hashlib
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
USED_SIGS = os.path.join(ROOT, 'events', 'used-signatures.txt')
KEYS_JS = os.path.join(KEYS_DIR, 'keys.js')
COMMENT = os.path.join(ROOT, 'comment.md')

TYPES = {'workshop', 'talk', 'ctf', 'meetup', 'party', 'event'}
FIELDS = {'title', 'start', 'duration', 'type', 'location', 'bring', 'description'}
MAX_SIG_AGE_DAYS = 30
START_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$')
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


def key_files(home):
    """Yield (path, handle, [primary fingerprints]) for every events/keys/*.asc file."""
    for path in sorted(glob.glob(os.path.join(KEYS_DIR, '*.asc'))):
        handle = os.path.splitext(os.path.basename(path))[0]
        shown = gpg(home, '--with-colons', '--show-keys', path)
        lines = shown.stdout.decode('utf-8', 'replace').splitlines()
        fprs = [lines[i + 1].split(':')[9] for i, line in enumerate(lines)
                if line.startswith('pub:') and i + 1 < len(lines) and lines[i + 1].startswith('fpr:')]
        yield path, handle, fprs


def trusted_keys(home):
    """Import every key file; return {primary fingerprint: handle (file name)}."""
    keys = {}
    for path, handle, fprs in key_files(home):
        for fpr in fprs:
            keys[fpr] = handle
        gpg(home, '--import', path)
    if not keys:
        raise Reject('No trusted keys found in `events/keys/` yet, so no event can be accepted.')
    return keys


def verify(home, block, keys):
    """Return (signed plaintext, signer handle, signature id) or raise Reject."""
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
    try:
        signed_at = datetime.datetime.fromtimestamp(int(validsig[0][4]), datetime.timezone.utc)
    except ValueError:
        signed_at = datetime.datetime.strptime(validsig[0][3], '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc)
    age = datetime.datetime.now(datetime.timezone.utc) - signed_at
    if age > datetime.timedelta(days=MAX_SIG_AGE_DAYS):
        raise Reject(f'The signature is older than {MAX_SIG_AGE_DAYS} days. Please sign the event again.')
    if age < -datetime.timedelta(days=1):
        raise Reject('The signature is dated in the future. Check the clock on the computer that signed it.')
    text = res.stdout.decode('utf-8')
    sig_id = hashlib.sha256(f'{primary}\n{validsig[0][4]}\n{text}'.encode('utf-8')).hexdigest()
    return text, keys[primary], sig_id


def parse(text):
    ev, last = {}, None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if last == 'description':
            ev[last] += ' ' + line           # description is the last field: everything after it belongs to it
            continue
        m = re.match(r'^([A-Za-z]+)\s*:\s*(.*)$', line)
        if m and m.group(1).lower() in FIELDS:
            last = m.group(1).lower()
            if last in ev:
                raise Reject(f'`{last}` appears twice.')
            ev[last] = m.group(2).strip()
        else:
            raise Reject(f'Unknown line: `{line[:60]}`. Allowed keys: ' + ', '.join(sorted(FIELDS)))

    for req in ('title', 'start', 'type'):
        if not ev.get(req):
            raise Reject(f'Missing required field `{req}`.')
    try:
        if not START_RE.match(ev['start']):
            raise ValueError
        start = datetime.datetime.strptime(ev['start'], '%Y-%m-%d %H:%M')
    except ValueError:
        raise Reject('`start` must look like `2026-12-12 17:00` (YYYY-MM-DD HH:MM, with leading zeros).')
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
    out = {'id': f"{slug}-{start:%Y%m%d}", 'title': ev['title'], 'start': start.strftime('%Y-%m-%d %H:%M')}
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


def load_used():
    if not os.path.exists(USED_SIGS):
        return set()
    with open(USED_SIGS, encoding='utf-8') as f:
        return {l.split()[0] for l in f if l.strip() and not l.startswith('#')}


def mark_used(sig_id, issue):
    new = not os.path.exists(USED_SIGS)
    with open(USED_SIGS, 'a', encoding='utf-8') as f:
        if new:
            f.write('# Signatures already used to add events (one per line). Generated by add_event.py; do not edit.\n')
        f.write(f'{sig_id} #{issue}\n')


def build_keys_js():
    with tempfile.TemporaryDirectory() as home:
        os.chmod(home, 0o700)
        keys = [{'handle': handle, 'file': os.path.basename(path), 'fingerprints': fprs}
                for path, handle, fprs in key_files(home) if fprs]
    js = json.dumps(keys, ensure_ascii=False, indent=2).replace('</', '<\\/')
    with open(KEYS_JS, 'w', encoding='utf-8') as f:
        f.write('/* Generated by .github/scripts/add_event.py --build-keys from events/keys/*.asc. Do not edit by hand. */\n'
                'window.ORGANIZER_KEYS = ' + js + ';\n')
    print(f'{len(keys)} key(s) written to {KEYS_JS}')


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
            text, signer, sig_id = verify(home, blocks[0], trusted_keys(home))
        if sig_id in load_used():
            raise Reject('This signed block was already used once. To publish the event again, sign it again.')
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
        mark_used(sig_id, issue)
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
    except Exception as e:                        # anything unexpected: still answer the issue
        with open(COMMENT, 'w', encoding='utf-8') as f:
            f.write('⚠️ **Event not added: the bot hit an internal error.** Your submission may be fine; '
                    'a maintainer needs to check the workflow log.\n')
        output(result='error')
        raise


if __name__ == '__main__':
    build_keys_js() if sys.argv[1:] == ['--build-keys'] else main()
