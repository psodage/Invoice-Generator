## App icons

These PNGs are used for PWA install, favicon, and Apple touch icon:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

The repo includes simple branded placeholders (`SS` / `INV` on dark background). Replace them with your final artwork when ready.

Tips:

- Use a square image with safe padding so it looks good when masked (maskable icon in `manifest.json`).
- Keep the background simple; it should work with `theme_color` `#111111`.

After replacing icons, bump `CACHE_VERSION` in `service-worker.js` and redeploy.
