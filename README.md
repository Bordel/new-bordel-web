# new-bordel-web
Landing page of new Bordel hackerspace

## Calendar update

### Option A: GitHub issue form (no code editing)

Open **Issues → New issue → New event** and fill in the fields (title, start, type, and optionally
duration, location, bring, description). A GitHub Action (`.github/workflows/add-event.yml`) checks it:

- **Organizers**, the GitHub logins listed in [`events/organizers.txt`](events/organizers.txt):
  the event is published right away and the issue is closed.
- **Everyone else:** the bot comments "waiting for approval". Someone with write access to the repo
  checks the event and adds the **`approved`** label; then the bot publishes it. If the author edits
  the issue after approval, the label is removed and it needs approving again.

Invalid events get a comment explaining why. Published events go to `events/issue-events.json` / `.js`
(with `addedBy` and, for approved ones, `approvedBy`).
To remove a bot-added event, delete it from `events/issue-events.json` **and** `events/issue-events.js`.

**Setup (once):** create a label named `approved` in the repo (Issues → Labels).

### Organizers (`events/organizers.txt`)

- **Add an organizer:** add their GitHub login on its own line (pull request; CODEOWNERS review required).
- **Remove an organizer:** delete their line. Their issues then need the `approved` label like anyone else's.
- If someone renames or deletes their GitHub account, remove their line (GitHub can give the old login to someone else).

### Organizer PGP keys (`events/keys/`)

Optional and **not** needed to publish events. The public keys there are shown in the PGP KEYS section
of the events pages so people can verify announcements. See [`events/keys/README.md`](events/keys/README.md).
`events/keys/keys.js` is regenerated automatically when a `.asc` file changes
(locally: `python3 .github/scripts/build_keys.py`). Never put a private key there: everything in this repo is public.

### Option B: edit the file directly

1. Open [`events/events.js`](events/events.js) and click the ✏️ pencil icon.
2. Copy one existing event block, paste it into the list and change the details:

   ```js
   {
     id: 'soldering-2026-12',             // unique, no spaces
     title: 'Soldering for beginners',
     start: '2026-12-12 17:00',           // Prague time
     durationMin: 150,                     // optional, default 120
     type: 'workshop',                     // workshop | talk | ctf | meetup | party | event
     location: 'Bordel',                   // optional, default Bordel
     bring: 'Nothing, kits provided',      // optional
     description: 'Build a small blinky kit.' // optional
   },
   ```

3. Click **Commit changes** (or **Propose changes** if you're not a maintainer).
