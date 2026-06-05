## App icons

These PNGs are used for PWA install, favicon, and Apple touch icon:

- `icon-192.png` (192×192) — required for installability
- `icon-512.png` (512×512) — required for installability and splash screens

The repo includes simple branded placeholders. Replace them with your final artwork when ready.

### How to generate icons

**Option A — Design tool (Figma, Canva, Photoshop)**

1. Create a **512×512 px** square artboard.
2. Use a simple logo on `#111111` background (matches `theme_color` in `manifest.json`).
3. Keep important content inside the **center 80%** so maskable cropping looks good.
4. Export as PNG:
   - `icon-512.png` at 512×512
   - `icon-192.png` at 192×192 (resize export or separate artboard)

**Option B — ImageMagick (command line)**

```bash
# From a square source logo (e.g. logo-1024.png)
magick logo-1024.png -resize 512x512 icons/icon-512.png
magick logo-1024.png -resize 192x192 icons/icon-192.png
```

**Option C — PWA Asset Generator**

Use [PWABuilder Image Generator](https://www.pwabuilder.com/imageGenerator) or similar: upload one 512×512 image and download the generated set.

### After replacing icons

1. Bump `CACHE_VERSION` in `service-worker.js`.
2. Redeploy the site.
3. In Chrome DevTools → Application → Service Workers → **Update** or **Unregister** to pick up the new cache.
