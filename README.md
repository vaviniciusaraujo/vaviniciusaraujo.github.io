# Vinicius Araujo — Portfolio

Site: **https://vaviniciusaraujo.github.io**

- `portfolio/` — o site (HTML, CSS, JS e mídia). É o que vai para o ar.
- `editor/` — editor visual local (`python editor/server.py`, abre em http://localhost:8080).
- `.github/workflows/pages.yml` — publica `portfolio/` no GitHub Pages a cada `git push` na branch `main`.

As pastas de renders originais (`works/`, `art/`, `lab/`) ficam só no computador e não entram no repositório.

## Atualizar o site

1. Edite pelo editor (atalho **Editar site**) e salve.
2. Envie para o GitHub:

```
git add -A
git commit -m "Atualiza o site"
git push
```

Em ~1 minuto o site no ar é atualizado.
