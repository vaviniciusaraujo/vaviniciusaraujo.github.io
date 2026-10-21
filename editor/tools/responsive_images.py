"""Gera versões menores (480/960/1440 px) das imagens WebP dos projetos e coloca srcset+sizes no HTML,
para cada tela baixar só o tamanho que precisa. A imagem original continua no srcset (telas grandes/retina).

Uso: python editor/tools/responsive_images.py      (pode rodar quantas vezes quiser; só faz o que falta)
"""
import glob
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import import_projects as IP  # noqa: E402

SITE = IP.SITE
WIDTHS = (480, 960, 1440)
QUALITY = 82
RX = re.compile(r'<source srcset="(/assets/projects/[^"\s,]+)\.webp" type="image/webp">')


def variants(url):
    """Cria as versões menores (se ainda não existem) e devolve o valor do srcset."""
    base = os.path.join(SITE, url.lstrip('/').replace('/', os.sep))
    src = base + '.jpg' if os.path.exists(base + '.jpg') else base + '.webp'
    with Image.open(base + '.webp') as im:
        w0, h0 = im.size
    parts = []
    for w in WIDTHS:
        if w >= w0 * .9:
            continue
        out = f'{base}-{w}.webp'
        if not os.path.exists(out):
            with Image.open(src) as im:
                im = im.convert('RGB')
                im.resize((w, round(h0 * w / w0)), Image.LANCZOS).save(out, quality=QUALITY, method=6)
        parts.append(f'{url}-{w}.webp {w}w')
    parts.append(f'{url}.webp {w0}w')
    return ', '.join(parts)


def sizes_for(page, html, pos):
    rel = os.path.relpath(page, SITE).replace(os.sep, '/')
    if rel == 'index.html':                                   # home: grid de destaques
        return '(max-width:760px) 100vw, 34vw'
    if rel == 'works/index.html':                             # lista Works: miniatura no hover / grid no celular
        return '(hover:hover) and (min-width:761px) 250px, 100vw'
    if rel == 'art/index.html':                               # folhas empilhadas em 2 colunas
        return '(max-width:760px) 100vw, 46vw'
    if rel == 'lab/index.html':                               # folhas empilhadas
        return '(max-width:760px) 100vw, 60vw'
    m = html.find('<section class="mosaic"')
    if m == -1 or pos < m:                                    # capa do projeto
        return '100vw'
    return '(max-width:760px) 100vw, 50vw'                    # galeria (mosaico)


def main():
    pages = [p for p in glob.glob(os.path.join(SITE, '**', '*.html'), recursive=True)]
    made, changed = 0, 0
    for page in pages:
        html = open(page, encoding='utf-8').read()
        out, last = [], 0
        for m in RX.finditer(html):
            url = m.group(1)
            if re.search(r'-(480|960|1440)$', url):
                continue
            before = len(glob.glob(os.path.join(SITE, url.lstrip('/')) + '-*.webp'))
            srcset = variants(url)
            made += len(glob.glob(os.path.join(SITE, url.lstrip('/')) + '-*.webp')) - before
            out.append(html[last:m.start()])
            out.append(f'<source srcset="{srcset}" sizes="{sizes_for(page, html, m.start())}" type="image/webp">')
            last = m.end()
        if out:
            out.append(html[last:])
            with open(page, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(''.join(out))
            changed += 1
    print(f'{changed} páginas atualizadas, {made} versões novas criadas')


if __name__ == '__main__':
    main()
