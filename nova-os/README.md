# NovaOS

**Ein komplettes „Betriebssystem“ als Overlay für Windows.**
Ein Tastendruck (`Alt + Leertaste`) legt NovaOS über deinen Bildschirm – mit eigenem
Desktop, Dock, Fenstern, Apps und Befehlspalette. Alles arbeitet mit deinem echten
System: echte Dateien, echtes Terminal, deine installierten Programme.

![NovaOS](build/icon.png)

## Installieren (Windows)

**Variante A – fertige EXE aus GitHub Actions**

1. Auf GitHub im Repository auf **Actions → „NovaOS – Windows-Build“** gehen.
2. Den neuesten erfolgreichen Lauf öffnen und unten das Artefakt **NovaOS-Windows** herunterladen.
3. ZIP entpacken. Darin liegen:
   - `NovaOS Setup 1.0.0.exe` – Installer (mit Startmenü- und Desktop-Verknüpfung)
   - `NovaOS-1.0.0-portable.exe` – läuft ohne Installation
4. Starten. Beim ersten Mal begrüßt dich NovaOS mit einer kurzen Einführung.

> Windows SmartScreen kann warnen, weil die EXE nicht signiert ist → „Weitere Informationen“ → „Trotzdem ausführen“.

**Variante B – selbst bauen**

```powershell
# Node.js 20+ installieren: https://nodejs.org
cd nova-os
npm install
npm start            # NovaOS direkt starten
npm run dist         # Installer + portable EXE nach nova-os/dist bauen
```

## Bedienung

| Taste | Aktion |
|---|---|
| `Alt + Leertaste` | NovaOS ein-/ausblenden (in Einstellungen änderbar) |
| `Alt + Umschalt + Leertaste` | Von überall: NovaOS mit Suche öffnen |
| `Strg + K` | Befehlspalette: Apps, Programme, Dateien, Befehle, Rechnen (`=`), Websuche (`?`), Nova fragen |
| `Strg + Leertaste` | Startmenü |
| `Strg + Tab` | Fenster wechseln |
| `Alt + Q` | Fenster schließen |
| `Alt + ↑ / ↓ / ← / →` | Maximieren / Minimieren / links / rechts einrasten |
| `Alt + W` / Maus in Ecke oben links | Fensterübersicht |
| `Alt + D` | Alle Fenster minimieren |
| `Alt + T` / `Alt + E` | Terminal / Dateien |
| `Alt + 1 … 4` | Arbeitsfläche wechseln |

Das Dock zeigt rechts auch **laufende Windows-Programme** – ein Klick holt sie nach vorne.
Fenster an den Bildschirmrand ziehen rastet sie ein (Hälfte, Viertel, oben = maximieren).
Rechtsklick funktioniert überall: Desktop, Dateien, Dock, Titelleisten, Notizen …

## Apps

| App | Was sie kann |
|---|---|
| **Dateien** | Navigieren, Suchen, Kopieren/Ausschneiden/Einfügen, Drag & Drop, Umbenennen, Papierkorb, Raster/Liste, Bildvorschau, Laufwerke |
| **Terminal** | PowerShell / CMD / Bash, Tabs, Verlauf, Tab-Vervollständigung, `open .`, `edit datei` |
| **Code** | Editor mit Syntax-Highlighting, Tabs, Suchen & Ersetzen, Markdown-Vorschau, Speichern |
| **Notizen** | Markdown-Notizen als echte `.md`-Dateien in `Dokumente\NovaOS\Notizen` |
| **Aufgaben** | Listen, Fälligkeit, Priorität, Schnelleingabe („Morgen Bericht !hoch #arbeit“) |
| **Kalender** | Monat/Woche, Termine, Erinnerungen, deutsche Feiertage |
| **Browser** | Tabs, Lesezeichen, Startseite, Zoom (echtes Chromium) |
| **Programme** | Alle installierten Windows-Programme mit Icons starten, Favoriten |
| **System** | CPU/RAM/Netzwerk live, Laufwerke, Prozesse beenden |
| **Rechner** | Standard, wissenschaftlich, Einheiten-Umrechner, Verlauf |
| **Musik** | Lokale Musik abspielen, Zufall/Wiederholen, Medientasten |
| **Bilder** | Galerie, Zoom, Drehen, Diashow, als Hintergrund setzen |
| **Fokus** | Pomodoro, Timer, Stoppuhr – mit Anzeige in der Statusleiste |
| **Wetter** | Aktuell, 24 Stunden, 7 Tage (Open-Meteo, ohne Anmeldung) |
| **Nova KI** | KI-Assistent mit Claude: Chats, Dateien als Kontext, Antworten als Notiz (eigener API-Schlüssel) |
| **Zwischenablage** | Verlauf aller kopierten Texte, Anheften |
| **Einstellungen** | Design, Akzentfarbe, Hintergründe, Durchsichtigkeit, Dock, Hotkey, Autostart |

## Entwicklung

```bash
npm run preview   # Oberfläche im Browser (simuliertes System) → http://localhost:5173
npm run check     # Syntax-Prüfung aller Dateien
npm run dev       # Electron mit Entwicklertools
```

Aufbau und Arbeitsweise: siehe [PLAN.md](PLAN.md).
