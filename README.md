# HA Raiba

Home Assistant HACS-Integration zur Anzeige von Bankumsätzen über einen PHP REST-Webservice.

## Features

- Anzeige von Bankumsätzen aller konfigurierten Konten
- Sidebar-Panel mit Kontoübersicht und Salden
- Suchfunktion über alle Umsatzfelder
- Gelesen/Ungelesen-Markierung (einzeln und alle)
- Bank-Sync mit 2FA (pushTAN) Unterstützung
- Detailansicht pro Buchung

## Installation

1. HACS → Benutzerdefinierte Repositories → URL dieses Repos hinzufügen
2. Integration installieren und Home Assistant neu starten
3. Einstellungen → Integrationen → "HA Raiba" hinzufügen
4. Server-URL, Benutzername und Passwort eingeben

## Konfiguration

- **Server-URL**: URL zum PHP REST-Backend (z.B. `https://example.com/raiba`)
- **Benutzername**: HTTP Basic Auth Benutzername
- **Passwort**: HTTP Basic Auth Passwort

## Release

Ein Patch-Release wird mit einem Aufruf erstellt:

```powershell
.\scripts\release.ps1 -Description "Beschreibung der Aenderung"
```

Das Skript erhoeht die Patch-Version im Manifest, committet alle getrackten Aenderungen, erstellt und pusht den Git-Tag sowie die GitHub-Release. Fuer einen Minor- oder Major-Release wird die Zielversion explizit angegeben:

```powershell
.\scripts\release.ps1 -Version 0.4.0 -Description "Neue Funktion"
```

`git` und die authentifizierte `gh`-CLI muessen verfuegbar sein. Beim ersten Aufruf nimmt das Skript sich selbst automatisch auf; andere unversionierte Dateien werden als Sicherheitsmassnahme abgelehnt und vorher mit `git add` aufgenommen. Mit `-WhatIf` laesst sich der Ablauf ohne Aenderungen pruefen.
