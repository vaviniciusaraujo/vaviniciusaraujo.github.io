"""Acrescenta mídia nova a um projeto que já existe, sem regerar a página (preserva edições).

Uso:
  python editor/tools/append_media.py lab/misc ARQ1.mp4 ARQ2.jpg ... [--cover TRECHO]

- otimiza cada arquivo (vídeo H.264 sem áudio + capa; imagem WebP + JPG)
- acrescenta no fim da galeria (mosaico) da página /<cat>/<slug>/
- --cover TRECHO: a mídia cujo nome contém TRECHO vira a capa do projeto (página e card);
  a capa anterior vai para o começo da galeria
"""
import argparse
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import import_projects as IP  # noqa: E402
import site_templates as T  # noqa: E402

ROOT = IP.ROOT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('page', help='ex.: lab/misc  (= /lab/misc/)')
    ap.add_argument('files', nargs='+', help='arquivos de origem (caminhos a partir da pasta site 2026)')
    ap.add_argument('--cover', default='')
    ap.add_argument('--replace', action='store_true', help='troca a galeria inteira pela mídia indicada (textos e ficha ficam)')
    ap.add_argument('--keep-card', action='store_true', help='não muda a capa do card na página da categoria')
    a = ap.parse_args()

    cat, slug = a.page.strip('/').split('/')
    page = os.path.join(IP.SITE, cat, slug, 'index.html')
    t = IP.read(page)
    title = html.unescape(re.search(r'<h1 class="proj-title"[^>]*>(.*?)</h1>', t, re.S).group(1))
    title = re.sub(r'<[^>]+>', '', title).strip()
    out = os.path.join(IP.SITE, 'assets', 'projects', slug)
    os.makedirs(out, exist_ok=True)

    new, cover = [], None
    for src in a.files:
        full = os.path.join(ROOT, src)
        name = IP.short(os.path.basename(src))
        if src.lower().endswith(('.mp4', '.mov')):
            m = IP.process_video(full, out, name, crf=27 if os.path.getsize(full) > 60e6 else 24)
        else:
            m = IP.process_image(full, out, name)
        m = {k: (IP.to_url(v) if k in ('src', 'webp', 'poster') and v else v) for k, v in m.items()}
        alt = IP.alt_text(title, src)
        if a.cover and a.cover.lower() in os.path.basename(src).lower() and cover is None:
            cover = (m, alt, full, name)
        else:
            new.append((m, alt))

    def fig(m, alt):
        ar = round(m['width'] / m['height'], 4) if m.get('width') and m.get('height') else 1.5
        return f'<figure class="ph" style="--ar:{ar}">{T.media_html(m, alt)}</figure>'

    mos = re.search(r'(<section class="mosaic"[^>]*>)(.*?)(\n\s*</section>)', t, re.S)
    if not mos:
        raise SystemExit('Galeria (mosaico) não encontrada na página.')
    body = '' if a.replace else mos.group(2)
    if cover:
        m, alt, full, name = cover
        cv = re.search(r'(<section class="proj-cover"[^>]*>\s*)(<figure class="ph"[^>]*>.*?</figure>)', t, re.S)
        old = cv.group(2)
        old_inner = re.sub(r'^<figure[^>]*>|</figure>$', '', old).replace(' fetchpriority="high"', ' loading="lazy"')
        ow = re.search(r'width="(\d+)" height="(\d+)"', old_inner)
        oar = round(int(ow.group(1)) / int(ow.group(2)), 4) if ow else 1.5
        if not a.replace:
            body = f'\n    <figure class="ph" style="--ar:{oar}">{old_inner}</figure>' + body
        t = t[:cv.start(2)] + T.cover_html(m, alt) + t[cv.end(2):]
        # card da categoria com a capa nova (vídeo curto para o card)
        if not a.keep_card:
            card = dict(m)
            if m['kind'] == 'video':
                card['src'] = IP.to_url(IP.card_video(os.path.join(IP.SITE, m['src'].lstrip('/')), out, name))
            cat_file = os.path.join(IP.SITE, cat, 'index.html')
            ct = IP.read(cat_file)
            rx = re.compile(r'(<a class="card" href="/' + re.escape(f'{cat}/{slug}/') + r'">\s*<figure class="cv"[^>]*>)(.*?)(</figure>)', re.S)
            ct, n = rx.subn(lambda mm: mm.group(1) + T.media_html(card, title) + mm.group(3), ct, count=1)
            if n:
                IP.write(cat_file, ct)
        img = m['poster'] if m['kind'] == 'video' else m['src']
        t = re.sub(r'(<meta (?:property="og:image"|name="twitter:image") content="https?://[^/"]+)[^"]*"', lambda mm: mm.group(1) + img + '"', t)
        mos = re.search(r'(<section class="mosaic"[^>]*>)(.*?)(\n\s*</section>)', t, re.S)
    body = body.rstrip() + ''.join('\n    ' + fig(m, alt) for m, alt in new)
    t = t[:mos.start(2)] + body + t[mos.end(2):]
    IP.write(page, t)
    T.build_carousel(IP.SITE)
    IP.log(f'/{cat}/{slug}/: +{len(new) + (1 if cover else 0)} mídias' + (' (capa nova)' if cover else ''))


if __name__ == '__main__':
    main()
