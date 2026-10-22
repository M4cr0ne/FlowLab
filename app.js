/* FlowLab — editor, execution controls, import/export and local persistence. */
(function(){
'use strict';
const L=window.FlowLogic;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STAGE_W=1800,STAGE_H=1300,STORE='flowlab-project-v1';
const typeName={start:'INIZIO',process:'OPERAZIONE',input:'INPUT',decision:'DECISIONE',output:'OUTPUT',end:'FINE'};
const subtitle={start:'Punto di partenza',process:'Istruzioni',input:'Richiesta di dati',decision:'Condizione logica',output:'Visualizza un dato',end:'Conclusione'};
let graph,selected=null,pending=null,zoom=1,drag=null,history=[],historyIndex=-1,sim=null,automatic=false,runTimer=null,toastTimer=null,confirmation=null,autosaveTimer=null,visitedEditor=false;
function uid(prefix){return prefix+Math.random().toString(36).slice(2,10);}
function getNode(id){return graph.nodes.find(n=>n.id===id);}
function save(){try{localStorage.setItem(STORE,JSON.stringify(graph));$('save-status').textContent='Salvato su questo dispositivo';}catch(e){$('save-status').textContent='Impossibile salvare nel browser';}}
function scheduleSave(){clearTimeout(autosaveTimer);autosaveTimer=setTimeout(save,180);}
function cloneGraph(){return JSON.stringify(graph);}
function updateUndoButtons(){$('undo-btn').disabled=historyIndex<1;$('redo-btn').disabled=historyIndex>=history.length-1;}
function checkpoint(){const state=cloneGraph();if(history[historyIndex]===state){scheduleSave();return;}history=history.slice(0,historyIndex+1);history.push(state);if(history.length>70)history.shift();historyIndex=history.length-1;updateUndoButtons();scheduleSave();}
function pushInitialHistory(){history=[cloneGraph()];historyIndex=0;updateUndoButtons();}
function undo(direction){let i=historyIndex+direction;if(i<0||i>=history.length)return;historyIndex=i;graph=JSON.parse(history[historyIndex]);selected=null;cancelConnection();resetSimulation();renderAll();save();}
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3200);}
function openView(page){if(!['impara','laboratorio','esempi','guida'].includes(page))page='impara';document.querySelectorAll('main.page').forEach(el=>{el.hidden=el.id!=='view-'+page;el.classList.toggle('active',!el.hidden);});document.querySelectorAll('.nav-link').forEach(el=>el.classList.toggle('active',el.dataset.target===page));if(location.hash.slice(1)!==page)historyReplace(page);window.scrollTo({top:0,behavior:'instant'});if(page==='laboratorio'){requestAnimationFrame(()=>{setZoom(zoom,false);if(!visitedEditor){focusGraph();visitedEditor=true;}});}}
function historyReplace(page){window.history.replaceState(null,'','#'+page);}
function loadGraph(next,notification){graph=L.checkGraph(next);selected=null;cancelConnection();resetSimulation();pushInitialHistory();renderAll();save();if(notification)toast(notification);openView('laboratorio');requestAnimationFrame(focusGraph);}
function askConfirm(message,cb){confirmation=cb;$('confirm-message').textContent=message;$('confirm-modal').hidden=false;$('confirm-accept').focus();}
function closeConfirm(){$('confirm-modal').hidden=true;confirmation=null;}
function dimensions(n){return L.SIZE[n.type]||[218,88];}
function contentPreview(n){const c=n.config||{};if(n.type==='process')return String(c.code||'').replace(/\n/g,' · ');if(n.type==='input')return String(c.variable||'');if(n.type==='decision')return String(c.condition||'');if(n.type==='output')return String(c.expression||'');return '';}
function renderNodes(){const layer=$('nodes-layer');layer.innerHTML=graph.nodes.map(n=>{
  const ports=L.OUT_PORTS[n.type].map(port=>`<button type="button" class="port ${port==='yes'?'port-yes':port==='no'?'port-no':'port-bottom'} ${pending?.from===n.id&&pending.port===port?'active':''}" data-source="${esc(n.id)}" data-port="${port}" aria-label="Collega uscita ${port==='next'?'principale':port==='yes'?'SÌ':'NO'} di ${esc(n.label)}" title="Collega ${port==='next'?'uscita':port==='yes'?'SÌ':'NO'}"></button>${port==='yes'?'<span class="port-label">SÌ</span>':port==='no'?'<span class="port-label no-label">NO</span>':''}`).join('');
  return `<div class="node node-${n.type}${selected?.kind==='node'&&selected.id===n.id?' is-selected':''}${sim?.current===n.id?' is-current':''}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px" role="button" tabindex="0" aria-label="Blocco ${typeName[n.type]}: ${esc(n.label)}"><div class="node-type">${typeName[n.type]}</div><div class="node-label">${esc(n.label)}</div>${contentPreview(n)?`<div class="node-sub">${esc(contentPreview(n))}</div>`:''}${ports}</div>`;
}).join('');}
function portPosition(n,port){const [w,h]=dimensions(n);if(port==='yes')return {x:n.x+w,y:n.y+h/2};return {x:n.x+w/2,y:n.y+h};}
function targetPosition(src,target){const [w,h]=dimensions(target);const start=src;
  if(target.y+h<start.y-30)return {x:target.x+w,y:target.y+h/2,back:true};
  if(target.x>start.x+100&&Math.abs(target.y-start.y)<90)return {x:target.x,y:target.y+h/2,side:true};
  return {x:target.x+w/2,y:target.y,back:false};
}
function curve(from,to){if(to.back){const stretch=Math.max(105,Math.abs(to.x-from.x)*.32);return `M ${from.x} ${from.y} C ${from.x+stretch} ${from.y+120}, ${to.x+stretch} ${to.y-120}, ${to.x} ${to.y}`;}
  if(to.side)return `M ${from.x} ${from.y} C ${from.x+80} ${from.y}, ${to.x-80} ${to.y}, ${to.x} ${to.y}`;
  const dist=Math.max(48,Math.abs(to.y-from.y)*.48);return `M ${from.x} ${from.y} C ${from.x} ${from.y+dist}, ${to.x} ${to.y-dist}, ${to.x} ${to.y}`;}
function edgeGeometry(e){const a=getNode(e.from),b=getNode(e.to);if(!a||!b)return null;const from=portPosition(a,e.port),to=targetPosition(from,b);return {from,to,path:curve(from,to)};}
function renderEdges(){const layer=$('edges-layer');layer.innerHTML=graph.edges.map(edge=>{const pos=edgeGeometry(edge);if(!pos)return '';const active=selected?.kind==='edge'&&selected.id===edge.id;
  const branch=edge.port==='yes'||edge.port==='no';const tx=pos.from.x+(edge.port==='yes'?29:15),ty=pos.from.y+(edge.port==='yes'?-13:edge.port==='no'?27:0);
  return `<g data-id="${esc(edge.id)}"><path class="edge-visible${active?' selected':''}" d="${pos.path}" marker-end="url(#arrow-${active?'selected':'normal'})"/><path class="edge-hit" data-edge="${esc(edge.id)}" d="${pos.path}"/></g>`;
}).join('');}
function updateCount(){$('node-count').textContent=graph.nodes.length+' blocchi';$('edge-count').textContent=graph.edges.length+' collegamenti';}
function renderAll(){$('project-title').value=graph.name;renderNodes();renderEdges();renderInspector();updateCount();renderSim();}
function select(kind,id){selected=id?{kind,id}:null;renderNodes();renderEdges();renderInspector();}
function cancelConnection(){pending=null;$('canvas-viewport').classList.remove('connecting');$('pending-edge').hidden=true;$('pending-edge').setAttribute('d','');}
function beginConnection(from,port){if(pending?.from===from&&pending?.port===port){cancelConnection();renderNodes();return;}pending={from,port};$('canvas-viewport').classList.add('connecting');select('node',from);toast('Adesso clicca il blocco di destinazione (Esc per annullare).');}
function connectTo(targetId){if(!pending)return;const {from,port}=pending;if(from===targetId){toast('Collega due blocchi differenti.');return;}const preexisting=L.outgoing(graph,from,port);if(preexisting){graph.edges=graph.edges.filter(e=>e!==preexisting);}graph.edges.push({id:uid('e'),from,to:targetId,port});cancelConnection();selected={kind:'edge',id:graph.edges.at(-1).id};resetSimulation();checkpoint();renderAll();toast('Collegamento creato.');}
function renderInspector(){const el=$('inspector-content');if(!selected){el.innerHTML='<div class="inspector-empty"><div class="inspector-empty-graphic"><svg class="ico"><use href="#i-grid"/></svg></div><h3>Seleziona un blocco</h3><p>Clicca un elemento del diagramma per modificarne il contenuto o eliminare un collegamento.</p></div>';return;}
  if(selected.kind==='edge'){const edge=graph.edges.find(e=>e.id===selected.id);if(!edge){selected=null;return renderInspector();}
    const src=getNode(edge.from),dst=getNode(edge.to);el.innerHTML=`<div class="inspector-header"><div class="inspector-type-icon">↗</div><span><strong>Collegamento</strong><small>Freccia tra blocchi</small></span></div><div class="inspector-edge-label">${esc(src?.label)}</div><div class="inspector-edge-arrow">↓ &nbsp; Uscita: <strong>${edge.port==='yes'?'SÌ':edge.port==='no'?'NO':'principale'}</strong></div><div class="inspector-edge-label">${esc(dst?.label)}</div><div class="inspector-info">Per cambiare questo collegamento, clicca un'uscita del blocco di partenza e seleziona una nuova destinazione.</div><div class="inspector-actions"><button id="delete-selected" class="btn btn-soft"><svg class="ico"><use href="#i-trash"/></svg> Elimina freccia</button></div>`;return;
  }
  const n=getNode(selected.id);if(!n){selected=null;return renderInspector();}const cfg=n.config;
  const fields={
    start:'<div class="inspector-info">Questo blocco indica il punto in cui inizia il programma. È consentito un solo blocco INIZIO.</div>',
    end:'<div class="inspector-info">Quando il programma arriva qui, l’esecuzione termina.</div>',
    process:`<div class="form-group"><label for="config-code" class="field-label">ISTRUZIONI</label><textarea class="field-input" id="config-code" data-config="code" spellcheck="false">${esc(cfg.code)}</textarea><p class="field-help">Scrivi un'assegnazione per riga, ad esempio <code>x = x + 1</code>.</p></div>`,
    input:`<div class="form-group"><label for="config-variable" class="field-label">NOME VARIABILE</label><input class="field-input" id="config-variable" data-config="variable" value="${esc(cfg.variable)}" spellcheck="false"><p class="field-help">Un nome senza spazi, ad esempio <code>eta</code>.</p></div><div class="form-group"><label for="config-prompt" class="field-label">DOMANDA DA MOSTRARE</label><input class="field-input" id="config-prompt" data-config="prompt" value="${esc(cfg.prompt)}"></div>`,
    decision:`<div class="form-group"><label for="config-condition" class="field-label">CONDIZIONE</label><textarea class="field-input" id="config-condition" data-config="condition" spellcheck="false">${esc(cfg.condition)}</textarea><p class="field-help">Usa un confronto, ad esempio <code>eta >= 18</code>. Se vero, seguirà SÌ; altrimenti NO.</p></div><div class="inspector-connect-status">Collega le uscite SÌ e NO a due percorsi.</div>`,
    output:`<div class="form-group"><label for="config-expression" class="field-label">ESPRESSIONE DA VISUALIZZARE</label><textarea class="field-input" id="config-expression" data-config="expression" spellcheck="false">${esc(cfg.expression)}</textarea><p class="field-help">Testo tra virgolette oppure un'espressione: <code>"Totale: " + somma</code>.</p></div>`
  };
  el.innerHTML=`<div class="inspector-header"><div class="inspector-type-icon">${{start:'▶',process:'=',input:'↓',decision:'◇',output:'↑',end:'■'}[n.type]}</div><span><strong>${typeName[n.type]}</strong><small>${subtitle[n.type]}</small></span></div><div class="form-group"><label for="node-label-field" class="field-label">TITOLO DEL BLOCCO</label><input class="field-input" id="node-label-field" data-node-label value="${esc(n.label)}" maxlength="120"></div>${fields[n.type]}<div class="inspector-actions"><button class="btn btn-soft" id="duplicate-selected" ${n.type==='start'?'disabled title="Un solo INIZIO consentito"':''}><svg class="ico"><use href="#i-copy"/></svg> Duplica</button><button class="btn btn-soft" id="delete-selected"><svg class="ico"><use href="#i-trash"/></svg> Elimina</button></div>`;
}
function addNode(type){if(type==='start'&&graph.nodes.some(n=>n.type==='start')){toast('Esiste già un blocco INIZIO.');return;}if(graph.nodes.length>=250){toast('Limite di 250 blocchi raggiunto.');return;}
  const viewport=$('canvas-viewport'),cx=(viewport.scrollLeft+viewport.clientWidth/2)/zoom,cy=(viewport.scrollTop+viewport.clientHeight/2)/zoom;
  const n=L.defaultNode(type,uid('n'),Math.max(35,Math.min(1550,Math.round(cx-100+Math.random()*45))),Math.max(35,Math.min(1090,Math.round(cy-55+Math.random()*45))));
  graph.nodes.push(n);selected={kind:'node',id:n.id};cancelConnection();resetSimulation();checkpoint();renderAll();}
function deleteSelected(){if(!selected)return;if(selected.kind==='node'){graph.nodes=graph.nodes.filter(n=>n.id!==selected.id);graph.edges=graph.edges.filter(e=>e.from!==selected.id&&e.to!==selected.id);}else graph.edges=graph.edges.filter(e=>e.id!==selected.id);selected=null;cancelConnection();resetSimulation();checkpoint();renderAll();}
function duplicateSelected(){if(selected?.kind!=='node')return;const n=getNode(selected.id);if(!n||n.type==='start')return;const copy=JSON.parse(JSON.stringify(n));copy.id=uid('n');copy.x=Math.min(1550,n.x+46);copy.y=Math.min(1090,n.y+52);copy.label=n.label+' (copia)';graph.nodes.push(copy);selected={kind:'node',id:copy.id};resetSimulation();checkpoint();renderAll();}
function setZoom(value,preserve=true){const viewport=$('canvas-viewport');const oldCenterX=(viewport.scrollLeft+viewport.clientWidth/2)/zoom,oldCenterY=(viewport.scrollTop+viewport.clientHeight/2)/zoom;zoom=Math.max(.4,Math.min(1.65,Math.round(value*100)/100));$('canvas-plane').style.width=STAGE_W*zoom+'px';$('canvas-plane').style.height=STAGE_H*zoom+'px';$('canvas-surface').style.transform='scale('+zoom+')';$('zoom-value').textContent=Math.round(zoom*100)+'%';if(preserve){viewport.scrollLeft=oldCenterX*zoom-viewport.clientWidth/2;viewport.scrollTop=oldCenterY*zoom-viewport.clientHeight/2;}}
function bounds(){if(!graph.nodes.length)return {minX:570,minY:100,maxX:960,maxY:490};return graph.nodes.reduce((b,n)=>{const [w,h]=dimensions(n);b.minX=Math.min(b.minX,n.x);b.minY=Math.min(b.minY,n.y);b.maxX=Math.max(b.maxX,n.x+w);b.maxY=Math.max(b.maxY,n.y+h);return b;},{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
function focusGraph(){const v=$('canvas-viewport');if(!v.clientWidth)return;const b=bounds(),w=b.maxX-b.minX,h=b.maxY-b.minY;const desired=Math.min(1.15,Math.max(.48,Math.min((v.clientWidth-90)/Math.max(260,w),(v.clientHeight-65)/Math.max(320,h))));setZoom(desired,false);v.scrollLeft=Math.max(0,(b.minX+b.maxX)/2*zoom-v.clientWidth/2);v.scrollTop=Math.max(0,(b.minY+b.maxY)/2*zoom-v.clientHeight/2);}
function canvasPoint(e){const r=$('canvas-viewport').getBoundingClientRect();const v=$('canvas-viewport');return {x:(e.clientX-r.left+v.scrollLeft)/zoom,y:(e.clientY-r.top+v.scrollTop)/zoom};}
function updatePendingPointer(e){if(!pending)return;const n=getNode(pending.from);if(!n)return;const from=portPosition(n,pending.port),to=canvasPoint(e);$('pending-edge').hidden=false;$('pending-edge').setAttribute('d',curve(from,{...to}));}
function onPointerDown(e){if(e.button!==0)return;const port=e.target.closest('.port');if(port)return;const edge=e.target.closest('[data-edge]');if(edge){select('edge',edge.dataset.edge);return;}const nodeEl=e.target.closest('.node');if(nodeEl){if(pending){connectTo(nodeEl.dataset.id);e.preventDefault();return;}const n=getNode(nodeEl.dataset.id);if(!n)return;select('node',n.id);drag={kind:'node',id:n.id,x:e.clientX,y:e.clientY,origX:n.x,origY:n.y,moved:false};e.preventDefault();return;}
  if(pending){cancelConnection();renderNodes();return;}
  if(e.target.closest('#canvas-viewport')){drag={kind:'pan',x:e.clientX,y:e.clientY,scrollX:$('canvas-viewport').scrollLeft,scrollY:$('canvas-viewport').scrollTop};if(selected)select(null,null);e.preventDefault();}
}
function onPointerMove(e){if(pending)updatePendingPointer(e);if(!drag)return;if(drag.kind==='pan'){const v=$('canvas-viewport');v.scrollLeft=drag.scrollX-(e.clientX-drag.x);v.scrollTop=drag.scrollY-(e.clientY-drag.y);return;}
  const n=getNode(drag.id);if(!n)return;const x=Math.round(Math.max(0,Math.min(STAGE_W-dimensions(n)[0],drag.origX+(e.clientX-drag.x)/zoom)));const y=Math.round(Math.max(0,Math.min(1150,STAGE_H-dimensions(n)[1],drag.origY+(e.clientY-drag.y)/zoom)));
  if(x!==n.x||y!==n.y){n.x=x;n.y=y;drag.moved=true;const el=$('nodes-layer').querySelector(`[data-id="${n.id}"]`);if(el){el.style.left=x+'px';el.style.top=y+'px';}renderEdges();}
}
function onPointerUp(){if(drag?.kind==='node'&&drag.moved){resetSimulation();checkpoint();}drag=null;}
function log(message,kind='info'){const el=$('console-output');if(el.querySelector('.console-placeholder'))el.innerHTML='';const row=document.createElement('span');row.className='log-line log-'+kind;row.textContent=message;el.appendChild(row);el.scrollTop=el.scrollHeight;}
function clearConsole(){$('console-output').innerHTML='<span class="console-placeholder">&gt; Premi «Esegui» per avviare il programma.</span>';}
function resetSimulation(update=true){clearTimeout(runTimer);runTimer=null;automatic=false;sim=null;$('input-modal').hidden=true;if(update){clearConsole();renderSim();renderNodes();}}
function renderSim(){const status=$('run-status');const btn=$('run-btn');btn.innerHTML=automatic?'<svg class="ico"><use href="#i-pause"/></svg> Pausa':'<svg class="ico"><use href="#i-play"/></svg> Esegui';const texts={ready:'Pronto per il prossimo passo',waiting:'In attesa di un valore',done:'Esecuzione completata',error:'Errore di esecuzione'};status.textContent=automatic?'Esecuzione in corso':sim?texts[sim.status]:'Pronto per eseguire';$('step-count').textContent=(sim?.steps||0)+' passi';const vars=Object.entries(sim?.variables||{});$('variables-list').innerHTML=vars.length?vars.map(([k,v])=>`<div class="variable-row"><span class="variable-name">${esc(k)}</span><span class="variable-value" title="${esc(String(v))}">${esc(String(v))}</span></div>`).join(''):'<div class="empty-variables">Nessuna variabile</div>';}
function ensureVisible(id){if(!id)return;const n=getNode(id);if(!n)return;const [w,h]=dimensions(n),v=$('canvas-viewport'),left=n.x*zoom,right=(n.x+w)*zoom,top=n.y*zoom,bottom=(n.y+h)*zoom;let nextX=v.scrollLeft,nextY=v.scrollTop;if(left<v.scrollLeft+35)nextX=left-70;else if(right>v.scrollLeft+v.clientWidth-35)nextX=right-v.clientWidth+80;if(top<v.scrollTop+30)nextY=top-65;else if(bottom>v.scrollTop+v.clientHeight-40)nextY=bottom-v.clientHeight+70;if(nextX!==v.scrollLeft||nextY!==v.scrollTop){v.scrollTo({left:Math.max(0,nextX),top:Math.max(0,nextY),behavior:'smooth'});}}
function initializeSim(){if(sim?.status==='ready'||sim?.status==='waiting')return true;try{sim=L.initialState(graph);clearConsole();log('> Avvio di «'+graph.name+'»','info');renderSim();renderNodes();return true;}catch(err){toast(err.message);log('ERRORE: '+err.message,'error');return false;}}
function showInput(){const node=getNode(sim?.current);if(!node)return;$('input-question').textContent=node.config.prompt||'Inserisci un valore:';$('input-modal-title').textContent=node.label;$('runtime-input').value='';$('input-modal').hidden=false;setTimeout(()=>$('runtime-input').focus(),0);}
function oneStep(){if(!initializeSim())return;if(sim.status==='waiting'){showInput();return;}if(sim.status==='error'||sim.status==='done')return;
  const node=getNode(sim.current);const previousOutput=sim.outputs.length;sim=L.step(graph,sim);if(sim.status==='waiting'){renderSim();renderNodes();ensureVisible(sim.current);showInput();return;}
  if(sim.status==='error'){log('ERRORE: '+sim.error,'error');automatic=false;clearTimeout(runTimer);}
  else{log('['+String(sim.steps).padStart(2,'0')+'] '+typeName[node.type]+' · '+node.label,'step');if(sim.outputs.length>previousOutput)log('> '+sim.outputs.at(-1),'output');if(sim.status==='done'){log('✓ Programma terminato in '+sim.steps+' passi.','done');automatic=false;clearTimeout(runTimer);}}
  renderSim();renderNodes();ensureVisible(sim.current);
}
function interval(){return [1200,900,650,400,180][Number($('speed').value)-1]||650;}
function autoTick(){if(!automatic)return;oneStep();if(automatic&&sim?.status==='ready')runTimer=setTimeout(autoTick,interval());}
function toggleRun(){if(automatic){automatic=false;clearTimeout(runTimer);renderSim();return;}if(sim?.status==='done'||sim?.status==='error')resetSimulation();if(!initializeSim())return;automatic=true;renderSim();if(sim.status==='waiting'){showInput();return;}runTimer=setTimeout(autoTick,100);}
function applyInput(event){event.preventDefault();if(!sim||sim.status!=='waiting')return;const value=$('runtime-input').value;$('input-modal').hidden=true;const node=getNode(sim.current);const previousOutput=sim.outputs.length;sim=L.step(graph,sim,value);if(sim.status==='error'){log('ERRORE: '+sim.error,'error');automatic=false;}
  else{log('['+String(sim.steps).padStart(2,'0')+'] INPUT · '+node.label+' = '+value,'step');if(sim.outputs.length>previousOutput)log('> '+sim.outputs.at(-1),'output');}
  renderSim();renderNodes();ensureVisible(sim.current);if(automatic&&sim.status==='ready')runTimer=setTimeout(autoTick,interval());}
function download(filename,content,mime){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safeFilename(){return (graph.name||'diagramma').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'diagramma';}
function exportJSON(){download(safeFilename()+'.json',JSON.stringify({...graph,version:1},null,2),'application/json');toast('Progetto JSON esportato.');}
function svgText(text,x,y,size=13,color='#34445c',weight=700){return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(text)}</text>`;}
function exportSVG(){if(!graph.nodes.length){toast('Aggiungi qualche blocco prima di esportare.');return;}const b=bounds(),padding=60,xoff=padding-b.minX,yoff=padding-b.minY,w=b.maxX-b.minX+padding*2,h=b.maxY-b.minY+padding*2;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#ffffff"/><defs><marker id="a" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0L7 3L0 6Z" fill="#8da0ba"/></marker></defs><g transform="translate(${xoff},${yoff})">`;
  for(const edge of graph.edges){const pos=edgeGeometry(edge);if(!pos)continue;svg+=`<path d="${pos.path}" stroke="#8da0ba" fill="none" stroke-width="2.7" marker-end="url(#a)"/>`;if(['yes','no'].includes(edge.port))svg+=svgText(edge.port==='yes'?'SÌ':'NO',pos.from.x+(edge.port==='yes'?30:14),pos.from.y+(edge.port==='yes'?-12:24),11,edge.port==='yes'?'#229e7a':'#bc8e62',800);}
  for(const n of graph.nodes){const [nw,nh]=dimensions(n),cx=n.x+nw/2,cy=n.y+nh/2;let fill='#fff',stroke='#becbdf',shape='';if(n.type==='start'){fill='#172b47';stroke=fill;}if(n.type==='end'){fill='#fff1ef';stroke='#efaa9c';}if(n.type==='process')stroke='#a5a5ee';if(n.type==='decision'){fill='#eefbf6';stroke='#51c6a4';}if(['input','output'].includes(n.type))stroke='#86bce0';
    if(n.type==='decision')shape=`<polygon points="${cx},${n.y} ${n.x+nw},${cy} ${cx},${n.y+nh} ${n.x},${cy}"/>`;
    else if(['input','output'].includes(n.type))shape=`<polygon points="${n.x+17},${n.y} ${n.x+nw},${n.y} ${n.x+nw-17},${n.y+nh} ${n.x},${n.y+nh}"/>`;
    else shape=`<rect x="${n.x}" y="${n.y}" width="${nw}" height="${nh}" rx="${n.type==='start'||n.type==='end'?35:11}"/>`;
    svg+=`<g fill="${fill}" stroke="${stroke}" stroke-width="2">${shape}</g>`;
    const parts=String(n.label).match(/.{1,23}(?:\s|$)|.{1,23}/g)||[''];const shown=parts.slice(0,n.type==='decision'?3:2).map(s=>s.trim());const lineHeight=17;let ty=cy-((shown.length-1)*lineHeight/2)+5;for(const line of shown){svg+=svgText(line,cx,ty,n.type==='decision'?12:14,n.type==='start'?'#ffffff':n.type==='end'?'#bf6d60':'#34445c',700);ty+=lineHeight;}}
  svg+='</g></svg>';download(safeFilename()+'.svg',svg,'image/svg+xml;charset=utf-8');toast('Diagramma SVG esportato.');}
// Mini-quiz: answers are checked locally; no accounts or external services.
const quiz=[
  {q:'Quale forma rappresenta una decisione?',options:['Rombo','Rettangolo','Ellisse'],correct:0,explain:'Il rombo separa due percorsi: SÌ e NO.'},
  {q:'Qual è il risultato dell’espressione 10 % 3?',options:['3','1','0'],correct:1,explain:'L’operatore % restituisce il resto della divisione: 10 diviso 3 dà resto 1.'},
  {q:'Se i parte da 1 e ripeti finché i <= 3, aumentando i di 1, quanti giri completi compi?',options:['2','3','4'],correct:1,explain:'Il ciclo si ripete con i = 1, 2 e 3: in totale tre volte.'}
];
let quizIndex=0,quizAnswers=[null,null,null];
function renderQuiz(){const area=$('quiz-card');if(quizIndex>=quiz.length){const score=quizAnswers.reduce((n,a,i)=>n+(a===quiz[i].correct?1:0),0);$('quiz-progress').textContent='QUIZ COMPLETATO';area.innerHTML=`<div class="quiz-result"><div class="section-kicker">IL TUO RISULTATO</div><h3><strong>${score} / ${quiz.length}</strong> risposte corrette</h3><p>${score===3?'Ottimo lavoro! Sei pronto per il laboratorio.':'Puoi ripassare gli argomenti e riprovare quando vuoi.'}</p><button class="btn btn-primary btn-small" data-quiz-restart>Ricomincia</button></div>`;return;}
  const q=quiz[quizIndex],picked=quizAnswers[quizIndex];$('quiz-progress').textContent='DOMANDA '+(quizIndex+1)+' DI '+quiz.length;
  area.innerHTML=`<div class="quiz-question">${esc(q.q)}</div><div class="quiz-options">${q.options.map((option,i)=>`<button class="quiz-option ${picked!==null&&i===q.correct?'correct':picked===i&&picked!==q.correct?'incorrect':''}" data-quiz-option="${i}" ${picked!==null?'disabled':''}>${esc(option)}</button>`).join('')}</div>${picked===null?'':`<div class="quiz-answer ${picked===q.correct?'is-correct':'is-incorrect'}"><span>${picked===q.correct?'✓ Corretto. ':'Da ripassare. '}${esc(q.explain)}</span><button class="btn btn-soft btn-small" data-quiz-next>${quizIndex===quiz.length-1?'Risultato':'Prossima domanda'} →</button></div>`}`;
}
$('quiz-card').addEventListener('click',e=>{const answer=e.target.closest('[data-quiz-option]');if(answer&&quizAnswers[quizIndex]===null){quizAnswers[quizIndex]=Number(answer.dataset.quizOption);renderQuiz();}if(e.target.closest('[data-quiz-next]')){quizIndex++;renderQuiz();}if(e.target.closest('[data-quiz-restart]')){quizIndex=0;quizAnswers=[null,null,null];renderQuiz();}});
renderQuiz();

// Event listeners ------------------------------------------------------------
document.addEventListener('click',e=>{const nav=e.target.closest('[data-target]');if(nav){e.preventDefault();openView(nav.dataset.target);return;}const example=e.target.closest('[data-example]');if(example){loadGraph(L.getExample(example.dataset.example),'Esempio caricato. Puoi modificarlo ed eseguirlo.');return;}const add=e.target.closest('[data-add]');if(add){addNode(add.dataset.add);return;}});
$('canvas-viewport').addEventListener('pointerdown',onPointerDown);window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',onPointerUp);
$('nodes-layer').addEventListener('click',e=>{const port=e.target.closest('.port');if(port){e.stopPropagation();beginConnection(port.dataset.source,port.dataset.port);}});
$('nodes-layer').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.classList.contains('port')){const node=e.target.closest('.node');if(node){if(pending)connectTo(node.dataset.id);else select('node',node.dataset.id);}}});
$('inspector-content').addEventListener('input',e=>{const n=selected?.kind==='node'?getNode(selected.id):null;if(!n)return;const f=e.target;if(f.matches('[data-node-label]')){n.label=f.value;resetSimulation(false);renderNodes();renderEdges();renderSim();scheduleSave();}else if(f.matches('[data-config]')){n.config[f.dataset.config]=f.value;resetSimulation(false);renderNodes();renderSim();scheduleSave();}});
$('inspector-content').addEventListener('change',e=>{if(e.target.matches('[data-node-label],[data-config]'))checkpoint();});
$('inspector-content').addEventListener('click',e=>{if(e.target.closest('#delete-selected'))deleteSelected();if(e.target.closest('#duplicate-selected'))duplicateSelected();});
$('project-title').addEventListener('input',e=>{graph.name=e.target.value;scheduleSave();});$('project-title').addEventListener('change',checkpoint);
$('undo-btn').addEventListener('click',()=>undo(-1));$('redo-btn').addEventListener('click',()=>undo(1));
$('zoom-in').addEventListener('click',()=>setZoom(zoom+.1));$('zoom-out').addEventListener('click',()=>setZoom(zoom-.1));$('zoom-fit').addEventListener('click',focusGraph);
$('step-btn').addEventListener('click',()=>{automatic=false;clearTimeout(runTimer);oneStep();renderSim();});$('run-btn').addEventListener('click',toggleRun);$('reset-btn').addEventListener('click',()=>resetSimulation());
$('input-form').addEventListener('submit',applyInput);$('input-cancel').addEventListener('click',()=>{resetSimulation();toast('Esecuzione interrotta.');});
$('new-project').addEventListener('click',()=>askConfirm('Il diagramma corrente verrà sostituito da un progetto vuoto. Esporta il JSON se vuoi conservarlo.',()=>{const blank=L.createGraph('Il mio algoritmo');blank.nodes=[L.defaultNode('start','nstart',680,230),L.defaultNode('end','nend',680,505)];loadGraph(blank,'Nuovo diagramma creato.');}));
$('confirm-cancel').addEventListener('click',closeConfirm);$('confirm-accept').addEventListener('click',()=>{const fn=confirmation;closeConfirm();if(fn)fn();});
$('export-json').addEventListener('click',exportJSON);$('export-svg').addEventListener('click',exportSVG);
$('import-btn').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async(e)=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>1024*1024)throw Error('File troppo grande (massimo 1 MB).');const content=await file.text();const incoming=L.checkGraph(JSON.parse(content));askConfirm('Il file «'+file.name+'» sostituirà il diagramma corrente.',()=>loadGraph(incoming,'Progetto importato correttamente.'));}catch(err){toast('Impossibile importare: '+err.message);}});
window.addEventListener('keydown',e=>{const editable=e.target.matches('input,textarea,[contenteditable]');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){if(!editable){e.preventDefault();undo(-1);}return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){if(!editable){e.preventDefault();undo(1);}return;}if(e.key==='Escape'){if(!$('confirm-modal').hidden)closeConfirm();else if(pending){cancelConnection();renderNodes();}else if(selected){select(null,null);}return;}if(editable)return;if((e.key==='Delete'||e.key==='Backspace')&&selected&&!$('view-laboratorio').hidden){e.preventDefault();deleteSelected();}});
$('canvas-viewport').addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1));},{passive:false});
window.addEventListener('beforeunload',()=>{clearTimeout(autosaveTimer);save();});
// Initial project -------------------------------------------------------------
try{const saved=localStorage.getItem(STORE);graph=saved?L.checkGraph(JSON.parse(saved)):L.getExample('saluto');}catch(err){graph=L.getExample('saluto');}
pushInitialHistory();setZoom(.85,false);renderAll();openView(location.hash.slice(1)||'impara');
})();
