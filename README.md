# Atitude BJJ Timer

Timer de rounds para el tatami de **Atitude BJJ Málaga**: duración de round y descanso, nº de rounds, presets de entreno y de competición IBJJF, cuenta atrás de preparación, aviso de 10 s con claqueta y contador de rounds.

Funciona **100 % sin conexión** en las dos plataformas:

| Plataforma | Carpeta | Tecnología |
|---|---|---|
| Android TV / Google TV (y también móviles y tablets Android) | `android-tv/` | App nativa en Kotlin con una WebView que carga la web empaquetada |
| Resto (móvil, tablet, ordenador) | `web/` | PWA instalable con service worker |

La interfaz se escribe **una sola vez** en `web/`. El proyecto Android la copia dentro del APK en cada compilación.

---

## Estructura

```
atitude-timer/
├─ web/                         ← fuente única de la app (PWA)
│  ├─ index.html
│  ├─ manifest.webmanifest      ← nombre, iconos y colores de la PWA
│  ├─ sw.js                     ← service worker: caché offline (solo PWA)
│  ├─ css/
│  │  ├─ fonts.css              ← @font-face de las fuentes locales
│  │  ├─ app.css                ← estilos de la app
│  │  └─ tv.css                 ← modo TV: overscan, foco visible, layout 16:9
│  ├─ js/
│  │  ├─ platform.js            ← PWA vs app nativa, modo TV, pantalla encendida, service worker
│  │  ├─ audio.js               ← campana, claqueta y pitidos (Web Audio, sin archivos)
│  │  ├─ engine.js              ← máquina de estados del timer
│  │  ├─ spatial-nav.js         ← navegación con las flechas del mando
│  │  └─ app.js                 ← interfaz, presets y atajos
│  ├─ fonts/                    ← Barlow y Barlow Condensed (woff2) + licencia OFL
│  └─ img/                      ← logo, foto del equipo e iconos de la PWA
├─ android-tv/                  ← proyecto Android Studio (Kotlin)
│  ├─ app/src/main/
│  │  ├─ AndroidManifest.xml    ← leanback, banner, LEANBACK_LAUNCHER
│  │  ├─ java/com/atitudebjj/timer/
│  │  │  ├─ MainActivity.kt     ← WebView a pantalla completa, Atrás y teclas multimedia
│  │  │  ├─ WebAppBridge.kt     ← puente JS window.AtitudeTV
│  │  │  └─ TimerWebViewClient.kt ← sirve los assets locales y bloquea la navegación externa
│  │  └─ res/                   ← banner de TV, iconos, colores, tema
│  ├─ app/build.gradle.kts      ← incluye la tarea syncWebAssets (web/ → assets/www)
│  └─ gradle/libs.versions.toml ← versiones de dependencias
├─ branding/                    ← originales: logo y foto del equipo
├─ tools/generate_assets.py     ← regenera iconos, banner y logo desde branding/logo.png
└─ tools/test_web.py            ← pruebas automáticas de la PWA (Playwright)
```

---

## 1. PWA (`web/`)

### Probar en local

```bash
python3 -m http.server 8080 --directory web
# abre http://localhost:8080
```

- El service worker solo se activa en `https://` o en `localhost`.
- **Modo TV en el navegador:** abre `http://localhost:8080/?tv=1` y usa las flechas del teclado y Enter.

### Pruebas automáticas

```bash
pip install playwright
python3 tools/test_web.py            # añade --capturas DIR para guardar capturas
```

Prueban la app en escritorio, móvil, modo TV y sin conexión, con el puente nativo simulado. Usa Google Chrome si está instalado; si no, ejecuta antes `python3 -m playwright install chromium`.

### Publicar

La PWA está publicada en **GitHub Pages**: <https://albertosanbaz.github.io/atitude-bjj-timer/>

El workflow `.github/workflows/pages.yml` publica la carpeta `web/` automáticamente cada vez que se sube a `main` un cambio dentro de `web/`. También se puede lanzar a mano desde la pestaña *Actions* del repositorio. No hay que compilar nada.

La primera visita guarda todo en caché. A partir de ahí funciona sin conexión y se puede instalar:

- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone / iPad (Safari):** Compartir → *Añadir a pantalla de inicio*.
- **Ordenador (Chrome / Edge):** icono de instalar en la barra de direcciones.

### Publicar una versión nueva

1. Cambia lo que necesites en `web/`.
2. **Sube `CACHE_VERSION` en `web/sw.js`**, por ejemplo `atitude-timer-v1.0.1`. Si no, los dispositivos seguirán usando la versión que tienen en caché.
3. Si añades archivos nuevos, inclúyelos en la lista `PRECACHE` de `sw.js`.
4. Haz commit y push a `main`: GitHub Pages se actualiza en un minuto. Quien tenga la app abierta verá el aviso «Hay una versión nueva del timer» con el botón **Actualizar**.

---

## 2. Android TV (`android-tv/`)

### Requisitos

- **Android Studio** reciente: el proyecto usa AGP 8.13, Kotlin 2.2.20 y Gradle 8.14.3 (el wrapper está incluido).
- **JDK 17 o superior.** Android Studio trae uno.
- **Dispositivo:** Android TV / Google TV con Android 7.0 o superior (minSdk 24).
- **WebView:** una *Android System WebView* razonablemente actual (Chromium 87+). Se actualiza desde Google Play en la tele.

### Compilar

**Con Android Studio:**

1. *File → Open* → selecciona la carpeta `android-tv/`.
2. Espera a que sincronice Gradle (la primera vez descarga dependencias).
3. *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.

**Desde terminal:**

```bash
cd android-tv
./gradlew assembleDebug        # APK de pruebas
./gradlew assembleRelease      # APK optimizado (firmado con la clave debug, ver abajo)
```

Los APK se generan en `android-tv/app/build/outputs/apk/<debug|release>/`.

En cada compilación, la tarea `syncWebAssets` copia `../web` a `assets/www`. **No edites nada dentro de `app/build/`**: los cambios de interfaz se hacen siempre en `web/`.

### Instalar en la tele (sin Google Play)

Primero activa las opciones de desarrollador en la tele: *Ajustes → Sistema → Información → pulsa 7 veces en «Compilación»*.

**Opción A: ADB por red (desde el ordenador)**

1. En la tele, activa *Opciones de desarrollador → Depuración por USB/ADB* (en Google TV: *Depuración inalámbrica*).
2. Ejecuta:

   ```bash
   adb connect IP_DE_LA_TELE:5555
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

**Opción B: app Downloader**

1. Instala **Downloader** desde Google Play en la tele.
2. Permítele instalar apps de origen desconocido.
3. Ábrela con la URL donde hayas subido el APK.

La app aparece en el launcher con el banner del club.

### Uso con el mando

| Tecla | Acción |
|---|---|
| Flechas | Moverse entre botones (el foco se marca en amarillo) |
| OK / centro | Pulsar el botón enfocado |
| ▶❚❚ | Empezar / pausar / continuar |
| ⏭ | Saltar a la siguiente fase |
| ⏮ | Reiniciar la sesión |
| Atrás | En marcha: pausa · En pausa: vuelve a ajustes · En ajustes: sale de la app |

Mientras el timer corre, la pantalla no se apaga (`FLAG_KEEP_SCREEN_ON`).

### Antes de publicar en Google Play

- **Firma propia:** crea tu clave con *Build → Generate Signed App Bundle* y configura un `signingConfig` de release en lugar del de debug. **No subas la keystore al repositorio** (ya está en `.gitignore`).
- **Formato:** sube un **App Bundle** (`./gradlew bundleRelease`).
- **Calidad TV:** revisa la checklist de calidad para TV de Google Play: banner, navegación con D-pad y sin requerir pantalla táctil (todo esto ya está cubierto).
- **Versión:** sube `versionCode` y `versionName` en `app/build.gradle.kts` en cada publicación.

---

## Iconos y branding

Los iconos de la PWA, los del launcher, el banner de TV y `web/img/logo.webp` se generan desde `branding/logo.png`:

```bash
pip install pillow fonttools brotli
python3 tools/generate_assets.py
```

Si consigues el logo original en mejor resolución, sustituye `branding/logo.png` (PNG cuadrado con fondo transparente) y vuelve a ejecutar el script.

## Licencias

- **Fuentes:** Barlow y Barlow Condensed © The Barlow Project Authors, SIL Open Font License 1.1 (`web/fonts/OFL.txt`).
- **Logo y fotos:** propiedad de Atitude BJJ Málaga.
