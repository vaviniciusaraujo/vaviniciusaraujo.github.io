"""Importa os projetos das pastas works/ art/ lab/ para o site.

- comprime vídeos (H.264, sem áudio, até 1920px) e gera capa (poster)
- otimiza imagens (WebP + JPG, até 2000px), remove duplicatas
- cria /works/, /art/, /lab/ e uma página por projeto
- reorganiza a home (destaques) e move os estilos para css/custom.css

Uso: python editor/tools/import_projects.py   (roda de novo sem refazer mídia já convertida)
"""
import io
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageOps, ImageStat
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import site_templates as T  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SITE = os.path.join(ROOT, 'portfolio')
FF = imageio_ffmpeg.get_ffmpeg_exe()

PROJECTS = [
    # chave do plan.json, slug, título, cliente, ano, capa (trecho do nome do arquivo), texto
    ('works/Microsoft Surface 2026', 'microsoft-surface-2026', 'Microsoft Surface 2026', 'Microsoft', '2026', 'MSF_edit15_sh040',
     'X-ray product visualization: the internal components of the laptop revealed in transparent view.'),
    ('works/Oura 2025', 'oura-2025', 'Oura 2025', 'Oura', '2025', 'SilverRing_Anim',
     'Close-ups of the smart ring on fabric and foam, in soft light, and the product placed in home settings at the end of the day.'),
    ('works/Nike 2025', 'nike-2025', 'Nike 2025', 'Nike', '2025', 'LittleBubbles_v005',
     'Foam simulations and material studies: bubbles, pressure, merging and growth.'),
    ('works/Sony', 'sony', 'Sony', 'Sony', '', 'NoiseCancelling_v004',
     'Headphones visualization: noise cancelling, clear calls and sound quality, from x-ray views to architectural sets.'),
    ('works/Solero Post', 'solero', 'Solero', 'Solero', '', 'Solero_Sun',
     'Look development for Solero: fruit swirls, a melting sun and ice-cream surfaces.'),
    ('works/tuft and needle', 'tuft-and-needle', 'Tuft & Needle', 'Tuft & Needle', '', 'T&N_scene_VA_09_1',
     'Material and product studies for Tuft & Needle: wood, foam and fabric.'),
    ('works/Michelob', 'michelob-ultra', 'Michelob Ultra', 'Michelob Ultra', '', 'Can_Exploration_v006',
     'Can explorations for Michelob Ultra: frost, fluid, pour and spin studies.'),
    ('works/volkswagen', 'volkswagen', 'Volkswagen', 'Volkswagen', '', 'VW_VA_RnD_v010_still02',
     'Abstract light and surface studies for Volkswagen.'),
    ('works/Microsoft Surface 2025', 'microsoft-surface-2025', 'Microsoft Surface 2025', 'Microsoft', '2025', 'AluminumUnwrinkling',
     'Material studies for Microsoft Surface: cloth dynamics, aluminium and packshots.'),
    ('works/rayban', 'ray-ban', 'Ray-Ban', 'Ray-Ban', '', 'MS_VA_rnd_v005_still03',
     'Motion-blur studies for Ray-Ban glasses.'),
    ('art/Porsche Landscape', 'porsche-landscape', 'Porsche Landscape', 'Personal', '', 'PorscheLandscape_v6',
     'A 911 crossing an impossible terrain made entirely of grass.'),
    ('art/Abstract 2021', 'abstract-2021', 'Abstract 2021', 'Personal', '2021', 'Abstract_VA_2021_04-2',
     'Still lifes of invented materials and objects: fur, glass, foam and coral-like forms.'),
    ('art/organic 2022', 'organic-2022', 'Organic 2022', 'Personal', '2022', 'OrganicShapeVA_2022_v4',
     'Studies of organic structures: coral, lattices and growth patterns.'),
    ('art/Volume Rock', 'volume-rock', 'Volume Rock', 'Personal', '', 'RockVolumeFog_ViniciusAraujo_01',
     'One rock, lit through coloured volumes of light and fog.'),
    ('lab/cloth', 'cloth', 'Cloth', 'Personal', '', 'Weavesbends_01', 'Cloth and fibre simulations.'),
    ('lab/fluid', 'fluid', 'Fluid', 'Personal', '', 'MixFluid01', 'Fluid simulations: viscous liquids, drips and pours.'),
    ('lab/grains', 'grains', 'Grains', 'Personal', '', 'VellumPeeloff', 'Grain and particle simulations.'),
    ('lab/pyro', 'pyro', 'Pyro', 'Personal', '', 'Burn1_v1', 'Fire and smoke simulations.'),
    ('lab/misc', 'misc', 'Misc', 'Personal', '', 'Heightfiled Advec', 'Assorted tests and experiments.'),
]
FEATURED = ['microsoft-surface-2026', 'oura-2025', 'nike-2025', 'sony']
ROLE = '3D Artist'


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ mídia
def probe(path):
    err = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True, errors='replace').stderr
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    s = re.search(r'Video:.*?(\d{2,5})x(\d{2,5})', err)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    return dur, (int(s.group(1)), int(s.group(2))) if s else (0, 0)


def frame(path, t):
    data = subprocess.run([FF, '-v', 'error', '-ss', f'{t:.2f}', '-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
                          capture_output=True, timeout=120).stdout
    return Image.open(io.BytesIO(data)).convert('RGB') if data else None


def save_image(im, base, max_side=2000):
    im = im.copy()
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    im.save(base + '.webp', quality=80, method=6)
    im.save(base + '.jpg', quality=84, optimize=True, progressive=True)
    return im.size


def dhash(im):
    g = im.convert('L').resize((9, 8), Image.LANCZOS)
    px = list(g.get_flattened_data() if hasattr(g, 'get_flattened_data') else g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def process_video(src, out_dir, name, crf=24):
    mp4 = os.path.join(out_dir, name + '.mp4')
    dur, (w, h) = probe(src)
    if not os.path.exists(mp4):
        log(f'    vídeo  {os.path.basename(src)}  ({os.path.getsize(src) / 1e6:.1f} MB, {dur:.0f}s)')
        subprocess.run([FF, '-y', '-v', 'error', '-i', src, '-an', '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264',
                        '-crf', str(crf), '-preset', 'medium', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                        '-movflags', '+faststart', mp4], check=True)
    poster = os.path.join(out_dir, name)
    if not os.path.exists(poster + '.jpg'):
        cands = [f for f in (frame(src, dur * k) for k in (0.15, 0.35, 0.55, 0.75)) if f]
        best = max(cands, key=lambda im: sum(ImageStat.Stat(im).stddev) + sum(ImageStat.Stat(im).mean) * .3)
        save_image(best, poster, 1920)
    _, (ow, oh) = probe(mp4)
    return {'kind': 'video', 'src': mp4, 'poster': poster + '.jpg', 'width': ow or w, 'height': oh or h}


def card_video(src_mp4, out_dir, name):
    out = os.path.join(out_dir, name + '-card.mp4')
    if not os.path.exists(out):
        dur, _ = probe(src_mp4)
        start = f'{dur * .15:.2f}' if dur > 4 else '0'
        subprocess.run([FF, '-y', '-v', 'error', '-ss', start, '-i', src_mp4, '-t', '8', '-an', '-vf', 'scale=720:-2', '-c:v', 'libx264',
                        '-crf', '27', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], check=True)
    return out


def process_image(src, out_dir, name):
    base = os.path.join(out_dir, name)
    if os.path.exists(base + '.jpg'):
        with Image.open(base + '.jpg') as im:
            size = im.size
    else:
        log(f'    imagem {os.path.basename(src)}')
        with Image.open(src) as im:
            size = save_image(ImageOps.exif_transpose(im).convert('RGB'), base)
    return {'kind': 'image', 'src': base + '.jpg', 'webp': base + '.webp', 'width': size[0], 'height': size[1]}


def short(name):
    s = os.path.splitext(name)[0]
    s = re.sub(r'(?i)\.?redshift_rop\d*', '', s)
    return T.slugify(s)[:48]


def alt_text(title, src):
    s = os.path.splitext(os.path.basename(src))[0]
    s = re.sub(r'(?i)^[a-z]{2,5}_va_|^[a-z]{2,5}_|redshift_rop\d*|_v\d+.*$|_still.*$', '', s)
    s = re.sub(r'([a-z])([A-Z])', r'\1 \2', s).replace('_', ' ').strip()
    return f'{title} – {s}' if s else title


def to_url(path):
    return '/' + os.path.relpath(path, SITE).replace(os.sep, '/')


def build_project(plan, key, slug, title, cover_hint):
    p = plan[key]
    out = os.path.join(SITE, 'assets', 'projects', slug)
    os.makedirs(out, exist_ok=True)
    log(f'  {title}')
    vids, imgs, seen = [], [], []
    for src in p['video']:
        full = os.path.join(ROOT, src)
        big = os.path.getsize(full) > 60e6
        vids.append((src, process_video(full, out, short(os.path.basename(src)), crf=27 if big else 24)))
    for src in p['image']:
        full = os.path.join(ROOT, src)
        with Image.open(full) as im:
            h = dhash(im)
        if any(bin(h ^ o).count('1') <= 6 for o in seen):
            log(f'    (duplicada, ignorada) {os.path.basename(src)}')
            continue
        seen.append(h)
        imgs.append((src, process_image(full, out, short(os.path.basename(src)))))
    allm = vids + imgs
    cover = next((m for s, m in allm if cover_hint.lower() in s.lower()), allm[0][1])
    # ordem: capa primeiro, depois intercala vídeo / imagem
    rest_v = [m for s, m in vids if m is not cover]
    rest_i = [m for s, m in imgs if m is not cover]
    order = [cover]
    while rest_v or rest_i:
        if rest_v:
            order.append(rest_v.pop(0))
        if rest_i:
            order.append(rest_i.pop(0))
        if rest_i and len(order) % 3 == 0:
            order.append(rest_i.pop(0))
    srcs = {id(m): s for s, m in allm}
    alts = [alt_text(title, srcs[id(m)]) for m in order]
    card = dict(cover)
    if cover['kind'] == 'video':
        card['src'] = card_video(cover['src'], out, short(os.path.basename(srcs[id(cover)])))
    urlify = lambda m: {k: (to_url(v) if k in ('src', 'webp', 'poster') and v else v) for k, v in m.items()}
    return [urlify(m) for m in order], alts, urlify(card), urlify(cover)


# ------------------------------------------------------------------ home / blocos comuns
def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


NAV = '<nav aria-label="Main"><a href="/works/">Works</a>, <a href="/art/">Art</a>, <a href="/lab/">Lab</a>, <a href="/about/">About</a></nav>'


def shared_blocks(home):
    header = T.SHARED_BLOCKS[0].search(home).group(0)
    footer = T.SHARED_BLOCKS[1].search(home).group(0)
    header = re.sub(r'<nav aria-label="Main">.*?</nav>', NAV, header, flags=re.S)
    header = header.replace('<a href="#top">Vinicius Araujo</a>', '<a href="/">Vinicius Araujo</a>')
    return header, footer


def migrate_custom_css(home):
    """Leva os estilos do editor (<style id=ve-custom>) para /css/custom.css, compartilhado por todas as páginas."""
    m = re.search(r'\n?<style id="ve-custom">(.*?)</style>', home, re.S)
    css = m.group(1).strip() if m else ''
    home = home.replace(m.group(0), '') if m else home
    home = re.sub(r'\n?<link rel="stylesheet" href="[^"]*" data-ve-font="[^"]*">', '', home)
    # aspas nas famílias (o navegador as removia) + carrega as fontes do Google usadas
    fams = set(re.findall(r'font-family:\s*"?([A-Z][\w ]+?)"?,', css))
    imports = []
    for f in sorted(fams):
        css = re.sub(r'font-family:\s*"?' + re.escape(f) + r'"?,', f'font-family:"{f}",', css)
        weights = {'Fraunces': '300;400;500;600;700;800;900'}.get(f, '400;500;600;700')
        imports.append(f'@import url("https://fonts.googleapis.com/css2?family={f.replace(" ", "+")}:wght@{weights}&display=swap");')
    path = os.path.join(SITE, 'css', 'custom.css')
    if not os.path.exists(path) or css:
        write(path, '/* Estilos criados pelo editor visual (painel Estilos). Gerado automaticamente. */\n'
              + '\n'.join(imports) + ('\n' if imports else '') + css + ('\n' if css else ''))
    return home


def update_home(home, header, footer, featured_cards):
    home = migrate_custom_css(home)
    # caminhos absolutos (a home fica igual às outras páginas)
    for a, b in (('href="favicon.ico"', 'href="/favicon.ico"'), ('href="assets/', 'href="/assets/'),
                 ('href="site.webmanifest"', 'href="/site.webmanifest"'), ('href="css/style.css"', 'href="/css/style.css"'),
                 ('src="js/main.js"', 'src="/js/main.js"'), ('srcset="assets/', 'srcset="/assets/'), ('src="assets/', 'src="/assets/')):
        home = home.replace(a, b)
    home = re.sub(r'(data-images=")([^"]*)"', lambda m: m.group(1) + ', '.join('/' + u.strip().lstrip('/') for u in m.group(2).split(',') if u.strip()) + '"', home)
    if '/css/custom.css' not in home:
        home = home.replace('<link rel="stylesheet" href="/css/style.css">', '<link rel="stylesheet" href="/css/style.css">\n<link rel="stylesheet" href="/css/custom.css">')
    home = T.SHARED_BLOCKS[0].sub(lambda _m: header, home, count=1)
    home = T.SHARED_BLOCKS[1].sub(lambda _m: footer, home, count=1)
    feat = ('<section class="feat" id="works" aria-labelledby="feat-title">\n'
            '    <div class="feat-h"><h2 class="sect" id="feat-title">Selected works</h2><a class="more" href="/works/">All works →</a></div>\n'
            '    <div class="cards">\n      ' + '\n      '.join(featured_cards) + '\n    </div>\n  </section>')
    # troca as seções de grid antigas da home pelos destaques
    start = home.find('<!-- Works')
    end = home.find('<!-- About')
    if start < 0 or end < 0:
        start = home.find('<section class="works"')
        end = home.find('<section class="grey"')
    if 'class="feat"' not in home and start > 0 and end > start:
        home = home[:start] + '<!-- Selected works ------------------------------------------------------ -->\n  ' + feat + '\n\n  ' + home[end:]
    if 'class="page-home"' not in home:
        home = home.replace('<body>', '<body class="page-home">', 1)
    return home


def main():
    plan = json.load(open(os.path.join(HERE, 'plan.json'), encoding='utf-8'))
    home_path = os.path.join(SITE, 'index.html')
    home = read(home_path)
    domain = re.search(r'<link rel="canonical" href="(https?://[^"/]+)', home).group(1)
    header, footer = shared_blocks(home)

    log('Convertendo mídia (a primeira vez demora alguns minutos)…')
    built = {}
    for key, slug, title, client, year, cover_hint, intro in PROJECTS:
        if key not in plan:
            continue
        cat = key.split('/')[0]
        media, alts, card, cover = build_project(plan, key, slug, title, cover_hint)
        built[slug] = dict(cat=cat, slug=slug, title=title, client=client, year=year, intro=intro,
                           media=media, alts=alts, card=card, cover=cover)
    if '--media-only' in sys.argv:
        log('Mídia pronta (páginas não foram geradas).')
        return

    log('Gerando páginas…')
    for b in built.values():
        meta = [('Client', b['client'])] + ([('Year', b['year'])] if b['year'] else []) + [('Role', ROLE)]
        img = b['cover']['poster'] if b['cover']['kind'] == 'video' else b['cover']['src']
        write(os.path.join(SITE, b['cat'], b['slug'], 'index.html'),
              T.project_page(cat=b['cat'], slug=b['slug'], title=b['title'], intro=b['intro'], meta=meta, media=b['media'],
                             alts=b['alts'], domain=domain, header=header, footer=footer, image=img))

    def meta_line(b):
        client = b['client'] if b['client'] not in (b['title'], 'Personal') else ''
        return ' · '.join(x for x in (client, b['year']) if x)

    for cat in T.CATEGORIES:
        cards = [T.card_html(f'/{cat}/{b["slug"]}/', b['title'], meta_line(b), b['card'], level=2)
                 for b in built.values() if b['cat'] == cat]
        write(os.path.join(SITE, cat, 'index.html'),
              T.category_page(cat=cat, cards=cards, domain=domain, header=header, footer=footer, image='/assets/og-image.jpg'))

    featured = [T.card_html(f'/{built[s]["cat"]}/{s}/', built[s]['title'], meta_line(built[s]), built[s]['card'], level=3)
                for s in FEATURED if s in built]
    write(home_path, update_home(home, header, footer, featured))

    nf = os.path.join(SITE, '404.html')
    t = read(nf)
    t = re.sub(r'<nav aria-label="Main">.*?</nav>', NAV, t, flags=re.S)
    if '/css/custom.css' not in t:
        t = t.replace('<link rel="stylesheet" href="/css/style.css">', '<link rel="stylesheet" href="/css/style.css">\n<link rel="stylesheet" href="/css/custom.css">')
    write(nf, t)

    T.write_sitemap(SITE)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fn in os.walk(os.path.join(SITE, 'assets', 'projects')) for f in fn)
    log(f'Pronto. {len(built)} projetos, mídia dos projetos: {total / 1e6:.0f} MB')


if __name__ == '__main__':
    main()
