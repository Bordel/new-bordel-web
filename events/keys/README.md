# Trusted organizer keys

Every `<handle>.asc` file in this folder is a **public** PGP key of a Bordel organizer.
Events signed by any of these keys are accepted by the "New event" issue form and published
automatically (see `.github/workflows/add-event.yml`). The file name is shown as "signed by".

- **Add an organizer:** they run `gpg --armor --export <their email> > <handle>.asc` and the file is committed here.
- **Remove an organizer:** delete their file. Their signatures stop being accepted right away.
- `keys.js` (the list shown in the PGP KEYS section) is regenerated automatically when a `.asc` file changes;
  locally: `python3 .github/scripts/add_event.py --build-keys`.

Never put a private key here: everything in this repo is public.
