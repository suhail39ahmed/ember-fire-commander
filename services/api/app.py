"""ember-api: REST API for EMBER fire commander

This is the Phase 1 walking skeleton.
Production will add: sessions, roles, signed upload URLs, approvals,
incident reads, Maps/Weather proxy, FCM sends, audit log.
"""
import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/healthz')
def healthz():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        'status': 'ok',
        'service': 'ember-api',
        'firestore_database': os.getenv('FIRESTORE_DATABASE', 'not-set')
    }), 200

@app.route('/me')
def me():
    """Stub /me endpoint for web app to call during Phase 1"""
    return jsonify({
        'user': {
            'id': 'stub-user-id',
            'role': 'volunteer',
            'name': 'Stub User'
        }
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    app.run(host='0.0.0.0', port=port)
