"""Modelos HTML compartilhados: usados pelo importador (tools/import_projects.py)
e pelo servidor do editor (ao criar um projeto novo)."""
import html
import os
import re

CATEGORIES = {
    'works': {'title': 'Works', 'intro': 'Commercial projects for brands and studios: product visualization, CGI and motion.'},
    'art': {'title': 'Art', 'intro': 'Personal pieces and independent explorations.'},
    'lab': {'title': 'Lab', 'intro': 'Experiments, tests and work in progress.'},
}

HEAD_TMPL = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="author" content="Vinicius Araujo">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="canonical" href="{url}">

<!-- Open Graph / social -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Vinicius Araujo">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{image}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{image}">

<!-- Icons -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Inter+Tight:wght@500&amp;family=Archivo+Black&amp;display=swap" rel="stylesheet">

<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/custom.css">
<script src="/js/main.js" defer></script>
</head>
'''


def esc(s):
    return html.escape(str(s), quote=True)


def slugify(name):
    s = re.sub(r'[^a-zA-Z0-9]+', '-', name).strip('-').lower()
    return s[:60] or 'projeto'


def head(title, desc, path, domain, image):
    return HEAD_TMPL.format(title=esc(title), desc=esc(desc), url=esc(domain + path),
                            image=esc(domain + image if image.startswith('/') else image))


def media_html(m, alt='', lazy=True):
    """m: dict com kind ('image'|'video'), src (jpg/mp4), webp?, poster?, width, height."""
    w, h = m.get('width'), m.get('height')
    size = f' width="{w}" height="{h}"' if w and h else ''
    if m['kind'] == 'video':
        poster = f' poster="{esc(m["poster"])}"' if m.get('poster') else ''
        return (f'<video src="{esc(m["src"])}"{poster}{size} muted loop playsinline preload="none" '
                f'data-autoplay aria-label="{esc(alt)}"></video>')
    load = ' loading="lazy" decoding="async"' if lazy else ' fetchpriority="high" decoding="async"'
    src = f'<source srcset="{esc(m["webp"])}" type="image/webp">' if m.get('webp') else ''
    return f'<picture>{src}<img src="{esc(m["src"])}" alt="{esc(alt)}"{size}{load}></picture>'


def figure_html(m, c0, c1, alt='', lazy=True):
    ar = f'{m["width"]}/{m["height"]}' if m.get('width') and m.get('height') else '16/9'
    return f'<figure class="ph" style="grid-column:{c0}/{c1};aspect-ratio:{ar}">{media_html(m, alt, lazy)}</figure>'


def card_html(href, title, meta, cover, level=2, alt=''):
    """cover: dict de mídia (image/video). Card com proporção fixa 4:5."""
    tag = f'h{level}'
    return (f'<a class="card" href="{esc(href)}">'
            f'<figure class="cv">{media_html(cover, alt or title)}</figure>'
            f'<div class="card-t"><{tag}>{esc(title)}</{tag}><p>{esc(meta)}</p></div></a>')


def gallery_rows(media, alts):
    """Distribui a mídia num grid de 12 colunas, em ritmo editorial."""
    patterns2 = [((1, 7), (7, 13)), ((2, 7), (7, 12)), ((1, 5), (5, 13)), ((1, 9), (9, 13))]
    patterns3 = [((1, 5), (5, 9), (9, 13)), ((1, 4), (4, 9), (9, 13))]
    rows, i, p = [], 0, 0
    if media:
        rows.append([figure_html(media[0], 1, 13, alts[0], lazy=False)])
        i = 1
    while i < len(media):
        left = len(media) - i
        if left == 1:
            rows.append([figure_html(media[i], 3, 11, alts[i])])
            i += 1
            continue
        use3 = left >= 3 and p % 3 == 2
        pat = patterns3[(p // 3) % len(patterns3)] if use3 else patterns2[p % len(patterns2)]
        rows.append([figure_html(media[i + k], c0, c1, alts[i + k]) for k, (c0, c1) in enumerate(pat)])
        i += len(pat)
        p += 1
    out = []
    for r in rows:
        out.append('    <div class="row">\n      ' + '\n      '.join(r) + '\n    </div>')
    return '\n\n'.join(out)


def cover_html(m, alt=''):
    """Capa do projeto: largura total, proporção original."""
    if not m:
        return '<figure class="ph" style="aspect-ratio:16/9"></figure>'
    ar = f'{m["width"]}/{m["height"]}' if m.get('width') and m.get('height') else '16/9'
    return f'<figure class="ph" style="aspect-ratio:{ar}">{media_html(m, alt, lazy=False)}</figure>'


def mosaic_html(media, alts):
    """Galeria em mosaico justificado: cada item guarda a proporção em --ar (o layout é feito no main.js)."""
    out = []
    for m, a in zip(media, alts):
        ar = round(m['width'] / m['height'], 4) if m.get('width') and m.get('height') else 1.5
        out.append(f'<figure class="ph" style="--ar:{ar}">{media_html(m, a)}</figure>')
    return '\n    '.join(out)


def project_page(*, cat, slug, title, intro, meta, media, alts, domain, header, footer, image):
    path = f'/{cat}/{slug}/'
    cat_title = CATEGORIES[cat]['title']
    meta_html = ''.join(f'<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>' for k, v in meta)
    cover = cover_html(media[0] if media else None, alts[0] if alts else title)
    mosaic = mosaic_html(media[1:], alts[1:])
    return (head(f'{title} – Vinicius Araujo', intro, path, domain, image) + f'''<body class="page-proj">
<a class="skip" href="#main">Skip to content</a>

{header}

<main id="main" class="proj">
  <section class="proj-head">
    <p class="crumb"><a href="/{cat}/">{esc(cat_title)}</a></p>
    <h1 class="proj-title">{esc(title)}</h1>
    <div class="proj-info">
      <p class="proj-intro">{esc(intro)}</p>
      <dl class="proj-meta">{meta_html}</dl>
    </div>
  </section>

  <section class="proj-cover" aria-label="Cover">
    {cover}
  </section>

  <section class="mosaic" aria-label="Gallery">
    {mosaic}
  </section>

  <nav class="proj-nav" aria-label="More projects" data-cat="/{cat}/"></nav>
</main>

{footer}
</body>
</html>
''')


def category_page(*, cat, cards, domain, header, footer, image):
    c = CATEGORIES[cat]
    items = '\n    '.join(cards)
    return (head(f'{c["title"]} – Vinicius Araujo', c['intro'], f'/{cat}/', domain, image) + f'''<body class="page-cat">
<a class="skip" href="#main">Skip to content</a>

{header}

<main id="main" class="cat">
  <section class="cat-head">
    <h1 class="cat-title">{esc(c["title"])}</h1>
    <p class="cat-intro">{esc(c["intro"])}</p>
  </section>

  <div class="cards" data-cat="{cat}">
    {items}
  </div>
  <p class="empty">New projects coming soon.</p>
</main>

{footer}
</body>
</html>
''')


def page_path_to_file(site_dir, path):
    """'/works/sony/' -> <site>/works/sony/index.html (ou None se inválido)."""
    p = path.split('?')[0]
    if not p.startswith('/') or '..' in p:
        return None
    if p.endswith('/'):
        p += 'index.html'
    full = os.path.normpath(os.path.join(site_dir, p.lstrip('/')))
    if not full.startswith(os.path.normpath(site_dir) + os.sep) or not full.endswith('.html'):
        return None
    return full


def list_pages(site_dir):
    """Todas as páginas editáveis, como caminhos de URL."""
    pages = []
    for dp, dn, fn in os.walk(site_dir):
        dn[:] = [d for d in dn if d not in ('assets', 'css', 'js')]
        if 'index.html' in fn:
            rel = os.path.relpath(dp, site_dir).replace(os.sep, '/')
            pages.append('/' if rel == '.' else f'/{rel}/')
    return sorted(pages, key=lambda p: (p.count('/'), p))


HIDDEN_META = '<meta name="robots" content="noindex, nofollow">'


def is_hidden(file):
    """Projeto escondido (ainda não divulgado): fica fora do sitemap e do carrossel."""
    with open(file, encoding='utf-8') as fh:
        return HIDDEN_META in fh.read(6000)


def page_title(file):
    with open(file, encoding='utf-8') as fh:
        m = re.search(r'<title>(.*?)</title>', fh.read(4000), re.S)
    return html.unescape(m.group(1)).replace(' – Vinicius Araujo', '').strip() if m else ''


def write_sitemap(site_dir):
    idx = os.path.join(site_dir, 'index.html')
    domain = 'https://viniciusaraujova.com'
    if os.path.exists(idx):
        with open(idx, encoding='utf-8') as fh:
            m = re.search(r'<link rel="canonical" href="(https?://[^"/]+)', fh.read())
        if m:
            domain = m.group(1)
    import time
    today = time.strftime('%Y-%m-%d')
    urls = ''.join(f'  <url>\n    <loc>{esc(domain + p)}</loc>\n    <lastmod>{today}</lastmod>\n  </url>\n' for p in list_pages(site_dir)
                   if not is_hidden(page_path_to_file(site_dir, p)))
    with open(os.path.join(site_dir, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')


SHARED_BLOCKS = (
    re.compile(r'<header class="bar"[^>]*>.*?</header>', re.S),
    re.compile(r'<footer class="foot"[^>]*>.*?</footer>', re.S),
)


def sync_shared(site_dir, saved_file, saved_html):
    """Cabeçalho e rodapé são iguais em todas as páginas: propaga a versão salva."""
    blocks = [rx.search(saved_html) for rx in SHARED_BLOCKS]
    changed = 0
    for p in list_pages(site_dir):
        f = page_path_to_file(site_dir, p)
        if not f or os.path.normcase(f) == os.path.normcase(saved_file):
            continue
        with open(f, encoding='utf-8') as fh:
            t = fh.read()
        new = t
        for rx, b in zip(SHARED_BLOCKS, blocks):
            if b:
                new = rx.sub(lambda _m: b.group(0), new, count=1)
        if new != t:
            tmp = f + '.tmp'
            with open(tmp, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(new)
            os.replace(tmp, f)
            changed += 1
    return changed


CAROUSEL_CATS = ('works', 'art')
CAROUSEL_SHORT_SIDE = 560


def build_carousel(site_dir):
    """Lista de todas as imagens dos projetos de Works e Art (inclui capas de vídeo), em versões leves,
    para o carrossel aleatório da home: assets/carousel/*.webp + assets/carousel.json."""
    import json
    try:
        from PIL import Image
    except ImportError:
        return 0
    out_dir = os.path.join(site_dir, 'assets', 'carousel')
    os.makedirs(out_dir, exist_ok=True)
    urls, keep = [], set()
    for p in list_pages(site_dir):
        m = re.match(r'^/(%s)/([^/]+)/$' % '|'.join(CAROUSEL_CATS), p)
        if not m or is_hidden(page_path_to_file(site_dir, p)):
            continue
        slug = m.group(2)
        with open(page_path_to_file(site_dir, p), encoding='utf-8') as fh:
            t = fh.read()
        start = t.find('class="proj-cover"')
        body = t[start:] if start >= 0 else t
        srcs = re.findall(r'<source srcset="([^"]+)"', body) + re.findall(r'poster="([^"]+)"', body)
        seen = set()
        for u in srcs:
            if not u.startswith('/') or u in seen:
                continue
            seen.add(u)
            src = os.path.join(site_dir, *u.lstrip('/').split('/'))
            if not os.path.exists(src):
                continue
            name = slug + '--' + os.path.splitext(os.path.basename(u))[0] + '.webp'
            dest = os.path.join(out_dir, name)
            keep.add(name)
            if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(src):
                with Image.open(src) as im:
                    im = im.convert('RGB')
                    k = CAROUSEL_SHORT_SIDE / min(im.size)
                    if k < 1:
                        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
                    im.save(dest, quality=74, method=6)
            urls.append('/assets/carousel/' + name)
    for f in os.listdir(out_dir):
        if f not in keep:
            os.remove(os.path.join(out_dir, f))
    with open(os.path.join(site_dir, 'assets', 'carousel.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(urls, fh, indent=0)
    return len(urls)
