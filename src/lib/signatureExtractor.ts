export type SignatureInkStyle = 'original' | 'blue' | 'black';

export interface SignatureCropBox {
  /** Normalized 0..1 coordinates relative to the rotated image */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignatureExtractOptions {
  /** 10 (strict/dark ink only) to 95 (sensitive/faint pencil & thin ink). Default: 54 */
  sensitivity: number;
  /** Output ink rendering style */
  inkStyle: SignatureInkStyle;
  /** Remove isolated paper dust specks */
  denoise: boolean;
  /** Slightly reinforce thin pen strokes for crisp A4 printing */
  enhanceStrokes: boolean;
  /** Trim empty transparent margins around the signature */
  autoTrim: boolean;
  /** Clockwise rotation in degrees */
  rotation: 0 | 90 | 180 | 270;
  /** Optional normalized crop rectangle on the rotated source */
  crop?: SignatureCropBox;
}

export interface SignatureExtractResult {
  dataUrl: string;
  width: number;
  height: number;
  hasInk: boolean;
  inkCoveragePct: number;
}

export const DEFAULT_SIGNATURE_OPTIONS: SignatureExtractOptions = {
  sensitivity: 54,
  inkStyle: 'blue',
  denoise: true,
  enhanceStrokes: true,
  autoTrim: true,
  rotation: 0,
  crop: { x: 0.04, y: 0.12, width: 0.92, height: 0.76 },
};

const MAX_WORKING_SIDE = 1200;
const MAX_OUTPUT_WIDTH = 540;
const MAX_OUTPUT_HEIGHT = 210;

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the selected image.'));
    img.src = src;
  });
}

export function readFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Renders an image rotated clockwise by 0/90/180/270 degrees into a working canvas
 * constrained to MAX_WORKING_SIDE for smooth mobile & tablet performance.
 */
export function buildRotatedCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  rotation: 0 | 90 | 180 | 270
): HTMLCanvasElement {
  const srcW = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
  const srcH = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;

  const swap = rotation === 90 || rotation === 270;
  const rawW = swap ? srcH : srcW;
  const rawH = swap ? srcW : srcH;

  const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(rawW, rawH, 1));
  const outW = Math.max(1, Math.round(rawW * scale));
  const outH = Math.max(1, Math.round(rawH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);

  const drawW = Math.max(1, Math.round(srcW * scale));
  const drawH = Math.max(1, Math.round(srcH * scale));
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  return canvas;
}

/**
 * Extracts a clean transparent-background PNG signature from a photo of a sheet
 * of paper or an uploaded image. Uses local background illumination estimation
 * so uneven lighting and paper shadows do not leave gray boxes behind the ink.
 */
export function extractSignatureFromCanvas(
  rotatedCanvas: HTMLCanvasElement,
  options: SignatureExtractOptions
): SignatureExtractResult {
  const crop = options.crop || { x: 0, y: 0, width: 1, height: 1 };
  const clampedX = Math.max(0, Math.min(0.95, crop.x));
  const clampedY = Math.max(0, Math.min(0.95, crop.y));
  const clampedW = Math.max(0.05, Math.min(1 - clampedX, crop.width));
  const clampedH = Math.max(0.05, Math.min(1 - clampedY, crop.height));

  const sx = Math.floor(rotatedCanvas.width * clampedX);
  const sy = Math.floor(rotatedCanvas.height * clampedY);
  const sw = Math.max(8, Math.floor(rotatedCanvas.width * clampedW));
  const sh = Math.max(8, Math.floor(rotatedCanvas.height * clampedH));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = sw;
  workCanvas.height = sh;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) {
    return { dataUrl: '', width: 0, height: 0, hasInk: false, inkCoveragePct: 0 };
  }

  workCtx.drawImage(rotatedCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const imageData = workCtx.getImageData(0, 0, sw, sh);
  const data = imageData.data;

  // Step 1: Compute per-pixel luminance and build a coarse local background map
  // using the 85th-percentile luminance inside ~32px tiles (robust to paper shadows).
  const totalPixels = sw * sh;
  const lum = new Float32Array(totalPixels);
  const sat = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 20) {
      // Already transparent pixel -> treat as bright paper background
      lum[i] = 255;
      sat[i] = 0;
    } else {
      const alphaFactor = a / 255;
      const rr = r * alphaFactor + 255 * (1 - alphaFactor);
      const gg = g * alphaFactor + 255 * (1 - alphaFactor);
      const bb = b * alphaFactor + 255 * (1 - alphaFactor);
      lum[i] = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      const mx = Math.max(rr, gg, bb);
      const mn = Math.min(rr, gg, bb);
      sat[i] = mx - mn;
    }
  }

  const gridCols = Math.max(4, Math.min(20, Math.round(sw / 40)));
  const gridRows = Math.max(3, Math.min(14, Math.round(sh / 36)));
  const bgGrid = new Float32Array(gridCols * gridRows);

  for (let gy = 0; gy < gridRows; gy++) {
    const y0 = Math.floor((gy * sh) / gridRows);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * sh) / gridRows));
    for (let gx = 0; gx < gridCols; gx++) {
      const x0 = Math.floor((gx * sw) / gridCols);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * sw) / gridCols));

      // Sample up to ~250 pixels in this tile to estimate local paper brightness
      const stepX = Math.max(1, Math.floor((x1 - x0) / 14));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 14));
      const samples: number[] = [];
      for (let py = y0; py < y1; py += stepY) {
        const rowOff = py * sw;
        for (let px = x0; px < x1; px += stepX) {
          samples.push(lum[rowOff + px]);
        }
      }
      samples.sort((a, b) => a - b);
      const p85Idx = Math.min(samples.length - 1, Math.floor(samples.length * 0.85));
      bgGrid[gy * gridCols + gx] = samples[p85Idx] ?? 245;
    }
  }

  // Smooth the background grid slightly (3x3 box filter) to avoid tile seams
  const smoothBg = new Float32Array(gridCols * gridRows);
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gridRows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= gridCols) continue;
          sum += bgGrid[ny * gridCols + nx];
          cnt++;
        }
      }
      smoothBg[gy * gridCols + gx] = sum / Math.max(1, cnt);
    }
  }

  // Step 2: Threshold relative to bilinearly interpolated local paper luminance
  // Higher sensitivity -> lower diff threshold (captures fainter ink)
  const clampedSens = Math.max(10, Math.min(95, options.sensitivity));
  const diffThreshold = 82 - (clampedSens - 10) * 0.78; // ~82 down to ~15.7
  const softRange = Math.max(14, diffThreshold * 0.55);

  const alphaMap = new Uint8Array(totalPixels);

  for (let y = 0; y < sh; y++) {
    const fy = ((y + 0.5) / sh) * gridRows - 0.5;
    const gy0 = Math.max(0, Math.min(gridRows - 1, Math.floor(fy)));
    const gy1 = Math.max(0, Math.min(gridRows - 1, gy0 + 1));
    const ty = Math.max(0, Math.min(1, fy - gy0));
    const rowOff = y * sw;

    for (let x = 0; x < sw; x++) {
      const fx = ((x + 0.5) / sw) * gridCols - 0.5;
      const gx0 = Math.max(0, Math.min(gridCols - 1, Math.floor(fx)));
      const gx1 = Math.max(0, Math.min(gridCols - 1, gx0 + 1));
      const tx = Math.max(0, Math.min(1, fx - gx0));

      const b00 = smoothBg[gy0 * gridCols + gx0];
      const b10 = smoothBg[gy0 * gridCols + gx1];
      const b01 = smoothBg[gy1 * gridCols + gx0];
      const b11 = smoothBg[gy1 * gridCols + gx1];
      const top = b00 + (b10 - b00) * tx;
      const bot = b01 + (b11 - b01) * tx;
      const localPaper = top + (bot - top) * ty;

      const idx = rowOff + x;
      // Boost blue/ink saturation slightly so blue ballpoint pen pops off lined paper
      const colorBoost = sat[idx] > 28 ? Math.min(22, (sat[idx] - 28) * 0.35) : 0;
      const darkness = localPaper - lum[idx] + colorBoost;

      if (darkness <= diffThreshold * 0.65) {
        alphaMap[idx] = 0;
      } else {
        const normalized = Math.min(1, (darkness - diffThreshold * 0.65) / softRange);
        // Smooth S-curve for crisp anti-aliased strokes
        const curved = normalized * normalized * (3 - 2 * normalized);
        alphaMap[idx] = Math.round(curved * 255);
      }
    }
  }

  // Step 3: Optional speckle denoising (remove isolated noise dots with < 2 inked neighbors)
  let processedAlpha = alphaMap;
  if (options.denoise) {
    const cleaned = new Uint8Array(totalPixels);
    for (let y = 1; y < sh - 1; y++) {
      const rowOff = y * sw;
      for (let x = 1; x < sw - 1; x++) {
        const idx = rowOff + x;
        const a = alphaMap[idx];
        if (a < 32) continue;
        let neighbors = 0;
        if (alphaMap[idx - sw - 1] > 48) neighbors++;
        if (alphaMap[idx - sw] > 48) neighbors++;
        if (alphaMap[idx - sw + 1] > 48) neighbors++;
        if (alphaMap[idx - 1] > 48) neighbors++;
        if (alphaMap[idx + 1] > 48) neighbors++;
        if (alphaMap[idx + sw - 1] > 48) neighbors++;
        if (alphaMap[idx + sw] > 48) neighbors++;
        if (alphaMap[idx + sw + 1] > 48) neighbors++;

        if (neighbors >= 2 || a > 210) {
          cleaned[idx] = a;
        }
      }
    }
    processedAlpha = cleaned;
  }

  // Step 4: Optional stroke enhancement (gentle 4-neighbor dilation boost so thin lines print crisply)
  if (options.enhanceStrokes) {
    const boosted = new Uint8Array(processedAlpha);
    for (let y = 1; y < sh - 1; y++) {
      const rowOff = y * sw;
      for (let x = 1; x < sw - 1; x++) {
        const idx = rowOff + x;
        const cur = processedAlpha[idx];
        if (cur >= 235) continue;
        const maxN = Math.max(
          processedAlpha[idx - 1],
          processedAlpha[idx + 1],
          processedAlpha[idx - sw],
          processedAlpha[idx + sw]
        );
        if (maxN > 140) {
          boosted[idx] = Math.max(cur, Math.round(maxN * 0.72));
        }
      }
    }
    processedAlpha = boosted;
  }

  // Step 5: Write output RGBA + compute tight ink bounding box
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  let inkedCount = 0;

  for (let y = 0; y < sh; y++) {
    const rowOff = y * sw;
    for (let x = 0; x < sw; x++) {
      const idx = rowOff + x;
      const outA = processedAlpha[idx];
      const pIdx = idx * 4;

      if (outA < 24) {
        data[pIdx + 3] = 0;
        continue;
      }

      inkedCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (options.inkStyle === 'black') {
        data[pIdx] = 15;
        data[pIdx + 1] = 23;
        data[pIdx + 2] = 42;
        data[pIdx + 3] = outA;
      } else if (options.inkStyle === 'blue') {
        // Classic official blue ballpoint ink (#1b3a8a)
        data[pIdx] = 27;
        data[pIdx + 1] = 58;
        data[pIdx + 2] = 138;
        data[pIdx + 3] = outA;
      } else {
        // Original ink with clean contrast deepening
        data[pIdx] = Math.max(0, Math.round(data[pIdx] * 0.78));
        data[pIdx + 1] = Math.max(0, Math.round(data[pIdx + 1] * 0.78));
        data[pIdx + 2] = Math.max(0, Math.round(data[pIdx + 2] * 0.85));
        data[pIdx + 3] = outA;
      }
    }
  }

  workCtx.putImageData(imageData, 0, 0);

  const hasInk = maxX >= minX && maxY >= minY && inkedCount > 20;
  const inkCoveragePct = Math.round((inkedCount / Math.max(1, totalPixels)) * 1000) / 10;

  // Step 6: Trim & scale cleanly to compact transparent PNG
  let trimX = 0;
  let trimY = 0;
  let trimW = sw;
  let trimH = sh;

  if (options.autoTrim && hasInk) {
    const padX = Math.max(8, Math.round((maxX - minX) * 0.05));
    const padY = Math.max(6, Math.round((maxY - minY) * 0.08));
    trimX = Math.max(0, minX - padX);
    trimY = Math.max(0, minY - padY);
    trimW = Math.min(sw - trimX, maxX - minX + 1 + padX * 2);
    trimH = Math.min(sh - trimY, maxY - minY + 1 + padY * 2);
  }

  const outScale = Math.min(1, MAX_OUTPUT_WIDTH / trimW, MAX_OUTPUT_HEIGHT / trimH);
  const finalW = Math.max(1, Math.round(trimW * outScale));
  const finalH = Math.max(1, Math.round(trimH * outScale));

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = finalW;
  finalCanvas.height = finalH;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) {
    return { dataUrl: '', width: 0, height: 0, hasInk: false, inkCoveragePct: 0 };
  }

  finalCtx.clearRect(0, 0, finalW, finalH);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(workCanvas, trimX, trimY, trimW, trimH, 0, 0, finalW, finalH);

  return {
    dataUrl: finalCanvas.toDataURL('image/png'),
    width: finalW,
    height: finalH,
    hasInk,
    inkCoveragePct,
  };
}
