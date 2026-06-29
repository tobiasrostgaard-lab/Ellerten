# Cable System Designer

Web-app til kabel-system design med IEC 81346 navngivning, derating-beregning, spændingsfald, kortslutning, LS-spor (sporinddeling) og Excel-eksport.

## Funktioner

- **Project parameters** med transformer-link (auto Z_source-beregning)
- **Kabelliste** med derating per IEC 60364-5-52 og LS-klassificering
- **Tray segments** med fill-beregning
- **Single-line diagram** auto-genereret
- **Cable sizing helper** finder mindste tværsnit
- **Excel-eksport** med 13 ark
- **JSON og CSV import/eksport**

## Deployment til Vercel (anbefalet)

### Mulighed A — via GitHub (5 minutter, gratis, virker fra telefon)

1. **Opret GitHub-konto** på [github.com](https://github.com) hvis du ikke har en
2. **Opret nyt repository:** klik `+` → `New repository` → giv det et navn → `Create repository`
3. **Upload filerne:** klik `uploading an existing file` → træk hele projekt-mappen ind → `Commit changes`
4. **Gå til [vercel.com](https://vercel.com)** og log ind med GitHub
5. **Klik `Add New` → `Project`** → vælg dit repo → `Import`
6. Vercel detekterer automatisk Vite-projektet → klik `Deploy`
7. Efter ~30 sekunder får du en URL som `dit-projekt.vercel.app`
8. **Gem URL'en** som bogmærke på telefonen, eller tilføj til hjemmeskærmen via Safari/Chrome's del-menu

### Mulighed B — via Vercel CLI (kræver computer)

```bash
npm install
npm install -g vercel
vercel
```

Følg promtene. Du får en URL ved første deployment.

### Mulighed C — lokal udvikling først

```bash
npm install
npm run dev
```

Åbn http://localhost:5173 i browseren. Test alt virker, derefter deploy via en af mulighederne ovenfor.

## Persistens

Data gemmes i browserens `localStorage` på den enhed du bruger. For at flytte mellem enheder: brug **Project → Export project (JSON)** og **Import** på den nye enhed.

## Tilføj til hjemmeskærm (som app)

- **iOS Safari:** del-knap (firkant med pil) → `Føj til hjemmeskærm`
- **Android Chrome:** menu (3 prikker) → `Føj til startskærm` eller `Installér app`

Appen får sit eget ikon og åbner i fuld skærm uden browser-controls.

## Tech stack

- Vite + React 18
- Tailwind CSS
- lucide-react (ikoner)
- xlsx (SheetJS Community Edition) til Excel-eksport
