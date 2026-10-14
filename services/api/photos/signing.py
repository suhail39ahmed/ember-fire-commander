"""V4 signed PUT URLs for the private photo bucket.

On Cloud Run there is no private key, so signing goes through the IAM
signBlob API with the runtime service account (roles/iam.serviceAccountTokenCreator
is granted in infra). Objects stay private: nothing here changes bucket IAM
or object ACLs.
"""
import os
from datetime import timedelta

import google.auth
from google.auth import credentials as google_credentials
from google.auth.transport import requests as google_requests
from google.cloud import storage

DEFAULT_BUCKET = "ember-fire-commander-ember-photos"
DEFAULT_TTL_SECONDS = 300
MAX_TTL_SECONDS = 900


def photo_bucket():
    return os.getenv("PHOTO_BUCKET", DEFAULT_BUCKET)


def upload_ttl_seconds():
    try:
        ttl = int(os.getenv("PHOTO_UPLOAD_TTL_SECONDS", DEFAULT_TTL_SECONDS))
    except ValueError:
        ttl = DEFAULT_TTL_SECONDS
    return max(60, min(ttl, MAX_TTL_SECONDS))


def sign_put_url(bucket_name, object_path, content_type, ttl_seconds):
    """Return a V4 signed URL that allows one PUT of content_type to object_path."""
    credentials, project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    credentials.refresh(google_requests.Request())
    client = storage.Client(project=project, credentials=credentials)
    blob = client.bucket(bucket_name).blob(object_path)
    kwargs = {
        "version": "v4",
        "expiration": timedelta(seconds=ttl_seconds),
        "method": "PUT",
        "content_type": content_type,
    }
    if not isinstance(credentials, google_credentials.Signing):
        # Cloud Run metadata credentials: sign through IAM signBlob.
        kwargs["service_account_email"] = credentials.service_account_email
        kwargs["access_token"] = credentials.token
    return blob.generate_signed_url(**kwargs)
