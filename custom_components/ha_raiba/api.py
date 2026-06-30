"""REST API views for HA Raiba — proxy requests to the PHP backend."""
from __future__ import annotations

import json
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
    url = config[CONF_URL].rstrip("/")
    # Strip filename if URL points to a .php file
    if url.split("?")[0].endswith(".php"):
        url = url.rsplit("/", 1)[0]
    return url


async def _parse_json(resp: aiohttp.ClientResponse):
    """Read response and parse JSON, stripping UTF-8 BOM if present."""
    raw = await resp.read()
    text = raw.decode("utf-8-sig")
    return json.loads(text)


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
                    data = await _parse_json(resp)
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
                    data = await _parse_json(resp)
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
                    data = await _parse_json(resp)
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
                    data = await _parse_json(resp)
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
                    data = await _parse_json(resp)
                    return self.json(data)
        except Exception as err:
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)


class RaibaSyncView(HomeAssistantView):
    """GET /api/raiba/sync?action=start or ?action=status&session=XXX"""

    url = "/api/raiba/sync"
    name = "api:raiba:sync"
    requires_auth = True

    async def get(self, request):
        hass: HomeAssistant = request.app["hass"]
        config = _get_config(hass)
        if config is None:
            return self.json_message("Not configured", HTTPStatus.SERVICE_UNAVAILABLE)

        action = request.query.get("action", "")
        if action not in ("start", "status"):
            return self.json_message("Invalid action", HTTPStatus.BAD_REQUEST)

        # Build target URL with all query params
        target = f"{_base_url(config)}/syncFinTS.php?action={action}"
        session_id = request.query.get("session", "")
        if session_id:
            target += f"&session={session_id}"

        timeout = 60 if action == "start" else 30
        _LOGGER.warning("RaibaSyncView calling: %s", target)

        try:
            async with aiohttp.ClientSession(auth=_build_auth(config)) as session:
                async with session.get(target, timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=False) as resp:
                    _LOGGER.warning("RaibaSyncView response status: %s, url: %s, headers: %s", resp.status, resp.url, dict(resp.headers))
                    if resp.status in (301, 302, 303, 307, 308):
                        location = resp.headers.get("Location", "")
                        _LOGGER.warning("RaibaSyncView REDIRECT to: %s", location)
                        # Follow redirect manually with auth
                        async with session.get(location, timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=False) as resp2:
                            _LOGGER.warning("RaibaSyncView redirect response: %s, url: %s", resp2.status, resp2.url)
                            if resp2.status != 200:
                                return self.json_message(f"Backend HTTP {resp2.status}", HTTPStatus.BAD_GATEWAY)
                            data = await _parse_json(resp2)
                            _LOGGER.warning("RaibaSyncView response keys: %s", list(data.keys()) if isinstance(data, dict) else type(data))
                            return self.json(data)
                    if resp.status != 200:
                        return self.json_message(f"Backend HTTP {resp.status}", HTTPStatus.BAD_GATEWAY)
                    data = await _parse_json(resp)
                    _LOGGER.warning("RaibaSyncView response keys: %s", list(data.keys()) if isinstance(data, dict) else type(data))
                    return self.json(data)
        except Exception as err:
            _LOGGER.error("RaibaSyncView error: %s", err)
            return self.json_message(str(err), HTTPStatus.BAD_GATEWAY)
