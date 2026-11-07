"""Shared test setup.

The fetch policy reads robots.txt before every request and spaces requests to one host by
seconds (contracts/outbound.py, W-34). Tests of other behaviour script their transports request
by request, so for them both are switched off here, from the test side: production code has no
switch. Tests marked `politeness` run the real check and spacing, from a clean state.

No test may look up a real name: a lookup fails as an unknown name would, and fails the test.
Addresses written as numbers, and localhost, are not lookups and pass.
"""
import ipaddress
import socket

import pytest

from contracts import outbound


def _numeric(name):
    """An address written as numbers needs no lookup."""
    try:
        ipaddress.ip_address(name.split("%", 1)[0])
    except ValueError:
        return False
    return True


def _clear_policy_state():
    outbound._robots.clear()
    outbound._last_answer.clear()
    outbound._host_locks.clear()
    outbound._robots_flights.clear()


@pytest.fixture(autouse=True)
def _politeness_off_unless_asked(request, monkeypatch):
    _clear_policy_state()
    if request.node.get_closest_marker("politeness") is None:
        async def no_robots_check(url, method, identity, budget, net):
            return None

        monkeypatch.setattr(outbound, "_robots_gate", no_robots_check)
        monkeypatch.setattr(outbound, "HOST_SPACING_SECONDS", 0.0)
    yield
    _clear_policy_state()


@pytest.fixture(autouse=True)
def _no_real_name_lookups(monkeypatch):
    looked_up = []
    real = socket.getaddrinfo

    def guarded(host, *args, **kwargs):
        name = host.decode() if isinstance(host, bytes) else str(host or "")
        if name in ("localhost", "") or _numeric(name):
            return real(host, *args, **kwargs)
        looked_up.append(name)
        raise socket.gaierror(socket.EAI_NONAME, "real name lookups are not allowed in tests")

    monkeypatch.setattr(socket, "getaddrinfo", guarded)
    yield
    assert not looked_up, f"a test looked up real names: {sorted(set(looked_up))}"
