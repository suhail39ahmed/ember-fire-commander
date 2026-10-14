"""ember-agents: ADK agent graph for EMBER fire commander

This is the Phase 1 walking skeleton.
Production will add: ADK agent graph with intake, dedupe/cluster, fusion,
conflict detection, risk scoring, and task planning with human-in-the-loop.
"""
import os
from flask import Flask, jsonify

from fusion.intake import bp as fusion_bp

app = Flask(__name__)
app.register_blueprint(fusion_bp)

@app.route('/healthz')
def healthz():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        'status': 'ok',
        'service': 'ember-agents',
        'firestore_database': os.getenv('FIRESTORE_DATABASE', 'not-set')
    }), 200

from sites.routes import bp as sites_bp  # noqa: E402
app.register_blueprint(sites_bp)

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    app.run(host='0.0.0.0', port=port)
