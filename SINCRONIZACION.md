# Activar el inicio de sesión con Google y la sincronización

Son unos 10 minutos y es gratis. Los nombres de los menús de Firebase pueden cambiar un poco con el tiempo, pero el recorrido es este.

## 1. Crear el proyecto
1. Entra en https://console.firebase.google.com con tu cuenta de Google.
2. **Crear un proyecto** → ponle nombre (por ejemplo `planet-me`) → desactiva Google Analytics → **Crear**.

## 2. Activar el acceso con Google
1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Google → Habilitar**. Elige tu correo como correo de asistencia y **Guardar**.
3. Pestaña **Configuración → Dominios autorizados → Agregar dominio** y escribe `TU-USUARIO.github.io` (solo el dominio, sin la ruta del repositorio).

## 3. Crear la base de datos
1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Elige una ubicación en Europa (por ejemplo `eur3` o `europe-west`). **No se puede cambiar después.**
3. Modo **producción** → **Crear**.
4. Pestaña **Reglas**: borra lo que haya, pega el contenido de `firestore.rules` y pulsa **Publicar**.
   Estas reglas hacen que cada persona solo pueda leer y escribir sus propios datos.

## 4. Conectar la web
1. Pulsa el engranaje ⚙ → **Configuración del proyecto** → pestaña **General**.
2. Abajo, en **Tus apps**, pulsa el icono web **</>** → ponle un nombre → **Registrar app** (no marques Firebase Hosting).
3. Copia los valores de `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `appId`).
4. Abre `firebase-config.js` y sustituye `export default null;` por:

```js
export default {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  appId: "…"
};
```

Estos valores no son secretos. Lo que protege tus datos son las reglas del paso 3.

## 5. Subir y probar
1. Sube a GitHub todos los archivos nuevos y cambiados: `app.js`, `sync.js`, `firebase-config.js`, `sw.js`, `styles.css`, `index.html`, `firestore.rules`.
2. Recarga la web (una o dos veces, por la caché).
3. **Mi espacio → Tu cuenta y sincronización → Entrar con Google.**
4. Repite en tu otro dispositivo con la misma cuenta.

## Qué pasa con tus datos
- **Primera vez en una cuenta sin datos en la nube:** se suben los de ese dispositivo.
- **Dispositivo vacío con una cuenta que ya tiene datos:** los descarga.
- **Si hay datos distintos en la nube y en el dispositivo:** la app te pregunta si prefieres combinar, usar los de la nube o usar los del dispositivo. Antes de cambiar nada guarda una copia en el navegador. Al combinar, si un mismo elemento existe en los dos sitios, gana el de la nube.
- **Después:** gana siempre el cambio más reciente, y los cambios aparecen en tus otros dispositivos en unos segundos.
- Sin conexión sigues usando la app y los cambios se suben al volver.
- **Cerrar sesión** te permite borrar los datos de ese dispositivo (útil en un ordenador compartido). **Borrar mis datos de la nube** elimina tu copia en Firebase y cierra sesión.

## Si algo falla
- *«Este dominio no está autorizado»*: falta el paso 2.3.
- *«Firebase ha rechazado el acceso»*: revisa que publicaste las reglas (paso 3.4).
- *El botón no abre la ventana de Google en el iPhone (app de la pantalla de inicio)*: prueba primero desde Safari. Si ahí funciona y en la app no, avísame: la solución es añadir también acceso con correo.
