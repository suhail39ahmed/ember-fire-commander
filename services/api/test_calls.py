"""Server-owned membership for opt-in LiveKit test calls."""
import hashlib
from datetime import datetime, timedelta, timezone

from google.cloud import firestore
from incidents.store import db


def register_call(room, user, speaker_id):
    call_id = hashlib.sha256(room.encode()).hexdigest()
    member_id = hashlib.sha256(user['id'].encode()).hexdigest()
    database = db()
    call = database.collection('testCalls').document(call_id)
    member = call.collection('members').document(member_id)
    now = datetime.now(timezone.utc)

    @firestore.transactional
    def register(transaction):
        record = call.get(transaction=transaction).to_dict()
        if record and record['expiresAt'] <= now:
            raise ValueError('This test call has expired. Start with a new test code.')
        if not record:
            record = {'room': room, 'nextSequence': 0, 'createdAt': now, 'expiresAt': now + timedelta(hours=2)}
            transaction.create(call, record)
        # Merge preserves any active publisher lease when a participant rejoins.
        transaction.set(member, {'speakerId': speaker_id, 'speakerName': user['role'].capitalize(),
                                 'role': user['role'], 'joinedAt': now}, merge=True)
        return call_id

    return register(database.transaction())
