"""End-to-end HTTP contract for one supervisor and two independent volunteers."""
from incidents.test_incidents import client, db, _as, AUTH  # noqa: F401


def send(client, monkeypatch, ids=None):
    _as(monkeypatch)
    response = client.post('/incidents/inc_01/withdraw', headers=AUTH, json={
        'volunteerIds': ids or ['uid_sari', 'uid_rizal'], 'instruction': 'Withdraw upwind. Do not engage.',
    })
    assert response.status_code == 200
    return response.get_json()['incident']['withdraw']


def answer(client, monkeypatch, session, uid, state):
    _as(monkeypatch, role='volunteer', uid=uid)
    return client.post('/incidents/inc_01/withdraw/answer', headers=AUTH,
                       json={'state': state, 'sessionId': session['id'], 'lat': 1.48, 'lng': 102.11})


def clear(client, monkeypatch, session, reason='Crew moved to a safe spot'):
    _as(monkeypatch)
    return client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                       json={'reason': reason, 'sessionId': session['id']})


def test_all_safe_then_clear_and_reconnect(client, db, monkeypatch):
    w = send(client, monkeypatch)
    assert clear(client, monkeypatch, w).status_code == 409
    assert answer(client, monkeypatch, w, 'uid_sari', 'safe').status_code == 200
    assert clear(client, monkeypatch, w).status_code == 409
    assert answer(client, monkeypatch, w, 'uid_rizal', 'safe').status_code == 200
    _as(monkeypatch, role='volunteer', uid='uid_rizal')
    digest = client.get('/digest', headers=AUTH).get_json()
    active = next(i for i in digest['incidents'] if i['id'] == 'inc_01')['withdraw']
    assert active['active'] and active['answers']['uid_rizal']['state'] == 'safe'
    assert 'uid_sari' not in active['answers']  # No other volunteer's location leaks.
    assert clear(client, monkeypatch, w, '   ').status_code == 400
    result = clear(client, monkeypatch, w)
    assert result.status_code == 200
    closed = result.get_json()['incident']['withdraw']
    assert not closed['active'] and closed['clearedBy'] == 'uid_maya' and closed['clearedAt']
    assert closed['clearReason'] == 'Crew moved to a safe spot'
    assert clear(client, monkeypatch, w).status_code == 409
    _as(monkeypatch, role='volunteer', uid='uid_sari')
    digest = client.get('/digest', headers=AUTH).get_json()
    assert not next(i for i in digest['incidents'] if i['id'] == 'inc_01')['withdraw']['active']
    assert all(t['status'] != 'approved' for t in digest['myTasks'] if t['type'] == 'withdraw')


def test_stuck_help_found_safe_then_clear(client, db, monkeypatch):
    w = send(client, monkeypatch)
    answer(client, monkeypatch, w, 'uid_sari', 'safe')
    answer(client, monkeypatch, w, 'uid_rizal', 'stuck')
    assert clear(client, monkeypatch, w).status_code == 409
    _as(monkeypatch)
    result = client.post('/incidents/inc_01/withdraw/help', headers=AUTH,
                         json={'sessionId': w['id'], 'volunteerId': 'uid_rizal', 'helperId': 'uid_sari'})
    assert result.status_code == 200
    assert result.get_json()['task']['volunteerId'] == 'uid_sari'
    assert client.post('/incidents/inc_01/withdraw/safe', headers=AUTH,
                       json={'volunteerId': 'uid_rizal', 'sessionId': w['id']}).status_code == 200
    assert clear(client, monkeypatch, w).status_code == 200


def test_selected_recipients_duplicates_and_stale_answers(client, db, monkeypatch):
    w = send(client, monkeypatch, ['uid_sari'])
    tasks = len(db.data['tasks'])
    _as(monkeypatch)
    assert client.post('/incidents/inc_01/withdraw', headers=AUTH,
                       json={'volunteerIds': ['uid_sari'], 'instruction': 'Withdraw'}).status_code == 409
    assert len(db.data['tasks']) == tasks
    assert answer(client, monkeypatch, w, 'uid_rizal', 'safe').status_code == 404
    assert answer(client, monkeypatch, w, 'uid_sari', 'safe').status_code == 200
    assert clear(client, monkeypatch, w).status_code == 200
    next_w = send(client, monkeypatch, ['uid_sari'])
    assert next_w['id'] != w['id'] and next_w['answers'] == {}
    assert answer(client, monkeypatch, w, 'uid_sari', 'safe').status_code == 409
    assert clear(client, monkeypatch, next_w).status_code == 409


def test_location_does_not_mark_safe_and_volunteer_cannot_clear(client, db, monkeypatch):
    w = send(client, monkeypatch)
    _as(monkeypatch, role='volunteer', uid='uid_sari')
    result = client.post('/incidents/inc_01/withdraw/location', headers=AUTH,
                         json={'sessionId': w['id'], 'lat': 1.48, 'lng': 102.11})
    assert result.status_code == 200
    assert result.get_json()['answer']['state'] is None
    assert client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                       json={'sessionId': w['id'], 'reason': 'Safe'}).status_code == 403
    assert clear(client, monkeypatch, w).status_code == 409
    assert client.post('/incidents/inc_01/extinguish', headers=AUTH).status_code == 409


def force_clear(client, monkeypatch, session, reason='Crew unreachable'):
    _as(monkeypatch)
    return client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                       json={'reason': reason, 'sessionId': session['id'], 'force': True})


def test_force_clear_bypasses_all_safe_check(client, db, monkeypatch):
    w = send(client, monkeypatch)
    assert clear(client, monkeypatch, w).status_code == 409
    result = force_clear(client, monkeypatch, w)
    assert result.status_code == 200
    closed = result.get_json()['incident']['withdraw']
    assert not closed['active']
    assert closed['clearedBy'] == 'uid_maya'
    assert closed['clearReason'] == 'Crew unreachable'


def test_force_clear_writes_force_clear_audit_with_unconfirmed_ids(client, db, monkeypatch):
    w = send(client, monkeypatch)
    answer(client, monkeypatch, w, 'uid_sari', 'safe')
    result = force_clear(client, monkeypatch, w)
    assert result.status_code == 200
    audits = list(db.data.get('audit', {}).values())
    force_audit = next((a for a in audits if a.get('action') == 'withdraw.force_clear'), None)
    assert force_audit is not None
    assert force_audit['unconfirmedIds'] == ['uid_rizal']
    assert force_audit['reason'] == 'Crew unreachable'


def test_force_clear_uses_normal_clear_when_everyone_is_already_safe(client, db, monkeypatch):
    w = send(client, monkeypatch)
    answer(client, monkeypatch, w, 'uid_sari', 'safe')
    answer(client, monkeypatch, w, 'uid_rizal', 'safe')
    result = force_clear(client, monkeypatch, w)
    assert result.status_code == 200
    audits = list(db.data.get('audit', {}).values())
    assert any(a.get('action') == 'withdraw.clear' for a in audits)
    assert not any(a.get('action') == 'withdraw.force_clear' for a in audits)


def test_force_clear_requires_reason(client, db, monkeypatch):
    w = send(client, monkeypatch)
    _as(monkeypatch)
    assert client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                       json={'sessionId': w['id'], 'force': True, 'reason': '   '}).status_code == 400


def test_force_clear_rejects_wrong_session(client, db, monkeypatch):
    w = send(client, monkeypatch)
    _as(monkeypatch)
    result = client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                         json={'reason': 'Crew unreachable', 'sessionId': 'stale', 'force': True})
    assert result.status_code == 409


def test_force_clear_is_supervisor_only(client, db, monkeypatch):
    w = send(client, monkeypatch)
    _as(monkeypatch, role='volunteer', uid='uid_sari')
    result = client.post('/incidents/inc_01/withdraw/clear', headers=AUTH,
                         json={'reason': 'Crew unreachable', 'sessionId': w['id'], 'force': True})
    assert result.status_code == 403


def test_force_clear_closes_withdraw_tasks(client, db, monkeypatch):
    w = send(client, monkeypatch)
    result = force_clear(client, monkeypatch, w)
    assert result.status_code == 200
    tasks = [t for t in db.data.get('tasks', {}).values() if t.get('type') == 'withdraw']
    assert all(t['status'] == 'rejected' for t in tasks)
