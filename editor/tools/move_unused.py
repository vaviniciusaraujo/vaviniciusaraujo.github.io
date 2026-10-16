"""Move as fotos e vídeos das pastas de origem (works/, art/, lab/) que NÃO são usados no site
para "Not in use/", mantendo a mesma estrutura de pastas. Nada é apagado.

Uso: python editor/tools/move_unused.py          (simulação: só mostra o que faria)
     python editor/tools/move_unused.py --apply  (move de verdade)

Um arquivo de origem conta como "em uso" quando a versão otimizada dele aparece em alguma página
do site. Se o mesmo take existe em mais de uma cópia, fica a da pasta Selecteds (ou a maior)
e as outras vão para "Not in use".
"""
import collections
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import import_projects as IP  # noqa: E402

ROOT = IP.ROOT
SITE = IP.SITE
DEST = os.path.join(ROOT, 'Not in use')
SOURCES = ('works', 'art', 'lab')
MEDIA = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.tif', '.tiff', '.mp4', '.mov', '.m4v', '.webm', '.avi'}


def used_stems():
    """Nomes-base dos arquivos de mídia que as páginas do site usam."""
    stems = set()
    rx = re.compile(r'/assets/projects/[^/"\'\s]+/([^"\'\s/]+?)\.(?:jpg|jpeg|png|webp|mp4|gif)')
    for dp, dn, fn in os.walk(SITE):
        dn[:] = [d for d in dn if d != 'assets']
        for f in fn:
            if f.endswith('.html'):
                with open(os.path.join(dp, f), encoding='utf-8', errors='ignore') as fh:
                    for s in rx.findall(fh.read()):
                        stems.add(re.sub(r'-card$', '', s))
    return stems


def main(apply):
    used = used_stems()
    by_stem = collections.defaultdict(list)
    others = []
    for src in SOURCES:
        for dp, dn, fn in os.walk(os.path.join(ROOT, src)):
            for f in fn:
                p = os.path.join(dp, f)
                if os.path.splitext(f)[1].lower() not in MEDIA:
                    continue
                stem = IP.short(f)
                # projetos trazidos do Behance: "01_hash.jpg" virou "<projeto>-01" no site
                nb = re.match(r'(\d+)_', f)
                if stem not in used and nb:
                    folder = os.path.relpath(p, os.path.join(ROOT, src)).split(os.sep)[0]
                    stem = f'{IP.T.slugify(folder)}-{nb.group(1)}'
                if stem in used:
                    by_stem[stem].append(p)
                else:
                    others.append(p)
    keep, move = [], list(others)
    for stem, files in by_stem.items():
        files.sort(key=lambda p: ('selected' in p.lower(), os.path.getsize(p)), reverse=True)
        keep.append(files[0])
        move += files[1:]

    size = sum(os.path.getsize(p) for p in move)
    per = collections.Counter(os.path.relpath(p, ROOT).split(os.sep)[0] + '/' + os.path.relpath(p, ROOT).split(os.sep)[1] for p in move)
    print(f'Em uso no site (ficam): {len(keep)} arquivos')
    print(f'Para "Not in use": {len(move)} arquivos, {size / 1e9:.2f} GB')
    for k, v in sorted(per.items()):
        print(f'   {v:4d}  {k}')
    if not apply:
        print('\n(simulação — nada foi movido; rode com --apply para mover)')
        return
    for p in move:
        rel = os.path.relpath(p, ROOT)
        dst = os.path.join(DEST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.exists(dst):
            base, ext = os.path.splitext(dst)
            n = 2
            while os.path.exists(f'{base} ({n}){ext}'):
                n += 1
            dst = f'{base} ({n}){ext}'
        shutil.move(p, dst)
    # remove pastas que ficaram vazias nas origens
    removed = 0
    for src in SOURCES:
        for dp, dn, fn in os.walk(os.path.join(ROOT, src), topdown=False):
            if dp != os.path.join(ROOT, src) and not os.listdir(dp):
                os.rmdir(dp)
                removed += 1
    print(f'\nMovidos {len(move)} arquivos para "{DEST}". Pastas vazias removidas: {removed}.')


if __name__ == '__main__':
    main('--apply' in sys.argv)
