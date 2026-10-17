"""Browser preflights must reach signup without Firebase credentials."""
import pytest

from app import app


@pytest.mark.parametrize("path", ["/volunteers/register", "/supervisors/register"])
def test_local_signup_preflight(path):
    with app.test_client() as client:
        response = client.options(path, headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,x-firebase-appcheck",
        })
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert "POST" in response.headers["Access-Control-Allow-Methods"]
    allowed = response.headers["Access-Control-Allow-Headers"].lower()
    assert "authorization" in allowed
    assert "x-firebase-appcheck" in allowed


def test_unlisted_origin_is_not_allowed():
    with app.test_client() as client:
        response = client.options("/supervisors/register", headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        })
    assert "Access-Control-Allow-Origin" not in response.headers


def test_authentication_errors_keep_cors_headers():
    with app.test_client() as client:
        response = client.post("/supervisors/register", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 401
    assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
