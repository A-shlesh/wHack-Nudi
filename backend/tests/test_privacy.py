# Tests for privacy.redact: private numbers are hidden, normal text is kept.

from app.privacy import redact, safe_url


def test_card_number_with_spaces_is_hidden():
    result = redact("Card 4111 1111 1111 1111 ok")
    assert "4111" not in result
    assert "[hidden]" in result


def test_card_number_with_dashes_is_hidden():
    assert "4111" not in redact("4111-1111-1111-1111")


def test_ifsc_code_is_hidden():
    assert "SBIN0001234" not in redact("Send to IFSC SBIN0001234 now")


def test_long_account_number_is_hidden():
    assert "123456789012" not in redact("Account 123456789012")


def test_otp_is_hidden():
    result = redact("Your OTP: 1234 is ready")
    assert "1234" not in result


def test_cvv_and_password_are_hidden():
    assert "987" not in redact("CVV 987")
    assert "hunter2" not in redact("password: hunter2")


def test_bill_amount_is_kept():
    assert redact("Bill amount 1,240") == "Bill amount 1,240"


def test_dates_are_kept():
    text = "Due date 12-05-2025 or 12/05/2025"
    assert redact(text) == text


def test_plain_sentence_is_unchanged():
    text = "Pay your electricity bill here"
    assert redact(text) == text


def test_otp_in_a_sentence_is_hidden():
    assert "481516" not in redact("Your OTP is 481516")


def test_otp_before_the_keyword_is_hidden():
    assert "481516" not in redact("481516 is your OTP")


def test_spaced_aadhaar_is_hidden():
    assert "9012" not in redact("Aadhaar 1234 5678 9012")


def test_pan_is_hidden():
    assert "ABCDE1234F" not in redact("PAN ABCDE1234F")


def test_safe_url_drops_query_and_fragment():
    url = "https://bank.example.com/reset?token=abc123#access_token=xyz"
    assert safe_url(url) == "https://bank.example.com/reset"
