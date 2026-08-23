# QR Studio

Generador de códigos QR con personalización completa, construido como una
página estática (sin frameworks, sin build step) con una interfaz que sigue
las [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).

**[Pruébalo en vivo](https://wxlter97.github.io/qrcode.js/)** *(si tienes GitHub Pages activado sobre `main`)*

## Funcionalidad

- **8 tipos de contenido**: texto/URL, Wi-Fi, contacto (vCard/MECARD), correo,
  teléfono, SMS, evento de calendario y ubicación — cada uno con su propio
  formulario.
- **Apariencia**: color sólido o degradado, fondo transparente, forma de los
  módulos (cuadrado / redondeado / puntos), forma de las esquinas (cuadrado /
  redondeado), margen (zona de silencio) y tamaño de exportación ajustables.
- **Logo embebido**: sube una imagen, se recorta a un cuadro redondeado
  centrado y el nivel de corrección de errores se fuerza automáticamente a
  "Máximo" para que el QR siga siendo legible.
- **Exportación**: PNG, SVG (vectorial) y PDF, todo generado en el cliente.
- **Historial**: los códigos generados se guardan en `localStorage` con una
  miniatura; se pueden restaurar o borrar.
- **Instalable (PWA)**: manifest + service worker — se puede añadir a la
  pantalla de inicio en iOS/Android/macOS y funciona sin conexión.
- **Modo claro/oscuro** automático (`prefers-color-scheme`), totalmente
  responsive.

## Stack

Un solo archivo HTML + CSS + JS "vanilla", sin dependencias externas en
tiempo de ejecución (nada de CDNs) y sin paso de build — se despliega
directamente en GitHub Pages o cualquier hosting estático.

```
index.html
css/style.css        Sistema visual (SF font stack, colores semánticos Apple,
                      tarjetas agrupadas, controles segmentados, switches)
js/
  qrcode-lib.js       Librería qrcode-generator (vendorizada, ver licencias)
  render.js           Matriz QR → canvas / SVG con estilos, logo y degradados
  types.js            Definición de los 8 tipos de contenido y sus payloads
  storage.js          Historial en localStorage
  pdf.js              Exportador de PDF minimalista (sin dependencias)
  app.js              Estado de la app y cableado de la interfaz
manifest.webmanifest  Metadata de instalación PWA
sw.js                 Service worker (caché offline)
icons/                Iconos de la app (generados con scripts/generate-icons.js)
```

### ¿Por qué vendorizado y no CDN?

La versión anterior dependía de `cdn.rawgit.com`, un servicio que cerró en
2019 — el generador llevaba tiempo roto. Ahora la librería de codificación
QR ([`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator)
de Kazuhiko Arase, MIT) vive en el propio repo, así que la app funciona
offline y no depende de que un tercero siga en línea.

## Desarrollo local

No hace falta build. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 4173
```

y abre `http://localhost:4173`.

Para regenerar los iconos de la app (no hace falta salvo que cambies el
diseño del icono):

```bash
node scripts/generate-icons.js
```

## Licencias de terceros

Ver [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
