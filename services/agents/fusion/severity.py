"""Severity scale from the shared contract, low to high.

`unknown` never raises or lowers a known severity.
"""
ORDER = ("none", "smoke", "small_flame", "large_flame")
UNKNOWN = "unknown"
FLAMES = ("small_flame", "large_flame")


def rank(severity):
    """Position on the scale, or -1 for unknown and anything off the scale."""
    try:
        return ORDER.index(severity)
    except ValueError:
        return -1


def is_known(severity):
    return rank(severity) >= 0


def higher(a, b):
    """The higher of two severities. A known value always beats unknown."""
    if rank(b) > rank(a):
        return b
    if not is_known(a) and not is_known(b):
        return UNKNOWN
    return a


def highest(values):
    result = UNKNOWN
    for value in values:
        result = higher(result, value)
    return result
