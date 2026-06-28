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
