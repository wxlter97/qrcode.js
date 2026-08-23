/**
 * QRRender — turns a payload string into a styled QR code, drawn on a
 * <canvas> or exported as an SVG string. Sits on top of the vendored
 * qrcode-generator matrix (js/qrcode-lib.js); everything visual (module
 * shape, eye shape, color/gradient, logo overlay, quiet zone) is ours.
 */
const QRRender = (() => {
  'use strict';

  /** Builds the boolean dark/light module matrix for `text` at `ecLevel` ('L'|'M'|'Q'|'H'). */
  function buildMatrix(text, ecLevel) {
    const qr = qrcode(0, ecLevel);
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const matrix = new Array(n);
    for (let r = 0; r < n; r++) {
      matrix[r] = new Array(n);
      for (let c = 0; c < n; c++) matrix[r][c] = qr.isDark(r, c);
    }
    return matrix;
  }

  // Is (row, col) inside one of the three 7x7 finder-eye bounding boxes?
  function eyeAt(n, row, col) {
    if (row < 7 && col < 7) return 'tl';
    if (row < 7 && col >= n - 7) return 'tr';
    if (row >= n - 7 && col < 7) return 'bl';
    return null;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawEye(ctx, px, py, cell, style, color) {
    const outer = 7 * cell;
    const round = style === 'rounded';
    ctx.fillStyle = color;
    // Outer ring (7x7 with a 5x5 hole).
    if (round) {
      roundRectPath(ctx, px, py, outer, outer, cell * 1.6);
      ctx.fill('evenodd');
    } else {
      ctx.fillRect(px, py, outer, outer);
    }
    // Punch the light gap (5x5) — repaint background color there, then
    // paint the 3x3 core back in fg color.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    if (round) {
      roundRectPath(ctx, px + cell, py + cell, 5 * cell, 5 * cell, cell * 1.1);
      ctx.fill();
    } else {
      ctx.fillRect(px + cell, py + cell, 5 * cell, 5 * cell);
    }
    ctx.restore();
    ctx.fillStyle = color;
    if (round) {
      roundRectPath(ctx, px + 2 * cell, py + 2 * cell, 3 * cell, 3 * cell, cell * 0.9);
      ctx.fill();
    } else {
      ctx.fillRect(px + 2 * cell, py + 2 * cell, 3 * cell, 3 * cell);
    }
  }

  function makeFillStyle(ctx, colorMode, color1, color2, sizePx) {
    if (colorMode !== 'gradient') return color1;
    const g = ctx.createLinearGradient(0, 0, sizePx, sizePx);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    return g;
  }

  /**
   * Draws `matrix` onto `canvas`.
   * opts: {
   *   sizePx, marginModules, fgColor, bgColor, transparentBg,
   *   colorMode: 'solid'|'gradient', fgColor2,
   *   moduleStyle: 'square'|'rounded'|'dots', eyeStyle: 'square'|'rounded',
   *   logoImage (HTMLImageElement|null), logoRatio (0..0.35)
   * }
   */
  function drawToCanvas(canvas, matrix, opts) {
    const n = matrix.length;
    const margin = opts.marginModules ?? 4;
    const totalModules = n + margin * 2;
    const sizePx = opts.sizePx || 512;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = sizePx * dpr;
    canvas.height = sizePx * dpr;
    canvas.style.width = sizePx + 'px';
    canvas.style.height = sizePx + 'px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sizePx, sizePx);

    const cell = sizePx / totalModules;
    const offset = margin * cell;

    if (!opts.transparentBg) {
      ctx.fillStyle = opts.bgColor || '#ffffff';
      ctx.fillRect(0, 0, sizePx, sizePx);
    }

    const fill = makeFillStyle(ctx, opts.colorMode, opts.fgColor || '#000000', opts.fgColor2 || opts.fgColor, sizePx);
    ctx.fillStyle = fill;

    // Reserve a clear zone for the logo, in module units, centered.
    let logoModules = 0;
    if (opts.logoImage) {
      logoModules = Math.round(n * Math.min(Math.max(opts.logoRatio ?? 0.22, 0), 0.35));
      if (logoModules % 2 !== (n % 2)) logoModules += 1; // keep it centered on a module boundary
    }
    const logoStart = (n - logoModules) / 2;
    const logoEnd = logoStart + logoModules;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const eye = eyeAt(n, r, c);
        if (eye) continue; // eyes drawn separately below
        if (!matrix[r][c]) continue;
        if (logoModules > 0 && r >= logoStart && r < logoEnd && c >= logoStart && c < logoEnd) continue;

        const x = offset + c * cell;
        const y = offset + r * cell;

        if (opts.moduleStyle === 'dots') {
          const rad = cell * 0.42;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, rad, 0, Math.PI * 2);
          ctx.fill();
        } else if (opts.moduleStyle === 'rounded') {
          roundRectPath(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.28);
          ctx.fill();
        } else {
          ctx.fillRect(x - 0.5, y - 0.5, cell + 1, cell + 1);
        }
      }
    }

    // Draw the three finder eyes on top, always crisp (never dotted) so
    // scanners keep locking on reliably.
    ctx.fillStyle = fill;
    drawEye(ctx, offset, offset, cell, opts.eyeStyle, opts.fgColor || '#000000');
    drawEye(ctx, offset + (n - 7) * cell, offset, cell, opts.eyeStyle, opts.fgColor || '#000000');
    drawEye(ctx, offset, offset + (n - 7) * cell, cell, opts.eyeStyle, opts.fgColor || '#000000');

    if (opts.logoImage && logoModules > 0) {
      const boxSize = logoModules * cell;
      const bx = offset + logoStart * cell;
      const by = offset + logoStart * cell;
      const pad = boxSize * 0.1;

      ctx.save();
      ctx.fillStyle = opts.transparentBg ? '#ffffff' : (opts.bgColor || '#ffffff');
      roundRectPath(ctx, bx, by, boxSize, boxSize, boxSize * 0.22);
      ctx.fill();
      roundRectPath(ctx, bx + pad, by + pad, boxSize - pad * 2, boxSize - pad * 2, (boxSize - pad * 2) * 0.22);
      ctx.clip();
      const img = opts.logoImage;
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, bx + pad, by + pad, boxSize - pad * 2, boxSize - pad * 2);
      ctx.restore();
    }

    return { sizePx, cell, offset, n, margin };
  }

  /** Renders `matrix` as a standalone SVG string (vector export). Logo not embedded. */
  function matrixToSVG(matrix, opts) {
    const n = matrix.length;
    const margin = opts.marginModules ?? 4;
    const total = n + margin * 2;
    const fg = opts.fgColor || '#000000';
    const bg = opts.bgColor || '#ffffff';
    const round = opts.moduleStyle === 'rounded';
    const dots = opts.moduleStyle === 'dots';

    let defs = '';
    let fillRef = fg;
    if (opts.colorMode === 'gradient') {
      const id = 'g' + Math.random().toString(36).slice(2, 9);
      defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${opts.fgColor2 || fg}"/>
      </linearGradient></defs>`;
      fillRef = `url(#${id})`;
    }

    let body = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (eyeAt(n, r, c)) continue;
        if (!matrix[r][c]) continue;
        const x = margin + c;
        const y = margin + r;
        if (dots) {
          body += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.42"/>`;
        } else if (round) {
          body += `<rect x="${x + 0.08}" y="${y + 0.08}" width="0.84" height="0.84" rx="0.28"/>`;
        } else {
          body += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        }
      }
    }

    const eyeGroup = (ox0, oy0, idx) => {
      const ox = ox0 + margin;
      const oy = oy0 + margin;
      const r1 = round ? 1.6 : 0;
      const r2 = round ? 1.1 : 0;
      const r3 = round ? 0.9 : 0;
      const maskId = `eyemask-${idx}`;
      return `<mask id="${maskId}">
          <rect x="${ox}" y="${oy}" width="7" height="7" rx="${r1}" fill="#fff"/>
          <rect x="${ox + 1}" y="${oy + 1}" width="5" height="5" rx="${r2}" fill="#000"/>
        </mask>
        <rect x="${ox}" y="${oy}" width="7" height="7" rx="${r1}" mask="url(#${maskId})"/>
        <rect x="${ox + 2}" y="${oy + 2}" width="3" height="3" rx="${r3}"/>`;
    };

    const eyes = eyeGroup(0, 0, 0) + eyeGroup(n - 7, 0, 1) + eyeGroup(0, n - 7, 2);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${opts.sizePx || 512}" height="${opts.sizePx || 512}">
      ${defs}
      ${opts.transparentBg ? '' : `<rect x="0" y="0" width="${total}" height="${total}" fill="${bg}"/>`}
      <g fill="${fillRef}">${body}${eyes}</g>
    </svg>`;
  }

  return { buildMatrix, drawToCanvas, matrixToSVG };
})();
