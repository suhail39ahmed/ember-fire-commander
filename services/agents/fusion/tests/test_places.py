from fusion.places import (
    MAX_PLACE_KM, MAX_REPORTER_LENGTH, clean_reporter, coordinate_label, incident_name, place_label,
)


def test_nearest_town_names_the_place():
    assert place_label(1.482, 102.115) == "Bengkalis, Riau"
    assert place_label(-1.8205, 110.0932) == "Ketapang, Kalimantan Barat"


def test_the_nearest_of_several_towns_wins():
    # Between Pekanbaru and Siak, closer to Siak.
    assert place_label(0.80, 102.00) == "Siak Sri Indrapura, Riau"


def test_far_from_every_town_uses_coordinates():
    assert place_label(10.0, 102.115) == "10.00°N 102.11°E"


def test_the_town_radius_is_a_limit():
    towns = (("Testville", "Nowhere", 0.0, 100.0),)
    inside = MAX_PLACE_KM * 0.9 / 111.19  # degrees of latitude
    outside = MAX_PLACE_KM * 1.1 / 111.19
    assert place_label(inside, 100.0, towns) == "Testville, Nowhere"
    assert place_label(outside, 100.0, towns) == f"{outside:.2f}°N 100.00°E"


def test_no_towns_at_all_uses_coordinates():
    assert place_label(1.0, 2.0, ()) == "1.00°N 2.00°E"


def test_coordinate_label_hemispheres():
    assert coordinate_label(-1.8205, 110.0932) == "1.82°S 110.09°E"
    assert coordinate_label(1.5, -70.25) == "1.50°N 70.25°W"


def test_reporter_is_one_trimmed_line():
    assert clean_reporter("  Pak\n Dedi\t") == "Pak Dedi"
    assert clean_reporter("") is None
    assert clean_reporter("   ") is None
    assert clean_reporter(None) is None
    assert clean_reporter(42) is None


def test_reporter_is_capped():
    assert len(clean_reporter("x" * 200)) == MAX_REPORTER_LENGTH


def test_name_shape():
    assert incident_name(1.482, 102.115, "Pak Dedi", 3) == "Bengkalis, Riau · Pak Dedi · #3"
    assert incident_name(1.482, 102.115, None, 12) == "Bengkalis, Riau · #12"
    assert incident_name(10.0, 102.115, " ", 4) == "10.00°N 102.11°E · #4"
