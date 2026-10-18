# Report media

The Report page keeps the live Video/Call shortcuts hidden. Select a report
card, add an optional note, and attach up to four photos and one video.
Attachments alone can also be sent.

- **Upload photos → Take photo:** opens the in-app rear-camera preview. Capture
  a still to add it to the list. Gallery selection supports multiple photos.
- **Upload video → Record video:** opens the existing camera/recorder. Press
  **Stop recording** to finalize the clip and add it to the list. Gallery
  selection accepts one MP4, WebM, or MOV video, up to 10 MB.
- Opening the recorder scrolls to the camera. Both red-square stop controls
  save the clip as an attachment, then scroll to **Send report**.
- Remove an attachment to replace it. Selecting media does not upload it.
- **Send report** saves the selected files to the existing offline outbox and
  uploads them through the private signed-URL endpoints. The existing API stores
  each file as a separate observation; the card is a separate observation when
  present. Notes, location, device information and task context accompany media.
- Retrying a partially completed batch reuses its ids and uploaded paths.
  Files are durable in the outbox after Send report; unsent file selections are
  held in memory and must be reselected after leaving/reloading the page.
- The Report page shows the Outbox above Send report only when it contains
  photo/video uploads. Its separate Send now button is hidden; failed uploads
  retain Retry/Discard and previously submitted offline reports retry on reconnect.

The Task page uses the same photo, video, and notes form, replacing its old
Video/Call shortcuts. Reports submitted there retain the task ID. A note can
also be sent without an attachment or report card.

Verification: reject a five-photo selection, attach four photos plus one video,
remove and replace a file, send without a card, and confirm photos/video in the
supervisor's volunteer view. Camera capture needs permission and a usable camera.
