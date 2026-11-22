# new-bordel-web
Landing page of new Bordel hackerspace

## Calendar update

### Option A: signed event via GitHub issue (no code editing)

Organizers whose public PGP key is in [`events/keys/`](events/keys/) can publish events by opening an issue:

1. **Once:** create a key (`gpg --full-generate-key`), export the public half
   (`gpg --armor --export <your email> > <handle>.asc`) and get it added to `events/keys/`.
2. Write the event into `event.txt`:

   ```
   title: Soldering for beginners
   start: 2026-12-12 17:00
   duration: 150
   type: workshop
   location: Bordel
   bring: Nothing, kits provided
   description: Build a small blinky kit.
   ```

3. Sign it: `gpg --clearsign event.txt`
4. Open **Issues → New issue → New event (PGP-signed)** and paste the whole `event.txt.asc`.

A GitHub Action (`.github/workflows/add-event.yml`) checks the signature. Valid events are added to
`events/signed-events.json` / `.js` (with the signer's handle stored as `signedBy`), and the issue is closed. Invalid ones get a comment explaining why.
To remove a bot-added event, delete it from `events/signed-events.json` **and** `events/signed-events.js`.

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
