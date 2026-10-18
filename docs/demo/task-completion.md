# Task completion

The Task page has its own **Submit & complete task** action. It reuses the photo
and video controls, but does not submit a standalone fire report.

1. Select findings, add a note and/or attach up to four photos and one video.
2. Submit saves the whole task submission in the existing IndexedDB outbox.
3. Uploads finish first. Their paths are retained across retries.
4. `POST /tasks/{id}/complete` validates the assigned volunteer and evidence,
   then atomically saves the result, links evidence to the task's incident,
   records completion and writes a task audit event.
5. The task leaves active volunteer lists. The supervisor sees Completed and
   the completion note; its photos/videos use the existing media viewer.

Offline or failed uploads leave the task pending. A lost API response can be
retried with the same submission ID without duplicating evidence or completion.
Task evidence never enters geographic report clustering or creates an incident.
Doing it remains an acknowledgement, not task completion.

Deploy both web and API for this change. For local testing, restart the API
after changing the route. Existing completed tasks cannot be resent or answered.
