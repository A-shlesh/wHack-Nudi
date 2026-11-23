# Tests for the lookalike check: is a website pretending to be a known brand?
import pytest

from app.trust.domains import registrable_domain
from app.trust.lookalike import check, edit_distance


def kind_of(host):
    return check(registrable_domain(host), host).kind


def test_edit_distance_basics():
    assert edit_distance("", "") == 0
    assert edit_distance("abc", "abc") == 0
    assert edit_distance("abc", "abd") == 1  # change a letter
    assert edit_distance("abc", "abcd") == 1  # add a letter
    assert edit_distance("abc", "") == 3
    assert edit_distance("kitten", "sitting") == 3


@pytest.mark.parametrize("host", ["sbi.co.in", "onlinesbi.sbi", "hdfcbank.com", "pay.bescom.co.in"])
def test_official_domains(host):
    assert kind_of(host) == "official"


def test_official_subpage_is_official():
    result = check("bescom.co.in", "pay.bescom.co.in")
    assert result.kind == "official"
    assert result.brand["name"] == "bescom"


@pytest.mark.parametrize("host", ["sbi-online-pay.co", "bescom-bill-pay-offer.co"])
def test_brand_inside_unrelated_domain(host):
    assert kind_of(host) == "brand_in_name"


def test_brand_in_name_points_to_right_brand():
    assert check("bescom-bill-pay-offer.co").brand["name"] == "bescom"


@pytest.mark.parametrize(
    "host,brand",
    [("flipkarrt.com", "flipkart"), ("phonepay.com", "phonepe"), ("amazom.com", "amazon")],
)
def test_near_miss(host, brand):
    result = check(registrable_domain(host), host)
    assert result.kind == "near_miss"
    assert result.brand["name"] == brand


@pytest.mark.parametrize("host", ["wikipedia.org", "sbiology.com", "example.com"])
def test_innocent_domains_not_flagged(host):
    assert kind_of(host) == "none"
