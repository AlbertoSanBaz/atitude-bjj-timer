/* Navegación espacial con las flechas del mando (solo en modo TV).
   Busca el elemento enfocable más cercano en la dirección pulsada dentro de la pantalla activa.
   OK / centro del D-pad llega como "Enter" y pulsa el botón enfocado. */
(function () {
  "use strict";

  var DIRS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Up: "up", Down: "down", Left: "left", Right: "right" // WebViews antiguos
  };
  var SELECTOR = 'button, a[href], input[type="checkbox"], [tabindex]:not([tabindex="-1"])';

  function enabled() { return document.documentElement.classList.contains("tv"); }

  function byId(id) { return document.getElementById(id); }

  /* pantalla activa: el resumen final, el timer o la configuración */
  function activeScope() {
    var run = byId("run");
    if (run && !run.hidden) {
      var done = byId("done");
      return done && !done.hidden ? done : run;
    }
    return byId("setup");
  }

  function isVisible(el) {
    if (el.disabled || el.closest("[hidden]")) return false;
    if (!el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  /* los checkbox están ocultos dentro de su etiqueta: usamos la caja de la etiqueta */
  function boxOf(el) {
    var host = el.closest(".toggle") || el;
    return host.getBoundingClientRect();
  }

  function candidates(scope) {
    var list = scope.querySelectorAll(SELECTOR);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.matches(".num")) continue; // los números se cambian con − / +
      if (el.closest(".foot") && !el.matches("button")) continue;
      // en el timer, la marca de agua y el overlay no cuentan
      if (scope.id === "run" && el.closest("#done")) continue;
      if (isVisible(el) || el.matches('input[type="checkbox"]')) out.push(el);
    }
    return out;
  }

  function score(dir, from, to) {
    var fcx = from.left + from.width / 2, fcy = from.top + from.height / 2;
    var tcx = to.left + to.width / 2, tcy = to.top + to.height / 2;
    var primary, ortho, overlap;
    if (dir === "right" || dir === "left") {
      if (dir === "right" ? tcx <= fcx + 1 : tcx >= fcx - 1) return Infinity;
      primary = dir === "right" ? to.left - from.right : from.left - to.right;
      overlap = Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top);
      ortho = overlap > 0 ? 0 : Math.abs(tcy - fcy);
    } else {
      if (dir === "down" ? tcy <= fcy + 1 : tcy >= fcy - 1) return Infinity;
      primary = dir === "down" ? to.top - from.bottom : from.top - to.bottom;
      overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
      ortho = overlap > 0 ? 0 : Math.abs(tcx - fcx);
    }
    return Math.max(0, primary) + ortho * 2.5;
  }

  function focusEl(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    var host = el.closest(".toggle") || el;
    try { host.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { host.scrollIntoView(false); }
  }

  function focusDefault() {
    var scope = activeScope();
    if (!scope) return;
    var preferred = scope.querySelector("[data-tv-default]");
    var list = candidates(scope);
    if (preferred && list.indexOf(preferred) !== -1) focusEl(preferred);
    else if (list.length) focusEl(list[0]);
  }

  function move(dir) {
    var scope = activeScope();
    if (!scope) return;
    var cur = document.activeElement;
    var list = candidates(scope);
    if (!cur || list.indexOf(cur) === -1) { focusDefault(); return; }
    var from = boxOf(cur);
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === cur) continue;
      var s = score(dir, from, boxOf(list[i]));
      if (s < bestScore) { bestScore = s; best = list[i]; }
    }
    if (best) focusEl(best);
  }

  document.addEventListener("keydown", function (e) {
    if (!enabled()) return;
    var dir = DIRS[e.key];
    if (dir) {
      e.preventDefault();
      move(dir);
      return;
    }
    // OK sobre un interruptor: Enter no lo cambia por defecto
    if ((e.key === "Enter" || e.keyCode === 23) && document.activeElement &&
        document.activeElement.matches('input[type="checkbox"]')) {
      e.preventDefault();
      document.activeElement.click();
    }
  }, true);

  window.BJJNav = { focusDefault: focusDefault, enabled: enabled };
})();
