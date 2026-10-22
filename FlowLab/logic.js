/* FlowLab — small, deliberately restricted interpreter for classroom algorithms.
   No eval(), Function(), external dependencies, or arbitrary JavaScript execution. */
(function (root) {
  'use strict';
  const MAX_STEPS = 500;
  const TYPES = ['start', 'process', 'input', 'decision', 'output', 'end'];
  const OUT_PORTS = { start: ['next'], process: ['next'], input: ['next'], decision: ['yes','no'], output: ['next'], end: [] };
  const SIZE = { start:[180,68], process:[218,88], input:[218,88], decision:[205,138], output:[218,88], end:[180,68] };
  const DEFAULTS = {
    start: {label:'Inizio',config:{}}, process:{label:'Calcola',config:{code:'risultato = 1 + 1'}},
    input:{label:'Leggi un valore',config:{variable:'numero',prompt:'Inserisci un numero:'}},
    decision:{label:'Verifica condizione',config:{condition:'numero > 0'}},
    output:{label:'Mostra un risultato',config:{expression:'"Risultato: " + risultato'}},
    end:{label:'Fine',config:{}}
  };
  function isIdentifier(s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !['__proto__','constructor','prototype'].includes(s); }
  function tokenize(source) {
    const s=String(source), tokens=[]; let i=0;
    while(i<s.length){
      const c=s[i]; if(/\s/.test(c)){i++;continue;}
      if(c==='"'||c==="'"){
        const quote=c; let str='', closed=false; i++;
        while(i<s.length){const ch=s[i++]; if(ch===quote){closed=true;break;} if(ch==='\\'){if(i>=s.length)break;const e=s[i++];str+=e==='n'?'\n':e==='t'?'\t':e;}else{str+=ch;}}
        if(!closed) throw Error('Stringa senza virgolette di chiusura.');
        tokens.push({type:'value',value:str});continue;
      }
      if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(s[i+1]||''))){
        const match=s.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/); if(!match)throw Error('Numero non valido.');
        tokens.push({type:'value',value:Number(match[0])});i+=match[0].length;continue;
      }
      if(/[A-Za-z_]/.test(c)){
        const m=s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
        if(m==='true'||m==='vero')tokens.push({type:'value',value:true});
        else if(m==='false'||m==='falso')tokens.push({type:'value',value:false});
        else tokens.push({type:'identifier',value:m});
        i+=m.length;continue;
      }
      const triple=s.slice(i,i+3), pair=s.slice(i,i+2);
      if(triple==='==='||triple==='!=='){tokens.push({type:'op',value:triple==='==='?'==':'!='});i+=3;continue;}
      if(['>=','<=','==','!=','&&','||'].includes(pair)){tokens.push({type:'op',value:pair});i+=2;continue;}
      if('+-*/%()!<>'.includes(c)){tokens.push({type:'op',value:c});i++;continue;}
      throw Error('Simbolo non riconosciuto: '+c);
    }
    return tokens;
  }
  function evaluate(source, variables={}) {
    const t=tokenize(source); if(!t.length)throw Error('Inserisci un’espressione.'); let p=0;
    const peek=()=>t[p]?.type==='op'?t[p].value:null; const accept=(v)=>{if(peek()===v){p++;return true;}return false;};
    function primary(){
      if(accept('(')){const v=or();if(!accept(')'))throw Error('Manca una parentesi di chiusura.');return v;}
      const token=t[p++]; if(!token)throw Error('Espressione incompleta.');
      if(token.type==='value')return token.value;
      if(token.type==='identifier')return {identifier:token.value};
      throw Error('Elemento non valido: '+token.value);
    }
    // Build a miniature AST first: this allows true short-circuit logic.
    function unary(){if(['!','-','+'].includes(peek())){const op=t[p++].value;return {op,args:[unary()]};}return primary();}
    function binary(next,ops){let left=next();while(ops.includes(peek())){const op=t[p++].value;left={op,args:[left,next()]};}return left;}
    function mult(){return binary(unary,['*','/','%']);}
    function add(){return binary(mult,['+','-']);}
    function compare(){return binary(add,['>','<','>=','<=']);}
    function equality(){return binary(compare,['==','!=']);}
    function and(){return binary(equality,['&&']);}
    function or(){return binary(and,['||']);}
    const ast=or(); if(p!==t.length)throw Error('Espressione non valida vicino a: '+peek());
    function read(node){
      if(node && typeof node==='object'){
        if('identifier' in node){if(!Object.prototype.hasOwnProperty.call(variables,node.identifier))throw Error('Variabile "'+node.identifier+'" non definita.');return variables[node.identifier];}
        const {op,args}=node;
        if(args.length===1){const a=read(args[0]);if(op==='!')return !a;if(op==='-')return -a;return +a;}
        const a=read(args[0]);if(op==='&&')return a&&read(args[1]);if(op==='||')return a||read(args[1]);
        const b=read(args[1]);switch(op){
          case '+':return a+b;case '-':return a-b;case '*':return a*b;
          case '/':if(Number(b)===0)throw Error('Divisione per zero.');return a/b;
          case '%':if(Number(b)===0)throw Error('Resto della divisione per zero.');return a%b;
          case '>':return a>b;case '<':return a<b;case '>=':return a>=b;case '<=':return a<=b;
          case '==':return a===b;case '!=':return a!==b;
        }
      }
      return node;
    }
    const result=read(ast);
    if(typeof result==='number' && !Number.isFinite(result))throw Error('Il calcolo ha prodotto un numero non valido.');
    return result;
  }
  function assignments(source, variables){
    const lines=String(source).split(/[;\n]/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length)throw Error('Scrivi almeno un’assegnazione (esempio: x = 5).');
    // Execute on a copy so a bad second assignment does not partially update state.
    const next={...variables};
    for(const line of lines){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if(!m||!isIdentifier(m[1]))throw Error('Assegnazione non valida: '+line+'. Usa: variabile = espressione');
      next[m[1]]=evaluate(m[2],next);
    }
    return next;
  }
  function parseInput(value){const s=String(value).trim();if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return Number(s);if(s==='vero'||s==='true')return true;if(s==='falso'||s==='false')return false;return String(value);}
  function defaultNode(type,id,x=100,y=100){if(!TYPES.includes(type))throw Error('Tipo di blocco sconosciuto.');const d=DEFAULTS[type];return {id,type,x,y,label:d.label,config:{...d.config}};}
  function createGraph(name='Il mio algoritmo'){return {version:1,name,nodes:[],edges:[]};}
  function outgoing(graph,id,port){return graph.edges.find(e=>e.from===id&&e.port===port);}
  function initialState(graph){const starts=graph.nodes.filter(n=>n.type==='start');if(starts.length!==1)throw Error('Il diagramma deve contenere esattamente un blocco INIZIO.');return {current:starts[0].id,variables:{},outputs:[],steps:0,status:'ready',waiting:false,error:null,visited:[]};}
  function step(graph,state,inputValue){
    if(['done','error'].includes(state.status))return state;
    if(state.steps>=MAX_STEPS)return {...state,status:'error',error:'Limite di '+MAX_STEPS+' passi raggiunto. Controlla che il ciclo possa terminare.',waiting:false};
    const node=graph.nodes.find(n=>n.id===state.current);
    if(!node)return {...state,status:'error',error:'Il blocco corrente non esiste.',waiting:false};
    let vars={...state.variables},outputs=[...state.outputs],port='next';
    try{
      if(node.type==='input'&&inputValue===undefined)return {...state,status:'waiting',waiting:true};
      switch(node.type){
        case 'start': break;
        case 'process':vars=assignments(node.config.code,vars);break;
        case 'input':{
          const name=String(node.config.variable||'').trim();if(!isIdentifier(name))throw Error('Nome della variabile di input non valido.');
          vars[name]=parseInput(inputValue);break;
        }
        case 'decision':port=evaluate(node.config.condition,vars)?'yes':'no';break;
        case 'output':outputs.push(String(evaluate(node.config.expression,vars)));break;
        case 'end':return {...state,current:null,variables:vars,outputs,steps:state.steps+1,status:'done',waiting:false,visited:[...state.visited,node.id]};
        default:throw Error('Tipo di blocco sconosciuto.');
      }
      const edge=outgoing(graph,node.id,port);
      if(!edge)throw Error('Manca il collegamento '+(port==='next'?'in uscita':port.toUpperCase())+' dal blocco «'+node.label+'».');
      if(!graph.nodes.some(n=>n.id===edge.to))throw Error('Collegamento verso un blocco inesistente.');
      return {...state,current:edge.to,variables:vars,outputs,steps:state.steps+1,status:'ready',waiting:false,error:null,visited:[...state.visited,node.id]};
    }catch(error){return {...state,status:'error',error:'Blocco «'+node.label+'»: '+error.message,waiting:false};}
  }
  function checkGraph(graph){
    if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw Error('Il file non contiene un diagramma valido.');
    if(graph.nodes.length>250||graph.edges.length>500)throw Error('Diagramma troppo grande (massimo 250 blocchi, 500 collegamenti).');
    const ids=new Set();let startCount=0;const nodes=[];
    for(const n of graph.nodes){
      if(!n||typeof n.id!=='string'||!/^n[\w-]{1,50}$/.test(n.id)||ids.has(n.id)||!TYPES.includes(n.type))throw Error('Il file contiene un blocco non valido o duplicato.');
      if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.y<0||n.x>1650||n.y>1150)throw Error('La posizione di un blocco non è valida.');
      ids.add(n.id);if(n.type==='start')startCount++;
      const config=n.config||{},safe={};for(const k of Object.keys(DEFAULTS[n.type].config)){safe[k]=typeof config[k]==='string'?config[k].slice(0,3000):DEFAULTS[n.type].config[k];}
      nodes.push({...n,id:n.id,type:n.type,x:n.x,y:n.y,label:String(n.label??DEFAULTS[n.type].label).slice(0,120),config:safe});
    }
    if(startCount>1)throw Error('Un diagramma può contenere un solo blocco INIZIO.');
    const edges=[];const used=new Set();
    for(const e of graph.edges){
      if(!e||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)throw Error('Il file contiene un collegamento non valido.');
      const node=nodes.find(n=>n.id===e.from);
      if(!OUT_PORTS[node.type].includes(e.port))throw Error('Una porta di uscita non è valida.');
      const key=e.from+':'+e.port;if(used.has(key))throw Error('Ogni porta può avere un solo collegamento.');used.add(key);
      edges.push({id:'e'+edges.length+'-'+Math.abs(String(e.from+e.to).split('').reduce((a,c)=>a*31+c.charCodeAt(0),0)).toString(36),from:e.from,to:e.to,port:e.port});
    }
    return {version:1,name:String(graph.name||'Il mio algoritmo').slice(0,64),nodes,edges};
  }
  const examples={
    saluto:{name:'Il primo saluto',nodes:[['start','s',690,100,'Inizio',{}],['input','a',670,240,'Chiedi il nome',{variable:'nome',prompt:'Come ti chiami?'}],['output','b',670,410,'Saluta',{expression:'"Ciao, " + nome + "!"'}],['end','z',689,570,'Fine',{}]],edges:[['s','a'],['a','b'],['b','z']]},
    pari:{name:'Pari o dispari?',nodes:[['start','s',655,65,'Inizio',{}],['input','a',636,186,'Leggi un numero',{variable:'numero',prompt:'Inserisci un numero intero:'}],['decision','b',642,335,'È pari?',{condition:'numero % 2 == 0'}],['output','c',1010,385,'Numero pari',{expression:'"Il numero " + numero + " è pari"'}],['output','d',636,555,'Numero dispari',{expression:'"Il numero " + numero + " è dispari"'}],['end','z',858,777,'Fine',{}]],edges:[['s','a'],['a','b'],['b','c','yes'],['b','d','no'],['c','z'],['d','z']]},
    somma:{name:'Somma due numeri',nodes:[['start','s',695,63,'Inizio',{}],['input','a',675,181,'Primo numero',{variable:'a',prompt:'Inserisci il primo numero:'}],['input','b',675,310,'Secondo numero',{variable:'b',prompt:'Inserisci il secondo numero:'}],['process','c',675,438,'Calcola la somma',{code:'somma = a + b'}],['output','d',675,568,'Mostra la somma',{expression:'"La somma è " + somma'}],['end','z',695,704,'Fine',{}]],edges:[['s','a'],['a','b'],['b','c'],['c','d'],['d','z']]},
    ciclo:{name:'Somma da 1 a 5',nodes:[['start','s',665,70,'Inizio',{}],['process','a',646,195,'Inizializza',{code:'i = 1\nsomma = 0'}],['decision','b',653,365,'i è minore o uguale a 5?',{condition:'i <= 5'}],['process','c',1022,391,'Aggiungi e incrementa',{code:'somma = somma + i\ni = i + 1'}],['output','d',653,600,'Mostra il totale',{expression:'"Somma da 1 a 5: " + somma'}],['end','z',670,752,'Fine',{}]],edges:[['s','a'],['a','b'],['b','c','yes'],['c','b'],['b','d','no'],['d','z']]}
  };
  function getExample(key){const e=examples[key];if(!e)throw Error('Esempio inesistente.');const graph=createGraph(e.name);graph.nodes=e.nodes.map(([type,suffix,x,y,label,config])=>({id:'n'+suffix,type,x,y,label,config:{...config}}));graph.edges=e.edges.map(([from,to,port],i)=>({id:'examplee'+i,from:'n'+from,to:'n'+to,port:port||'next'}));return graph;}
  const api={MAX_STEPS,TYPES,OUT_PORTS,SIZE,DEFAULTS,isIdentifier,tokenize,evaluate,assignments,parseInput,defaultNode,createGraph,outgoing,initialState,step,checkGraph,getExample};
  root.FlowLogic=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
