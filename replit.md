# Calldid

A Progressive Web App (PWA) for finding, calling, and tracking local businesses.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no build system)
- **Backend-as-a-Service**: Supabase (auth + PostgreSQL database)
- **APIs**: Google Places API (via Cloudflare Worker proxy), Nominatim (reverse geocoding), Anthropic/Claude
- **PWA**: Service worker for offline support, Web App Manifest

## Project Structure

```
index.html     - Main app interface (Search, Lists, Profile)
auth.html      - Authentication (Sign Up, Log In, Google OAuth)
admin.html     - Admin dashboard (API keys, feature toggles, code editor)
sw.js          - Service worker (offline caching)
manifest.json  - PWA manifest
icon.svg       - App icon
server.js      - Simple Node.js static file server for development
```

## Running the App

The app is served via a simple Node.js static file server (`server.js`) on port 5000.

## Configuration

- API keys (Google Places, Anthropic) are configured via the admin dashboard (`/admin.html`) and stored in Supabase or localStorage.
- Supabase URL and anon key are hardcoded in `index.html` and `auth.html`.

## Deployment

Configured as a static site deployment (no build step required).
