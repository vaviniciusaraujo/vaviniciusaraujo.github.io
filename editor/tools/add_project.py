"""Adiciona UM projeto novo ao site, sem regerar os outros (preserva as edições feitas no editor).

Uso:
  python editor/tools/add_project.py "works/Oura Ring 2026" --title "Oura Ring 2026" --client Oura --year 2026 \
         --cover DandelionBlowing --intro "Texto..." [--all-videos] [--first]

- otimiza imagens (WebP + JPG) e vídeos (H.264 sem áudio + capa), igual ao import_projects.py
- cria /<categoria>/<slug>/index.html (capa + galeria)
- coloca o card na página da categoria (no fim, ou no começo com --first)
- atualiza sitemap e a lista do carrossel
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import import_projects as IP  # noqa: E402
import select_media as SM  # noqa: E402
import site_templates as T  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('key', help='pasta de origem, ex.: "works/Oura Ring 2026"')
    ap.add_argument('--title', required=True)
    ap.add_argument('--slug')
    ap.add_argument('--client', default='')
    ap.add_argument('--year', default='')
    ap.add_argument('--role', default='3D Artist')
    ap.add_argument('--cover', default='', help='trecho do nome do arquivo da capa')
    ap.add_argument('--intro', default='Short description of the project.')
    ap.add_argument('--all-videos', action='store_true', help='inclui todos os vídeos (sem o limite de 6)')
    ap.add_argument('--first', action='store_true', help='card no começo da lista')
    a = ap.parse_args()

    cat, folder = a.key.split('/', 1)
    slug = a.slug or T.slugify(a.title)
    page_file = os.path.join(IP.SITE, cat, slug, 'index.html')
    if os.path.exists(page_file):
        raise SystemExit(f'Já existe uma página em /{cat}/{slug}/ — escolha outro --slug.')

    if a.all_videos:
        SM.MAX_VID = 99
    plan = {a.key: SM.plan_project(cat, folder)}
    IP.log(f'Convertendo mídia de {a.key}…')
    media, alts, card, cover = IP.build_project(plan, a.key, slug, a.title, a.cover)

    home = IP.read(os.path.join(IP.SITE, 'index.html'))
    domain = re.search(r'<link rel="canonical" href="(https?://[^"/]+)', home).group(1)
    header = T.SHARED_BLOCKS[0].search(home).group(0)
    footer = T.SHARED_BLOCKS[1].search(home).group(0)
    meta = ([('Client', a.client)] if a.client else []) + ([('Year', a.year)] if a.year else []) + [('Role', a.role)] + ([('Direction, Design & Animation', 'ManvsMachine')] if cat == 'works' else [])
    img = cover['poster'] if cover['kind'] == 'video' else cover['src']
    IP.write(page_file, T.project_page(cat=cat, slug=slug, title=a.title, intro=a.intro, meta=meta, media=media,
                                       alts=alts, domain=domain, header=header, footer=footer, image=img))

    client = a.client if a.client not in (a.title, 'Personal') else ''
    line = ' · '.join(x for x in (client, a.year) if x)
    card_html = T.card_html(f'/{cat}/{slug}/', a.title, line, card, level=2)
    cat_file = os.path.join(IP.SITE, cat, 'index.html')
    t = IP.read(cat_file)
    m = re.search(r'(<div class="cards"[^>]*>)(.*?)(\n\s*</div>\s*\n\s*<p class="empty">)', t, re.S)
    if not m:
        raise SystemExit('Lista de cards não encontrada na página da categoria.')
    body = m.group(2)
    body = ('\n    ' + card_html + body) if a.first else (body.rstrip() + '\n    ' + card_html)
    IP.write(cat_file, t[:m.start(2)] + body + t[m.end(2):])

    T.write_sitemap(IP.SITE)
    T.build_carousel(IP.SITE)
    import responsive_images  # versões 480/960/1440 + srcset
    responsive_images.main()
    IP.log(f'Pronto: /{cat}/{slug}/ ({len(media)} mídias) e card em /{cat}/')


if __name__ == '__main__':
    main()
