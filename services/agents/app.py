"""ember-agents: private Cloud Run service behind ember-api and voice-gateway.

fusion/   POST /internal/observations/<id>/intake: cluster, score and plan tasks.
spotter/  advisory photo triage and incident summaries.
assist/   advisory suggestions, Ask EMBER answers and English translations.
sites/    POST /internal/sites/scan: the re-ignition watch, run by Cloud Scheduler.
GET /healthz stays public.
"""
import os
from flask import Flask, jsonify

from assist.routes import bp as assist_bp
from fusion.intake import bp as fusion_bp
from sites.routes import bp as sites_bp
from spotter.routes import bp as spotter_bp
from practice.routes import bp as practice_bp

app = Flask(__name__)
app.register_blueprint(fusion_bp)
app.register_blueprint(spotter_bp)
app.register_blueprint(practice_bp)
app.register_blueprint(assist_bp)
app.register_blueprint(sites_bp)

@app.route('/healthz')
def healthz():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        'status': 'ok',
        'service': 'ember-agents',
        'firestore_database': os.getenv('FIRESTORE_DATABASE', 'not-set')
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8080'))
    app.run(host='0.0.0.0', port=port)
