"""Monta a seção "Selected works" da home no estilo editorial (grid assimétrico),
com 3 imagens de cada projeto, tiradas das páginas dos projetos.

Uso: python editor/tools/home_feature.py
Depois disso, edite pela home no editor (é o mesmo grid das páginas de projeto).
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, '..', '..', 'portfolio'))

FEATURE = ['/works/microsoft-surface-2026/', '/works/oura-2025/', '/works/nike-2025/',
           '/art/porsche-landscape/', '/works/sony/', '/lab/fluid/']

# Três ritmos que se alternam: (tipo, colunas, proporção)
PATTERNS = [
    [('ph', 1, 4, '4/5'), ('ph', 4, 6, '1/1.05'), ('ph', 6, 10, '16/9'), ('lab', 10, 13, None)],
    [('lab', 2, 5, None), ('ph', 5, 7, '1/1'), ('ph', 7, 10, '4/5'), ('ph', 10, 13, '3/4')],
    [('ph', 1, 3, '1/1'), ('lab', 3, 6, None), ('ph', 6, 9, '4/5'), ('ph', 9, 13, '16/9')],
]
CAT_NAMES = {'works': 'Works', 'art': 'Art', 'lab': 'Lab'}


def read(p):
    with open(p, encoding='utf-8') as fh:
        return fh.read()


def project_info(path):
    t = read(os.path.join(SITE, path.strip('/').replace('/', os.sep), 'index.html'))
    title = html.unescape(re.search(r'<h1 class="proj-title"[^>]*>(.*?)</h1>', t, re.S).group(1))
    title = re.sub(r'<[^>]+>', '', title).strip()
    intro = re.sub(r'<[^>]+>', '', html.unescape(re.search(r'<p class="proj-intro"[^>]*>(.*?)</p>', t, re.S).group(1))).strip()
    meta = dict((re.sub(r'<[^>]+>', '', k).strip(), re.sub(r'<[^>]+>', '', v).strip())
                for k, v in re.findall(r'<dt[^>]*>(.*?)</dt><dd[^>]*>(.*?)</dd>', t, re.S))
    start = t.find('class="proj-cover"')
    gallery = t[start if start >= 0 else t.find('class="works gallery"'):]
    figs = re.findall(r'<figure class="ph"[^>]*>(.*?)</figure>', gallery, re.S)
    imgs = [f for f in figs if '<picture' in f]
    vids = [f for f in figs if '<video' in f]
    # imagens primeiro; completa com vídeos se o projeto tiver poucas imagens
    pick = (imgs[1:] + imgs[:1] if len(imgs) > 3 else imgs) + vids
    pick = [re.sub(r' fetchpriority="high"', ' loading="lazy"', f) for f in pick[:3]]
    return title, intro, meta, pick


def build():
    rows = []
    for i, path in enumerate(FEATURE):
        title, intro, meta, media = project_info(path)
        cat = CAT_NAMES[path.split('/')[1]]
        year = meta.get('Year', '')
        sub = ' · '.join(x for x in (cat, year) if x)
        cells, k = [], 0
        for kind, c0, c1, ar in PATTERNS[i % len(PATTERNS)]:
            if kind == 'lab':
                cells.append(
                    f'<div class="lab" style="grid-column:{c0}/{c1}">'
                    f'<h3><a href="{path}">{html.escape(title)}</a><em>{html.escape(sub)}</em></h3>'
                    f'<p>{html.escape(intro)}<a class="go" href="{path}">View project →</a></p></div>')
            elif k < len(media):
                cells.append(f'<figure class="ph" data-href="{path}" style="grid-column:{c0}/{c1};aspect-ratio:{ar}">{media[k]}</figure>')
                k += 1
        rows.append('    <div class="row">\n      ' + '\n      '.join(cells) + '\n    </div>')
    return ('<section class="works feat-grid" id="works" aria-labelledby="feat-title">\n'
            '    <div class="feat-h"><h2 class="sect" id="feat-title">Selected works</h2>'
            '<a class="more" href="/works/">All works →</a></div>\n\n'
            + '\n\n'.join(rows) + '\n  </section>')


def main():
    p = os.path.join(SITE, 'index.html')
    t = read(p)
    rx = re.compile(r'<section class="(?:feat|works feat-grid)"[^>]*>.*?</section>', re.S)
    if not rx.search(t):
        raise SystemExit('Seção de destaques não encontrada na home.')
    t = rx.sub(lambda _m: build(), t, count=1)
    with open(p, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(t)
    print('Home atualizada com', len(FEATURE), 'projetos.')


if __name__ == '__main__':
    main()
