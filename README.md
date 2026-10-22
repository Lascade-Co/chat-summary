# chat-summary

Daily SalesIQ chat digests for Travel Animator and MarineRadar, with a shared email style and two local editions.

Apps Script copies chats into a date-named Sheet tab. The pipeline translates column C into D, summarizes and tags new chats in E/F, and writes sentiment to G (Travel Animator) or H (MarineRadar). Each email combines saved summaries with newly summarized rows, so PT can read the tab already processed by IST. Empty tabs produce a zero-chat email. Missing or incomplete source data fails the run instead of silently accepting a partial digest.

## Editions and timing

| Edition | Timezone | Recipients | Gate | Delivery |
| --- | --- | --- | --- | --- |
| `pt` | `America/Los_Angeles` | `MAIL_TO_PT` | 05:05 local | 05:55 local |
| `ist` | `Asia/Kolkata` | `MAIL_TO` | 05:05 local | 05:55 local |

PT cron: `43 3,6,9 * * *` UTC. IST cron: `9 13,16,19 * * *` UTC. Two gate jobs sleep toward the absolute local 05:05 target. Python `zoneinfo` handles Pacific daylight saving time. The email job has a 75-minute timeout for building, tab polling, holding, and sending. Late starts send as soon as ready with the original report date; the hold never rejects a run for being late.

Both editions use the **current IST day's tab**, independently of the report date, unless `TAB_NAME` is supplied. Move each Apps Script extraction trigger to the **3–4 AM IST** slot before cutover. Scheduled jobs poll a missing tab every 60 seconds through 05:40 in the edition's timezone, then fail. Manual runs skip gate sleeps and the hold, and fail immediately if the requested tab is missing.

Subjects use the report day in the edition's timezone, for example `Travel Animator chats · Wed, Oct 21 — 14 chats`. Sheet chat times remain the source's wall-clock times.

## Delivery and recovery

The workflow runs `build`, `hold`, a delivery-history check, then `send`. Its send-job concurrency group is per product and edition and does not include the event type, so scheduled and manual recovery jobs share a lock. The final dedupe check is inside that lock after the hold. Successful dated `Deliver <product> <PT|IST> for <date>` steps dedupe each product separately. An aggregate `Delivered <PT|IST> for <date>` marker is emitted only for successful production runs of all products; partial matrix success never marks an entire edition delivered.

Build writes a frozen envelope once to `out/frozen-<product>-<edition>.json` on the current runner. Send reads that file once and retries the exact body bytes with the same Resend key. There is no `scheduled_at`, cache, cross-run payload storage, or upload of frozen envelopes.

- Production key: `chat-summary/<sheetIdEnv>/<tab>/<edition>`.
- Test key: `chat-summary/test/<sheetIdEnv>/<tab>/<edition>/<github.run_id>`.
- Only HTTP 200 records acceptance. HTTP 409 `concurrent_idempotent_requests` retries with backoff; `invalid_idempotent_request` fails closed and needs investigation.
- If a runner dies after an ambiguous POST, a new run rebuilds from the sheet. A changed payload may conflict with the existing key and leave a red run; do not bypass the key to force a duplicate.
- Dry runs and test sends use `Dry run …` or `Test send …` step names, never `Deliver` or `Delivered`, and cannot satisfy production dedupe.

For manual production recovery make a **fresh dispatch on `main`** with `recovery=true` for the current or an earlier report day; successful dated deliveries are still skipped. Production sends from other branches/tags, future report days, and GitHub's **Re-run jobs** are rejected so every accepted delivery remains visible to the donor's main-only, bounded history scan. Dispatch a new recovery run instead. Dry runs and test sends may run or rerun on preview branches and do not require recovery mode. Delivery-history failures fail closed. A red Actions run is the alert; there is no Telegram integration.

## Secrets

Configure repository Actions secrets; `.env` may be used locally and is ignored by Git.

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account JSON; share both Sheets with its `client_email` as Editor |
| `GEMINI_API_KEY` | Gemini API key |
| `RESEND_API_KEY` | Resend API key |
| `MAIL_FROM` | Existing display-name sender on a Resend-verified domain |
| `MAIL_TO` | Comma-separated IST recipient list |
| `MAIL_TO_PT` | Comma-separated PT recipient list |
| `PREVIEW_KEY` | Passphrase for encrypted preview archives |
| `TRAVEL_ANIMATOR_SHEET_ID` | Travel Animator spreadsheet ID |
| `MARINE_RADAR_SHEET_ID` | MarineRadar spreadsheet ID |

## Previews

```sh
gh workflow run chat-summary.yml -R Lascade-Co/chat-summary -r <branch> -f dry_run=true -f edition=both
```

Manual inputs are `product` (`all`, `travel-animator`, `marine-radar`), `edition` (`pt`, `ist`, `both`), `dry_run`, `report_date`, `tab`, `test_email_to`, and `recovery`. `report_date` controls the email date; `tab` selects the source independently. Dry runs and test sends never write to Sheets.

Each artifact is named `preview-<product>-<edition>` and contains **only `preview.tar.gz.enc`**. It is an OpenSSL AES-256-CBC archive using PBKDF2 and a random salt with `PREVIEW_KEY`. The decrypted archive contains `out/<product>-<edition>.html` and `.subject.txt`. Only these two files are selected for the tar archive; plaintext output and frozen envelopes are never uploaded from this public repository.

After downloading into a private local directory, decrypt with the same key supplied through a protected file:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:/path/to/preview-key -in preview.tar.gz.enc | tar xz
```

Actions logs contain counts and `sha256(subject)[:8]`, never subjects, email bodies, recipients, row contents, or raw upstream errors. Verify this against a real dry-run log as well as opening both edition previews. The required read-back preview is PT against a tab already summarized by IST.

## Local commands and layout

```sh
npm ci
EDITION=pt DRY_RUN=1 npm run local -- marine-radar
EDITION=ist DRY_RUN=1 REPORT_DATE=2026-10-21 TAB_NAME=2026-10-21 npm run local -- travel-animator
EDITION=pt TEST_EMAIL_TO=you@example.com GITHUB_RUN_ID=local-test-001 npm run local -- marine-radar
```

Use a fresh `GITHUB_RUN_ID` for each local test send. `node index.js <product>` defaults to combined build/hold/send; the workflow uses the separate commands below to insert its history check. Local commands do not acquire the GitHub job lock or query delivery history, so use workflow recovery for production reruns. Remove obsolete local `out/frozen-*.json` files before a new build; a build never overwrites an existing envelope.

```sh
node index.js marine-radar build
node index.js marine-radar hold
node index.js marine-radar send
```

`EDITION` defaults to `ist`; `REPORT_DATE` defaults to the current date in that edition's timezone. `HOLD_UNTIL` and `TAB_DEADLINE` are UTC ISO timestamps supplied by scheduled workflow settings. `DRY_RUN` accepts `1` or `true`.

```text
products/<product>/   config.js, extract.gs
src/shell.js          shared style-guide shell, copied verbatim head/CSS
src/email.js          HTML and plain-text chat renderer
src/subject.js        timezone-aware subject builder
src/pipeline.js       read-back, summarize, build, hold, send stages
src/delivery.js       immutable envelope, Resend retry, hold
scripts/gate/         edition settings and dated-step dedupe
test/                 offline Node tests, including Python gate cases
```

To add a product, create its configuration (including `slug`) and extractor, add its sheet secret, and update the product lists in the workflow and gate settings. The shell comes from `product-intelligence/Style Template/styleguide-email.html`; keep its head, font stacks, responsive and dark-mode rules aligned with that source.

## Verification and cutover

Offline tests require Node.js 24, Python 3 with PyYAML, OpenSSL, and tar. The workflow runs on GitHub's Ubuntu runner with Node.js 24.

```sh
npm ci && node --test
python3 -m py_compile scripts/gate/*.py
bash /Users/cherianthomas/.claude/skills/style-guide-html/validate-html.sh /tmp/chat-sample.html
```

Before landing, render a sample through `src/email.js`, parse the workflow YAML, dispatch both editions from the branch, decrypt/open the previews, and verify public logs contain no known summary or full subject. After approval, confirm the extractor trigger change and secrets, then land once before 13:00 UTC. The coordinator owns dispatch, preview approval, merge, and submodule updates. Cutover may produce a one-day duplicate; the old 13:00 UTC schedule is replaced in the same change.

On the first live morning check green dated delivery steps around 05:55, inbox arrival at 05:55–05:58, subjects, sender display names, Gmail iOS dark mode, and suppression of later cron attempts. These operational checks require real GitHub runs and inbox access.
