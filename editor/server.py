"""Editor local do portfolio.

Uso: dois cliques no atalho "Editar site" (ou: python editor/server.py)
Abre http://localhost:8080 com o modo de edição ativo em todas as páginas.
Só aceita conexões desta máquina.
"""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

EDITOR_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, EDITOR_DIR)
import site_templates as T  # noqa: E402

SITE_DIR = os.environ.get('EDITOR_SITE_DIR') or os.path.normpath(os.path.join(EDITOR_DIR, '..', 'portfolio'))
BACKUP_DIR = os.environ.get('EDITOR_BACKUP_DIR') or os.path.join(EDITOR_DIR, 'backups')
TRASH_DIR = os.path.join(EDITOR_DIR, 'lixeira')
CUSTOM_CSS = os.path.join(SITE_DIR, 'css', 'custom.css')
MAX_BACKUPS = 60
MAX_UPLOAD = 400 * 1024 * 1024
MAX_SIDE = 2000

try:
    from PIL import Image, ImageOps, ImageStat
except ImportError:  # sem Pillow: imagens são salvas como enviadas
    Image = None
try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:  # sem ffmpeg: vídeos são salvos como enviados
    FFMPEG = None

INJECT = ('<script>window.__EDIT__=true</script>'
          '<link rel="stylesheet" href="/editor/editor.css">'
          '<script src="/editor/editor.js" defer></script>')
# No modo visualizar (?preview), os links internos continuam em ?preview.
# Só o servidor local injeta isso: o arquivo publicado não muda.
PREVIEW_INJECT = '''<script>(function(){
function keep(a){if(!a||a.origin!==location.origin||a.hasAttribute('download'))return;
var p=a.pathname;if(!(p.slice(-1)==='/'||/\\.html$/.test(p)))return;
var u=new URL(a.href);if(!u.searchParams.has('preview')){u.searchParams.set('preview','');a.href=u.pathname+'?preview'+u.hash}}
document.addEventListener('click',function(e){keep(e.target.closest&&e.target.closest('a[href]'))},true);
document.addEventListener('auxclick',function(e){keep(e.target.closest&&e.target.closest('a[href]'))},true);
var b=document.createElement('a');b.href=location.pathname+location.hash;b.textContent='Prévia · Editar esta página';
b.setAttribute('style','position:fixed;left:12px;bottom:12px;z-index:99999;background:#000;color:#fff;font:500 11px/1 system-ui,sans-serif;padding:8px 12px;border-radius:999px;text-decoration:none;opacity:.55;text-transform:none;letter-spacing:0');
b.onmouseenter=function(){b.style.opacity=1};b.onmouseleave=function(){b.style.opacity=.55};
document.body.appendChild(b);})();</script>'''
STAMP_RE = re.compile(r'^\d{8}-\d{6}\.html$')
IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}
VID_EXT = {'.mp4', '.mov', '.m4v', '.webm'}


def unique_stem(folder, stem):
    n, cand = 1, stem
    while any(f.startswith(cand + '.') or f.startswith(cand + '-card.') for f in os.listdir(folder)):
        n += 1
        cand = f'{stem}-{n}'
    return cand


def page_key(path):
    return 'home' if path in ('/', '/index.html') else path.strip('/').replace('/', '__')


def mtime(f):
    return str(os.stat(f).st_mtime_ns) if os.path.exists(f) else ''


def backup(path, file):
    if not os.path.exists(file):
        return
    d = os.path.join(BACKUP_DIR, page_key(path))
    os.makedirs(d, exist_ok=True)
    shutil.copy2(file, os.path.join(d, time.strftime('%Y%m%d-%H%M%S.html')))
    old = sorted(f for f in os.listdir(d) if STAMP_RE.match(f))
    for f in old[:-MAX_BACKUPS]:
        os.remove(os.path.join(d, f))


def migrate_old_backups():
    """Versões antigas (index-AAAAMMDD-HHMMSS.html) passam para backups/home/."""
    if not os.path.isdir(BACKUP_DIR):
        return
    for f in os.listdir(BACKUP_DIR):
        m = re.match(r'^index-(\d{8}-\d{6}\.html)$', f)
        if m:
            os.makedirs(os.path.join(BACKUP_DIR, 'home'), exist_ok=True)
            os.replace(os.path.join(BACKUP_DIR, f), os.path.join(BACKUP_DIR, 'home', m.group(1)))


def refresh_carousel():
    """Atualiza a lista do carrossel aleatório em segundo plano (não atrasa o salvamento)."""
    def run():
        try:
            T.build_carousel(SITE_DIR)
        except Exception as e:
            sys.stderr.write(f'  (carrossel: {e})\n')
    threading.Thread(target=run, daemon=True).start()


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    os.replace(tmp, path)


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def ff(*args):
    subprocess.run([FFMPEG, '-y', '-v', 'error', *args], check=True, timeout=1800)


def probe(path):
    err = subprocess.run([FFMPEG, '-hide_banner', '-i', path], capture_output=True, text=True, errors='replace').stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    s = re.search(r'Video:.*?(\d{2,5})x(\d{2,5})', err)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    return dur, (int(s.group(1)), int(s.group(2))) if s else (None, None)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE_DIR, **kw)

    def log_message(self, fmt, *args):
        if self.command == 'POST':
            sys.stderr.write('  %s\n' % (fmt % args))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def translate_path(self, path):
        p = unquote(urlsplit(path).path)
        if p.startswith('/editor/'):
            full = os.path.normpath(os.path.join(EDITOR_DIR, p[len('/editor/'):]))
            ok = full.startswith(EDITOR_DIR + os.sep) and os.path.splitext(full)[1] in ('.js', '.css')
            return full if ok else os.path.join(EDITOR_DIR, '__nope__')
        return super().translate_path(path)

    # --- GET ---------------------------------------------------------------
    def do_GET(self):
        u = urlsplit(self.path)
        q = parse_qs(u.query)
        if u.path == '/api/pages':
            return self.json(200, {'pages': [
                {'path': p, 'title': T.page_title(T.page_path_to_file(SITE_DIR, p)) or p}
                for p in T.list_pages(SITE_DIR)]})
        if u.path == '/api/backups':
            d = os.path.join(BACKUP_DIR, page_key(q.get('page', ['/'])[0]))
            files = sorted((f for f in os.listdir(d) if STAMP_RE.match(f)), reverse=True) if os.path.isdir(d) else []
            return self.json(200, {'backups': files})
        f = T.page_path_to_file(SITE_DIR, u.path) if (u.path.endswith('/') or u.path.endswith('.html')) else None
        if f and os.path.exists(f):
            html = read(f)
            if 'preview' in u.query and 'raw' not in u.query:
                html = html.replace('</body>', PREVIEW_INJECT + '\n</body>', 1)
            elif 'raw' not in u.query:
                html = re.sub(r'(<meta charset="utf-8">)', lambda m: m.group(1) + INJECT, html, count=1, flags=re.I)
            body = html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Mtime', mtime(f))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    # --- API ---------------------------------------------------------------
    def json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        # Bloqueia requisições vindas de outros sites abertos no navegador.
        if self.headers.get('X-Editor') != '1':
            return False
        origin = self.headers.get('Origin')
        return not origin or urlsplit(origin).hostname in ('localhost', '127.0.0.1')

    def do_POST(self):
        if not self.allowed():
            return self.json(403, {'error': 'forbidden'})
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_UPLOAD:
            return self.json(413, {'error': 'Arquivo grande demais (máx. 400 MB).'})
        data = self.rfile.read(length)
        route = urlsplit(self.path).path
        try:
            if route == '/api/upload':
                return self.upload(data)
            body = json.loads(data or b'{}')
            if route == '/api/save':
                return self.save(body)
            if route == '/api/restore':
                return self.restore(body)
            if route == '/api/create-project':
                return self.create_project(body)
            if route == '/api/delete-project':
                return self.delete_project(body)
        except Exception as e:  # mostra o erro no editor
            return self.json(500, {'error': f'{type(e).__name__}: {e}'})
        return self.json(404, {'error': 'not found'})

    def save(self, body):
        path = body.get('path', '/')
        f = T.page_path_to_file(SITE_DIR, path)
        html = body.get('html', '')
        if not f:
            return self.json(400, {'error': 'Página inválida.'})
        if not html.lstrip().lower().startswith('<!doctype html') or '</html>' not in html or len(html) < 500:
            return self.json(400, {'error': 'HTML inválido, nada foi salvo.'})
        if os.path.exists(f) and not body.get('force') and body.get('baseMtime') != mtime(f):
            return self.json(409, {'error': 'conflict'})
        backup(path, f)
        write_atomic(f, html)
        if isinstance(body.get('css'), str):
            if os.path.exists(CUSTOM_CSS):
                backup('/_css/', CUSTOM_CSS)
            write_atomic(CUSTOM_CSS, body['css'])
        synced = T.sync_shared(SITE_DIR, f, html)
        dom = body.get('domain')
        if dom and all(re.match(r'^https?://[^\s"<>]+$', dom.get(k, '')) for k in ('from', 'to')):
            for p in T.list_pages(SITE_DIR):
                pf = T.page_path_to_file(SITE_DIR, p)
                t = read(pf)
                if dom['from'] in t:
                    write_atomic(pf, t.replace(dom['from'], dom['to']))
            for name in ('robots.txt', '404.html'):
                p = os.path.join(SITE_DIR, name)
                if os.path.exists(p):
                    write_atomic(p, read(p).replace(dom['from'], dom['to']))
        T.write_sitemap(SITE_DIR)
        refresh_carousel()
        return self.json(200, {'ok': True, 'mtime': mtime(f), 'synced': synced})

    def restore(self, body):
        path, name = body.get('path', '/'), body.get('name', '')
        src = os.path.join(BACKUP_DIR, page_key(path), name)
        f = T.page_path_to_file(SITE_DIR, path)
        if not f or not STAMP_RE.match(name) or not os.path.exists(src):
            return self.json(400, {'error': 'Versão não encontrada.'})
        html = read(src)
        backup(path, f)
        write_atomic(f, html)
        return self.json(200, {'ok': True})

    def create_project(self, body):
        cat, title = body.get('cat', ''), (body.get('title') or '').strip()
        if cat not in T.CATEGORIES or not title:
            return self.json(400, {'error': 'Categoria ou nome inválido.'})
        base = slug = T.slugify(title)
        n = 2
        while os.path.exists(os.path.join(SITE_DIR, cat, slug)):
            slug = f'{base}-{n}'
            n += 1
        home = read(os.path.join(SITE_DIR, 'index.html'))
        header = T.SHARED_BLOCKS[0].search(home).group(0)
        footer = T.SHARED_BLOCKS[1].search(home).group(0)
        domain = (re.search(r'<link rel="canonical" href="(https?://[^"/]+)', home) or [None, 'https://www.example.com'])[1]
        html = T.project_page(cat=cat, slug=slug, title=title, intro='Short description of the project.',
                              meta=[('Client', '—'), ('Year', time.strftime('%Y')), ('Role', '3D Artist')],
                              media=[], alts=[], domain=domain, header=header, footer=footer, image='/assets/og-image.jpg')
        write_atomic(os.path.join(SITE_DIR, cat, slug, 'index.html'), html)
        os.makedirs(os.path.join(SITE_DIR, 'assets', 'projects', slug), exist_ok=True)
        T.write_sitemap(SITE_DIR)
        return self.json(200, {'path': f'/{cat}/{slug}/', 'slug': slug})

    def delete_project(self, body):
        path = body.get('path', '')
        m = re.match(r'^/(works|art|lab)/([a-z0-9-]+)/$', path)
        if not m:
            return self.json(400, {'error': 'Projeto inválido.'})
        cat, slug = m.groups()
        stamp = time.strftime('%Y%m%d-%H%M%S')
        dest = os.path.join(TRASH_DIR, f'{stamp}-{cat}-{slug}')
        os.makedirs(dest, exist_ok=True)
        page_dir = os.path.join(SITE_DIR, cat, slug)
        if os.path.isdir(page_dir):
            shutil.move(page_dir, os.path.join(dest, 'pagina'))
        media_dir = os.path.join(SITE_DIR, 'assets', 'projects', slug)
        if os.path.isdir(media_dir):
            shutil.move(media_dir, os.path.join(dest, 'midia'))
        # tira os cards que apontam para o projeto das outras páginas (a página atual o editor já salvou)
        exclude = T.page_path_to_file(SITE_DIR, body.get('exclude', '') or '/__none__/')
        rx = re.compile(r'\s*<a class="card" href="' + re.escape(path) + r'">.*?</a>', re.S)
        for p in T.list_pages(SITE_DIR):
            pf = T.page_path_to_file(SITE_DIR, p)
            if exclude and os.path.normcase(pf) == os.path.normcase(exclude):
                continue
            t = read(pf)
            if rx.search(t):
                backup(p, pf)
                write_atomic(pf, rx.sub('', t))
        T.write_sitemap(SITE_DIR)
        refresh_carousel()
        return self.json(200, {'ok': True, 'trash': os.path.relpath(dest, os.path.dirname(EDITOR_DIR))})

    def upload(self, data):
        fname = unquote(self.headers.get('X-Filename', 'arquivo'))
        stem, ext = os.path.splitext(os.path.basename(fname))
        ext = ext.lower()
        page = unquote(self.headers.get('X-Page', '/'))
        m = re.match(r'^/(?:works|art|lab)/([a-z0-9-]+)/$', page)
        rel = f'assets/projects/{m.group(1)}' if m else 'assets/img'
        folder = os.path.join(SITE_DIR, *rel.split('/'))
        os.makedirs(folder, exist_ok=True)
        stem = unique_stem(folder, T.slugify(stem)[:50])
        url = lambda name: f'/{rel}/{name}'

        if ext in VID_EXT:
            raw = os.path.join(folder, stem + '.upload' + ext)
            with open(raw, 'wb') as fh:
                fh.write(data)
            if not FFMPEG:
                final = os.path.join(folder, stem + ext)
                os.replace(raw, final)
                return self.json(200, {'kind': 'video', 'src': url(stem + ext), 'poster': None, 'width': None, 'height': None})
            try:
                mp4 = os.path.join(folder, stem + '.mp4')
                ff('-i', raw, '-an', '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-crf', '24', '-preset', 'medium',
                   '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', mp4)
                dur, (w, h) = probe(mp4)
                poster = None
                if Image is not None:
                    import io
                    best, score = None, -1
                    for k in (0.15, 0.4, 0.65):
                        out = subprocess.run([FFMPEG, '-v', 'error', '-ss', f'{dur * k:.2f}', '-i', mp4, '-frames:v', '1',
                                              '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True, timeout=120).stdout
                        if not out:
                            continue
                        im = Image.open(io.BytesIO(out)).convert('RGB')
                        st = ImageStat.Stat(im)
                        sc = sum(st.stddev) + sum(st.mean) * .3
                        if sc > score:
                            best, score = im, sc
                    if best:
                        best.thumbnail((1920, 1920))
                        best.save(os.path.join(folder, stem + '.jpg'), quality=82, optimize=True, progressive=True)
                        poster = url(stem + '.jpg')
                return self.json(200, {'kind': 'video', 'src': url(stem + '.mp4'), 'poster': poster, 'width': w, 'height': h})
            finally:
                if os.path.exists(raw):
                    os.remove(raw)

        if Image is not None:
            import io
            im = Image.open(io.BytesIO(data))
            im = ImageOps.exif_transpose(im)
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            rgba = im.convert('RGBA') if has_alpha else im.convert('RGB')
            rgba.save(os.path.join(folder, stem + '.webp'), quality=82, method=6)
            if has_alpha:
                flat = Image.new('RGB', rgba.size, 'white')
                flat.paste(rgba, mask=rgba.split()[-1])
            else:
                flat = rgba
            flat.save(os.path.join(folder, stem + '.jpg'), quality=86, optimize=True, progressive=True)
            w, h = im.size
            return self.json(200, {'kind': 'image', 'src': url(stem + '.jpg'), 'webp': url(stem + '.webp'), 'width': w, 'height': h})
        if ext not in IMG_EXT:
            return self.json(400, {'error': 'Formato não suportado. Use JPG, PNG, WebP ou MP4.'})
        with open(os.path.join(folder, stem + ext), 'wb') as fh:
            fh.write(data)
        return self.json(200, {'kind': 'image', 'src': url(stem + ext), 'webp': None, 'width': None, 'height': None})


def free_port(start):
    for port in range(start, start + 20):
        with socket.socket() as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise SystemExit('Nenhuma porta livre entre %d e %d.' % (start, start + 19))


def editor_running(port):
    """True se já existe um editor nosso nessa porta (ex.: atalho aberto duas vezes)."""
    import urllib.request
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/editor/editor.js', timeout=1.5) as r:
            return r.status == 200 and b'Editor visual' in r.read(200)
    except Exception:
        return False


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    migrate_old_backups()
    refresh_carousel()
    wanted = int(os.environ.get('PORT', 8080))
    if editor_running(wanted):
        print(f'\n  O editor já está aberto em http://localhost:{wanted}/ — abrindo no navegador.\n')
        if '--no-browser' not in sys.argv:
            webbrowser.open(f'http://localhost:{wanted}/')
        time.sleep(3)
        return
    port = free_port(wanted)
    if port != wanted:
        print(f'\n  Atenção: a porta {wanted} está ocupada por outro programa; usando a porta {port}.')
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    url = f'http://localhost:{port}/'
    print(f'\n  Editor do site rodando em {url}')
    print('  Visualizar sem editor:   ' + url + '?preview')
    print('  Para parar: feche esta janela ou aperte Ctrl+C.\n')
    if Image is None:
        print('  (Aviso: Pillow não encontrado — imagens serão salvas sem otimização.)')
    if FFMPEG is None:
        print('  (Aviso: imageio-ffmpeg não encontrado — vídeos serão salvos sem compressão.)')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
