"""REST API views for HA Raiba — proxy requests to the PHP backend."""
from __future__ import annotations

import logging
from http import HTTPStatus

import aiohttp
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import CONF_PASSWORD, CONF_URL, CONF_USERNAME, DOMAIN

_LOGGER = logging.getLogger(__name__)


def _get_config(hass: HomeAssistant) -> dict | None:
    """Return the first registered entry config or None."""
    data = hass.data.get(DOMAIN, {})
    if not data:
        return None
    return next(iter(data.values()))


def _build_auth(config: dict) -> aiohttp.BasicAuth:
    return aiohttp.BasicAuth(config[CONF_USERNAME], config[CONF_PASSWORD])


def _base_url(config: dict) -> str:
    return config[CONF_URL].rstrip("/")


class RaibaTransactionsView(HomeAssistantView):
    """GET /api/raiba/transactions?tab=N"""

    url = "/api/raiba/transactions"
    name = "api:raiba:transactions"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        tab = request.query.get("tab", "0")
        target = f"{_base_url(config)}/getData.php?tab={tab}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        return self.json_message(f"Backend HTTP {resp.status}", HTTPStatus.BAD_GATEWAY)
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            _LOGGER.error("RaibaTransactionsView error: %s", err)
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaMarkReadView(HomeAssistantView):
    """GET /api/raiba/mark_read?id=N"""

    url = "/api/raiba/mark_read"
    name = "api:raiba:mark_read"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        entry_id = request.query.get("id", "0")
        target = f"{_base_url(config)}/getData.php?action=markRead&id={entry_id}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaMarkIdsView(HomeAssistantView):
    """GET /api/raiba/mark_ids?ids=1,2,3&read=0|1"""

    url = "/api/raiba/mark_ids"
    name = "api:raiba:mark_ids"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        ids = request.query.get("ids", "")
        read = request.query.get("read", "1")
        target = f"{_base_url(config)}/getData.php?action=markIds&ids={ids}&read={read}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaMarkAllReadView(HomeAssistantView):
    """GET /api/raiba/mark_all_read?konto=XXX"""

    url = "/api/raiba/mark_all_read"
    name = "api:raiba:mark_all_read"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        konto = request.query.get("konto", "")
        target = f"{_base_url(config)}/getData.php?action=markAllRead"
        if konto:
            target += f"&konto={konto}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaMarkAllUnreadView(HomeAssistantView):
    """GET /api/raiba/mark_all_unread?konto=XXX"""

    url = "/api/raiba/mark_all_unread"
    name = "api:raiba:mark_all_unread"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        konto = request.query.get("konto", "")
        target = f"{_base_url(config)}/getData.php?action=markAllUnread"
        if konto:
            target += f"&konto={konto}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaSyncStartView(HomeAssistantView):
    """GET /api/raiba/sync/start — trigger FinTS sync."""

    url = "/api/raiba/sync/start"
    name = "api:raiba:sync:start"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        target = f"{_base_url(config)}/syncFinTS.php?action=start"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status != 200:
                        return self.json_message(f"Backend HTTP {resp.status}", HTTPStatus.BAD_GATEWAY)
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            _LOGGER.error("RaibaSyncStartView error: %s", err)
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaSyncStatusView(HomeAssistantView):
    """GET /api/raiba/sync/status?session=XXX — poll FinTS sync status."""

    url = "/api/raiba/sync/status"
    name = "api:raiba:sync:status"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        session_id = request.query.get("session", "")
        if not session_id:
            return self.json_message("Missing session parameter", HTTPStatus.BAD_REQUEST)

        target = f"{_base_url(config)}/syncFinTS.php?action=status&session={session_id}"

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        return self.json_message(f"Backend HTTP {resp.status}", HTTPStatus.BAD_GATEWAY)
                    data = await resp.json(content_type=None)
                    return self.json(data)
        except Exception as err:
            _LOGGER.error("RaibaSyncStatusView error: %s", err)
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)
