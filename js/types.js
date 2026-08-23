/**
 * QRTypes — defines every QR content type: its form fields and a
 * `build(values)` function that turns form values into the final payload
 * string encoded into the QR code.
 */
const QRTypes = (() => {
  'use strict';

  // Escapes ; , : \ per the MECARD / WIFI QR conventions.
  function esc(s) {
    return String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  }

  function foldICS(line) {
    // Simple, safe line-length guard for VEVENT text fields.
    return line;
  }

  function icsDate(value, allDay) {
    if (!value) return '';
    if (allDay) return value.replace(/-/g, '');
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  }

  const types = {
    text: {
      label: 'Texto / URL',
      icon: 'link',
      fields: [
        { key: 'text', label: 'Texto o enlace', type: 'textarea', placeholder: 'https://ejemplo.com', required: true },
      ],
      build: (v) => v.text || '',
      summary: (v) => v.text || '',
    },

    wifi: {
      label: 'Wi-Fi',
      icon: 'wifi',
      fields: [
        { key: 'ssid', label: 'Nombre de red (SSID)', type: 'text', required: true },
        { key: 'password', label: 'Contraseña', type: 'text' },
        { key: 'encryption', label: 'Seguridad', type: 'select', options: [
          { value: 'WPA', label: 'WPA/WPA2/WPA3' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'Sin contraseña' },
        ], default: 'WPA' },
        { key: 'hidden', label: 'Red oculta', type: 'checkbox' },
      ],
      build: (v) => {
        const enc = v.encryption || 'WPA';
        const pass = enc === 'nopass' ? '' : `P:${esc(v.password)};`;
        return `WIFI:T:${enc};S:${esc(v.ssid)};${pass}${v.hidden ? 'H:true;' : ''};`;
      },
      summary: (v) => v.ssid || '',
    },

    contact: {
      label: 'Contacto',
      icon: 'person',
      fields: [
        { key: 'name', label: 'Nombre completo', type: 'text', required: true },
        { key: 'org', label: 'Organización', type: 'text' },
        { key: 'phone', label: 'Teléfono', type: 'tel' },
        { key: 'email', label: 'Correo', type: 'email' },
        { key: 'url', label: 'Sitio web', type: 'url' },
        { key: 'address', label: 'Dirección', type: 'text' },
      ],
      build: (v) => {
        let s = 'MECARD:';
        if (v.name) s += `N:${esc(v.name)};`;
        if (v.org) s += `ORG:${esc(v.org)};`;
        if (v.phone) s += `TEL:${esc(v.phone)};`;
        if (v.email) s += `EMAIL:${esc(v.email)};`;
        if (v.url) s += `URL:${esc(v.url)};`;
        if (v.address) s += `ADR:${esc(v.address)};`;
        s += ';';
        return s;
      },
      summary: (v) => v.name || '',
    },

    email: {
      label: 'Correo',
      icon: 'envelope',
      fields: [
        { key: 'to', label: 'Destinatario', type: 'email', required: true },
        { key: 'subject', label: 'Asunto', type: 'text' },
        { key: 'body', label: 'Mensaje', type: 'textarea' },
      ],
      build: (v) => {
        const params = new URLSearchParams();
        if (v.subject) params.set('subject', v.subject);
        if (v.body) params.set('body', v.body);
        const qs = params.toString();
        return `mailto:${v.to || ''}${qs ? '?' + qs : ''}`;
      },
      summary: (v) => v.to || '',
    },

    phone: {
      label: 'Teléfono',
      icon: 'phone',
      fields: [
        { key: 'number', label: 'Número', type: 'tel', required: true },
      ],
      build: (v) => `tel:${(v.number || '').replace(/[^\d+]/g, '')}`,
      summary: (v) => v.number || '',
    },

    sms: {
      label: 'SMS',
      icon: 'message',
      fields: [
        { key: 'number', label: 'Número', type: 'tel', required: true },
        { key: 'body', label: 'Mensaje', type: 'textarea' },
      ],
      build: (v) => {
        const num = (v.number || '').replace(/[^\d+]/g, '');
        return `sms:${num}${v.body ? '?body=' + encodeURIComponent(v.body) : ''}`;
      },
      summary: (v) => v.number || '',
    },

    event: {
      label: 'Evento',
      icon: 'calendar',
      fields: [
        { key: 'title', label: 'Título', type: 'text', required: true },
        { key: 'location', label: 'Ubicación', type: 'text' },
        { key: 'start', label: 'Inicio', type: 'datetime-local', required: true },
        { key: 'end', label: 'Fin', type: 'datetime-local' },
        { key: 'description', label: 'Descripción', type: 'textarea' },
      ],
      build: (v) => {
        const lines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'BEGIN:VEVENT',
          `SUMMARY:${foldICS(v.title || '')}`,
        ];
        if (v.location) lines.push(`LOCATION:${foldICS(v.location)}`);
        if (v.description) lines.push(`DESCRIPTION:${foldICS(v.description)}`);
        if (v.start) lines.push(`DTSTART:${icsDate(v.start)}`);
        if (v.end) lines.push(`DTEND:${icsDate(v.end)}`);
        lines.push('END:VEVENT', 'END:VCALENDAR');
        return lines.join('\n');
      },
      summary: (v) => v.title || '',
    },

    location: {
      label: 'Ubicación',
      icon: 'pin',
      fields: [
        { key: 'lat', label: 'Latitud', type: 'text', required: true, placeholder: '13.6929' },
        { key: 'lng', label: 'Longitud', type: 'text', required: true, placeholder: '-89.2182' },
      ],
      build: (v) => `geo:${v.lat || '0'},${v.lng || '0'}`,
      summary: (v) => (v.lat && v.lng ? `${v.lat}, ${v.lng}` : ''),
    },
  };

  function build(typeKey, values) {
    const t = types[typeKey];
    if (!t) throw new Error('Unknown QR type: ' + typeKey);
    return t.build(values || {});
  }

  return { types, build };
})();
