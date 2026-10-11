# Stitch Crossing

Static Canvas line-art/text to cross-stitch chart converter.

## Run

Open index.html in a browser.

## Current state and ownership

Uploaded images are processed in the browser. White cells are blank fabric, not a floss colour or symbol. Preserve trace/skeleton reduction and per-segment negative-space 5/10-grid emphasis. Keep supplied DMC datasets unchanged and symbols ASCII. No backend or automated suite is configured.

`script.js` owns behaviour; `styles.css` owns presentation. Keep established fonts/icons/tokens, accessible labels/focus and feedback. Check only an affected journey/control and reachable failure states. Read [AGENTS](AGENTS.md) for scoped working policy.

## Checks, distribution and recovery

The available static syntax signal is `node --check script.js`; it does not prove rendering or provider effects. No universal timeout or wrapper is configured. Add focused tests only for real changed rules/regressions, not labels/CSS. Use disposable browser state or inputs when verification may write; preserve user files/data. Commit/push, static publication and live provider mutations need separate task authorization. Do not add hosted services or a template documentation suite to this small tool.

## Durable product rules



Stitch Crossing is a small static web app for turning source artwork into a monochrome cross-stitch chart. It is currently plain HTML, CSS, and browser JavaScript:

- `index.html` defines the controls and the single preview canvas.
- `styles.css` owns the dark UI shell, control panel, responsive layout, and canvas stage.
- `script.js` handles image loading, image-to-pattern analysis, pattern drawing, copy/download/print, and status text.

Open `index.html` directly in a browser for manual testing, or use a small local server if a browser blocks local clipboard/image behavior. No package installation is required.

## Cloudflare Pages deployment

Use explicit Wrangler Direct Upload to project `stitch-crossing` (production branch `main`), assigned hostname <https://stitch-crossing.pages.dev/>. The intended custom domain is <https://stitch.nissen.nexus/>. Git pushes do not deploy Pages. Existing GitHub Pages configuration is retained.

`node scripts/build.mjs` recreates only the repository's `dist/` directory, copying exactly `index.html`, `styles.css`, `script.js`, `fav.png`, `404.html`, and `_headers`. Publish only `dist/`. The DMC JSON datasets and `fav1.png` are unused at runtime and remain in source. The existing pinned Lucide script loads from unpkg; failed direct image requests fall back to the public `images.weserv.nl` proxy, which receives the requested URL. Use Choose file for private images. No authentication, secrets, Functions, Worker, database, or bindings are needed.

From a reviewed, committed `main` worktree:

```powershell
node --check script.js
node scripts/build.mjs
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CF_API_TOKEN -ErrorAction SilentlyContinue
$stitchRelease = git rev-parse HEAD
npx --yes wrangler@4.149.0 pages deploy dist --project-name stitch-crossing --branch main --commit-hash $stitchRelease
```

Removing process-local token overrides allows the existing Wrangler OAuth login; do not create tokens. Verify trusted HTTPS, upload/paste, direct and proxied URLs, rendering/controls, PNG download/copy, browser printing and phone layout. Confirm `/README.md`, `/.git/config`, `/.env`, `/scripts/build.mjs`, and `/dmc.json` return 404. Printing uses the browser's print command; the app has no dedicated print control, and the downloadable PNG is laid out for A4.

See Cloudflare's [Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [custom domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Current Conversion Pipeline

The important image logic lives in `script.js`.

1. `renderPattern()` reads the controls, computes stitch dimensions, runs `analyzeSourceArt()`, builds a pattern, then draws it.
2. `analyzeSourceArt()` oversamples the source image before reducing it to the stitch grid. It composites alpha over white, stretches source luminance to a full 0-255 range using low/high percentiles, then detects linework with adaptive thresholding and Sobel-style edge magnitude.
3. The detected binary line art is despeckled. When the stitched stroke option is enabled, it is thinned with a Zhang-Suen-style skeleton pass so fine line centers survive the stitch-grid reduction.
4. Per-cell luminance, ink coverage, trace coverage, and edge coverage are accumulated. This lets a thin line affect a stitch cell even when simple downsampling would average it away.
5. `buildPattern()` quantizes the stretched luminance into the requested monochrome shade count. White cells are treated as blank space: no symbol, no thread-key entry, and no floss count.

The approach is intentionally tuned for line drawings and bold text, not photo-realistic conversion.

## Grid Rules

`drawGrid(pattern)` draws each grid line segment independently:

- Fine grid lines are dark through blank/white space.
- Fine grid lines invert to light over stitched/inked cells so dark artwork stays readable.
- Every 5th grid line is darker only where both neighboring cells are blank.
- Every 10th grid line is darker again and twice the normal line width, also only through blank space.

This segment-level drawing is more verbose than full-line canvas strokes, but it preserves the requested negative-space behavior.

## UI Notes

- White is the blank fabric color. Avoid adding white to the thread palette unless the product direction changes.
- Keep chart symbols ASCII for now. The project had early mojibake/non-ASCII issues, and exported charts should remain predictable across browsers and printers.
- The "Outline" controls currently drive the trace/skeleton line pass. Renaming that UI to "Line trace" would be reasonable in a future polish pass.
- The app uses a deliberately compact operational UI rather than a landing page.
