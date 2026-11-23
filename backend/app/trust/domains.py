"""
Small helpers for working with website names.

"Registrable domain" = the part someone actually buys:
  www.onlinesbi.sbi        -> onlinesbi.sbi
  pay.bescom.co.in         -> bescom.co.in     (co.in is one ending, not two)
  sbi-online-pay.co        -> sbi-online-pay.co
"""

from urllib.parse import urlparse

# Endings made of two parts. Without this list, "bescom.co.in" would wrongly
# become "co.in". (A full list exists, the Public Suffix List; this short one
# covers the Indian sites in the demo.)
_TWO_PART_ENDINGS = {
    "co.in", "org.in", "net.in", "gov.in", "ac.in", "edu.in", "res.in", "nic.in", "bank.in", "firm.in", "gen.in", "ind.in",
    "co.uk", "org.uk", "com.au", "co.jp",
}

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def host_of(url: str) -> str:
    """The host name of a URL, lower case, without "www." and without a port."""
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def registrable_domain(host: str) -> str:
    labels = host.lower().strip(".").split(".")
    if len(labels) >= 3 and ".".join(labels[-2:]) in _TWO_PART_ENDINGS:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def name_part(domain: str) -> str:
    """The domain without its ending: "hdfcbankk.com" -> "hdfcbankk", "bescom.co.in" -> "bescom"."""
    labels = domain.split(".")
    ending_size = 2 if len(labels) >= 3 and ".".join(labels[-2:]) in _TWO_PART_ENDINGS else 1
    return ".".join(labels[:-ending_size])


def is_local(host: str) -> bool:
    return host in LOCAL_HOSTS
