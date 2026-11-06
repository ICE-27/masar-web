# Masar | مسار

Safe, verified rides for children. A two-sided platform connecting parents in the
Eastern Province of Saudi Arabia with verified bus and private-car drivers.

KFUPM · MKT510 Marketing Management · Team 03.

> **Demo project.** No real payments are processed and no real rides are booked.

---

## Milestone 1 — what is built

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

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** — design tokens live in `src/app/globals.css`
- Fonts from npm (`@fontsource`), not Google Fonts, so builds need no network
- No database yet — that arrives with Milestone 2 (Supabase)

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
```

## Project layout

```
src/
  app/
    layout.tsx              root layout (passes through)
    not-found.tsx           404 outside /ar and /en
    manifest.ts             PWA manifest
    globals.css             design tokens, dark mode, RTL helpers
    [locale]/
      layout.tsx            <html lang dir>, header, footer, fonts
      page.tsx              home
      drivers|safety|about|contact|faq|privacy|terms|refunds/
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
  lib/
    i18n.ts                 locales, direction, href helper
    messages/en.ts          every string, English  ← edit copy here
    messages/ar.ts          every string, Arabic
```

### Changing any text

All copy lives in `src/lib/messages/en.ts` and `src/lib/messages/ar.ts`.
The two files have identical shapes, and TypeScript fails the build if a key is
missing from the Arabic file — so translations cannot silently drift.

## Environment variables

Nothing is required to run Milestone 1.

| Variable | Purpose |
|---|---|
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

## Still to come

Milestones 2 to 11 from the build brief: parent and driver registration with map
location, driver verification, services and working hours with the conflict
engine, search and flexible booking, the simulated checkout, live trip tracking,
notifications, unmet demand, disputes, dashboards and the demo kit.
