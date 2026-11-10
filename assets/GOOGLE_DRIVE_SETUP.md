# Google Drive setup for PocketReader

PocketReader can sync PDFs, EPUBs, reading position, voice settings, and highlights directly to a user's Google Drive. It creates a visible `PocketReader` folder and requests only the `drive.file` scope, which limits access to files created or opened by this app.

## 1. Create or select a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project, or select the project that will own PocketReader's OAuth configuration.
3. Open **APIs & Services → Library**.
4. Find **Google Drive API** and click **Enable**.

## 2. Configure the OAuth consent screen

1. Open **Google Auth Platform → Branding** (called **OAuth consent screen** in some console layouts).
2. Enter `PocketReader` as the app name and add the required support/developer email addresses.
3. Add this authorized domain:

   ```text
   charlesneimog.github.io
   ```

4. Under **Data Access / Scopes**, add:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

5. If the app is in **Testing**, add every Google account that should be allowed to connect under **Test users**. Publish the app when it is ready for general users.

### Fix `Error 403: access_denied` while testing

When the publishing status is **Testing**, Google blocks every account that is not explicitly allowlisted:

1. Open the same project in **Google Auth Platform → Audience**.
2. Confirm the user type is **External**.
3. Under **Test users**, select **Add users**.
4. Enter the exact address used by the Google Account, for example `paescoelho@gmail.com`.
5. Save, wait briefly for the setting to propagate, and try **Continue with Google** again.

A Google Account may use a non-Gmail address, so add the address shown on Google's error page exactly as displayed.

For public access, change the publishing status to **In production** and complete any brand verification requested by Google. The `drive.file` scope used here is non-sensitive and does not require sensitive- or restricted-scope verification.

The `drive.file` scope is intentionally used instead of full Drive access. PocketReader cannot browse or change unrelated Drive files with this permission.

## 3. Create the browser OAuth client

1. Open **Google Auth Platform → Clients** (or **APIs & Services → Credentials**).
2. Choose **Create client → Web application**.
3. Name it `PocketReader Web`.
4. Under **Authorized JavaScript origins**, add exactly:

   ```text
   https://charlesneimog.github.io
   ```

   OAuth origins contain only the scheme and host. Do not add `/PocketReader/` here and do not add a trailing slash.

5. No redirect URI is required for the browser token popup used by PocketReader.
6. Create the client and copy the client ID. It looks like:

   ```text
   000000000000-example.apps.googleusercontent.com
   ```

The OAuth client ID is public deployment configuration. Never put a Google client secret in PocketReader's HTML or JavaScript.

## 4. Configure the deployed app once

Open `src/config.js` and set the client ID created above:

```js
GOOGLE_DRIVE_CLIENT_ID: "000000000000-example.apps.googleusercontent.com",
```

Commit and deploy that change. This is done once by the PocketReader owner; users are never asked for a client ID.

## 5. Connect PocketReader

1. Open [PocketReader](https://charlesneimog.github.io/PocketReader/).
2. Select the cloud icon in the reader toolbar.
3. Select **Continue with Google** and approve the requested Drive access.

Choosing Google automatically uses Google Drive for sync. Logging in with the email/password form automatically uses the self-host server instead.

## 6. OAuth branding links

Use these public URLs in Google Auth Platform → Branding:

```text
Application home page:
https://charlesneimog.github.io/PocketReader/

Privacy policy:
https://charlesneimog.github.io/PocketReader/privacy.html

Terms of service:
https://charlesneimog.github.io/PocketReader/terms.html
```

Google browser access tokens are short-lived. PocketReader keeps the token in browser session storage so ordinary page reloads in the same tab or PWA session do not require authorization again. If the token expires, the browser session ends, or PocketReader displays **Reconnect required**, open the cloud panel and connect again. Local IndexedDB remains available while Drive is disconnected.

## Local development

To test from a local web server, add each exact local origin to the same OAuth client, for example:

```text
http://localhost:8080
http://127.0.0.1:8080
```

The port must match the one used by the development server.

## Migrate an existing self-hosted server

The local conversion script extracts document BLOBs, reading positions, voice
and translation settings, and highlights from `data/database.db`. It only creates
PDF/EPUB files and matching JSON files; it does not connect to or upload anything
to Google.

Stop the self-hosted server (or copy `database.db`), then run:

```bash
python scripts/migrate_server_to_google_drive.py data/database.db \
  --output google-drive-export
```

The script exports every database owner by default. Each email address gets its
own folder, for example `google-drive-export/user@example.com/`. Add
`--owner user@example.com` to export only one account, or `--legacy` to export
only old rows without an owner. Use `--overwrite` to replace an existing export.
Each document is paired with a file named `.DOCUMENT_NAME.pocketreader.json`.

To move an exported account into Drive, connect PocketReader to Google Drive,
open the cloud panel, select **Import converted owner folder**, and choose one
email-address folder created by the script. PocketReader pairs each JSON with its
document and adds the Drive IDs and private properties required for sync. Files
uploaded manually through drive.google.com are adopted when the `drive.file`
permission makes them available; otherwise PocketReader uploads an authorized
copy.

## Troubleshooting

- **Error 400: origin_mismatch**: add the exact browser origin to **Authorized JavaScript origins**. For the published app it is `https://charlesneimog.github.io`.
- **Access blocked / app not verified**: add the Google account as a test user, or complete the publishing/verification steps requested by Google.
- **Google Identity Services did not load**: check content blockers and network filtering for `accounts.google.com`.
- **Popup window closed immediately**: PocketReader uses strict `Cross-Origin-Opener-Policy: same-origin` to enable multi-threaded WASM. Use a browser with FedCM support; legacy popup callbacks cannot retain `window.opener` under strict isolation.
- **Drive API has not been used**: enable the Google Drive API in the same Cloud project as the OAuth client.
- **Google Drive is not configured by the app owner**: set `GOOGLE_DRIVE_CLIENT_ID` in `src/config.js` and deploy the change.
- **Reconnect required**: this is expected after the browser token expires; connect again from the cloud panel.

Official references:

- [Set up OAuth for a web app](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
