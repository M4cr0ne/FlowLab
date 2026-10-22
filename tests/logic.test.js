const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('../logic.js');
test('calcoli, precedenze e parentesi',()=>{assert.equal(L.evaluate('2 + 3 * 4'),14);assert.equal(L.evaluate('(2 + 3) * 4'),20);assert.equal(L.evaluate('10 % 2 == 0'),true);assert.equal(L.evaluate('!false || false'),true);});
test('stringhe, variabili e short circuit',()=>{assert.equal(L.evaluate('"Ciao " + nome',{nome:'Ada'}),'Ciao Ada');assert.equal(L.evaluate('true || inesistente'),true);assert.equal(L.evaluate('false && inesistente'),false);assert.throws(()=>L.evaluate('inesistente + 1'),/non definita/);});
test('assegnazioni in sequenza e isolamento errori',()=>{assert.deepEqual(L.assignments('x = 2\ny = x + 5',{}),{x:2,y:7});assert.throws(()=>L.assignments('x = 1\ny = ?',{}),/non riconosciuto/);});
test('input numerici, testo e booleani',()=>{assert.equal(L.parseInput('12'),12);assert.equal(L.parseInput('3.14'),3.14);assert.equal(L.parseInput('Ada'),'Ada');assert.equal(L.parseInput('vero'),true);});
function runExample(key,inputs=[]){const g=L.getExample(key);let state=L.initialState(g);let i=0;for(let n=0;n<200&&state.status!=='done'&&state.status!=='error';n++){state=L.step(g,state,state.status==='waiting'?inputs[i++]:undefined);}return state;}
test('programma saluto richiede input e termina',()=>{const s=runExample('saluto',['Ada']);assert.equal(s.status,'done');assert.deepEqual(s.outputs,['Ciao, Ada!']);});
test('programma pari e dispari segue le due diramazioni',()=>{assert.match(runExample('pari',['12']).outputs[0],/è pari/);assert.match(runExample('pari',['7']).outputs[0],/è dispari/);});
test('programma somma calcola risultato',()=>{const s=runExample('somma',['3','8']);assert.equal(s.status,'done');assert.deepEqual(s.outputs,['La somma è 11']);});
test('ciclo termina, visita più volte la condizione e calcola 15',()=>{const s=runExample('ciclo');assert.equal(s.status,'done');assert.deepEqual(s.outputs,['Somma da 1 a 5: 15']);assert.equal(s.variables.i,6);assert.ok(s.steps>10);});
test('validator rifiuta duplicati, start multipli e nodi invalidi',()=>{const g=L.getExample('saluto');assert.equal(L.checkGraph(g).nodes.length,4);g.nodes.push({...g.nodes[0],id:'nanother',x:450});assert.throws(()=>L.checkGraph(g),/solo blocco INIZIO/);});
test('nessuna esecuzione di JS esterno',()=>{assert.throws(()=>L.evaluate('alert(1)'),/non valida/);assert.throws(()=>L.evaluate('window.location'),/non riconosciuto/);});
