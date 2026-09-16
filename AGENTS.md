# For coding agents

Read these before touching anything:

1. `docs/ARCHITECTURE.md` — how it works and what will bite you.
2. `docs/DESIGN.md` — the design rules. The owner rejected a cluttered first
   version; "one more element" is usually the wrong answer.
3. `docs/OPERATIONS.md` — running, deploying, troubleshooting.
4. `docs/BACKLOG.md` — what to work on, and how the list is worked.

House rules:

- **No build step, no framework.** Plain HTML, CSS and ES modules.
- **Verify what you claim.** Run it, look at it at 375×812, check the console.
- **Database and function changes don't deploy on push.** They need the owner to
  paste them in Supabase. Put the file on his clipboard and say so.
- **Keep the app working against the older database** where you reasonably can.
- **The owner's existing Dropbox folders are look-only.** The app only ever
  writes inside its own app folder.
- Write SQL so it can be run twice without harm.
