/* Motor del timer: máquina de estados independiente de la interfaz.
   Fases: prep → fight → rest → fight → … → done
   El tiempo se calcula con marcas de performance.now(), así no deriva aunque
   el navegador ralentice los intervalos en segundo plano. */
(function () {
  "use strict";

  var WARN_SEC = 10;

  function Engine(handlers) {
    this.h = handlers || {};
    this.cfg = null;
    this.timer = null;
    this.reset(null);
  }

  Engine.prototype.reset = function (cfg) {
    if (cfg) this.cfg = cfg;
    this.stopLoop();
    this.phase = "idle";
    this.round = 0;          // round actual (o el próximo, en descanso)
    this.completed = 0;      // rounds terminados
    this.phaseMs = 0;        // duración de la fase actual
    this.remainingMs = 0;
    this.endAt = 0;
    this.running = false;
    this.elapsedMs = 0;      // tiempo total con el reloj en marcha
    this.lastTs = 0;
    this.lastShownSec = null;
    this.warned = false;
  };

  Engine.prototype.now = function () { return performance.now(); };

  Engine.prototype.start = function () {
    var c = this.cfg;
    this.reset(c);
    if (c.prep > 0) this.enter("prep", c.prep, 1);
    else this.enter("fight", c.round, 1);
    this.running = true;
    this.lastTs = this.now();
    this.startLoop();
    this.emitTick();
  };

  Engine.prototype.enter = function (phase, sec, round) {
    var prev = this.phase;
    this.phase = phase;
    this.round = round;
    this.phaseMs = sec * 1000;
    this.remainingMs = this.phaseMs;
    this.endAt = this.now() + this.remainingMs;
    this.lastShownSec = null;
    this.warned = false;
    if (this.h.onPhase) this.h.onPhase(phase, prev, this);
  };

  Engine.prototype.advance = function () {
    var c = this.cfg;
    if (this.phase === "prep") {
      this.enter("fight", c.round, 1);
    } else if (this.phase === "fight") {
      this.completed += 1;
      if (c.rounds > 0 && this.completed >= c.rounds) {
        this.finish();
        return;
      }
      if (c.rest > 0) this.enter("rest", c.rest, this.round + 1);
      else this.enter("fight", c.round, this.round + 1);
    } else if (this.phase === "rest") {
      this.enter("fight", c.round, this.round);
    }
  };

  Engine.prototype.finish = function () {
    var prev = this.phase;
    this.phase = "done";
    this.running = false;
    this.remainingMs = 0;
    this.stopLoop();
    if (this.h.onPhase) this.h.onPhase("done", prev, this);
    this.emitTick();
  };

  Engine.prototype.skip = function () {
    if (this.phase === "idle" || this.phase === "done") return;
    this.accumulate();
    this.advance();
    if (!this.running && this.phase !== "done") {
      // si estaba en pausa, la nueva fase queda en pausa
      this.endAt = 0;
    }
    this.emitTick();
  };

  Engine.prototype.pause = function () {
    if (!this.running) return;
    this.accumulate();
    this.remainingMs = Math.max(0, this.endAt - this.now());
    this.running = false;
    this.stopLoop();
    this.emitTick();
  };

  Engine.prototype.resume = function () {
    if (this.running || this.phase === "done" || this.phase === "idle") return;
    this.endAt = this.now() + this.remainingMs;
    this.running = true;
    this.lastTs = this.now();
    this.startLoop();
    this.emitTick();
  };

  Engine.prototype.toggle = function () {
    if (this.running) this.pause(); else this.resume();
  };

  Engine.prototype.accumulate = function () {
    if (!this.running) return;
    var t = this.now();
    this.elapsedMs += t - this.lastTs;
    this.lastTs = t;
  };

  Engine.prototype.startLoop = function () {
    var self = this;
    this.stopLoop();
    this.timer = setInterval(function () { self.tick(); }, 100);
  };

  Engine.prototype.stopLoop = function () {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  };

  Engine.prototype.tick = function () {
    if (!this.running) return;
    this.accumulate();
    var rem = this.endAt - this.now();
    // si el navegador estuvo dormido varios segundos, recupera fases saltadas
    var guard = 0;
    while (rem <= 0 && this.running && guard < 200) {
      var overshoot = -rem;
      this.advance();
      if (this.phase === "done") return;
      this.endAt = this.now() + this.phaseMs - overshoot;
      rem = this.endAt - this.now();
      guard++;
    }
    this.remainingMs = Math.max(0, rem);

    var sec = Math.ceil(this.remainingMs / 1000);
    if (sec !== this.lastShownSec) {
      this.lastShownSec = sec;
      if (this.phase === "fight" && this.cfg.warn && sec <= WARN_SEC && sec > 0 && this.phaseMs > (WARN_SEC + 5) * 1000 && !this.warned) {
        this.warned = true;
        if (this.h.onWarn) this.h.onWarn(this);
      }
      if ((this.phase === "prep" || this.phase === "rest") && sec >= 1 && sec <= 3) {
        if (this.h.onCountdown) this.h.onCountdown(sec, this);
      }
    }
    this.emitTick();
  };

  Engine.prototype.emitTick = function () {
    if (this.h.onTick) this.h.onTick(this.snapshot());
  };

  Engine.prototype.inWarning = function () {
    return this.phase === "fight" && this.cfg.warn &&
      this.phaseMs > (WARN_SEC + 5) * 1000 &&
      this.remainingMs <= WARN_SEC * 1000 && this.remainingMs > 0;
  };

  /* Milisegundos que faltan para terminar la sesión (null si no hay límite) */
  Engine.prototype.sessionRemainingMs = function () {
    var c = this.cfg;
    if (!c || c.rounds <= 0) return null;
    var ms = this.remainingMs;
    var roundsLeft, restsLeft;
    if (this.phase === "prep") {
      roundsLeft = c.rounds; restsLeft = c.rounds - 1;
    } else if (this.phase === "fight") {
      roundsLeft = c.rounds - this.round; restsLeft = c.rounds - this.round;
    } else if (this.phase === "rest") {
      roundsLeft = c.rounds - this.round + 1; restsLeft = c.rounds - this.round;
    } else return 0;
    if (c.rest <= 0) restsLeft = 0;
    return ms + roundsLeft * c.round * 1000 + Math.max(0, restsLeft) * c.rest * 1000;
  };

  Engine.prototype.snapshot = function () {
    return {
      phase: this.phase,
      round: this.round,
      completed: this.completed,
      remainingMs: this.remainingMs,
      phaseMs: this.phaseMs,
      running: this.running,
      warn: this.inWarning(),
      elapsedMs: this.elapsedMs,
      sessionRemainingMs: this.sessionRemainingMs(),
      cfg: this.cfg
    };
  };

  /* Duración total teórica de una sesión con esta configuración */
  Engine.totalMs = function (cfg) {
    if (cfg.rounds <= 0) return null;
    var rests = cfg.rest > 0 ? cfg.rounds - 1 : 0;
    return (cfg.rounds * cfg.round + rests * cfg.rest) * 1000;
  };

  Engine.fmt = function (ms, ceil) {
    var s = ceil ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
    if (s < 0) s = 0;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    var mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(r).padStart(2, "0");
  };

  window.BJJEngine = Engine;
})();
