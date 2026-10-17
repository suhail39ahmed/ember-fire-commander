"""Last-known SMS contacts from the volunteer profile, never their own phone."""
import re

DEFAULT_TEMPLATE = "EMBER {status} · {name} · {incidentCode} · {time} · {location} · TIDAK ADA SINYAL DATA."


def _template(value):
    fields = {"status", "name", "incidentCode", "time", "location"}
    if not isinstance(value, str) or not 0 < len(value.strip()) <= 1000:
        return DEFAULT_TEMPLATE
    return value.strip() if set(re.findall(r"\{([^{}]+)\}", value)) == fields else DEFAULT_TEMPLATE


def sms_config(profile):
    source = profile.get("sms")
    if not isinstance(source, dict):
        return None
    recipients = []
    seen = set()
    rows = source.get("recipients")
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        phone, name, role = row.get("phone"), row.get("name"), row.get("role")
        if (not isinstance(phone, str) or not re.fullmatch(r"\+[1-9]\d{7,14}", phone)
                or not isinstance(name, str) or not name.strip() or len(name) > 80
                or role not in ("crew_lead", "duty_line") or phone in seen
                or phone == profile.get("phone")):
            continue
        seen.add(phone)
        recipients.append({"id": role + ":" + phone, "name": name.strip(), "role": role, "phone": phone})
    templates = source.get("templates")
    templates = templates if isinstance(templates, dict) else {}
    return {"recipients": recipients, "templates": {
        kind: _template(templates.get(kind))
        for kind in ("help", "safe", "spreading")
    }}
