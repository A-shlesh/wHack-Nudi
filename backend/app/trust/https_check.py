"""
HTTPS check. Without https, what you type can be read by others on the network.
That matters most on pages that take a payment or a password.
"""

from dataclasses import dataclass


@dataclass
class HttpsResult:
    https: bool
    penalty: int  # points taken off the trust score
    code: str | None
    message: str | None


def check(scheme: str, has_payment: bool, has_login: bool) -> HttpsResult:
    if scheme == "https":
        return HttpsResult(True, 0, None, None)
    if has_payment or has_login:
        return HttpsResult(
            False,
            40,
            "NO_HTTPS_SENSITIVE",
            "This website is not secure (no https), but it asks for a payment or a password.",
        )
    return HttpsResult(False, 10, "NO_HTTPS", "This website is not secure (no https).")
