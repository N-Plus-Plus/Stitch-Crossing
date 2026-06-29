# Stitch Crossing Agent Notes

## Project Overview

Stitch Crossing is a small static web app for turning source artwork into a monochrome cross-stitch chart. It is currently plain HTML, CSS, and browser JavaScript:

- `index.html` defines the controls and the single preview canvas.
- `styles.css` owns the dark UI shell, control panel, responsive layout, and canvas stage.
- `script.js` handles image loading, image-to-pattern analysis, pattern drawing, copy/download/print, and status text.

There is no build system or package manifest at this point. Open `index.html` directly in a browser for manual testing, or use a small local server if a browser blocks local clipboard/image behavior.

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

## Verification

Useful checks:

- `node --check script.js` for JavaScript syntax.
- `rg --pcre2 "[^\\x00-\\x7F]" -n .` to confirm the project remains ASCII-only.
- Manual browser check with a line-art image and a bold text image. Look for full brightness stretching, blank white cells, traced center lines, and 5/10-grid emphasis only in negative space.

## External Method References Used

The line-art pass is based on common raster-to-line-art techniques: contrast stretching, adaptive thresholding, Sobel/edge detection, despeckling, and morphological thinning/skeletonization. Those methods are common in line drawing vectorization and OCR-style preprocessing workflows.
