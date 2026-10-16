"""Readable incident names: "Bengkalis, Riau · Pak Dedi · #3".

No geocoding call is made. The place is the nearest town in `PLACES`, when one is
within `MAX_PLACE_KM`, otherwise a coordinate label such as "1.48°N 102.12°E".
`PLACES` holds approximate town-centre coordinates and is meant to be extended
with the villages and sites the team works in.
"""
import re

from fusion.geo import distance_m

MAX_PLACE_KM = 25
MAX_REPORTER_LENGTH = 40

# (name, province, lat, lng)
PLACES = (
    ("Pekanbaru", "Riau", 0.5071, 101.4478),
    ("Dumai", "Riau", 1.6671, 101.4472),
    ("Bengkalis", "Riau", 1.4700, 102.1050),
    ("Selatpanjang", "Riau", 1.0000, 102.7167),
    ("Siak Sri Indrapura", "Riau", 0.7940, 102.0480),
    ("Pangkalan Kerinci", "Riau", 0.3333, 101.8667),
    ("Bagansiapiapi", "Riau", 2.1500, 100.8000),
    ("Tembilahan", "Riau", -0.3200, 103.1500),
    ("Rengat", "Riau", -0.3800, 102.5400),
    ("Jambi", "Jambi", -1.6101, 103.6131),
    ("Kuala Tungkal", "Jambi", -0.8200, 103.4800),
    ("Palembang", "Sumatera Selatan", -2.9761, 104.7754),
    ("Kayu Agung", "Sumatera Selatan", -3.4000, 104.8300),
    ("Pontianak", "Kalimantan Barat", -0.0263, 109.3425),
    ("Ketapang", "Kalimantan Barat", -1.8300, 109.9800),
    ("Pangkalan Bun", "Kalimantan Tengah", -2.6833, 111.6167),
    ("Sampit", "Kalimantan Tengah", -2.5333, 112.9500),
    ("Palangka Raya", "Kalimantan Tengah", -2.2161, 113.9135),
    ("Banjarmasin", "Kalimantan Selatan", -3.3194, 114.5908),
    # Added with coordinates checked against Wikipedia (town-centre values, rounded to four decimals).
    ("Bangkinang", "Riau", 0.3500, 101.0333),
    ("Teluk Kuantan", "Riau", -0.5298, 101.5721),
    ("Muara Bungo", "Jambi", -1.4840, 102.1170),
    ("Sungai Penuh", "Jambi", -2.0589, 101.3914),
    ("Pangkalan Balai", "Sumatera Selatan", -2.9068, 104.4143),
    ("Singkawang", "Kalimantan Barat", 0.9000, 108.9833),
    ("Kuala Kapuas", "Kalimantan Tengah", -3.0013, 114.3916),
    # Where the team tests the app. A report from here gets a readable name, not a coordinate label.
    ("Bengaluru", "Karnataka", 12.9789, 77.5917),
    ("Pune", "Maharashtra", 18.5211, 73.8553),
)


def coordinate_label(lat, lng):
    """"1.48°N 102.12°E": about a kilometre of precision, enough to tell areas apart."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lng >= 0 else "W"
    return f"{abs(lat):.2f}°{ns} {abs(lng):.2f}°{ew}"


def place_label(lat, lng, places=PLACES):
    nearest, nearest_m = None, None
    for place in places:
        metres = distance_m(lat, lng, place[2], place[3])
        if nearest_m is None or metres < nearest_m:
            nearest, nearest_m = place, metres
    if nearest is not None and nearest_m <= MAX_PLACE_KM * 1000:
        return f"{nearest[0]}, {nearest[1]}"
    return coordinate_label(lat, lng)


def clean_reporter(name):
    """The reporter's display name as one short line, or None when there is nothing to show."""
    if not isinstance(name, str):
        return None
    text = re.sub(r"[\s\x00-\x1f\x7f]+", " ", name).strip()
    return text[:MAX_REPORTER_LENGTH].strip() or None


def incident_name(lat, lng, reporter, number):
    parts = [place_label(lat, lng)]
    reporter = clean_reporter(reporter)
    if reporter:
        parts.append(reporter)
    parts.append(f"#{number}")
    return " · ".join(parts)
