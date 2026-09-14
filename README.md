# Camp Sync — Phase 1

A When2Meet for camping trips. An organizer picks a candidate date range,
shares a link, and each person drags across the days they can not go. The
overlap engine ranks the windows where the most people are free.

This is Phase 1: the scheduling core only. No NPS/RIDB/trail data yet —
that plugs into `findCandidateWindows` output in a later phase, filtering
or scoring the winning window's location options.

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma + Postgres (Neon or Vercel Postgres both work)
- Tailwind for styling, no component library
- Zero auth — trips are unlisted by slug, like a Doodle poll

## Local setup

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL
npm run db:push           # creates tables from prisma/schema.prisma
npm run dev
```

Open http://localhost:3000, create a trip, then open the trip link in a
second (private) browser window to simulate a second participant.

## Data model

- `Trip` — a name plus the searchable date range, identified by a short slug
- `Participant` — a person who joined a trip (no login, just a name)
- `UnavailableRange` — one blocked date span per participant

The overlap logic lives entirely in `src/lib/overlap.ts` and is pure
functions with no DB or Next.js dependency, so it is easy to unit test or
reuse from a future API-only recommendation service.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" → import the repo.
3. Add Postgres: Storage tab → Create Database (Neon is the default) →
   Connect to the project. This sets `DATABASE_URL` automatically.
4. That's it — the `build` script runs `prisma generate && prisma db push`
   before `next build`, so every deploy syncs the live database schema to
   match `prisma/schema.prisma` automatically. No separate manual step,
   and no need to pull secret-typed env vars down locally just to run a
   one-off command.

`prisma db push` (rather than proper migrations) is the right tool for a
project at this stage, but the `--accept-data-loss` flag it needs to run
non-interactively during a build is worth understanding: if a future
schema change would drop a column or table that has real data in it,
this will do that silently on deploy rather than asking for
confirmation. Fine for now with no real users yet — worth switching to
`prisma migrate deploy` with proper migration files before this holds
data anyone would miss.

## Phase 2 — campground recommendations

Once a trip has at least a rough candidate window, the trip page shows a
"Find a campground" panel: type a place name and radius, and it returns a
ranked list of campgrounds for the group's best window.

### Data sources, and what each one actually gives you

| Source | What it provides | Official? |
|---|---|---|
| RIDB (`ridb.recreation.gov`) | Campground/facility metadata — name, description, location, reservable flag | Yes, documented |
| NPS API (`developer.nps.gov`) | State-level alerts (closures, fire bans) shown alongside results | Yes, documented |
| OpenStreetMap Overpass API | Nearby trail names, lengths, and rough difficulty (from OSM's `sac_scale` tag when present) — the closest free, keyless substitute for AllTrails. No popularity/quality ratings exist in any free source. | Yes, community-run, no key |
| recreation.gov's internal availability endpoint | Live per-night site availability | **No — unofficial and undocumented** |
| OpenStreetMap Nominatim | Turns a typed place name into lat/lon + state | Yes, free, keyless |

The live-availability piece (`src/lib/providers/recreationAvailability.ts`)
is the one to watch: it's the same undocumented endpoint community
scrapers use, not a supported API. It can change shape or start blocking
requests with no notice, so every call is wrapped to fail soft — a
campground still shows up in results with an "availability unknown, check
listing" badge rather than breaking the whole search. Only the closest
handful of results spend a call on it (`MAX_CAMPGROUNDS_TO_CHECK_AVAILABILITY`
in `src/lib/recommend.ts`), both to limit load on an endpoint you don't
control and to keep response times reasonable.

### Scoring

`src/lib/recommend.ts` ranks campgrounds by: nearby trail quality (sum of
star ratings for the best trails within 15mi), a bonus for confirmed
live availability, a small bonus for being reservable at all, and a
distance penalty. It's a starting point, not tuned — the weights are
plain constants at the top of the scoring function.

### Environment variables

See `.env.example` — you'll need free keys for NPS and RIDB. Geocoding,
trail data, and the availability lookup need no key, but do set a real
contact string in the `User-Agent` header in `geocode.ts` per Nominatim's
usage policy before this goes to production traffic.

## What's next (Phase 3+ ideas)

- Cache RIDB/NPS/trail metadata in Vercel KV or Upstash — it barely
  changes day to day, no reason to re-fetch it per search
- Cross-check the unofficial availability endpoint's reliability over a
  few weeks before leaning on it for anything user-facing beyond a hint

## Pinning a campground

Any campground in the search results can be pinned to the trip with the
"Pin this" button — it shows up at the top of the trip page for everyone
with the link, with an unpin option. There's no separate "organizer"
role yet (same trust model as the rest of the app: anyone with the link
can do anything), so this is a shared decision, not a private one.

The pin stores a snapshot (name, booking link, distance, the window it
was picked for) rather than just the facility ID, since RIDB data can
change or a listing can disappear — the trip shouldn't lose its decision
if that happens.
