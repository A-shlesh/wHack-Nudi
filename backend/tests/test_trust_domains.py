# Tests for the website-name helpers (host_of, registrable_domain, name_part, is_local).
from app.trust.domains import host_of, is_local, name_part, registrable_domain


def test_host_of_strips_www_and_port():
    assert host_of("https://www.Example.com:8443/path?x=1") == "example.com"


def test_host_of_keeps_other_subdomains():
    assert host_of("https://pay.bescom.co.in/bill") == "pay.bescom.co.in"


def test_registrable_domain_two_part_ending():
    assert registrable_domain("bescom.co.in") == "bescom.co.in"
    assert registrable_domain("pay.bescom.co.in") == "bescom.co.in"


def test_registrable_domain_simple_endings():
    assert registrable_domain("sbi-online-pay.co") == "sbi-online-pay.co"
    assert registrable_domain("www.onlinesbi.sbi") == "onlinesbi.sbi"
    assert registrable_domain("onlinesbi.sbi") == "onlinesbi.sbi"


def test_name_part():
    assert name_part("hdfcbankk.com") == "hdfcbankk"
    assert name_part("bescom.co.in") == "bescom"
    assert name_part("sbi-online-pay.co") == "sbi-online-pay"


def test_is_local():
    assert is_local("localhost")
    assert is_local("127.0.0.1")
    assert not is_local("example.com")
