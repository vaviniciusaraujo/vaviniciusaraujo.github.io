"""Escolhe a mídia de cada projeto a partir das pastas works/ art/ lab/.
Agrupa versões do mesmo take (v001, v002...) e fica com a mais recente.
Gera plan.json (usado pelo import_projects.py)."""
import json, os, re, sys, collections

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
CATS = ('works', 'art', 'lab')
IMG = ('.jpg', '.jpeg', '.png')
VID = ('.mp4', '.mov')
SKIP = re.compile(r'tmp|blockout|concept|_bw\b', re.I)
MAX_VID, MAX_IMG = 6, 8
MAX_IMG_ART = 12

def norm(name):
    s = os.path.splitext(name)[0].lower().replace(' ', '_').replace('%20', '_')
    s = re.sub(r'[._-]redshift_rop\d*', '', s)
    s = re.sub(r'rs_camera', '_camera', s)
    s = re.sub(r'[_-]v\d+([_-]\d+)?', '', s)
    s = re.sub(r'[_-]?(still|comp|crop|rev|mb|re\b|rop1)\w*', '', s)
    s = re.sub(r'\(\d+\)', '', s)
    s = re.sub(r'[-_]+\d*$', '', s)
    return s.strip('_-')

def version(name):
    vs = re.findall(r'v(\d+)', name, re.I)
    return int(vs[0]) if vs else 0

def plan_project(cat, folder):
    path = os.path.join(ROOT, cat, folder)
    groups = collections.defaultdict(list)
    for dp, dn, fn in os.walk(path):
        for f in fn:
            ext = os.path.splitext(f)[1].lower()
            if ext not in IMG + VID or SKIP.search(f):
                continue
            p = os.path.join(dp, f)
            kind = 'video' if ext in VID else 'image'
            groups[(kind, norm(f))].append(p)
    picks = {'video': [], 'image': []}
    rest = {'video': [], 'image': []}
    for (kind, key), files in sorted(groups.items()):
        files = sorted(files, key=lambda p: (version(os.path.basename(p)), os.path.getsize(p)), reverse=True)
        picks[kind].append(os.path.relpath(files[0], ROOT))
        rest[kind].append([os.path.relpath(f, ROOT) for f in files[1:]])
    # séries (ex.: v3...v12 de renders diferentes): completa com outras versões
    for kind, minimum in (('image', MAX_IMG_ART if cat == 'art' else 8), ('video', 3)):
        i = 0
        while len(picks[kind]) < minimum and any(rest[kind]):
            lst = rest[kind][i % len(rest[kind])]
            if lst:
                picks[kind].append(lst.pop(0))
            i += 1
    # vídeos maiores primeiro (normalmente os takes principais), depois limita
    picks['video'].sort(key=lambda p: -os.path.getsize(os.path.join(ROOT, p)))
    mi = MAX_IMG_ART if cat == 'art' else MAX_IMG
    return {'video': picks['video'][:MAX_VID], 'image': picks['image'][:mi],
            'skipped': {'video': picks['video'][MAX_VID:], 'image': picks['image'][mi:]}}

def main():
    out = {}
    for cat in CATS:
        d = os.path.join(ROOT, cat)
        if not os.path.isdir(d):
            continue
        for folder in sorted(os.listdir(d)):
            if os.path.isdir(os.path.join(d, folder)):
                out[f'{cat}/{folder}'] = plan_project(cat, folder)
    dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'plan.json')
    with open(dest, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    for k, v in out.items():
        print(f"{k}: {len(v['video'])} vídeos, {len(v['image'])} imagens (fora: {len(v['skipped']['video'])}v {len(v['skipped']['image'])}i)")

if __name__ == '__main__':
    main()
