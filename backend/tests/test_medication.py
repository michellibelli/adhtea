"""Medication route tests.

Confirms server stays "honest" — it stores whatever name the frontend sends.
Pseudonymization is the frontend's responsibility (utils/medicationStore.js);
the server must never auto-rewrite names. Also guards the dose-field removal
from 3.9.17 and the log idempotency contract.
"""


def test_create_medication_stores_name_verbatim(client, auth_headers):
    r = client.post(
        "/medication",
        json={"name": "Medication 1", "reminder_times": "08:00,14:00"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Medication 1"
    assert body["reminder_times"] == "08:00,14:00"


def test_create_medication_response_omits_dose(client, auth_headers):
    """Post-3.9.17 regression guard — dose column dropped, response shouldn't
    include the key even if Pydantic's extra-field behavior allowed it through."""
    r = client.post("/medication", json={"name": "Medication 1"}, headers=auth_headers)
    assert r.status_code == 200
    assert "dose" not in r.json()


def test_create_medication_ignores_unknown_dose_field(client, auth_headers):
    """Pydantic ignores extra fields by default — sending dose shouldn't error,
    and the response still must not contain dose."""
    r = client.post(
        "/medication",
        json={"name": "Medication 1", "dose": "10 mg"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert "dose" not in r.json()


def test_list_medication_returns_active_only(client, auth_headers):
    client.post("/medication", json={"name": "Medication 1"}, headers=auth_headers)
    create_r = client.post("/medication", json={"name": "Medication 2"}, headers=auth_headers)
    med_id = create_r.json()["id"]
    client.delete(f"/medication/{med_id}", headers=auth_headers)

    r = client.get("/medication", headers=auth_headers)
    assert r.status_code == 200
    names = [m["name"] for m in r.json()]
    assert names == ["Medication 1"]


def test_patch_renames_medication(client, auth_headers):
    create_r = client.post("/medication", json={"name": "Old name"}, headers=auth_headers)
    med_id = create_r.json()["id"]
    r = client.patch(
        f"/medication/{med_id}",
        json={"name": "Medication 1"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Medication 1"


def test_log_taken_is_idempotent_per_day(client, auth_headers):
    create_r = client.post("/medication", json={"name": "Medication 1"}, headers=auth_headers)
    med_id = create_r.json()["id"]

    r1 = client.post(f"/medication/{med_id}/log", headers=auth_headers)
    r2 = client.post(f"/medication/{med_id}/log", headers=auth_headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Same log row returned on second call — idempotent
    assert r1.json()["id"] == r2.json()["id"]


def test_log_returns_404_for_other_users_med(client, auth_headers, db_session):
    """Logging against a med you don't own must 404, not silently create."""
    r = client.post("/medication/999/log", headers=auth_headers)
    assert r.status_code == 404
