"""Config flow for HA Raiba integration."""
from __future__ import annotations

import logging

import aiohttp
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_PASSWORD, CONF_URL, CONF_USERNAME, DOMAIN

_LOGGER = logging.getLogger(__name__)

_STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL): str,
        vol.Required(CONF_USERNAME): str,
        vol.Required(CONF_PASSWORD): str,
    }
)


class HaRaibaConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the initial setup config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await self._test_connection(
                    url=user_input[CONF_URL],
                    username=user_input[CONF_USERNAME],
                    password=user_input[CONF_PASSWORD],
                )
            except PermissionError:
                errors["base"] = "invalid_auth"
            except Exception:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(user_input[CONF_URL])
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title="Raiba Umsätze",
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=_STEP_USER_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return HaRaibaOptionsFlow()

    @staticmethod
    async def _test_connection(url: str, username: str, password: str) -> None:
        """Test connectivity to the Raiba REST service."""
        auth = aiohttp.BasicAuth(username, password)
        test_url = url.rstrip("/") + "/getData.php?tab=0"
        async with aiohttp.ClientSession(auth=auth) as session:
            async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 401:
                    raise PermissionError("Invalid credentials")
                if resp.status != 200:
                    raise ConnectionError(f"HTTP {resp.status}")


class HaRaibaOptionsFlow(config_entries.OptionsFlow):
    """Allow editing connection parameters."""

    async def async_step_init(self, user_input=None):
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await HaRaibaConfigFlow._test_connection(
                    url=user_input[CONF_URL],
                    username=user_input[CONF_USERNAME],
                    password=user_input[CONF_PASSWORD],
                )
            except PermissionError:
                errors["base"] = "invalid_auth"
            except Exception:
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(title="", data=user_input)

        cur = self.config_entry
        schema = vol.Schema(
            {
                vol.Required(CONF_URL, default=cur.data.get(CONF_URL, "")): str,
                vol.Required(CONF_USERNAME, default=cur.data.get(CONF_USERNAME, "")): str,
                vol.Required(CONF_PASSWORD, default=cur.data.get(CONF_PASSWORD, "")): str,
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            errors=errors,
        )
