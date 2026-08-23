/**
 * app.js — wires the editor form, style controls, live preview, exports,
 * history and PWA install prompt together. No framework: small direct DOM
 * updates driven by one `state` object.
 */
(() => {
  'use strict';

  const TYPE_ICONS = {
    text: 'icon-link',
    wifi: 'icon-wifi',
    contact: 'icon-person',
    email: 'icon-envelope',
    phone: 'icon-phone',
    sms: 'icon-message',
    event: 'icon-calendar',
    location: 'icon-pin',
  };

  const FG_PRESETS = ['#000000', '#0A84FF', '#FF3B30', '#34C759', '#FF9500', '#5E5CE6', '#FFFFFF'];
  const BG_PRESETS = ['#FFFFFF', '#000000', '#F2F2F7', '#FFF4E5', '#E8F6EC', '#E9EEFB'];

  const state = {
    type: 'text',
    values: {},
    style: {
      fgColor: '#000000',
      colorMode: 'solid',
      fgColor2: '#5E5CE6',
      bgColor: '#FFFFFF',
      transparentBg: false,
      moduleStyle: 'square',
      eyeStyle: 'square',
      ecLevel: 'M',
      marginModules: 4,
      exportSizePx: 1024,
      logoRatio: 0.22,
      logoDataUrl: null,
    },
    logoImage: null, // HTMLImageElement, kept out of style so it's never JSON-serialized directly
  };

  const $ = (id) => document.getElementById(id);
  const canvas = $('qr-canvas');
  const caption = $('preview-caption');

  // ---------------------------------------------------------------- toast

  let toastTimer = null;
  function showToast(text) {
    const toast = $('toast');
    $('toast-text').textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------------ segmented

  function attachSegmented(container, onChange) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented__item');
      if (!btn || btn.disabled || container.dataset.locked === 'true') return;
      setSegmentedValue(container, btn.dataset.value);
      onChange(btn.dataset.value);
    });
  }

  function setSegmentedValue(container, value) {
    container.querySelectorAll('.segmented__item').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.value === value));
    });
  }

  function lockSegmented(container, locked) {
    container.dataset.locked = String(locked);
    container.querySelectorAll('.segmented__item').forEach((b) => {
      b.style.opacity = locked ? '0.35' : '';
    });
  }

  // --------------------------------------------------------------- swatches

  function buildSwatchRow(containerId, presets, getValue, setValue) {
    const container = $(containerId);
    container.innerHTML = '';
    const current = (getValue() || '').toLowerCase();

    presets.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.style.background = color;
      btn.title = color;
      btn.setAttribute('aria-pressed', String(color.toLowerCase() === current));
      btn.addEventListener('click', () => {
        setValue(color);
        renderSwatches();
        scheduleRender();
      });
      container.appendChild(btn);
    });

    const isCustom = !presets.some((c) => c.toLowerCase() === current);
    const wrap = document.createElement('label');
    wrap.className = 'swatch swatch--custom';
    wrap.title = 'Color personalizado';
    wrap.style.background = isCustom && /^#[0-9a-f]{6}$/i.test(current)
      ? current
      : 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)';
    wrap.setAttribute('aria-pressed', String(isCustom));
    const input = document.createElement('input');
    input.type = 'color';
    input.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#000000';
    input.addEventListener('input', (e) => {
      setValue(e.target.value);
      renderSwatches();
      scheduleRender();
    });
    wrap.appendChild(input);
    container.appendChild(wrap);
  }

  function renderSwatches() {
    buildSwatchRow('fg-swatches', FG_PRESETS, () => state.style.fgColor, (v) => (state.style.fgColor = v));
    buildSwatchRow('fg2-swatches', FG_PRESETS, () => state.style.fgColor2, (v) => (state.style.fgColor2 = v));
    buildSwatchRow('bg-swatches', BG_PRESETS, () => state.style.bgColor, (v) => (state.style.bgColor = v));
  }

  // ------------------------------------------------------------- type tabs

  function buildTypeTabs() {
    const container = $('type-tabs');
    container.innerHTML = '';
    Object.keys(QRTypes.types).forEach((key) => {
      const t = QRTypes.types[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segmented__item';
      btn.dataset.value = key;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(key === state.type));
      btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${TYPE_ICONS[key] || 'icon-link'}"/></svg>${t.label}`;
      btn.addEventListener('click', () => {
        state.type = key;
        state.values = {};
        setSegmentedValue(container, key);
        buildForm(key, {});
        scheduleRender();
      });
      container.appendChild(btn);
    });
  }

  // ------------------------------------------------------------- the form

  function buildForm(typeKey, initialValues) {
    const t = QRTypes.types[typeKey];
    const form = $('content-form');
    form.innerHTML = '';
    state.values = { ...initialValues };

    t.fields.forEach((field) => {
      if (field.default !== undefined && state.values[field.key] === undefined) {
        state.values[field.key] = field.default;
      }
      const row = document.createElement('div');

      if (field.type === 'checkbox') {
        row.className = 'field-row field-row--inline';
        row.innerHTML = `
          <span class="field-label">${field.label}</span>
          <label class="switch">
            <input type="checkbox" id="f-${field.key}">
            <span class="switch__track"></span>
          </label>`;
        form.appendChild(row);
        const input = row.querySelector('input');
        input.checked = !!state.values[field.key];
        input.addEventListener('change', () => {
          state.values[field.key] = input.checked;
          scheduleRender();
        });
        return;
      }

      row.className = 'field-row';
      const labelHtml = `<label for="f-${field.key}">${field.label}${field.required ? '<span class="required-dot">•</span>' : ''}</label>`;

      if (field.type === 'textarea') {
        row.innerHTML = `${labelHtml}<textarea id="f-${field.key}" placeholder="${field.placeholder || ''}"></textarea>`;
      } else if (field.type === 'select') {
        const options = field.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
        row.innerHTML = `${labelHtml}<select id="f-${field.key}">${options}</select>`;
      } else {
        row.innerHTML = `${labelHtml}<input type="${field.type}" id="f-${field.key}" placeholder="${field.placeholder || ''}">`;
      }
      form.appendChild(row);

      const input = row.querySelector('input, textarea, select');
      input.value = state.values[field.key] ?? '';
      const evt = field.type === 'select' ? 'change' : 'input';
      input.addEventListener(evt, () => {
        state.values[field.key] = input.value;
        scheduleRender();
      });
    });
  }

  // -------------------------------------------------------------- render

  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(doRender, 120);
  }

  function currentEffectiveEcLevel() {
    return state.logoImage ? 'H' : state.style.ecLevel;
  }

  function buildPayload() {
    return QRTypes.build(state.type, state.values);
  }

  function isValidForm() {
    const t = QRTypes.types[state.type];
    return t.fields.every((f) => !f.required || String(state.values[f.key] || '').trim() !== '');
  }

  let lastPayload = '';
  function doRender() {
    if (!isValidForm()) {
      caption.textContent = 'Completa los campos requeridos';
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastPayload = '';
      updateExportButtons(false);
      return;
    }
    const payload = buildPayload();
    lastPayload = payload;
    try {
      const matrix = QRRender.buildMatrix(payload, currentEffectiveEcLevel());
      QRRender.drawToCanvas(canvas, matrix, {
        sizePx: state.style.exportSizePx,
        marginModules: state.style.marginModules,
        fgColor: state.style.fgColor,
        bgColor: state.style.bgColor,
        transparentBg: state.style.transparentBg,
        colorMode: state.style.colorMode,
        fgColor2: state.style.fgColor2,
        moduleStyle: state.style.moduleStyle,
        eyeStyle: state.style.eyeStyle,
        logoImage: state.logoImage,
        logoRatio: state.style.logoRatio,
      });
      const summary = QRTypes.types[state.type].summary(state.values);
      caption.textContent = summary || 'Código QR listo';
      updateExportButtons(true);
    } catch (err) {
      console.error(err);
      caption.textContent = 'El contenido es demasiado largo para un código QR';
      updateExportButtons(false);
    }
  }

  function updateExportButtons(enabled) {
    ['save-history-btn', 'download-png-btn', 'download-svg-btn', 'download-pdf-btn'].forEach((id) => {
      $(id).disabled = !enabled;
    });
  }

  // -------------------------------------------------------------- style UI

  function wireStyleControls() {
    attachSegmented($('module-style'), (v) => {
      state.style.moduleStyle = v;
      scheduleRender();
    });
    attachSegmented($('eye-style'), (v) => {
      state.style.eyeStyle = v;
      scheduleRender();
    });
    attachSegmented($('ec-level'), (v) => {
      state.style.ecLevel = v;
      scheduleRender();
    });

    $('gradient-toggle').addEventListener('change', (e) => {
      state.style.colorMode = e.target.checked ? 'gradient' : 'solid';
      $('fg2-row').hidden = !e.target.checked;
      scheduleRender();
    });

    $('transparent-toggle').addEventListener('change', (e) => {
      state.style.transparentBg = e.target.checked;
      $('bg-row').hidden = e.target.checked;
      scheduleRender();
    });

    const margin = $('margin');
    margin.addEventListener('input', () => {
      state.style.marginModules = Number(margin.value);
      $('margin-value').textContent = margin.value;
      scheduleRender();
    });

    const exportSize = $('export-size');
    exportSize.addEventListener('input', () => {
      state.style.exportSizePx = Number(exportSize.value);
      $('export-size-value').textContent = `${exportSize.value}px`;
      scheduleRender();
    });

    const logoSize = $('logo-size');
    logoSize.addEventListener('input', () => {
      state.style.logoRatio = Number(logoSize.value) / 100;
      $('logo-size-value').textContent = `${logoSize.value}%`;
      scheduleRender();
    });
  }

  // ---------------------------------------------------------------- logo

  function setLogo(dataUrl) {
    return new Promise((resolve) => {
      if (!dataUrl) {
        state.logoImage = null;
        state.style.logoDataUrl = null;
        $('logo-preview').hidden = true;
        $('logo-clear-btn').hidden = true;
        $('logo-size-row').hidden = true;
        $('logo-label').textContent = 'Sin logo';
        lockSegmented($('ec-level'), false);
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        state.logoImage = img;
        state.style.logoDataUrl = dataUrl;
        $('logo-preview').src = dataUrl;
        $('logo-preview').hidden = false;
        $('logo-clear-btn').hidden = false;
        $('logo-size-row').hidden = false;
        $('logo-label').textContent = 'Logo cargado';
        setSegmentedValue($('ec-level'), 'H');
        lockSegmented($('ec-level'), true);
        resolve();
      };
      img.src = dataUrl;
    });
  }

  function wireLogo() {
    $('logo-pick-btn').addEventListener('click', () => $('logo-input').click());
    $('logo-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setLogo(reader.result).then(scheduleRender);
      reader.readAsDataURL(file);
    });
    $('logo-clear-btn').addEventListener('click', () => {
      $('logo-input').value = '';
      setLogo(null).then(scheduleRender);
    });
  }

  // -------------------------------------------------------------- exports

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function wireExports() {
    $('download-png-btn').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        downloadBlob(blob, `qr-${Date.now()}.png`);
        showToast('PNG descargado');
      }, 'image/png');
    });

    $('download-svg-btn').addEventListener('click', () => {
      const matrix = QRRender.buildMatrix(lastPayload, currentEffectiveEcLevel());
      const svg = QRRender.matrixToSVG(matrix, {
        sizePx: state.style.exportSizePx,
        marginModules: state.style.marginModules,
        fgColor: state.style.fgColor,
        bgColor: state.style.bgColor,
        transparentBg: state.style.transparentBg,
        colorMode: state.style.colorMode,
        fgColor2: state.style.fgColor2,
        moduleStyle: state.style.moduleStyle,
        eyeStyle: state.style.eyeStyle,
      });
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `qr-${Date.now()}.svg`);
      showToast('SVG descargado');
    });

    $('download-pdf-btn').addEventListener('click', () => {
      const blob = QRPdf.canvasToPdfBlob(canvas);
      downloadBlob(blob, `qr-${Date.now()}.pdf`);
      showToast('PDF descargado');
    });
  }

  // -------------------------------------------------------------- history

  function makeThumbnail() {
    const t = document.createElement('canvas');
    t.width = 200;
    t.height = 200;
    const ctx = t.getContext('2d');
    if (!state.style.transparentBg) {
      ctx.fillStyle = state.style.bgColor || '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
    }
    ctx.drawImage(canvas, 0, 0, 200, 200);
    return t.toDataURL('image/png');
  }

  function renderHistory() {
    const list = QRStorage.readAll();
    const grid = $('history-grid');
    grid.innerHTML = '';
    $('history-empty').hidden = list.length > 0;

    list.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.title = QRTypes.types[entry.type] ? QRTypes.types[entry.type].summary(entry.values) : '';
      btn.innerHTML = `
        <img src="${entry.thumbnail}" alt="">
        <span class="history-item__del" role="button" aria-label="Eliminar">
          <svg class="icon" aria-hidden="true"><use href="#icon-xmark"/></svg>
        </span>`;
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.history-item__del')) {
          e.stopPropagation();
          QRStorage.remove(entry.id);
          renderHistory();
          return;
        }
        restoreEntry(entry);
      });
      grid.appendChild(btn);
    });
  }

  function restoreEntry(entry) {
    state.type = entry.type;
    setSegmentedValue($('type-tabs'), entry.type);
    buildForm(entry.type, entry.values);

    state.style = { ...state.style, ...entry.style };

    $('gradient-toggle').checked = state.style.colorMode === 'gradient';
    $('fg2-row').hidden = state.style.colorMode !== 'gradient';
    $('transparent-toggle').checked = !!state.style.transparentBg;
    $('bg-row').hidden = !!state.style.transparentBg;
    setSegmentedValue($('module-style'), state.style.moduleStyle);
    setSegmentedValue($('eye-style'), state.style.eyeStyle);
    setSegmentedValue($('ec-level'), state.style.ecLevel);

    $('margin').value = state.style.marginModules;
    $('margin-value').textContent = state.style.marginModules;
    $('export-size').value = state.style.exportSizePx;
    $('export-size-value').textContent = `${state.style.exportSizePx}px`;
    $('logo-size').value = Math.round(state.style.logoRatio * 100);
    $('logo-size-value').textContent = `${Math.round(state.style.logoRatio * 100)}%`;

    renderSwatches();
    setLogo(entry.style.logoDataUrl || null).then(scheduleRender);
    showToast('Restaurado desde historial');
  }

  function wireHistory() {
    $('save-history-btn').addEventListener('click', () => {
      if (!lastPayload) return;
      QRStorage.add({
        type: state.type,
        values: { ...state.values },
        style: { ...state.style },
        thumbnail: makeThumbnail(),
      });
      renderHistory();
      showToast('Guardado en historial');
    });

    $('clear-history-btn').addEventListener('click', () => {
      if (QRStorage.readAll().length === 0) return;
      if (confirm('¿Borrar todo el historial de códigos QR?')) {
        QRStorage.clear();
        renderHistory();
      }
    });
  }

  // ------------------------------------------------------------------ PWA

  function wirePwa() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      $('install-btn').hidden = false;
    });
    $('install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('install-btn').hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      $('install-btn').hidden = true;
    });
  }

  // ---------------------------------------------------------------- init

  function init() {
    buildTypeTabs();
    buildForm(state.type, {});
    renderSwatches();
    wireStyleControls();
    wireLogo();
    wireExports();
    wireHistory();
    wirePwa();
    renderHistory();
    updateExportButtons(false);
    doRender();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
