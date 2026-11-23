#!/usr/bin/env python3
"""Add an event from a "New event" GitHub issue to the calendar.

Who can publish:
  * Organizers: GitHub logins listed in events/organizers.txt. Their issues are published
    right away (only when the organizer opened or edited the issue themselves).
  * Everyone else: the event is checked and waits until someone with write access to the
    repository adds the `approved` label. Editing the issue after that removes the label,
    so changed text always needs a new approval.

Input (env):  ISSUE_BODY, ISSUE_NUMBER, ACTION (opened|edited|labeled), AUTHOR (issue author),
              SENDER (who triggered the event), LABEL (for `labeled`),
              SENDER_PERMISSION (admin|write|read|none, the sender's repo permission),
              HAS_APPROVED_LABEL (true|false)
Output:       events/issue-events.json + .js (on success), comment.md (when there is something
              to say), and result / commit_msg / remove_label in $GITHUB_OUTPUT.

Security notes:
  * Event fields come only from the issue form sections; unknown sections are rejected.
  * The issue body comes through env, never inlined into a shell script.
"""
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_JSON = os.path.join(ROOT, 'events', 'issue-events.json')
DATA_JS = os.path.join(ROOT, 'events', 'issue-events.js')
HAND_EDITED = os.path.join(ROOT, 'events', 'events.js')
ORGANIZERS = os.path.join(ROOT, 'events', 'organizers.txt')
COMMENT = os.path.join(ROOT, 'comment.md')

APPROVE_LABEL = 'approved'
TYPES = {'workshop', 'talk', 'ctf', 'meetup', 'party', 'event'}
# Issue form headings (lower case) → field. The field name itself is accepted too.
SECTIONS = {'title': 'title', 'start': 'start', 'duration (minutes)': 'duration', 'duration': 'duration',
            'type': 'type', 'location': 'location', 'bring': 'bring', 'description': 'description'}
NO_RESPONSE = '_No response_'
MAX_DURATION_MIN = 14 * 24 * 60     # multi-day events (e.g. a 4-day congress) are fine, up to two weeks
START_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$')
LOGIN_RE = re.compile(r'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
MAX_LEN = {'title': 100, 'location': 120, 'bring': 200, 'description': 1000}


class Reject(Exception):
    pass


def output(**kv):
    path = os.environ.get('GITHUB_OUTPUT')
    for k, v in kv.items():
        print(f'{k}={v}')
        if path:
            with open(path, 'a', encoding='utf-8') as f:
                f.write(f'{k}={v}\n')


def comment(text):
    with open(COMMENT, 'w', encoding='utf-8') as f:
        f.write(text.rstrip('\n') + '\n')


def load_organizers():
    """Return the lower-cased GitHub logins from events/organizers.txt."""
    if not os.path.exists(ORGANIZERS):
        return set()
    logins = set()
    with open(ORGANIZERS, encoding='utf-8') as f:
        for line in f:
            name = line.split('#', 1)[0].strip().lstrip('@')
            if LOGIN_RE.match(name):
                logins.add(name.lower())
    return logins


def read_form(body):
    """Turn the rendered issue form ("### Heading" + value) into {field: value}."""
    ev, field, lines = {}, None, []

    def flush():
        if field is None:
            if any(l.strip() for l in lines):
                raise Reject('Please use the "New event" issue form (text before the first field found).')
            return
        value = ' '.join(l.strip() for l in lines if l.strip())   # multi-line description → one line
        if value and value != NO_RESPONSE:
            ev[field] = value

    for raw in body.split('\n'):
        m = re.match(r'^###\s+(.+?)\s*$', raw)
        if m:
            flush()
            name = m.group(1).lower()
            if name not in SECTIONS:
                raise Reject(f'Unknown field `{m.group(1)[:60]}`. Please use the "New event" issue form.')
            field, lines = SECTIONS[name], []
            if field in ev:
                raise Reject(f'`{field}` appears twice.')
        else:
            lines.append(raw)
    flush()
    return ev


def validate(ev):
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
        # 1-6 ASCII digits only: isdigit() also accepts '²', and int() refuses strings of 4300+ digits
        if not re.fullmatch(r'[0-9]{1,6}', ev['duration']) or not 15 <= int(ev['duration']) <= MAX_DURATION_MIN:
            raise Reject(f'`duration` must be a number of minutes between 15 and {MAX_DURATION_MIN} '
                         '(multi-day events: e.g. 4 days = 5760).')
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


def load_events():
    if os.path.exists(DATA_JSON):
        with open(DATA_JSON, encoding='utf-8') as f:
            return json.load(f)
    return []


def save_events(events):
    events.sort(key=lambda e: e['start'])
    with open(DATA_JSON, 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
        f.write('\n')
    js = json.dumps(events, ensure_ascii=False, indent=2).replace('</', '<\\/')
    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write('/* Generated by .github/scripts/add_event.py from issue-events.json. Do not edit by hand. */\n'
                'window.EVENTS = (window.EVENTS || []).concat(' + js + ');\n')


def check_duplicate(ev, events):
    with open(HAND_EDITED, encoding='utf-8') as f:
        existing = set(re.findall(r"""\bid:\s*['"]([^'"]+)['"]""", f.read()))
    existing |= {e['id'] for e in events}
    if ev['id'] in existing:
        raise Reject(f"An event with id `{ev['id']}` (same title and date) already exists.")


def summary(ev):
    lines = [f"- **{ev['title']}**", f"- {ev['start']} · {ev['type']}"]
    if ev.get('location'):
        lines.append(f"- {ev['location']}")
    return '\n'.join(lines)


def main():
    body = os.environ.get('ISSUE_BODY', '').replace('\r\n', '\n')
    issue = os.environ.get('ISSUE_NUMBER', '?')
    action = os.environ.get('ACTION', '')
    author = os.environ.get('AUTHOR', '')
    sender = os.environ.get('SENDER', '')
    label = os.environ.get('LABEL', '')
    permission = os.environ.get('SENDER_PERMISSION', 'none')
    has_label = os.environ.get('HAS_APPROVED_LABEL') == 'true'

    organizers = load_organizers()
    is_organizer = author.lower() in organizers
    approving = action == 'labeled' and label == APPROVE_LABEL
    if action == 'labeled' and not approving:
        output(result='ignored')                   # some other label: nothing to do
        return
    if approving and permission not in ('admin', 'write'):
        comment(f'⚠️ The `{APPROVE_LABEL}` label was added by someone without write access to the repository, '
                'so it was ignored.')
        output(result='ignored', remove_label='true')
        return
    # Organizers publish directly, but only when they opened/edited the issue themselves.
    trusted = approving or (action in ('opened', 'edited') and is_organizer and sender.lower() == author.lower())

    try:
        ev = validate(read_form(body))
        if not trusted:
            events = load_events()
            check_duplicate(ev, events)
            if action == 'edited' and has_label:
                comment(f'✏️ The event was **edited after it was approved**, so the `{APPROVE_LABEL}` label was removed. '
                        f'A maintainer needs to check it and add `{APPROVE_LABEL}` again.\n\n' + summary(ev))
                output(result='pending', remove_label='true')
            else:
                comment(f'👀 **Looks good, waiting for approval.** Someone with write access to the repository '
                        f'will check it and add the `{APPROVE_LABEL}` label; then it goes live.\n\n' + summary(ev))
                output(result='pending')
            return

        ev['addedBy'] = author
        if approving:
            ev['approvedBy'] = sender
        events = load_events()
        check_duplicate(ev, events)
        events.append(ev)
        save_events(events)
        who = f"approved by **{sender}**" if 'approvedBy' in ev else f"added by organizer **{author}**"
        comment(f"✅ **Added** to the calendar, {who}. It goes live within a few minutes.\n\n" + summary(ev))
        by = f"by {author}" + (f", approved by {sender}" if 'approvedBy' in ev else '')
        output(result='added', commit_msg=f"Add event: {ev['title']} ({ev['start']}), {by}, #{issue}")
    except Reject as e:
        comment(f'❌ **Event not added.** {e}\n\nFix it by editing this issue (or open a new one).'
                + (f' A maintainer then needs to add the `{APPROVE_LABEL}` label again.' if approving or has_label else ''))
        # A rejected approval drops the label, so adding it again after the fix re-runs the bot.
        output(result='rejected', remove_label='true' if approving or has_label else 'false')
        print('Rejected:', e, file=sys.stderr)
    except Exception:                              # anything unexpected: still answer the issue
        comment('⚠️ **Event not added: the bot hit an internal error.** Your submission may be fine; '
                'a maintainer needs to check the workflow log.')
        output(result='error')
        raise


if __name__ == '__main__':
    main()
