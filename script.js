const canvas = document.getElementById("patternCanvas");
const ctx = canvas.getContext("2d");
const previewCanvas = document.getElementById("stitchPreviewCanvas");
const previewCtx = previewCanvas.getContext("2d");

const controls = {
  imageUrl: document.getElementById("imageUrl"),
  loadUrlButton: document.getElementById("loadUrlButton"),
  chooseFileButton: document.getElementById("chooseFileButton"),
  pasteButton: document.getElementById("pasteButton"),
  fileInput: document.getElementById("fileInput"),
  conversionMode: document.getElementById("conversionMode"),
  autoInvertDarkBackground: document.getElementById("autoInvertDarkBackground"),
  mirrorSourceSide: document.getElementById("mirrorSourceSide"),
  fabricCount: document.getElementById("fabricCount"),
  finishedSize: document.getElementById("finishedSize"),
  shadeCount: document.getElementById("shadeCount"),
  outlineEnabled: document.getElementById("outlineEnabled"),
  outlineColor: document.getElementById("outlineColor"),
  edgeSensitivity: document.getElementById("edgeSensitivity"),
  outlineStrength: document.getElementById("outlineStrength"),
  lineThinning: document.getElementById("lineThinning"),
  fabricCountValue: document.getElementById("fabricCountValue"),
  finishedSizeValue: document.getElementById("finishedSizeValue"),
  shadeCountValue: document.getElementById("shadeCountValue"),
  edgeSensitivityValue: document.getElementById("edgeSensitivityValue"),
  outlineStrengthValue: document.getElementById("outlineStrengthValue"),
  lineThinningValue: document.getElementById("lineThinningValue"),
  stitchStats: document.getElementById("stitchStats"),
  sizeStats: document.getElementById("sizeStats"),
  threadStats: document.getElementById("threadStats"),
  status: document.getElementById("status"),
  toast: document.getElementById("toast"),
  renderMeta: document.getElementById("renderMeta"),
  whiteOutStitches: document.getElementById("whiteOutStitches"),
  cropButton: document.getElementById("cropButton"),
  resetButton: document.getElementById("resetButton"),
  copyButton: document.getElementById("copyButton"),
  downloadButton: document.getElementById("downloadButton"),
  printButton: document.getElementById("printButton")
};

const maxCellsPerSide = 360;
const chartSymbols = ["o", "*", "#", "+", "-", "x", "/", "@", "^", "v", "%", "=", "~"];
const margin = 28;
const cellPixels = 18;
const darkestPrintedShade = 100;
const whiteBlankLuminanceThreshold = 248;
const lineArtInkThreshold = 165;
const lineArtIgnoreAboveThreshold = 220;
const lineArtTraceCellThreshold = 0.01;
const lineArtSolidFillCoverageThreshold = 0.42;
const lineArtWeakCoverageMax = 0.18;
const lineArtTrueSolidCoverageThreshold = 0.65;

let sourceImage = null;
let sourceName = "";
let latestPattern = null;
let latestOptions = null;
let renderTimer = 0;
let toastTimer = 0;
let manualCropRect = null;
let cropModeEnabled = false;
let cropDragStart = null;

drawEmptyState();
syncLabels();

controls.loadUrlButton.addEventListener("click", () => {
  const url = controls.imageUrl.value.trim();
  if (url) loadImageFromUrl(url);
});

controls.imageUrl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    controls.loadUrlButton.click();
  }
});

controls.fileInput.addEventListener("change", () => {
  const file = controls.fileInput.files?.[0];
  if (!file) return;
  loadImageFromFile(file);
});

controls.chooseFileButton.addEventListener("click", () => {
  controls.fileInput.click();
});

controls.pasteButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pasteClipboardImage();
});

[
  controls.fabricCount,
  controls.finishedSize,
  controls.shadeCount,
  controls.conversionMode,
  controls.autoInvertDarkBackground,
  controls.mirrorSourceSide,
  controls.outlineEnabled,
  controls.outlineColor,
  controls.edgeSensitivity,
  controls.outlineStrength,
  controls.lineThinning,
  controls.whiteOutStitches
].forEach((control) => {
  control.addEventListener("input", () => {
    syncLabels();
    scheduleRender();
  });
});

controls.copyButton.addEventListener("click", copyCanvasToClipboard);
controls.downloadButton.addEventListener("click", downloadCanvas);
controls.printButton.addEventListener("click", printCanvas);
controls.cropButton.addEventListener("click", toggleCropMode);
controls.resetButton.addEventListener("click", resetManipulations);
canvas.addEventListener("mousedown", beginCropDrag);
canvas.addEventListener("mousemove", updateCropDrag);
window.addEventListener("mouseup", finishCropDrag);

window.addEventListener("paste", (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));

  if (imageItem) {
    const file = imageItem.getAsFile();
    loadImageFromFile(file, "Pasted image");
    return;
  }

  const text = event.clipboardData?.getData("text")?.trim();
  if (text && /^https?:\/\//i.test(text)) {
    controls.imageUrl.value = text;
    loadImageFromUrl(text);
  }
});

function toggleCropMode() {
  cropModeEnabled = !cropModeEnabled;
  cropDragStart = null;
  controls.cropButton.setAttribute("aria-pressed", String(cropModeEnabled));
  canvas.classList.toggle("is-cropping", cropModeEnabled);
}

function resetManipulations() {
  manualCropRect = null;
  cropDragStart = null;
  if (cropModeEnabled) {
    cropModeEnabled = false;
    controls.cropButton.setAttribute("aria-pressed", "false");
    canvas.classList.remove("is-cropping");
  }
  scheduleRender();
}

function beginCropDrag(event) {
  if (!cropModeEnabled || !latestPattern) return;

  const cell = canvasPointToPatternCell(event.clientX, event.clientY, false);
  if (!cell) return;

  event.preventDefault();
  cropDragStart = cell;
}

function finishCropDrag(event) {
  if (!cropModeEnabled || !cropDragStart || !latestPattern) return;

  const endCell = canvasPointToPatternCell(event.clientX, event.clientY, true);
  if (!endCell) {
    cropDragStart = null;
    return;
  }

  const left = Math.min(cropDragStart.x, endCell.x);
  const top = Math.min(cropDragStart.y, endCell.y);
  const right = Math.max(cropDragStart.x, endCell.x);
  const bottom = Math.max(cropDragStart.y, endCell.y);
  const selectedRect = {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1
  };

  manualCropRect = manualCropRect
    ? {
        x: manualCropRect.x + selectedRect.x,
        y: manualCropRect.y + selectedRect.y,
        width: selectedRect.width,
        height: selectedRect.height
      }
    : selectedRect;

  cropDragStart = null;
  cropModeEnabled = false;
  controls.cropButton.setAttribute("aria-pressed", "false");
  canvas.classList.remove("is-cropping");
  scheduleRender();
}

function updateCropDrag(event) {
  if (!cropModeEnabled || !cropDragStart || !latestPattern) return;

  const endCell = canvasPointToPatternCell(event.clientX, event.clientY, true);
  if (!endCell) return;

  drawPattern(latestPattern, latestOptions || getOptions());
  drawCropSelection(cropDragStart, endCell);
}

function drawCropSelection(startCell, endCell) {
  const left = Math.min(startCell.x, endCell.x);
  const top = Math.min(startCell.y, endCell.y);
  const right = Math.max(startCell.x, endCell.x);
  const bottom = Math.max(startCell.y, endCell.y);

  ctx.save();
  ctx.translate(margin, margin);
  ctx.fillStyle = "rgba(0, 229, 255, 0.14)";
  ctx.strokeStyle = "rgba(0, 229, 255, 0.95)";
  ctx.lineWidth = 3;
  ctx.fillRect(left * cellPixels, top * cellPixels, (right - left + 1) * cellPixels, (bottom - top + 1) * cellPixels);
  ctx.strokeRect(
    left * cellPixels + 1.5,
    top * cellPixels + 1.5,
    (right - left + 1) * cellPixels - 3,
    (bottom - top + 1) * cellPixels - 3
  );
  ctx.restore();
}

function canvasPointToPatternCell(clientX, clientY, clampToPattern) {
  if (!latestPattern) return null;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = (clientX - rect.left) * scaleX;
  const canvasY = (clientY - rect.top) * scaleY;
  const patternX = (canvasX - margin) / cellPixels;
  const patternY = (canvasY - margin) / cellPixels;

  if (!clampToPattern) {
    if (patternX < 0 || patternX >= latestPattern.width || patternY < 0 || patternY >= latestPattern.height) return null;
  }

  return {
    x: clamp(Math.floor(patternX), 0, latestPattern.width - 1),
    y: clamp(Math.floor(patternY), 0, latestPattern.height - 1)
  };
}

async function pasteClipboardImage() {
  if (!navigator.clipboard?.read) {
    showToast("Clipboard does not contain compatable image");
    return;
  }

  controls.pasteButton.disabled = true;

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;

      const blob = await item.getType(imageType);
      await loadImageFromFile(blob, "Pasted image");
      return;
    }

    showToast("Clipboard does not contain compatable image");
  } catch {
    showToast("Clipboard does not contain compatable image");
  } finally {
    controls.pasteButton.disabled = false;
  }
}

async function loadImageFromUrl(url) {
  setStatus("Loading image URL...");
  try {
    const objectUrl = await fetchImageAsObjectUrl(url);
    await loadImageObjectUrl(objectUrl, readableUrlName(url));
    URL.revokeObjectURL(objectUrl);
  } catch (directError) {
    try {
      const proxiedUrl = buildImageProxyUrl(url);
      const objectUrl = await fetchImageAsObjectUrl(proxiedUrl);
      await loadImageObjectUrl(objectUrl, `${readableUrlName(url)} (proxied)`);
      URL.revokeObjectURL(objectUrl);
      setStatus("Loaded through a public image proxy because the source did not allow direct canvas access.", "warning");
    } catch (proxyError) {
      setStatus("Could not load that URL. Some sites block browser pixel access; downloading the image and using Choose file will still work.", "error");
    }
  }
}

async function fetchImageAsObjectUrl(url) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("URL did not return an image");
  }
  return URL.createObjectURL(blob);
}

function buildImageProxyUrl(url) {
  const withoutProtocol = url.replace(/^https?:\/\//i, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(withoutProtocol)}`;
}

function readableUrlName(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
  } catch {
    return "Internet image";
  }
}

async function loadImageFromFile(file, name = file.name) {
  setStatus("Loading image file...");
  const objectUrl = URL.createObjectURL(file);
  try {
    await loadImageObjectUrl(objectUrl, name);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImageObjectUrl(objectUrl, name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      sourceImage = image;
      sourceName = name;
      renderPattern();
      resolve();
    };
    image.onerror = () => reject(new Error("Image failed to decode"));
    image.src = objectUrl;
  });
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderPattern, 80);
}

function syncLabels() {
  controls.fabricCountValue.textContent = `${controls.fabricCount.value} stitches/in`;
  controls.finishedSizeValue.textContent = `${controls.finishedSize.value} cm`;
  controls.shadeCountValue.textContent = `${controls.shadeCount.value} shades`;
  const lineArtMode = controls.conversionMode.value === "line-art";
  controls.outlineEnabled.disabled = !lineArtMode;
  controls.outlineColor.disabled = !lineArtMode;
  controls.edgeSensitivity.disabled = !lineArtMode;
  controls.outlineStrength.disabled = !lineArtMode;
  controls.lineThinning.disabled = !lineArtMode;
  controls.edgeSensitivityValue.textContent = controls.edgeSensitivity.value;
  controls.outlineStrengthValue.textContent = `${controls.outlineStrength.value} / 5`;
  controls.lineThinningValue.textContent = lineArtMode ? controls.lineThinning.value : "Off";
}

function renderPattern() {
  if (!sourceImage) {
    drawEmptyState();
    return;
  }

  const options = getOptions();
  const preprocessed = preprocessSourceImage(sourceImage, options);
  const workingImage = preprocessed.image;
  const cropRect = getSourceCropRect(workingImage, options);
  const dimensions = getPatternDimensions(workingImage, options, cropRect);
  const analysis = analyzeSourceArt(workingImage, dimensions, options, cropRect);
  const normalPattern = buildPattern(analysis, dimensions, options);
  const mirroredPattern = options.mirrorEnabled ? applyMirrorMode(normalPattern, options) : normalPattern;
  const gutteredPattern = applyFiveStitchGutter(mirroredPattern);
  const pattern = manualCropRect ? cropPatternToRect(gutteredPattern, manualCropRect) : gutteredPattern;
  drawPattern(pattern, options);
  drawStitchPreview(pattern);

  latestPattern = pattern;
  latestOptions = options;
  const modeLabel = conversionModeLabel(options.conversionMode);
  const modeDetail = options.conversionMode === "line-art" ? `${modeLabel}, thinning ${options.lineThinning}` : modeLabel;
  const mirrorSummary = options.mirrorEnabled ? ", mirror left/right on" : "";
  controls.stitchStats.textContent = `${pattern.width} x ${pattern.height}`;
  controls.sizeStats.textContent = `${pattern.finishedWidthCm.toFixed(1)} x ${pattern.finishedHeightCm.toFixed(1)} cm`;
  controls.threadStats.textContent = `${pattern.palette.length} shade${pattern.palette.length === 1 ? "" : "s"}`;
  const cropSummary = manualCropRect
    ? `Manual crop ${pattern.width} by ${pattern.height} stitches`
    : describeCrop(cropRect, workingImage);
  const invertSummary = preprocessed.inverted ? " Auto inverted." : "";
  controls.renderMeta.textContent = `${sourceName} - ${pattern.width} x ${pattern.height} stitches.${invertSummary}`;

  const capped = pattern.wasCapped ? " Pattern detail was capped to keep the canvas export practical." : "";
  setStatus(`Ready. ${modeDetail} mode${mirrorSummary}, ${pattern.width} by ${pattern.height} stitches on ${options.fabricCount}-count Aida. ${cropSummary}.${invertSummary}${capped}`, pattern.wasCapped ? "warning" : "");
}

function getOptions() {
  return {
    conversionMode: controls.conversionMode.value,
    autoInvertDarkBackground: controls.autoInvertDarkBackground.checked,
    mirrorEnabled: controls.mirrorSourceSide.value !== "off",
    mirrorSourceSide: controls.mirrorSourceSide.value,
    autoCropEnabled: true,
    cropPaddingPercent: 20,
    fabricCount: Number(controls.fabricCount.value),
    finishedMaxCm: Number(controls.finishedSize.value),
    shadeCount: Number(controls.shadeCount.value),
    outlineEnabled: controls.outlineEnabled.checked,
    outlineColor: controls.outlineColor.value,
    edgeSensitivity: Number(controls.edgeSensitivity.value),
    outlineStrength: Number(controls.outlineStrength.value),
    lineThinning: Number(controls.lineThinning.value),
    whiteOutStitches: controls.whiteOutStitches.checked
  };
}

function preprocessSourceImage(image, options) {
  if (!options.autoInvertDarkBackground) {
    return { image, inverted: false };
  }

  const inspection = inspectSourceEdgeLuminance(image);
  if (!inspection.reliable || inspection.averageLuminance >= 128) {
    return { image, inverted: false };
  }

  return {
    image: createInvertedImageCanvas(image),
    inverted: true
  };
}

function inspectSourceEdgeLuminance(image) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.width;
  offscreen.height = image.height;
  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.drawImage(image, 0, 0);

  const data = offscreenCtx.getImageData(0, 0, image.width, image.height).data;
  const bandX = clamp(Math.round(image.width * 0.04), 2, 40);
  const bandY = clamp(Math.round(image.height * 0.04), 2, 40);
  let luminanceTotal = 0;
  let pixelCount = 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const inEdgeBand = x < bandX || x >= image.width - bandX || y < bandY || y >= image.height - bandY;
      if (!inEdgeBand) continue;

      const pixelIndex = (y * image.width + x) * 4;
      if (data[pixelIndex + 3] < 24) continue;

      luminanceTotal += luminanceFromRgb(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]);
      pixelCount += 1;
    }
  }

  return {
    reliable: pixelCount >= Math.max(8, Math.round((image.width + image.height) * 0.02)),
    averageLuminance: pixelCount > 0 ? luminanceTotal / pixelCount : 255
  };
}

function createInvertedImageCanvas(image) {
  const offscreen = document.createElement("canvas");
  offscreen.width = image.width;
  offscreen.height = image.height;
  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.drawImage(image, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255 - data[index];
    data[index + 1] = 255 - data[index + 1];
    data[index + 2] = 255 - data[index + 2];
  }

  offscreenCtx.putImageData(imageData, 0, 0);
  return offscreen;
}

function getPatternDimensions(image, options, cropRect = fullImageCropRect(image)) {
  const stitchSizeCm = 2.54 / options.fabricCount;
  const desiredMaxCells = Math.max(1, Math.round(options.finishedMaxCm / stitchSizeCm));
  const maxCells = Math.min(desiredMaxCells, maxCellsPerSide);
  const aspect = cropRect.width / cropRect.height;

  let width;
  let height;

  if (aspect >= 1) {
    width = maxCells;
    height = Math.max(1, Math.round(maxCells / aspect));
  } else {
    height = maxCells;
    width = Math.max(1, Math.round(maxCells * aspect));
  }

  return {
    width,
    height,
    requestedMaxCells: desiredMaxCells,
    wasCapped: desiredMaxCells > maxCellsPerSide,
    stitchSizeCm,
    finishedWidthCm: width * stitchSizeCm,
    finishedHeightCm: height * stitchSizeCm
  };
}

function fullImageCropRect(image, reason = "disabled") {
  return {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
    isCropped: false,
    reason
  };
}

function getSourceCropRect(image, options) {
  if (!options.autoCropEnabled) {
    return fullImageCropRect(image, "disabled");
  }

  const maxInspectSide = 900;
  const scale = Math.min(1, maxInspectSide / Math.max(image.width, image.height));
  const inspectWidth = Math.max(1, Math.round(image.width * scale));
  const inspectHeight = Math.max(1, Math.round(image.height * scale));
  const offscreen = document.createElement("canvas");
  offscreen.width = inspectWidth;
  offscreen.height = inspectHeight;

  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.imageSmoothingEnabled = true;
  offscreenCtx.imageSmoothingQuality = "high";
  offscreenCtx.drawImage(image, 0, 0, inspectWidth, inspectHeight);

  const data = offscreenCtx.getImageData(0, 0, inspectWidth, inspectHeight).data;
  const background = sampleCropBackground(data, inspectWidth, inspectHeight);
  if (!background.hasTransparency && !background.isReliable) {
    return fullImageCropRect(image, "fallback");
  }

  const threshold = background.hasTransparency ? 0 : getBackgroundDifferenceThreshold(data, inspectWidth, inspectHeight, background);
  let minX = inspectWidth;
  let minY = inspectHeight;
  let maxX = -1;
  let maxY = -1;
  let meaningfulCount = 0;

  for (let y = 0; y < inspectHeight; y++) {
    for (let x = 0; x < inspectWidth; x++) {
      const pixelIndex = (y * inspectWidth + x) * 4;
      if (!isMeaningfulCropPixel(data, pixelIndex, background, threshold)) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      meaningfulCount += 1;
    }
  }

  const inspectedPixels = inspectWidth * inspectHeight;
  const coverage = meaningfulCount / inspectedPixels;
  if (maxX < minX || maxY < minY || meaningfulCount < 8 || coverage < 0.0002 || coverage > 0.92) {
    return fullImageCropRect(image, "fallback");
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const paddingScale = options.cropPaddingPercent / 100;
  const padX = Math.round(cropWidth * paddingScale);
  const padY = Math.round(cropHeight * paddingScale);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(inspectWidth - 1, maxX + padX);
  maxY = Math.min(inspectHeight - 1, maxY + padY);

  const sourceX = Math.floor(minX / scale);
  const sourceY = Math.floor(minY / scale);
  const sourceMaxX = Math.min(image.width, Math.ceil((maxX + 1) / scale));
  const sourceMaxY = Math.min(image.height, Math.ceil((maxY + 1) / scale));
  const sourceWidth = Math.max(1, sourceMaxX - sourceX);
  const sourceHeight = Math.max(1, sourceMaxY - sourceY);
  const retainedArea = (sourceWidth * sourceHeight) / (image.width * image.height);

  if (retainedArea > 0.985) {
    return fullImageCropRect(image, "fallback");
  }

  return {
    x: sourceX,
    y: sourceY,
    width: sourceWidth,
    height: sourceHeight,
    isCropped: true,
    reason: "auto",
    retainedWidthPercent: Math.round((sourceWidth / image.width) * 100),
    retainedHeightPercent: Math.round((sourceHeight / image.height) * 100)
  };
}

function sampleCropBackground(data, width, height) {
  const samples = [];
  const pushSample = (x, y) => {
    const pixelIndex = (y * width + x) * 4;
    samples.push({
      r: data[pixelIndex],
      g: data[pixelIndex + 1],
      b: data[pixelIndex + 2],
      a: data[pixelIndex + 3]
    });
  };

  const maxX = width - 1;
  const maxY = height - 1;
  const steps = 16;
  for (let step = 0; step < steps; step++) {
    const x = Math.round((maxX * step) / Math.max(1, steps - 1));
    const y = Math.round((maxY * step) / Math.max(1, steps - 1));
    pushSample(x, 0);
    pushSample(x, maxY);
    pushSample(0, y);
    pushSample(maxX, y);
  }

  const transparentSamples = samples.filter((sample) => sample.a < 24).length;
  if (transparentSamples > samples.length * 0.35) {
    return { r: 255, g: 255, b: 255, a: 0, luminance: 255, hasTransparency: true };
  }

  const opaqueSamples = samples.filter((sample) => sample.a >= 24);
  const r = median(opaqueSamples.map((sample) => sample.r));
  const g = median(opaqueSamples.map((sample) => sample.g));
  const b = median(opaqueSamples.map((sample) => sample.b));
  const borderDifferences = opaqueSamples.map((sample) => colorDistance(sample.r, sample.g, sample.b, { r, g, b }));
  borderDifferences.sort((a, b) => a - b);
  const borderNoise = borderDifferences[Math.floor(borderDifferences.length * 0.75)] || 0;

  return {
    r,
    g,
    b,
    a: 255,
    luminance: luminanceFromRgb(r, g, b),
    hasTransparency: false,
    isReliable: luminanceFromRgb(r, g, b) >= 235 || borderNoise <= 42
  };
}

function getBackgroundDifferenceThreshold(data, width, height, background) {
  const differences = [];
  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 80));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const pixelIndex = (y * width + x) * 4;
      if (data[pixelIndex + 3] < 24) continue;
      const difference = colorDistance(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], background);
      if (difference < 70) {
        differences.push(difference);
      }
    }
  }

  differences.sort((a, b) => a - b);
  const noiseFloor = differences[Math.floor(differences.length * 0.8)] || 0;
  return clamp(Math.max(18, noiseFloor + 10), 18, 58);
}

function isMeaningfulCropPixel(data, pixelIndex, background, threshold) {
  const alpha = data[pixelIndex + 3];
  if (alpha < 24) return false;
  if (background.hasTransparency) return alpha >= 24;

  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  const luminance = luminanceFromRgb(r, g, b);
  const diff = colorDistance(r, g, b, background);
  const nearWhiteBackground = background.luminance >= 235;
  const inkOnWhite = nearWhiteBackground && luminance < 245 && diff >= Math.max(12, threshold * 0.55);

  return diff >= threshold || inkOnWhite;
}

function describeCrop(cropRect, image) {
  if (!cropRect.isCropped) {
    if (cropRect.reason === "disabled") return "Auto-crop off; using full source";
    return "Auto-crop used full source fallback";
  }

  const widthPercent = cropRect.retainedWidthPercent || Math.round((cropRect.width / image.width) * 100);
  const heightPercent = cropRect.retainedHeightPercent || Math.round((cropRect.height / image.height) * 100);
  return `Auto-cropped to ${widthPercent}% x ${heightPercent}% of source`;
}

function conversionModeLabel(mode) {
  if (mode === "silhouette") return "Silhouette";
  if (mode === "tonal") return "Tonal greyscale";
  return "Line art trace-only";
}

function analyzeSourceArt(image, dimensions, options, cropRect = fullImageCropRect(image)) {
  const oversample = dimensions.width * dimensions.height > 42000 ? 4 : 6;
  const sampleWidth = dimensions.width * oversample;
  const sampleHeight = dimensions.height * oversample;
  const offscreen = document.createElement("canvas");
  offscreen.width = sampleWidth;
  offscreen.height = sampleHeight;

  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.imageSmoothingEnabled = true;
  offscreenCtx.imageSmoothingQuality = "high";
  offscreenCtx.drawImage(
    image,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    sampleWidth,
    sampleHeight
  );

  const data = offscreenCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const highLuminance = new Uint8ClampedArray(sampleWidth * sampleHeight);
  const highAlpha = new Uint8Array(sampleWidth * sampleHeight);
  const histogram = new Uint32Array(256);
  let transparentPixels = 0;

  for (let index = 0; index < highLuminance.length; index++) {
    const pixelIndex = index * 4;
    const alphaValue = data[pixelIndex + 3];
    const alpha = alphaValue / 255;
    const luminance = Math.round(
      alpha *
        (0.2126 * data[pixelIndex] +
          0.7152 * data[pixelIndex + 1] +
          0.0722 * data[pixelIndex + 2]) +
        (1 - alpha) * 255
    );
    highLuminance[index] = luminance;
    highAlpha[index] = alphaValue >= 24 ? 1 : 0;
    if (alphaValue < 250) transparentPixels += 1;
    histogram[luminance] += 1;
  }

  const low = percentileFromHistogram(histogram, 0.01);
  const high = percentileFromHistogram(histogram, 0.985);
  const stretchLow = Math.min(low, Math.max(0, high - 18));
  const stretchHigh = Math.max(stretchLow + 1, high);
  const stretched = stretchLuminance(highLuminance, stretchLow, stretchHigh);
  const localMean = boxBlurGrayscale(stretched, sampleWidth, sampleHeight, Math.max(4, oversample * 2));
  const rawLocalMean = boxBlurGrayscale(highLuminance, sampleWidth, sampleHeight, Math.max(4, oversample * 2));
  const edges = sobelEdges(stretched, sampleWidth, sampleHeight);
  const rawEdges = sobelEdges(highLuminance, sampleWidth, sampleHeight);
  const binary = new Uint8Array(sampleWidth * sampleHeight);
  const adaptiveOffset = options.conversionMode === "line-art" ? 6 + options.edgeSensitivity * 0.16 : 16;
  const edgeCutoff = options.conversionMode === "line-art" ? clamp(options.edgeSensitivity * 1.3, 36, 156) : 96;

  if (options.conversionMode === "line-art") {
    binary.set(buildLineArtMask(highLuminance, highAlpha, rawLocalMean, rawEdges, sampleWidth, sampleHeight, options));
  } else {
    for (let index = 0; index < binary.length; index++) {
      const inkByTone = stretched[index] < localMean[index] - adaptiveOffset;
      const inkByEdge = edges[index] >= edgeCutoff && stretched[index] < 248;
      binary[index] = inkByTone || inkByEdge ? 1 : 0;
    }
  }

  despeckleBinary(binary, sampleWidth, sampleHeight);
  const traced = options.conversionMode === "line-art" ? skeletonize(binary, sampleWidth, sampleHeight) : binary;
  const sourceHasTransparency = transparentPixels / highAlpha.length > 0.001;
  const cellCount = dimensions.width * dimensions.height;
  const luminance = new Float32Array(cellCount);
  const inkCoverage = new Float32Array(cellCount);
  const traceCoverage = new Float32Array(cellCount);
  const edgeCoverage = new Float32Array(cellCount);
  const foregroundCoverage = new Float32Array(cellCount);
  const rawDarkCoverage = new Float32Array(cellCount);
  const optionalEdgeCoverage = new Float32Array(cellCount);

  for (let y = 0; y < dimensions.height; y++) {
    for (let x = 0; x < dimensions.width; x++) {
      let totalTone = 0;
      let ink = 0;
      let trace = 0;
      let edge = 0;
      let foreground = 0;
      let rawDark = 0;
      let optionalEdge = 0;

      for (let sy = 0; sy < oversample; sy++) {
        for (let sx = 0; sx < oversample; sx++) {
          const sampleIndex = (y * oversample + sy) * sampleWidth + x * oversample + sx;
          totalTone += stretched[sampleIndex];
          ink += binary[sampleIndex];
          trace += traced[sampleIndex];
          edge += edges[sampleIndex] >= edgeCutoff ? 1 : 0;
          rawDark += highLuminance[sampleIndex] <= lineArtInkThreshold && highAlpha[sampleIndex] ? 1 : 0;
          optionalEdge +=
            highAlpha[sampleIndex] &&
            highLuminance[sampleIndex] < lineArtIgnoreAboveThreshold &&
            rawEdges[sampleIndex] >= edgeCutoff
              ? 1
              : 0;
          foreground += sourceHasTransparency ? highAlpha[sampleIndex] : Math.max(binary[sampleIndex], stretched[sampleIndex] < 245 ? 1 : 0);
        }
      }

      const cellIndex = y * dimensions.width + x;
      const sampleArea = oversample * oversample;
      luminance[cellIndex] = totalTone / sampleArea;
      inkCoverage[cellIndex] = ink / sampleArea;
      traceCoverage[cellIndex] = trace / sampleArea;
      edgeCoverage[cellIndex] = edge / sampleArea;
      foregroundCoverage[cellIndex] = foreground / sampleArea;
      rawDarkCoverage[cellIndex] = rawDark / sampleArea;
      optionalEdgeCoverage[cellIndex] = optionalEdge / sampleArea;
    }
  }

  return {
    luminance,
    inkCoverage,
    traceCoverage,
    edgeCoverage,
    foregroundCoverage,
    rawDarkCoverage,
    optionalEdgeCoverage,
    stretchLow,
    stretchHigh
  };
}

function buildPattern(analysis, dimensions, options) {
  const { width, height } = dimensions;
  const shadeCount = options.shadeCount;
  const cells = new Array(width * height);
  const levels = makeGrayscaleLevels(shadeCount);
  const whiteIndex = shadeCount - 1;
  const mode = options.conversionMode;
  const lineThreshold = Math.max(0.018, 0.07 - options.outlineStrength * 0.01);
  const silhouetteThreshold = 0.08;
  const lineArtCandidates =
    mode === "line-art" ? buildLineArtCandidateCells(analysis, width, height, options) : null;

  for (let index = 0; index < cells.length; index++) {
    const interpreted = interpretCellForMode(analysis, index, options, mode, lineThreshold, silhouetteThreshold, whiteIndex, lineArtCandidates);
    cells[index] = {
      luminance: interpreted.luminance,
      color: interpreted.isBlank ? "#ffffff" : levels[interpreted.shadeIndex],
      paletteIndex: interpreted.isBlank ? null : interpreted.shadeIndex,
      isBlank: interpreted.isBlank,
      isOutline: interpreted.isOutline
    };
  }

  let palette = levels.map((color, index) => ({
    color,
    symbol: chartSymbols[index] || String(index + 1),
    label: index === whiteIndex ? "White / blank" : `Floss shade ${index + 1}`,
    count: 0
  }));

  if (mode === "line-art" && options.outlineEnabled && normalizeHex(options.outlineColor) !== "#000000") {
    const outlineColor = normalizeHex(options.outlineColor);
    const outlineIndex = palette.length;

    if (cells.some((cell) => cell.isOutline)) {
      palette.push({
        color: outlineColor,
        symbol: chartSymbols[outlineIndex] || String(outlineIndex + 1),
        label: "Traced stitched line",
        count: 0
      });

      cells.forEach((cell) => {
        if (cell.isOutline) {
          cell.color = outlineColor;
          cell.paletteIndex = outlineIndex;
          cell.isBlank = false;
        }
      });
    }
  }

  cells.forEach((cell) => {
    if (cell.paletteIndex !== null) {
      palette[cell.paletteIndex].count += 1;
    }
  });

  const usedPalette = [];
  const remap = new Map();
  palette.forEach((entry, originalIndex) => {
    if (entry.count > 0 && originalIndex !== whiteIndex) {
      remap.set(originalIndex, usedPalette.length);
      usedPalette.push(entry);
    }
  });
  palette = usedPalette;
  cells.forEach((cell) => {
    cell.paletteIndex = cell.paletteIndex === null ? null : remap.get(cell.paletteIndex);
  });

  return {
    width,
    height,
    cells,
    palette,
    fabricCount: options.fabricCount,
    stitchSizeCm: dimensions.stitchSizeCm,
    finishedWidthCm: dimensions.finishedWidthCm,
    finishedHeightCm: dimensions.finishedHeightCm,
    wasCapped: dimensions.wasCapped
  };
}

function interpretCellForMode(analysis, index, options, mode, lineThreshold, silhouetteThreshold, whiteIndex, lineArtCandidates) {
  if (mode === "silhouette") {
    const blankWhite = isWhiteBlankCell(analysis, index, Math.round(analysis.luminance[index]));
    const filled = analysis.foregroundCoverage[index] >= silhouetteThreshold || analysis.inkCoverage[index] >= silhouetteThreshold;
    return {
      luminance: filled && !blankWhite ? 0 : 255,
      shadeIndex: 0,
      isBlank: !filled || blankWhite,
      isOutline: false
    };
  }

  if (mode === "tonal") {
    const luminance = clamp(Math.round(analysis.luminance[index]), 0, 255);
    const rawShadeIndex = quantize(luminance, options.shadeCount);
    const isBlank = isWhiteBlankCell(analysis, index, luminance);
    const shadeIndex = isBlank ? rawShadeIndex : Math.min(rawShadeIndex, Math.max(0, whiteIndex - 1));
    return {
      luminance,
      shadeIndex,
      isBlank,
      isOutline: false
    };
  }

  if (mode === "line-art") {
    const candidate = lineArtCandidates[index];
    const tracedLine = candidate.selected && candidate.traceCoverage >= lineArtTraceCellThreshold;
    const solidFill = candidate.selected && candidate.rawDarkCoverage >= lineArtSolidFillCoverageThreshold;
    const sourceLuminance = Math.round(analysis.luminance[index]);
    const isStitched = candidate.selected;
    const blankWhite = !isStitched && isWhiteBlankCell(analysis, index, sourceLuminance);
    return {
      luminance: isStitched ? 0 : 255,
      shadeIndex: 0,
      isBlank: !isStitched || blankWhite,
      isOutline: tracedLine && options.outlineEnabled && normalizeHex(options.outlineColor) !== "#000000"
    };
  }

  const coverageDarkening = analysis.inkCoverage[index] * 175 + analysis.edgeCoverage[index] * 22;
  const tracedLine = options.outlineEnabled && analysis.traceCoverage[index] >= lineThreshold;
  const sourceLuminance = Math.round(analysis.luminance[index]);
  const blankWhite = !tracedLine && isWhiteBlankCell(analysis, index, sourceLuminance);
  const luminance = tracedLine ? 0 : blankWhite ? 255 : clamp(Math.round(analysis.luminance[index] - coverageDarkening), 0, 255);
  const rawShadeIndex = tracedLine ? 0 : quantize(luminance, options.shadeCount);
  const isBlank = blankWhite;
  const shadeIndex = isBlank ? rawShadeIndex : Math.min(rawShadeIndex, Math.max(0, whiteIndex - 1));

  return {
    luminance,
    shadeIndex,
    isBlank,
    isOutline: tracedLine
  };
}

function isWhiteBlankCell(analysis, index, luminance) {
  return (
    luminance >= whiteBlankLuminanceThreshold &&
    analysis.inkCoverage[index] < 0.01 &&
    analysis.edgeCoverage[index] < 0.02 &&
    analysis.traceCoverage[index] < 0.01
  );
}

function percentileFromHistogram(histogram, percentile) {
  const target = histogram.reduce((sum, value) => sum + value, 0) * percentile;
  let running = 0;

  for (let index = 0; index < histogram.length; index++) {
    running += histogram[index];
    if (running >= target) return index;
  }

  return histogram.length - 1;
}

function stretchLuminance(source, low, high) {
  const output = new Uint8ClampedArray(source.length);
  const range = Math.max(1, high - low);

  for (let index = 0; index < source.length; index++) {
    output[index] = clamp(Math.round(((source[index] - low) / range) * 255), 0, 255);
  }

  return output;
}

function boxBlurGrayscale(source, width, height, radius) {
  const output = new Uint8ClampedArray(source.length);
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += source[y * width + x];
      const integralIndex = (y + 1) * (width + 1) + x + 1;
      integral[integralIndex] = integral[integralIndex - width - 1] + rowSum;
    }
  }

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + x1 + 1] -
        integral[y0 * (width + 1) + x1 + 1] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      output[y * width + x] = Math.round(sum / area);
    }
  }

  return output;
}

function sobelEdges(source, width, height) {
  const output = new Uint8ClampedArray(source.length);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const topLeft = source[(y - 1) * width + x - 1];
      const top = source[(y - 1) * width + x];
      const topRight = source[(y - 1) * width + x + 1];
      const left = source[y * width + x - 1];
      const right = source[y * width + x + 1];
      const bottomLeft = source[(y + 1) * width + x - 1];
      const bottom = source[(y + 1) * width + x];
      const bottomRight = source[(y + 1) * width + x + 1];
      const gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
      const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      output[y * width + x] = clamp(Math.round(Math.hypot(gx, gy) * 0.25), 0, 255);
    }
  }

  return output;
}

function despeckleBinary(binary, width, height) {
  const removals = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!binary[index]) continue;
      let neighbors = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          neighbors += binary[(y + dy) * width + x + dx];
        }
      }

      if (neighbors <= 1) removals.push(index);
    }
  }

  removals.forEach((index) => {
    binary[index] = 0;
  });
}

function skeletonize(binary, width, height) {
  const output = new Uint8Array(binary);
  let changed = true;
  let passes = 0;

  while (changed && passes < 48) {
    changed = thinningPass(output, width, height, 0) || false;
    changed = thinningPass(output, width, height, 1) || changed;
    passes += 1;
  }

  return output;
}

function thinningPass(binary, width, height, phase) {
  const removals = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!binary[index]) continue;

      const p2 = binary[(y - 1) * width + x];
      const p3 = binary[(y - 1) * width + x + 1];
      const p4 = binary[y * width + x + 1];
      const p5 = binary[(y + 1) * width + x + 1];
      const p6 = binary[(y + 1) * width + x];
      const p7 = binary[(y + 1) * width + x - 1];
      const p8 = binary[y * width + x - 1];
      const p9 = binary[(y - 1) * width + x - 1];
      const neighborCount = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      const transitions =
        (!p2 && p3) +
        (!p3 && p4) +
        (!p4 && p5) +
        (!p5 && p6) +
        (!p6 && p7) +
        (!p7 && p8) +
        (!p8 && p9) +
        (!p9 && p2);

      if (neighborCount < 2 || neighborCount > 6 || transitions !== 1) continue;

      const phaseA = phase === 0 ? p2 * p4 * p6 === 0 : p2 * p4 * p8 === 0;
      const phaseB = phase === 0 ? p4 * p6 * p8 === 0 : p2 * p6 * p8 === 0;
      if (phaseA && phaseB) removals.push(index);
    }
  }

  removals.forEach((index) => {
    binary[index] = 0;
  });

  return removals.length > 0;
}

function makeGrayscaleLevels(count) {
  if (count === 1) return [rgbToHex(darkestPrintedShade, darkestPrintedShade, darkestPrintedShade)];
  return Array.from({ length: count }, (_, index) => {
    const value = Math.round(darkestPrintedShade + (255 - darkestPrintedShade) * (index / (count - 1)));
    return rgbToHex(value, value, value);
  });
}

function quantize(luminance, shadeCount) {
  if (shadeCount <= 1) return 0;
  const bucket = Math.round((luminance / 255) * (shadeCount - 1));
  return clamp(bucket, 0, shadeCount - 1);
}

function buildLineArtCandidateCells(analysis, width, height, options) {
  const candidates = Array.from({ length: width * height }, (_, index) => {
    const traceCoverage = analysis.traceCoverage[index];
    const rawDarkCoverage = analysis.rawDarkCoverage[index];
    const optionalEdgeCoverage = analysis.optionalEdgeCoverage[index];
    const weakCoverage = rawDarkCoverage < lineArtWeakCoverageMax && traceCoverage < lineArtTraceCellThreshold;
    const selected =
      !weakCoverage &&
      (traceCoverage >= lineArtTraceCellThreshold || rawDarkCoverage >= lineArtSolidFillCoverageThreshold);

    return {
      selected,
      traceCoverage,
      rawDarkCoverage,
      optionalEdgeCoverage,
      trueSolid: rawDarkCoverage >= lineArtTrueSolidCoverageThreshold,
      score: traceCoverage * 10 + rawDarkCoverage * 3 + optionalEdgeCoverage
    };
  });

  if (options.lineThinning <= 0) {
    return candidates;
  }

  return sparsifyLineArtCells(candidates, width, height, options);
}

function sparsifyLineArtCells(candidateCells, width, height, options) {
  const cells = candidateCells.map((cell) => ({ ...cell }));
  const thinning = clamp(Math.round(options.lineThinning), 0, 4);

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const block = [
        y * width + x,
        y * width + x + 1,
        (y + 1) * width + x,
        (y + 1) * width + x + 1
      ];
      const selected = block.filter((index) => cells[index].selected);
      if (selected.length < 4 || selected.every((index) => cells[index].trueSolid)) continue;
      removeLowestScoringLineCell(cells, selected, width, height, thinning);
    }
  }

  const densityLimit = [9, 7, 6, 5, 4][thinning];
  if (densityLimit < 9) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const block = getNeighborhoodIndexes(x, y, width, height);
        let selected = block.filter((index) => cells[index].selected);
        while (selected.length > densityLimit) {
          const removed = removeLowestScoringLineCell(cells, selected, width, height, thinning);
          if (!removed) break;
          selected = block.filter((index) => cells[index].selected);
        }
      }
    }
  }

  return cells;
}

function removeLowestScoringLineCell(cells, indexes, width, height, thinning) {
  const removable = indexes
    .filter((index) => !cells[index].trueSolid && canRemoveLineArtCell(cells, index, width, height, thinning))
    .sort((a, b) => cells[a].score - cells[b].score);

  if (removable.length === 0) return false;
  cells[removable[0]].selected = false;
  return true;
}

function canRemoveLineArtCell(cells, index, width, height, thinning) {
  if (thinning >= 4) return true;

  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors = getNeighborhoodIndexes(x, y, width, height).filter(
    (neighborIndex) => neighborIndex !== index && cells[neighborIndex].selected
  );

  if (neighbors.length <= 2) return false;
  return countNeighborGroups(cells, neighbors, x, y, width) <= 1;
}

function countNeighborGroups(cells, neighbors, centerX, centerY, width) {
  const allowed = new Set(neighbors);
  const visited = new Set();
  let groups = 0;

  neighbors.forEach((startIndex) => {
    if (visited.has(startIndex)) return;
    groups += 1;
    const stack = [startIndex];
    visited.add(startIndex);

    while (stack.length > 0) {
      const current = stack.pop();
      const currentX = current % width;
      const currentY = Math.floor(current / width);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = currentX + dx;
          const ny = currentY + dy;
          if (nx === centerX && ny === centerY) continue;
          const neighborIndex = ny * width + nx;
          if (!allowed.has(neighborIndex) || visited.has(neighborIndex) || !cells[neighborIndex].selected) continue;
          visited.add(neighborIndex);
          stack.push(neighborIndex);
        }
      }
    }
  });

  return groups;
}

function getNeighborhoodIndexes(x, y, width, height) {
  const indexes = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        indexes.push(ny * width + nx);
      }
    }
  }

  return indexes;
}

function buildLineArtMask(rawLuminance, alphaMask, localMean, rawEdges, width, height, options) {
  const mask = new Uint8Array(rawLuminance.length);
  const edgeCutoff = clamp(options.edgeSensitivity * 1.15, 32, 128);
  const adaptiveOffset = 10 + options.edgeSensitivity * 0.08;

  for (let index = 0; index < rawLuminance.length; index++) {
    if (!alphaMask[index]) continue;
    const luminance = rawLuminance[index];
    if (luminance >= lineArtIgnoreAboveThreshold) continue;

    const clearInk = luminance <= lineArtInkThreshold;
    const mediumLineEdge =
      luminance <= lineArtIgnoreAboveThreshold - 18 &&
      rawEdges[index] >= edgeCutoff &&
      luminance < localMean[index] - adaptiveOffset;

    mask[index] = clearInk || mediumLineEdge ? 1 : 0;
  }

  return mask;
}

function applyMirrorMode(pattern, options) {
  const centerX = findNonBlankConcentrationCenterX(pattern);
  if (centerX === null) {
    return pattern;
  }

  const patternCenterX = (pattern.width - 1) / 2;
  const shiftX = Math.round(patternCenterX - centerX);
  const centeredCells = createBlankCellGrid(pattern.width, pattern.height);

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const sourceCell = pattern.cells[y * pattern.width + x];
      if (sourceCell.isBlank) continue;
      const targetX = x + shiftX;
      if (targetX < 0 || targetX >= pattern.width) continue;
      centeredCells[y * pattern.width + targetX] = cloneCell(sourceCell);
    }
  }

  const mirroredCells = mirrorCells(centeredCells, pattern.width, pattern.height, options.mirrorSourceSide);
  return rebuildPatternWithCells(pattern, mirroredCells);
}

function findNonBlankConcentrationCenterX(pattern) {
  let weightedX = 0;
  let count = 0;

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const cell = pattern.cells[y * pattern.width + x];
      if (cell.isBlank) continue;
      weightedX += x;
      count += 1;
    }
  }

  return count > 0 ? weightedX / count : null;
}

function createBlankCellGrid(width, height) {
  return Array.from({ length: width * height }, () => ({
    luminance: 255,
    color: "#ffffff",
    paletteIndex: null,
    isBlank: true,
    isOutline: false
  }));
}

function mirrorCells(cells, width, height, requestedSide) {
  if (requestedSide !== "left" && requestedSide !== "right") {
    return cells.map((cell) => cloneCell(cell));
  }

  const mirrored = cells.map((cell) => cloneCell(cell));
  const halfWidth = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let offset = 0; offset < halfWidth; offset++) {
      const leftX = offset;
      const rightX = width - 1 - offset;
      const leftIndex = y * width + leftX;
      const rightIndex = y * width + rightX;

      if (requestedSide === "right") {
        mirrored[leftIndex] = cloneCell(cells[rightIndex]);
      } else {
        mirrored[rightIndex] = cloneCell(cells[leftIndex]);
      }
    }
  }

  return mirrored;
}

function rebuildPatternWithCells(pattern, cells) {
  const palette = pattern.palette.map((item) => ({ ...item, count: 0 }));

  cells.forEach((cell) => {
    if (cell.paletteIndex !== null && palette[cell.paletteIndex]) {
      palette[cell.paletteIndex].count += 1;
    }
  });

  const usedPalette = [];
  const remap = new Map();
  palette.forEach((entry, originalIndex) => {
    if (entry.count > 0) {
      remap.set(originalIndex, usedPalette.length);
      usedPalette.push(entry);
    }
  });

  const remappedCells = cells.map((cell) => {
    if (cell.paletteIndex === null) return cloneCell(cell);
    const nextIndex = remap.get(cell.paletteIndex);
    if (nextIndex === undefined) {
      return {
        luminance: 255,
        color: "#ffffff",
        paletteIndex: null,
        isBlank: true,
        isOutline: false
      };
    }
    return {
      ...cell,
      paletteIndex: nextIndex
    };
  });

  return {
    ...pattern,
    cells: remappedCells,
    palette: usedPalette
  };
}

function applyFiveStitchGutter(pattern) {
  const bounds = getStitchBounds(pattern);
  if (!bounds) return pattern;

  const left = Math.floor(bounds.minX / 5) * 5;
  const top = Math.floor(bounds.minY / 5) * 5;
  const right = Math.ceil((bounds.maxX + 1) / 5) * 5 - 1;
  const bottom = Math.ceil((bounds.maxY + 1) / 5) * 5 - 1;
  const width = right - left + 1;
  const height = bottom - top + 1;
  const cells = createBlankCellGrid(width, height);

  for (let y = 0; y < height; y++) {
    const sourceY = y + top;
    if (sourceY < 0 || sourceY >= pattern.height) continue;

    for (let x = 0; x < width; x++) {
      const sourceX = x + left;
      if (sourceX < 0 || sourceX >= pattern.width) continue;
      cells[y * width + x] = cloneCell(pattern.cells[sourceY * pattern.width + sourceX]);
    }
  }

  return rebuildPatternWithCells(
    {
      ...pattern,
      width,
      height,
      finishedWidthCm: width * pattern.stitchSizeCm,
      finishedHeightCm: height * pattern.stitchSizeCm
    },
    cells
  );
}

function cropPatternToRect(pattern, rect) {
  const left = clamp(Math.floor(rect.x), 0, Math.max(0, pattern.width - 1));
  const top = clamp(Math.floor(rect.y), 0, Math.max(0, pattern.height - 1));
  const right = clamp(Math.floor(rect.x + rect.width - 1), left, Math.max(0, pattern.width - 1));
  const bottom = clamp(Math.floor(rect.y + rect.height - 1), top, Math.max(0, pattern.height - 1));
  const width = right - left + 1;
  const height = bottom - top + 1;
  const cells = createBlankCellGrid(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = cloneCell(pattern.cells[(top + y) * pattern.width + left + x]);
    }
  }

  return rebuildPatternWithCells(
    {
      ...pattern,
      width,
      height,
      finishedWidthCm: width * pattern.stitchSizeCm,
      finishedHeightCm: height * pattern.stitchSizeCm
    },
    cells
  );
}

function cloneCell(cell) {
  return { ...cell };
}

function drawPattern(pattern, options = getOptions()) {
  const patternWidthPx = pattern.width * cellPixels;
  const patternHeightPx = pattern.height * cellPixels;
  const canvasWidth = Math.max(margin * 2 + patternWidthPx, 860);
  const keyY = margin * 2 + patternHeightPx;
  const canvasHeight = keyY + getKeyHeight(pattern) + margin;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(margin, margin);

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const cell = pattern.cells[y * pattern.width + x];
      ctx.fillStyle = options.whiteOutStitches && !cell.isBlank ? "#ffffff" : cell.color;
      ctx.fillRect(x * cellPixels, y * cellPixels, cellPixels, cellPixels);
    }
  }

  drawSymbols(pattern, options);
  drawGrid(pattern);
  drawCenterMarker(pattern);
  ctx.restore();

  drawKey(pattern, margin, keyY, canvasWidth - margin * 2);
}

function drawStitchPreview(pattern) {
  const patternWidthPx = pattern.width * cellPixels;
  const patternHeightPx = pattern.height * cellPixels;
  const canvasWidth = Math.max(margin * 2 + patternWidthPx, 860);
  const canvasHeight = margin * 2 + patternHeightPx;

  previewCanvas.width = canvasWidth;
  previewCanvas.height = canvasHeight;

  previewCtx.fillStyle = "#ffffff";
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  previewCtx.save();
  previewCtx.translate(margin, margin);

  previewCtx.lineCap = "round";
  previewCtx.lineJoin = "round";
  previewCtx.lineWidth = Math.max(1.4, cellPixels * 0.16);

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const cell = pattern.cells[y * pattern.width + x];
      if (cell.isBlank) continue;

      const inset = Math.max(2, cellPixels * 0.18);
      const left = x * cellPixels + inset;
      const top = y * cellPixels + inset;
      const right = (x + 1) * cellPixels - inset;
      const bottom = (y + 1) * cellPixels - inset;

      previewCtx.strokeStyle = cell.color;
      previewCtx.beginPath();
      previewCtx.moveTo(left, top);
      previewCtx.lineTo(right, bottom);
      previewCtx.moveTo(right, top);
      previewCtx.lineTo(left, bottom);
      previewCtx.stroke();
    }
  }

  drawPreviewGrid(pattern);
  previewCtx.restore();
}

function drawPreviewGrid(pattern) {
  const { width, height } = pattern;
  previewCtx.save();
  previewCtx.globalAlpha = 0.2;
  previewCtx.lineCap = "square";

  for (let x = 0; x <= width; x++) {
    const major = x > 0 && x < width && x % 5 === 0;
    const decade = major && x % 10 === 0;
    previewCtx.beginPath();
    previewCtx.lineWidth = decade ? 2 : 1;
    previewCtx.strokeStyle = gridStrokeStyle(major, decade);
    previewCtx.moveTo(x * cellPixels, 0);
    previewCtx.lineTo(x * cellPixels, height * cellPixels);
    previewCtx.stroke();
  }

  for (let y = 0; y <= height; y++) {
    const major = y > 0 && y < height && y % 5 === 0;
    const decade = major && y % 10 === 0;
    previewCtx.beginPath();
    previewCtx.lineWidth = decade ? 2 : 1;
    previewCtx.strokeStyle = gridStrokeStyle(major, decade);
    previewCtx.moveTo(0, y * cellPixels);
    previewCtx.lineTo(width * cellPixels, y * cellPixels);
    previewCtx.stroke();
  }

  previewCtx.restore();
}

function getKeyHeight(pattern) {
  return 82 + pattern.palette.length * 48 + 20;
}

function getPatternCenterCell(pattern) {
  return {
    x: Math.ceil((pattern.width - 1) / 2),
    y: Math.ceil((pattern.height - 1) / 2)
  };
}

function drawSymbols(pattern, options = getOptions()) {
  const center = getPatternCenterCell(pattern);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(9, Math.floor(cellPixels * 0.62))}px Arial, sans-serif`;

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const cell = pattern.cells[y * pattern.width + x];
      if (cell.isBlank) continue;
      if (x === center.x && y === center.y) continue;
      const paletteItem = pattern.palette[cell.paletteIndex];
      ctx.fillStyle = options.whiteOutStitches ? "#555555" : contrastFor(cell.color);
      ctx.fillText(paletteItem.symbol, x * cellPixels + cellPixels / 2, y * cellPixels + cellPixels / 2 + 0.5);
    }
  }
}

function drawCenterMarker(pattern) {
  const center = getPatternCenterCell(pattern);
  ctx.beginPath();
  ctx.fillStyle = "#00e5ff";
  ctx.arc(
    center.x * cellPixels + cellPixels / 2,
    center.y * cellPixels + cellPixels / 2,
    cellPixels / 4,
    0,
    Math.PI * 2
  );
  ctx.fill();
}

function drawGrid(pattern) {
  const { width, height } = pattern;
  ctx.lineCap = "square";

  for (let x = 0; x <= width; x++) {
    const major = x > 0 && x < width && x % 5 === 0;
    const decade = major && x % 10 === 0;
    ctx.beginPath();
    ctx.lineWidth = decade ? 2 : 1;
    ctx.strokeStyle = gridStrokeStyle(major, decade);
    ctx.moveTo(x * cellPixels, 0);
    ctx.lineTo(x * cellPixels, height * cellPixels);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y++) {
    const major = y > 0 && y < height && y % 5 === 0;
    const decade = major && y % 10 === 0;
    ctx.beginPath();
    ctx.lineWidth = decade ? 2 : 1;
    ctx.strokeStyle = gridStrokeStyle(major, decade);
    ctx.moveTo(0, y * cellPixels);
    ctx.lineTo(width * cellPixels, y * cellPixels);
    ctx.stroke();
  }
}

function gridStrokeStyle(major, decade) {
  if (decade) return "rgb(56, 56, 56)";
  if (major) return "rgb(107, 107, 107)";
  return "rgb(179, 179, 179)";
}

function drawKey(pattern, x, y, width) {
  const columnGap = margin;
  const stitchedAreaLines = getStitchedAreaLines(pattern);
  const materialRows = pattern.palette.map((item) => ({
    required: formatThreadRequirement(item.count, pattern.fabricCount),
    detail: `${item.count} stitch${item.count === 1 ? "" : "es"} + 2 in waste`
  }));
  const threadColumnWidth = measureThreadKeyColumn(pattern);
  const materialsColumnWidth = measureMaterialsColumn(materialRows);
  const stitchedAreaWidth = measureStitchedAreaColumn(stitchedAreaLines);
  const stitchedAreaX = x + width - stitchedAreaWidth;
  const materialsX = x + threadColumnWidth + columnGap;
  const materialTextWidth = Math.max(80, Math.min(materialsColumnWidth, stitchedAreaX - materialsX - columnGap));
  const threadTextWidth = Math.max(80, threadColumnWidth - 42);

  ctx.fillStyle = "#111111";
  ctx.font = "700 20px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Thread key", x, y);
  ctx.fillText("Materials", materialsX, y);
  drawStitchedAreaKey(stitchedAreaLines, stitchedAreaX, y, stitchedAreaWidth);

  ctx.font = "12px Arial, sans-serif";
  ctx.fillStyle = "#454545";
  ctx.fillText(`${pattern.fabricCount}-count Aida`, x, y + 28);
  ctx.fillText(`${pattern.finishedWidthCm.toFixed(1)} x ${pattern.finishedHeightCm.toFixed(1)} cm`, x, y + 45);
  ctx.fillText("Approx. floss required", materialsX, y + 28, materialTextWidth);

  let rowY = y + 82;
  pattern.palette.forEach((item, index) => {
    ctx.fillStyle = item.color;
    ctx.fillRect(x, rowY, 30, 30);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, rowY, 30, 30);

    ctx.fillStyle = contrastFor(item.color);
    ctx.font = "700 16px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.symbol, x + 15, rowY + 15);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "700 13px Arial, sans-serif";
    ctx.fillStyle = "#111111";
    ctx.fillText(item.label, x + 42, rowY, threadTextWidth);

    ctx.font = "12px Arial, sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText(`${item.color.toUpperCase()} - ${item.count} stitches`, x + 42, rowY + 17, threadTextWidth);

    ctx.font = "700 13px Arial, sans-serif";
    ctx.fillStyle = "#111111";
    ctx.fillText(materialRows[index].required, materialsX, rowY, materialTextWidth);

    ctx.font = "12px Arial, sans-serif";
    ctx.fillStyle = "#555555";
    ctx.fillText(materialRows[index].detail, materialsX, rowY + 17, materialTextWidth);
    rowY += 48;
  });
}

function drawStitchedAreaKey(lines, x, y, width) {
  const textWidth = Math.max(20, width);

  ctx.fillStyle = "#111111";
  ctx.font = "700 16px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Stitched area", x, y);

  ctx.font = "12px Arial, sans-serif";
  ctx.fillStyle = "#555555";

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + 26 + index * 17, textWidth);
  });
}

function measureThreadKeyColumn(pattern) {
  let width = measureText("700 20px Arial, sans-serif", "Thread key");
  width = Math.max(width, measureText("12px Arial, sans-serif", `${pattern.fabricCount}-count Aida`));
  width = Math.max(width, measureText("12px Arial, sans-serif", `${pattern.finishedWidthCm.toFixed(1)} x ${pattern.finishedHeightCm.toFixed(1)} cm`));

  pattern.palette.forEach((item) => {
    width = Math.max(width, 42 + measureText("700 13px Arial, sans-serif", item.label));
    width = Math.max(width, 42 + measureText("12px Arial, sans-serif", `${item.color.toUpperCase()} - ${item.count} stitches`));
  });

  return Math.ceil(width);
}

function measureMaterialsColumn(rows) {
  let width = measureText("700 20px Arial, sans-serif", "Materials");
  width = Math.max(width, measureText("12px Arial, sans-serif", "Approx. floss required"));

  rows.forEach((row) => {
    width = Math.max(width, measureText("700 13px Arial, sans-serif", row.required));
    width = Math.max(width, measureText("12px Arial, sans-serif", row.detail));
  });

  return Math.ceil(width);
}

function measureStitchedAreaColumn(lines) {
  let width = measureText("700 16px Arial, sans-serif", "Stitched area");
  lines.forEach((line) => {
    width = Math.max(width, measureText("12px Arial, sans-serif", line));
  });
  return Math.ceil(width);
}

function measureText(font, text) {
  ctx.save();
  ctx.font = font;
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

function getStitchedAreaLines(pattern) {
  const bounds = getStitchBounds(pattern);
  if (!bounds) return ["No stitches detected"];

  const widthInches = bounds.widthStitches / pattern.fabricCount;
  const heightInches = bounds.heightStitches / pattern.fabricCount;
  return [`Width: ${formatInchesAndCm(widthInches)}`, `Height: ${formatInchesAndCm(heightInches)}`];
}

function formatThreadRequirement(stitchCount, fabricCount) {
  const cellInches = 1 / fabricCount;
  const stitchDiagonalInches = Math.hypot(cellInches, cellInches);
  const inchesPerStitch = 2 * stitchDiagonalInches + cellInches * 3;
  const totalInches = stitchCount * inchesPerStitch + 2;
  return formatInchesAndCm(totalInches);
}

function formatInchesAndCm(inches) {
  return `${inches.toFixed(2)} in (${(inches * 2.54).toFixed(1)} cm)`;
}

function getStitchBounds(pattern) {
  let minX = pattern.width;
  let minY = pattern.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const cell = pattern.cells[y * pattern.width + x];
      if (cell.isBlank) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    widthStitches: maxX - minX + 1,
    heightStitches: maxY - minY + 1
  };
}

function drawEmptyState() {
  canvas.width = 1200;
  canvas.height = 800;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#151515";
  ctx.font = "700 42px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Load an image to generate a pattern", canvas.width / 2, canvas.height / 2 - 18);
  ctx.fillStyle = "#666666";
  ctx.font = "20px Arial, sans-serif";
  ctx.fillText("URL, file upload, or pasted image", canvas.width / 2, canvas.height / 2 + 34);

  previewCanvas.width = 1200;
  previewCanvas.height = 420;
  previewCtx.fillStyle = "#ffffff";
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.fillStyle = "#151515";
  previewCtx.font = "700 34px Arial, sans-serif";
  previewCtx.textAlign = "center";
  previewCtx.textBaseline = "middle";
  previewCtx.fillText("Completed stitch preview", previewCanvas.width / 2, previewCanvas.height / 2 - 14);
  previewCtx.fillStyle = "#666666";
  previewCtx.font = "18px Arial, sans-serif";
  previewCtx.fillText("Generated after a pattern is created", previewCanvas.width / 2, previewCanvas.height / 2 + 34);
}

function copyCanvasToClipboard() {
  if (!latestPattern) {
    setStatus("Load an image before copying.", "warning");
    return;
  }

  if (!navigator.clipboard || !window.ClipboardItem) {
    setStatus("Clipboard image copy is not available in this browser context. Use Download instead.", "warning");
    return;
  }

  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("Pattern PNG copied to clipboard.");
    } catch {
      setStatus("Clipboard copy was blocked by the browser. Use Download instead.", "warning");
    }
  }, "image/png");
}

function downloadCanvas() {
  if (!latestPattern) {
    setStatus("Load an image before downloading.", "warning");
    return;
  }

  const link = document.createElement("a");
  link.download = `stitch-crossing-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function printCanvas() {
  if (!latestPattern) {
    setStatus("Load an image before printing.", "warning");
    return;
  }

  const orientation = latestPattern.width >= latestPattern.height ? "landscape" : "portrait";
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("The print window was blocked by the browser.", "warning");
    return;
  }

  const dataUrl = canvas.toDataURL("image/png");
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <title>Stitch Crossing Pattern</title>
    <style>
      @page { size: A4 ${orientation}; margin: 10mm; }
      html, body { margin: 0; min-height: 100%; background: #fff; }
      body { display: grid; place-items: center; }
      img { max-width: 100%; max-height: 100vh; object-fit: contain; }
      @media print { img { max-height: 190mm; } }
    </style>
  </head>
  <body>
    <img src="${dataUrl}" alt="Cross-stitch pattern">
    <script>window.onload = () => { window.focus(); window.print(); };<\/script>
  </body>
</html>`);
  printWindow.document.close();
}

function normalizeHex(hex) {
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  return "#000000";
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function contrastFor(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance <= 128 ? "#ffffff" : "#000000";
}

function hexToRgb(hexColor) {
  const hex = normalizeHex(hexColor).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function luminanceFromRgb(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(r, g, b, reference) {
  const dr = r - reference.r;
  const dg = g - reference.g;
  const db = b - reference.b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(message, tone = "") {
  if (!controls.status) return;
  controls.status.textContent = message;
  controls.status.classList.toggle("is-warning", tone === "warning");
  controls.status.classList.toggle("is-error", tone === "error");
}

function showToast(message) {
  if (!controls.toast) return;

  window.clearTimeout(toastTimer);
  controls.toast.textContent = message;
  controls.toast.classList.add("is-visible");

  toastTimer = window.setTimeout(() => {
    controls.toast.classList.remove("is-visible");
  }, 3000);
}
