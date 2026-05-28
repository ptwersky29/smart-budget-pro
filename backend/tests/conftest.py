"""Test harness helpers for preview-environment health checks."""

import os
import warnings

import requests
from urllib3.exceptions import InsecureRequestWarning


warnings.simplefilter("ignore", InsecureRequestWarning)

_original_request = requests.sessions.Session.request


def _request_with_preview_tls_disabled(self, method, url, **kwargs):
    if "preview.emergentagent.com" in url:
        kwargs.setdefault("verify", False)
    return _original_request(self, method, url, **kwargs)


requests.sessions.Session.request = _request_with_preview_tls_disabled

os.environ.setdefault("PYTHONHTTPSVERIFY", "0")
