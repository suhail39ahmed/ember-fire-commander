#!/usr/bin/env python3
"""Export the approved EMBER frames from Figma as PNGs.

Writes docs/design/<workstream>/<issue>-<frame>.png, matching the mapping
in docs/design/EMBER_design_handoff.md (section 2).

Run from the repo root:
    export FIGMA_TOKEN=...                      # never commit this; read-only file scope is enough
    python3 docs/design/export_ember_frames.py  # 2x PNGs
    SCALE=1 python3 docs/design/export_ember_frames.py
    python3 docs/design/export_ember_frames.py --dry-run

Source: Figma file "Google Hackathon 2026", key WacSWJ9eGsdJ4vG9Q1nbyk. Stdlib only.
Prefix "none-" = approved frame with no issue in #6-#22 (see handoff, section 12).
Brand SVGs and app icons are already exported to public/ (handoff, section 3.5).
"""
import json, os, sys, urllib.parse, urllib.request

FILE_KEY = "WacSWJ9eGsdJ4vG9Q1nbyk"
SCALE = os.environ.get("SCALE", "2")
FRAMES = {
    "19:10": "docs/design/pwa/19-v0-join-invite-code-install-permissions.png",  # V0 · Join — invite code, install, permissions
    "56:31": "docs/design/pwa/19-v-s-splash.png",  # V-S · Splash
    "56:96": "docs/design/pwa/19-v-n-push-notification.png",  # V-N · Push notification
    "4:2": "docs/design/pwa/16-v1-verify-hotspot-new-task.png",  # V1 · Verify hotspot — new task
    "4:53": "docs/design/pwa/16-v2-photo-check-gemini-result.png",  # V2 · Photo check — Gemini result
    "56:46": "docs/design/pwa/16-v-l-loading.png",  # V-L · Loading
    "56:71": "docs/design/pwa/16-v-e-empty-no-tasks.png",  # V-E · Empty — no tasks
    "5:2": "docs/design/pwa/16-v3-live-guidance-gemini-live-coach.png",  # V3 · Live guidance — Gemini Live coach
    "56:261": "docs/design/pwa/16-v3-live-connection-states.png",  # V3 · Live connection states
    "5:47": "docs/design/pwa/16-v4-safety-guard-withdraw-upwind.png",  # V4 · Safety Guard — withdraw upwind
    "10:4": "docs/design/pwa/16-v6-approved-instruction-photo-mode-plus-push-to-talk-sari.png",  # V6 · Approved instruction — photo mode + push-to-talk (Sari)
    "107:70": "docs/design/pwa/17-v8-report-chips-plus-text-report-send-validation-error-sent.png",  # V8 · Report chips + text report — send, validation error, sent
    "56:122": "docs/design/pwa/20-v1a-upload-uploading.png",  # V1a · Upload — uploading
    "56:168": "docs/design/pwa/20-v1b-upload-uploaded.png",  # V1b · Upload — uploaded
    "56:214": "docs/design/pwa/20-v1c-upload-failed.png",  # V1c · Upload — failed
    "5:66": "docs/design/pwa/none-v5-re-ignition-watch-re-check-task.png",  # V5 · Re-ignition watch — re-check task
    "56:287": "docs/design/pwa/none-v7-settings-and-profile.png",  # V7 · Settings & profile
    "56:341": "docs/design/pwa/none-v7a-settings-language-picker.png",  # V7a · Settings — language picker
    "12:2": "docs/design/supervisor-console/18-s1-supervisor-console-live-incident.png",  # S1 · Supervisor console — live incident
    "13:2": "docs/design/supervisor-console/18-s2-supervisor-console-wind-shift-withdraw-sent.png",  # S2 · Supervisor console — wind shift, withdraw sent
    "54:265": "docs/design/supervisor-console/18-d-ld-loading.png",  # D-LD · Loading
    "54:91": "docs/design/supervisor-console/18-d-e-empty-no-live-incidents.png",  # D-E · Empty — no live incidents
    "14:58": "docs/design/supervisor-console/22-s3-regional-view-every-incident-hotspot-and-watched-site.png",  # S3 · Regional view — every incident, hotspot and watched site
    "6:2": "docs/design/supervisor-console/22-d1-supervisor-console-hotspot-queue.png",  # D1 · Supervisor Console — hotspot queue
    "54:32": "docs/design/ui/6-d-l-login-supervisor-console.png",  # D-L · Login — Supervisor Console
    "8:24": "docs/design/ui/none-foundations.png",  # Foundations
    "49:30": "docs/design/ui/19-brand-kit.png",  # Brand kit
}


def get(url, token=None):
    headers = {"X-Figma-Token": token} if token else {}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
        return r.read()


def main():
    if "--dry-run" in sys.argv:
        for nid, path in FRAMES.items():
            print(f"{nid:>7}  ->  {path}")
        print(f"{len(FRAMES)} frames, scale {SCALE}x")
        return 0
    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        sys.exit("Set FIGMA_TOKEN in your environment first (do not commit it).")
    q = urllib.parse.urlencode({"ids": ",".join(FRAMES), "format": "png", "scale": SCALE})
    data = json.loads(get(f"https://api.figma.com/v1/images/{FILE_KEY}?{q}", token))
    if data.get("err"):
        sys.exit(f"Figma error: {data['err']}")
    missing = []
    for nid, path in FRAMES.items():
        url = data.get("images", {}).get(nid)
        if not url:
            missing.append(nid)
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(get(url))
        print("wrote", path)
    if missing:
        sys.exit("No render returned for: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
