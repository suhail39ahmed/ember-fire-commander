"""Section 3 error bodies for the incident routes."""
from flask import jsonify


class ApiError(Exception):
    def __init__(self, status, code, message, fields=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields


def error_response(exc):
    error = {"code": exc.code, "message": exc.message}
    if exc.code == "validation_error" and exc.fields:
        error["fields"] = exc.fields
    return jsonify({"error": error}), exc.status


def validation(field, hint):
    return ApiError(400, "validation_error", f"{field} is not valid", {field: hint})


def not_found(kind):
    return ApiError(404, "not_found", f"{kind} id is unknown")


def conflict(message):
    return ApiError(409, "conflict", message)
