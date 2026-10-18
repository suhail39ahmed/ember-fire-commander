# Report media

The Report page keeps the live Video/Call shortcuts hidden. Select a report
card, add an optional note, and attach up to four photos and one video.
Attachments alone can also be sent.

- **Upload photos → Take photo:** requests the phone's native full-screen camera. Capture
  a still to add it to the list. Gallery selection supports multiple photos.
- **Upload video → Record video:** requests the phone's native full-screen video camera.
  Stop and confirm in the camera app to add the clip to the list. Gallery
  selection accepts one MP4, WebM, or MOV video, up to 10 MB.
- Returning with a video adds the attachment and scrolls to **Send report**.
  Capture depends on mobile browser support; desktops may open a file picker.
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

The Task page shares native capture and attachment controls, but has a dedicated
**Submit & complete task** action. Evidence and task completion are saved together
on the assigned incident; they do not enter new-report intake. A note can also
be submitted without an attachment or finding card.

Verification: reject a five-photo selection, attach four photos plus one video,
remove and replace a file, send without a card, and confirm photos/video in the
supervisor's volunteer view. Camera capture needs permission and a usable camera.
