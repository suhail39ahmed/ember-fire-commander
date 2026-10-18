"""Authenticated incident call lifecycle, media tokens and incident snapshots."""
import base64
import logging
import secrets
import re

from flask import Blueprint, g, jsonify, request
from google.cloud import firestore, storage
from identity import AuthError
from incidents import store
from incidents.errors import ApiError, error_response, validation, conflict
from calls import service, media
from notifications.send import deliver_message
from photos import signing

bp = Blueprint('calls', __name__)
bp.register_error_handler(ApiError, error_response)
logger = logging.getLogger(__name__)


@bp.after_request
def private(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


def body():
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


@bp.post('/incidents/<incident_id>/calls')
def create(incident_id):
    volunteer_id = body().get('volunteerId')
    if not isinstance(volunteer_id, str) or not volunteer_id.strip() or '/' in volunteer_id:
        raise validation('volunteerId', 'A volunteer is required.')
    call = service.create(incident_id, volunteer_id, g.user)
    try:
        result = deliver_message({'id': call['id'], 'type': 'call', 'volunteerId': volunteer_id},
                                 {'title': 'EMBER · Incoming video call',
                                  'body': 'Your supervisor is requesting live video. Open EMBER to join or decline.',
                                  'data': {'type': 'call', 'callId': call['id'], 'incidentId': incident_id}})
    except Exception:
        logger.exception('Call invitation push failed')
        result = {'result': 'failed', 'attempts': 0}
    service.ref(call['id']).update({'notification': result['result']})
    call['notification'] = result['result']
    return jsonify(service.public(call)), 201


@bp.get('/calls/current')
def current():
    lock = store.db().collection('callLocks').document(service.member_key(g.user['id'])).get().to_dict() or {}
    call = service.load(lock['callId'], g.user) if lock.get('callId') else None
    return jsonify({'call': service.public(call) if call and call['status'] in service.OPEN else None})


@bp.post('/calls/join-code')
def join_code():
    if g.user['role'] != 'volunteer':
        raise AuthError(403, 'forbidden', 'Only volunteers can join by code.')
    code = body().get('code')
    if not isinstance(code, str) or not re.fullmatch(r'CALL-[0-9A-F]{4}-[0-9A-F]{4}', code.strip().upper()):
        raise validation('code', 'Enter the CALL code shown on the supervisor console.')
    record = store.db().collection('callCodes').document(service.member_key(code.strip().upper())).get().to_dict()
    if not record:
        raise ApiError(404, 'not_found', 'This call code is unavailable. Ask your supervisor for a new request.')
    call = service.join_by_code(record['callId'], g.user)
    return jsonify(service.public(call))


@bp.get('/calls/<call_id>')
def get_call(call_id):
    return jsonify(service.public(service.load(call_id, g.user)))


@bp.post('/calls/<call_id>/accept')
def accept(call_id):
    return jsonify(service.public(service.accept(call_id, g.user)))


@bp.post('/calls/<call_id>/end')
def end(call_id):
    reason = body().get('reason', 'ended')
    if reason not in ('ended', 'declined', 'cancelled', 'permission_denied'):
        raise validation('reason', 'Invalid call action.')
    return jsonify(service.public(service.finish(call_id, g.user, reason)))


@bp.post('/calls/<call_id>/heartbeat')
def heartbeat(call_id):
    return jsonify(service.public(service.heartbeat(call_id, g.user, body().get('connected') is True)))


@bp.post('/calls/<call_id>/token')
def token(call_id):
    call = service.load(call_id, g.user)
    if call['status'] not in ('connecting', 'active'):
        raise conflict('The volunteer must accept this call before connecting.')
    member = service.ref(call_id).collection('members').document(service.member_key(g.user['id'])).get().to_dict()
    # Signing happens inside the transaction: an end cannot race a late issuance.
    def issue(tx):
        current_call = service.ref(call_id).get(transaction=tx).to_dict()
        service.access(current_call, g.user)
        if current_call['status'] not in ('connecting', 'active') or service.expiration(current_call):
            raise conflict('The call has ended.')
        result = media.credentials(current_call, member)
        tx.update(service.ref(call_id), {'tokenIssuedAt': service.now()})
        return result
    return jsonify(store.run_transaction(issue)), 201


@bp.post('/calls/<call_id>/snapshots')
def snapshot(call_id):
    call = service.load(call_id, g.user)
    if g.user['role'] != 'supervisor':
        raise AuthError(403, 'forbidden', 'Only the supervisor can save a call snapshot.')
    if call['status'] not in ('connecting', 'active'):
        raise conflict('There is no active call to capture.')
    if request.content_length is None or request.content_length > 2 * 1024 * 1024:
        raise validation('image', 'Snapshot must be under 2 MB.')
    data = request.get_data()
    if request.mimetype != 'image/jpeg' or not data.startswith(b'\xff\xd8\xff') or not data.endswith(b'\xff\xd9'):
        raise validation('image', 'A JPEG snapshot is required.')
    snapshot_id = secrets.token_hex(16)
    path = f'calls/{call_id}/snapshots/{snapshot_id}.jpg'
    storage.Client().bucket(signing.photo_bucket()).blob(path).upload_from_string(data, content_type='image/jpeg')
    record = {'id': snapshot_id, 'callId': call_id, 'incidentId': call['incidentId'],
              'requestedVolunteerId': call.get('requestedVolunteerId', call['volunteerId']),
              'volunteerId': call['volunteerId'], 'volunteerName': call['volunteerName'],
              'capturedBy': g.user['id'], 'capturedAt': service.now().isoformat(), 'photoPath': path}
    store.db().collection('callSnapshots').document(snapshot_id).set(record)
    return jsonify({'id': snapshot_id, 'capturedAt': record['capturedAt']}), 201


@bp.get('/incidents/<incident_id>/call-snapshots')
def snapshots(incident_id):
    if g.user['role'] != 'supervisor':
        raise AuthError(403, 'forbidden', 'Only supervisors can read incident snapshots.')
    if not store.db().collection('incidents').document(incident_id).get().exists:
        raise ApiError(404, 'not_found', 'Incident not found.')
    rows = store.db().collection('callSnapshots').where(filter=firestore.FieldFilter('incidentId', '==', incident_id)).stream()
    items = sorted((row.to_dict() for row in rows), key=lambda x: x['capturedAt'], reverse=True)[:30]
    for item in items:
        item['url'] = signing.sign_get_url(signing.photo_bucket(), item.pop('photoPath'), signing.read_ttl_seconds())
    return jsonify({'items': items})


@bp.post('/calls/<call_id>/vision')
def vision(call_id):
    call = service.load(call_id, g.user)
    if g.user['role'] != 'supervisor':
        raise AuthError(403, 'forbidden', 'Only the supervisor can request a frame interpretation.')
    if call['status'] not in ('connecting', 'active'):
        raise conflict('The call is not active.')
    if request.content_length is None or request.content_length > 1000000:
        raise validation('image', 'A frame under 1 MB is required.')
    image = request.get_data()
    if request.mimetype != 'image/jpeg' or not image.startswith(b'\xff\xd8\xff'):
        raise validation('image', 'A JPEG frame is required.')
    def reserve(tx):
        target = service.ref(call_id)
        current = target.get(transaction=tx).to_dict()
        if current['status'] not in ('connecting', 'active') or service.expiration(current):
            raise conflict('The call has ended.')
        last = current.get('visionRequestedAt')
        if last and (service.now() - last).total_seconds() < 55:
            raise ApiError(429, 'rate_limited', 'The current frame is already being checked.')
        tx.update(target, {'visionRequestedAt': service.now()})
    store.run_transaction(reserve)
    from assist.routes import _call
    result = _call('/internal/calls/describe-frame', {'image': base64.b64encode(image).decode('ascii')})
    # Raw frames are not stored; only an explicitly captured snapshot is saved.
    service.ref(call_id).update({'visualObservation': result})
    return jsonify(result)
