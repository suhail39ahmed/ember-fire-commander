import pytest

from ingest import leads, psi, weather


def test_firms_csv_becomes_labelled_leads(fixtures_dir):
    out = leads.parse_firms_csv((fixtures_dir / "firms_viirs_snpp_nrt.csv").read_text(), source="VIIRS_SNPP_NRT")
    assert len(out) == 4
    first = out[0]
    assert first["lat"] == -1.85012 and first["lng"] == 110.05387
    assert first["acqAt"] == "2026-10-14T05:40:00Z"
    assert first["confidence"] == "nominal" and out[1]["confidence"] == "high" and out[2]["confidence"] == "low"
    assert first["frpMw"] == 7.84
    for lead in out:
        assert lead["label"] == "unverified_lead"
        assert lead["needsHumanVerification"] is True
        assert lead["confirmedFire"] is False
        assert "not a confirmed fire" in lead["disclaimer"]
        assert "severity" not in lead and "status" not in lead
        assert lead["id"].startswith("firms-")


def test_lead_ids_are_stable(fixtures_dir):
    text = (fixtures_dir / "firms_viirs_snpp_nrt.csv").read_text()
    a = [l["id"] for l in leads.parse_firms_csv(text, source="VIIRS_SNPP_NRT")]
    b = [l["id"] for l in leads.parse_firms_csv(text, source="VIIRS_SNPP_NRT")]
    assert a == b and len(set(a)) == 4


def test_firms_text_error_is_raised():
    with pytest.raises(leads.FirmsError):
        leads.parse_firms_csv("Invalid MAP_KEY.", source="VIIRS_SNPP_NRT")


def test_firms_empty_and_bad_rows():
    assert leads.parse_firms_csv("", source="x") == []
    text = "latitude,longitude,acq_date,acq_time\n999,1,2026-10-14,0540\n1,2,bad,0540\n1,2,2026-10-14,540\n"
    out = leads.parse_firms_csv(text, source="x")
    assert len(out) == 1 and out[0]["acqAt"] == "2026-10-14T05:40:00Z" and out[0]["confidence"] == "unknown"


def test_open_meteo_wind_in_kmh(fixtures_dir):
    doc = weather.parse_open_meteo((fixtures_dir / "open_meteo_current.json").read_text(), lat=-1.849, lng=110.051)
    assert doc["windKmh"] == 7.1
    assert doc["gustKmh"] == 20.5 and doc["windDirDeg"] == 291
    assert doc["observedAt"].endswith("Z")
    assert "wind_speed_unit=kmh" in weather.weather_url(-1.849, 110.051)


def test_open_meteo_rejects_wrong_unit_or_missing_wind():
    with pytest.raises(weather.WeatherError):
        weather.parse_open_meteo('{"current_units":{"wind_speed_10m":"m/s"},"current":{"wind_speed_10m":3}}', lat=0, lng=0)
    with pytest.raises(weather.WeatherError):
        weather.parse_open_meteo('{"current":{}}', lat=0, lng=0)
    with pytest.raises(weather.WeatherError):
        weather.parse_open_meteo("<html>", lat=0, lng=0)


def test_psi_parse(fixtures_dir):
    doc = psi.parse_psi((fixtures_dir / "data_gov_sg_psi.json").read_text())
    assert set(doc["psi24h"]) == {"north", "south", "east", "west", "central"}
    assert doc["psi24hMax"] == max(doc["psi24h"].values())
    assert doc["source"] == "data.gov.sg"


def test_psi_errors():
    with pytest.raises(psi.PsiError):
        psi.parse_psi('{"code": 4, "errorMsg": "rate limited"}')
    with pytest.raises(psi.PsiError):
        psi.parse_psi('{"code": 0, "data": {"items": []}}')
