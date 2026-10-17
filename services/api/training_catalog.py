# Fixture lessons — content is API data, not client-generated copy.
LESSONS = (
    {
        "id": "report_30s",
        "title": {"id": "Lapor kebakaran dalam 30 detik", "en": "Report a fire in 30 seconds"},
        "minutes": 4,
        "summary": {"id": "Chip, catatan, lepas mic.", "en": "Chip, note, or release the mic."},
        "body": {
            "id": "Pegang mic, sebut apa yang Anda lihat, lalu lepas. Atau ketuk asap / api.",
            "en": "Hold the mic, say what you see, then release. Or tap smoke / fire.",
        },
        "check": {
            "question": {"id": "Apa yang Anda lakukan dulu di lokasi?", "en": "What do you do first at the site?"},
            "options": [
                {"id": "report", "label": {"id": "Laporkan dari jarak aman", "en": "Report from a safe distance"}, "correct": True},
                {"id": "run_in", "label": {"id": "Langsung masuk ke api", "en": "Run into the fire"}, "correct": False},
            ],
        },
    },
    {
        "id": "wind_upwind",
        "title": {"id": "Baca angin, tetap di sisi datang angin", "en": "Read the wind, stay upwind"},
        "minutes": 4,
        "summary": {"id": "Datang dari arah angin.", "en": "Approach from upwind."},
        "body": {
            "id": "Asap dan api bergerak mengikuti angin. Datang dari sisi datang angin.",
            "en": "Smoke and fire move with the wind. Come in from the upwind side.",
        },
        "check": {
            "question": {"id": "Dari mana Anda mendekat?", "en": "Which way do you approach?"},
            "options": [
                {"id": "upwind", "label": {"id": "Dari sisi datang angin", "en": "From upwind"}, "correct": True},
                {"id": "downwind", "label": {"id": "Dari arah asap", "en": "From downwind"}, "correct": False},
            ],
        },
    },
    {
        "id": "withdraw",
        "title": {"id": "Kapan harus WITHDRAW", "en": "When to WITHDRAW"},
        "minutes": 4,
        "summary": {"id": "Mundur saat tidak aman.", "en": "Leave when it is not safe."},
        "body": {
            "id": "Jika api besar atau angin berubah, mundur ke titik aman. Jangan padamkan sendiri.",
            "en": "If flames are large or the wind shifts, withdraw to a safe point. Do not fight it alone.",
        },
        "check": {
            "question": {"id": "Api besar dan angin kencang. Apa yang Anda lakukan?", "en": "Large flames and strong wind. What do you do?"},
            "options": [
                {"id": "withdraw", "label": {"id": "WITHDRAW ke titik aman", "en": "WITHDRAW to a safe point"}, "correct": True},
                {"id": "stay", "label": {"id": "Tetap di tempat", "en": "Stay put"}, "correct": False},
            ],
        },
    },
    {
        "id": "peat_return",
        "title": {"id": "Api gambut bisa kembali", "en": "Peat fires come back"},
        "minutes": 4,
        "summary": {"id": "Periksa situs lama.", "en": "Check an old site."},
        "body": {
            "id": "Gambut bisa menyala lagi di bawah tanah. Laporkan asap tipis di situs lama.",
            "en": "Peat can re-ignite underground. Report thin smoke at an old site.",
        },
        "check": {
            "question": {"id": "Ada asap tipis di lokasi yang sudah padam. Apa?", "en": "Thin smoke at a site that was out. What next?"},
            "options": [
                {"id": "report", "label": {"id": "Laporkan untuk diperiksa ulang", "en": "Report it for a re-check"}, "correct": True},
                {"id": "ignore", "label": {"id": "Abaikan", "en": "Ignore it"}, "correct": False},
            ],
        },
    },
)

VIDEO = {
    "id": "how_ember_works",
    "title": {
        "id": "Pelatihan keselamatan kebakaran · Modul 01",
        "en": "Fire Safety Training · Module 01",
    },
    "durationSec": 658,
    "url": "https://www.youtube.com/watch?v=LVcnXNLAPKo",
}

SAFETY_LINES = (
    {"id": "Jangan masuk ke api besar sendirian.", "en": "Do not walk into a large fire alone."},
    {"id": "Datang dari sisi datang angin.", "en": "Approach from upwind."},
    {"id": "Jika tidak aman, mundur dan laporkan.", "en": "If it is not safe, withdraw and report."},
)

SCENARIOS = [
    {"id": "thick_smoke", "label": {"id": "Asap semakin tebal", "en": "Smoke is getting thick"}},
    {"id": "wind_changed", "label": {"id": "Angin berubah", "en": "The wind changed"}},
    {"id": "underground", "label": {"id": "Api di bawah tanah", "en": "Fire under the ground"}},
    {"id": "alone", "label": {"id": "Saya sendirian di api", "en": "I am alone at the fire"}},
]

LESSONS[2]["summary"] = {"id": "EMBER memandu Anda", "en": "EMBER talks you through it"}
LESSONS[3]["summary"] = {"id": "Memeriksa lokasi lama", "en": "checking an old site"}


def validate_coach(raw):
    """Allowlist and validate the agent contract before persisting a pending check."""
    if not isinstance(raw, dict):
        raise ValueError("invalid coach response")
    def localized(value):
        if not isinstance(value, dict) or any(not isinstance(value.get(lang), str) or not 1 <= len(value[lang].strip()) <= 2000 for lang in ("id", "en")):
            raise ValueError("invalid localized copy")
        return {lang: value[lang].strip() for lang in ("id", "en")}
    options = raw.get("options")
    if not isinstance(options, list) or len(options) != 3:
        raise ValueError("three options required")
    clean = []
    for option in options:
        if not isinstance(option, dict):
            raise ValueError("invalid option")
        option_id = option.get("id")
        if not isinstance(option_id, str) or not option_id or len(option_id) > 50:
            raise ValueError("invalid option id")
        clean.append({"id": option_id, "label": localized(option.get("label"))})
    ids = [row["id"] for row in clean]
    if len(set(ids)) != 3 or raw.get("correctId") not in ids:
        raise ValueError("invalid correct answer")
    return {"reply": localized(raw.get("reply")), "ruleKey": raw.get("ruleKey") if raw.get("ruleKey") in ("withdraw", "upwind", "report") else None,
            "question": localized(raw.get("question")), "options": clean, "correctId": raw["correctId"],
            "rightFeedback": localized(raw.get("rightFeedback")), "wrongFeedback": localized(raw.get("wrongFeedback"))}



