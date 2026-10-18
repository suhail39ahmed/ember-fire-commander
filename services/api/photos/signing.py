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
DEFAULT_READ_TTL_SECONDS = 300


def photo_bucket():
    return os.getenv("PHOTO_BUCKET", DEFAULT_BUCKET)


def upload_ttl_seconds():
    try:
        ttl = int(os.getenv("PHOTO_UPLOAD_TTL_SECONDS", DEFAULT_TTL_SECONDS))
    except ValueError:
        ttl = DEFAULT_TTL_SECONDS
    return max(60, min(ttl, MAX_TTL_SECONDS))


def read_ttl_seconds():
    try:
        ttl = int(os.getenv("PHOTO_READ_TTL_SECONDS", DEFAULT_READ_TTL_SECONDS))
    except ValueError:
        ttl = DEFAULT_READ_TTL_SECONDS
    return max(60, min(ttl, MAX_TTL_SECONDS))


def _signing_kwargs(credentials, base):
    if not isinstance(credentials, google_credentials.Signing):
        # Cloud Run metadata credentials: sign through IAM signBlob.
        signer = getattr(credentials, 'service_account_email', None) or os.getenv('PHOTO_SIGNING_SERVICE_ACCOUNT', '').strip()
        if not signer:
            raise ValueError('Set PHOTO_SIGNING_SERVICE_ACCOUNT when using local user credentials for signed media URLs.')
        base["service_account_email"] = signer
        base["access_token"] = credentials.token
    return base


def sign_get_url(bucket_name, object_path, ttl_seconds):
    """Return a V4 signed URL that allows reading one object for a short time. The object stays private."""
    credentials, project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    credentials.refresh(google_requests.Request())
    client = storage.Client(project=project, credentials=credentials)
    blob = client.bucket(bucket_name).blob(object_path)
    return blob.generate_signed_url(**_signing_kwargs(credentials, {
        "version": "v4",
        "expiration": timedelta(seconds=ttl_seconds),
        "method": "GET",
    }))


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
    return blob.generate_signed_url(**_signing_kwargs(credentials, kwargs))
