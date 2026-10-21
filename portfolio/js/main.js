/* Vinicius Araujo — Portfolio */
(function(){
  'use strict';
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches,EDIT=!!window.__EDIT__;

  /* Hero title: split letters + fit to width ------------------------------- */
  var h1=document.querySelector('.hero h1'),idx=0;
  if(h1&&!EDIT){
    h1.setAttribute('aria-label',h1.textContent.replace(/\s+/g,' ').trim());
    h1.querySelectorAll('.ln').forEach(function(ln){
      var t=ln.textContent;ln.textContent='';ln.setAttribute('aria-hidden','true');
      t.split('').forEach(function(ch){var c=document.createElement('span');c.className='c';c.style.setProperty('--i',idx++);c.textContent=ch;ln.appendChild(c)});
    });
  }
  function fit(){
    if(!h1)return;
    var box=h1.parentElement,cs=getComputedStyle(box),avail=box.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    h1.style.fontSize='100px';
    var w=h1.getBoundingClientRect().width;
    h1.style.fontSize=(Math.floor(avail/w*995)/10)+'px';
  }
  fit();addEventListener('resize',fit);
  function enter(){fit();if(h1)requestAnimationFrame(function(){h1.classList.add('in')})}
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(enter);else enter();
  setTimeout(function(){if(h1)h1.classList.add('in')},2500);

  /* Subtitle: scroll-driven letter reveal ---------------------------------- */
  var sp=document.querySelector('.sub p'),chars=[];
  if(sp&&!EDIT){
    var tm=sp.querySelector('.tm'),txt=sp.firstChild.textContent,words=txt.trim().split(' ');
    sp.setAttribute('aria-label',sp.textContent.trim());sp.innerHTML='';
    words.forEach(function(word,wi){
      var w=document.createElement('span');w.className='w';w.setAttribute('aria-hidden','true');
      word.split('').forEach(function(ch){var c=document.createElement('span');c.className='c';c.textContent=ch;w.appendChild(c);chars.push(c)});
      if(wi===words.length-1&&tm){var c=document.createElement('span');c.className='c';c.appendChild(tm);w.appendChild(c);chars.push(c)}
      sp.appendChild(w);
      if(wi<words.length-1)sp.appendChild(document.createTextNode(' '));
    });
    var tick=false;
    var upd=function(){
      var n=chars.length,r=sp.getBoundingClientRect(),vh=innerHeight;
      var prog=reduce?1:Math.max(0,Math.min(1,(vh-r.top)/(vh*.4)));
      chars.forEach(function(c,i){
        var q=Math.max(0,Math.min(1,(prog-i/(n-1)*.55)/.45)),e=1-Math.pow(1-q,3);
        c.style.transform=e>=1?'none':'translateY('+((1-e)*118).toFixed(1)+'%)';
      });
    };
    addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(function(){tick=false;upd()})}},{passive:true});
    addEventListener('resize',upd);
    upd();
  }

  /* 3D drag carousel -------------------------------------------------------- */
  var car=document.querySelector('.car');
  if(!car)return;
  var manual=(car.getAttribute('data-images')||'').split(',').map(function(s){return s.trim()}).filter(Boolean);
  // data-random: sorteia 15 imagens de todos os projetos de Works e Art a cada visita
  if(car.hasAttribute('data-random')&&window.fetch){
    fetch('/assets/carousel.json').then(function(r){return r.ok?r.json():[]}).then(function(list){
      list=(list||[]).slice();
      for(var i=list.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=list[i];list[i]=list[j];list[j]=t}
      startCar(list.length?list.slice(0,15):manual);
    }).catch(function(){startCar(manual)});
  }else startCar(manual);

  function startCar(order){
  var N=order.length,items=[];
  if(!N)return;
  var bar=car.querySelector('.prog i'),cur=car.querySelector('.cur'),frag=document.createDocumentFragment();
  order.forEach(function(url){
    var d=document.createElement('div');d.className='it';d.setAttribute('aria-hidden','true');
    d.style.backgroundImage='url("'+url+'")';
    frag.appendChild(d);items.push(d);
  });
  car.insertBefore(frag,car.firstChild);

  var W,H,cw,ch,step,stepY,fx,pos=0,target=0,vel=0,dragging=false,lastX=0,lastT=0,raf=0,prev=0,speed=0,drift=.0001,lastAct=0,visible=true;
  var intro=!reduce,introFrom=-7,introT0=0,introDur=3400;
  if(intro)pos=target=introFrom;

  function size(){
    W=car.clientWidth;H=car.clientHeight;
    ch=H*.4;cw=ch*.8;step=cw*.78;stepY=H*.06;fx=W*.38;
    items.forEach(function(el){el.style.width=cw+'px';el.style.height=ch+'px'});
  }
  function render(){
    for(var i=0;i<N;i++){
      var d=(((i-pos+N/2)%N)+N)%N-N/2;
      var g=Math.max(0,1-Math.abs(d));g=g*g*(3-2*g);
      var push=Math.max(-1,Math.min(1,d))*cw*.42;
      var x=fx+d*step+push-cw/2,y=H*.5-d*stepY-ch/2,z=-d*34+g*120;
      var el=items[i];
      el.style.transform='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,'+z.toFixed(1)+'px) rotateY('+(38*(1-.9*g)).toFixed(2)+'deg) scale('+(1+.55*g).toFixed(3)+')';
      el.style.zIndex=Math.round(1000-Math.abs(d)*50);
    }
    bar.style.width=((((pos%N)+N)%N)/N*100).toFixed(2)+'%';
  }
  function frame(t){
    if(intro){
      if(!introT0)introT0=t;
      var p=Math.min(1,(t-introT0)/introDur),e=1-Math.pow(1-p,4);
      pos=target=introFrom*(1-e);
      if(p>=1){intro=false;pos=target=0}
      render();
      if(!intro)prev=0;
      raf=requestAnimationFrame(frame);
      return;
    }
    var dt=prev?Math.min(50,t-prev):16;prev=t;
    var goal=(!reduce&&visible&&!dragging&&t-lastAct>700)?drift:0;
    speed+=(goal-speed)*(1-Math.exp(-dt/700));
    target+=speed*dt;
    pos+=(target-pos)*(reduce?1:1-Math.exp(-dt/120));
    if(Math.abs(pos)>N*20){var o=Math.floor(pos/N)*N;pos-=o;target-=o}
    render();
    if((reduce||!visible)&&!dragging&&Math.abs(target-pos)<.0004&&speed<1e-6){raf=0;prev=0}
    else{raf=requestAnimationFrame(frame)}
  }
  function kick(){if(!raf){prev=0;raf=requestAnimationFrame(frame)}}
  function takeControl(){lastAct=performance.now();if(intro){intro=false;target=pos}}

  var cx=0,cy=0,tx=0,ty=0,over=false,craf=0;

  car.addEventListener('pointerdown',function(e){
    if(e.button>0)return;
    takeControl();
    dragging=true;vel=0;lastX=e.clientX;lastT=e.timeStamp;
    car.setPointerCapture(e.pointerId);car.classList.add('drag');kick();
  });
  car.addEventListener('pointermove',function(e){
    if(e.pointerType==='mouse'){var r=car.getBoundingClientRect();tx=e.clientX-r.left;ty=e.clientY-r.top}
    if(!dragging)return;
    var dx=e.clientX-lastX,dt=Math.max(1,e.timeStamp-lastT);
    target-=dx/step;
    vel=vel*.6+(-dx/step/dt)*.4;
    lastX=e.clientX;lastT=e.timeStamp;
  });
  function end(e){
    if(!dragging)return;
    dragging=false;lastAct=performance.now();car.classList.remove('drag');
    if(e.timeStamp-lastT>80)vel=0;
    if(!reduce)target+=vel*320;
    kick();
  }
  car.addEventListener('pointerup',end);
  car.addEventListener('pointercancel',end);
  car.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){e.preventDefault();takeControl();target+=e.deltaX/step*.7;kick()}
  },{passive:false});
  car.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'){e.preventDefault();takeControl();target=Math.round(target)+1;kick()}
    else if(e.key==='ArrowLeft'){e.preventDefault();takeControl();target=Math.round(target)-1;kick()}
  });

  /* Custom "drag" cursor */
  function cloop(){
    cx+=(tx-cx)*.22;cy+=(ty-cy)*.22;
    if(cur)cur.style.transform='translate3d('+cx.toFixed(1)+'px,'+cy.toFixed(1)+'px,0)';
    craf=(over||Math.hypot(tx-cx,ty-cy)>.5)?requestAnimationFrame(cloop):0;
  }
  car.addEventListener('pointerenter',function(e){
    if(e.pointerType!=='mouse')return;
    var r=car.getBoundingClientRect();
    tx=cx=e.clientX-r.left;ty=cy=e.clientY-r.top;
    over=true;car.classList.add('over');
    if(!craf)craf=requestAnimationFrame(cloop);
  });
  car.addEventListener('pointerleave',function(){over=false;car.classList.remove('over')});

  if('IntersectionObserver' in window)new IntersectionObserver(function(en){visible=en[0].isIntersecting;if(visible)kick()}).observe(car);
  addEventListener('resize',function(){size();render()});
  size();render();
  setTimeout(kick,250);
  }
})();

/* Smooth wheel scrolling + anchor links ------------------------------------- */
(function(){
  'use strict';
  if(window.__EDIT__||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var cur=scrollY,tgt=scrollY,raf=0,prev=0;
  function maxY(){return Math.max(0,document.documentElement.scrollHeight-innerHeight)}
  function loop(t){
    var dt=prev?Math.min(50,t-prev):16;prev=t;
    cur+=(tgt-cur)*(1-Math.exp(-dt/140));
    if(Math.abs(tgt-cur)<.4)cur=tgt;
    scrollTo(0,cur);
    if(cur!==tgt){raf=requestAnimationFrame(loop)}else{raf=0;prev=0}
  }
  function go(y){
    if(!raf){cur=scrollY}
    tgt=Math.max(0,Math.min(maxY(),y));
    if(!raf){prev=0;raf=requestAnimationFrame(loop)}
  }
  addEventListener('wheel',function(e){
    if(e.ctrlKey||e.defaultPrevented||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();
    var d=e.deltaY*(e.deltaMode===1?32:e.deltaMode===2?innerHeight:1);
    go((raf?tgt:scrollY)+d);
  },{passive:false});
  addEventListener('scroll',function(){if(!raf){cur=tgt=scrollY}},{passive:true});
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[href*="#"]');
    if(!a||a.pathname!==location.pathname)return;
    var id=a.hash.slice(1),el=id&&document.getElementById(id);
    if(!el)return;
    e.preventDefault();
    go(id==='top'?0:el.getBoundingClientRect().top+scrollY);
    history.replaceState(null,'','#'+id);
    if(id==='main'){el.setAttribute('tabindex','-1');el.focus({preventScroll:true})}
  });
})();

/* Footer year */
(function(){var y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear()})();

/* Videos: play only while visible ------------------------------------------- */
(function(){
  'use strict';
  // no índice de Works (desktop), os vídeos das capas só tocam no hover — ver o bloco do índice
  var hoverIndex=matchMedia('(hover:hover) and (min-width:761px)').matches;
  var vids=[].slice.call(document.querySelectorAll('video[data-autoplay]')).filter(function(v){
    return !(hoverIndex&&v.closest('.cards[data-cat="works"]'));
  });
  if(!vids.length)return;
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  vids.forEach(function(v){v.muted=true;v.loop=true;v.playsInline=true;if(reduce)v.controls=true});
  if(reduce||!('IntersectionObserver' in window))return;
  var near=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.preload='auto';near.unobserve(e.target)}})},{rootMargin:'600px 0px'});
  var vis=new IntersectionObserver(function(en){
    en.forEach(function(e){var v=e.target;if(e.isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()});
  },{threshold:.15});
  vids.forEach(function(v){near.observe(v);vis.observe(v)});
})();

/* Current page in the menu ---------------------------------------------------- */
(function(){
  'use strict';
  var here=location.pathname;
  document.querySelectorAll('.bar nav a').forEach(function(a){
    var p=a.pathname;
    if(p!=='/'&&!a.hash&&here.indexOf(p)===0)a.setAttribute('aria-current','page');
  });
})();

/* Project pages: previous / next ---------------------------------------------- */
(function(){
  'use strict';
  var nav=document.querySelector('.proj-nav[data-cat]');
  if(!nav||!window.fetch||!window.DOMParser)return;
  fetch(nav.getAttribute('data-cat')).then(function(r){return r.ok?r.text():''}).then(function(t){
    if(!t)return;
    var doc=new DOMParser().parseFromString(t,'text/html');
    var cards=[].slice.call(doc.querySelectorAll('.cards .card')).map(function(c){
      var h=c.querySelector('h2,h3'),v=c.querySelector('.cv video'),so=c.querySelector('.cv source'),im=c.querySelector('.cv img');
      return{href:c.getAttribute('href'),title:h?h.textContent.trim():'',
        video:v?v.getAttribute('src'):'',poster:v?v.getAttribute('poster'):'',img:so?so.getAttribute('srcset'):im?im.getAttribute('src'):''};
    });
    var i=cards.map(function(c){return c.href}).indexOf(location.pathname);
    if(i<0||cards.length<2)return;
    var prev=cards[(i-1+cards.length)%cards.length],next=cards[(i+1)%cards.length];
    function link(c,cls,label){
      var a=document.createElement('a');a.className=cls;a.href=c.href;
      var s=document.createElement('span');s.textContent=label;
      var b=document.createElement('strong');b.textContent=c.title;
      a.appendChild(s);a.appendChild(b);
      // miniatura flutuante do projeto no hover (como no índice de Works)
      if(c.video||c.img||c.poster){
        var th=document.createElement('span');th.className='pn-thumb';th.setAttribute('aria-hidden','true');
        var m;
        if(c.video){m=document.createElement('video');m.muted=true;m.loop=true;m.playsInline=true;m.preload='none';if(c.poster)m.poster=c.poster;m.src=c.video}
        else{m=document.createElement('img');m.alt='';m.decoding='async';m.loading='lazy';m.src=c.img||c.poster}
        th.appendChild(m);a.appendChild(th);
        a.addEventListener('mouseenter',function(){if(m.tagName==='VIDEO'){var p=m.play();if(p&&p.catch)p.catch(function(){})}});
        a.addEventListener('mouseleave',function(){if(m.tagName==='VIDEO')m.pause()});
        a.addEventListener('mousemove',function(e){var r=a.getBoundingClientRect();a.style.setProperty('--mx',(((e.clientX-r.left)/r.width-.5)*40).toFixed(1)+'px')});
      }
      return a;
    }
    nav.appendChild(link(prev,'prev','← Previous'));
    nav.appendChild(link(next,'next','Next →'));
  }).catch(function(){});
})();

/* Home grid: images open their project ---------------------------------------- */
(function(){
  'use strict';
  if(window.__EDIT__)return;
  document.addEventListener('click',function(e){
    var f=e.target.closest&&e.target.closest('.ph[data-href]');
    if(f&&!e.defaultPrevented)location.href=f.getAttribute('data-href')+(location.search.indexOf('preview')>=0?'?preview':'');
  });
})();

/* Project gallery: editorial scattered grid ------------------------------------
   Images are placed on a 12-column grid with intentional white space: 1–3 per row,
   different sizes and masks (crops), aligned to the top or the bottom of the row,
   small captions on the image. Each page gets its own variation (seeded by the URL,
   or by data-seed on .mosaic, which the editor can reshuffle). data-fmt on a figure
   forces its mask; --ar is the natural ratio of the media. */
(function(){
  'use strict';
  var GAP=1;
  var F={cine:2.39,wide:16/9,land:1.5,sq:1,port:.8,tall:2/3};
  var SETS={v:['port','tall','sq'],h:['wide','land','cine'],s:['sq','port','land'],c:['cine','wide']};
  // [coluna inicial, largura em colunas, máscaras, alinhamento t(opo)/b(ase)]
  var DESK=[
    [[1,3,'v','t'],[7,4,'v','t'],[11,2,'v','t']],
    [[1,4,'v','t'],[5,2,'s','t'],[11,2,'v','t']],
    [[5,2,'s','t'],[7,2,'v','b'],[9,4,'v','b']],
    [[1,4,'v','t'],[7,2,'s','t']],
    [[3,6,'h','t'],[10,3,'v','t']],
    [[1,5,'h','b'],[8,2,'s','t'],[10,3,'v','t']],
    [[4,6,'c','t']],
    [[1,2,'s','t'],[3,3,'v','t'],[9,4,'h','t']],
    [[8,5,'v','t']],
    [[1,3,'h','t'],[4,3,'h','t'],[10,3,'s','b']],
    [[2,4,'h','b'],[8,3,'v','t']],
    [[1,7,'h','t'],[10,2,'v','b']]
  ];
  var MOB=[
    [[1,6,'h','t']],
    [[1,3,'v','t'],[4,3,'v','t']],
    [[2,4,'v','t']],
    [[1,4,'s','t'],[5,2,'v','b']],
    [[1,2,'v','b'],[3,4,'s','t']],
    [[3,4,'v','t']]
  ];

  function rng(seed){var x=0;for(var i=0;i<seed.length;i++)x=(x*31+seed.charCodeAt(i))|0;
    return function(){x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)%100000)/100000}}
  function crop(f,r){return Math.abs(Math.log(F[f]/r))}
  function best(it,set){
    if(it.fmt)return it.fmt;
    var b=SETS[set][0],bc=1e9;SETS[set].forEach(function(f){var c=crop(f,it.r);if(c<bc){bc=c;b=f}});
    return b;
  }
  // sorteia entre as máscaras do conjunto que não cortam demais (variedade de formatos)
  function pick(it,set,rand,prev){
    if(it.fmt)return it.fmt;
    var ok=SETS[set].filter(function(f){return crop(f,it.r)<=.62&&f!==prev});
    return ok.length?ok[Math.floor(rand()*ok.length)]:best(it,set);
  }
  function capText(fig){
    var m=fig.querySelector('img,video'),a=m?(m.getAttribute('alt')||m.getAttribute('aria-label')||''):'';
    a=a.split(/\s[–-]\s/).pop().replace(/%20|_/g,' ').replace(/\b(va|rnd|v\d+|\d{4}|\d+(-\d+)*)\b/gi,'').replace(/\s+/g,' ').trim();
    var pt=document.querySelector('.proj-title'),title=pt?(pt.getAttribute('aria-label')||pt.textContent):'';
    if(!a||title.toLowerCase().indexOf(a.toLowerCase())===0)a=title.trim();
    return a.length>40?a.slice(0,39)+'…':a;
  }
  // textos para os espaços ao lado das imagens: a nota escrita no editor (data-note) tem prioridade;
  // depois a descrição do projeto e a ficha técnica
  function notePool(){
    var pool=[],intro=document.querySelector('.proj-intro');
    if(intro&&intro.textContent.trim())pool.push({text:intro.textContent.trim()});
    var meta=[].map.call(document.querySelectorAll('.proj-meta>div'),function(d){
      var dt=d.querySelector('dt'),dd=d.querySelector('dd');return dt&&dd?[dt.textContent.trim(),dd.textContent.trim()]:null}).filter(Boolean);
    if(meta.length)pool.push({meta:meta});
    return pool;
  }
  function ann(m){
    var a=m.querySelector(':scope>.mosaic-ann');
    if(!a){a=document.createElement('div');a.className='mosaic-ann';a.setAttribute('aria-hidden','true');m.appendChild(a)}
    return a;
  }
  function mk(a,cls,key,fig){
    var e=fig[key];
    if(!e||e.parentNode!==a){e=document.createElement('div');e.className=cls;a.appendChild(e);fig[key]=e}
    return e;
  }
  function setHTML(e,v){if(e.__t!==v){e.__t=v;e.innerHTML=v}}
  function escH(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function layout(m){
    var figs=[].filter.call(m.children,function(c){return c.classList.contains('ph')});
    var cs=getComputedStyle(m),pl=parseFloat(cs.paddingLeft),pt=parseFloat(cs.paddingTop);
    var W=m.clientWidth-pl-parseFloat(cs.paddingRight);
    if(!figs.length||W<=0){m.classList.remove('is-laid');m.style.height='';return}
    var mobile=W<700,T=mobile?MOB:DESK,cols=mobile?6:12,colW=(W-GAP*(cols-1))/cols;
    var rowGap=mobile?Math.max(24,W*.08):Math.min(110,Math.max(40,W*.05));
    var rand=rng((m.getAttribute('data-seed')||'')+location.pathname);
    var A=ann(m),CAP=mobile?20:24,pool=[],rowN=0,used=[];   // textos laterais: só legenda + número (notePool fora)
    m.classList.add('has-ann');
    var items=figs.map(function(f,i){
      var r=parseFloat(f.style.getPropertyValue('--ar'));
      var cap=mk(A,'cap','__cap',f);
      setHTML(cap,'<span>'+escH(capText(f))+'</span><span>'+(i+1<10?'0':'')+(i+1)+'</span>');
      return {el:f,r:r>0?r:1.5,fmt:F[f.getAttribute('data-fmt')]?f.getAttribute('data-fmt'):null,cap:cap};
    });
    var y=0,i=0,hist=[];
    while(i<items.length){
      var left=items.length-i;
      // candidatos: cabem no que sobra, não repetem os 2 últimos; preferência para os que recortam menos
      var cands=T.map(function(t,k){
        if(t.length>left||hist.slice(-2).indexOf(k)>=0)return null;
        var c=0;for(var j=0;j<t.length;j++)c+=crop(best(items[i+j],t[j][2]),items[i+j].r);
        if(left-t.length===0)c-=.4;           // fecha certinho no fim
        if(i===0&&t.length<2&&left>1)c+=2;    // abertura com 2-3 imagens
        return {k:k,t:t,c:c/t.length+rand()*.55};
      }).filter(Boolean).sort(function(a,b){return a.c-b.c});
      if(!cands.length)cands=[{k:0,t:T[0].slice(0,1),c:0}];
      var ch=cands[0],tpl=ch.t,mirror=rand()<.5,rowH=0,cells=[],prev=null;
      // espelhado ou não, as imagens entram da esquerda para a direita (a numeração segue a leitura)
      var slots=tpl.map(function(sl){var c0=mirror?cols-(sl[0]+sl[1]-1)+1:sl[0];return [c0,sl[1],sl[2],sl[3]]})
        .sort(function(a,b){return a[0]-b[0]});
      slots.forEach(function(sl,j){
        var it=items[i+j],f=pick(it,sl[2],rand,prev),span=sl[1];prev=f;
        var w=span*colW+(span-1)*GAP,h=w/F[f];
        cells.push({it:it,f:f,c0:sl[0],span:span,x:(sl[0]-1)*(colW+GAP),w:w,h:h,al:sl[3]});rowH=Math.max(rowH,h+CAP);
      });
      // nota ao lado de uma imagem: nota própria (data-note) ou, em linhas alternadas, um texto do projeto
      var note=null;
      if(!mobile){
        var occ=[];cells.forEach(function(c){for(var k=c.c0;k<c.c0+c.span;k++)occ[k]=1});
        for(var q=0;q<cells.length&&!note;q++){
          var c=cells[q],own=c.it.el.getAttribute('data-note');
          if(!own&&(rowN%2||rowN===0))continue;   // sem texto automático na primeira linha
          var sides=[[c.c0+c.span,1],[c.c0-1,-1]];
          for(var sdx=0;sdx<2&&!note;sdx++){
            var st0=sides[sdx][0],dir=sides[sdx][1],free=0;
            while(free<3&&st0+dir*free>=1&&st0+dir*free<=cols&&!occ[st0+dir*free])free++;
            if(free>=2){
              var span2=Math.min(3,free),cs0=dir>0?st0:st0-span2+1;
              var txt=own?{text:own}:pool.length?pool.shift():{title:capText(c.it.el),sub:'Frame '+(items.indexOf(c.it)+1<10?'0':'')+(items.indexOf(c.it)+1)+' / '+items.length};
              note={cell:c,c0:cs0,span:span2,text:txt,side:dir};
            }
          }
        }
      }
      var noteEl=null;
      if(note){
        noteEl=mk(A,'note','__note',note.cell.it.el);
        var nt=note.text,html=nt.title?'<h4>'+escH(nt.title)+'</h4><span>'+escH(nt.sub)+'</span>':nt.meta?'<dl>'+nt.meta.map(function(pp){return '<div><dt>'+escH(pp[0])+'</dt><dd>'+escH(pp[1])+'</dd></div>'}).join('')+'</dl>':'<p>'+escH(nt.text)+'</p>';
        setHTML(noteEl,html);
        var nw=note.span*colW+(note.span-1)*GAP-14;
        noteEl.style.width=nw.toFixed(0)+'px';noteEl.classList.toggle('is-left',note.side<0);
        rowH=Math.max(rowH,noteEl.offsetHeight);
        used.push(noteEl);
      }
      cells.forEach(function(c){
        var st=c.it.el.style,top=c.al==='b'?y+rowH-c.h-CAP:y;
        st.left=(pl+c.x).toFixed(2)+'px';st.top=(pt+top).toFixed(2)+'px';
        st.width=c.w.toFixed(2)+'px';st.height=c.h.toFixed(2)+'px';
        c.it.el.setAttribute('data-mask',c.f);
        var cp=c.it.cap.style;cp.left=(pl+c.x).toFixed(2)+'px';cp.top=(pt+top+c.h+7).toFixed(2)+'px';cp.width=c.w.toFixed(2)+'px';
        c.it.cap.classList.toggle('is-small',c.w<170);
        if(note&&note.cell===c){
          var ns=noteEl.style;ns.left=(pl+(note.c0-1)*(colW+GAP)+(note.side>0?14:0)).toFixed(2)+'px';ns.top=(pt+top).toFixed(2)+'px';
        }
      });
      hist.push(ch.k);i+=tpl.length;y+=rowH+rowGap;rowN++;
    }
    // remove notas que não couberam nesta composição
    [].slice.call(A.querySelectorAll('.note')).forEach(function(n){if(used.indexOf(n)<0)n.remove()});
    m.style.height=(pt+y-rowGap)+'px';
    m.classList.add('is-laid');
  }
  var ms=[].slice.call(document.querySelectorAll('.mosaic'));
  if(!ms.length)return;
  var raf=0,lastW=[];
  function all(){cancelAnimationFrame(raf);raf=requestAnimationFrame(function(){ms.forEach(layout)})}
  all();
  if('ResizeObserver' in window){var ro=new ResizeObserver(function(){
    var w=ms.map(function(m){return m.clientWidth}).join();if(w!==lastW){lastW=w;all()}});ms.forEach(function(m){ro.observe(m)})}
  else addEventListener('resize',all);
  // o editor adiciona / move / remove itens, muda máscara ou sorteia nova variação
  if('MutationObserver' in window)ms.forEach(function(m){new MutationObserver(function(list){
    // mudanças só na camada de legendas/notas não refazem o layout (evita loop)
    if(list.some(function(r){var t=r.target.nodeType===1?r.target:r.target.parentNode;return !(t&&t.closest&&t.closest('.mosaic-ann'))}))all();
  }).observe(m,{childList:true,subtree:true,attributes:true,attributeFilter:['data-fmt','data-seed','data-note','alt','aria-label']})});
})();

/* Project pages: entrance + scroll animations ----------------------------------
   Title letters rise, head text staggers in, the cover opens like a curtain, and
   each gallery image is revealed by a mask (random direction, left-to-right wave
   within a row) as it scrolls into view, then drifts with a light parallax. */
(function(){
  'use strict';
  if(window.__EDIT__||matchMedia('(prefers-reduced-motion:reduce)').matches||!('IntersectionObserver' in window))return;
  if(!document.querySelector('main.proj'))return;
  var root=document.documentElement;root.classList.add('js-anim');

  // título: letra a letra (as palavras não quebram no meio)
  var t=document.querySelector('.proj-title'),k=0;
  if(t&&!t.children.length){
    var words=t.textContent.trim().split(/\s+/);
    t.setAttribute('aria-label',words.join(' '));t.textContent='';
    words.forEach(function(w,wi){
      var sw=document.createElement('span');sw.className='w';sw.setAttribute('aria-hidden','true');
      w.split('').forEach(function(ch){var c=document.createElement('span');c.className='c';c.style.setProperty('--i',k++);c.textContent=ch;sw.appendChild(c)});
      t.appendChild(sw);if(wi<words.length-1)t.appendChild(document.createTextNode(' '));
    });
  }
  // cabeçalho do projeto em sequência
  [].forEach.call(document.querySelectorAll('.crumb,.proj-intro,.proj-meta>div'),function(el,i){
    el.style.setProperty('--d',(.25+k*.03+i*.09).toFixed(2)+'s');
  });
  requestAnimationFrame(function(){requestAnimationFrame(function(){root.classList.add('anim-ready')})});

  // galeria: máscara em direção variada, onda da esquerda para a direita
  var seed=0;for(var i=0;i<location.pathname.length;i++)seed=(seed*31+location.pathname.charCodeAt(i))|0;
  function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)%1000)/1000}
  var DIRS=['up','up','left','right','down'];
  var figs=[].slice.call(document.querySelectorAll('.mosaic>.ph'));
  figs.forEach(function(f){f.setAttribute('data-rv',DIRS[Math.floor(rnd()*DIRS.length)])});
  var io=new IntersectionObserver(function(en){
    en.forEach(function(e){
      if(!e.isIntersecting)return;
      var f=e.target,m=f.parentElement,x=parseFloat(f.style.left)||0,W=m.clientWidth||1;
      f.style.setProperty('--d',(x/W*.45+rnd()*.12).toFixed(2)+'s');
      f.classList.add('in');io.unobserve(f);
      [f.__cap,f.__note].forEach(function(a){if(a){a.style.setProperty('--d',f.style.getPropertyValue('--d'));a.classList.add('in')}});
    });
  },{threshold:0,rootMargin:'0px 0px -8% 0px'});  // threshold 0: a máscara inicial zera a área visível
  // só observa depois que o grid calculou as posições finais (antes disso tudo está empilhado no topo)
  (function waitLaid(n){
    var m=document.querySelector('.mosaic');
    if(!m||m.classList.contains('is-laid')||n>120){requestAnimationFrame(function(){figs.forEach(function(f){io.observe(f)})});return}
    requestAnimationFrame(function(){waitLaid(n+1)});
  })(0);
  var nav=document.querySelector('.proj-nav');
  if(nav){var io2=new IntersectionObserver(function(en){if(en[0].isIntersecting){nav.classList.add('in');io2.disconnect()}},{threshold:.3});io2.observe(nav)}

  // parallax leve da mídia dentro da moldura
  var par=figs.concat([].slice.call(document.querySelectorAll('.proj-cover .ph'))),tick=false;
  function update(){
    tick=false;var vh=innerHeight;
    par.forEach(function(f){
      var r=f.getBoundingClientRect();if(r.bottom<-50||r.top>vh+50)return;
      var p=((r.top+r.height/2)-vh/2)/vh;p=Math.max(-1,Math.min(1,p));
      f.style.setProperty('--py',(-p*r.height*.045).toFixed(1)+'px');
    });
  }
  addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(update)}},{passive:true});
  addEventListener('resize',update);update();
})();

/* Home (after the hero): reveal animations for the selected-works grid and the about section */
(function(){
  'use strict';
  if(window.__EDIT__||matchMedia('(prefers-reduced-motion:reduce)').matches||!('IntersectionObserver' in window))return;
  if(!document.body.classList.contains('page-home'))return;
  document.documentElement.classList.add('js-anim');
  var seed=7;function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)%1000)/1000}
  var DIRS=['up','up','left','right','down'];
  var figs=[].slice.call(document.querySelectorAll('.feat-grid .ph'));
  figs.forEach(function(f){
    f.setAttribute('data-rv',DIRS[Math.floor(rnd()*DIRS.length)]);
    var c=(f.style.gridColumn.match(/\d+/)||[1])[0];
    f.style.setProperty('--d',((c-1)/12*.45+rnd()*.12).toFixed(2)+'s');   // onda da esquerda para a direita
  });
  // VIN gigante: letra a letra
  var big=document.querySelector('.grey .big');
  if(big&&!big.children.length){
    var t=big.textContent;big.textContent='';
    t.split('').forEach(function(ch,i){var c=document.createElement('span');c.className='c';c.style.setProperty('--i',i);c.textContent=ch;big.appendChild(c)});
  }
  [].forEach.call(document.querySelectorAll('.grey .cols'),function(c){[].forEach.call(c.children,function(el,i){el.style.setProperty('--i',i)})});
  [].forEach.call(document.querySelectorAll('.grey .clients li'),function(li,i){li.style.setProperty('--i',i)});

  var targets=figs.concat([].slice.call(document.querySelectorAll('.feat-grid .lab,.feat-h,.grey .cols,.grey .clients,.grey .big')));
  var io=new IntersectionObserver(function(en){
    en.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}});
  },{threshold:0,rootMargin:'0px 0px -10% 0px'});
  targets.forEach(function(el){io.observe(el)});

  // parallax leve nas imagens
  var tick=false;
  function update(){
    tick=false;var vh=innerHeight;
    figs.forEach(function(f){
      var r=f.getBoundingClientRect();if(r.bottom<-50||r.top>vh+50)return;
      var p=Math.max(-1,Math.min(1,((r.top+r.height/2)-vh/2)/vh));
      f.style.setProperty('--py',(-p*r.height*.045).toFixed(1)+'px');
    });
  }
  addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(update)}},{passive:true});
  addEventListener('resize',update);update();
})();

/* Art / Lab: stacked sheets — each sheet a little wider than the one above */
(function(){
  'use strict';
  [].forEach.call(document.querySelectorAll('.cards[data-cat="art"], .cards[data-cat="lab"]'),function(list){
    list.classList.add('is-stack');
    [].forEach.call(list.querySelectorAll('.card'),function(c,i){c.style.setProperty('--k',i)});
  });
})();

/* Works: typographic index with hover thumbnails ------------------------------- */
(function(){
  'use strict';
  var list=document.querySelector('.cards[data-cat="works"]');
  if(!list)return;
  list.classList.add('is-index');
  // segunda miniatura: uma imagem do próprio projeto, sorteada a cada hover (lista do carrossel)
  var pool={};
  if(window.fetch)fetch('/assets/carousel.json').then(function(r){return r.ok?r.json():[]}).then(function(a){
    (a||[]).forEach(function(u){var s=u.split('/').pop().split('--')[0];(pool[s]=pool[s]||[]).push(u)});
  }).catch(function(){});
  [].forEach.call(list.querySelectorAll('.card'),function(card){
    var t2=document.createElement('img');t2.className='thumb2';t2.alt='';t2.setAttribute('aria-hidden','true');t2.hidden=true;t2.decoding='async';
    card.appendChild(t2);
    var slug=(card.getAttribute('href')||'').split('/').filter(Boolean).pop(),last=-1;
    card.addEventListener('mouseenter',function(){
      var l=pool[slug];
      if(l&&l.length){var i=Math.floor(Math.random()*l.length);if(l.length>1&&i===last)i=(i+1)%l.length;last=i;t2.src=l[i];t2.hidden=false}
      var v=card.querySelector('.cv video');if(v){v.muted=true;v.loop=true;v.preload='auto';var p=v.play();if(p&&p.catch)p.catch(function(){})}
    });
    card.addEventListener('mouseleave',function(){var v=card.querySelector('.cv video');if(v)v.pause()});
    card.addEventListener('mousemove',function(e){
      var r=card.getBoundingClientRect();
      card.style.setProperty('--mx',(((e.clientX-r.left)/r.width-.5)*70).toFixed(1)+'px');
    });
  });
})();

/* Category pages (Works / Art / Lab): title letters, intro, and the list/grid revealed in sequence */
(function(){
  'use strict';
  if(window.__EDIT__||matchMedia('(prefers-reduced-motion:reduce)').matches||!('IntersectionObserver' in window))return;
  if(!document.querySelector('main.cat'))return;
  var root=document.documentElement;root.classList.add('js-anim');
  var t=document.querySelector('.cat-title'),k=0;
  if(t&&!t.children.length){
    var words=t.textContent.trim().split(/\s+/);t.setAttribute('aria-label',words.join(' '));t.textContent='';
    words.forEach(function(w,wi){
      var sw=document.createElement('span');sw.className='w';sw.setAttribute('aria-hidden','true');
      w.split('').forEach(function(ch){var c=document.createElement('span');c.className='c';c.style.setProperty('--i',k++);c.textContent=ch;sw.appendChild(c)});
      t.appendChild(sw);if(wi<words.length-1)t.appendChild(document.createTextNode(' '));
    });
  }
  requestAnimationFrame(function(){requestAnimationFrame(function(){root.classList.add('anim-ready')})});

  var cards=[].slice.call(document.querySelectorAll('.cards .card'));
  cards.forEach(function(c){
    var h=c.querySelector('.card-t h2, .card-t h3');
    if(h&&!h.querySelector('.l')){var s=document.createElement('span');s.className='l';while(h.firstChild)s.appendChild(h.firstChild);h.appendChild(s)}
  });
  // cada lote que entra na tela anima em sequência (de cima para baixo / da esquerda para a direita)
  var start=performance.now()+450,batch=0,lastT=0;
  var io=new IntersectionObserver(function(en){
    var now=performance.now();if(now-lastT>200)batch=0;lastT=now;
    en.filter(function(e){return e.isIntersecting}).sort(function(a,b){return cards.indexOf(a.target)-cards.indexOf(b.target)}).forEach(function(e){
      var wait=Math.max(0,start-now)/1000;           // na abertura, espera o título
      e.target.style.setProperty('--d',(wait+batch*.07).toFixed(2)+'s');batch++;
      e.target.classList.add('in');io.unobserve(e.target);
    });
  },{threshold:0,rootMargin:'0px 0px -6% 0px'});
  cards.forEach(function(c){io.observe(c)});
})();

/* Home: on the first visit, gently scroll down to show the work section, then back up */
(function(){
  'use strict';
  if(window.__EDIT__||!document.body.classList.contains('page-home'))return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches||location.hash)return;
  try{if(sessionStorage.getItem('vaTeased'))return;sessionStorage.setItem('vaTeased','1')}catch(e){}
  var target=document.querySelector('.feat-grid')||document.querySelector('.sub');
  if(!target)return;
  var raf=0,cancelled=false,timer=0;
  function stop(){cancelled=true;cancelAnimationFrame(raf);clearTimeout(timer);off()}
  var evs=['wheel','touchstart','keydown','mousedown','pointerdown'];
  function off(){evs.forEach(function(ev){removeEventListener(ev,stop,{capture:true})})}
  evs.forEach(function(ev){addEventListener(ev,stop,{capture:true,passive:true})});
  function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function glide(to,dur,done){
    var from=scrollY,t0=0;
    function step(t){
      if(cancelled)return;
      if(!t0)t0=t;
      var p=Math.min(1,(t-t0)/dur);
      scrollTo(0,from+(to-from)*ease(p));
      if(p<1)raf=requestAnimationFrame(step);else if(done)done();
    }
    raf=requestAnimationFrame(step);
  }
  timer=setTimeout(function(){
    if(cancelled||scrollY>20)return off();
    var max=document.documentElement.scrollHeight-innerHeight;
    var to=Math.min(max,target.getBoundingClientRect().top+scrollY-innerHeight*.3);
    if(to<innerHeight*.25)return off();
    glide(to,1700,function(){
      timer=setTimeout(function(){glide(0,1500,off)},1500);
    });
  },3600);
})();

/* 3D card on hover (home grid + project galleries): tilts with the mouse, floats,
   content moves in depth, light glare follows the cursor */
(function(){
  'use strict';
  if(window.__EDIT__||!matchMedia('(hover:hover)').matches||matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var figs=[].slice.call(document.querySelectorAll('.feat-grid .ph, .mosaic>.ph'));
  figs.forEach(function(f){
    var g=document.createElement('i');g.className='glare';g.setAttribute('aria-hidden','true');f.appendChild(g);
    f.addEventListener('pointerenter',function(){f.classList.remove('was-hover');f.classList.add('is-hover')});
    f.addEventListener('pointermove',function(e){
      var r=f.getBoundingClientRect();if(!r.width||!r.height)return;
      var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      f.style.setProperty('--rx',(-y*14).toFixed(2)+'deg');       // inclina para cima/baixo
      f.style.setProperty('--ry',(x*18).toFixed(2)+'deg');        // gira para os lados
      f.style.setProperty('--mx',(-x*r.width*.05).toFixed(1)+'px');   // conteúdo em profundidade
      f.style.setProperty('--my',(-y*r.height*.05).toFixed(1)+'px');
      f.style.setProperty('--lx',((x+.5)*100).toFixed(1)+'%');      // reflexo segue o mouse
      f.style.setProperty('--ly',((y+.5)*100).toFixed(1)+'%');
    });
    f.addEventListener('pointerleave',function(){
      f.classList.remove('is-hover');f.classList.add('was-hover');
      ['--mx','--my'].forEach(function(k){f.style.setProperty(k,'0px')});
      ['--rx','--ry'].forEach(function(k){f.style.setProperty(k,'0deg')});
    });
  });
})();

/* Home: indicador de rolagem perto do nome ------------------------------------- */
(function(){
  'use strict';
  var h=document.querySelector('.hero h1');
  if(!h||!window.matchMedia||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  var cue=document.createElement('div');cue.className='scroll-cue';cue.setAttribute('aria-hidden','true');
  cue.innerHTML='<i class="mouse"></i><i class="arr"></i><span>Scroll</span>';
  document.body.appendChild(cue);
  var NEAR=90,on=false,tx=0,ty=0,x=0,y=0,raf=0;
  function tick(){
    x+=(tx-x)*.2;y+=(ty-y)*.2;
    cue.style.setProperty('--x',x.toFixed(1)+'px');cue.style.setProperty('--y',y.toFixed(1)+'px');
    raf=(Math.abs(tx-x)>.3||Math.abs(ty-y)>.3)?requestAnimationFrame(tick):0;
  }
  function set(v){if(v!==on){on=v;cue.classList.toggle('on',v);h.classList.toggle('cue-on',v)}}
  addEventListener('mousemove',function(e){
    var r=h.getBoundingClientRect();
    var near=!document.documentElement.classList.contains('ve-on')&&scrollY<120&&e.clientX>r.left-NEAR&&e.clientX<r.right+NEAR&&e.clientY>r.top-NEAR&&e.clientY<r.bottom+NEAR;
    tx=e.clientX+26;ty=e.clientY-cue.offsetHeight/2;
    if(near&&!on){x=tx;y=ty}
    set(near);
    if(!raf)raf=requestAnimationFrame(tick);
  },{passive:true});
  addEventListener('scroll',function(){if(scrollY>=120)set(false)},{passive:true});
  document.addEventListener('mouseleave',function(){set(false)});
  h.addEventListener('click',function(){
    if(!on)return;
    var m=document.getElementById('main');
    if(m)window.scrollTo({top:m.getBoundingClientRect().top+scrollY,behavior:'smooth'});
  });
})();

/* Home: VIN com efeito líquido quando o mouse passa ----------------------------- */
(function(){
  'use strict';
  var big=document.querySelector('.grey .big');
  if(!big||!window.matchMedia||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var N=24,cv,gl,prog,tex,U={},trail=[],hover=0,want=0,raf=0,last=0,mouse=[-1e4,-1e4],ready=false,dpr=1,W=0,H=0;
  var VS='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FS='precision highp float;uniform sampler2D T;uniform vec2 R,M;uniform float t,h,rad;uniform vec4 P['+N+'];uniform float A['+N+'];uniform vec3 C;'+
    'void main(){vec2 f=gl_FragCoord.xy;vec2 o=vec2(0.);'+
    'for(int i=0;i<'+N+';i++){vec2 d=f-P[i].xy;float w=exp(-dot(d,d)/(rad*rad))*A[i];o+=P[i].zw*w;'+
      'o+=vec2(-d.y,d.x)/rad*w*A[i]*rad*.18*sin(t*2.+float(i));}'+
    'vec2 d=f-M;float r=length(d);'+
    'o+=(r>0.?d/r:vec2(0.))*sin(r/(rad*.22)-t*5.)*exp(-r/(rad*1.6))*rad*.07*h;'+
    'o+=vec2(sin(f.y/(rad*.5)+t*1.7),cos(f.x/(rad*.6)+t*1.3))*rad*.025*h*exp(-r/(rad*3.));'+
    'float a=texture2D(T,(f-o)/R).a;gl_FragColor=vec4(C*a,a);}';
  function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null}
  function init(){
    cv=document.createElement('canvas');cv.className='big-liq';cv.setAttribute('aria-hidden','true');
    gl=cv.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:false});
    if(!gl)return false;
    var v=sh(gl.VERTEX_SHADER,VS),f=sh(gl.FRAGMENT_SHADER,FS);if(!v||!f)return false;
    prog=gl.createProgram();gl.attachShader(prog,v);gl.attachShader(prog,f);gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS))return false;
    gl.useProgram(prog);
    var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    var loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    ['T','R','M','t','h','rad','P','A','C'].forEach(function(n){U[n]=gl.getUniformLocation(prog,n)});
    tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    big.appendChild(cv);
    return true;
  }
  // desenha as letras exatamente onde o navegador as colocou
  function paint(){
    var br=big.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);
    W=Math.round(br.width*dpr);H=Math.round(br.height*dpr);cv.width=W;cv.height=H;
    var c2=document.createElement('canvas');c2.width=W;c2.height=H;var x=c2.getContext('2d');
    var cs=getComputedStyle(big);x.font=cs.fontStyle+' '+cs.fontWeight+' '+parseFloat(cs.fontSize)*dpr+'px '+cs.fontFamily;
    x.textBaseline='alphabetic';x.fillStyle='#000';
    var asc=x.measureText('VIN').fontBoundingBoxAscent||parseFloat(cs.fontSize)*dpr*.9;
    [].forEach.call(big.querySelectorAll('.c'),function(s){
      var rg=document.createRange();rg.selectNodeContents(s);var r=rg.getBoundingClientRect();
      x.fillText(s.textContent,(r.left-br.left)*dpr,(r.top-br.top)*dpr+asc);
    });
    gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c2);
    gl.viewport(0,0,W,H);
    var col=getComputedStyle(big).color.match(/[\d.]+/g)||[0,0,0];
    gl.uniform3f(U.C,col[0]/255,col[1]/255,col[2]/255);
  }
  function frame(now){
    var dt=Math.min(.05,(now-(last||now))/1000);last=now;
    hover+=(want-hover)*Math.min(1,dt*4);
    trail.forEach(function(p){p.a-=dt*1.1});trail=trail.filter(function(p){return p.a>0});
    var P=new Float32Array(N*4),A=new Float32Array(N);
    trail.slice(-N).forEach(function(p,i){P[i*4]=p.x;P[i*4+1]=p.y;P[i*4+2]=p.vx;P[i*4+3]=p.vy;A[i]=p.a*p.a});
    gl.uniform1i(U.T,0);gl.uniform2f(U.R,W,H);gl.uniform2f(U.M,mouse[0],mouse[1]);
    gl.uniform1f(U.t,now/1000);gl.uniform1f(U.h,hover);gl.uniform1f(U.rad,Math.max(60,H*.16));
    gl.uniform4fv(U.P,P);gl.uniform1fv(U.A,A);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    raf=(trail.length||hover>.002||want)?requestAnimationFrame(frame):0;
    if(!raf){last=0;gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
  }
  function start(){if(!raf)raf=requestAnimationFrame(frame)}
  var px=null,inside=false;
  function setup(){
    if(ready)return true;
    if(!big.classList.contains('in'))return false;
    // só depois que as letras terminaram de subir
    if([].some.call(big.querySelectorAll('.c'),function(s){var m=getComputedStyle(s).transform;return m&&m!=='none'&&!/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(m)}))return false;
    if(!init())return false;
    big.classList.add('liq');paint();ready=true;
    addEventListener('resize',function(){paint();start()});
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){paint();start()});
    return true;
  }
  big.addEventListener('mouseenter',function(){
    // espera a animação de entrada das letras terminar
    inside=true;(function go(n){if(!inside)return;if(setup()){want=1;start()}else if(n>0)setTimeout(function(){go(n-1)},250)})(12);
  });
  big.addEventListener('mouseleave',function(){inside=false;want=0;px=null;if(ready)start()});
  big.addEventListener('mousemove',function(e){
    if(!ready)return;
    var r=big.getBoundingClientRect(),x=(e.clientX-r.left)*dpr,y=(r.bottom-e.clientY)*dpr;
    mouse=[x,y];
    if(px){var vx=x-px[0],vy=y-px[1],m=Math.hypot(vx,vy),k=m>60?60/m:1;trail.push({x:x,y:y,vx:vx*k*1.6,vy:vy*k*1.6,a:1})}
    px=[x,y];if(trail.length>N*3)trail.splice(0,trail.length-N*3);
    want=1;start();
  });
})();

/* About: abre por cima do site, fundo preto, com Close ---------------------------- */
(function(){
  'use strict';
  var D=document,H=D.documentElement,layer=null,pushed=false,cache=null;
  // ajusta os títulos grandes para ocuparem a largura disponível
  function fit(root){
    [].forEach.call(root.querySelectorAll('.ab-kicker,.ab-year'),function(el){
      var box=el.parentElement,cs=getComputedStyle(box);
      var w=box.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      el.style.fontSize='100px';
      var rg=D.createRange();rg.selectNodeContents(el);var tw=rg.getBoundingClientRect().width;
      if(tw>0)el.style.fontSize=(100*w/tw*.995).toFixed(2)+'px';
    });
  }
  // texto em mono "decodificando": letras aleatórias que se resolvem da esquerda para a direita
  function scramble(el,delay){
    var nodes=[],w=D.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),n;
    while((n=w.nextNode()))if(n.nodeValue.trim())nodes.push([n,n.nodeValue]);
    var len=nodes.reduce(function(s,a){return s+a[1].length},0),dur=450+len*9,G='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#—·';
    setTimeout(function(){
      el.style.visibility='visible';var t0=performance.now();
      (function f(now){
        var p=Math.min(1,(now-t0)/dur),k=0;
        nodes.forEach(function(a){
          var s='';for(var i=0;i<a[1].length;i++,k++){var c=a[1][i];s+=(c===' '||k<p*len*1.1-2)?c:G[Math.random()*G.length|0]}
          a[0].nodeValue=s;
        });
        if(p<1)requestAnimationFrame(f);else nodes.forEach(function(a){a[0].nodeValue=a[1]});
      })(t0);
    },delay);
  }
  function count(el,from,to,delay,dur){
    el.textContent=('0'+from).slice(-2);
    setTimeout(function(){
      var t0=performance.now();
      (function f(now){
        var p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);
        el.textContent=('0'+Math.round(from+(to-from)*e)).slice(-2);
        if(p<1)requestAnimationFrame(f);
      })(t0);
    },delay);
  }
  function anim(ab){
    var k=ab.querySelector('.ab-kicker');
    if(k&&!k.querySelector('.w')){
      k.innerHTML=k.textContent.trim().split(/\s+/).map(function(w){return '<span class="w"><span>'+w.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span></span>'}).join(' ');
      fit(ab);
    }
    [].forEach.call(ab.querySelectorAll('.ab-kicker .w>span'),function(s,i){s.style.setProperty('--d',(i*.045).toFixed(3)+'s')});
    [].forEach.call(ab.querySelectorAll('.ab-note>p'),function(s,i){s.style.setProperty('--d',(.6+i*.13).toFixed(2)+'s')});
    var scr=[].slice.call(ab.querySelectorAll('.ab-meta>span,.ab-lines p,.ab-foot>p:last-child'));
    scr.forEach(function(s){s.setAttribute('data-scr','')});
    ab.classList.add('ab-anim');
    var c=ab.querySelector('.ab-cnt');if(c)count(c,6,27,800,1300);
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      ab.classList.add('in');
      scr.forEach(function(s,i){scramble(s,(s.closest('.ab-meta')?300:950)+i*55)});
    })});
  }
  function refit(root){fit(root);if(D.fonts&&D.fonts.ready)D.fonts.ready.then(function(){fit(root)})}

  // intro: letras de VINICIUS ARAUJO esticando numa coluna que rola, depois se multiplica e recolhe
  function intro(host,done){
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){done();return}
    var cv=D.createElement('canvas'),x=cv.getContext('2d');
    if(!x){done();return}
    cv.className='ab-intro';cv.setAttribute('aria-hidden','true');host.appendChild(cv);
    var dpr=Math.min(devicePixelRatio||1,2),W,H,TXT='VINICIUSARAUJO',F='800 200px "Inter Tight","Archivo Black",sans-serif',m={},t0=0,end=false,raf;
    function size(){W=cv.width=Math.round(innerWidth*dpr);H=cv.height=Math.round(innerHeight*dpr)}
    function metr(){
      x.font=F;
      TXT.split('').forEach(function(c){var k=x.measureText(c);m[c]={w:k.width,a:k.actualBoundingBoxAscent,h:k.actualBoundingBoxAscent+k.actualBoundingBoxDescent}});
      m.M2=x.measureText('M').width;
    }
    function ease(v){v=Math.max(0,Math.min(1,v));return .5-.5*Math.cos(Math.PI*v)}
    function col(cx,cw,top,hh,s,dir){
      var N=4.2,sx=cw*.9/m.M2;
      for(var k=Math.floor(-s)-2;k<Math.ceil(N-s)+2;k++){
        var u0=(k+s)/N,u1=(k+1+s)/N;if(u1<=0||u0>=1)continue;
        var y0=top+hh*ease(u0),y1=top+hh*ease(u1),h=y1-y0;if(h<.5)continue;
        var i=((dir>0?k:-k)%TXT.length+TXT.length)%TXT.length,c=TXT[i],g=m[c];
        x.save();x.translate(cx,y0);x.scale(sx,h/g.h);x.fillText(c,-g.w/2,g.a);x.restore();
      }
    }
    function frame(now){
      if(!t0)t0=now;var t=(now-t0)/1000;
      x.setTransform(1,0,0,1,0,0);x.fillStyle='#000';x.fillRect(0,0,W,H);x.fillStyle='#ecebe6';x.font=F;
      var n=t<.95?1:t<1.45?3:5;                         // cortes secos: 1 → 3 → 5 colunas
      var cw=n===1?Math.min(W*.34,H*.5):W/n;
      var out=ease((t-1.95)/.45);                        // recolhe para cima no final
      var hh=H*(1-out),top=0;
      for(var j=0;j<n;j++){
        var cx=n===1?W/2:cw*(j+.5),dir=j%2?-1:1;
        col(cx,cw,top,hh,(t*3.2+j*.7)*dir,dir);
      }
      if(t<2.45&&!end)raf=requestAnimationFrame(frame);else finish();
    }
    function finish(){
      if(end)return;end=true;cancelAnimationFrame(raf);
      cv.style.opacity='0';setTimeout(function(){cv.remove()},380);done();
    }
    size();
    cv.addEventListener('click',finish);
    addEventListener('keydown',function k(){removeEventListener('keydown',k);finish()});
    var go=function(){metr();raf=requestAnimationFrame(frame)};
    if(D.fonts&&D.fonts.load)Promise.race([D.fonts.load(F,TXT),new Promise(function(r){setTimeout(r,400)})]).then(go,go);else go();
  }
  // página /about/ aberta direto
  var page=D.querySelector('body.ab-page .ab');
  if(page){
    refit(page);intro(page,function(){anim(page)});
    addEventListener('resize',function(){fit(page)});
  }
})();

/* Works (projetos): o banner encolhe conforme a página rola ----------------------- */
(function(){
  'use strict';
  var f=document.querySelector('.proj-cover .ph');
  if(!f||location.pathname.indexOf('/works/')!==0)return;
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  var MIN=.78,tick=false,top0=0,h=0;
  f.style.transformOrigin='0 100%';                 // canto de baixo à esquerda fica fixo
  function measure(){var r=f.getBoundingClientRect();top0=r.top+scrollY;h=r.height||1}
  function update(){
    tick=false;
    var p=Math.max(0,Math.min(1,scrollY/(top0+h*.9)));
    p=p*p*(3-2*p);                                   // suave no começo e no fim
    f.style.scale=(1-(1-MIN)*p).toFixed(4);
  }
  function req(){if(!tick){tick=true;requestAnimationFrame(update)}}
  measure();update();
  addEventListener('scroll',req,{passive:true});
  addEventListener('resize',function(){f.style.scale='';measure();req()});
})();
