"""Room credentials and server-side termination for incident calls."""
import asyncio
import os
import time
from aiohttp import ClientTimeout
from datetime import timedelta
from pathlib import Path

from dotenv import dotenv_values
from incidents.errors import ApiError


def settings():
    values = dotenv_values(Path(__file__).resolve().parents[3] / '.env')
    config = {key: os.getenv(key, values.get(key) or '').strip()
              for key in ('LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET')}
    if not config['LIVEKIT_URL'].startswith('wss://') or not all(config.values()):
        raise ApiError(503, 'unavailable', 'Live calling is not configured on the server.')
    return config


def credentials(call, member):
    from livekit import api
    config = settings()
    sources = ['microphone', 'camera'] if member['role'] == 'volunteer' else ['microphone']
    token = (api.AccessToken(config['LIVEKIT_API_KEY'], config['LIVEKIT_API_SECRET'])
             .with_identity(member['speakerId']).with_name(member['speakerName'])
             .with_ttl(timedelta(seconds=60))
             .with_grants(api.VideoGrants(room_join=True, room=call['room'], can_publish=True,
                                         can_subscribe=True, can_publish_data=False,
                                         can_publish_sources=sources)).to_jwt())
    return {'serverUrl': config['LIVEKIT_URL'], 'participantToken': token,
            'callId': call['id'], 'speakerId': member['speakerId']}


def terminate(call):
    from livekit import api
    config = settings()

    async def close():
        async with api.LiveKitAPI(config['LIVEKIT_URL'], config['LIVEKIT_API_KEY'],
                                  config['LIVEKIT_API_SECRET'], timeout=ClientTimeout(total=4)) as client:
            # LiveKit Cloud revokes tokens as well as disconnecting both participants.
            for identity in call['speakerIds'].values():
                request = api.RoomParticipantIdentity(room=call['room'], identity=identity)
                if 'revoke_token_ts' in request.DESCRIPTOR.fields_by_name:
                    request.revoke_token_ts = int(time.time()) + 1
                try:
                    await client.room.remove_participant(request)
                except api.TwirpError as exc:
                    if exc.code != 'not_found':
                        raise
            try:
                await client.room.delete_room(api.DeleteRoomRequest(room=call['room']))
            except api.TwirpError as exc:
                if exc.code != 'not_found':
                    raise
    asyncio.run(close())
