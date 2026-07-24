# AGENTS.md — ha-raiba (HACS-Integration)

Projektwissen für KI-Agenten und Entwickler. Committet, damit es mit dem Repo mitwandert.

## Allgemeine Konventionen
- Keine Code-Duplikate: gleiche Funktionen (z.B. von verschiedenen Buttons ausgelöst) in Zentralmethoden zusammenfassen.
- Einheitliches Layout/Design für alle Komponenten: konsistente Abstände, Farben, Schriftarten.

## Projektstruktur
- HACS-Integration unter `custom_components/ha_raiba/` (Python/aiohttp). Reiner **Proxy** auf das PHP-Backend (getData.php / syncFinTS.php), plus Custom-Panel (`www/raiba-panel.js`).
- `api.py`: registriert HomeAssistantView-Endpoints (`/api/raiba/...`), frische aiohttp-Session pro Request (kein URL-Cache). Zentrale Helfer `_base_url`/`_build_auth`/`_parse_json`.
- Aktuell KEINE Entitäten/Sensoren und KEIN Service. Mögliche Erweiterung: DataUpdateCoordinator + Sensoren (ungelesen gesamt/pro Konto, Saldo) + `ha_raiba.sync`-Service (pollt syncFinTS start/status). Sync läuft im 90-Tage-Fenster TAN-frei → automatisierbar.

## Release-Prozess (WICHTIG)
Ein gepushter Git-Tag ist KEIN Release. HACS erkennt nur echte GitHub-Releases.
Standardablauf fuer ein Patch-Release:
`./scripts/release.ps1 -Description "<beschreibung>"`
- Das Skript erhöht die Manifest-Version, committet alle getrackten Änderungen mit `vX.Y.Z: <beschreibung>`, taggt, pusht und erstellt die GitHub-Release.
- Fuer Minor- oder Major-Releases: `./scripts/release.ps1 -Version X.Y.Z -Description "<beschreibung>"`.
- Beim ersten Aufruf nimmt das Skript sich selbst automatisch auf. Andere unversionierte Dateien vor dem Aufruf bewusst mit `git add` aufnehmen oder entfernen. `-WhatIf` prueft den Ablauf ohne Aenderungen.
- Manueller Ablauf nur als Ausnahme: Manifest-Version erhöhen, mit `vX.Y.Z: <beschreibung>` committen, `git tag vX.Y.Z`, `git push origin master`, `git push origin vX.Y.Z`, dann `gh release create vX.Y.Z --repo neo170/ha-raiba --title "vX.Y.Z" --notes "<beschreibung>"`.
- `gh` CLI ist installiert und authentifiziert.
- Prüfen mit: `gh release list --repo neo170/ha-raiba`
- Panel-Cache-Busting: `__init__.py` hängt `?v={manifest version}` an raiba-panel.js → Version-Bump erzwingt Neuladen.

## HA-Panel (raiba-panel.js): Badge/Ungelesen-Zählung
- Nutzt Server-`UnreadCounts` (aus getData.php) und zählt clientseitig nach `!t.ReadAt` (NICHT nach Pending) — Vormerkposten zählen also mit, passt automatisch.
- Badge-Definition = Zeilen mit `gelesen IS NULL`, unabhängig von vorgemerkt (Vormerkposten werden fett/ungelesen angezeigt und müssen mitzählen).

## Backend & App liegen in einem separaten Repo
- PHP-Backend + iOS-App: `Z:\Nextcloud\Projects\raiba-app` (eigenes Repo, NICHT Teil dieses Workspaces). Details dort in `AGENTS.md`.
- Das Backend wird manuell auf den Server deployt; DB-Migrationen dort ausführen.
