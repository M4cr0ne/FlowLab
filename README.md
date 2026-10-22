# FlowLab — laboratorio interattivo di diagrammi di flusso

Sito didattico in italiano, statico e completamente client-side. Consente agli studenti di **imparare, costruire ed eseguire** diagrammi di flusso attraverso un editor visuale.

## Funzionalità

- **Impara:** quattro lezioni sintetiche su simboli, variabili, condizioni e cicli; mini-quiz interattivo di tre domande.
- **Laboratorio:** aggiunta, selezione, spostamento e duplicazione di blocchi; collegamenti tramite porte colorate; uscite SÌ/NO per le decisioni; eliminazione di blocchi e frecce.
- **Esecuzione reale:** motore didattico per assegnazioni, aritmetica, espressioni booleane, input dell'utente, output e cicli. Esecuzione automatica, pausa, passo-passo e reset. Console e pannello variabili.
- **Esempi:** primo saluto, pari/dispari, somma di due numeri, somma da 1 a 5 mediante ciclo.
- **File:** salvataggio automatico sul dispositivo (`localStorage`), import/esportazione di progetti JSON, esportazione del diagramma come SVG.
- **Editor:** zoom, adatta alla vista, spostamento dello sfondo, undo/redo, scorciatoie da tastiera.

Nessun login, nessuna API esterna, nessuna libreria JavaScript, nessun database, nessun backend e nessuna installazione sono necessari.

## Pubblicare su GitHub Pages

1. Crea un nuovo repository GitHub, per esempio `flowlab`.
2. Estrai lo ZIP e carica **i file contenuti nella cartella `flowlab-github-pages` nella radice del repository** (l'`index.html` deve trovarsi nella radice, non in una sottocartella).
3. Apri **Settings → Pages**.
4. In **Build and deployment**, scegli **Source: Deploy from a branch**.
5. Seleziona **Branch: main** e **Folder: /(root)**, poi **Save**.
6. Il sito sarà raggiungibile all'indirizzo `https://TUO-USERNAME.github.io/flowlab/` (sostituisci username e nome repository).

Funziona anche semplicemente aprendo `index.html` dal computer. Per sviluppo locale è possibile avviare `python -m http.server 8000` e visitare `http://localhost:8000`.

> Nota: l'archiviazione `localStorage` riguarda esclusivamente il browser e il dispositivo corrente. Non esiste sincronizzazione cloud, né un archivio condiviso tra studenti. Per consegnare o spostare un lavoro, utilizzare **Esporta JSON** e poi **Importa**.

## Come utilizzare il laboratorio

1. Aggiungi un blocco dal pannello sinistro.
2. Selezionalo e modifica le proprietà a destra (titolo, assegnazione, espressione, domanda o condizione).
3. Per collegare due blocchi, **clicca il pallino colorato in uscita** sul primo blocco, poi **clicca il secondo blocco**.
4. Ogni porta d'uscita può avere un collegamento; quando se ne crea un altro, quello precedente viene sostituito.
5. Inserisci un solo blocco **Inizio**, aggiungi un percorso fino a **Fine**, quindi premi **Esegui** oppure **Passo**.
6. Visualizza valori delle variabili, risultati ed eventuali errori nella console.

### Sintassi degli algoritmi

```text
x = 5
x = x + 1
nome = "Ada"
```

Le operazioni accettano una o più assegnazioni, separate da righe o punto e virgola. Il linguaggio supporta:

| Categoria | Esempi |
|---|---|
| Operazioni | `+`, `-`, `*`, `/`, `%`, parentesi |
| Confronti | `>`, `<`, `>=`, `<=`, `==`, `!=` |
| Logica | `&&`, `||`, `!` |
| Valori | numeri decimali con **punto**, testi tra virgolette, `true`/`false` o `vero`/`falso` |
| Output | `"Risultato: " + x` |
| Condizione | `eta >= 18` |

Il parser è limitato intenzionalmente a un sottoinsieme di espressioni adatto all'apprendimento: **non esegue JavaScript arbitrario**, `eval()` né codice di sistema. Una stessa variabile contiene un numero, un testo o un booleano. L'input converte automaticamente le stringhe che rappresentano numeri o booleani.

### Limitazioni note

- Grafi fino a **250 blocchi**, 500 collegamenti importati e 500 istruzioni per esecuzione (protezione contro i cicli infiniti).
- Il motore è pensato per gli esercizi introduttivi, non è un interprete completo di Python, C++ o JavaScript.
- L'editor è utilizzabile su touch, ma è più comodo con mouse e schermo ampio.
- Non è prevista collaborazione simultanea; GitHub Pages offre solo l'hosting statico.

## Struttura dei file

```text
index.html    Interfaccia e contenuti didattici
style.css     Layout e stili responsive
logic.js      Motore sicuro di valutazione/esecuzione e quattro esempi
app.js        Editor, UI, navigazione, salvataggio, import/export
favicon.svg   Icona del sito
.nojekyll     Disabilita l'elaborazione Jekyll su GitHub Pages
README.md     Questa guida
tests/        Test automatici della logica
```

## Test

Se Node.js è installato, lancia dalla cartella principale:

```bash
node --test tests/logic.test.js
```

Il progetto non richiede NPM, build o dipendenze runtime. È compatibile con i browser desktop e mobili moderni.
