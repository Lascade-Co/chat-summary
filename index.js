/**
 * Daily SalesIQ chat digest for one product.
 *
 *   node index.js <product>      product = a folder under products/
 *
 * ENV:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  service account key (each Sheet shared with it as Editor)
 *   GEMINI_API_KEY
 *   RESEND_API_KEY
 *   MAIL_FROM                    sender on a Resend-verified domain, e.g. "Chat Digest <digest@example.com>"
 *   MAIL_TO                      comma-separated recipient list
 *   <PRODUCT>_SHEET_ID           spreadsheet ID, named by the product's config (e.g. MARINE_RADAR_SHEET_ID)
 *   TAB_NAME   (optional)        e.g. 2026-08-27; defaults to today in the sheet's timezone
 *   DRY_RUN=1  (optional)        don't write to the sheet; print the email instead of sending it
 *   TEST_EMAIL_TO (optional)     don't write to the sheet; send the email only to this address
 */

import { readdirSync } from "node:fs";
import { run } from "./src/pipeline.js";

const productsDir = new URL("./products/", import.meta.url);
const available = readdirSync(productsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

const name = process.argv[2];
if (!available.includes(name)) {
  console.error("Usage: node index.js <" + available.join("|") + ">");
  process.exit(1);
}

const { default: product } = await import(new URL(name + "/config.js", productsDir));

run(product).catch(err => {
  console.error(err);
  process.exit(1);
});
