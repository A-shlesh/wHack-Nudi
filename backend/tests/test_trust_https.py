# Tests for the https check: points taken off when a page is not secure.
from app.trust.https_check import check


def test_https_has_no_penalty():
    result = check("https", True, True)
    assert result.https is True
    assert result.penalty == 0
    assert result.code is None


def test_http_with_payment_or_login_is_heavy_penalty():
    for payment, login in [(True, False), (False, True), (True, True)]:
        result = check("http", payment, login)
        assert result.https is False
        assert result.penalty == 40
        assert result.code == "NO_HTTPS_SENSITIVE"


def test_plain_http_is_small_penalty():
    result = check("http", False, False)
    assert result.https is False
    assert result.penalty == 10
    assert result.code == "NO_HTTPS"
