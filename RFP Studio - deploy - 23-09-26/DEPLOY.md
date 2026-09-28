# RFP Studio — deploy bundle, 23 Sep 2026

Two deploy targets in here. The static one is ready to upload right now; the
container one is what makes sharing, roles and notifications actually
multi-user.

---

## Which zip goes where

| Zip | Arrakis site type | Contains |
|---|---|---|
| `rfp-studio.zip` | **website** | `index.html` at the zip root |
| `rfp-studio-container.zip` | **container** | `Dockerfile` at the zip root, plus `server/`, `public/`, `entrypoint.sh` |

**The container zip's root must be the build context.** Arrakis's PRE_BUILD step
runs `find . -maxdepth 2 -name Dockerfile` and fails with
`ERROR: No Dockerfile found in source` / `exit status 1` if it's deeper than one
folder down. Zipping this whole deploy folder puts it at
`<folder>/container/Dockerfile` — three levels — which is exactly that failure.
Rebuild it from inside `container/`, never from here:

```
cd container && zip -r -X -q ../rfp-studio-container.zip . -x ".*" -x "*/.*"
unzip -l ../rfp-studio-container.zip | head -3   # Dockerfile must be the first entry
```

---

## 1. Static site (Arrakis website) — upload now

**`rfp-studio.zip`** — already built, flat, `index.html` at the zip root, no
`__MACOSX`. Drag it onto the Arrakis upload zone for a website-type site.

Verified: `unzip -l` shows exactly one top-level entry, `index.html`. If you
ever rebuild it, zip from the CLI, never Finder → Compress:

```
cd "_UPLOAD-THE-CONTENTS-OF-THIS-FOLDER" && zip -r -X -q ../rfp-studio.zip .
```

Finder puts the folder itself as the zip's top-level entry, which Arrakis
serves as a 404 / "missing index.html".

**What works in this mode:** the whole editor — importer, pagination, PDF and
print export, comments, sharing UI, notifications, shortcuts. Storage is the
browser (5 MB, shared with the other editors), so **it is single-user**:
comments and notifications stay in whoever's browser made them, and identity
is the local switcher in the account menu.

That is fine for a demo of the UI. It is not a shared library.

---

## 2. Container (Arrakis container site) — the multi-user version

`container/` is a complete Docker build context:

```
container/
  Dockerfile          # no Next.js stage — the single-file editor IS the frontend
  entrypoint.sh       # seeds /data from /seed-data on first boot (EFS starts empty)
  public/index.html   # the editor
  server/             # Express backend lifted from the hackathon deploy
    src/              # routes → controllers → services → repositories
    data/users.json   # the org user directory (globalRole: admin | contributor)
```

```
cd container && docker build -t rfp-studio:2026-09-23 .
```

Run it locally exactly as the container does:

```
export PATH="/Users/billy.newton/.local/node/bin:$PATH"
cd container/server && npm ci --omit=dev
DATA_DIR=./.devdata LOCAL_DEV_USER_EMAIL=you@checkout.com PORT=3111 node server.js
# then open http://localhost:3111 — the editor detects the server by itself
```

### Environment

| Var | Needed | Notes |
|---|---|---|
| `DATA_DIR` | yes | `/data` in the image. Point it at the EFS mount — everything lives here. |
| `PORT` | no | 3000 in the image. |
| `CLOUDFLARE_TEAM_DOMAIN` + `CLOUDFLARE_AUD` | **set both in any real deploy** | Turns on cryptographic verification of the Cf-Access JWT. Without them the server trusts the raw `Cf-Access-Authenticated-User-Email` header, which is only safe if the app is reachable *exclusively* through the Access proxy. |
| `LOCAL_DEV_USER_EMAIL` | local only | Fakes an identity when there's no Access proxy. |
| `SUPER_ADMIN_EMAIL` | never in prod | Bypasses every ACL check; the server logs a warning if set. |

### What the server gives you over the static build

- **Real identity** — Cloudflare Access, verified. The account-menu identity
  switcher becomes a local-dev affordance only.
- **Enforced roles** — `bid_manager > editor > reviewer`, checked by
  `requireRole()` on every route, not just in the UI.
- **One shared library** for the whole bid team, with per-user visibility
  (admins see everything; contributors see what they have a role on).
- **Server-side notifications** — per-user files with a 60s dedup window so
  autosave can't spam them.
- **Comments with assignees**, block-anchored, with the quoted text.
- **Presence + section locks over SSE** — the "multiple players" behaviour.
- **Images as files** (`/api/images/:id/:slot`) instead of base64 inside the
  document, which is what long 30–100 page RFPs need.

### Accounts

`server/data/users.json` is the seeded directory — 435 people, `globalRole` of
`admin` or `contributor`. Admins see every RFP; contributors see only ones they
hold a role on (and creating one makes you its bid_manager). Existing admins:
Cyriel Ghendrih-Feillant, Tarek Cattan, Varishtha Desai — **billy.newton was
missing entirely and has been added as `admin`**, otherwise you'd have been a
contributor on your own deployment. Unknown emails are not rejected: they
auto-register as contributors on first authenticated request.

Caveat: `entrypoint.sh` only seeds `/data` when it is **empty**. Redeploying
over an EFS volume that already has data will keep the old `users.json`, so
that admin row won't appear — start from a fresh volume, or have one of the
existing admins promote you.

### Verified end to end (23 Sep, local run)

No Docker on this Mac, so **the image itself has not been built** — what was
verified is everything inside it. The Dockerfile's COPY layout was replicated
by hand, `npm ci --omit=dev` ran clean, `entrypoint.sh`'s seeding logic ran,
the server booted, `/` served the editor (200) and `/api/health`, `/api/whoami`
and `/api/rfps` all answered. The one unproven step is the base image pull
(`...ecr.eu-west-1.amazonaws.com/cko-pull-through/.../node:20-alpine`), which
is inherited unchanged from the hackathon build that deployed on this platform.

Editor served by this server, reading `/api/rfps` live: storage badge showed
"Shared server", the avatar came from `/api/whoami`, and the card role badges
read **Bid Manager resolved server-side** — not from the document body.
Save → list → load → delete all round-tripped, including `**bold**` markers.

---

## Known gaps (deliberate, not bugs)

1. **Client-side comments and notifications are not yet persisted by the
   server.** Its upsert treats comments, ACL, share and viewer state as
   server-owned and re-derives them from disk, so `doc.comments` in a PUT body
   is ignored on purpose — otherwise a stale editor tab would wipe a
   reviewer's comment on its next autosave. Wiring the editor's comment panel
   to `/api/rfps/:id/comments` (and the bell to `/api/notifications`) is the
   next job, and it is the last thing standing between this and a real
   multi-player review.
2. **Five client roles vs three server roles.** The editor still offers
   Owner / Bid Manager / Editor / Commenter / Viewer; the server enforces
   `bid_manager / editor / reviewer`. The adapter maps reviewer → Commenter
   and prefers the server's answer whenever it has one. Worth collapsing the
   client to the server's three.
3. **No optimistic concurrency.** Two people editing one RFP is still
   last-write-wins; the server has per-doc write locks and accepts a
   `clientRevision` envelope, so this is a small job when it matters.
4. The spreadsheet importer is untouched and stays client-side.
5. **The editor loads 6 libraries from CDNs** (Tailwind, Lucide, html-to-image,
   jsPDF, SheetJS, Google Fonts) — same as every previous build of it. If the
   Arrakis site or sandbox egress blocks them, the page renders unstyled and
   export breaks. If that happens, vendor the six files next to `index.html`
   and rewrite the `<script src>`/`<link href>` lines; nothing else changes.

## Source

- Editor: `proposal-studio/proposal-editor-2026-09-23.html` (same file, copied
  to both `_UPLOAD.../index.html` and `container/public/index.html`)
- Server: lifted from `~/Desktop/rfp-studio-deploy/server-app`, unmodified
