"""Durable ordered transcript events and per-speaker publisher leases."""
import hashlib
import re
from datetime import datetime, timedelta, timezone

from google.cloud import firestore
from auth.ticket import _db


class CallAccessError(Exception):
    pass


class PublisherBusy(Exception):
    pass


class SharedTranscripts:
    def __init__(self, database=None, now=None, collection='testCalls'):
        self.database = database if database is not None else _db()
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.collection = collection

    def refs(self, call_id, user):
        if not isinstance(call_id, str) or not re.fullmatch(r'[0-9a-f]{64}', call_id):
            raise CallAccessError('Invalid call')
        call = self.database.collection(self.collection).document(call_id)
        member = call.collection('members').document(hashlib.sha256(user['id'].encode()).hexdigest())
        return call, member

    def _check(self, call, member, user=None):
        if not call or not member or call.get('expiresAt') is None or call['expiresAt'] <= self.now():
            raise CallAccessError('Call membership is missing or expired')
        if self.collection == 'calls':
            if not user or member.get('role') != user.get('role') or user['id'] != call.get('supervisorId' if user['role'] == 'supervisor' else 'volunteerId'):
                raise CallAccessError('Call role no longer matches membership')
            if call.get('status') not in ('connecting', 'active'):
                raise CallAccessError('Call is not active')
            baseline = call.get('acceptedAt', call['createdAt'])
            if any((self.now() - call.get('lastSeen', {}).get(uid, baseline)).total_seconds() > 60
                   for uid in call['speakerIds']):
                raise CallAccessError('Call connection expired')
        return member

    def authorize(self, call_id, user):
        call, member = self.refs(call_id, user)
        return self._check(call.get().to_dict(), member.get().to_dict(), user)

    def claim(self, call_id, user, owner):
        call, member = self.refs(call_id, user)
        @firestore.transactional
        def claim(transaction):
            record = self._check(call.get(transaction=transaction).to_dict(), member.get(transaction=transaction).to_dict(), user)
            if record.get('leaseOwner') != owner and record.get('leaseUntil', self.now()) > self.now():
                raise PublisherBusy('Another tab is transcribing this speaker')
            transaction.update(member, {'leaseOwner': owner, 'leaseUntil': self.now() + timedelta(seconds=30)})
            return record
        return claim(self.database.transaction())

    def release(self, call_id, user, owner):
        _, member = self.refs(call_id, user)
        @firestore.transactional
        def release(transaction):
            record = member.get(transaction=transaction).to_dict() or {}
            if record.get('leaseOwner') == owner:
                transaction.update(member, {'leaseOwner': '', 'leaseUntil': self.now()})
        release(self.database.transaction())

    def append(self, call_id, user, owner, segment_id, text, finished):
        call, member = self.refs(call_id, user)
        @firestore.transactional
        def append(transaction):
            state = call.get(transaction=transaction).to_dict()
            speaker = self._check(state, member.get(transaction=transaction).to_dict(), user)
            if speaker.get('leaseOwner') != owner or speaker.get('leaseUntil', self.now()) <= self.now():
                raise CallAccessError('Publisher lease expired')
            sequence = state['nextSequence'] + 1
            event_id = f'{sequence:012d}'
            event = {'callId': call_id, 'eventId': event_id, 'sequence': sequence,
                     'speakerId': speaker['speakerId'], 'speakerName': speaker['speakerName'],
                     'segmentId': segment_id, 'timestamp': self.now().isoformat().replace('+00:00', 'Z'),
                     'text': text, 'finished': finished}
            transaction.create(call.collection('events').document(event_id), event)
            transaction.update(call, {'nextSequence': sequence})
            return event
        return append(self.database.transaction())

    def read(self, call_id, user, after):
        self.authorize(call_id, user)
        call, _ = self.refs(call_id, user)
        return [record.to_dict() for record in call.collection('events')
                .where(filter=firestore.FieldFilter('sequence', '>', after))
                .order_by('sequence').limit(100).stream()]
