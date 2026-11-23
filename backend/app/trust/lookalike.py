"""
Lookalike check: is this website pretending to be a well-known Indian brand?

Two tricks scammers use:
  1. Brand name inside an unrelated domain:   sbi-online-pay.co, bescom-bill-pay-offer.co
  2. A near-miss spelling ("edit distance"):  flipkarrt.com, amazom.com

The brands and their REAL domains are in brands.json. A real brand domain
(or a sub-page of it) is never flagged.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .domains import name_part

_BRANDS = json.loads((Path(__file__).parent / "brands.json").read_text(encoding="utf-8"))


@dataclass
class LookalikeResult:
    kind: str  # "official", "brand_in_name", "near_miss" or "none"
    brand: dict | None = None


def edit_distance(a: str, b: str) -> int:
    """How many single-letter changes turn a into b (Levenshtein distance)."""
    previous = list(range(len(b) + 1))
    for i, letter_a in enumerate(a, start=1):
        current = [i]
        for j, letter_b in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,  # delete a letter
                    current[j - 1] + 1,  # add a letter
                    previous[j - 1] + (letter_a != letter_b),  # change a letter
                )
            )
        previous = current
    return previous[-1]


def _is_official(domain: str, brand: dict) -> bool:
    return any(domain == real or domain.endswith("." + real) for real in brand["official"])


def _has_brand_name(name: str, brand_name: str) -> bool:
    """Short names like "sbi" must be a whole word, so "sbiology" is not flagged."""
    words = [w for w in re.split(r"[^a-z]+", name) if w]
    if len(brand_name) <= 3:
        return brand_name in words
    return brand_name in name.replace("-", "").replace(".", "")


def _near_miss(name: str, brand_name: str) -> bool:
    """1 change for short brand names, 2 for long ones. Names of 4 letters or less are too risky to guess."""
    if len(brand_name) <= 4:
        return False
    allowed = 1 if len(brand_name) <= 6 else 2
    return 0 < edit_distance(name.replace("-", ""), brand_name) <= allowed


def check(domain: str, host: str | None = None) -> LookalikeResult:
    """domain = the bought name (bescom.co.in); host = the full name (pay.bescom.co.in), if known."""
    name = name_part(domain)
    for brand in _BRANDS:
        if _is_official(host or domain, brand) or _is_official(domain, brand):
            return LookalikeResult("official", brand)
    for brand in _BRANDS:
        if _has_brand_name(name, brand["name"]):
            return LookalikeResult("brand_in_name", brand)
    for brand in _BRANDS:
        if _near_miss(name, brand["name"]):
            return LookalikeResult("near_miss", brand)
    return LookalikeResult("none")
