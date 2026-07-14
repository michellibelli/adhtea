"""Tests for hand-ordering the tea-box by dragging a bag.

POST /tasks/reorder always rewrites sort_order. When the caller sets
`manual_box` (a drag in the tea-box, as opposed to a drag in the Today list) it
also stamps User.box_ordered_on, which /me exposes as `box_manual`. While that
flag is true the frontend stops re-sorting the box by the clock and follows her
manual order instead (see frontend/src/utils/ordering.js).

The flag rides the same app-day boundary as planned_on, so it resets at the 4am
rollover — a hand-ordered box is a decision about *today*, not a standing mode.
"""

from datetime import date, timedelta

from models import User


def _user(db):
    return db.query(User).filter(User.username == "testuser").first()


def _task(client, headers, title):
    r = client.post("/tasks", json={"title": title, "task_type": "task"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


class TestBoxOrder:
    def test_box_manual_false_before_any_drag(self, client, auth_headers):
        r = client.get("/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["box_manual"] is False

    def test_reorder_writes_sort_order_in_given_sequence(self, client, auth_headers):
        a = _task(client, auth_headers, "A")
        b = _task(client, auth_headers, "B")
        c = _task(client, auth_headers, "C")

        r = client.post("/tasks/reorder", json={"ordered_ids": [c, a, b]}, headers=auth_headers)
        assert r.status_code == 200
        assert [t["id"] for t in r.json()] == [c, a, b]
        assert [t["sort_order"] for t in r.json()] == [0.0, 1.0, 2.0]

    def test_box_drag_sets_box_manual(self, client, auth_headers):
        a = _task(client, auth_headers, "A")
        b = _task(client, auth_headers, "B")

        r = client.post(
            "/tasks/reorder",
            json={"ordered_ids": [b, a], "manual_box": True},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert client.get("/me", headers=auth_headers).json()["box_manual"] is True

    def test_today_list_drag_does_not_set_box_manual(self, client, auth_headers):
        """A reorder from the Today page leaves the box on its computed order."""
        a = _task(client, auth_headers, "A")
        b = _task(client, auth_headers, "B")

        r = client.post("/tasks/reorder", json={"ordered_ids": [b, a]}, headers=auth_headers)
        assert r.status_code == 200
        assert client.get("/me", headers=auth_headers).json()["box_manual"] is False

    def test_stale_box_ordered_on_reads_as_not_manual(self, client, auth_headers, db_session):
        """Yesterday's hand-ordering doesn't govern today's box."""
        user = _user(db_session)
        user.box_ordered_on = date.today() - timedelta(days=1)
        db_session.commit()

        assert client.get("/me", headers=auth_headers).json()["box_manual"] is False

    def test_reorder_ignores_other_users_tasks(self, client, auth_headers):
        """ordered_ids is client-supplied — a foreign id must not be reordered."""
        mine = _task(client, auth_headers, "Mine")

        client.post("/signup", json={
            "name": "Other", "username": "other", "password": "password123",
        })
        other = client.post("/login", json={"username": "other", "password": "password123"})
        other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
        theirs = _task(client, other_headers, "Theirs")

        r = client.post(
            "/tasks/reorder",
            json={"ordered_ids": [theirs, mine]},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert [t["id"] for t in r.json()] == [mine]
