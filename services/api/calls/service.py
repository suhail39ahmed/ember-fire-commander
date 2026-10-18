"""Authoritative incident calls, atomic reservations, membership, and expiry."""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from identity import AuthError
from incidents import store, rules
from incidents.errors import conflict, not_found
from incidents.live_seat import _volunteer_on_incident, empty_seat
from calls import media

logger = logging.getLogger(__name__)
OPEN = {'requested', 'connecting', 'active'}
MAX_SECONDS = 1800


def now():
    return datetime.now(timezone.utc)


def member_key(uid):
    return hashlib.sha256(uid.encode()).hexdigest()


def ref(call_id):
    if not isinstance(call_id, str) or len(call_id) != 64 or any(c not in '0123456789abcdef' for c in call_id):
        raise not_found('call')
    return store.db().collection('calls').document(call_id)


def access(call, user):
    if not call:
        raise not_found('call')
    expected = call.get('supervisorId') if user['role'] == 'supervisor' else call.get('volunteerId') if user['role'] == 'volunteer' else None
    if user['id'] != expected:
        raise AuthError(403, 'forbidden', 'This call belongs to other participants.')


def expiration(call):
    moment = now()
    if call['status'] not in OPEN:
        return None
    if call['expiresAt'] <= moment:
        return 'expired' if call['status'] == 'requested' else 'time_limit'
    if call['status'] in ('connecting', 'active'):
        seen = call.get('lastSeen') or {}
        baseline = call.get('acceptedAt', call['createdAt'])
        if any((moment - seen.get(uid, baseline)).total_seconds() > 60 for uid in call['speakerIds']):
            return 'connection_lost'
    return None


def finish(call_id, actor=None, reason='ended'):
    target = ref(call_id)
    def commit(tx):
        call = target.get(transaction=tx).to_dict()
        if not call:
            raise not_found('call')
        if actor:
            access(call, actor)
        if call['status'] not in OPEN:
            return call
        seat_ref = store.db().collection('liveSeats').document(call['incidentId'])
        seat = seat_ref.get(transaction=tx).to_dict() or {}
        if reason == 'declined' and (not actor or actor['id'] != call['volunteerId'] or call['status'] != 'requested'):
            raise conflict('Only the invited volunteer can decline a pending call.')
        if reason == 'cancelled' and (not actor or actor['id'] != call['supervisorId'] or call['status'] != 'requested'):
            raise conflict('Only the requesting supervisor can cancel a pending call.')
        state = reason if reason in ('declined', 'cancelled', 'expired') else 'ended'
        call.update(status=state, endReason=reason, endedAt=now(), mediaClosed=False)
        tx.set(target, call)
        if seat.get('callId') == call_id:
            volunteers = dict(seat.get('volunteers') or {})
            entry = dict(volunteers.get(call['volunteerId']) or {})
            entry.update(media='none', updatedAt=rules.now_iso())
            volunteers[call['volunteerId']] = entry
            tx.update(seat_ref, {'holderId': None, 'status': 'free', 'callId': None,
                                 'volunteers': volunteers, 'updatedAt': rules.now_iso()})
        audit = store.db().collection('audit').document()
        tx.set(audit, {**rules.audit_record(audit.id, actor['id'] if actor else 'code', 'call.' + state, call_id),
                       'incidentId': call['incidentId'], 'reason': reason})
        return call
    call = store.run_transaction(commit)
    if not call.get('mediaClosed'):
        try:
            media.terminate(call)
            target.update({'mediaClosed': True})
            call['mediaClosed'] = True
        except Exception:
            # Retried by subsequent reads. Tokens and transcription are already denied.
            logger.exception('Call room cleanup failed: %s', call_id)
    return call


def load(call_id, user):
    call = ref(call_id).get().to_dict()
    access(call, user)
    reason = expiration(call)
    if reason:
        return finish(call_id, reason=reason)
    if call['status'] not in OPEN and not call.get('mediaClosed'):
        return finish(call_id)
    return call


def create(incident_id, volunteer_id, user):
    if user['role'] != 'supervisor':
        raise AuthError(403, 'forbidden', 'Only a supervisor can request a call.')
    media.settings()
    incident = _volunteer_on_incident(incident_id, volunteer_id)
    if incident.get('status') == 'extinguished':
        raise conflict('This incident is closed.')
    uid = user['id']
    locks = [store.db().collection('callLocks').document(member_key(p)) for p in (uid, volunteer_id)]
    # Clean up expired rooms before replacing reservations.
    for lock in locks:
        previous = lock.get().to_dict() or {}
        if previous.get('callId'):
            old = ref(previous['callId']).get().to_dict()
            if old and expiration(old):
                finish(old['id'], reason=expiration(old))
    call_id = secrets.token_hex(32)
    target = ref(call_id)
    moment = now()
    volunteer = store.db().collection('volunteers').document(volunteer_id).get().to_dict() or {}
    names = {uid: user.get('displayName') or 'Supervisor', volunteer_id: volunteer.get('displayName') or 'Volunteer'}
    speakers = {p: secrets.token_hex(16) for p in (uid, volunteer_id)}
    code = secrets.token_hex(4).upper()
    join_code = f'CALL-{code[:4]}-{code[4:]}'
    call = {'id': call_id, 'incidentId': incident_id, 'supervisorId': uid, 'volunteerId': volunteer_id,
            'requestedVolunteerId': volunteer_id,
            'supervisorName': names[uid], 'volunteerName': names[volunteer_id], 'speakerIds': speakers,
            'room': 'ember-call-' + call_id, 'status': 'requested', 'createdAt': moment,
            'expiresAt': moment + timedelta(seconds=45), 'nextSequence': 0, 'lastSeen': {}, 'joinCode': join_code}
    def commit(tx):
        reservations = [lock.get(transaction=tx).to_dict() or {} for lock in locks]
        previous_calls = [ref(r['callId']).get(transaction=tx).to_dict() if r.get('callId') else None for r in reservations]
        seat_ref = store.db().collection('liveSeats').document(incident_id)
        seat = seat_ref.get(transaction=tx).to_dict() or empty_seat(incident_id)
        if any(p and p['status'] in OPEN and not expiration(p) for p in previous_calls):
            raise conflict('One participant already has a pending or active call.')
        if seat.get('holderId') and seat['holderId'] != volunteer_id:
            raise conflict('Another volunteer holds this incident’s live video seat.')
        if seat.get('callId'):
            held = ref(seat['callId']).get(transaction=tx).to_dict()
            if held and held['status'] in OPEN and not expiration(held):
                raise conflict('This incident already has a pending or active call.')
        tx.set(target, call)
        tx.set(store.db().collection('callCodes').document(member_key(join_code)), {'callId': call_id})
        for lock in locks:
            tx.set(lock, {'callId': call_id})
        for p, role in ((uid, 'supervisor'), (volunteer_id, 'volunteer')):
            tx.set(target.collection('members').document(member_key(p)),
                   {'speakerId': speakers[p], 'speakerName': names[p], 'role': role})
        tx.set(seat_ref, {**seat, 'callId': call_id, 'holderId': volunteer_id, 'status': 'held', 'updatedAt': rules.now_iso()})
        audit = store.db().collection('audit').document()
        tx.set(audit, {**rules.audit_record(audit.id, uid, 'call.request', call_id), 'incidentId': incident_id})
        return call
    return store.run_transaction(commit)


def accept(call_id, user):
    load(call_id, user)
    def commit(tx):
        target = ref(call_id)
        call = target.get(transaction=tx).to_dict()
        access(call, user)
        if user['role'] != 'volunteer' or call['status'] != 'requested' or expiration(call):
            raise conflict('This invitation is no longer available.')
        moment = now()
        call.update(status='connecting', acceptedAt=moment, expiresAt=moment + timedelta(seconds=MAX_SECONDS))
        tx.set(target, call)
        return call
    return store.run_transaction(commit)


def join_by_code(call_id, user):
    """Hackathon fallback: the first signed-in volunteer with the code claims the call."""
    if user['role'] != 'volunteer':
        raise AuthError(403, 'forbidden', 'Only volunteers can join by code.')
    target = ref(call_id)
    call = target.get().to_dict()
    if not call:
        raise not_found('call')
    reason = expiration(call)
    if reason:
        finish(call_id, reason=reason)
        raise conflict('This invitation has expired. Ask for a new request.')
    uid = user['id']
    lock = store.db().collection('callLocks').document(member_key(uid))
    reservation = lock.get().to_dict() or {}
    if reservation.get('callId') and reservation['callId'] != call_id:
        previous = ref(reservation['callId']).get().to_dict()
        if previous and expiration(previous):
            finish(previous['id'], reason=expiration(previous))
    profile = store.db().collection('volunteers').document(uid).get().to_dict() or {}
    name = profile.get('displayName') or user.get('displayName') or 'Volunteer'
    speaker_id = secrets.token_hex(16)

    def commit(tx):
        call = target.get(transaction=tx).to_dict()
        if not call or call['status'] not in OPEN or expiration(call):
            raise conflict('This invitation is no longer available.')
        if call['status'] != 'requested':
            if call['volunteerId'] == uid:
                return call  # Same participant may reconnect; never replace an active caller.
            raise conflict('Another volunteer has already joined this call.')
        if uid == call['supervisorId']:
            raise conflict('Join from a separate volunteer account.')
        reservation = lock.get(transaction=tx).to_dict() or {}
        previous = ref(reservation['callId']).get(transaction=tx).to_dict() if reservation.get('callId') else None
        if previous and previous['id'] != call_id and previous['status'] in OPEN and not expiration(previous):
            raise conflict('You already have another pending or active call.')
        old_id = call['volunteerId']
        old_lock = store.db().collection('callLocks').document(member_key(old_id))
        old_reservation = old_lock.get(transaction=tx).to_dict() or {}
        seat_ref = store.db().collection('liveSeats').document(call['incidentId'])
        seat = seat_ref.get(transaction=tx).to_dict() or {}
        if old_id != uid:
            call['requestedVolunteerId'] = call.get('requestedVolunteerId', old_id)
            call['speakerIds'] = {call['supervisorId']: call['speakerIds'][call['supervisorId']], uid: speaker_id}
            call.update(volunteerId=uid, volunteerName=name)
            tx.set(target.collection('members').document(member_key(uid)),
                   {'speakerId': speaker_id, 'speakerName': name, 'role': 'volunteer'})
            # The previous invitee has never received media credentials. Access checks
            # now reject their old membership, and polling dismisses their invitation.
            if old_reservation.get('callId') == call_id:
                tx.set(old_lock, {'callId': None})
            if seat.get('callId') == call_id:
                tx.update(seat_ref, {'holderId': uid, 'updatedAt': rules.now_iso()})
        moment = now()
        call.update(status='connecting', acceptedAt=moment, expiresAt=moment + timedelta(seconds=MAX_SECONDS))
        tx.set(target, call)
        tx.set(lock, {'callId': call_id})
        audit = store.db().collection('audit').document()
        tx.set(audit, {**rules.audit_record(audit.id, uid, 'call.join_code', call_id), 'incidentId': call['incidentId']})
        return call
    return store.run_transaction(commit)


def heartbeat(call_id, user, connected):
    load(call_id, user)
    def commit(tx):
        target = ref(call_id)
        call = target.get(transaction=tx).to_dict()
        access(call, user)
        if call['status'] not in ('connecting', 'active') or expiration(call):
            raise conflict('The call has ended.')
        seen = dict(call.get('lastSeen') or {})
        seen[user['id']] = now()
        peers = dict(call.get('connected') or {})
        peers[user['id']] = connected
        seat_ref = store.db().collection('liveSeats').document(call['incidentId'])
        seat = seat_ref.get(transaction=tx).to_dict() or {}
        call.update(lastSeen=seen, connected=peers)
        if all(peers.get(uid) for uid in call['speakerIds']):
            call['status'] = 'active'
            if seat.get('callId') == call_id:
                volunteers = dict(seat.get('volunteers') or {})
                entry = dict(volunteers.get(call['volunteerId']) or {})
                entry.update(media='live', updatedAt=rules.now_iso())
                volunteers[call['volunteerId']] = entry
                tx.update(seat_ref, {'volunteers': volunteers, 'updatedAt': rules.now_iso()})
        tx.set(target, call)
        return call
    return store.run_transaction(commit)


def public(call):
    fields = ('id', 'incidentId', 'supervisorId', 'volunteerId', 'requestedVolunteerId', 'supervisorName', 'volunteerName',
              'status', 'createdAt', 'expiresAt', 'acceptedAt', 'endedAt', 'endReason', 'mediaClosed', 'notification', 'visualObservation', 'joinCode')
    return {key: value.isoformat().replace('+00:00', 'Z') if isinstance(value, datetime) else value
            for key, value in call.items() if key in fields}
