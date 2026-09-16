# Operations

Everything here is free tier. Nothing needs a build step.

## Run it locally

```bash
node dev-server.mjs        # http://localhost:8092, also reachable on the LAN
```

`?demo` runs on sample data with no accounts. The demo loops live in `local/`,
which is never published.

Checks before pushing:

```bash
for f in js/*.js; do node --input-type=module --check < "$f"; done
deno check supabase/functions/dropbox/index.ts
```

Database changes are tested on a throwaway Postgres (see the test in the
project history: `initdb` into a temp dir, stub an `auth` schema with
`auth.uid()`, run the SQL twice, then check the rules refuse what they should).

## Where things live

- **Site:** GitHub Pages from `main`, repo `STRAIGHTUPGLOBAL/sug-packs`,
  custom domain in `CNAME`.
- **DNS:** STRATO. `packs` is a CNAME to `straightupglobal.github.io`.
- **Database and logins:** Supabase project on the STRAIGHTUPGLOBAL business email.
- **Files:** Dropbox app "SUG Packs" (app folder). The refresh token lives only
  in Supabase → Edge Functions → Secrets, never in this repo.

## Deploying

The site deploys on push to `main`. The database and the server function do not:

- **SQL change:** add a numbered file in `supabase/`, put it on the owner's
  clipboard (`pbcopy < supabase/update-N-*.sql`) and have him run it in
  Supabase → SQL Editor. Always write them to be safe to run twice.
- **Function change:** `pbcopy < supabase/functions/dropbox/index.ts`, then he
  pastes it into Supabase → Edge Functions → dropbox → Deploy. Nothing happens
  live until he does; say so every time.
- Keep the app working against the older database where you can (the favourites
  query is wrapped in a `catch` for exactly this reason), so a push never has to
  wait for a paste.

## First-time setup, from nothing

1. Supabase project (EU). Run `supabase/schema.sql`, then every `update-N` file in order.
2. Authentication → turn **off** sign-ups, then add the two logins by hand with
   **Auto Confirm**.
3. Dropbox App Console → create an app, **App folder**, permissions
   `files.metadata.read`, `files.content.read`, `files.content.write`,
   `sharing.read`, `sharing.write` → **Submit** (ticking alone does nothing).
4. `node setup/dropbox-token.mjs` → click Allow → the refresh token lands on the
   clipboard. It is never printed or saved.
5. Supabase → Edge Functions → Secrets: `DROPBOX_APP_KEY`, `DROPBOX_REFRESH_TOKEN`.
6. Deploy the function, JWT verification **off**.
7. Put the project URL and publishable key into `js/config.js`.
8. GitHub Pages: set the custom domain, add the DNS record, wait for the certificate.

## Troubleshooting

**HTTPS certificate never arrives.** Happened once: the domain was attached
before DNS had propagated and GitHub never retried. Detach and re-attach:

```bash
T=$(gh auth token -h github.com -u STRAIGHTUPGLOBAL)
echo '{"cname": null, "source": {"branch": "main", "path": "/"}}' | GH_TOKEN=$T gh api -X PUT repos/STRAIGHTUPGLOBAL/sug-packs/pages --input -
sleep 25
echo '{"cname": "packs.straightup-global.com", "source": {"branch": "main", "path": "/"}}' | GH_TOKEN=$T gh api -X PUT repos/STRAIGHTUPGLOBAL/sug-packs/pages --input -
```

It was approved within a minute. Then set `https_enforced: true` the same way,
and `git pull` — GitHub rewrites the repo's `CNAME` file when you do this.

**"Unknown action" from the server.** The deployed function is older than the app.

**Uploads fail with 400.** Check the Dropbox permissions were submitted, and that
the app is reading the path from `upload_link` rather than the upload's reply.

**The free Supabase project pauses** after a quiet week. `.github/workflows/keep-awake.yml`
pings `ping()` daily.

**Several GitHub accounts on one Mac.** This repo has a local credential helper
that always uses the STRAIGHTUPGLOBAL token, so `git push` works whichever
account is active. For API calls: `GH_TOKEN=$(gh auth token -h github.com -u STRAIGHTUPGLOBAL) gh api …`.
