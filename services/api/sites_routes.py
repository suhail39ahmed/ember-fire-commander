"""Supervisor re-ignition alert: dismiss and send a re-check (issue #103).

Sites and alerts are written by agents. This module never reopens, verifies, or
re-rates the extinguished incident. A lead id never leaves this service.
"""
from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import rules, store
from incidents.errors import ApiError, conflict, error_response, not_found, validation

sites_bp = Blueprint("sites", __name__)

RECHECK_INSTRUCTION = (
    "New activity near this extinguished site. Check the spot again and report what you see."
)


@sites_bp.errorhandler(ApiError)
def _api_error(exc):
    return error_response(exc)


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _alert_open(alert):
    return not alert.get("dismissedAt") and not alert.get("taskId")


def _alert_visible(alert):
    """Still shown when open, or after send while the re-check is in progress."""
    return not alert.get("dismissedAt")


def client_alert(site, alert):
    """Fields the browser may see. No lead id, kind, or coordinates."""
    return {
        "id": alert["id"],
        "incidentId": site.get("incidentId") or site.get("id"),
        "code": None,
        "distanceM": alert.get("distanceM"),
        "extinguishedAt": site.get("extinguishedAt"),
        "message": alert.get("message"),
        "taskId": alert.get("taskId") or None,
    }


def reignition_alert():
    """Newest visible alert across watched sites, or None."""
    candidates = []
    for snap in store.db().collection(store.SITES).stream():
        site = snap.to_dict() or {}
        site_id = site.get("incidentId") or snap.id
        site = {**site, "id": snap.id, "incidentId": site_id}
        if site.get("status") not in ("watching", "reinspect"):
            continue
        for alert in site.get("alerts") or []:
            if not isinstance(alert, dict) or not alert.get("id"):
                continue
            if not _alert_visible(alert):
                continue
            candidates.append((alert.get("at") or "", alert.get("id") or "", site, alert))
    if not candidates:
        return None
    # Prefer an alert that still needs Send / Dismiss; else the newest in-progress one.
    open_ones = [c for c in candidates if _alert_open(c[3])]
    pool = open_ones or candidates
    pool.sort(key=lambda row: (row[0], row[1]), reverse=True)
    _, _, site, alert = pool[0]
    return client_alert(site, alert)


def _load_site(incident_id):
    snap = store.db().collection(store.SITES).document(incident_id).get()
    if not snap.exists:
        return None, None
    site = snap.to_dict() or {}
    site["id"] = snap.id
    site["incidentId"] = site.get("incidentId") or snap.id
    return snap, site


def _find_alert(site, alert_id):
    alerts = list(site.get("alerts") or [])
    for index, alert in enumerate(alerts):
        if isinstance(alert, dict) and alert.get("id") == alert_id:
            return index, alert, alerts
    return None, None, alerts


def _volunteer_for_recheck(incident_id, site):
    """First volunteer with an observation or task on this incident."""
    obs_ids = site.get("observationIds")
    obs_ids = [oid for oid in obs_ids if isinstance(oid, str) and oid] if isinstance(obs_ids, list) else []
    for snap in store.get_many(store.OBSERVATIONS, obs_ids).values():
        volunteer_id = (snap.to_dict() or {}).get("volunteerId")
        if isinstance(volunteer_id, str) and volunteer_id:
            return volunteer_id
    for snap in store.where(store.TASKS, "incidentId", "==", incident_id):
        volunteer_id = (snap.to_dict() or {}).get("volunteerId")
        if isinstance(volunteer_id, str) and volunteer_id:
            return volunteer_id
    return None


@sites_bp.route("/sites/<incident_id>/alerts/<alert_id>/dismiss", methods=["POST"])
def dismiss_alert(incident_id, alert_id):
    """Mark the alert dismissed with a reason. Incident status is unchanged."""
    _require_supervisor()
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise validation("body", "send a JSON object")
    reason = body.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise validation("reason", "a non-blank reason is required")
    reason = reason.strip()
    if len(reason) > 500:
        raise validation("reason", "at most 500 characters")

    snap, site = _load_site(incident_id)
    if site is None:
        raise not_found("site")
    index, alert, alerts = _find_alert(site, alert_id)
    if alert is None:
        raise not_found("alert")
    if alert.get("dismissedAt"):
        raise conflict("This alert was already dismissed")
    if alert.get("taskId"):
        raise conflict("A re-check was already sent for this alert")

    now = rules.now_iso()

    def run(transaction):
        ref = store.db().collection(store.SITES).document(incident_id)
        current = ref.get(transaction=transaction)
        if not current.exists:
            raise not_found("site")
        data = current.to_dict() or {}
        idx, current_alert, current_alerts = _find_alert(data, alert_id)
        if current_alert is None:
            raise not_found("alert")
        if current_alert.get("dismissedAt"):
            raise conflict("This alert was already dismissed")
        if current_alert.get("taskId"):
            raise conflict("A re-check was already sent for this alert")
        updated = dict(current_alert)
        updated["dismissedAt"] = now
        updated["dismissedBy"] = g.user["id"]
        updated["dismissReason"] = reason
        current_alerts[idx] = updated
        transaction.update(ref, {"alerts": current_alerts})
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(
            audit_ref,
            rules.audit_record(audit_ref.id, g.user["id"], "site.dismiss", incident_id),
        )
        return audit_ref.id

    audit_id = store.run_transaction(run)
    return jsonify({"dismissed": True, "auditId": audit_id}), 200


@sites_bp.route("/sites/<incident_id>/alerts/<alert_id>/recheck", methods=["POST"])
def send_recheck(incident_id, alert_id):
    """Create a proposed verify task without reopening the incident."""
    _require_supervisor()
    snap, site = _load_site(incident_id)
    if site is None:
        raise not_found("site")
    index, alert, alerts = _find_alert(site, alert_id)
    if alert is None:
        raise not_found("alert")
    if alert.get("dismissedAt"):
        raise conflict("This alert was dismissed")
    if alert.get("taskId"):
        raise conflict("A re-check was already sent for this alert")

    incident = store.db().collection(store.INCIDENTS).document(incident_id).get()
    if not incident.exists:
        raise not_found("incident")
    incident_data = incident.to_dict() or {}
    if incident_data.get("status") != "extinguished":
        raise conflict("A re-check is only for an extinguished site")

    volunteer_id = _volunteer_for_recheck(incident_id, site)
    if not volunteer_id:
        raise conflict("No volunteer on this site to receive the re-check")

    now = rules.now_iso()

    def run(transaction):
        site_ref = store.db().collection(store.SITES).document(incident_id)
        current = site_ref.get(transaction=transaction)
        if not current.exists:
            raise not_found("site")
        data = current.to_dict() or {}
        idx, current_alert, current_alerts = _find_alert(data, alert_id)
        if current_alert is None:
            raise not_found("alert")
        if current_alert.get("dismissedAt"):
            raise conflict("This alert was dismissed")
        if current_alert.get("taskId"):
            raise conflict("A re-check was already sent for this alert")
        task_ref = store.db().collection(store.TASKS).document()
        task = {
            "incidentId": incident_id,
            "volunteerId": volunteer_id,
            "type": "verify",
            "status": "proposed",
            "instruction": RECHECK_INSTRUCTION,
        }
        transaction.set(task_ref, task)
        updated = dict(current_alert)
        updated["taskId"] = task_ref.id
        updated["sentAt"] = now
        current_alerts[idx] = updated
        transaction.update(site_ref, {"alerts": current_alerts})
        # Do not touch the incident document. Extinguished stays extinguished.
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(
            audit_ref,
            rules.audit_record(audit_ref.id, g.user["id"], "site.recheck", incident_id),
        )
        task["id"] = task_ref.id
        return task, audit_ref.id, updated

    task, audit_id, saved_alert = store.run_transaction(run)
    return jsonify({
        "task": rules.pick(task, rules.TASK_FIELDS),
        "auditId": audit_id,
        "alert": client_alert(site, saved_alert),
    }), 200
