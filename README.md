# chat-summary

Daily digest of Travel Animator SalesIQ chats.

1. **Apps Script** (`apps-script/extract.gs`) copies the day's SalesIQ chat emails into a date-named tab (`yyyy-MM-dd`) of the Sheet.
2. **GitHub Action** (`.github/workflows/chat-summary.yml`) runs `index.js`, which translates the chats (col D), summarizes, tags and scores sentiment with Gemini (cols E–G), and emails the digest via Resend.

## Secrets

Set these under Settings → Secrets and variables → Actions (and in `.env` for local runs):

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key JSON. Share the Sheet with its `client_email` as Editor. |
| `GEMINI_API_KEY` | Gemini API key |
| `RESEND_API_KEY` | Resend API key |
| `MAIL_FROM` | Sender on a Resend-verified domain |
| `MAIL_TO` | Comma-separated recipients |
| `SHEET_ID` | Spreadsheet ID from the Sheet URL |

## Running locally

```sh
npm ci
DRY_RUN=1 npm run local                      # no sheet writes, prints the email
TEST_EMAIL_TO=you@example.com npm run local  # no sheet writes, emails only you
TAB_NAME=2026-10-20 npm run local            # process a specific tab
npm run local                                # real run
```

The workflow can also be run manually from the Actions tab, with an optional tab, a dry-run switch, and a test address that receives the email instead of everyone.
