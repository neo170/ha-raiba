"""HA Raiba integration setup."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api import (
    RaibaMarkAllReadView,
    RaibaMarkAllUnreadView,
    RaibaMarkIdsView,
    RaibaMarkReadView,
    RaibaSyncView,
    RaibaTransactionsView,
)
from .const import (
    DATA_PANEL_REGISTERED,
    DATA_STATIC_REGISTERED,
    DOMAIN,
    PANEL_URL,
    STATIC_URL,
)

_LOGGER = logging.getLogger(__name__)
_VERSION = json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a HA Raiba config entry."""
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = entry.data

    # Register static file path (once per HA lifetime)
    if not hass.data.get(DATA_STATIC_REGISTERED):
        www_path = str(Path(__file__).parent / "www")
        try:
            from homeassistant.components.http import StaticPathConfig

            await hass.http.async_register_static_paths(
                [StaticPathConfig(STATIC_URL, www_path, False)]
            )
        except (ImportError, AttributeError):
            hass.http.register_static_path(STATIC_URL, www_path, cache_headers=False)
        hass.data[DATA_STATIC_REGISTERED] = True

    # Register panel (once per HA lifetime)
    if not hass.data.get(DATA_PANEL_REGISTERED):
        from homeassistant.components.frontend import async_register_built_in_panel

        async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Raiba",
            sidebar_icon="mdi:bank",
            frontend_url_path=PANEL_URL,
            config={
                "_panel_custom": {
                    "name": "raiba-panel",
                    "js_url": f"{STATIC_URL}/raiba-panel.js?v={_VERSION}",
                    "embed_iframe": False,
                    "trust_external_script": True,
                }
            },
            require_admin=False,
        )
        hass.data[DATA_PANEL_REGISTERED] = True

    # Register REST API views
    hass.http.register_view(RaibaTransactionsView)
    hass.http.register_view(RaibaMarkReadView)
    hass.http.register_view(RaibaMarkIdsView)
    hass.http.register_view(RaibaMarkAllReadView)
    hass.http.register_view(RaibaMarkAllUnreadView)
    hass.http.register_view(RaibaSyncView)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data[DOMAIN].pop(entry.entry_id, None)

    if not hass.data.get(DOMAIN):
        from homeassistant.components.frontend import async_remove_panel

        try:
            async_remove_panel(hass, PANEL_URL)
        except Exception:
            pass

        hass.data.pop(DATA_PANEL_REGISTERED, None)
        hass.data.pop(DATA_STATIC_REGISTERED, None)

    return True
