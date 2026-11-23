# Organizer keys

Every PGP key in this folder can publish events to the Bordel calendar
(see the "New event (PGP-signed)" issue form). Only `*.asc` files here are trusted.

## Add your key

1. Find your key and export it (one key per file, named after you):

   ```
   gpg --list-secret-keys --keyid-format long
   gpg --export --armor <your-key-id> > events/keys/<yourname>.asc
   ```

   Export only the **public** key (`--export`, never `--export-secret-keys`).

2. Open a pull request that adds the file (from a fork if you have no write access).

3. Send your key's fingerprint to a maintainer **directly** (in person, Signal, a call),
   not in the pull request. Show it with:

   ```
   gpg --fingerprint <your-key-id>
   ```

4. The maintainer checks that the fingerprint matches and merges. The key list on the
   events page is updated automatically.

## For maintainers: before merging a new key

```
gpg --show-keys events/keys/<name>.asc
```

Merge only if the fingerprint it shows matches the one the person gave you directly.
Anyone can create a key with any name in it, so the name alone proves nothing.

## Remove a key

Delete the person's `.asc` file. Signed events from that key are rejected from then on;
events already published stay on the calendar.

## Key expires or you get a new key

Replace your `.asc` file with the new export through a pull request, the same way as above.
