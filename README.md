# SUG Packs

Sample-pack builder for [STRAIGHTUPGLOBAL](https://straightup-global.com).

Producers ask for a certain sound; this turns that into a Dropbox folder with a
link in about a minute. Tag your loops once, pick the tags you want, swipe
through the matches on your phone, and the keepers become a pack — with the
`@straightupglobal` tag stripped from the file names if the person asked for
clean names. Finished packs stay searchable, so the next request is a lookup
rather than a dig.

Live at **packs.straightup-global.com** (two logins, nothing public).

## Running it

```bash
node dev-server.mjs     # http://localhost:8092
```

Add `?demo` to the address to run on sample data with no accounts.
No build step: plain HTML, CSS and ES modules.

## Documentation

| | |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | product scope, confirmed workflows, next feature brief, future libraries |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how it fits together, the data contract, the database, the server function, the traps |
| [docs/DESIGN.md](docs/DESIGN.md) | the design rules, colour meanings, spacing rhythm, motion |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | running, deploying, first-time setup, troubleshooting |
| [docs/BACKLOG.md](docs/BACKLOG.md) | what's next, and how to work the list |

## Stack

Static site on GitHub Pages · Supabase (Postgres, Auth, one Edge Function) ·
Dropbox app folder for the audio. Free tier throughout.
