"""Push copy. Title, stored instruction, and ids only.

No volunteer name and no coordinates.
"""

TITLE = "EMBER"


def message_for(task):
    instruction = task.get("instruction")
    body = instruction.strip() if isinstance(instruction, str) else ""
    if not body:
        body = "New task"
    return {
        "title": TITLE,
        "body": body,
        "data": {
            "taskId": str(task.get("id") or ""),
            "incidentId": str(task.get("incidentId") or ""),
            "type": str(task.get("type") or ""),
        },
    }
