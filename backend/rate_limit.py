"""Shared slowapi Limiter — imported by main.py + routes that decorate endpoints.

Default limit is per-route; auth endpoints opt in to stricter caps to defend
against brute-force. Keyed on client IP (X-Forwarded-For aware via slowapi).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
