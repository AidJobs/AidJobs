"""Decide whether an already-resolved address may be connected to."""
import ipaddress

_BLOCKED_V4 = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
)

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


def address_permitted(ip: str) -> bool:
    try:
        addr = _unwrap(ipaddress.ip_address(ip))
    except ValueError:
        return False
    if addr.version == 4 and any(addr in network for network in _BLOCKED_V4):
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
