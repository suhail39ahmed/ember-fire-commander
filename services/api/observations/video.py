"""Check that a video report points at the caller's own issued upload."""
from identity import AuthError
from videos import store as video_store
from videos.paths import is_owned_video_path


def check_video_path(volunteer_id, video_path):
    """Raise a 403 unless video_path is under this volunteer and was issued to them."""
    if not is_owned_video_path(video_path, volunteer_id):
        raise AuthError(403, "forbidden", "videoPath belongs to another volunteer")
    if not video_store.was_issued(volunteer_id, video_path):
        raise AuthError(403, "forbidden", "videoPath was not issued to this volunteer")
