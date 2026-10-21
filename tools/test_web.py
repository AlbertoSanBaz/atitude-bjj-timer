#!/usr/bin/env python3
"""Pruebas de la PWA (web/) con Playwright en Chromium headless.

Levanta su propio servidor local (no hace falta arrancar nada antes) y comprueba:
  1. Carga sin peticiones externas, fuentes locales, presets, resumen y localStorage.
  2. Motor del timer con reloj simulado: prep → lucha → aviso 10 s → descanso → fin,
     pausa, saltar, reiniciar y recuperación tras suspender el navegador.
  3. API nativa con el puente window.AtitudeTV simulado (handleBack, command, keepScreenOn, openUrl).
  4. Modo TV (?tv=1 a 960x540, equivale a 1080p en una TV xhdpi): foco visible y flechas del mando.
  5. Móvil (390 px): sin scroll horizontal y el reloj de 10:00 cabe.
  6. Service worker: una sola carga en la primera visita, precaché completa y recarga sin conexión.
  7. Actualización: con una versión nueva del SW sale el aviso y «Actualizar» recarga con ella.

Uso:   python3 tools/test_web.py [--capturas DIR]
Requisitos: pip install playwright   (usa Google Chrome si está instalado;
            si no, ejecuta también: python3 -m playwright install chromium)
Sale con código 1 si falla alguna prueba.
"""
from __future__ import annotations

import argparse
import functools
import re
import shutil
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

results: list[tuple[str, bool]] = []


def check(name: str, cond, extra="") -> None:
    results.append((name, bool(cond)))
    print(("OK   " if cond else "FAIL ") + name + (" -> " + str(extra) if extra and not cond else ""))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # sin una línea por petición
        pass

    def end_headers(self) -> None:
        # sin caché HTTP: cada prueba ve los archivos tal como están en disco
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(directory: Path) -> tuple[ThreadingHTTPServer, str]:
    """Sirve un directorio en un puerto libre de localhost (el SW necesita localhost o https)."""
    handler = functools.partial(QuietHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, "http://localhost:%d/" % server.server_address[1]


def sw_info() -> tuple[str, int]:
    """CACHE_VERSION y nº de entradas de PRECACHE leídos de web/sw.js."""
    src = (WEB / "sw.js").read_text(encoding="utf-8")
    version = re.search(r'var CACHE_VERSION = "([^"]+)"', src).group(1)
    precache = re.search(r"var PRECACHE = \[(.*?)\];", src, re.S).group(1)
    return version, len(re.findall(r'"[^"]*"', precache))


def snap(page) -> dict:
    return page.evaluate("""() => ({
        phase: document.getElementById('run').dataset.phase,
        clock: document.getElementById('clock').textContent,
        label: document.getElementById('phase-label').textContent,
        round: document.getElementById('round-num').textContent,
        done: document.getElementById('done-count').textContent,
        warn: document.getElementById('run').classList.contains('warn'),
        paused: document.getElementById('run').classList.contains('paused'),
        overlay: !document.getElementById('done').hidden,
        runHidden: document.getElementById('run').hidden,
    })""")


def launch(p):
    try:
        return p.chromium.launch(channel="chrome", headless=True)
    except PlaywrightError:
        return p.chromium.launch(headless=True)


def test_setup_and_engine(browser, base: str, shot) -> None:
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    blocked, errors = [], []

    def only_local(route):
        if route.request.url.startswith(base):
            route.continue_()
        else:
            blocked.append(route.request.url)
            route.abort()
    ctx.route("**/*", only_local)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.clock.install()  # reloj simulado: los minutos pasan al instante
    page.goto(base)
    page.evaluate("document.fonts.ready")

    print("\n— 1. Carga y configuración")
    fonts = page.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight)")
    check("sin peticiones externas", not blocked, blocked)
    check("fuentes Barlow y Barlow Condensed cargadas",
          any("Barlow Condensed" in f for f in fonts) and any(f.startswith("Barlow ") for f in fonts), fonts)
    check("10 presets (5 entreno + 5 cinturones)", page.locator(".chip").count() == 10, page.locator(".chip").count())
    shot(page, "01-ajustes-escritorio", full_page=True)

    page.get_by_role("button", name="Cinturón negra, combate de 10 minutos").click()
    check("preset Negra → round de 10:00",
          page.input_value("#round-min") == "10" and page.input_value("#round-sec") == "00")
    page.locator(".chip", has_text="Drills").click()
    check("preset Drills → resumen", page.text_content("#summary-line") == "10 rounds × 2:00 · descanso 0:15",
          page.text_content("#summary-line"))
    check("preset Drills → sesión de 22:15", page.text_content("#summary-total") == "Sesión de 22:15",
          page.text_content("#summary-total"))
    stored = page.evaluate("localStorage.getItem('atitude-timer-v1')")
    check("ajustes guardados en localStorage", stored and '"round":120' in stored, stored)

    # sesión corta para el motor: 2 rounds de 1:00 con descanso de 0:15
    page.fill("#round-min", "1"); page.fill("#round-sec", "0"); page.press("#round-sec", "Tab")
    page.fill("#rest-min", "0"); page.fill("#rest-sec", "15"); page.press("#rest-sec", "Tab")
    for _ in range(8):
        page.click("#rounds-dec")
    check("campos y − → 2 rounds × 1:00", page.text_content("#summary-line") == "2 rounds × 1:00 · descanso 0:15",
          page.text_content("#summary-line"))
    check("sesión de 2:15", page.text_content("#summary-total") == "Sesión de 2:15", page.text_content("#summary-total"))

    print("\n— 2. Motor del timer")
    page.click("#start")
    s = snap(page)
    check("arranca en preparación 0:10", s["phase"] == "prep" and s["clock"] == "0:10", s)
    page.clock.run_for(10_200)
    s = snap(page)
    check("a los 10 s → lucha, round 1", s["phase"] == "fight" and s["round"] == "1" and s["clock"] in ("1:00", "0:59"), s)
    page.clock.run_for(50_500)
    s = snap(page)
    check("últimos 10 s → .warn y «Últimos 10 s»", s["warn"] and s["label"] == "Últimos 10 s", s)
    shot(page, "02-lucha-aviso")
    page.clock.run_for(10_000)
    s = snap(page)
    check("descanso: próximo round 2, 1 completado", s["phase"] == "rest" and s["round"] == "2" and s["done"] == "1", s)
    shot(page, "03-descanso")

    page.keyboard.press("Space")
    s1 = snap(page)
    page.clock.run_for(5_000)
    s2 = snap(page)
    check("Espacio pausa y el reloj se congela", s1["paused"] and s1["clock"] == s2["clock"], (s1, s2))
    page.keyboard.press("Space")
    check("Espacio continúa", not snap(page)["paused"])

    page.keyboard.press("n")
    s = snap(page)
    check("N salta a lucha, round 2", s["phase"] == "fight" and s["round"] == "2", s)
    page.clock.run_for(61_000)
    s = snap(page)
    check("fin de sesión: pantalla «Oss», 2 completados", s["overlay"] and s["done"] == "2", s)
    check("estadística final", "2 rounds" in page.text_content("#done-stats"), page.text_content("#done-stats"))
    shot(page, "04-fin")

    page.click("#btn-again")
    page.clock.run_for(10_200)
    page.clock.fast_forward(80_000)  # el tiempo salta de golpe, como un navegador suspendido
    page.clock.run_for(200)
    s = snap(page)
    check("recupera las fases tras una suspensión de 80 s", s["phase"] == "fight" and s["round"] == "2", s)

    page.keyboard.press("r")
    s = snap(page)
    check("R reinicia en pausa en la preparación", s["phase"] == "prep" and s["paused"] and s["clock"] == "0:10", s)

    page.click("#btn-exit")
    check("X vuelve a ajustes", snap(page)["runHidden"])
    page.click("#rounds-inf")
    check("«Sin límite ∞»", page.text_content("#summary-total") == "Sin límite de rounds")
    check("sin errores JS", not errors, errors)
    ctx.close()


def test_native_bridge(browser, base: str) -> None:
    print("\n— 3. API nativa (puente AtitudeTV simulado)")
    ctx = browser.new_context(viewport={"width": 960, "height": 540})
    ctx.add_init_script("""window.__calls = []; window.AtitudeTV = {
        isTv: () => true, keepScreenOn: (b) => window.__calls.push(['keep', b]),
        openUrl: (u) => window.__calls.push(['open', u]), appVersion: () => '1.0.0' };""")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(base)
    cls = page.evaluate("document.documentElement.className")
    check("puente → clases html.native y html.tv", "native" in cls and "tv" in cls, cls)
    check("en nativo no se registra el SW",
          page.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)") == 0)
    check("handleBack() en ajustes → false (Android cierra la app)", page.evaluate("AtitudeApp.handleBack()") is False)
    page.evaluate("AtitudeApp.command('toggle')")
    check("command('toggle') en ajustes arranca la sesión", not snap(page)["runHidden"])
    check("handleBack() en marcha → pausa",
          page.evaluate("AtitudeApp.handleBack()") is True and snap(page)["paused"])
    page.evaluate("AtitudeApp.command('skip')")
    check("command('skip') en pausa → lucha", snap(page)["phase"] == "fight")
    check("handleBack() en pausa → ajustes",
          page.evaluate("AtitudeApp.handleBack()") is True and snap(page)["runHidden"])
    calls = [tuple(c) for c in page.evaluate("window.__calls")]
    check("keepScreenOn(true) en la sesión y (false) al salir", ("keep", True) in calls and calls[-1] == ("keep", False), calls)
    page.evaluate("document.querySelector('a.ext').click()")  # en modo TV está oculto: clic por JS
    calls = [tuple(c) for c in page.evaluate("window.__calls")]
    check("enlace externo → openUrl()", any(c[0] == "open" for c in calls), calls)
    check("sin errores JS", not errors, errors)
    ctx.close()


def test_tv_mode(browser, base: str, shot) -> None:
    print("\n— 4. Modo TV (?tv=1, 960x540)")
    ctx = browser.new_context(viewport={"width": 960, "height": 540}, service_workers="block")
    page = ctx.new_page()
    page.goto(base + "?tv=1")
    page.evaluate("document.fonts.ready")

    def focus():
        return page.evaluate("document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20)")

    check("foco inicial en Empezar", focus() == "start", focus())
    visible = page.evaluate("""(() => { const r = document.getElementById('start').getBoundingClientRect();
                                       return r.top >= 0 && r.bottom <= innerHeight; })()""")
    check("Empezar se ve en pantalla al abrir (no queda fuera)", visible)
    shot(page, "05-tv-ajustes")
    path = []
    for _ in range(7):
        page.keyboard.press("ArrowUp")
        path.append(focus())
    check("las flechas mueven el foco", len(set(path)) > 3, path)
    shot(page, "06-tv-foco")
    for _ in range(15):
        page.keyboard.press("ArrowUp")
    page.keyboard.press("Enter")
    check("OK sobre un preset lo activa", page.locator(".chip[aria-pressed=true]").count() >= 1, focus())
    page.evaluate("document.getElementById('start').focus()")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1200)
    check("OK en Empezar arranca la sesión", not snap(page)["runHidden"])
    check("durante el timer el foco está en play/pausa", focus() == "btn-play", focus())
    shot(page, "07-tv-timer")
    page.keyboard.press("ArrowLeft")
    check("flecha izquierda → Reiniciar", focus() == "btn-reset", focus())
    ctx.close()


def test_mobile(browser, base: str, shot) -> None:
    print("\n— 5. Móvil (390 px)")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True, service_workers="block")
    page = ctx.new_page()
    page.clock.install()
    page.goto(base)
    page.evaluate("document.fonts.ready")
    check("sin scroll horizontal", not page.evaluate("document.documentElement.scrollWidth > innerWidth"))
    shot(page, "08-movil-ajustes", full_page=True)
    page.locator(".chip", has_text="Negra").click()
    page.click("#start")
    page.clock.run_for(10_000)  # justo al empezar el round: 10:00
    fits = page.evaluate("(() => { const c = document.getElementById('clock'); return c.scrollWidth <= c.parentElement.clientWidth; })()")
    check("el reloj de 10:00 cabe en pantalla", fits, page.text_content("#clock"))
    shot(page, "09-movil-timer")
    ctx.close()


def test_service_worker(browser, base: str) -> None:
    print("\n— 6. Service worker y modo offline")
    version, entries = sw_info()
    ctx = browser.new_context()
    page = ctx.new_page()
    loads = []
    page.on("framenavigated", lambda f: f == page.main_frame and loads.append(f.url))
    page.goto(base)
    page.evaluate("navigator.serviceWorker.ready")
    page.wait_for_timeout(1500)  # margen para una recarga indebida al tomar el control
    check("una sola carga en la primera visita", len(loads) == 1, loads)
    check("el SW controla la página", page.evaluate("!!navigator.serviceWorker.controller"))
    cached = page.evaluate("caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys()).then(r => [n, r.length]))))")
    check("precaché completa: %s con %d entradas" % (version, entries), cached == [[version, entries]], cached)
    ctx.set_offline(True)
    page.goto(base + "?tv=1")
    page.evaluate("document.fonts.ready")
    ok = page.evaluate("document.documentElement.classList.contains('tv') && !!window.BJJEngine"
                       " && document.fonts.check('700 40px \"Barlow Condensed\"')")
    check("sin conexión recarga (también con ?tv=1) y con fuentes", ok)
    ctx.close()


def test_update(browser) -> None:
    print("\n— 7. Actualización de la PWA")
    tmp = Path(tempfile.mkdtemp(prefix="atitude-web-"))
    copy = tmp / "web"
    shutil.copytree(WEB, copy)
    server, base = serve(copy)  # otro puerto: otro origen, sin SW previo
    try:
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(base)
        page.evaluate("navigator.serviceWorker.ready")
        page.wait_for_timeout(1000)
        sw = copy / "sw.js"
        sw.write_text(re.sub(r'(var CACHE_VERSION = ")[^"]+"', r'\1atitude-timer-v99.0.0"',
                             sw.read_text(encoding="utf-8"), count=1), encoding="utf-8")
        page.reload()
        page.wait_for_selector("#toast:not([hidden])", timeout=8000)
        check("con una versión nueva sale el aviso «Actualizar»", page.is_visible("#toast"))
        loads = []
        page.on("framenavigated", lambda f: f == page.main_frame and loads.append(f.url))
        page.click("#toast-reload")
        page.wait_for_timeout(2500)
        check("«Actualizar» recarga la página una vez", len(loads) == 1, loads)
        check("y queda solo la caché nueva", page.evaluate("caches.keys()") == ["atitude-timer-v99.0.0"],
              page.evaluate("caches.keys()"))
        ctx.close()
    finally:
        server.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Pruebas de la PWA del timer con Playwright.")
    ap.add_argument("--capturas", type=Path, help="carpeta donde guardar capturas de pantalla")
    args = ap.parse_args()
    if args.capturas:
        args.capturas.mkdir(parents=True, exist_ok=True)

    def shot(page, name: str, full_page: bool = False) -> None:
        if args.capturas:
            page.screenshot(path=str(args.capturas / (name + ".png")), full_page=full_page)

    server, base = serve(WEB)
    try:
        with sync_playwright() as p:
            browser = launch(p)
            test_setup_and_engine(browser, base, shot)
            test_native_bridge(browser, base)
            test_tv_mode(browser, base, shot)
            test_mobile(browser, base, shot)
            test_service_worker(browser, base)
            test_update(browser)
            browser.close()
    finally:
        server.shutdown()

    fails = [name for name, ok in results if not ok]
    print("\n%d/%d pruebas OK" % (len(results) - len(fails), len(results)))
    if args.capturas:
        print("Capturas en %s" % args.capturas)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
