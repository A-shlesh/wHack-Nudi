"""
Copies the demo pages and the family dashboard into backend/static/ so they
are included when AWS SAM packages the backend folder for Lambda.

Run this before `sam build`:   python backend/scripts/copy_static.py
(Locally you do not need it: the backend reads them from the repo folders.)
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "backend" / "static"

for folder in ["demo", "family-dashboard"]:
    destination = TARGET / folder
    if destination.exists():
        shutil.rmtree(destination)
    # _tmp holds local test files only; never ship it.
    shutil.copytree(ROOT / folder, destination, ignore=shutil.ignore_patterns("_tmp"))
    print(f"Copied {folder}/ -> {destination}")
