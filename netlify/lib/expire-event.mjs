// FUTURE: expire-event
// Not deployed as an endpoint in the MVP. The MVP already treats an event as expired once
// today (in EVENT_TIMEZONE) is after its Expiration Date: uploads stop and the dashboard
// shows "Expired". Nothing is deleted.
//
// The commercial version will turn this into a scheduled Netlify Function
// (export const config = { schedule: '@daily' }) that, for each event:
//   1. Closes uploads           -> set Events.Status = Closed when the event ends.
//   2. Notifies the customer    -> email N days before Expiration Date (needs an email provider).
//   3. Allows download          -> link to the dashboard's Download All.
//   4. Deletes Cloudinary media -> Admin API DELETE /resources/{type}/upload with prefix
//                                  wedding-events/<eventId>/ after the retention period.
//   5. Updates Airtable         -> Uploads.Status = Deleted, Events.Status = Expired.
//
// Kept as a stub so the retention logic has one obvious home.

export async function expireEvent(/* event */) {
  throw new Error('expire-event is not enabled in the MVP');
}
