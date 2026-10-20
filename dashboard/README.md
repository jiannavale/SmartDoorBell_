# SmartRing AI: Intelligent IoT Doorbell Monitoring System

A self-contained, production-grade single-page dashboard for monitoring smart
doorbells. Vanilla HTML/CSS/JS — **no build step, no frameworks, no network
requests, no CDNs**. Charts are hand-drawn SVG; the porch scene and all icons
are inline SVG.

## Run it

Any of these works:

1. **Just open the file** — double-click `dashboard/index.html` (or drag it
   into a browser). Everything is local, so `file://` is fine.
2. **Serve it statically** (nicer for devtools / caching behaviour):

   ```bash
   # Python
   python -m http.server 8080
   # or XAMPP / Apache: copy the folder under htdocs and visit
   #   http://localhost/Smart%20door%20bell%20notifications%20IOT%20system/dashboard/
   ```

Then open <http://localhost:8080/dashboard/> if you used the Python server.

## Sign in (demo account)

The dashboard is behind a mock login screen (`login.html`). Use the demo
account — no signup needed:

| Field | Value |
| --- | --- |
| **Email** | `demo@porchlight.app` |
| **Password** | `doorbell123` |

Or click **Fill demo & sign in** on the login card. Sessions are stored in
`localStorage` (`porchlight-session`); the header shows the signed-in account
with a **Log out** button. Opening `index.html` while signed out redirects to
the login page.

## What's inside

| File | Role |
| --- | --- |
| `login.html` | Sign-in page with demo account card |
| `index.html` | Page shell, icon sprite, porch-scene SVG, all panel structure |
| `css/styles.css` | Design tokens (light/dark), layout, components, motion |
| `js/auth.js` | Mock session: demo login/logout/requireAuth (REST placeholders) |
| `js/login.js` | Login form controller |
| `js/mock-data.js` | Seeded sample data: 3 devices, 45 events, analytics, health, visitors |
| `js/api.js` | REST client with every endpoint documented; mock implementations |
| `js/store.js` | Tiny central store with pub/sub — all panels render from it |
| `js/realtime.js` | `MockRealtimeBus` — emits weighted events every 8–20 s |
| `js/charts.js` | Hand-rolled SVG line, bar, heatmap, sparkline, progress ring |
| `js/app.js` | Bootstrap, rendering, controls, toasts, accessibility wiring |

## Trying the live behaviour

- **Simulate ring** (top-right of the Live feed panel) fires a doorbell ring
  for the selected device: banner + pulse halo, silhouette on the porch,
  unread badge bump, analytics bump. The mock bus also fires events on its own
  every 8–20 s (weighted toward motion/person).
- **Garage** device is offline — select it to see the error/empty states.
- Theme toggle persists to `localStorage` (`porchlight-theme`) and respects
  `prefers-color-scheme` on first load.
- Chime **Preview** synthesises tones with the Web Audio API — no audio files.

## Plugging in a real backend

1. **REST** — `js/api.js` lists every endpoint in the header comment
   (`GET /devices`, `POST /events/:id/read`, `PUT /settings`, …). Replace each
   mock function body with a `fetch()` call; signatures and return shapes stay
   the same, so the UI does not change.
2. **Realtime** — `js/realtime.js`, `MockRealtimeBus.prototype.start` contains a
   marked `PLACEHOLDER` showing where a WebSocket or MQTT client connects.
   Call `bus.ingest(event)` with any event shaped like the REST objects
   (`{ id, deviceId, type, ts, unread, clip }`) and the whole dashboard reacts.

## Accessibility notes

- Keyboard-navigable throughout with visible focus rings; switches are
  `role="switch"` with `aria-checked`; charts are focusable with arrow-key
  cursors.
- Live regions: event feed `aria-live="polite"`, ring banner `aria-live="assertive"`.
- Colour is never the only signal — every status pairs a colour with text and
  an icon. Palette meets WCAG AA contrast in both themes.
- All motion respects `prefers-reduced-motion`.
