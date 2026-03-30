# Calldid — Next.js App

A local business call-tracking PWA. Find nearby businesses, call them, log notes and availability, and organise them into lists.

## Stack

- **Framework**: Next.js 14.2 (App Router, TypeScript)
- **Auth / Database**: Supabase (`@supabase/supabase-js`)  
  - URL: `https://issiqvhdydwmpcffwdvb.supabase.co`
  - Tables: `profiles`, `lists`, `businesses`, `app_settings`
- **Search proxy**: Cloudflare Worker `https://calldid-places.zeesdev.workers.dev` (Google Places API)
- **Fonts**: DM Sans + DM Mono via `next/font/google`
- **Deploy target**: Vercel

## Routes

| Route | Description |
|-------|-------------|
| `/` | Main app — search, lists, profile views |
| `/auth` | Sign-up / login page (Supabase auth + Google OAuth) |
| `/admin` | Admin panel — API keys, feature toggles, users, code editor |

## Key Files

```
app/
  layout.tsx        # Root layout with fonts and PWA metadata
  globals.css       # All CSS (main app + auth + admin themes)
  page.tsx          # Main app (search, lists, profile)
  auth/page.tsx     # Auth page (signup/login/Google OAuth)
  admin/page.tsx    # Admin panel (hybrid JSX + vanilla JS in useEffect)
lib/
  supabase.ts       # Singleton Supabase client
public/
  manifest.json     # PWA manifest
  sw.js             # Service worker
  icon.svg          # App icon
```

## Dev

```bash
npm run dev   # http://localhost:5000
```

## Admin

Admin panel at `/admin`. Login with your Calldid account email + password (any non-empty password). Manages:
- API keys (Google, Claude, Stripe, GitHub)
- Feature toggles (saved to Supabase `app_settings`)
- App settings (branding, colors, pricing)
- Users (view/upgrade/downgrade plans)
- Code editor (GitHub integration for editing files)

## State

- **Auth session**: Supabase session + `calldid_user` localStorage
- **App state**: Saved to `calldid_state` localStorage + Supabase tables
- **Admin session**: `calldid_admin` in sessionStorage
- **Search history**: Supabase `app_settings` keyed by `search_history_{uid}`

## Notes

- `reactStrictMode: false` in next.config.js to avoid double-effect firing
- Admin page uses hybrid pattern: JSX layout + all vanilla JS in `useEffect`, CodeMirror loaded dynamically
- Cloudflare Worker is kept as-is (not replaced with Next.js API route)
- OAuth redirect URL should be updated to production Vercel domain when deploying
