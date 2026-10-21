/**
 * MarineRadar: SalesIQ chat emails -> date-named tab in the Sheet.
 *
 * This is the ONLY part that runs in Apps Script. Translation, the Gemini
 * summary and the digest email run from the chat-summary repo as a GitHub
 * Action, which picks up the rows this writes.
 *
 * TRIGGER:
 *   Point your time-driven trigger at extractSalesIQChatsToNewTab.
 *   Schedule it to finish before the GitHub Action's cron time.
 *
 * COLUMNS: A Date | B Subject | C Transcript | D Translated | E Summary | F Tag | G Message ID | H Sentiment
 */

const SHEET_ID = "YOUR_SHEET_ID";   // from the Sheet URL
const SENDER   = "noreply@zohosalesiq.com";

const HEADERS = ["Date", "Subject", "Chat Transcript", "Translated", "Summary", "Tag", "Message ID", "Sentiment"];

function extractSalesIQChatsToNewTab() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const sheetName = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();   // commit the new tab before anything else reads it
  }

  const threads = GmailApp.search("from:" + SENDER + " newer_than:1d");
  if (threads.length === 0) {
    Logger.log("No new SalesIQ emails today.");
    return;
  }

  // Dedupe on Gmail message ID (column G).
  // Do NOT key on the date: Sheets drops milliseconds, so the value never round-trips.
  const lastRow = sheet.getLastRow();
  const seen = new Set(
    lastRow < 2 ? [] :
    sheet.getRange(2, 7, lastRow - 1, 1).getValues()
         .map(function (r) { return String(r[0] || ""); })
         .filter(String)
  );

  const rows = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      const id = msg.getId();
      if (seen.has(id)) return;
      seen.add(id);
      rows.push([
        msg.getDate(),
        msg.getSubject(),
        msg.getPlainBody().slice(0, 49000),   // cell hard limit is 50,000 chars
        "", "", "",                           // D Translated, E Summary, F Tag - filled by the GitHub Action
        id                                    // G Message ID
      ]);
    });
  });

  if (rows.length === 0) {
    Logger.log("No new messages (all already saved in " + sheetName + ").");
    return;
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  SpreadsheetApp.flush();
  Logger.log("Saved " + rows.length + " messages to sheet: " + sheetName);
}
