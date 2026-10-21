# chat-summary

Daily digest of SalesIQ chats for each product (Travel Animator, MarineRadar).

1. **Apps Script** (`products/<product>/extract.gs`) copies the day's SalesIQ chat emails into a date-named tab (`yyyy-MM-dd`) of that product's Sheet.
2. **GitHub Action** (`.github/workflows/chat-summary.yml`) runs `node index.js <product>` for every product, which translates the chats (col D), summarizes, tags and scores sentiment with Gemini (cols E, F and the sentiment column), and emails the digest via Resend.

## Layout

```
products/
  travel-animator/   config.js, extract.gs
  marine-radar/      config.js, extract.gs
src/                 shared pipeline, Gemini client, email layout
index.js             entry point: node index.js <product>
```

To add a product, create `products/<name>/` with a `config.js` and an `extract.gs`, add its `<NAME>_SHEET_ID` secret, and add it to the product lists in the workflow.

## Secrets

Set these under Settings → Secrets and variables → Actions → Repository secrets (and in `.env` for local runs):

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account key JSON. Share each Sheet with its `client_email` as Editor. |
| `GEMINI_API_KEY` | Gemini API key |
| `RESEND_API_KEY` | Resend API key |
| `MAIL_FROM` | Sender on a Resend-verified domain |
| `MAIL_TO` | Comma-separated recipients |
| `TRAVEL_ANIMATOR_SHEET_ID` | Travel Animator spreadsheet ID |
| `MARINE_RADAR_SHEET_ID` | MarineRadar spreadsheet ID |

## Running locally

```sh
npm ci
DRY_RUN=1 npm run local -- marine-radar                      # no sheet writes, prints the email
TEST_EMAIL_TO=you@example.com npm run local -- marine-radar  # no sheet writes, emails only you
TAB_NAME=2026-10-20 npm run local -- marine-radar            # process a specific tab
npm run local -- marine-radar                                # real run
```

The workflow can also be run manually from the Actions tab: pick a product (or all), and optionally a tab, a dry-run switch, or a test address that receives the email instead of everyone.
