"""Distance helpers. Pure math, no network."""
import math

EARTH_RADIUS_M = 6371000.0


def distance_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in metres (haversine)."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def centroid(points):
    """Mean lat/lng of (lat, lng) pairs. Fine for clusters a few hundred metres wide."""
    points = list(points)
    lat = sum(p[0] for p in points) / len(points)
    lng = sum(p[1] for p in points) / len(points)
    return round(lat, 6), round(lng, 6)
