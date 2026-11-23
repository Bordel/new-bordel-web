# Organizer keys

Public PGP keys of Bordel organizers, shown in the PGP KEYS section of the events pages so people
can verify announcements. Keys are **not** needed to publish events: that is done through the
"New event" issue form (see `events/organizers.txt` and the main README).

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

Delete the person's `.asc` file. The key list on the events page is updated automatically.

## Key expires or you get a new key

Replace your `.asc` file with the new export through a pull request, the same way as above.
