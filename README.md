# Masar | مسار

Safe, verified rides for children. A two-sided platform connecting parents in the
Eastern Province of Saudi Arabia with verified bus and private-car drivers.

KFUPM · MKT510 Marketing Management · Team 03.

> **Demo project.** No real payments are processed and no real rides are booked.

---

## Milestone 1 — the public website

The public website, complete in Arabic and English:

| Page | Route |
|---|---|
| Home | `/ar`, `/en` |
| For drivers | `/ar/drivers`, `/en/drivers` |
| Safety & trust | `/ar/safety`, `/en/safety` |
| About | `/ar/about`, `/en/about` |
| Contact | `/ar/contact`, `/en/contact` |
| FAQ | `/ar/faq`, `/en/faq` |
| Privacy policy | `/ar/privacy`, `/en/privacy` |
| Terms of use | `/ar/terms`, `/en/terms` |
| Cancellation & refunds | `/ar/refunds`, `/en/refunds` |

Plus: the Masar design system (brand green `#009767`, amber `#F0B94F`), full
right-to-left support, dark mode, an installable PWA manifest, and SEO metadata
with `hreflang` for both languages.

Visiting `/` sends Arabic-speaking browsers to `/ar` and everyone else to `/en`.

## Milestone 2 — accounts and parent onboarding

| Page | Route |
|---|---|
| Create a parent account (4-step wizard) | `/ar/signup`, `/en/signup` |
| Sign in | `/ar/login`, `/en/login` |
| Account home | `/ar/account`, `/en/account` |
| Children | `/…/account/children` |
| Addresses | `/…/account/addresses` |
| Profile, privacy, delete account | `/…/account/profile` |

**The wizard** (progress bar, back button, resumes where the parent stopped):

1. **Account** — name, email, password, preferred language, and consent to the
   terms, the privacy policy and a WhatsApp opt-in (stored as a dated consent
   record, which Meta requires before any WhatsApp message). Then **mobile
   verification** with a 6-digit code. In demo mode the code appears on screen as
   a "text message"; later the same database function hands it to WhatsApp.
2. **Home location** — a large **Detect my location** button (high-accuracy GPS,
   with step-by-step help for iPhone, Android and desktop if permission is
   denied), address search, and a draggable pin. The address fields fill
   themselves from the pin, and anything the parent typed is never overwritten.
   Also building, floor, notes for the driver, the National Address short code,
   and a label (Home / Grandparents / Other).
3. **Children** (can be skipped) — name, gender, date of birth (age shown),
   school (searchable list of real Eastern Province schools, or free text),
   grade, notes for the driver, medical notes, emergency contact, and up to five
   authorized pick-up persons.
4. **Done** — summary and "Find a ride".

**The account area** has a sidebar on desktop and bottom navigation on phones:
manage children and addresses (add, edit, delete, change the default), change
name or language, re-verify a new mobile number, toggle WhatsApp updates (each
change is a new consent record), **download my data** as JSON, and **delete my
account** (PDPL).

Maps are OpenStreetMap: CARTO tiles, Photon search and Nominatim reverse
geocoding. No API key and no cost. The provider sits behind one interface in
`src/lib/geo.ts`, so Google Maps can replace it later.

### Two backends, one interface

`src/lib/data/` defines one `Backend` interface with two implementations:

- **Supabase** (`supabase.ts`) — used automatically when
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- **In-browser demo store** (`local.ts`) — used when they aren't. It enforces
  the same rules as the SQL (code cooldowns, one verified account per number,
  one default address…), so the shareable preview works with no server at all.

## Setting up Supabase (once)

1. Supabase → **SQL Editor** → **New query**. Paste all of
   `supabase/migrations/0001_parent_onboarding.sql` and press **Run**. It is
   safe to run again.
2. Supabase → **Authentication → Sign In / Providers → Email**: turn **Confirm
   email off** for the demo. Supabase's built-in mailer only sends to your own
   team's addresses and only a couple of emails an hour, so sign-ups would
   otherwise stall. (The app also handles it being on: it shows "check your
   email".)
3. Supabase → **Project Settings → API Keys**: copy the project URL and the
   **anon public** key. Never use the `service_role` key in this app.
4. Vercel → your project → **Settings → Environment Variables**: add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for
   Production and Preview, then **Deployments → … → Redeploy**.

For local development, copy `.env.example` to `.env.local` and fill in the key.

### What the database enforces

Row-level security is on for every table. A parent can only ever read or write
their own profile, addresses, children and consents. Admin read policies are in
place for the admin panel later. The browser can't change `role` or
`phone_verified_at` (column-level grants). Signing up as `admin` via metadata is
ignored. One-time codes are stored hashed, expire after 5 minutes, allow 5
tries, need 30 seconds between requests, and are capped at 5 an hour. The
code table has no policies at all, so only the database functions can touch it.
The first address becomes the default, setting a new default clears the old
one, and deleting the default promotes another.

`supabase/tests/` contains the checks used to verify all of this against a real
Postgres 16 with Supabase's `auth` schema stubbed:

```bash
psql -f supabase/tests/00_local_auth_stub.sql
psql -f supabase/migrations/0001_parent_onboarding.sql
psql -f supabase/tests/01_rls_and_otp.sql
```

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** — design tokens live in `src/app/globals.css`
- **Supabase** (Postgres, Auth, row-level security) via `@supabase/supabase-js`
- **Leaflet** + OpenStreetMap for maps, **Zod** for validation, **Vitest** for tests
- Fonts from npm (`@fontsource`), not Google Fonts, so builds need no network

## Running it locally

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm start        # serve the production build
npm run export   # static export into ./out (used for the shareable preview)
npm run lint
npm test         # unit tests: validation, phone numbers, ages, the demo backend
```

## Project layout

```
src/
  app/
    global-not-found.tsx    404 outside /ar and /en
    manifest.ts             PWA manifest
    globals.css             design tokens, dark mode, RTL helpers
    [locale]/
      layout.tsx            root layout: <html lang dir>, header, footer, fonts
      page.tsx              home
      drivers|safety|about|contact|faq|privacy|terms|refunds/
      signup/ login/        parent wizard and sign-in
      account/              account home, children/, addresses/, profile/
  components/
    ui.tsx                  Button, Card, Section, Badge, Check
    link.tsx                next/link, or a plain <a> in the static export
    site-header.tsx         sticky header, mobile menu, language + theme
    site-footer.tsx
    logo.tsx                the Masar pin, as SVG
    theme.tsx               dark-mode toggle and the no-flash init script
    how-tabs.tsx            parents / drivers tabs
    trip-preview.tsx        the live-tracking mockup in the hero
    accordion.tsx           FAQ
    contact-form.tsx
    page-header.tsx         shared page and policy-page layouts
    auth-provider.tsx       session + profile for the whole app
    form.tsx                fields, choices, checkboxes, dialogs, alerts
    map/                    Leaflet map and the location editor
    parent/                 wizard, login, child form, phone check, account area
  lib/
    i18n.ts                 locales, direction, href helper
    data/                   Backend interface, Supabase and demo implementations
    geo.ts                  geocoding and "Detect my location"
    validation.ts           Zod schemas, Saudi mobile and National Address rules
    messages/en.ts          every public-page string, English  ← edit copy here
    messages/ar.ts          every public-page string, Arabic
    messages/app.en.ts      every app string (sign-up, account), English
    messages/app.ar.ts      every app string, Arabic
supabase/
  migrations/               SQL to paste into Supabase
  tests/                    security and behaviour checks for that SQL
tests/                      Vitest unit tests
```

### Changing any text

All copy lives in `src/lib/messages/` (`en.ts`/`ar.ts` for public pages,
`app.en.ts`/`app.ar.ts` for the signed-in app).
The two files have identical shapes, and TypeScript fails the build if a key is
missing from the Arabic file — so translations cannot silently drift.

## Environment variables

Nothing is required to run the site: without Supabase keys it uses the
in-browser demo store.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key. Safe in the browser; row-level security protects the data. |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata. Defaults to `https://www.ksamasar.com`. |
| `STATIC_EXPORT` | Set to `1` to build a static site into `./out`. |
| `NEXT_PUBLIC_STATIC_EXPORT` | Set with the above so links render as plain `<a>`. |

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, import the repo, and deploy. No settings to change.
3. Add `NEXT_PUBLIC_SITE_URL` once the domain is attached.
4. Point **ksamasar.com** at Vercel when you are ready — no code change needed,
   since no URL is hard-coded.

## Accessibility

Built to WCAG 2.1 AA: visible focus rings, a skip link, labelled form fields,
`aria-expanded` / `aria-controls` on the menu, tabs and accordion, 44px minimum
touch targets, and `prefers-reduced-motion` respected.

## How to demo Milestone 2 (about 2 minutes, on a phone)

1. Open `/ar/signup` (or tap **Find a ride**). Fill in the account step.
2. Enter a mobile number like `0551234567` → **Send code**. The demo text
   message shows the code. Tap **Fill it in** → **Verify**.
3. Tap **Detect my location**. Allow location, watch the pin and address fill
   in, then drag the pin to the exact door. Add a note for the driver → **Continue**.
4. Add two children, one with an authorized pick-up person → **Continue**.
5. **Find a ride** opens the account. Show children, addresses (add a second
   one and make it the default) and the profile's consent history.

## Known issues

- On some page loads the browser console shows *Minified React error #418*.
  It's a hydration race between Next.js's hidden metadata placeholder and the
  page's first element, and it shows up mostly on the heavier account pages.
  React recovers by re-rendering the page, and nothing is lost or broken. It
  remains after upgrading to Next 15.5.29. Revisit when moving to Next 16.

## Still to come

Milestones 3 to 11 from the build brief: driver registration and verification,
services and working hours with the conflict engine, search and flexible
booking, the simulated checkout, live trip tracking, notifications, unmet
demand, disputes, dashboards and the demo kit. Child photos arrive with
Milestone 3, which adds private file storage for driver documents.
