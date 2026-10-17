"""The image must carry every module the app imports.

Cloud Run builds from the Dockerfile's COPY lines only, so a new top-level
module or package that is not listed there fails at startup with a
ModuleNotFoundError even though every test passes.
"""
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent
NOT_SHIPPED = {"conftest.py"}


def _copied():
    names = set()
    for line in (API_DIR / "Dockerfile").read_text().splitlines():
        parts = line.split()
        if parts and parts[0].upper() == "COPY" and len(parts) > 2:
            for source in parts[1:-1]:
                if not source.startswith("--"):
                    names.add(source.rstrip("/"))
    return names


def test_every_top_level_module_is_copied_into_the_image():
    copied = _copied()
    modules = {
        path.name
        for path in API_DIR.glob("*.py")
        if path.name not in NOT_SHIPPED and not path.name.startswith("test_")
    }
    assert sorted(modules - copied) == []


def test_every_package_is_copied_into_the_image():
    copied = _copied()
    packages = {
        path.parent.name
        for path in API_DIR.glob("*/__init__.py")
        if path.parent.name != "tests"
    }
    assert sorted(packages - copied) == []

