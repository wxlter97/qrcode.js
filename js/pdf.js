/**
 * QRPdf — wraps a canvas snapshot (as a baseline JPEG) into a minimal,
 * hand-written single-page PDF. No external PDF library: a JPEG's byte
 * stream can be embedded directly into a PDF image XObject via the
 * DCTDecode filter, which keeps this to a few dozen lines.
 */
const QRPdf = (() => {
  'use strict';

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** Builds a one-page PDF with `canvas` centered on a white page, returns a Blob. */
  function canvasToPdfBlob(canvas, { marginPt = 48 } = {}) {
    const jpegBytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.95));
    const imgW = canvas.width;
    const imgH = canvas.height;
    const pageW = imgW + marginPt * 2;
    const pageH = imgH + marginPt * 2;

    const enc = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const offsets = [];

    const push = (data) => {
      const bytes = typeof data === 'string' ? enc.encode(data) : data;
      chunks.push(bytes);
      offset += bytes.length;
    };
    const startObj = (n) => {
      offsets[n] = offset;
      push(`${n} 0 obj\n`);
    };

    push('%PDF-1.4\n');

    startObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    startObj(2);
    push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    startObj(3);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
    );

    startObj(4);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );
    push(jpegBytes);
    push('\nendstream\nendobj\n');

    const content = `q ${imgW} 0 0 ${imgH} ${marginPt} ${marginPt} cm /Im0 Do Q`;
    startObj(5);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    const xrefStart = offset;
    push(`xref\n0 6\n0000000000 65535 f \n`);
    for (let i = 1; i <= 5; i++) {
      push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return new Blob(chunks, { type: 'application/pdf' });
  }

  return { canvasToPdfBlob };
})();
