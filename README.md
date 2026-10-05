# Wedding Photo Collection (MVP)

Guests scan a QR code, land on a phone-friendly wedding page, and upload photos and videos with no app or account. The couple signs in to a private dashboard to view, play, download and hide everything that was shared.

This MVP runs **one real wedding**. The code and data model are already shaped for many events later (Customer → Events → Uploads) without rebuilding the upload system.

---

## 1. How it works

```
Guest phone
  1. GET  /.netlify/functions/get-event?slug=...      -> public event info (from Airtable)
  2. POST /.netlify/functions/upload-signature         -> server checks the event is Active,
                                                          returns a 1-hour Cloudinary signature
  3. POST https://api.cloudinary.com/.../auto/upload   -> file goes DIRECTLY to Cloudinary
                                                          (files over 20 MB go in 6 MB chunks)
  4. POST /.netlify/functions/record-upload            -> server verifies Cloudinary's response
                                                          signature, creates ONE Airtable record
Couple
  /dashboard -> dashboard-login (password -> HttpOnly cookie)
             -> dashboard-event (counts from Airtable rollups)
             -> dashboard-media (50 at a time, Cloudinary thumbnails)
             -> hide-media (Status = Hidden; Cloudinary file is kept)
             -> prepare-download (signed Cloudinary ZIP links, no media through Netlify)
```

| Piece | Job |
|---|---|
| React + Vite (`src/`) | Guest page `/event/:slug`, dashboard `/dashboard` |
| Netlify Functions (`netlify/functions/`) | Every server operation; the only place secrets exist |
| Airtable | Events and Uploads metadata (no media files) |
| Cloudinary | Original photos/videos, thumbnails, video transcoding, ZIP archives |

### Reliability features (built for bad venue Wi-Fi)
- Every file has its own state: Waiting → Uploading % → Saving → Added / Not uploaded.
- 3 uploads at a time (change with `VITE_UPLOAD_CONCURRENCY`).
- Each file retries itself twice automatically; then the guest can tap **Try again** for just that file. Successful files are never re-sent.
- Big videos upload in 6 MB chunks; a dropped connection repeats one chunk, not the whole video.
- If Cloudinary succeeds but Airtable fails, the guest is told the file is uploaded but not saved yet. Retrying only re-saves the record (no re-upload). The pending save is also kept in the browser session and finished automatically on the next visit.
- `record-upload` is idempotent: one record per Cloudinary asset, no matter how many times it is called.
- Uploads resume automatically when the phone reconnects; the screen is kept awake while uploading; the guest is warned before leaving mid-upload.
- Files are checked by content (first bytes), not by name, before upload; Cloudinary enforces the allowed formats again (the format list is part of the signature).

### Security
- Airtable token, Cloudinary API secret, password hash and session secret live only in Netlify environment variables. The browser never talks to Airtable.
- The upload signature only allows uploads into this event's folder with the allowed formats, and only while the event is Active (checked on the server).
- `record-upload` refuses metadata that Cloudinary did not sign, or that points outside the event folder.
- Dashboard password is stored as a scrypt hash. Sessions are HMAC-signed, HttpOnly, Secure, SameSite=Strict cookies (7 days).
- No analytics, no IP addresses stored, `noindex` on every page, no public list of events, Airtable record IDs never reach the browser.

---

## 2. Live setup (already created)

| Item | Value |
|---|---|
| Airtable workspace | The Digital Comeback |
| Airtable base | Wedding Photo Collection |
| Event record | One record in the Events table; its Event Slug is the guest link |
| Cloudinary folder | `wedding-events/friend-wedding-2026/originals/` |
| GitHub | `graduatecollegefast/wedding-photo-collection` |
| Netlify team | The Digital Comeback |

---

## 3. Airtable

### Events table

| Field | Type | Notes |
|---|---|---|
| Event ID | Single line text (primary) | Internal id; also the Cloudinary folder name. Do not change after uploads start. |
| Event Name | Single line text | Shown as the big names, e.g. `Jordan & Taylor` |
| Event Slug | Single line text | Guest URL: `/event/<slug>` (lowercase, numbers, hyphens) |
| Wedding Date | Date | |
| Expiration Date | Date | Wedding Date + 90 days. If blank the app computes it. |
| Status | Single select | Draft, Active, Closed, Expired |
| Headline | Single line text | Italic line under the date |
| Welcome Message | Long text | Optional extra text |
| Cover Image URL | URL | Optional photo at the top of the guest page |
| Allow Photos | Checkbox | |
| Allow Videos | Checkbox | |
| Maximum Files Per Upload | Number | Files per batch (default 50) |
| Created At | Created time | |
| Uploads | Link to Uploads | Created automatically by the link |
| Upload Count | Count | All linked uploads |
| Photo Count / Video Count | Rollup `SUM(values)` | Active items only |
| Hidden Count | Rollup `SUM(values)` | |
| Contributor Count | Rollup `COUNTA(ARRAYUNIQUE(ARRAYCOMPACT(values)))` | Distinct guest names |

### Uploads table

| Field | Type |
|---|---|
| Upload ID | Single line text (primary), generated by the app |
| Event | Link to Events |
| Event Key | Single line text (copy of Event ID for fast filtering) |
| Guest Name | Single line text (optional) |
| Cloudinary Asset ID | Single line text |
| Cloudinary Public ID | Single line text |
| Secure URL | URL |
| Resource Type | Single select: image, video |
| Format | Single line text |
| Version | Number (Cloudinary version, used for URLs) |
| Original Filename | Single line text |
| File Size | Number (bytes) |
| Width / Height | Number |
| Duration | Number (seconds, videos) |
| Status | Single select: Active, Hidden, Deleted |
| Uploaded At | Date/time |
| Upload Session ID | Single line text |
| User Agent | Long text |
| Active Photo, Active Video, Hidden Item, Contributor Key | Formula helpers for the Events rollups |

### Airtable access token
Create at airtable.com/create/tokens:
- Scopes: `data.records:read`, `data.records:write`
- Access: only the **Wedding Photo Collection** base

---

## 4. Cloudinary setup
1. Sign in at cloudinary.com → **Settings → API Keys**.
2. Copy **Cloud name**, **API Key**, **API Secret** into Netlify env vars (section 6).
3. Nothing else is required: no upload preset, no unsigned uploads. The folder is created on the first upload.

Plan limits to know (free plan): images up to 10 MB, videos up to 100 MB. The app's limits default to these and are configurable (`MAX_IMAGE_MB`, `MAX_VIDEO_MB`). Raise them only if your Cloudinary plan allows larger files.

---

## 5. Netlify setup
The site builds from the GitHub repo with `netlify.toml`:
- Build command `npm run build`, publish `dist`, functions `netlify/functions`.
- Every path serves the app (`/event/...`, `/dashboard`).
- Headers: `noindex`, no framing, strict Content-Security-Policy (only Cloudinary is allowed for uploads and images).

To link the repo for automatic deploys: Netlify → Site → **Site configuration → Build & deploy → Link repository** → GitHub → `wedding-photo-collection`. After that every push to `main` deploys.

---

## 6. Environment variables
Netlify → Site configuration → **Environment variables**. Mark the secret ones as "Contains secret values".

| Name | Secret? | Value |
|---|---|---|
| `AIRTABLE_ACCESS_TOKEN` | yes | Token from section 3 |
| `AIRTABLE_BASE_ID` | yes | Base ID (starts with `app`), from the base's API docs or URL |
| `AIRTABLE_EVENTS_TABLE_ID` | yes | Events table ID (starts with `tbl`), from the table URL |
| `AIRTABLE_UPLOADS_TABLE_ID` | yes | Uploads table ID (starts with `tbl`), from the table URL |
| `CLOUDINARY_CLOUD_NAME` | no | From Cloudinary |
| `CLOUDINARY_API_KEY` | no | From Cloudinary |
| `CLOUDINARY_API_SECRET` | yes | From Cloudinary |
| `DASHBOARD_PASSWORD_HASH` | yes | `npm run hash-password -- "password"` |
| `SESSION_SECRET` | yes | Long random string |
| `EVENT_SLUG` | no | The Event Slug from the Events table |
| `MAX_IMAGE_MB` / `MAX_VIDEO_MB` | no | Optional, default 10 / 100 |
| `EVENT_TIMEZONE` | no | Optional, default `America/Chicago` (when "today" rolls over for expiry) |
| `VITE_UPLOAD_CONCURRENCY` | no | Optional, default 3 (needs a redeploy) |

After changing any variable: **Deploys → Trigger deploy → Deploy site**.

---

## 7. Local development
Requires Node 20+.
```bash
npm install
cp .env.example .env        # fill in values
npx netlify-cli dev         # app + functions on http://localhost:8888
npm test                    # server + validation tests (offline, no credentials)
```
Browser walkthrough without any credentials (fakes Cloudinary and the functions):
```bash
npm run build
node tests/mock-server.mjs &          # http://localhost:4599/event/jordan-and-taylor
pip install playwright && python3 -m playwright install chromium
python3 tests/ui-flow.py              # screenshots in tests/screenshots/
```
Mock dashboard password: `correct horse battery`.

---

## 8. Running the wedding (no code needed — all in Airtable)

**Create / edit the wedding**: open the Events table and edit the one record. Fill Event Name, Wedding Date, Expiration Date (Wedding Date + 90 days), Headline, Allow Photos/Videos, Maximum Files Per Upload, Status = Active.

**Change branding**
- Words and cover photo: Event Name, Headline, Welcome Message, Cover Image URL in Airtable.
- Colors and fonts: `src/styles/theme.css` (`--primary`, `--secondary`, `--background`, `--text`, `--accent`, `--border-radius`). Commit and push to redeploy.

**Change the event slug**: edit Event Slug in Airtable, update `EVENT_SLUG` in Netlify, redeploy, and print a new QR code (the old link stops working). Do not change Event ID.

**Change upload limits**: files per batch → Airtable `Maximum Files Per Upload`. File sizes → `MAX_IMAGE_MB` / `MAX_VIDEO_MB` in Netlify. Simultaneous uploads → `VITE_UPLOAD_CONCURRENCY` then redeploy.

**Close uploads**: set Status = Closed. Within about 30 seconds guests see "Uploads for this wedding are now closed." and the server stops issuing upload signatures. The dashboard keeps working.

**Expire the gallery manually**: set Status = Expired (or set Expiration Date to a past date). The guest page shows "This wedding gallery has expired." and the dashboard shows Expired. Nothing is deleted from Cloudinary in the MVP; `netlify/lib/expire-event.mjs` describes the future automatic clean-up.

**Hide a photo**: dashboard → open it → Hide. To bring it back: Hidden filter → open → Restore. In Airtable you can also set Status directly.

**Change the dashboard password**: `npm run hash-password -- "new password"`, paste the output into `DASHBOARD_PASSWORD_HASH`, redeploy. To sign everyone out, also change `SESSION_SECRET`.

**QR code**: dashboard → Event settings → Download QR code. It encodes the site's own URL (`https://<site>/event/<slug>`), no redirect service. Test-scan it before printing.

**Download everything**: dashboard → Download all → Prepare download. You get ZIP links (40 photos or 4 videos per ZIP, originals, hidden items excluded). Links last about an hour; press Refresh links for new ones.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Guest page says "We couldn't load this page" | Check `AIRTABLE_*` env vars; Netlify → Logs → Functions → `get-event`. |
| "Wedding not found" | Event Slug in Airtable must match the URL exactly. |
| Every upload fails | Check `CLOUDINARY_*` env vars; look at `upload-signature` logs. "not_configured" means a variable is missing. |
| Uploads work but nothing in dashboard | Check `record-upload` logs and `AIRTABLE_UPLOADS_TABLE_ID`. The token needs write access. |
| "This file is too large" | Raise `MAX_IMAGE_MB`/`MAX_VIDEO_MB` only if your Cloudinary plan allows it. |
| Counts look wrong | Counts come from Airtable rollups; check the rollup fields still exist on Events. |
| Dashboard keeps asking for password | `SESSION_SECRET` changed, or the browser blocks cookies. |
| Video won't play in the viewer | Use Download original; Cloudinary is still processing very large videos. |
| ZIP link errors | Links expire after about an hour. Prepare download again. |

All function errors are logged in Netlify → Logs → Functions with the technical detail; guests only see friendly messages.

---

## 10. Deployment checklist
- [ ] All env vars in section 6 set (secrets marked secret) and site redeployed
- [ ] Event record: correct names, date, expiration, Status = Active
- [ ] Open `/event/<slug>` on an iPhone and an Android phone
- [ ] Upload 1 photo, then 20+ photos, then a photo + short video
- [ ] Turn on airplane mode mid-upload, turn it off: uploads resume, nothing duplicated
- [ ] Dashboard: wrong password rejected, right password works, photos appear, video plays
- [ ] Hide one item, check Hidden filter, restore it
- [ ] Download one original and one ZIP part
- [ ] Set Status = Closed and confirm the guest page message, then back to Active
- [ ] Download the QR code, print a test copy, scan it with two phones
- [ ] View page source on the guest page: no `AIRTABLE`, no API secret

---

## 11. Project layout
```
src/
  components/  UploadButton FileQueue UploadProgress SuccessScreen Gallery MediaViewer
               DashboardStats DownloadPanel SettingsPanel
  pages/       EventPage DashboardLogin Dashboard NotFound
  services/    api.js (functions)  cloudinary.js (direct + chunked upload)
  hooks/       useUploadQueue.js  useDashboardAuth.js
  utils/       fileValidation.js errors.js format.js
  styles/      theme.css (design tokens)  app.css
netlify/
  functions/   get-event upload-signature record-upload dashboard-login dashboard-logout
               dashboard-event dashboard-media hide-media prepare-download
  lib/         airtable cloudinary events session http config expire-event(future)
scripts/       hash-password.mjs
tests/         server + validation tests, mock server, browser walkthrough
```

## 12. Not in this MVP (version 2)
Stripe, subscriptions, customer signup and accounts, self-service events, emails and notifications, automatic deletion, admin SaaS dashboard, analytics, AI features.
