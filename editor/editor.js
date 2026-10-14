/* Editor visual do portfolio — carregado só pelo servidor local (editor/server.py).
   Funciona em qualquer página do site. Mantém duas cópias da página: a que você vê
   (com animações rodando) e uma cópia "limpa" do HTML. Cada edição é aplicada nas
   duas; ao salvar, só a cópia limpa vai para o arquivo. Estilos do painel ficam em
   /css/custom.css, compartilhado por todas as páginas. */
(function () {
  'use strict';
  var D = document;

  // 1) Numera os elementos ANTES de main.js mexer na página (este script roda primeiro).
  var liveAll = D.body.querySelectorAll('*');
  for (var i = 0; i < liveAll.length; i++) liveAll[i].setAttribute('data-eid', i);
  var nextId = liveAll.length;
  D.documentElement.classList.add('ve-on');

  var PAGE = location.pathname;
  var PAGE_TYPE = D.body.classList.contains('page-proj') ? 'proj'
    : D.body.classList.contains('page-cat') ? 'cat'
    : (PAGE === '/' || PAGE === '/index.html') ? 'home' : 'other';
  var CAT = (PAGE.match(/^\/(works|art|lab)\//) || [])[1] || '';

  var src = null, baseMtime = '', dirty = false, carouselChanged = false, pendingDomain = null, saving = false;

  var TEXT_SEL = '.bar p, .bar nav, .sub p, .hero h1 .ln, .works .sect, .feat .sect, .feat .more, .lab h3, .lab p, .grey p, .grey li, .foot p, ' +
    '.cat-title, .cat-intro, .empty, .card h2, .card h3, .card p, .crumb, .proj-title, .proj-intro, .proj-meta dt, .proj-meta dd';
  var SINGLE_SEL = '.hero h1 .ln, .works .sect, .feat .sect, .feat .more, .lab h3, .grey li, .bar nav, .sub p, .foot p, .grey .big, ' +
    '.cat-title, .empty, .card h2, .card h3, .card p, .crumb, .proj-title, .proj-meta dt, .proj-meta dd';
  var ITEM_SEL = '.works .row > .ph, .works .row > .lab, .cards > .card, .proj-cover > .ph, .mosaic > .ph';
  var ASPECTS = [['1/1', 'Quadrado 1:1'], ['4/5', 'Retrato 4:5'], ['3/4', 'Retrato 3:4'], ['2/3', 'Retrato 2:3'],
    ['1/1.05', 'Quase quadrado (alto)'], ['1/.95', 'Quase quadrado (largo)'], ['4/3', 'Paisagem 4:3'],
    ['3/2', 'Paisagem 3:2'], ['16/9', 'Paisagem 16:9'], ['21/9', 'Panorâmico 21:9']];

  // ---------------------------------------------------------------- helpers
  function S(el) { return el && src.querySelector('[data-eid="' + el.getAttribute('data-eid') + '"]'); }
  function L(id) { return D.querySelector('[data-eid="' + id + '"]'); }
  function both(el, fn) { fn(el); var s = S(el); if (s) fn(s); }
  function h(tag, attrs, kids) {
    var e = D.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function markDirty() { dirty = true; updateStatus(); schedulePhone(); }

  /* HTML com ids novos (iguais nas duas cópias). */
  function withIds(html) {
    var tpl = D.createElement('template');
    tpl.innerHTML = html.trim();
    tpl.content.querySelectorAll('*').forEach(function (n) { n.setAttribute('data-eid', nextId++); });
    var div = D.createElement('div'); div.appendChild(tpl.content);
    return div.innerHTML;
  }
  /* Insere o mesmo HTML nas duas cópias. Retorna o elemento vivo. */
  function insertHTML(ref, where, html) {
    var out = withIds(html), id = out.match(/data-eid="(\d+)"/)[1];
    S(ref).insertAdjacentHTML(where, out);
    ref.insertAdjacentHTML(where, out);
    var live = L(id);
    enhance(live);
    playVideos(live);
    markDirty();
    return live;
  }
  function setInner(el, html) {
    var out = withIds(html);
    S(el).innerHTML = out; el.innerHTML = out;
    enhance(el); playVideos(el); markDirty();
  }
  function removeEl(el) { both(el, function (e) { e.remove(); }); markDirty(); hideToolbars(); }
  function moveEl(el, dir, okSibling) {
    var sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sib || (okSibling && !okSibling(sib))) return toast(dir < 0 ? 'Já está no começo' : 'Já está no fim');
    var s = S(el), ss = S(sib);
    if (dir < 0) { sib.before(el); ss.before(s); } else { sib.after(el); ss.after(s); }
    markDirty(); refreshToolbars();
  }
  function setStyle(el, prop, val) { both(el, function (e) { e.style[prop] = val; }); markDirty(); }
  function setAttr(el, name, val) { both(el, function (e) { if (val == null) e.removeAttribute(name); else e.setAttribute(name, val); }); markDirty(); }
  function playVideos(root) {
    (root.matches && root.matches('video') ? [root] : [].slice.call(root.querySelectorAll('video'))).forEach(function (v) {
      v.muted = true; v.loop = true; v.play().catch(function () {});
    });
  }

  // ---------------------------------------------------------------- load clean copy + estilos
  Promise.all([
    fetch(PAGE + '?raw', { cache: 'no-store' }).then(function (r) { baseMtime = r.headers.get('X-Mtime') || ''; return r.text(); }),
    fetch('/css/custom.css', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
  ]).then(function (res) {
    src = new DOMParser().parseFromString(res[0], 'text/html');
    var all = src.body.querySelectorAll('*');
    if (all.length !== liveAll.length) return fatal('A estrutura da página não bate (' + all.length + ' × ' + liveAll.length + '). Recarregue a página.');
    for (var i = 0; i < all.length; i++) {
      if (all[i].tagName !== liveAll[i].tagName) return fatal('A estrutura da página não bate. Recarregue a página.');
      all[i].setAttribute('data-eid', i);
    }
    init(res[1]);
  }).catch(function (e) { fatal('Não foi possível carregar a página: ' + e.message); });

  function fatal(msg) {
    D.body.appendChild(h('div', { class: 've-ui ve-fatal', text: 'Editor: ' + msg }));
  }

  // ---------------------------------------------------------------- text editing
  function enhance(root) {
    [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (el) {
      if (el.matches && el.matches(TEXT_SEL)) { el.contentEditable = 'true'; el.spellcheck = false; }
    });
  }

  function syncText(el) {
    var s = S(el);
    if (!s) return;
    s.innerHTML = el.innerHTML;
    // remove lixo que o navegador às vezes cria ao apagar/colar
    s.querySelectorAll('span:not([data-eid]), font').forEach(function (n) { n.replaceWith.apply(n, n.childNodes); });
    s.querySelectorAll('[style]:not([data-eid])').forEach(function (n) { n.removeAttribute('style'); });
    s.querySelectorAll('[class*="ve-"]').forEach(function (n) {
      [].slice.call(n.classList).forEach(function (c) { if (c.indexOf('ve-') === 0) n.classList.remove(c); });
      if (!n.classList.length) n.removeAttribute('class');
    });
    if (el.matches('.hero h1 .ln')) dispatchEvent(new Event('resize'));
    markDirty();
  }

  function onInput(e) {
    var el = e.target.closest && e.target.closest('[contenteditable="true"][data-eid]');
    if (el) syncText(el);
  }

  function listUnit(host) {
    if (host.matches('.grey li')) return { el: host, html: '<li>Novo item</li>', name: 'item' };
    var m = host.closest('.proj-meta > div');
    if (m) return { el: m, html: '<div><dt>Label</dt><dd>Value</dd></div>', name: 'campo' };
    return null;
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    var el = e.target.closest && e.target.closest('[contenteditable="true"][data-eid]');
    if (!el) return;
    if (e.key === 'Escape') { el.blur(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      var u = listUnit(el);
      if (u && u.name === 'item') { selectAll(insertHTML(u.el, 'afterend', u.html)); return; }
      if (el.matches(SINGLE_SEL)) { el.blur(); return; }
      D.execCommand('insertLineBreak');
    }
  }

  function onPaste(e) {
    var el = e.target.closest && e.target.closest('[contenteditable="true"][data-eid]');
    if (!el) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    if (el.matches(SINGLE_SEL)) { D.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' ')); return; }
    text.split(/\r?\n/).forEach(function (line, i) {
      if (i) D.execCommand('insertLineBreak');
      if (line) D.execCommand('insertText', false, line);
    });
  }

  function selectAll(el) {
    el.focus();
    var r = D.createRange(); r.selectNodeContents(el);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  // Barra de texto: link e itens de lista
  var textBar;
  function updateTextBar() {
    var sel = getSelection();
    var node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    var host = node && node.closest('[contenteditable="true"][data-eid]');
    if (!host || !D.activeElement || !D.activeElement.contains(node)) { textBar.hidden = true; return; }
    var a = node.closest('a');
    var u = listUnit(host);
    textBar.innerHTML = '';
    if (a && host.contains(a)) textBar.appendChild(btn('Editar link', function () { editLink(a); }));
    if (u) {
      textBar.appendChild(btn('+ ' + u.name[0].toUpperCase() + u.name.slice(1), function () {
        var n = insertHTML(u.el, 'afterend', u.html);
        selectAll(n.querySelector('dt') || n);
      }));
      textBar.appendChild(btn('Remover ' + u.name, function () {
        if (u.el.parentElement.children.length < 2) return toast('A lista precisa de pelo menos um ' + u.name);
        removeEl(u.el);
      }));
    }
    if (!textBar.children.length) { textBar.hidden = true; return; }
    textBar.hidden = false;
    var r = host.getBoundingClientRect();
    place(textBar, r.left, r.top - textBar.offsetHeight - 6);
  }
  function editLink(a) {
    var v = prompt('Endereço do link (ex.: https://…, mailto:email@…, /works/ ou #secao)', a.getAttribute('href') || '');
    if (v == null) return;
    setAttr(a, 'href', v.trim());
    var host = a.closest('[contenteditable="true"]');
    if (host) syncText(host);
  }

  // ---------------------------------------------------------------- toolbars
  var itemBar, rowBar, sectBar, hov = { item: null, row: null, sect: null }, hideT = 0;

  function btn(label, fn, title, cls) {
    return h('button', { type: 'button', class: 've-b' + (cls ? ' ' + cls : ''), title: title || label, text: label,
      on: { mousedown: function (e) { e.preventDefault(); }, click: function (e) { e.preventDefault(); e.stopPropagation(); fn(e); } } });
  }
  function sep() { return h('span', { class: 've-sep' }); }
  function place(el, x, y) {
    var w = el.offsetWidth, hh = el.offsetHeight;
    x = Math.max(6, Math.min(innerWidth - w - 6 - (panelOpen ? PANEL_W : 0), x));
    y = Math.max(6, Math.min(innerHeight - hh - 70, y));
    el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  function cols(el) {
    var m = (el.style.gridColumn || '').match(/(\d+)\s*\/\s*(\d+)/);
    return m ? [+m[1], +m[2]] : [1, 4];
  }
  function setCols(el, a, b) { setStyle(el, 'gridColumn', a + '/' + b); refreshToolbars(); }
  function nextCols(row, span) {
    var end = 1;
    [].forEach.call(row.children, function (c) { end = Math.max(end, cols(c)[1]); });
    return end + span <= 13 ? [end, end + span] : [1, 1 + span];
  }
  function mediaEl(fig) { return fig.querySelector('video') || fig.querySelector('img'); }

  function buildItemBar(item) {
    itemBar.innerHTML = '';
    if (item.classList.contains('card')) return buildCardBar(item);
    if (item.parentElement.matches('.mosaic, .proj-cover')) return buildFreeBar(item);
    var isPh = item.classList.contains('ph');
    var c = cols(item);
    var media = isPh && mediaEl(item);
    var isVid = media && media.tagName === 'VIDEO';
    itemBar.appendChild(h('span', { class: 've-lbl', text: isPh ? (isVid ? 'Vídeo' : 'Imagem') : 'Texto' }));
    itemBar.appendChild(btn('◀', function () { moveEl(item, -1); }, 'Trocar de lugar com o anterior'));
    itemBar.appendChild(btn('▶', function () { moveEl(item, 1); }, 'Trocar de lugar com o próximo'));
    itemBar.appendChild(sep());
    itemBar.appendChild(btn('⇤', function () { var c = cols(item); if (c[0] > 1) setCols(item, c[0] - 1, c[1] - 1); }, 'Mover uma coluna para a esquerda'));
    itemBar.appendChild(btn('⇥', function () { var c = cols(item); if (c[1] < 13) setCols(item, c[0] + 1, c[1] + 1); }, 'Mover uma coluna para a direita'));
    itemBar.appendChild(btn('−', function () { var c = cols(item); if (c[1] - c[0] > 1) setCols(item, c[0], c[1] - 1); }, 'Diminuir largura'));
    itemBar.appendChild(h('span', { class: 've-lbl', title: 'Largura em colunas (de 12)', text: (c[1] - c[0]) + '/12' }));
    itemBar.appendChild(btn('+', function () { var c = cols(item); if (c[1] < 13) setCols(item, c[0], c[1] + 1); else if (c[0] > 1) setCols(item, c[0] - 1, c[1]); }, 'Aumentar largura'));
    if (isPh) {
      itemBar.appendChild(sep());
      itemBar.appendChild(aspectSelect(item, 've-sel'));
      itemBar.appendChild(sep());
      itemBar.appendChild(btn('Trocar', function () { pickFiles(false, function (f) { replaceMedia(item, f[0]); }); }, 'Trocar por outra imagem ou vídeo'));
      itemBar.appendChild(btn('Alt', function () { editAlt(item); }, 'Descrição (acessibilidade e Google)'));
    }
    itemBar.appendChild(sep());
    itemBar.appendChild(btn('Excluir', function () { if (confirm(isPh ? 'Excluir esta mídia?' : 'Excluir este bloco de texto?')) removeEl(item); }, null, 've-danger'));
  }

  var MASKS = [['', 'Máscara: automática'], ['cine', 'Cinema 2.39:1'], ['wide', 'Horizontal 16:9'], ['land', 'Horizontal 3:2'],
    ['sq', 'Quadrado 1:1'], ['port', 'Vertical 4:5'], ['tall', 'Vertical 2:3']];
  function maskSelect(fig, cls, onChange) {
    var sel = h('select', { class: cls, title: 'Máscara (recorte) desta mídia no mosaico' });
    MASKS.forEach(function (m) { sel.appendChild(h('option', { value: m[0], text: m[1] })); });
    sel.value = fig.getAttribute('data-fmt') || '';
    sel.addEventListener('change', function () { setAttr(fig, 'data-fmt', sel.value || null); if (onChange) onChange(); refreshToolbars(); });
    return sel;
  }

  /* Mídia da capa ou do mosaico (sem colunas: o tamanho vem da proporção da imagem). */
  function buildFreeBar(item) {
    var cover = item.parentElement.matches('.proj-cover');
    var m = mediaEl(item), isVid = m && m.tagName === 'VIDEO';
    itemBar.appendChild(h('span', { class: 've-lbl', text: cover ? 'Capa' : (isVid ? 'Vídeo' : 'Imagem') }));
    if (!cover) {
      itemBar.appendChild(btn('◀', function () { moveEl(item, -1); }, 'Mover para trás'));
      itemBar.appendChild(btn('▶', function () { moveEl(item, 1); }, 'Mover para frente'));
      itemBar.appendChild(sep());
      itemBar.appendChild(maskSelect(item, 've-sel'));
      itemBar.appendChild(sep());
    } else {
      itemBar.appendChild(aspectSelect(item, 've-sel'));
      itemBar.appendChild(sep());
    }
    itemBar.appendChild(btn(m ? 'Trocar' : 'Adicionar', function () { pickFiles(false, function (f) { replaceMedia(item, f[0]); }); }, 'Trocar por outra imagem ou vídeo'));
    if (m) itemBar.appendChild(btn('Alt', function () { editAlt(item); }, 'Descrição (acessibilidade e Google)'));
    if (!cover) {
      itemBar.appendChild(btn('Usar como capa', function () { swapWithCover(item); }, 'Troca esta mídia com a capa do projeto'));
      itemBar.appendChild(sep());
      itemBar.appendChild(btn('Excluir', function () { if (confirm('Excluir esta mídia da galeria?')) removeEl(item); }, null, 've-danger'));
    }
  }
  function sizeOf(fig) {
    var m = mediaEl(fig);
    var w = m && +m.getAttribute('width'), hh = m && +m.getAttribute('height');
    return w && hh ? [w, hh] : null;
  }
  function stripIds(html) { return html.replace(/ data-eid="\d+"/g, '').replace(/ class="ve-[^"]*"/g, ''); }
  function swapWithCover(item) {
    var cover = D.querySelector('.proj-cover > .ph');
    if (!cover) return;
    var a = stripIds(item.innerHTML), b = stripIds(cover.innerHTML);
    var sa = sizeOf(item), sb = sizeOf(cover);
    setInner(cover, a.replace(/ loading="lazy"/, ' fetchpriority="high"'));
    setInner(item, b.replace(/ fetchpriority="high"/, ' loading="lazy"'));
    if (sa) setStyle(cover, 'aspectRatio', sa[0] + '/' + sa[1]);
    if (sb) both(item, function (e) { e.style.setProperty('--ar', +(sb[0] / sb[1]).toFixed(4)); });
    markDirty(); refreshToolbars(); toast('Capa trocada');
  }

  function aspectSelect(item, cls) {
    var cur = (item.style.aspectRatio || '').replace(/\s/g, '');
    var sel = h('select', { class: cls, title: 'Formato' });
    var opts = ASPECTS.slice(), m = mediaEl(item);
    var nw = m && (m.naturalWidth || m.videoWidth), nh = m && (m.naturalHeight || m.videoHeight);
    if (nw) opts.unshift([nw + '/' + nh, 'Original']);
    if (cur && !opts.some(function (a) { return a[0] === cur; })) opts.unshift([cur, cur]);
    opts.forEach(function (a) { sel.appendChild(h('option', { value: a[0], text: a[1] })); });
    sel.value = cur;
    sel.addEventListener('change', function () { setStyle(item, 'aspectRatio', sel.value); refreshToolbars(); });
    return sel;
  }

  function editAlt(fig) {
    var m = mediaEl(fig);
    if (!m) return;
    var attr = m.tagName === 'VIDEO' ? 'aria-label' : 'alt';
    var v = prompt('Descrição (para acessibilidade e Google):', m.getAttribute(attr) || '');
    if (v != null) { both(m, function (e) { e.setAttribute(attr, v.trim()); }); markDirty(); }
  }

  function buildCardBar(card) {
    var title = (card.querySelector('h2, h3') || {}).textContent || 'projeto';
    itemBar.appendChild(h('span', { class: 've-lbl', text: 'Card' }));
    itemBar.appendChild(btn('◀', function () { moveEl(card, -1); }, 'Mover para trás'));
    itemBar.appendChild(btn('▶', function () { moveEl(card, 1); }, 'Mover para frente'));
    itemBar.appendChild(sep());
    itemBar.appendChild(btn('Trocar capa', function () { pickFiles(false, function (f) { replaceMedia(card.querySelector('.cv'), f[0]); }); }, 'Imagem ou vídeo da capa'));
    itemBar.appendChild(btn('Abrir ↗', function () { goTo(card.getAttribute('href')); }, 'Abrir a página do projeto'));
    itemBar.appendChild(sep());
    if (PAGE_TYPE === 'cat') {
      itemBar.appendChild(btn('Excluir projeto', function () { deleteProject(card, title); }, 'Manda a página e a mídia para a lixeira do editor', 've-danger'));
    } else {
      itemBar.appendChild(btn('Tirar', function () { if (confirm('Tirar “' + title + '” desta lista? (o projeto continua existindo)')) removeEl(card); }, 'Remover este card desta página', 've-danger'));
    }
  }

  function buildRowBar(row) {
    rowBar.innerHTML = '';
    rowBar.appendChild(h('span', { class: 've-lbl', text: 'Linha' }));
    rowBar.appendChild(btn('+ Mídia', function () { pickFiles(true, function (fs) { addMedia(row, fs); }); }, 'Adicionar imagens ou vídeos'));
    rowBar.appendChild(btn('+ Texto', function () {
      var c = nextCols(row, 3);
      var lab = insertHTML(row, 'beforeend', '<div class="lab" style="grid-column:' + c[0] + '/' + c[1] + '"><h3>Título<em>Categoria</em></h3><p>Descrição.</p></div>');
      selectAll(lab.querySelector('h3'));
    }));
    rowBar.appendChild(sep());
    var isRow = function (s) { return s.classList.contains('row'); };
    rowBar.appendChild(btn('↑', function () { moveEl(row, -1, isRow); }, 'Subir linha'));
    rowBar.appendChild(btn('↓', function () { moveEl(row, 1, isRow); }, 'Descer linha'));
    rowBar.appendChild(btn('Excluir', function () { if (confirm('Excluir esta linha inteira?')) removeEl(row); }, 'Excluir linha', 've-danger'));
  }

  function addRow(sect) {
    var row = insertHTML(sect, 'beforeend', '<div class="row"><div class="lab" style="grid-column:1/4"><h3>Título<em>Categoria</em></h3><p>Descrição.</p></div></div>');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast('Linha criada — passe o mouse nela e use “+ Mídia”');
    return row;
  }

  function buildSectBar(sect) {
    sectBar.innerHTML = '';
    if (sect.classList.contains('mosaic')) {
      sectBar.appendChild(h('span', { class: 've-lbl', text: 'Galeria' }));
      sectBar.appendChild(btn('+ Mídia', function () { pickFiles(true, function (fs) { addToMosaic(sect, fs); }); }, 'Adicionar imagens ou vídeos à galeria'));
      sectBar.appendChild(btn('Nova variação', function () { setAttr(sect, 'data-seed', Math.random().toString(36).slice(2, 7)); toast('Nova composição — salve para manter'); }, 'Sorteia outra composição da galeria'));
      if (sect.hasAttribute('data-seed')) sectBar.appendChild(btn('Original', function () { setAttr(sect, 'data-seed', null); toast('Composição original desta página'); }, 'Volta à composição padrão desta página'));
      return;
    }
    var gallery = sect.classList.contains('gallery');
    sectBar.appendChild(h('span', { class: 've-lbl', text: gallery ? 'Galeria' : 'Seção' }));
    sectBar.appendChild(btn('+ Linha', function () { addRow(sect); }));
    if (gallery) return;
    var isSect = function (s) { return s.classList.contains('works'); };
    sectBar.appendChild(btn('↑', function () { moveEl(sect, -1, isSect); }, 'Subir seção'));
    sectBar.appendChild(btn('↓', function () { moveEl(sect, 1, isSect); }, 'Descer seção'));
    sectBar.appendChild(btn('Excluir', function () { if (confirm('Excluir esta seção inteira?')) removeEl(sect); }, 'Excluir seção', 've-danger'));
  }

  function refreshToolbars() {
    if (hov.sect && D.contains(hov.sect)) {
      buildSectBar(hov.sect); sectBar.hidden = false;
      var rs = hov.sect.getBoundingClientRect();
      place(sectBar, rs.left + 6, Math.max(rs.top, 8) - 2);
    } else sectBar.hidden = true;
    if (hov.row && D.contains(hov.row)) {
      buildRowBar(hov.row); rowBar.hidden = false;
      var rr = hov.row.getBoundingClientRect();
      place(rowBar, rr.right - rowBar.offsetWidth - 6, rr.bottom - rowBar.offsetHeight - 6);
      D.querySelectorAll('.ve-row-hi').forEach(function (n) { n.classList.remove('ve-row-hi'); });
      hov.row.classList.add('ve-row-hi');
    } else { rowBar.hidden = true; D.querySelectorAll('.ve-row-hi').forEach(function (n) { n.classList.remove('ve-row-hi'); }); }
    if (hov.item && D.contains(hov.item)) {
      buildItemBar(hov.item); itemBar.hidden = false;
      var ri = hov.item.getBoundingClientRect();
      place(itemBar, ri.left + 6, ri.top + 6);
      D.querySelectorAll('.ve-item-hi').forEach(function (n) { n.classList.remove('ve-item-hi'); });
      hov.item.classList.add('ve-item-hi');
    } else { itemBar.hidden = true; D.querySelectorAll('.ve-item-hi').forEach(function (n) { n.classList.remove('ve-item-hi'); }); }
  }
  function hideToolbars() { hov = { item: null, row: null, sect: null }; refreshToolbars(); }

  function onOver(e) {
    if (e.target.closest('.ve-ui')) { clearTimeout(hideT); return; }
    if (D.activeElement && D.activeElement.classList && D.activeElement.classList.contains('ve-sel')) return;
    var t = e.target;
    var n = { item: t.closest(ITEM_SEL), row: t.closest('.works .row'), sect: t.closest('.works, .mosaic') };
    if (n.item === hov.item && n.row === hov.row && n.sect === hov.sect) { clearTimeout(hideT); return; }
    clearTimeout(hideT);
    if (!n.item && !n.row && !n.sect) { hideT = setTimeout(hideToolbars, 250); return; }
    hov = n; refreshToolbars();
  }

  // ---------------------------------------------------------------- mídia (imagens e vídeos)
  function pickFiles(multiple, cb) {
    var inp = h('input', { type: 'file', accept: 'image/*,video/mp4,video/quicktime,video/webm' });
    inp.multiple = !!multiple;
    inp.addEventListener('change', function () { if (inp.files.length) cb([].slice.call(inp.files)); });
    inp.click();
  }

  function upload(file) {
    var isVid = /^video\//.test(file.type);
    toast((isVid ? 'Enviando e comprimindo ' : 'Enviando ') + file.name + '…' + (isVid ? ' (vídeos podem levar um minuto)' : ''), true);
    return fetch('/api/upload', { method: 'POST', headers: { 'X-Editor': '1', 'X-Filename': encodeURIComponent(file.name), 'X-Page': encodeURIComponent(PAGE) }, body: file })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function (j) {
        if (j.width) return j;
        return new Promise(function (res) {
          if (j.kind === 'video') {
            var v = D.createElement('video'); v.preload = 'metadata';
            v.onloadedmetadata = function () { j.width = v.videoWidth; j.height = v.videoHeight; res(j); };
            v.onerror = function () { res(j); }; v.src = j.src;
          } else {
            var im = new Image(); im.onload = function () { j.width = im.naturalWidth; j.height = im.naturalHeight; res(j); };
            im.onerror = function () { res(j); }; im.src = j.src;
          }
        });
      })
      .catch(function (e) { toast(netMsg(e, 'Erro no envio: '), e instanceof TypeError); throw e; });
  }

  function mediaHTML(j, alt) {
    var size = j.width ? ' width="' + j.width + '" height="' + j.height + '"' : '';
    if (j.kind === 'video') {
      return '<video src="' + esc(j.src) + '"' + (j.poster ? ' poster="' + esc(j.poster) + '"' : '') + size +
        ' muted loop playsinline preload="none" data-autoplay aria-label="' + esc(alt) + '"></video>';
    }
    return '<picture>' + (j.webp ? '<source srcset="' + esc(j.webp) + '" type="image/webp">' : '') +
      '<img src="' + esc(j.src) + '" alt="' + esc(alt) + '"' + size + ' loading="lazy" decoding="async"></picture>';
  }
  function figureHTML(j, c, alt) {
    var ar = j.width && j.height ? j.width + '/' + j.height : '16/9';
    return '<figure class="ph" style="grid-column:' + c[0] + '/' + c[1] + ';aspect-ratio:' + ar + '">' + mediaHTML(j, alt) + '</figure>';
  }
  function altFromName(name) { return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(); }

  function addMedia(row, files) {
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return upload(f); }).then(function (j) {
        insertHTML(row, 'beforeend', figureHTML(j, nextCols(row, 4), altFromName(f.name)));
        toast(j.kind === 'video' ? 'Vídeo adicionado' : 'Imagem adicionada');
      });
    });
    chain.catch(function () {});
  }

  function addToMosaic(mosaic, files) {
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return upload(f); }).then(function (j) {
        var ar = j.width && j.height ? +(j.width / j.height).toFixed(4) : 1.5;
        var fig = insertHTML(mosaic, 'beforeend', '<figure class="ph" style="--ar:' + ar + '">' + mediaHTML(j, altFromName(f.name)) + '</figure>');
        fig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        toast(j.kind === 'video' ? 'Vídeo adicionado' : 'Imagem adicionada');
      });
    });
    chain.catch(function () {});
  }

  function replaceMedia(fig, file) {
    var old = mediaEl(fig);
    var alt = old ? (old.getAttribute('alt') || old.getAttribute('aria-label') || '') : altFromName(file.name);
    upload(file).then(function (j) {
      setInner(fig, mediaHTML(j, alt || altFromName(file.name)));
      if (j.width && j.height) {
        if (fig.parentElement.matches('.mosaic')) both(fig, function (e) { e.style.setProperty('--ar', +(j.width / j.height).toFixed(4)); });
        if (fig.parentElement.matches('.proj-cover')) setStyle(fig, 'aspectRatio', j.width + '/' + j.height);
      }
      toast(j.kind === 'video' ? 'Vídeo trocado' : 'Imagem trocada');
      refreshToolbars();
      if (picked === fig) renderPanel();
    }).catch(function () {});
  }

  // arrastar arquivos do computador para a página
  function dropTarget(t) {
    return t.closest && (t.closest('.cards .cv') || t.closest('.works .ph') || t.closest('.proj-cover .ph') || t.closest('.mosaic .ph') || t.closest('.works .row') || t.closest('.mosaic'));
  }
  function onDragOver(e) {
    if (!e.dataTransfer || [].indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
    e.preventDefault();
    var t = dropTarget(e.target);
    D.querySelectorAll('.ve-drop').forEach(function (n) { if (n !== t) n.classList.remove('ve-drop'); });
    if (t) t.classList.add('ve-drop');
    e.dataTransfer.dropEffect = t ? 'copy' : 'none';
  }
  function onDrop(e) {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    D.querySelectorAll('.ve-drop').forEach(function (n) { n.classList.remove('ve-drop'); });
    var files = [].filter.call(e.dataTransfer.files, function (f) { return /^(image|video)\//.test(f.type); });
    if (!files.length) return toast('Solte imagens (JPG, PNG, WebP) ou vídeos (MP4, MOV)');
    var t = dropTarget(e.target);
    if (!t) return toast('Solte sobre uma mídia (para trocar) ou sobre uma linha (para adicionar)');
    if (t.matches('.row')) addMedia(t, files);
    else if (t.matches('.mosaic')) addToMosaic(t, files);
    else if (t.parentElement.matches('.mosaic') && files.length > 1) addToMosaic(t.parentElement, files);
    else replaceMedia(t, files[0]);
  }

  // ---------------------------------------------------------------- páginas e projetos
  function goTo(path) {
    if (!path) return;
    if (!dirty) { location.href = path; return; }
    var close = modal('Alterações não salvas', h('div', { class: 've-mb' }, [h('p', { text: 'Salvar esta página antes de abrir a outra?' })]), [
      btn('Cancelar', function () { close(); }),
      btn('Abrir sem salvar', function () { dirty = false; location.href = path; }),
      btn('Salvar e abrir', function () { close(); save().then(function (ok) { if (ok) location.href = path; }); }, null, 've-primary')
    ]);
  }

  function pagesModal() {
    var body = h('div', { class: 've-mb' }, [h('p', { class: 've-help', text: 'Carregando…' })]);
    modal('Páginas do site', body);
    fetch('/api/pages', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      body.innerHTML = '';
      var list = h('div', { class: 've-pages' });
      j.pages.forEach(function (p) {
        var depth = p.path === '/' ? 0 : p.path.split('/').length - 2;
        var b = h('button', { type: 'button', class: 've-pg' + (p.path === PAGE ? ' is-on' : ''), style: 'padding-left:' + (12 + depth * 18) + 'px' }, [
          h('span', { text: p.path === '/' ? 'Home' : p.title }), h('em', { text: p.path })
        ]);
        b.addEventListener('click', function () { if (p.path !== PAGE) goTo(p.path); });
        list.appendChild(b);
      });
      body.appendChild(list);
    });
  }

  function newProject() {
    var name = prompt('Nome do novo projeto (' + CAT + '):', '');
    if (!name || !name.trim()) return;
    api('/api/create-project', { cat: CAT, title: name.trim() }).then(function (j) {
      var cards = D.querySelector('.cards');
      var card = insertHTML(cards, 'beforeend', '<a class="card" href="' + esc(j.path) + '"><figure class="cv"></figure>' +
        '<div class="card-t"><h2>' + esc(name.trim()) + '</h2><p>' + new Date().getFullYear() + '</p></div></a>');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return save(true).then(function (ok) {
        if (!ok) return;
        var close = modal('Projeto criado', h('div', { class: 've-mb' }, [
          h('p', { text: 'A página “' + name.trim() + '” foi criada em ' + j.path + '. Adicione a capa no card (“Trocar capa”) e a mídia dentro da página do projeto.' })
        ]), [btn('Ficar aqui', function () { close(); }), btn('Abrir o projeto', function () { location.href = j.path; }, null, 've-primary')]);
      });
    }).catch(function () {});
  }

  function deleteProject(card, title) {
    var path = card.getAttribute('href');
    if (!confirm('Excluir o projeto “' + title + '”?\n\nA página e a mídia vão para a pasta editor/lixeira (dá para recuperar de lá).')) return;
    removeEl(card);
    save(true).then(function (ok) {
      if (!ok) return;
      api('/api/delete-project', { path: path, exclude: PAGE }).then(function (j) { toast('Projeto movido para ' + j.trash); }).catch(function () {});
    });
  }

  function addFeatured() {
    var body = h('div', { class: 've-mb' }, [h('p', { class: 've-help', text: 'Carregando…' })]);
    var close = modal('Adicionar destaque', body);
    var have = {};
    D.querySelectorAll('.feat .card, .feat-grid .ph[data-href]').forEach(function (c) { have[c.getAttribute('href') || c.getAttribute('data-href')] = 1; });
    var grid = D.querySelector('.feat-grid');
    fetch('/api/pages', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      body.innerHTML = '';
      var projs = j.pages.filter(function (p) { return /^\/(works|art|lab)\/[^/]+\/$/.test(p.path) && !have[p.path]; });
      if (!projs.length) { body.appendChild(h('p', { class: 've-help', text: 'Todos os projetos já estão nos destaques.' })); return; }
      body.appendChild(h('p', { class: 've-help', text: 'Escolha o projeto. A capa usa a primeira mídia da galeria (dá para trocar depois).' }));
      var list = h('div', { class: 've-pages' });
      projs.forEach(function (p) {
        var b = h('button', { type: 'button', class: 've-pg' }, [h('span', { text: p.title }), h('em', { text: p.path })]);
        b.addEventListener('click', function () {
          fetch(p.path + '?raw', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
            var doc = new DOMParser().parseFromString(t, 'text/html');
            var title = (doc.querySelector('.proj-title') || {}).textContent || p.title;
            var dds = [].map.call(doc.querySelectorAll('.proj-meta dd'), function (d) { return d.textContent.trim(); });
            var meta = dds.slice(0, 2).filter(function (x) { return x && x !== '—' && x !== title; }).join(' · ');
            var m = doc.querySelector('.proj-cover .ph video, .proj-cover .ph picture, .gallery .ph video, .gallery .ph picture');
            var cover = m ? m.outerHTML.replace(/ fetchpriority="high"/, ' loading="lazy"') : '';
            if (grid) {
              insertHTML(grid, 'beforeend', featureRow(doc, p.path, title.trim(), grid.querySelectorAll('.row').length));
            } else {
              insertHTML(D.querySelector('.feat .cards'), 'beforeend', '<a class="card" href="' + esc(p.path) + '"><figure class="cv">' + cover + '</figure>' +
                '<div class="card-t"><h3>' + esc(title.trim()) + '</h3><p>' + esc(meta) + '</p></div></a>');
            }
            close(); toast('Destaque adicionado — salve para manter');
          });
        });
        list.appendChild(b);
      });
      body.appendChild(list);
    });
  }

  /* Linha da home no estilo editorial: texto + 3 imagens do projeto (mesmo ritmo do home_feature.py). */
  var FEAT_PATTERNS = [
    [['ph', 1, 4, '4/5'], ['ph', 4, 6, '1/1.05'], ['ph', 6, 10, '16/9'], ['lab', 10, 13]],
    [['lab', 2, 5], ['ph', 5, 7, '1/1'], ['ph', 7, 10, '4/5'], ['ph', 10, 13, '3/4']],
    [['ph', 1, 3, '1/1'], ['lab', 3, 6], ['ph', 6, 9, '4/5'], ['ph', 9, 13, '16/9']]
  ];
  function featureRow(doc, path, title, n) {
    var figs = [].slice.call(doc.querySelectorAll('.proj-cover .ph, .mosaic .ph, .gallery .ph'));
    var imgs = figs.filter(function (f) { return f.querySelector('picture'); });
    var vids = figs.filter(function (f) { return f.querySelector('video'); });
    var pick = (imgs.length > 3 ? imgs.slice(1).concat(imgs.slice(0, 1)) : imgs).concat(vids).slice(0, 3)
      .map(function (f) { return f.innerHTML.replace(/ fetchpriority="high"/, ' loading="lazy"'); });
    var cat = { works: 'Works', art: 'Art', lab: 'Lab' }[path.split('/')[1]] || '';
    var year = '';
    doc.querySelectorAll('.proj-meta div').forEach(function (d) { if (/year/i.test(d.querySelector('dt').textContent)) year = d.querySelector('dd').textContent.trim(); });
    var intro = ((doc.querySelector('.proj-intro') || {}).textContent || '').trim();
    var k = 0, cells = FEAT_PATTERNS[n % FEAT_PATTERNS.length].map(function (c) {
      if (c[0] === 'lab') {
        return '<div class="lab" style="grid-column:' + c[1] + '/' + c[2] + '"><h3><a href="' + esc(path) + '">' + esc(title) + '</a><em>' +
          esc([cat, year].filter(Boolean).join(' · ')) + '</em></h3><p>' + esc(intro) + '<a class="go" href="' + esc(path) + '">View project →</a></p></div>';
      }
      if (k >= pick.length) return '';
      return '<figure class="ph" data-href="' + esc(path) + '" style="grid-column:' + c[1] + '/' + c[2] + ';aspect-ratio:' + c[3] + '">' + pick[k++] + '</figure>';
    });
    return '<div class="row">' + cells.join('') + '</div>';
  }

  // ---------------------------------------------------------------- modals
  function modal(title, body, actions) {
    var close = function () { wrap.remove(); };
    var wrap = h('div', { class: 've-ui ve-modal-bg', on: { mousedown: function (e) { if (e.target === wrap) close(); } } }, [
      h('div', { class: 've-modal', role: 'dialog', 'aria-label': title }, [
        h('div', { class: 've-mh' }, [h('strong', { text: title }), btn('×', close, 'Fechar', 've-x')]),
        body,
        actions ? h('div', { class: 've-mf' }, actions) : null
      ])
    ]);
    D.body.appendChild(wrap);
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return close;
  }

  function carouselModal() {
    var car = D.querySelector('.car');
    var list = (car.getAttribute('data-images') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var grid = h('div', { class: 've-thumbs' });
    var pickWrap = h('div', { class: 've-pick', hidden: '' });
    function draw() {
      grid.innerHTML = '';
      list.forEach(function (u, i) {
        grid.appendChild(h('div', { class: 've-thumb' }, [
          h('img', { src: u, alt: '' }),
          h('span', { class: 've-n', text: String(i + 1) }),
          h('div', { class: 've-tb' }, [
            btn('◀', function () { if (i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); draw(); } }, 'Para trás'),
            btn('▶', function () { if (i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); draw(); } }, 'Para frente'),
            btn('×', function () { list.splice(i, 1); draw(); }, 'Remover do carrossel', 've-danger')
          ])
        ]));
      });
    }
    function sitePicker() {
      pickWrap.innerHTML = '';
      var seen = {};
      D.querySelectorAll('main .ph, main .cv').forEach(function (f) {
        var so = f.querySelector('source'), img = f.querySelector('img'), v = f.querySelector('video');
        var u = so ? so.getAttribute('srcset') : img ? img.getAttribute('src') : v && v.getAttribute('poster');
        if (!u || seen[u]) return; seen[u] = 1;
        pickWrap.appendChild(h('button', { type: 'button', class: 've-pk', title: 'Adicionar ao carrossel', on: { click: function () { list.push(u); draw(); } } }, [h('img', { src: u, alt: '' })]));
      });
      pickWrap.hidden = !pickWrap.hidden;
    }
    draw();
    var random = car.hasAttribute('data-random');
    var manualBox = h('div', { class: 've-mb', style: 'padding:0' });
    var modeSeg = h('div', { class: 've-row' }, [
      h('label', { class: 've-scope-l' }, [
        (function () { var cb = h('input', { type: 'checkbox' }); cb.checked = random;
          cb.addEventListener('change', function () { random = cb.checked; manualBox.style.opacity = random ? .35 : 1; }); return cb; })(),
        h('span', { text: 'Aleatório: a cada visita, 15 imagens sorteadas de todos os projetos de Works e Art (a lista se atualiza sozinha).' })
      ])
    ]);
    manualBox.style.opacity = random ? .35 : 1;
    var body = h('div', { class: 've-mb' }, [
      modeSeg,
      h('p', { class: 've-help', text: 'Seleção manual (usada quando o aleatório está desligado). A mudança aparece no carrossel depois de salvar.' }),
      grid,
      h('div', { class: 've-row' }, [
        btn('+ Enviar imagens', function () { pickFiles(true, function (fs) { fs.filter(function (f) { return /^image\//.test(f.type); }).reduce(function (p, f) { return p.then(function () { return upload(f).then(function (j) { list.push(j.webp || j.src); draw(); }); }); }, Promise.resolve()).then(function () { toast('Imagens adicionadas'); }).catch(function () {}); }); }),
        btn('+ Escolher das fotos desta página', sitePicker)
      ]),
      pickWrap
    ]);
    var close = modal('Carrossel', body, [
      btn('Cancelar', function () { close(); }),
      btn('Aplicar', function () {
        if (!list.length) return toast('O carrossel precisa de pelo menos uma imagem');
        setAttr(car, 'data-images', list.join(', '));
        setAttr(car, 'data-random', random ? '' : null);
        carouselChanged = true; close(); toast(random ? 'Carrossel aleatório — salve para ver' : 'Carrossel manual — salve para ver');
      }, null, 've-primary')
    ]);
  }

  function settingsModal() {
    var head = src.head;
    var meta = function (sel) { return head.querySelector(sel); };
    var ld = meta('script[type="application/ld+json"]'), ldData = {};
    try { ldData = JSON.parse(ld.textContent); } catch (e) { ld = null; }
    var canon = meta('link[rel="canonical"]');
    var origin = canon ? (canon.getAttribute('href').match(/^https?:\/\/[^/]+/) || [''])[0] : '';
    var mail = D.querySelector('main a[href^="mailto:"]');
    var email = mail ? mail.getAttribute('href').replace(/^mailto:/, '') : '';
    var f = {
      title: field('Título desta página (aba do navegador e Google)', src.title),
      desc: field('Descrição desta página (Google e compartilhamento)', (meta('meta[name="description"]') || {}).content || '', true),
      url: field('Endereço do site (domínio) — vale para todas as páginas', origin, false, 'https://www.seudominio.com')
    };
    if (mail) f.email = field('E-mail de contato', email, false, 'voce@email.com');
    function field(label, val, area, ph) {
      var inp = h(area ? 'textarea' : 'input', { class: 've-in', placeholder: ph || '' });
      inp.value = val;
      return h('label', { class: 've-f' }, [h('span', { text: label }), inp]);
    }
    var v = function (k) { return f[k] ? f[k].querySelector('.ve-in').value.trim() : ''; };
    var initial = { title: v('title'), desc: v('desc') };
    var body = h('div', { class: 've-mb' }, [f.title, f.desc, f.url, f.email]);
    var close = modal('Configurações da página', body, [
      btn('Cancelar', function () { close(); }),
      btn('Aplicar', function () {
        var t = v('title'), d = v('desc'), u = v('url').replace(/\/+$/, ''), m = v('email');
        if (u && !/^https?:\/\/[^\s"<>/]+$/.test(u)) return toast('O endereço precisa ser só o domínio, começando com https://');
        if (m && !/^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(m)) return toast('E-mail inválido');
        var setMeta = function (sels, val) { sels.forEach(function (s) { var el = meta(s); if (el) el.setAttribute('content', val); }); };
        if (t !== initial.title) { src.title = t; D.title = t; setMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]'], t); }
        if (d !== initial.desc) setMeta(['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'], d);
        if (u && origin && u !== origin) {
          head.querySelectorAll('[href],[content]').forEach(function (el) {
            ['href', 'content'].forEach(function (a) { var x = el.getAttribute(a); if (x && x.indexOf(origin) === 0) el.setAttribute(a, u + x.slice(origin.length)); });
          });
          ['url', 'image'].forEach(function (k) { if (typeof ldData[k] === 'string') ldData[k] = ldData[k].replace(origin, u); });
          pendingDomain = { from: (pendingDomain && pendingDomain.from) || origin, to: u };
        }
        if (m && m !== email) {
          D.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
            both(a, function (x) { x.setAttribute('href', 'mailto:' + m); if (x.textContent.trim() === email) x.textContent = m; });
          });
          if (ldData.email) ldData.email = 'mailto:' + m;
        }
        if (ld) ld.textContent = '\n' + JSON.stringify(ldData, null, 2) + '\n';
        markDirty(); close(); toast('Configurações aplicadas — salve para gravar');
      }, null, 've-primary')
    ]);
  }

  function historyModal() {
    var body = h('div', { class: 've-mb' }, [h('p', { class: 've-help', text: 'Carregando…' })]);
    modal('Versões anteriores desta página', body);
    fetch('/api/backups?page=' + encodeURIComponent(PAGE), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      body.innerHTML = '';
      if (!j.backups.length) { body.appendChild(h('p', { class: 've-help', text: 'Nenhuma versão salva ainda. Cada vez que você salva, a versão anterior fica guardada aqui.' })); return; }
      body.appendChild(h('p', { class: 've-help', text: 'Cada vez que você salva, a versão anterior fica guardada. Restaurar também guarda a versão atual antes.' }));
      var ul = h('div', { class: 've-hist' });
      j.backups.forEach(function (n) {
        var m = n.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        var label = m[3] + '/' + m[2] + '/' + m[1] + ' às ' + m[4] + ':' + m[5] + ':' + m[6];
        ul.appendChild(h('div', { class: 've-hrow' }, [h('span', { text: label }),
          btn('Restaurar', function () {
            if (dirty && !confirm('Você tem alterações não salvas que serão perdidas. Continuar?')) return;
            if (!confirm('Restaurar a versão de ' + label + '?')) return;
            api('/api/restore', { path: PAGE, name: n }).then(function () { dirty = false; location.reload(); });
          })]));
      });
      body.appendChild(ul);
    });
  }

  // ---------------------------------------------------------------- save
  function api(url, data) {
    return fetch(url, { method: 'POST', headers: { 'X-Editor': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var er = new Error(j.error || r.status); er.status = r.status; throw er; } return j; }); })
      .catch(function (e) { if (e.status !== 409) toast(netMsg(e, 'Erro: '), e instanceof TypeError); throw e; });
  }
  function netMsg(e, prefix) {
    return e instanceof TypeError
      ? 'Sem conexão com o editor. Abra o atalho “Editar site” de novo e clique em Salvar (suas alterações continuam aqui).'
      : prefix + e.message;
  }

  function serialize() {
    var root = src.documentElement.cloneNode(true);
    root.querySelectorAll('[data-eid]').forEach(function (n) { n.removeAttribute('data-eid'); });
    root.querySelectorAll('[class]').forEach(function (n) {
      [].slice.call(n.classList).forEach(function (c) { if (c.indexOf('ve-') === 0) n.classList.remove(c); });
      if (!n.classList.length) n.removeAttribute('class');
    });
    return '<!DOCTYPE html>\n' + root.outerHTML + '\n';
  }

  /* Salva. Retorna uma Promise<boolean>. */
  function save(silentIfClean, force) {
    if (!src || saving) return Promise.resolve(false);
    if (!dirty && !force) { if (!silentIfClean) toast('Nada para salvar'); return Promise.resolve(true); }
    if (D.activeElement && D.activeElement.isContentEditable) syncText(D.activeElement.closest('[contenteditable="true"][data-eid]'));
    pruneStyles();
    saving = true; updateStatus();
    var payload = { path: PAGE, html: serialize(), css: genCSS(), baseMtime: baseMtime };
    if (pendingDomain) payload.domain = pendingDomain;
    if (force) payload.force = true;
    return api('/api/save', payload).then(function (j) {
      saving = false; dirty = false; pendingDomain = null; baseMtime = j.mtime; updateStatus();
      toast(j.synced ? 'Salvo ✓ (cabeçalho/rodapé atualizados em ' + j.synced + ' páginas)' : 'Salvo ✓');
      if (carouselChanged) setTimeout(function () { location.reload(); }, 500);
      return true;
    }).catch(function (e) {
      saving = false; updateStatus();
      if (e.status === 409) conflictModal();
      return false;
    });
  }

  function conflictModal() {
    var close = modal('Esta página mudou fora do editor', h('div', { class: 've-mb' }, [
      h('p', { text: 'O arquivo desta página foi alterado depois que você a abriu (por exemplo, por uma atualização feita pelo Claude, por outra aba do editor ou por uma mudança no cabeçalho salva em outra página).' }),
      h('p', { class: 've-help', text: 'Recarregar mostra a versão atual, mas perde o que você mudou aqui desde o último salvamento. Salvar por cima mantém o que está na sua tela e descarta a outra alteração (a versão substituída fica em “Versões”).' })
    ]), [
      btn('Cancelar', function () { close(); }),
      btn('Salvar por cima', function () { close(); save(false, true); }),
      btn('Recarregar', function () { dirty = false; location.reload(); }, null, 've-primary')
    ]);
  }

  // ---------------------------------------------------------------- UI shell
  var statusEl, toastEl, toastT;
  function toast(msg, sticky) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.hidden = true; }, sticky ? 15000 : 2800);
  }
  function updateStatus() {
    statusEl.textContent = saving ? 'Salvando…' : dirty ? 'Alterações não salvas' : 'Tudo salvo';
    statusEl.className = 've-status' + (dirty ? ' is-dirty' : '');
  }

  function init(cssText) {
    enhance(D.body);
    itemBar = h('div', { class: 've-ui ve-bar', hidden: '' });
    rowBar = h('div', { class: 've-ui ve-bar ve-bar-row', hidden: '' });
    sectBar = h('div', { class: 've-ui ve-bar ve-bar-sect', hidden: '' });
    textBar = h('div', { class: 've-ui ve-bar ve-bar-text', hidden: '' });
    statusEl = h('span', { class: 've-status' });
    toastEl = h('div', { class: 've-ui ve-toast', hidden: '', role: 'status' });
    var pageName = PAGE_TYPE === 'home' ? 'Home' : (D.querySelector('.proj-title, .cat-title') || {}).textContent || PAGE;
    var extra = [];
    if (PAGE_TYPE === 'home') {
      if (D.querySelector('.car')) extra.push(btn('Carrossel', carouselModal, 'Escolher e ordenar as imagens do carrossel do topo'));
      if (D.querySelector('.feat .cards, .feat-grid')) extra.push(btn('+ Destaque', addFeatured, 'Mostrar mais um projeto na home'));
    }
    if (PAGE_TYPE === 'cat' && CAT) extra.push(btn('+ Projeto', newProject, 'Criar um projeto novo nesta categoria'));
    if (PAGE_TYPE === 'proj') extra.push(D.querySelector('.mosaic')
      ? btn('+ Mídia', function () { pickFiles(true, function (fs) { addToMosaic(D.querySelector('.mosaic'), fs); }); }, 'Adicionar imagens ou vídeos à galeria')
      : btn('+ Linha', function () { addRow(D.querySelector('.gallery')); }, 'Nova linha no fim da galeria'));
    var dock = h('div', { class: 've-ui ve-dock' }, [
      h('strong', { class: 've-logo', text: 'Editor' }),
      h('button', { type: 'button', class: 've-b ve-pagebtn', title: 'Ir para outra página', text: pageName.trim().slice(0, 28) + ' ▾', on: { click: pagesModal } }),
      statusEl, sep(),
      btn('Estilos', function () { togglePanel(); }, 'Painel de estilos (fonte, tamanho, espaçamento)')
    ].concat(extra).concat([
      btn('Página', settingsModal, 'Título, descrição, domínio e e-mail'),
      btn('Versões', historyModal, 'Voltar para uma versão salva anteriormente'),
      btn('Visualizar ↗', function () { if (dirty) toast('Mostrando a última versão salva'); open(PAGE + '?preview', '_blank'); }, 'Abrir como os visitantes veem (versão salva)'),
      btn('Ajuda', helpModal),
      btn('Salvar', function () { save(); }, 'Salvar (Ctrl+S)', 've-primary')
    ]));
    [itemBar, rowBar, sectBar, textBar, toastEl, dock].forEach(function (n) { D.body.appendChild(n); });
    updateStatus();
    initInspector(cssText);

    D.addEventListener('input', onInput);
    D.addEventListener('keydown', onKey);
    D.addEventListener('paste', onPaste);
    D.addEventListener('mouseover', onOver);
    D.addEventListener('selectionchange', updateTextBar);
    D.addEventListener('dragover', onDragOver);
    D.addEventListener('drop', onDrop);
    D.addEventListener('dragleave', function (e) { if (!e.relatedTarget) D.querySelectorAll('.ve-drop').forEach(function (n) { n.classList.remove('ve-drop'); }); });
    // links não navegam no modo edição (Ctrl+clique abre a página no editor)
    D.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a || a.closest('.ve-ui')) return;
      e.preventDefault();
      var href = a.getAttribute('href') || '';
      if ((e.ctrlKey || e.metaKey) && href.charAt(0) === '/') goTo(href.split('#')[0] || '/');
    }, true);
    var raf = 0;
    addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; if (!itemBar.hidden || !rowBar.hidden || !sectBar.hidden) refreshToolbars(); if (!textBar.hidden) updateTextBar(); });
    }, { passive: true });
    addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    try { if (!localStorage.getItem('ve-help-seen-2')) { helpModal(); localStorage.setItem('ve-help-seen-2', '1'); } } catch (e) {}
  }

  // ================================================================ INSPETOR (painel lateral)
  /* Estilos ficam em /css/custom.css (um arquivo para o site todo), por elemento (atributo
     data-s), com regras separadas para desktop e celular (até 760px). */
  var PANEL_W = 300, MOBILE_MQ = '(max-width:760px)';
  var panelOpen = false, panel, panelBody, picked = null, bp = 'd', styleModel = {}, keepImports = [];
  var liveCss, pageSids = {}, createdSids = {}, savedRange = null, rangeHost = null, rangeOnly = true;
  var phone, phoneFrame, phoneT = 0;

  var FONTS = [
    { n: 'Syncopate', v: 'var(--brand)', w: [400, 700], g: 'Do site' },
    { n: 'Archivo Black', v: 'var(--display)', w: [400], g: 'Do site' },
    { n: 'Inter Tight', v: 'var(--sans)', w: [300, 400, 500, 600, 700, 800], g: 'Do site', q: 'Inter+Tight:wght@300;400;500;600;700;800' },
    { n: 'DM Mono', v: 'var(--mono)', w: [300, 400, 500], g: 'Do site', q: 'DM+Mono:wght@300;400;500' },
    { n: 'Inter', w: [300, 400, 500, 600, 700, 800], c: 'sans-serif' },
    { n: 'Space Grotesk', w: [300, 400, 500, 600, 700], c: 'sans-serif' },
    { n: 'Manrope', w: [300, 400, 500, 600, 700, 800], c: 'sans-serif' },
    { n: 'DM Sans', w: [300, 400, 500, 600, 700, 800], c: 'sans-serif' },
    { n: 'Bricolage Grotesque', w: [300, 400, 500, 600, 700, 800], c: 'sans-serif' },
    { n: 'Familjen Grotesk', w: [400, 500, 600, 700], c: 'sans-serif' },
    { n: 'Archivo', w: [300, 400, 500, 600, 700, 800, 900], c: 'sans-serif' },
    { n: 'Syne', w: [400, 500, 600, 700, 800], c: 'sans-serif' },
    { n: 'Unbounded', w: [300, 400, 500, 600, 700, 800, 900], c: 'sans-serif' },
    { n: 'Oswald', w: [300, 400, 500, 600, 700], c: 'sans-serif' },
    { n: 'Bebas Neue', w: [400], c: 'sans-serif' },
    { n: 'Anton', w: [400], c: 'sans-serif' },
    { n: 'Playfair Display', w: [400, 500, 600, 700, 800, 900], c: 'serif' },
    { n: 'Fraunces', w: [300, 400, 500, 600, 700, 800, 900], c: 'serif' },
    { n: 'Instrument Serif', w: [400], c: 'serif' },
    { n: 'Cormorant Garamond', w: [300, 400, 500, 600, 700], c: 'serif' },
    { n: 'IBM Plex Mono', w: [300, 400, 500, 600, 700], c: 'monospace' },
    { n: 'JetBrains Mono', w: [300, 400, 500, 600, 700, 800], c: 'monospace' },
    { n: 'Helvetica / Arial', v: '"Helvetica Neue", Helvetica, Arial, sans-serif', w: [400, 700], g: 'Do sistema', sys: true }
  ];
  FONTS.forEach(function (f) {
    if (!f.v) f.v = '"' + f.n + '", ' + f.c;
    if (!f.g) f.g = 'Google Fonts';
    if (!f.q && !f.sys && f.g === 'Google Fonts') f.q = f.n.replace(/ /g, '+') + (f.w.length > 1 ? ':wght@' + f.w.join(';') : '');
  });
  var WEIGHT_NAMES = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
  function normFam(v) { return String(v || '').replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase(); }
  function fontByValue(v) { var n = normFam(v); return FONTS.filter(function (f) { return normFam(f.v) === n; })[0] || null; }

  // ---------- modelo de estilos <-> custom.css
  function parseRules(rules, key) {
    [].forEach.call(rules, function (r) {
      if (r.cssRules && r.media) return parseRules(r.cssRules, /max-width/.test(r.media.mediaText) ? 'm' : 'd');
      var m = (r.selectorText || '').match(/\[data-s="([\w-]+)"\](\s+img)?$/);
      if (!m) return;
      var o = styleModel[m[1]] || (styleModel[m[1]] = { d: {}, m: {} });
      for (var i = 0; i < r.style.length; i++) {
        var p = r.style[i];
        o[key][(m[2] ? 'img:' : '') + p] = r.style.getPropertyValue(p);
      }
    });
  }
  function parseCssText(text) {
    var body = String(text || '').replace(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;?/g, function (m, u) {
      var known = FONTS.some(function (f) {
        return f.q && new RegExp('family=' + f.q.split(':')[0].replace(/\+/g, '\\+') + '(?:[:&]|$)').test(u);
      });
      if (!known) keepImports.push(u);
      return '';
    });
    try { var sheet = new CSSStyleSheet(); sheet.replaceSync(body); parseRules(sheet.cssRules, 'd'); } catch (e) {}
  }

  function initStyles(cssText) {
    parseCssText(cssText);
    // páginas antigas: <style id="ve-custom"> dentro do HTML -> migra para o custom.css
    var old = D.getElementById('ve-custom');
    if (old) { parseCssText(old.textContent); old.remove(); var so = src.getElementById('ve-custom'); if (so) so.remove(); markDirty(); }
    src.querySelectorAll('link[data-ve-font]').forEach(function (l) { l.remove(); });
    D.querySelectorAll('link[data-ve-font]').forEach(function (l) { l.remove(); });
    // garante o <link> para /css/custom.css no arquivo
    if (!src.querySelector('link[href="/css/custom.css"]')) {
      var base = src.querySelector('link[href$="css/style.css"]');
      var ln = src.createElement('link'); ln.rel = 'stylesheet'; ln.href = '/css/custom.css';
      if (base) { base.after(ln); base.after(src.createTextNode('\n')); } else src.head.appendChild(ln);
      markDirty();
    }
    // na tela, um <style> ao vivo substitui o arquivo
    var link = D.querySelector('link[href="/css/custom.css"]');
    if (link) link.disabled = true;
    liveCss = D.createElement('style'); liveCss.id = 've-live-css';
    (link || D.querySelector('link[href$="css/style.css"]') || D.head.lastChild).after(liveCss);
    D.querySelectorAll('[data-s]').forEach(function (el) { pageSids[el.getAttribute('data-s')] = 1; });
    applyCSS();
  }

  function genRules() {
    var out = { d: [], m: [] };
    Object.keys(styleModel).forEach(function (sid) {
      ['d', 'm'].forEach(function (k) {
        var props = styleModel[sid][k], main = [], img = [];
        Object.keys(props).forEach(function (p) {
          if (props[p] === '' || props[p] == null) return;
          (p.indexOf('img:') === 0 ? img : main).push(p.replace('img:', '') + ':' + props[p] + '!important');
        });
        var sel = ':root [data-s="' + sid + '"]';
        if (main.length) out[k].push(sel + '{' + main.join(';') + '}');
        if (img.length) out[k].push(sel + ' img,' + sel + ' video{' + img.join(';') + '}');
      });
    });
    var css = out.d.join('\n');
    if (out.m.length) css += (css ? '\n' : '') + '@media ' + MOBILE_MQ + '{\n' + out.m.join('\n') + '\n}';
    return css;
  }
  function genImports(rules) {
    var n = rules.replace(/["']/g, '').toLowerCase(), urls = [];
    FONTS.forEach(function (f) {
      if (!f.q) return;
      var used = f.v.indexOf('var(') === 0 ? rules.indexOf(f.v) >= 0 : n.indexOf('font-family:' + f.n.toLowerCase() + ',') >= 0;
      if (used) urls.push('https://fonts.googleapis.com/css2?family=' + f.q + '&display=swap');
    });
    keepImports.forEach(function (u) {
      var fam = decodeURIComponent((u.match(/family=([^:&]+)/) || [])[1] || '').replace(/\+/g, ' ').toLowerCase();
      if (fam && n.indexOf(fam) >= 0 && urls.indexOf(u) < 0) urls.push(u);
    });
    return urls.map(function (u) { return '@import url("' + u + '");'; }).join('\n');
  }
  function genCSS() {
    var rules = genRules(), imports = genImports(rules);
    return '/* Estilos criados pelo editor visual (painel Estilos). Gerado automaticamente. */\n' +
      (imports ? imports + '\n' : '') + (rules ? rules + '\n' : '');
  }
  function applyCSS() { var r = genRules(); liveCss.textContent = genImports(r) + '\n' + r; }

  function sidOf(el, create) {
    var sid = el.getAttribute('data-s');
    if (!sid && create) {
      do { sid = 's' + Math.random().toString(36).slice(2, 7); } while (D.querySelector('[data-s="' + sid + '"]') || styleModel[sid]);
      setAttr(el, 'data-s', sid);
      createdSids[sid] = 1;
    }
    return sid;
  }
  function getVal(prop, el) {
    el = el || picked;
    var sid = el && sidOf(el);
    return (sid && styleModel[sid] && styleModel[sid][bp][prop]) || '';
  }
  function setProp(prop, val) {
    var el = styleTarget();
    if (!el) return;
    var sid = sidOf(el, true);
    var o = styleModel[sid] || (styleModel[sid] = { d: {}, m: {} });
    val = (val == null ? '' : String(val)).trim();
    if (val === '') delete o[bp][prop]; else o[bp][prop] = val;
    applyCSS(); markDirty();
    if (el.closest('.hero h1, .cat-title')) dispatchEvent(new Event('resize'));
  }

  // trecho selecionado -> <span data-s>
  function styleTarget() {
    if (!(savedRange && rangeOnly && rangeHost && D.contains(rangeHost))) return picked;
    var r = savedRange, host = rangeHost;
    savedRange = null;
    var span = D.createElement('span');
    span.setAttribute('data-eid', nextId++);
    try { r.surroundContents(span); } catch (e) { span.appendChild(r.extractContents()); r.insertNode(span); }
    span.querySelectorAll('[data-eid]').forEach(function (n) {
      if (D.querySelectorAll('[data-eid="' + n.getAttribute('data-eid') + '"]').length > 1) n.setAttribute('data-eid', nextId++);
    });
    syncText(host);
    select(span);
    return span;
  }

  function pruneStyles() {
    Object.keys(styleModel).forEach(function (sid) {
      var o = styleModel[sid];
      var gone = (pageSids[sid] || createdSids[sid]) && !src.querySelector('[data-s="' + sid + '"]');
      if (gone || (!Object.keys(o.d).length && !Object.keys(o.m).length)) delete styleModel[sid];
    });
    applyCSS();
  }

  // ---------- seleção
  function nameOf(el) {
    var map = [['.ph', 'Mídia'], ['.cv', 'Capa'], ['.card', 'Card'], ['.cards', 'Cards'], ['.lab', 'Bloco de texto'], ['.row', 'Linha'],
      ['.gallery', 'Galeria'], ['.mosaic', 'Galeria'], ['.proj-cover', 'Capa'], ['.works', 'Seção'], ['.feat', 'Destaques'], ['.bar', 'Cabeçalho'], ['.hero', 'Topo'], ['.sub', 'Subtítulo'],
      ['.grey', 'Sobre / Contato'], ['.cols', 'Colunas'], ['.big', 'Texto grande'], ['.foot', 'Rodapé'], ['.sect', 'Título da seção'],
      ['.ln', 'Linha do título'], ['.proj-head', 'Cabeçalho do projeto'], ['.proj-title', 'Título do projeto'], ['.proj-intro', 'Descrição'],
      ['.proj-meta', 'Ficha'], ['.crumb', 'Categoria'], ['.cat-head', 'Cabeçalho'], ['.cat-title', 'Título da categoria'], ['.cat-intro', 'Introdução'],
      ['h1', 'Título principal'], ['h2', 'Título'], ['h3', 'Título'], ['dt', 'Rótulo'], ['dd', 'Valor'], ['li', 'Item'], ['ul', 'Lista'],
      ['nav', 'Menu'], ['em', 'Detalhe'], ['a', 'Link'], ['span', 'Trecho'], ['p', 'Texto'], ['main', 'Conteúdo'], ['section', 'Seção'],
      ['figure', 'Mídia'], ['div', 'Bloco']];
    for (var i = 0; i < map.length; i++) if (el.matches(map[i][0])) return map[i][1];
    return el.tagName.toLowerCase();
  }

  function onPick(e) {
    if (e.target.closest('.ve-ui') || e.target.closest('.car')) return;
    var el = e.target.closest('.works .ph, .proj-cover .ph, .mosaic .ph') || e.target.closest('.cards .cv') || e.target.closest('[data-eid]');
    if (!el || el === D.body) return;
    if (el !== picked) select(el);
    if (!panelOpen) togglePanel(true);
  }

  function select(el) {
    D.querySelectorAll('.ve-picked').forEach(function (n) { n.classList.remove('ve-picked'); });
    picked = el && D.contains(el) ? el : null;
    if (picked) picked.classList.add('ve-picked');
    renderPanel();
  }

  function onSelChange() {
    if (panel && panel.contains(D.activeElement)) return;
    var sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { if (savedRange) { savedRange = null; renderScope(); } return; }
    var node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    var host = node && node.closest('[contenteditable="true"][data-eid]');
    var r = sel.getRangeAt(0);
    if (!host || !host.contains(r.commonAncestorContainer)) { savedRange = null; renderScope(); return; }
    savedRange = r.cloneRange(); rangeHost = host;
    renderScope();
  }

  // ---------- painel
  function togglePanel(force) {
    panelOpen = force == null ? !panelOpen : force;
    D.documentElement.classList.toggle('ve-panel-open', panelOpen);
    if (!panelOpen) { select(null); setPhone(false); }
    else renderPanel();
    dispatchEvent(new Event('resize'));
    refreshToolbars();
  }

  function seg(options, current, onPick2, cls) {
    var wrap = h('div', { class: 've-seg' + (cls ? ' ' + cls : '') });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: 've-sg' + (o[0] === current ? ' is-on' : ''), title: o[2] || '', html: o[1] });
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () {
        wrap.querySelectorAll('.ve-sg').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on'); onPick2(o[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }
  function field(label, control, wide) {
    return h('label', { class: 've-pf' + (wide ? ' is-wide' : '') }, [h('span', { class: 've-pl', text: label }), control]);
  }
  function computed(prop) {
    if (!picked) return '';
    var t = prop.indexOf('img:') === 0 ? (picked.querySelector('img, video')) : picked;
    if (!t) return '';
    var cs = getComputedStyle(t), p = prop.replace('img:', ''), v = cs.getPropertyValue(p), fs = parseFloat(cs.fontSize);
    if (p === 'line-height') return v === 'normal' ? 'normal' : +(parseFloat(v) / fs).toFixed(2) + '';
    if (p === 'letter-spacing') return v === 'normal' ? '0em' : +(parseFloat(v) / fs).toFixed(3) + 'em';
    if (/px$/.test(v)) return +parseFloat(v).toFixed(1) + 'px';
    return v;
  }
  function numInput(prop, unit, step, small) {
    var inp = h('input', { class: 've-pin' + (small ? ' is-sm' : ''), spellcheck: 'false', autocomplete: 'off' });
    inp.value = getVal(prop);
    inp.placeholder = computed(prop);
    var norm = function (v) { v = v.trim(); return /^-?[\d.]+$/.test(v) && unit ? v + unit : v; };
    inp.addEventListener('input', function () { setProp(prop, norm(inp.value)); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { inp.blur(); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      var m = (inp.value || inp.placeholder).match(/^(-?[\d.]+)\s*([a-z%]*)$/i);
      if (!m) return;
      var d = (e.shiftKey ? 10 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
      inp.value = +(parseFloat(m[1]) + d).toFixed(3) + (m[2] || unit);
      setProp(prop, inp.value);
    });
    return inp;
  }
  function selectInput(options, value, onChange) {
    var s = h('select', { class: 've-pin ve-psel' });
    options.forEach(function (o) {
      if (o.group) {
        var g = h('optgroup', { label: o.group });
        o.items.forEach(function (it) { g.appendChild(h('option', { value: it[0], text: it[1] })); });
        s.appendChild(g);
      } else s.appendChild(h('option', { value: o[0], text: o[1] }));
    });
    s.value = value;
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  function toHex(c) {
    var m = (c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (x) { return (+x).toString(16).padStart(2, '0'); }).join('');
  }
  function section(title, kids) {
    return h('section', { class: 've-ps' }, [h('h4', { text: title })].concat(kids));
  }
  function icon(path) { return '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4">' + path + '</svg>'; }
  var ALIGN_ICONS = {
    left: icon('<path d="M1 3h12M1 7h8M1 11h10"/>'), center: icon('<path d="M1 3h12M3 7h8M2 11h10"/>'),
    right: icon('<path d="M1 3h12M5 7h8M3 11h10"/>'), justify: icon('<path d="M1 3h12M1 7h12M1 11h12"/>')
  };

  var scopeBox;
  function renderScope() {
    if (!scopeBox) return;
    scopeBox.innerHTML = '';
    if (!savedRange || !rangeHost) { scopeBox.hidden = true; return; }
    var txt = savedRange.toString().trim();
    var cb = h('input', { type: 'checkbox' }); cb.checked = rangeOnly;
    cb.addEventListener('change', function () { rangeOnly = cb.checked; });
    scopeBox.appendChild(h('label', { class: 've-scope-l' }, [cb, h('span', { text: 'Aplicar só no trecho “' + (txt.length > 28 ? txt.slice(0, 28) + '…' : txt) + '”' })]));
    scopeBox.hidden = false;
  }

  function renderPanel() {
    if (!panel || !panelOpen) return;
    panelBody.innerHTML = '';
    scopeBox = h('div', { class: 've-scope', hidden: '' });
    panelBody.appendChild(scopeBox);
    renderScope();

    if (!picked) {
      panelBody.appendChild(h('div', { class: 've-empty' }, [
        h('p', { text: 'Clique em um texto, imagem ou vídeo da página para editar o estilo.' }),
        h('ul', {}, [
          h('li', { text: 'Selecione só algumas palavras para estilizar apenas elas.' }),
          h('li', { text: 'Desktop / Celular: estilos diferentes para telas pequenas.' }),
          h('li', { text: 'Nos campos numéricos, use ↑ ↓ (Shift = ×10).' }),
          h('li', { text: 'Campo vazio = valor padrão do site.' }),
          h('li', { text: 'Estilos no cabeçalho e rodapé valem para todas as páginas.' })
        ])
      ]));
      return;
    }

    // trilha (elemento e pais)
    var crumbs = h('div', { class: 've-crumbs' }), chain = [], n = picked;
    while (n && n !== D.body && chain.length < 5) { if (n.hasAttribute('data-eid')) chain.unshift(n); n = n.parentElement; }
    chain.forEach(function (c, i) {
      if (i) crumbs.appendChild(h('span', { class: 've-cs', text: '›' }));
      crumbs.appendChild(h('button', { type: 'button', class: 've-cb' + (c === picked ? ' is-on' : ''), text: nameOf(c), on: { click: function () { select(c); } } }));
    });
    panelBody.appendChild(crumbs);

    var isMedia = picked.matches('.ph, .cv');
    var fs = [];

    if (isMedia) {
      var m = mediaEl(picked), isVid = m && m.tagName === 'VIDEO';
      var kids = [
        h('div', { class: 've-pbtns' }, [
          btn(m ? 'Trocar' : 'Adicionar mídia', function () { pickFiles(false, function (f) { replaceMedia(picked, f[0]); }); }),
          m ? btn('Descrição (alt)', function () { editAlt(picked); }) : null
        ])
      ];
      if (picked.matches('.mosaic .ph')) {
        kids.push(field('Máscara no mosaico', maskSelect(picked, 've-pin ve-psel', function () { renderPanel(); }), true));
      }
      if (picked.matches('.works .ph, .proj-cover .ph')) {
        kids.push(field('Formato', bp === 'd' ? aspectSelect(picked, 've-pin ve-psel')
          : selectInput([['', 'Igual ao desktop']].concat(ASPECTS), getVal('aspect-ratio'), function (v) { setProp('aspect-ratio', v); }), true));
      }
      kids.push(
        field('Enquadramento', selectInput([['', 'Centro'], ['top', 'Topo'], ['bottom', 'Base'], ['left', 'Esquerda'], ['right', 'Direita']], getVal('img:object-position'), function (v) { setProp('img:object-position', v); })),
        field('Ajuste', selectInput([['', 'Preencher'], ['contain', 'Mostrar inteira']], getVal('img:object-fit'), function (v) { setProp('img:object-fit', v); })),
        field('Cantos', numInput('border-radius', 'px', 1)),
        field('Opacidade', numInput('opacity', '', 0.05))
      );
      if (isVid) {
        kids.push(field('Controles do player', seg([['', 'Ocultos'], ['on', 'Visíveis']], m.hasAttribute('controls') ? 'on' : '', function (v) {
          setAttr(m, 'controls', v ? '' : null);
        }), true));
      }
      if (picked.matches('.works .ph') && bp === 'd') {
        var c = cols(picked);
        var colStart = h('input', { class: 've-pin', type: 'number', min: 1, max: 12, value: c[0] });
        var colSpan = h('input', { class: 've-pin', type: 'number', min: 1, max: 12, value: c[1] - c[0] });
        var applyCols = function () {
          var a = Math.max(1, Math.min(12, +colStart.value || 1)), w = Math.max(1, Math.min(13 - a, +colSpan.value || 1));
          setCols(picked, a, a + w);
        };
        colStart.addEventListener('change', applyCols); colSpan.addEventListener('change', applyCols);
        kids.push(field('Coluna inicial', colStart), field('Largura (de 12)', colSpan));
      }
      fs.push(section(isVid ? 'Vídeo' : 'Imagem', kids));
    } else {
      var fam = getVal('font-family');
      var cf = (getComputedStyle(picked).fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
      var curFont = fontByValue(fam);
      var fontOpts = [['', (bp === 'm' ? 'Igual ao desktop (' : 'Padrão (') + cf + ')']];
      ['Do site', 'Google Fonts', 'Do sistema'].forEach(function (g) {
        fontOpts.push({ group: g, items: FONTS.filter(function (f) { return f.g === g; }).map(function (f) { return [f.v, f.n]; }) });
      });
      var famSel = selectInput(fontOpts, curFont ? curFont.v : fam, function (v) {
        var f = FONTS.filter(function (x) { return x.v === v; })[0];
        setProp('font-family', v);
        var w = getVal('font-weight');
        if (f && w && f.w.indexOf(+w) < 0) setProp('font-weight', '');
        renderPanel();
      });
      var weights = (curFont || FONTS.filter(function (f) { return f.n === cf; })[0] || { w: [300, 400, 500, 600, 700, 800, 900] }).w;
      var wSel = selectInput([['', 'Padrão (' + getComputedStyle(picked).fontWeight + ')']].concat(weights.map(function (w) { return [String(w), w + ' · ' + WEIGHT_NAMES[w]]; })),
        getVal('font-weight'), function (v) { setProp('font-weight', v); });

      var color = h('input', { type: 'color', class: 've-color', value: toHex(getVal('color') || getComputedStyle(picked).color) });
      var colorTxt = h('input', { class: 've-pin', value: getVal('color'), placeholder: toHex(getComputedStyle(picked).color), spellcheck: 'false' });
      color.addEventListener('input', function () { colorTxt.value = color.value; setProp('color', color.value); });
      colorTxt.addEventListener('input', function () { setProp('color', colorTxt.value); if (/^#[0-9a-f]{6}$/i.test(colorTxt.value)) color.value = colorTxt.value; });

      fs.push(section('Tipografia', [
        field('Fonte', famSel, true),
        field('Peso', wSel, true),
        field('Tamanho', numInput('font-size', 'px', 1)),
        field('Entrelinha', numInput('line-height', '', 0.05)),
        field('Espaço entre letras', numInput('letter-spacing', 'em', 0.005)),
        field('Espaço entre palavras', numInput('word-spacing', 'em', 0.05)),
        field('Caixa', seg([['', '—', 'Padrão'], ['none', 'Aa', 'Normal'], ['uppercase', 'AA', 'MAIÚSCULAS'], ['lowercase', 'aa', 'minúsculas']], getVal('text-transform'), function (v) { setProp('text-transform', v); }), true),
        field('Alinhamento', seg([['', '—', 'Padrão'], ['left', ALIGN_ICONS.left, 'Esquerda'], ['center', ALIGN_ICONS.center, 'Centro'], ['right', ALIGN_ICONS.right, 'Direita'], ['justify', ALIGN_ICONS.justify, 'Justificado']], getVal('text-align'), function (v) { setProp('text-align', v); }), true),
        field('Estilo', seg([['', '—', 'Padrão'], ['normal', 'Normal'], ['italic', '<i>Itálico</i>']], getVal('font-style'), function (v) { setProp('font-style', v); }), true),
        field('Cor', h('div', { class: 've-colorrow' }, [color, colorTxt]), true),
        field('Opacidade', numInput('opacity', '', 0.05))
      ]));
    }

    var box = function (pfx) {
      return h('div', { class: 've-box' }, [['top', '↑'], ['right', '→'], ['bottom', '↓'], ['left', '←']].map(function (s) {
        return h('label', { class: 've-bx', title: s[0] }, [h('span', { text: s[1] }), numInput(pfx + '-' + s[0], 'px', 1, true)]);
      }));
    };
    fs.push(section('Espaçamento', [field('Margem externa', box('margin'), true), field('Margem interna', box('padding'), true)]));
    if (!isMedia) fs.push(section('Tamanho do bloco', [field('Largura máx.', numInput('max-width', 'px', 10)), field('Largura', numInput('width', '%', 1))]));

    fs.forEach(function (s) { panelBody.appendChild(s); });
    panelBody.appendChild(h('div', { class: 've-pfoot' }, [
      btn('Limpar estilos (' + (bp === 'd' ? 'desktop' : 'celular') + ')', function () {
        var sid = sidOf(picked);
        if (sid && styleModel[sid]) { styleModel[sid][bp] = {}; applyCSS(); markDirty(); dispatchEvent(new Event('resize')); }
        renderPanel();
      }, 'Volta este elemento ao estilo padrão do site')
    ]));
  }

  // ---------- prévia de celular (com as alterações ainda não salvas)
  function setPhone(on) {
    if (!phone) return;
    phone.hidden = !on;
    if (on) refreshPhone();
  }
  function schedulePhone() {
    if (!phone || phone.hidden) return;
    clearTimeout(phoneT); phoneT = setTimeout(refreshPhone, 350);
  }
  function refreshPhone() {
    if (!src) return;
    var y = 0;
    try { y = phoneFrame.contentWindow.scrollY || 0; } catch (e) {}
    var root = src.documentElement.cloneNode(true);
    root.querySelectorAll('[data-eid]').forEach(function (n) { n.removeAttribute('data-eid'); });
    var head = root.querySelector('head');
    var base = D.createElement('base'); base.href = location.origin + '/';
    head.insertBefore(base, head.firstChild);
    var cl = head.querySelector('link[href="/css/custom.css"]');
    if (cl) cl.remove();
    var st = D.createElement('style'); st.textContent = genCSS(); head.appendChild(st);
    phoneFrame.onload = function () { try { phoneFrame.contentWindow.scrollTo(0, y); } catch (e) {} };
    phoneFrame.srcdoc = '<!DOCTYPE html>' + root.outerHTML;
  }

  function initInspector(cssText) {
    initStyles(cssText);
    panelBody = h('div', { class: 've-pbody' });
    var bpSeg = seg([['d', 'Desktop'], ['m', 'Celular']], bp, function (v) { bp = v; setPhone(v === 'm'); renderPanel(); }, 've-bp');
    panel = h('aside', { class: 've-ui ve-panel', 'aria-label': 'Estilos' }, [
      h('div', { class: 've-phead' }, [h('strong', { text: 'Estilos' }), bpSeg, btn('×', function () { togglePanel(false); }, 'Fechar painel', 've-x')]),
      panelBody
    ]);
    phoneFrame = h('iframe', { title: 'Prévia no celular' });
    phone = h('div', { class: 've-ui ve-phone', hidden: '' }, [
      h('div', { class: 've-phone-h' }, [h('span', { text: 'Prévia celular · 390px' }), btn('↻', refreshPhone, 'Atualizar')]),
      h('div', { class: 've-phone-s' }, [phoneFrame])
    ]);
    D.body.appendChild(panel);
    D.body.appendChild(phone);
    D.addEventListener('click', onPick);
    D.addEventListener('selectionchange', onSelChange);
    D.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && picked && !(D.activeElement && D.activeElement.isContentEditable) && !D.querySelector('.ve-modal-bg')) select(null);
    });
  }

  function helpModal() {
    var items = [
      ['Páginas', 'O botão com o nome da página (na barra de baixo) lista todas as páginas: Home, Works, Art, Lab e cada projeto. Ctrl+clique num link também abre a página no editor.'],
      ['Textos', 'Clique em qualquer texto e escreva. Enter quebra a linha (em títulos, termina a edição).'],
      ['Mídia', 'Passe o mouse numa imagem ou vídeo: trocar, mudar formato, largura, posição ou excluir. Ou arraste um arquivo do computador em cima. Vídeos são comprimidos automaticamente.'],
      ['Adicionar', 'Arraste arquivos para uma linha, ou use “+ Mídia” na barra azul da linha.'],
      ['Projetos (capa + galeria)', 'A galeria é um grid editorial com espaço em branco: as imagens ganham máscaras (cinema, horizontal, quadrado, vertical) e posições variadas, e cada página tem sua composição. Na barra “Galeria”: “Nova variação” sorteia outra composição. Em cada mídia: “Máscara” fixa o formato, ◀ ▶ muda a ordem, “Alt” muda também a legenda. “+ Mídia” ou arrastar arquivos adiciona; “Usar como capa” troca com a capa.'],
      ['Projetos', 'Nas páginas Works / Art / Lab: “+ Projeto” cria a página do projeto e o card. No card: trocar capa, abrir, mover ou excluir (vai para a lixeira do editor).'],
      ['Home', '“+ Destaque” mostra mais um projeto na home; “Carrossel” escolhe as fotos do topo.'],
      ['Estilos', 'Clique em um elemento: o painel à direita mostra fonte, tamanho, entrelinha, espaçamento, cor e margens. Selecione só um trecho para estilizar apenas ele. Desktop/Celular para estilos diferentes no celular.'],
      ['Cabeçalho e rodapé', 'São iguais em todas as páginas: editou numa, ao salvar atualiza as outras.'],
      ['Salvar', 'Ctrl+S ou o botão Salvar. Cada salvamento guarda a versão anterior em “Versões”.']
    ];
    var body = h('div', { class: 've-mb' }, items.map(function (it) { return h('p', { class: 've-hp' }, [h('strong', { text: it[0] }), ' ' + it[1]]); }));
    var close = modal('Como editar', body, [btn('Entendi', function () { close(); }, null, 've-primary')]);
  }
})();
