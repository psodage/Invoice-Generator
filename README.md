# S.S. Engineers Invoice Generator

Vanilla HTML/CSS/JS app for creating and exporting invoices.

## Running locally

Service workers and install prompts **require a secure origin** (HTTPS or `http://localhost`). Opening `index.html` directly via `file://` will **not** register the service worker.

From this folder:

```bash
npx serve .
```

Then open the URL shown (typically `http://localhost:3000`).

## Progressive Web App (PWA)

The app is installable when served over HTTPS or localhost. It caches core assets for offline use: open the app, fill the invoice form, and view the preview. PDF export uses a vendored copy of html2pdf under `vendor/` and works offline after the first successful load.

### Replace app icons

App icons live in the `web/` folder (`favicon.ico`, `apple-touch-icon.png`, PNG sizes for PWA). See `web/README.txt`. After replacing icons, bump `CACHE_VERSION` in `service-worker.js` so clients pick up the new files.

### Test install and offline

1. Serve with `npx serve .` (or deploy over HTTPS).
2. **Chrome DevTools → Application**
   - **Manifest**: check name, icons, start URL, display mode.
   - **Service Workers**: confirm `service-worker.js` is activated.
3. **Lighthouse** (Progressive Web App category): run against the localhost URL.
4. **Offline**: DevTools → Network → Offline, reload once online (to populate cache), then verify form + preview. Use Application → Clear storage only when you need a fresh cache.

### Updates

When `CACHE_VERSION` changes, returning visitors see an “A new version is available” bar; tap **Refresh** to activate the new service worker.
