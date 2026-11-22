# Planet Me

**Tu mundo, a tu ritmo.** · by Planet Planners & Merch

PWA de Planet Me. Incluye: tareas organizadas por espacios (trabajo, máster, boda…), calendario semanal con huecos libres y horario fijo, importación de Google Calendar (.ics), hobbies editables, brain dump y exportación/importación de datos.

## Publicar con GitHub Pages
1. Crea un repositorio público (por ejemplo `planet-me`).
2. Sube el contenido de esta carpeta a la raíz del repositorio. `index.html` debe quedar en la raíz.
3. En Settings → Pages, selecciona Deploy from a branch, `main` y `/(root)`.
4. Guarda. La web se publicará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.
5. En iPhone, abre esa dirección con Safari y elige Compartir → Añadir a pantalla de inicio.


## Inicio de sesión y sincronización
Opcional. Sigue `SINCRONIZACION.md` para activar «Entrar con Google» y tener tus datos en todos tus dispositivos. Mientras `firebase-config.js` valga `null`, todo funciona solo en el dispositivo.

## Importante
Esta versión no incluye cuentas ni sincronización entre dispositivos. Los datos se guardan en el navegador mediante localStorage. Usa la opción de exportar para crear copias de seguridad. No guardes datos privados en el repositorio de GitHub.

El service worker habilita caché básica; para probar la instalación PWA y el modo sin conexión, publica primero el sitio mediante HTTPS.
