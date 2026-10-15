"""Check that a photo report points at the caller's own issued upload."""
from identity import AuthError
from photos import store
from photos.paths import is_owned_photo_path


def check_photo_path(volunteer_id, photo_path):
    """Raise a 403 unless photo_path is under this volunteer and was issued to them."""
    if not is_owned_photo_path(photo_path, volunteer_id):
        raise AuthError(403, "forbidden", "photoPath belongs to another volunteer")
    if not store.was_issued(volunteer_id, photo_path):
        raise AuthError(403, "forbidden", "photoPath was not issued to this volunteer")
