/* Capa de plataforma: aísla lo que cambia entre la PWA (navegador) y la app nativa de Android TV.
   - Detecta si corre dentro de la app nativa (puente window.AtitudeTV inyectado desde Kotlin).
   - Activa el modo TV (clase html.tv) en Android TV, o en el navegador con ?tv=1 para probar.
   - Mantener la pantalla encendida: nativo (FLAG_KEEP_SCREEN_ON) o Screen Wake Lock API en web.
   - Registro del service worker (solo PWA). */
(function () {
  "use strict";

  var bridge = window.AtitudeTV || null;
  var root = document.documentElement;
  var query = "";
  try { query = window.location.search || ""; } catch (e) { /* ignorar */ }

  var isNative = !!bridge || /AtitudeTimer\//.test(navigator.userAgent);
  var isTV = false;
  try { isTV = !!(bridge && bridge.isTv && bridge.isTv()); } catch (e) { isTV = false; }
  if (/[?&]tv=1\b/.test(query)) isTV = true;

  if (isNative) root.classList.add("native");
  if (isTV) root.classList.add("tv");

  /* ---------- pantalla encendida ---------- */
  var wakeLock = null;
  var wantAwake = false;

  function webWakeRequest() {
    try {
      if (!("wakeLock" in navigator) || wakeLock) return;
      navigator.wakeLock.request("screen").then(function (l) {
        wakeLock = l;
        l.addEventListener("release", function () { wakeLock = null; });
      }).catch(function () { wakeLock = null; });
    } catch (e) { /* no disponible */ }
  }
  function webWakeRelease() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignorar */ }
    wakeLock = null;
  }

  function keepAwake(on) {
    wantAwake = !!on;
    if (bridge && bridge.keepScreenOn) {
      try { bridge.keepScreenOn(wantAwake); } catch (e) { /* ignorar */ }
      return;
    }
    if (wantAwake) webWakeRequest(); else webWakeRelease();
  }

  // el navegador suelta el wake lock al cambiar de pestaña: se pide de nuevo al volver
  document.addEventListener("visibilitychange", function () {
    if (!bridge && wantAwake && document.visibilityState === "visible") webWakeRequest();
  });

  /* ---------- service worker (solo PWA) ---------- */
  function registerServiceWorker(onUpdateReady) {
    if (isNative || !("serviceWorker" in navigator)) return;
    var secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) return;

    // en la primera visita clients.claim() también dispara controllerchange: ahí no hay que recargar
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) { hadController = true; return; }
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        function notify(worker) {
          if (onUpdateReady) onUpdateReady(function () { worker.postMessage({ type: "SKIP_WAITING" }); });
        }
        if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
        reg.addEventListener("updatefound", function () {
          var w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", function () {
            // solo avisamos si ya había una versión anterior controlando la página
            if (w.state === "installed" && navigator.serviceWorker.controller) notify(w);
          });
        });
      }).catch(function () { /* sin SW: la app sigue funcionando online */ });
    });
  }

  function openExternal(url) {
    if (bridge && bridge.openUrl) {
      try { bridge.openUrl(url); return true; } catch (e) { return false; }
    }
    return false; // en web el enlace <a target="_blank"> se encarga
  }

  window.BJJPlatform = {
    isNative: isNative,
    isTV: isTV,
    keepAwake: keepAwake,
    registerServiceWorker: registerServiceWorker,
    openExternal: openExternal
  };
})();
