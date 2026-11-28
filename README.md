# Planet Me

**Tu mundo, a tu ritmo.** · by Planet Planners & Merch

PWA de Planet Me. Incluye: tareas organizadas por espacios (trabajo, máster, boda…), calendario semanal con huecos libres y horario fijo, importación de Google Calendar (.ics), hobbies editables, brain dump y exportación/importación de datos.


## Inicio de sesión y sincronización
Opcional. Sigue `SINCRONIZACION.md` para activar «Entrar con Google» y tener tus datos en todos tus dispositivos. Mientras `firebase-config.js` valga `null`, todo funciona solo en el dispositivo.

## Importante
Esta versión no incluye cuentas ni sincronización entre dispositivos. Los datos se guardan en el navegador mediante localStorage. Usa la opción de exportar para crear copias de seguridad. No guardes datos privados en el repositorio de GitHub.

El service worker habilita caché básica; para probar la instalación PWA y el modo sin conexión, publica primero el sitio mediante HTTPS.
