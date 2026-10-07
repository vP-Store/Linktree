# NovaOS – Gauntlet-Plan

> Ein Overlay-Programm für Windows, das aussieht und sich bedient wie ein komplett
> eigenes Betriebssystem. Ein Tastendruck (`Alt + Leertaste`) legt NovaOS über
> Windows – du arbeitest darin mit echten Dateien, echtem Terminal, echten
> Programmen – und ein weiterer Tastendruck blendet es wieder aus.

---

## 1. Zielbild (Definition „10 von 10“)

| Kriterium | Messlatte |
|---|---|
| **Optik** | Eigenständige Designsprache (Glas, Tiefe, Aurora-Wallpaper, eigene Icons), konsistent in Hell/Dunkel, 8 Akzentfarben, flüssige Animationen (60 fps) |
| **Übersicht** | Statusleiste oben, Dock unten, Startmenü mit Suche, Befehlspalette (`Strg+K`), Widgets, Mitteilungszentrale – alles max. 2 Klicks entfernt |
| **Arbeiten** | Dateien, Terminal, Editor, Notizen, Aufgaben, Browser, Rechner, Kalender, Systemmonitor, App-Starter für installierte Windows-Programme, Zwischenablage-Verlauf, Musik, Bilder, Timer, Wetter |
| **Fenster** | Ziehen, Größe ändern, Maximieren, Minimieren, Snap (Hälften/Viertel), Fensterwechsel (`Alt+Tab`-artig), mehrere Arbeitsflächen |
| **Funktioniert** | Jede App ist mit dem echten System verbunden (Node/Electron-IPC), Daten werden gespeichert, nichts ist Attrappe |
| **Windows-fertig** | Installer (`.exe` NSIS) + portable Version, Autostart-Option, Tray-Icon, globaler Hotkey, Einzelinstanz |

## 2. Architektur

```
nova-os/
├─ src/main/          Electron-Hauptprozess (Fenster, Hotkey, Tray, IPC → Dateisystem, Prozesse, Shell)
│  ├─ main.js
│  ├─ ipc/*.js        je Bereich ein Modul (fs, sys, term, apps, store, clip, power)
│  └─ preload.js      sichere Brücke → window.nova
├─ src/renderer/      Die „Betriebssystem“-Oberfläche (Vanilla ES-Module, kein Build-Schritt)
│  ├─ index.html
│  ├─ css/            Design-Tokens, Shell, Fenster, Apps
│  └─ js/
│     ├─ core/        api (inkl. Browser-Mock), store, wm (Fenstermanager), shell, icons, ui-Helfer
│     └─ apps/        eine Datei pro App
├─ tests/             Playwright-Tests gegen den Renderer (Mock-API) + Screenshots
└─ .github/workflows  Windows-Build in der Cloud → fertige .exe als Artefakt
```

**Warum Electron?** Echtes Glas-Overlay (transparent, rahmenlos, immer im Vordergrund),
voller Zugriff auf Dateisystem/Prozesse, Windows-Installer per `electron-builder`.

**Warum kein Framework?** Kein Build-Schritt, schnelle Startzeit, jede Datei direkt lesbar.
Der Renderer läuft auch im normalen Browser (Mock-API) → automatisiert testbar.

## 3. Der Gauntlet-Loop

Jede Runde durchläuft dieselben 6 Stationen. Eine Runde ist erst bestanden, wenn alle
Stationen grün sind. Danach beginnt sofort die nächste Runde mit dem nächsten Ziel aus
dem Backlog.

```
 ┌──────────► 1. ZIEL wählen (höchster Wert aus Backlog)
 │            2. BAUEN (kleinster vollständiger Schritt)
 │            3. PRÜFEN  – node --check, Playwright-Tests, Electron-Start unter Xvfb
 │            4. ANSCHAUEN – Screenshots, gegen Rubrik bewerten (Optik/Übersicht/Funktion)
 │            5. HÄRTEN – Fehler & Schwächen aus 3+4 sofort beheben
 └──────────  6. COMMIT + PUSH, Backlog aktualisieren
```

**Abbruchregel pro Station:** Wenn Prüfen fehlschlägt → zurück zu Bauen, nie überspringen.
**Qualitätsregel:** Keine Attrappen. Jeder Knopf tut etwas oder existiert nicht.

## 4. Runden-Fahrplan

| Runde | Ziel | Status |
|---|---|---|
| R1 | Gerüst: Electron-Overlay, Hotkey, Tray, Preload, IPC-Grundlagen | ✅ |
| R2 | Design-System: Tokens, Glas, Wallpaper, Icons, Typografie | ✅ |
| R3 | Shell: Boot, Statusleiste, Dock, Startmenü, Desktop-Icons | ✅ |
| R4 | Fenstermanager: Ziehen, Resize, Snap, Min/Max, Fokus, Tastenkürzel | ✅ |
| R5 | Kern-Apps: Dateien, Terminal, Editor, Notizen, Einstellungen | ✅ |
| R6 | Produktiv-Apps: Aufgaben, Kalender, Rechner, Browser, Systemmonitor | ✅ |
| R7 | Windows-Integration: App-Starter (Startmenü-Verknüpfungen + Icons), Zwischenablage, Energie | ✅ |
| R8 | Befehlspalette, Mitteilungen, Schnelleinstellungen, Widgets | ✅ |
| R9 | Medien & Extras: Musik, Bilder, Timer/Pomodoro, Wetter | ✅ |
| R10 | Tests + Screenshots + Windows-Build-Pipeline | ✅ |
| R11 | Gauntlet-Testsuite (Playwright) + CI, Ebenen-Fix (Dialoge hinter Fenstern) | ✅ |
| R12 | Fensterübersicht (Alt+W), sparsame Netzwerkmessung unter Windows | ✅ |
| R13 | Windows-Fenster nach vorne holen, Bildschirmfoto, Datei-Vorschau | ✅ |
| R14 | Dock-Vergrößerung, heiße Ecke, Doppel-Esc, Desktop-Drag & Drop | ✅ |
| R15 | KI-Assistent „Nova KI“ (Claude, verschlüsselter Schlüssel, Streaming, Dateien als Kontext) | ✅ |
| R16 | Widgets einzeln wählbar, Leistungsmodus | ✅ |
| R17 | Globale Schnellsuche (Alt+Umschalt+Leertaste), Sitzungs-Test | ✅ |
| R18 | Systematischer Code-Review: 10 Fehler + 7 Restpunkte behoben | ✅ |
| R19 | PDF-Vorschau, Screenreader-Beschriftungen | ✅ |
| R20 | Helles Design geprüft: lesbare Desktop-Beschriftungen, Kontraste | ✅ |
| R21 | Browser-Downloads ohne Dialog, sichere Webseiten-Berechtigungen | ✅ |
| R22 | ZIP packen/entpacken, PDF-Export | ✅ |
| R23 | **Echter Rauchtest der EXE auf Windows in der CI** | ✅ |
| R24 | Terminal: 256 Farben/Truecolor/Fortschrittszeilen; Unit-Tests | ✅ |
| R25 | Kalender-Icon mit Datum, Dock-Badges | ✅ |
| R26 | Palette durchsucht Notizentexte, Aufgaben, Termine | ✅ |
| R27 | Windows-Programme ins Dock heften | ✅ |
| R28 | Zweiter Code-Review: **Windows-Terminal zeigte Leerzeilen (CRLF)** + 9 weitere | ✅ |
| R29 | Sicherung & Wiederherstellung | ✅ |
| R30 | Haftnotizen; Kernfehler: `<textarea>`-Inhalte wurden nicht gesetzt | ✅ |
| R31–R33 | Startzeit-Messung, aktiver Hotkey im Willkommen, Mini-Player | ✅ |
| R34–R36 | F1-Hilfe, Wetter-Vorschlag, wiederkehrende Aufgaben | ✅ |
| R37 | Dritter Code-Review: 10 Fehler, Dialog-Fokus | ✅ |
| R38 | Kalender-Import/Export (.ics) | ✅ |
| R39 | **Nova KI handelt**: Werkzeuge für Aufgaben, Termine, Notizen, Dateisuche | ✅ |
| R40 | Nova KI aus Editor und Notizen (erklären, verbessern, zusammenfassen) | ✅ |
| R41 | Sicherheits-Review: Markdown-Attribut-Ausbruch, KI-Bilder als Link, Navigationssperre | ✅ |
| R42 | Live-3D-Hintergründe (Galaxie, Horizont) mit Maus-Parallaxe, pausieren wenn verdeckt | ✅ |
| R43 | 3D-Fenster: perspektivisches Öffnen/Schließen/Minimieren, Neigung beim Ziehen | ✅ |
| R44 | 3D-Karten mit Glanzlicht (Widgets, App-Kacheln, Vorschauen), Dock-Spiegelung | ✅ |
| R45 | Strg+Tab als 3D-Karussell mit Spiegelung, 3D-Startbildschirm (Orb mit Ringen, Flug hinein) | ✅ |
| R46 | Arbeitsflächen-Wechsel als 3D-Drehung, Anzeige der Arbeitsfläche, 3D-Hintergrund dreht mit | ✅ |
| R47 | Schalter „Räumliche 3D-Effekte“, Übersicht mit gestaffeltem Einschweben und Anheben beim Hover | ✅ |
| R48 | Symbole mit Tiefe, Lichtkante an Fenstern, Desktop-Symbole in 3D, dritter 3D-Hintergrund „Wellen“ | ✅ |
| R49 | Widget „Weltuhr 3D“: Punkt-Globus mit echter Tag-/Nachtseite, Städte, Uhrzeiten | ✅ |
| R50 | 3D-Mikroanimationen (Startmenü, Palette, Meldungen, Menüs, Dialoge, Kalender blättert); Kalender-Monatssprung am 31. behoben | ✅ |
| R51 | Musik: 3D-Plattenspieler (Vinyl gleitet heraus, dreht sich); Systemmonitor füllt die Höhe, Achsen ohne Abschneiden | ✅ |
| R52 | Rechner skaliert mit dem Fenster, Tasten mit 3D-Kante; Raumtiefe (Parallaxe-Ebenen) auf dem Desktop | ✅ |
| R53 | Bildschirmschoner mit 3D-Hintergrund und großer Uhr (Einstellung, Befehl), README „3D & Effekte“ | ✅ |
| R54 | Bilder: 3D-Karussell-Ansicht (Pfeiltasten, Mausrad, Klick öffnet, Rückkehr zum zuletzt gesehenen Bild) | ✅ |
| R55 | Terminal-Designs: Nova, Retro-CRT (Phosphor + Scanlines), Bernstein, Papier | ✅ |
| R56 | Aufgaben: Fortschrittsring im Kopf, 3D-Konfetti wenn alles erledigt ist | ✅ |
| R57 | Wetter: animierter Himmel (Regen in Tiefenebenen, Gewitter, Schnee, Wolken, Sonnenstrahlen, Mond + Sterne) | ✅ |
| R58 | Code-Review der 3D-Runden: 14 Befunde behoben (Papier-Terminal, Schoner + Webview/Video, Toast-Ausblendung, Standbild nach Resize, Leistung Lichtkante/Parallaxe, Globus-Schleife, Karussell-Tasten u. a.) | ✅ |
| R59 | Einstellungen: echte Standbild-Vorschau der 3D-Hintergründe | ✅ |
| R60 | Start aus dem Dock: Fenster fliegt räumlich aus dem Symbol auf | ✅ |
| R61 | Minimieren fliegt ins Dock-Symbol der App (und von dort zurück) | ✅ |
| R62 | Popover mit dichterem Glas; keine Toasts über dem offenen Mitteilungscenter | ✅ |
| R63 | Systemklänge (Web Audio, synthetisch, abschaltbar, Lautstärke) | ✅ |
| R64 | Browser-Starttab: farbige Schnellwahl-Kacheln mit 3D-Neigung | ✅ |
| R65 | Korrekte Silbentrennung in App-Kacheln (weiche Trennstellen, Suche unverändert) | ✅ |
| R66 | Snap-Layouts am Maximieren-Knopf (Hälften, Drittel, 2/3+1/3, Viertel, Mitte, Maximiert) | ✅ |
| R67 | Benannte Fenster-Anordnungen speichern/öffnen/löschen (Befehlspalette) | ✅ |
| R68+ | Politur-Schleife: Rubrik-Bewertung → schwächste Stelle verbessern → wiederholen | 🔁 |

## 5. Bewertungsrubrik (Station 4)

Jeder Screen wird mit 0–2 Punkten je Kriterium bewertet (max. 10):

1. Visuelle Hierarchie – sieht man sofort, was wichtig ist?
2. Konsistenz – Abstände, Radien, Farben, Icons aus einem Guss?
3. Dichte – genug Information ohne Gedränge?
4. Feedback – Hover, Fokus, Laden, Fehler, Leere Zustände sichtbar?
5. Funktion – tut alles, was es verspricht?

Alles unter 9/10 kommt zurück in den Backlog.

## 6. Backlog (lebendig – wird jede Runde neu priorisiert)

Erledigt: ~~Mehrere Arbeitsflächen mit Übersicht~~ · ~~Drag & Drop zwischen Dateien-Fenstern~~ ·
~~Datei-Vorschau~~ · ~~Eigene Wallpaper~~ · ~~Windows-Fenster steuern~~ · ~~Bildschirmfoto~~

Offen:
- Widgets frei positionierbar / ein- und ausschaltbar je Widget
- KI-Assistent (optional, API-Schlüssel in Einstellungen)
- Mehrere Monitore gleichzeitig
- Lautstärke/Helligkeit (benötigt native Windows-APIs)

## 7. Gauntlet-Protokoll (Funde aus den Prüfstationen)

| Runde | Fund | Behebung |
|---|---|---|
| R10 | Editor startete nicht (Variable vor Initialisierung genutzt) | Reihenfolge korrigiert |
| R10 | „null“ als Text in Kalender/Aufgaben | `append()` filtert leere Kinder zentral |
| R10 | Fokus-Ring als graues Achteck | CSS-Selektor traf auch Label-Icon → präzisiert |
| R10 | Zwischenablage-Fehler in Electron 44 | `readText()` ist jetzt asynchron → `await` |
| R11 | Dialoge & Kontextmenüs hinter Fenstern | Ebenen-Container positioniert |
| R11 | Erste Tasten in Palette gingen verloren | Fokus sofort statt verzögert |
| R13 | Leerer Ordner zerbrach Raster, doppelte Favoriten | Layout + Deduplizierung |
| R13 | Programme öffneten sich hinter dem Overlay | NovaOS tritt nach dem Öffnen automatisch zur Seite |
| R16 | Heiße Ecke löste aus, wenn der Zeiger schon in der Ecke lag (CI) | Nur Hineinfahren zählt |
| R28 | Windows-Terminal: CRLF-Zeilen wurden leer – nur durch Review gefunden, jetzt per Windows-Rauchtest abgesichert | `\r\n` → `\n` vor der Ausgabe |
| R30 | `<textarea>`-Inhalte (Schnellnotiz, Termin-Notizen) erschienen leer | `value` immer als Eigenschaft |
| R18 | Umbenennen überschrieb Dateien, „Speichern unter“ ohne Rückfrage, `cd -` legte Terminal lahm, u. v. m. | siehe Commit „10 Fehler aus dem Code-Review“ |

## 8. Prüfstand (jede Runde)

| Prüfung | Umfang | Wo |
|---|---|---|
| Syntax | alle 57 JS-Dateien | lokal + CI |
| Unit-Tests | Rechner, ANSI, Highlighting, Markdown (inkl. HTML-Injektion), Pfade | lokal + CI |
| Oberflächen-Tests | 33 Playwright-Tests: alle Apps, Palette, Fenster, Dateien, Notizen, Terminal, KI, Sitzung … | lokal + CI |
| Electron-Rauchtest | echte App unter Xvfb (Linux) | lokal |
| **Windows-Rauchtest** | gebaute `NovaOS.exe` auf `windows-latest`: 142 Programme gefunden, Fensterliste, 149 Prozesse, Laufwerke C:/D:, Netzwerkrate, PowerShell-Terminal | CI |

## 9. Bedienung (Kurzreferenz)

| Taste | Aktion |
|---|---|
| `Alt + Leertaste` | NovaOS ein-/ausblenden (in Einstellungen änderbar) |
| `Strg + K` | Befehlspalette / Suche |
| `Strg + Leertaste` / Klick auf Logo | Startmenü |
| `Alt + W` / Maus in Ecke oben links | Fensterübersicht |
| `Alt + Q` | Aktives Fenster schließen |
| `Alt + ↑ / ← / →` | Maximieren / links / rechts einrasten |
| `Alt + ↓` | Minimieren |
| `Strg + Tab` | Fenster wechseln |
| `Alt + 1 … 4` | Arbeitsfläche wechseln |
| `Esc Esc` (leerer Desktop) | NovaOS ausblenden |
| `Esc` | Menüs schließen |
