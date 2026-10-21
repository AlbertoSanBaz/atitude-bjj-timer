/* Interfaz: configuración, presets, pantalla del timer, atajos y wake lock. */
(function () {
  "use strict";

  var Engine = window.BJJEngine;
  var Audio = window.BJJAudio;
  var Platform = window.BJJPlatform;
  var Nav = window.BJJNav;
  var STORE_KEY = "atitude-timer-v1";

  var LIMITS = {
    round: { min: 10, max: 30 * 60 },
    rest: { min: 0, max: 10 * 60 },
    rounds: { min: 1, max: 50 }
  };

  var PRESETS_TRAINING = [
    { name: "Sparring", round: 300, rest: 60, rounds: 8 },
    { name: "Rolas largas", round: 360, rest: 60, rounds: 6 },
    { name: "Posicional", round: 180, rest: 30, rounds: 10 },
    { name: "Drills", round: 120, rest: 15, rounds: 10 },
    { name: "Open mat", round: 360, rest: 60, rounds: 0 }
  ];
  // Tiempos de combate IBJJF, categoría adulto (el nº de rounds no cambia)
  var PRESETS_BELTS = [
    { name: "Blanca", belt: "white", round: 300, rest: 60 },
    { name: "Azul", belt: "blue", round: 360, rest: 60 },
    { name: "Morada", belt: "purple", round: 420, rest: 60 },
    { name: "Marrón", belt: "brown", round: 480, rest: 60 },
    { name: "Negra", belt: "black", round: 600, rest: 60 }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    setup: $("setup"), run: $("run"),
    roundMin: $("round-min"), roundSec: $("round-sec"),
    restMin: $("rest-min"), restSec: $("rest-sec"),
    rounds: $("rounds"), roundsDec: $("rounds-dec"), roundsInc: $("rounds-inc"), roundsInf: $("rounds-inf"),
    prep: $("opt-prep"), warn: $("opt-warn"), sound: $("opt-sound"),
    sumLine: $("summary-line"), sumTotal: $("summary-total"),
    start: $("start"),
    presetsTraining: $("presets-training"), presetsBelts: $("presets-belts"),
    roundWord: $("round-word"), roundNum: $("round-num"), roundOf: $("round-of"), doneCount: $("done-count"),
    phase: $("phase-label"), clock: $("clock"), bar: $("bar-fill"),
    next: $("meta-next"), elapsed: $("meta-elapsed"), end: $("meta-end"),
    play: $("btn-play"), skip: $("btn-skip"), reset: $("btn-reset"),
    soundBtn: $("btn-sound"), fs: $("btn-fs"), exit: $("btn-exit"),
    paused: $("paused-tag"), done: $("done"), doneStats: $("done-stats"),
    again: $("btn-again"), settings: $("btn-settings"),
    toast: $("toast"), toastReload: $("toast-reload")
  };

  /* ---------- estado de configuración ---------- */
  var cfg = { round: 300, rest: 60, rounds: 8, prep: true, warn: true, sound: true };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        ["round", "rest", "rounds"].forEach(function (k) { if (typeof s[k] === "number") cfg[k] = s[k]; });
        ["prep", "warn", "sound"].forEach(function (k) { if (typeof s[k] === "boolean") cfg[k] = s[k]; });
      }
    } catch (e) { /* sin almacenamiento: valores por defecto */ }
    clampAll();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* ignorar */ }
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function clampAll() {
    cfg.round = clamp(Math.round(cfg.round), LIMITS.round.min, LIMITS.round.max);
    cfg.rest = clamp(Math.round(cfg.rest), LIMITS.rest.min, LIMITS.rest.max);
    cfg.rounds = cfg.rounds <= 0 ? 0 : clamp(Math.round(cfg.rounds), LIMITS.rounds.min, LIMITS.rounds.max);
  }

  function mmss(sec) { return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function pad2(n) { return String(n).padStart(2, "0"); }

  /* ---------- render de configuración ---------- */
  function renderSetup() {
    els.roundMin.value = Math.floor(cfg.round / 60);
    els.roundSec.value = pad2(cfg.round % 60);
    els.restMin.value = Math.floor(cfg.rest / 60);
    els.restSec.value = pad2(cfg.rest % 60);
    els.rounds.textContent = cfg.rounds > 0 ? cfg.rounds : "∞";
    els.roundsInf.setAttribute("aria-pressed", cfg.rounds === 0 ? "true" : "false");
    els.prep.checked = cfg.prep;
    els.warn.checked = cfg.warn;
    els.sound.checked = cfg.sound;

    var restTxt = cfg.rest > 0 ? "descanso " + mmss(cfg.rest) : "sin descanso";
    if (cfg.rounds > 0) {
      els.sumLine.textContent = cfg.rounds + (cfg.rounds === 1 ? " round × " : " rounds × ") + mmss(cfg.round) + " · " + restTxt;
      var total = Engine.totalMs(engineCfg());
      els.sumTotal.textContent = "Sesión de " + Engine.fmt(total);
    } else {
      els.sumLine.textContent = "Rounds de " + mmss(cfg.round) + " · " + restTxt;
      els.sumTotal.textContent = "Sin límite de rounds";
    }

    document.querySelectorAll(".chip").forEach(function (chip) {
      var p = chip._preset;
      var match = p.round === cfg.round && p.rest === cfg.rest && (p.rounds === undefined || p.rounds === cfg.rounds);
      chip.setAttribute("aria-pressed", match ? "true" : "false");
    });
  }

  function buildPresets() {
    PRESETS_TRAINING.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b._preset = p;
      b.innerHTML = "<span></span><small></small>";
      b.firstChild.textContent = p.name;
      b.lastChild.textContent = mmss(p.round) + " / " + mmss(p.rest) + " · " + (p.rounds > 0 ? "×" + p.rounds : "∞");
      b.addEventListener("click", function () { applyPreset(p); });
      els.presetsTraining.appendChild(b);
    });
    PRESETS_BELTS.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b._preset = p;
      b.setAttribute("aria-label", "Cinturón " + p.name.toLowerCase() + ", combate de " + (p.round / 60) + " minutos");
      b.innerHTML = '<span class="belt belt-' + p.belt + '" aria-hidden="true"></span><span></span><small></small>';
      b.children[1].textContent = p.name;
      b.children[2].textContent = mmss(p.round);
      b.addEventListener("click", function () { applyPreset(p); });
      els.presetsBelts.appendChild(b);
    });
  }

  function applyPreset(p) {
    cfg.round = p.round;
    cfg.rest = p.rest;
    if (p.rounds !== undefined) cfg.rounds = p.rounds;
    clampAll(); save(); renderSetup();
  }

  function readTimeInputs(which) {
    var m = parseInt(els[which + "Min"].value, 10) || 0;
    var s = parseInt(els[which + "Sec"].value, 10) || 0;
    s = clamp(s, 0, 59);
    cfg[which] = m * 60 + s;
  }

  function bindSetup() {
    ["round", "rest"].forEach(function (which) {
      [els[which + "Min"], els[which + "Sec"]].forEach(function (inp) {
        inp.addEventListener("change", function () { readTimeInputs(which); clampAll(); save(); renderSetup(); });
        inp.addEventListener("focus", function () { inp.select(); });
      });
    });
    document.querySelectorAll("[data-target][data-delta]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = btn.getAttribute("data-target");
        cfg[t] += parseInt(btn.getAttribute("data-delta"), 10);
        clampAll(); save(); renderSetup();
      });
    });
    els.roundsDec.addEventListener("click", function () {
      if (cfg.rounds === 0) cfg.rounds = 10; else cfg.rounds = Math.max(1, cfg.rounds - 1);
      save(); renderSetup();
    });
    els.roundsInc.addEventListener("click", function () {
      cfg.rounds = cfg.rounds === 0 ? 1 : Math.min(LIMITS.rounds.max, cfg.rounds + 1);
      save(); renderSetup();
    });
    els.roundsInf.addEventListener("click", function () {
      cfg.rounds = cfg.rounds === 0 ? 8 : 0;
      save(); renderSetup();
    });
    els.prep.addEventListener("change", function () { cfg.prep = els.prep.checked; save(); renderSetup(); });
    els.warn.addEventListener("change", function () { cfg.warn = els.warn.checked; save(); });
    els.sound.addEventListener("change", function () { cfg.sound = els.sound.checked; Audio.setEnabled(cfg.sound); save(); });
    els.start.addEventListener("click", startSession);
  }

  function engineCfg() {
    return { round: cfg.round, rest: cfg.rest, rounds: cfg.rounds, prep: cfg.prep ? 10 : 0, warn: cfg.warn };
  }

  /* ---------- timer ---------- */
  var silent = false;
  var engine = new Engine({
    onPhase: function (phase, prev) {
      els.run.setAttribute("data-phase", phase === "done" ? prev : phase);
      if (silent) return;
      if (phase === "fight" && (prev === "prep" || prev === "rest")) Audio.bell();
      else if (prev === "fight") Audio.bellEnd();
      if (phase === "done") showDone();
    },
    onWarn: function () { if (!silent) Audio.clapper(); },
    onCountdown: function () { if (!silent) Audio.beep(false); },
    onTick: renderRun
  });

  var PHASE_LABEL = { prep: "Prepárate", fight: "Lucha", rest: "Descanso" };
  var timeFmt = (function () {
    try { return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return null; }
  })();

  function renderRun(s) {
    if (s.phase === "idle") return;
    var c = s.cfg;
    var run = els.run;
    run.classList.toggle("warn", s.warn && s.running);
    run.classList.toggle("paused", !s.running && s.phase !== "done");
    els.paused.hidden = s.running || s.phase === "done";
    els.play.setAttribute("aria-label", s.running ? "Pausar" : "Continuar");

    els.roundWord.textContent = s.phase === "rest" ? "Próximo" : "Round";
    els.roundNum.textContent = s.round;
    els.roundOf.textContent = c.rounds > 0 ? "/ " + c.rounds : "";
    els.doneCount.textContent = s.completed;

    els.phase.textContent = s.warn ? "Últimos 10 s" : (PHASE_LABEL[s.phase] || "");
    var clockTxt = Engine.fmt(s.remainingMs, true);
    if (els.clock.textContent !== clockTxt) {
      var lenChanged = els.clock.textContent.length !== clockTxt.length;
      els.clock.textContent = clockTxt;
      if (lenChanged) fitClock();
    }
    var pct = s.phaseMs ? (1 - s.remainingMs / s.phaseMs) * 100 : 100;
    els.bar.style.width = clamp(pct, 0, 100).toFixed(2) + "%";

    var next;
    if (s.phase === "prep") next = "Round 1 · " + mmss(c.round);
    else if (s.phase === "fight") {
      if (c.rounds > 0 && s.round >= c.rounds) next = "Fin de sesión";
      else if (c.rest > 0) next = "Descanso · " + mmss(c.rest);
      else next = "Round " + (s.round + 1) + " · " + mmss(c.round);
    } else if (s.phase === "rest") next = "Round " + s.round + " · " + mmss(c.round);
    else next = "—";
    els.next.textContent = next;
    els.elapsed.textContent = Engine.fmt(s.elapsedMs);

    if (s.sessionRemainingMs === null) els.end.textContent = "Sin límite";
    else if (s.phase === "done") els.end.textContent = "Terminado";
    else {
      var at = new Date(Date.now() + s.sessionRemainingMs);
      els.end.textContent = timeFmt ? timeFmt.format(at) : at.getHours() + ":" + pad2(at.getMinutes());
    }

    if (s.phase !== "done") {
      document.title = clockTxt + " · " + (PHASE_LABEL[s.phase] || "") + " · Atitude BJJ";
    }
  }

  /* Reduce el reloj si no cabe (p. ej. "10:00" en móvil o si la fuente tarda en cargar) */
  function fitClock() {
    var el = els.clock;
    if (els.run.hidden) return;
    el.style.fontSize = "";
    var avail = el.parentElement.clientWidth;
    var w = el.scrollWidth;
    if (w > avail && w > 0) {
      var cur = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.floor(cur * (avail / w) * 0.97) + "px";
    }
  }
  window.addEventListener("resize", fitClock);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitClock);

  function showDone() {
    els.done.hidden = false;
    var n = engine.completed;
    els.doneStats.textContent = n + (n === 1 ? " round" : " rounds") + " · " + Engine.fmt(engine.elapsedMs) + " en el tatami";
    document.title = "Atitude BJJ Timer";
    Platform.keepAwake(false);
    if (Nav.enabled()) els.again.focus({ preventScroll: true });
  }

  function startSession() {
    Audio.unlock();
    Audio.setEnabled(cfg.sound);
    syncSoundBtn();
    els.done.hidden = true;
    els.setup.hidden = true;
    els.run.hidden = false;
    engine.reset(engineCfg());
    engine.start();
    fitClock();
    Platform.keepAwake(true);
    els.play.focus({ preventScroll: true });
  }

  function restartSession() {
    // vuelve al inicio y queda en pausa, listo para pulsar play
    silent = true;
    els.done.hidden = true;
    engine.reset(engineCfg());
    engine.start();
    engine.pause();
    silent = false;
    els.play.focus({ preventScroll: true });
  }

  function exitToSetup() {
    engine.reset(null);
    els.run.hidden = true;
    els.done.hidden = true;
    els.setup.hidden = false;
    els.run.classList.remove("warn", "paused");
    document.title = "Atitude BJJ Timer";
    Platform.keepAwake(false);
    exitFullscreen();
    renderSetup();
    if (Nav.enabled()) els.start.focus({ preventScroll: true });
  }

  function togglePlay() {
    Audio.unlock();
    if (engine.phase === "done" || engine.phase === "idle") return;
    if (!engine.running) Platform.keepAwake(true);
    engine.toggle();
  }

  function syncSoundBtn() {
    var muted = !Audio.isEnabled();
    els.soundBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    els.soundBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
  }
  function toggleSound() {
    Audio.unlock();
    cfg.sound = !Audio.isEnabled();
    Audio.setEnabled(cfg.sound);
    els.sound.checked = cfg.sound;
    save(); syncSoundBtn();
  }

  /* ---------- API para la app nativa (mando a distancia) ---------- */
  // Botón Atrás: en marcha → pausa; en pausa o al terminar → ajustes; en ajustes → salir (false).
  function handleBack() {
    if (els.run.hidden) return false;
    if (engine.running) { engine.pause(); els.play.focus({ preventScroll: true }); return true; }
    exitToSetup();
    return true;
  }
  // Teclas multimedia del mando: play/pausa, siguiente, anterior (reiniciar)
  function command(name) {
    if (name === "toggle") {
      if (els.run.hidden) startSession();
      else if (engine.phase === "done") startSession();
      else togglePlay();
    } else if (name === "skip") {
      if (!els.run.hidden) { Audio.unlock(); engine.skip(); }
    } else if (name === "reset") {
      if (!els.run.hidden) restartSession();
    }
  }
  window.AtitudeApp = { handleBack: handleBack, command: command };

  function bindRun() {
    els.play.addEventListener("click", togglePlay);
    els.skip.addEventListener("click", function () { Audio.unlock(); engine.skip(); });
    els.reset.addEventListener("click", restartSession);
    els.exit.addEventListener("click", exitToSetup);
    els.settings.addEventListener("click", exitToSetup);
    els.again.addEventListener("click", startSession);
    els.soundBtn.addEventListener("click", toggleSound);
    els.fs.addEventListener("click", toggleFullscreen);
    // tocar el reloj también pausa/continúa (cómodo en tablet)
    els.clock.addEventListener("click", togglePlay);

    document.addEventListener("keydown", function (e) {
      var k = (e.key || "").toLowerCase();
      // teclas multimedia (teclados, mandos Bluetooth en PWA)
      if (k === "mediaplaypause" || k === "mediaplay" || k === "mediapause") { e.preventDefault(); command("toggle"); return; }
      if (k === "mediatracknext" || k === "mediafastforward") { e.preventDefault(); command("skip"); return; }
      if (k === "mediatrackprevious" || k === "mediarewind") { e.preventDefault(); command("reset"); return; }

      if (els.run.hidden) {
        if (k === "enter" && e.target === document.body) startSession();
        return;
      }
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (k === " " || k === "spacebar") {
        if (e.target && e.target.tagName === "BUTTON" && e.target !== els.play) return;
        e.preventDefault(); togglePlay();
        if (document.activeElement !== els.play) els.play.focus({ preventScroll: true });
      }
      else if (k === "n") els.skip.click();
      else if (k === "r") restartSession();
      else if (k === "f") toggleFullscreen();
      else if (k === "m") toggleSound();
    });

    // enlaces externos dentro de la app nativa (móvil): los abre el sistema
    document.querySelectorAll("a.ext").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (Platform.openExternal(a.href)) e.preventDefault();
      });
    });
  }

  /* ---------- pantalla completa (solo navegador) ---------- */
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFullscreen() {
    if (Platform.isNative) return;
    try {
      if (fsElement()) { exitFullscreen(); return; }
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        var r = req.call(el);
        if (r && r.catch) r.catch(function () {});
      }
    } catch (e) { /* no disponible */ }
  }
  function exitFullscreen() {
    try {
      if (!fsElement()) return;
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { var r = ex.call(document); if (r && r.catch) r.catch(function () {}); }
    } catch (e) { /* ignorar */ }
  }

  /* ---------- actualización de la PWA ---------- */
  Platform.registerServiceWorker(function (applyUpdate) {
    els.toast.hidden = false;
    els.toastReload.onclick = function () {
      els.toast.hidden = true;
      applyUpdate();
    };
  });

  /* ---------- arranque ---------- */
  load();
  Audio.setEnabled(cfg.sound);
  buildPresets();
  bindSetup();
  bindRun();
  renderSetup();
  if (Nav.enabled()) els.start.focus({ preventScroll: true });
})();
