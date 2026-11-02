"""Decide whether an already-resolved address may be connected to.

The ranges are listed here because Python's own `is_private` and `is_reserved` lists differ
between patch releases: Python 3.11.9 permits 6to4 (`2002::/16`) and `3fff::/20`, which later
releases refuse. Python's checks still apply, and can only refuse more.
"""
import ipaddress

_BLOCKED_V4 = tuple(
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
    )
)

# IPv6 outside global unicast is refused whole: loopback, unspecified, IPv4-compatible,
# NAT64 (`64:ff9b::/96`, `64:ff9b:1::/48`), discard, unique local, link-local, site-local
# (`fec0::/10`), multicast and SRv6 (`5f00::/16`). IPv4-mapped addresses are unwrapped first.
_GLOBAL_V6 = ipaddress.ip_network("2000::/3")
_BLOCKED_V6 = tuple(
    ipaddress.ip_network(network)
    for network in (
        "2001::/23",
        "2001:db8::/32",
        "2002::/16",
        "3fff::/20",
    )
)

_PERMITTED_PORTS = frozenset({80, 443})

_BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.google.com",
    }
)


def _unwrap(addr: ipaddress.IPv4Address | ipaddress.IPv6Address):
    mapped = getattr(addr, "ipv4_mapped", None)
    return mapped if mapped is not None else addr


def _listed_permitted(addr: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """The tables above alone, whatever Python's own lists say."""
    if addr.version == 4:
        return not any(addr in network for network in _BLOCKED_V4)
    return addr in _GLOBAL_V6 and not any(addr in network for network in _BLOCKED_V6)


def address_permitted(ip: str) -> bool:
    try:
        addr = _unwrap(ipaddress.ip_address(ip))
    except ValueError:
        return False
    if not _listed_permitted(addr):
        return False
    if (
        addr.is_unspecified
        or addr.is_multicast
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_private
        or addr.is_reserved
    ):
        return False
    return True


def hostname_permitted(host: str) -> bool:
    """Reject metadata names before DNS. IP literals use address_permitted."""
    name = host.strip().rstrip(".").lower()
    if not name:
        return False
    if name in _BLOCKED_HOSTS:
        return False
    if name.endswith(".localhost") or name.endswith(".metadata.google.internal"):
        return False
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return True
    return address_permitted(name)


def scheme_permitted(scheme: str) -> bool:
    return scheme in {"http", "https"}


def port_permitted(port: int) -> bool:
    return port in _PERMITTED_PORTS


def pin_address(ips: list[str]) -> str | None:
    """Pick one permitted address. Any prohibited answer rejects the whole set."""
    if not ips:
        return None
    ipv4: list[str] = []
    ipv6: list[str] = []
    for ip in ips:
        if not address_permitted(ip):
            return None
        addr = _unwrap(ipaddress.ip_address(ip))
        if addr.version == 4:
            ipv4.append(str(addr))
        else:
            ipv6.append(str(addr))
    if ipv4:
        return ipv4[0]
    return ipv6[0]


def chain_permitted(hops: list[str | None]) -> bool:
    """Every hop must already have been evaluated. A missing address fails closed."""
    if not hops:
        return False
    return all(hop is not None and address_permitted(hop) for hop in hops)
