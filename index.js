/**
 * Daily SalesIQ chat digest for one product.
 *
 *   node index.js <product> [build|hold|send|run]
 *
 * ENV:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  service account key (each Sheet shared with it as Editor)
 *   GEMINI_API_KEY
 *   RESEND_API_KEY
 *   MAIL_FROM                    sender on a Resend-verified domain, e.g. "Chat Digest <digest@example.com>"
 *   MAIL_TO                      comma-separated IST recipient list
 *   MAIL_TO_PT                   comma-separated PT recipient list
 *   <PRODUCT>_SHEET_ID           spreadsheet ID, named by the product's config (e.g. MARINE_RADAR_SHEET_ID)
 *   EDITION    (optional)        ist (default) or pt
 *   REPORT_DATE (optional)       edition calendar date, YYYY-MM-DD
 *   TAB_NAME   (optional)        defaults to today in Asia/Kolkata
 *   TAB_DEADLINE (optional)      UTC ISO deadline for a missing tab
 *   HOLD_UNTIL (optional)        UTC ISO send target; manual workflows omit it
 *   DRY_RUN=1  (optional)        no sheet writes or send; write HTML/subject to out/
 *   TEST_EMAIL_TO (optional)     don't write to the sheet; send the email only to this address
 */

import { readdirSync } from "node:fs";
import { build, hold, run, send } from "./src/pipeline.js";
import { digestFailureMessage } from "./src/errors.js";

const productsDir = new URL("./products/", import.meta.url);
const available = readdirSync(productsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const name = process.argv[2];
const command = process.argv[3] || "run";
if (!available.includes(name) || !["build", "hold", "send", "run"].includes(command)) {
  console.error("Usage: node index.js <" + available.join("|") + "> [build|hold|send|run]");
  process.exit(1);
}

const { default: product } = await import(new URL(name + "/config.js", productsDir));

const action = command === "hold" ? () => hold() : () => ({ build, send, run }[command])(product);
action().catch(error => {
  // API errors can contain full requests, model output, or customer data.
  console.error(digestFailureMessage(error, command));
  process.exit(1);
});
