"""Decide whether an already-resolved address may be connected to."""
import ipaddress

_BLOCKED_V4 = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
)


def address_permitted(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.version == 4 and any(addr in network for network in _BLOCKED_V4):
        return False
    if addr.is_loopback or addr.is_link_local or addr.is_private or addr.is_reserved:
        return False
    return True


def chain_permitted(hops: list[str | None]) -> bool:
    """Every hop must already have been evaluated. A missing address fails closed."""
    if not hops:
        return False
    return all(hop is not None and address_permitted(hop) for hop in hops)
