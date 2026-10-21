/* Sonidos sintetizados con Web Audio: no necesita archivos de audio.
   - bell():     campana de inicio de round
   - bellEnd():  triple campana de fin de round
   - clapper():  claqueta de madera (aviso de 10 s)
   - beep():     pitido de cuenta atrás (3-2-1) */
(function () {
  "use strict";

  var ctx = null;
  var master = null;
  var noise = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.9;
    // compresor para que suene fuerte sin saturar en el gimnasio
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 0.25);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === "suspended") c.resume();
  }

  function ready() {
    return enabled && ensure() && ctx.state !== "closed";
  }

  // Campana metálica: parciales inarmónicos con caída exponencial
  function strike(t, base, vol, dur) {
    var partials = [
      [1, 1.0], [2.0, 0.55], [2.76, 0.45], [4.07, 0.25], [5.4, 0.2], [8.93, 0.08]
    ];
    partials.forEach(function (p, i) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = base * p[0];
      var d = dur / (1 + i * 0.45);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * p[1], t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + d + 0.05);
    });
    // golpe del martillo
    var n = ctx.createBufferSource();
    n.buffer = noise;
    var f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 3000;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(f); f.connect(ng); ng.connect(master);
    n.start(t); n.stop(t + 0.05);
  }

  function bell() {
    if (!ready()) return;
    var t = ctx.currentTime + 0.02;
    strike(t, 830, 0.55, 2.6);
  }

  function bellEnd() {
    if (!ready()) return;
    var t = ctx.currentTime + 0.02;
    for (var i = 0; i < 3; i++) strike(t + i * 0.32, 830, 0.5, 1.6);
  }

  function clack(t, vol) {
    var n = ctx.createBufferSource();
    n.buffer = noise;
    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 4.5;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(bp); bp.connect(g); g.connect(master);
    n.start(t); n.stop(t + 0.1);
    // cuerpo de madera
    var o = ctx.createOscillator();
    var og = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(950, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    og.gain.setValueAtTime(vol * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 0.08);
  }

  function clapper() {
    if (!ready()) return;
    var t = ctx.currentTime + 0.02;
    for (var i = 0; i < 3; i++) {
      clack(t + i * 0.28, 1.0);
      clack(t + i * 0.28 + 0.11, 0.85);
    }
  }

  function beep(high) {
    if (!ready()) return;
    var t = ctx.currentTime + 0.01;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "square";
    o.frequency.value = high ? 1320 : 880;
    var dur = high ? 0.35 : 0.14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
    g.gain.setValueAtTime(0.22, t + dur - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  window.BJJAudio = {
    unlock: unlock,
    bell: bell,
    bellEnd: bellEnd,
    clapper: clapper,
    beep: beep,
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; }
  };
})();
