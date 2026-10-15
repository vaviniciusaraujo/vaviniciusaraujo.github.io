"""Grava um vídeo (~30s, 1920x1080, 60fps) navegando pelo site, quadro a quadro.

Uso: python editor/tools/record_tour.py [saida.mp4]
Requer: pip install playwright && python -m playwright install chromium (e imageio-ffmpeg).

Como funciona: o relógio da página é substituído por um relógio virtual que só avança
quando o roteiro manda (1/60 s por quadro). A cada passo, os timers e animações em JS,
as transições/animações CSS e os vídeos são posicionados no instante exato, e a tela é
fotografada. Por isso o resultado é perfeitamente liso, mesmo que o computador demore
para desenhar algum quadro. Usa a placa de vídeo (sem ela o Chrome desenha pelo processador).
"""
import base64
import os
import shutil
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SITE = os.path.join(ROOT, 'portfolio')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'video-site.mp4')
W, H, FPS = 1920, 1080, 60
DT = 1000 / FPS
FRAMES = os.path.join(os.environ.get('TEMP', '.'), 'va_tour_frames')

# --- relógio virtual + cursor visível (instalado antes dos scripts do site) -------------
INIT_JS = r"""
(() => {
  try { sessionStorage.setItem('vaTeased', '1') } catch (e) {}
  const RST = window.setTimeout.bind(window);
  let now = 0, tid = 1, timers = [], rafs = [];
  const base = Date.now();
  performance.now = () => now;
  Date.now = () => base + now;
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.push({ id, t: now + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { const id = tid++, iv = Math.max(1, +ms || 0); timers.push({ id, t: now + iv, fn, a, iv }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers = timers.filter(x => x.id !== id); };
  window.requestAnimationFrame = fn => { const id = tid++; rafs.push({ id, fn }); return id; };
  window.cancelAnimationFrame = id => { rafs = rafs.filter(x => x.id !== id); };

  // vídeos: tocam no relógio virtual (posicionados a cada quadro)
  const P = HTMLMediaElement.prototype, realPause = P.pause, vids = new Map();
  P.play = function () {
    if (!vids.has(this)) {
      vids.set(this, now - (this.currentTime || 0) * 1000);
      if (this.readyState === 0) { this.preload = 'auto'; try { this.load(); } catch (e) {} }
    }
    realPause.call(this);
    return Promise.resolve();
  };
  P.pause = function () { vids.delete(this); return realPause.call(this); };

  const anims = new WeakMap();
  window.__vt = {
    async step(dt) {
      const target = now + dt;
      for (let guard = 0; guard < 5000; guard++) {
        timers.sort((a, b) => a.t - b.t);
        const t = timers[0];
        if (!t || t.t > target) break;
        now = Math.max(now, t.t);
        if (t.iv) t.t += t.iv; else timers.shift();
        try { t.fn(...t.a); } catch (e) {}
      }
      now = target;
      const cbs = rafs; rafs = [];
      cbs.forEach(r => { try { r.fn(now); } catch (e) {} });
      // animações e transições CSS: pausadas e posicionadas no tempo virtual
      document.getAnimations().forEach(a => {
        let s = anims.get(a);
        if (s === undefined) { s = now; anims.set(a, s); try { a.pause(); } catch (e) {} }
        try { a.currentTime = Math.max(0, now - s); } catch (e) {}
      });
      // vídeos visíveis: posiciona no instante certo e espera o quadro
      const seeks = [];
      vids.forEach((start, el) => {
        if (!el.isConnected) { vids.delete(el); return; }
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || r.width === 0) return;
        const d = el.duration;
        if (!d || !isFinite(d)) return;
        let t = (now - start) / 1000; t = el.loop ? t % d : Math.min(t, d - 0.01);
        if (Math.abs(el.currentTime - t) < 0.004) return;
        seeks.push(new Promise(res => {
          const done = () => { el.removeEventListener('seeked', done); res(); };
          el.addEventListener('seeked', done); el.currentTime = t; RST(done, 800);
        }));
      });
      await Promise.all(seeks);
      return now;
    }
  };

  const addCursor = () => {
    if (document.getElementById('va-cur')) return;
    const c = document.createElement('div'); c.id = 'va-cur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:#fff;border:2px solid #000;box-shadow:0 2px 8px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;' +
      'transform:translate(var(--x,-50px),var(--y,-50px))';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.setProperty('--x', e.clientX + 'px'); c.style.setProperty('--y', e.clientY + 'px'); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addCursor); else addCursor();
})();
"""

READY_JS = """async () => {
  const cap = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  await cap(document.fonts ? document.fonts.ready : Promise.resolve(), 3000);
  const imgs = [...document.images]; imgs.forEach(i => { i.loading = 'eager'; });
  await cap(Promise.all(imgs.map(i => i.decode().catch(() => {}))), 6000);
  document.querySelectorAll('video').forEach(v => { v.preload = 'auto'; });
  try {
    const list = await (await fetch('/assets/carousel.json')).json();
    const slugs = [...document.querySelectorAll('.cards .card')].map(c => (c.getAttribute('href') || '').split('/').filter(Boolean).pop());
    const urls = list.filter(u => slugs.some(s => u.includes('/' + s + '--')));
    if (document.querySelector('.car')) urls.push(...list);
    window.__vaKeep = urls.map(u => { const im = new Image(); im.src = u; return im; });
    await cap(Promise.all(window.__vaKeep.map(im => im.decode().catch(() => {}))), 6000);
  } catch (e) {}
}"""


def serve():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    ThreadingHTTPServer.request_queue_size = 256  # o padrão (5) recusa conexões quando o navegador pede muitas imagens juntas
    srv = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=SITE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}'


def ease(t):
    return 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


def main():
    shutil.rmtree(FRAMES, ignore_errors=True)
    os.makedirs(FRAMES)
    srv, base = serve()
    n = [0]
    mouse = {'x': W * .5, 'y': H * .6}

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--hide-scrollbars', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
                                          '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        ctx.add_init_script(INIT_JS)
        page = ctx.new_page()
        cdp = ctx.new_cdp_session(page)

        def frame():
            page.evaluate(f'window.__vt && window.__vt.step({DT})')
            shot = cdp.send('Page.captureScreenshot', {'format': 'jpeg', 'quality': 93, 'optimizeForSpeed': True})
            with open(os.path.join(FRAMES, f'{n[0]:05d}.jpg'), 'wb') as fh:
                fh.write(base64.b64decode(shot['data']))
            n[0] += 1
            if n[0] % 300 == 0:
                print(f'  {n[0] / FPS:.0f}s gravados…', flush=True)

        def hold(s):
            for _ in range(int(round(s * FPS))):
                frame()

        def ready():
            page.mouse.move(mouse['x'], mouse['y'])
            try:
                page.evaluate(READY_JS)
            except Exception:
                pass

        def goto(url):
            page.goto(base + url, wait_until='load', timeout=90000)
            ready()

        def info(sel, i=0):
            return page.evaluate("""([s,i]) => { const el = document.querySelectorAll(s)[i]; if (!el) return null;
              const r = el.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2, top: r.top, abs: r.top + scrollY}; }""", [sel, i])

        def scroll_to(y, dur):
            y0 = page.evaluate('scrollY')
            k = int(round(dur * FPS))
            for i in range(1, k + 1):
                page.evaluate(f'scrollTo(0, {y0 + (y - y0) * ease(i / k):.1f})')
                frame()

        def move(x, y, dur):
            x0, y0 = mouse['x'], mouse['y']
            k = max(1, int(round(dur * FPS)))
            for i in range(1, k + 1):
                e = ease(i / k)
                page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
                frame()
            mouse['x'], mouse['y'] = x, y

        # aquece o cache para as páginas abrirem rápido
        for u in ['/', '/works/microsoft-surface-2026/', '/works/', '/art/']:
            try:
                page.goto(base + u, wait_until='load', timeout=90000)
            except Exception:
                pass

        t0 = time.time()
        # 1) home: abertura
        goto('/')
        hold(3.6)
        # 2) rola até os trabalhos e passa o mouse numa imagem (cartão 3D)
        c = info('.feat-grid .ph', 2)
        scroll_to(max(0, c['abs'] - H * .32), 1.5)
        hold(.4)
        c = info('.feat-grid .ph', 2)
        move(c['x'] - 120, c['y'] - 60, .8)
        move(c['x'] + 140, c['y'] + 80, 1.2)
        move(c['x'] - 60, c['y'] + 20, .8)
        hold(.25)
        # 3) abre o projeto
        with page.expect_navigation(wait_until='load', timeout=90000):
            page.mouse.down(); page.mouse.up()
        ready()
        hold(2.2)
        c = info('.mosaic>.ph', 0)
        scroll_to(max(0, c['abs'] - H * .25), 1.5)
        hold(.6)
        c = info('.mosaic>.ph', 1)
        if c:
            move(c['x'], c['y'], .6)
            move(c['x'] + 90, c['y'] - 50, .7)
        hold(.25)
        # 4) Works: índice tipográfico
        goto('/works/')
        hold(1.4)
        c = info('.cards .card', 0)
        scroll_to(max(0, c['abs'] - H * .2), 1.2)
        hold(.3)
        for i in (1, 3, 5):
            c = info('.cards .card', i)
            if c:
                move(W * .5 + (i - 3) * 40, c['y'], .6)
                hold(.7)
        # 5) Art: pilha de folhas
        goto('/art/')
        hold(1.6)
        c = info('.cards .card', 0)
        scroll_to(max(0, c['abs'] - 60), 1.2)
        hold(.4)
        for i in (0, 1, 2):
            c = info('.cards .card', i)
            if c:
                move(W * .5, c['top'] + 60, .6)
                hold(.9)
        hold(.5)
        browser.close()
        print(f'  captura: {time.time() - t0:.0f}s de processamento para {n[0] / FPS:.1f}s de vídeo')
    srv.shutdown()

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([ff, '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(FRAMES, '%05d.jpg'),
                    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                    '-movflags', '+faststart', OUT], check=True)
    print(f'Vídeo: {OUT}  ({n[0] / FPS:.1f}s, {n[0]} quadros, {FPS} fps constantes)')


if __name__ == '__main__':
    main()
