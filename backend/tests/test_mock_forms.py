# Offline rules on a login page: the box to fill in and the Continue button are
# offered; the site's search box, search button and "+91" are not.

from app.schemas import PageSnapshot
from app.services import mock_ai


def login_page():
    return PageSnapshot(
        url="https://shop.example.com/login",
        title="Login",
        elements=[
            {"id": "n1", "kind": "button", "label": "Search for Products, Brands and More"},
            {"id": "n2", "kind": "input", "label": "Search for Products, Brands and More"},
            {"id": "n3", "kind": "link", "label": "Cart"},
            {"id": "n6", "kind": "button", "label": "+91"},
            {"id": "n7", "kind": "input", "label": "Phone Number"},
            {"id": "n10", "kind": "button", "label": "Continue"},
        ],
    )


def test_login_page_offers_the_phone_box_first():
    labels = [action.label for action in mock_ai.simplify(login_page())[1]]
    assert labels[0] == "Type your phone number"
    assert "Continue" in labels


def test_login_page_skips_search_and_symbols():
    labels = [action.label for action in mock_ai.simplify(login_page())[1]]
    assert not any("Search" in label for label in labels)
    assert "+91" not in labels
