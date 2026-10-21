# CLAUDE.md — Atitude BJJ Timer

Contexto para retomar el proyecto con Claude Code. Léelo antes de tocar nada.

## Qué es

Timer de rounds de BJJ para el club **Atitude BJJ Málaga** (instructor Cláudio Peteleco, C. Brasilia 25, Málaga).

- **Configuración:** duración de round y de descanso, nº de rounds (o sin límite).
- **Presets:**
  - Entreno: Sparring, Rolas largas, Posicional, Drills, Open mat.
  - Competición IBJJF adulto por cinturón: 5, 6, 7, 8 y 10 min.
- **Durante la sesión:** preparación de 10 s, aviso a 10 s del final con claqueta, campanas y contador ascendente de rounds.
- **Uso sin conexión obligatorio** en todas las plataformas.
- **Idioma:** interfaz y comentarios en **español**. El usuario prefiere estructuras **multi-archivo** y profesionales.

## Plataformas (decisión tomada)

| Plataforma | Carpeta | Enfoque |
|---|---|---|
| Android TV / Google TV (prioridad) y móviles Android | `android-tv/` | App nativa **Kotlin** con WebView que carga `web/` empaquetada en assets |
| Resto | `web/` | **PWA** (manifest + service worker) |

Descartado o aplazado tras investigar:

- **Capacitor:** buena opción si más adelante se quiere iOS.
- **Tauri:** para escritorio.
- **Tizen/webOS:** solo si cambian la TV del gimnasio.
- **TWA:** inviable, Android TV no tiene Chrome.
- **Apple TV:** inviable, tvOS no tiene WebView.

## Estructura

```
web/                 ← FUENTE ÚNICA de la interfaz (también es la PWA)
  index.html
  manifest.webmanifest
  sw.js              ← solo PWA; NO se copia al APK
  css/fonts.css      ← @font-face locales (woff2 en web/fonts, licencia OFL)
  css/app.css        ← estilos base y tokens de color
  css/tv.css         ← modo TV (html.tv): overscan 5 %, foco visible, layout 16:9
  js/platform.js     ← window.BJJPlatform: PWA vs nativo, modo TV, keepAwake, registro del SW
  js/audio.js        ← window.BJJAudio: sonidos sintetizados con Web Audio (sin archivos)
  js/engine.js       ← window.BJJEngine: máquina de estados del timer (independiente de la UI)
  js/spatial-nav.js  ← window.BJJNav: navegación con flechas del mando (solo html.tv)
  js/app.js          ← UI, presets, atajos, window.AtitudeApp (API para la app nativa)
android-tv/          ← proyecto Android Studio (Gradle KTS + version catalog)
  app/build.gradle.kts            ← tarea SyncWebAssets: ../web → assets/www (excluye sw.js)
  app/src/main/AndroidManifest.xml← leanback (required=false), touchscreen no requerido, banner, LEANBACK_LAUNCHER
  app/src/main/java/com/atitudebjj/timer/
    MainActivity.kt        ← WebView a pantalla completa, Atrás y teclas multimedia
    WebAppBridge.kt        ← window.AtitudeTV
    TimerWebViewClient.kt  ← WebViewAssetLoader + bloquea la navegación externa
branding/logo.png    ← logo original (356 px, baja resolución: sustituir si llega uno mejor)
tools/generate_assets.py ← genera iconos PWA, mipmaps, banner TV 320x180 y web/img/logo.webp
```

## Convenciones del código web

- **JS clásico, sin módulos ni bundler.** Cada archivo es una IIFE que expone un global. Se evitaron los ES modules a propósito: dan problemas de CORS con orígenes `null` y en algunos WebViews.
- **Orden de carga obligatorio:** `platform.js → audio.js → engine.js → spatial-nav.js → app.js`.
- **Sintaxis ES5 o ES2015 conservadora** (`var`, `function`), pensando en WebViews antiguos de TV:
  - Nada de `?.` ni `??`.
  - Nada de CSS `color-mix()`. Usa los tokens rgba ya definidos: `--fg-line`, `--fg-track`, `--fg-ring`.
  - **Requisito mínimo:** Chromium 87+ (por `inset`, `aspect-ratio` y `gap` en flex).
- **Colores como tokens** en `:root` de `app.css`:
  - `--ink` #0d0b0b: fondo.
  - `--red` #dc2a31: rojo del escudo.
  - `--green` #12804a: descanso.
  - `--gold` #f3c331: preparación.
  - `--chalk` #f5f3f1: texto.
  - Look oscuro único.
- **Fases del timer** (atributo `data-phase` en `#run`): `prep` (amarillo), `fight` (negro, y rojo parpadeante en los últimos 10 s con la clase `.warn`), `rest` (verde).
- **Tipografía:** Barlow Condensed 600/700/800 y 800 italic (display y dígitos), Barlow 400/500/600 (texto). Subconjunto latin.
- **El motor usa marcas de tiempo** (`performance.now()`), no restas por tick. Recupera fases si el navegador se duerme.
- **Ajustes guardados** en `localStorage` con la clave `atitude-timer-v1`, siempre dentro de try/catch.

## Contrato web ↔ nativo

**Detección:**

- `window.AtitudeTV` (inyectado por Kotlin) o el user agent `AtitudeTimer/x.y.z` → clase `html.native`.
- `AtitudeTV.isTv()` o `?tv=1` en la URL → clase `html.tv`.

**Puente nativo `window.AtitudeTV`:**

- `isTv()`
- `keepScreenOn(bool)`
- `openUrl(url)`: solo http/https.
- `appVersion()`

**API web que llama Kotlin, `window.AtitudeApp`:**

- `handleBack()` → boolean:
  - En marcha: pausa.
  - En pausa o al terminar: vuelve a ajustes.
  - En ajustes: devuelve `false` y Android cierra la app.
- `command('toggle' | 'skip' | 'reset')`: lo disparan las teclas multimedia (▶❚❚, ⏭, ⏮). `toggle` en ajustes arranca la sesión.

La app se carga desde `https://appassets.androidplatform.net/assets/www/index.html` (WebViewAssetLoader). No se usa `file://`.

## Comandos

```bash
# Servir la PWA en local (el SW funciona en localhost)
python3 -m http.server 8080 --directory web
# Modo TV en el navegador: http://localhost:8080/?tv=1  (flechas + Enter)

# Regenerar iconos y banner (requiere: pip install pillow fonttools brotli)
python3 tools/generate_assets.py

# Android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
cd android-tv && ./gradlew assembleDebug assembleRelease lintDebug
adb connect IP_TV:5555 && adb install -r app/build/outputs/apk/release/app-release.apk
```

**Pruebas usadas hasta ahora** (Playwright headless):

- Cargar con todas las peticiones externas bloqueadas.
- Comprobar `document.fonts`.
- Comprobar el control del SW y recargar con `context.set_offline(True)`.
- `?tv=1` a 960x540, que equivale a 1080p en una TV xhdpi.
- Simular el puente con `add_init_script` que define `window.AtitudeTV`.

## Reglas al hacer cambios

1. **La interfaz se edita solo en `web/`.** Nunca en `android-tv/app/build/` ni en assets generados.
2. **Al cambiar cualquier archivo de `web/`, sube `CACHE_VERSION` en `web/sw.js`.** Si añades archivos, inclúyelos en `PRECACHE`.
3. **Publicar en Android:** sube `versionCode` y `versionName` en `android-tv/app/build.gradle.kts`.
4. **Elementos interactivos nuevos:** deben ser `<button>`, `a[href]` o `input[type=checkbox]`, para que `spatial-nav.js` los encuentre, y deben tener un foco visible en `tv.css`.
5. **Nada de recursos externos** (CDN, Google Fonts, analítica). Todo local.
6. **No subir keystores** (ya están en `.gitignore`).

## Estado y pendientes

### Hecho

- ✅ **PWA** funcionando sin conexión y probada en navegador (escritorio, móvil y modo TV): 44 pruebas Playwright.
- ✅ **Repositorio público:** https://github.com/AlbertoSanBaz/atitude-bjj-timer (rama `main`).
- ✅ **PWA publicada en GitHub Pages:** https://albertosanbaz.github.io/atitude-bjj-timer/
  - `.github/workflows/pages.yml` despliega `web/` en cada push a `main` que toque `web/`.
  - Se sirve en un subdirectorio: **todas las rutas deben ser relativas** (nada de `/css/...`).
- ✅ **El proyecto Android compila** (debug y release) y `lintDebug` pasa sin errores.
- ✅ **Probado en emulador** Google TV Android 12 (API 31, WebView 91, 1080p → viewport 960×540): puente, `html.native.tv`, mando (flechas/OK), ▶❚❚ ⏭ ⏮ sin dobles disparos, Atrás (pausa → ajustes → salir), `FLAG_KEEP_SCREEN_ON` y audio.
- ✅ **Release v1.0.0** en GitHub con `AtitudeTimer-1.0.0.apk` (etiqueta `v1.0.0`): https://github.com/AlbertoSanBaz/atitude-bjj-timer/releases/tag/v1.0.0

### Pendiente

1. ⏳ **Probar en la TV real del gimnasio** (siguiente paso). El usuario lo instalará con un pendrive (`AtitudeTimer-1.0.0.apk`) y un explorador de archivos. Revisar:
   - Versión del WebView (mínimo Chromium 87).
   - Volumen de campana y claqueta. El audio sale como `USAGE_MEDIA`: manda el **volumen multimedia** de la tele.
   - Navegación con el mando real.
   - Teclas multimedia (▶❚❚ ⏭ ⏮) y Atrás.
   - Que la pantalla no se apague durante la sesión.
2. ⏳ Conseguir el **logo original en alta resolución** → `branding/logo.png` → `python3 tools/generate_assets.py`.
3. ⏳ Menores de Lint, sin urgencia:
   - Icono monocromo (`<monochrome>`) en `mipmap-anydpi-v26` para los iconos temáticos de Android 13+ en móviles.
   - Actualizar dependencias. AGP 9 es un salto mayor: integra Kotlin y cambia el DSL, así que conviene hacerlo aparte.
4. ⏳ **Google Play** (opcional): firma propia (ahora el release usa la clave debug), App Bundle (`./gradlew bundleRelease`) y checklist de calidad de TV. Al cambiar de firma, hay que desinstalar la versión anterior en la tele.

### Notas técnicas

- **Publicar una versión nueva de Android:** subir `versionCode`/`versionName` en `android-tv/app/build.gradle.kts`, compilar `assembleRelease`, crear la etiqueta `vX.Y.Z` y una release con el APK renombrado `AtitudeTimer-X.Y.Z.apk`. Tras crearla, la URL pública de descarga tarda unos segundos en responder (da 404 al principio).
- **Entorno del Mac** (sin Android Studio): OpenJDK 21 de Homebrew (`JAVA_HOME=/opt/homebrew/opt/openjdk@21`), `brew --cask android-commandlinetools` y SDK en `~/Library/Android/sdk` (platform-tools, platforms;android-36, build-tools 35 y 36, emulator, cmdline-tools;latest). `android-tv/local.properties` apunta ahí (no se sube).
- **Emulador:** AVD `AtitudeTV_API31` → `~/Library/Android/sdk/emulator/emulator -avd AtitudeTV_API31`.
  - Si se recrea con `avdmanager` (el de `~/Library/Android/sdk/cmdline-tools/latest/bin`, el de Homebrew no encuentra la SDK), poner `hw.keyboard=yes` en `~/.android/avd/<nombre>.avd/config.ini`. Por defecto queda en `no` y ni el teclado del Mac ni el mando virtual responden. `adb shell input` sí funciona, así que las pruebas por adb no lo detectan.
- **Inspeccionar la WebView** (solo APK debug): `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.atitudebjj.timer)` y abrir `chrome://inspect`.
- **R8:** el release conserva los métodos del puente con `@JavascriptInterface` (comprobado con dexdump).
- **`dispatchKeyEvent`** lleva `@SuppressLint("RestrictedApi")`: falso positivo de androidx.core. No cambiarlo a `onKeyDown`, o las teclas multimedia llegarían también al keydown de la web y se ejecutarían dos veces.
- **Versiones:** AGP 8.13.0, Kotlin 2.2.20, Gradle 8.14.3, compileSdk/targetSdk 36, minSdk 24, androidx core-ktx 1.15.0, activity-ktx 1.9.3, webkit 1.12.1.
- **Artefacto antiguo:** existe una versión anterior publicada como artefacto en claude.ai («Atitude BJJ Timer»). **No está sincronizada** con `web/`: la fuente de verdad es este repositorio.
