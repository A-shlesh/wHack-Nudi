# Tests for risk_rules: scam/dark-pattern warnings and payment-word detection.

from app.risk_rules import check_page, is_payment_label
from app.schemas import PageSnapshot


def page(text="", url="https://shop.example.com", title=""):
    return PageSnapshot(url=url, title=title, text=text)


def levels(snapshot):
    return [w.level for w in check_page(snapshot)]


def test_urgency_gives_caution():
    assert "caution" in levels(page("Hurry! Offer ends in 5 minutes"))


def test_prize_scam_gives_danger():
    assert "danger" in levels(page("Congratulations, you have won a lottery"))


def test_kyc_gives_danger():
    assert "danger" in levels(page("Update KYC or your account will be blocked"))


def test_prechecked_addon_gives_caution():
    assert "caution" in levels(page("Protection plan added to your cart"))


def test_title_is_also_checked():
    assert "danger" in levels(page(title="Claim your prize"))


def test_clean_https_page_has_no_warnings():
    assert check_page(page("Welcome to our shop")) == []


def test_http_page_gives_danger():
    assert "danger" in levels(page(url="http://shop.example.com"))


def test_https_page_has_no_http_warning():
    assert check_page(page(url="https://shop.example.com")) == []


def test_http_localhost_is_allowed():
    assert check_page(page(url="http://localhost:8787/demo/")) == []


def test_payment_labels_are_detected():
    assert is_payment_label("Pay now")
    assert is_payment_label("PLACE ORDER")
    assert is_payment_label("Proceed to payment")
    assert is_payment_label("Donate")


def test_non_payment_labels_are_not_detected():
    assert not is_payment_label("Contact us")
    assert not is_payment_label("View bill")


def test_display_is_not_a_payment_word():
    assert not is_payment_label("Display settings")


def test_kannada_pay_word_is_a_payment():
    assert is_payment_label("ಪಾವತಿ ಮಾಡಿ")


def test_fake_localhost_domain_still_warns():
    warnings = check_page(page(url="http://localhost.evil.com/pay"))
    assert any("not secure" in w.message for w in warnings)
