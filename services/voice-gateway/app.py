"""voice-gateway: WebSocket relay to Gemini Live for EMBER fire commander

This is the Phase 1 walking skeleton.
Production will add: WSS upgrade with Firebase ID token + App Check verification,
audio/video relay to Gemini Live, Live-minute caps, observation writes.
"""
import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/healthz')
def healthz():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        'status': 'ok',
        'service': 'voice-gateway',
        'firestore_database': os.getenv('FIRESTORE_DATABASE', 'not-set')
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    app.run(host='0.0.0.0', port=port)
