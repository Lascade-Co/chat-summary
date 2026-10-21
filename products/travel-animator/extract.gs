/**
 * Travel Animator: SalesIQ chat emails -> date-named tab in the Sheet.
 *
 * This is the ONLY part that runs in Apps Script. Translation, the Gemini
 * summary and the digest email run from the chat-summary repo as a GitHub
 * Action, which picks up the rows this writes.
 *
 * TRIGGER:
 *   Point your time-driven trigger at extractSalesIQChatsToNewTab.
 *   Schedule it to finish before the GitHub Action's cron time.
 */

const SHEET_ID = "YOUR_SHEET_ID";   // from the Sheet URL
const SENDER   = "noreply@zohosalesiq.com";

function extractSalesIQChatsToNewTab() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const sheetName = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(["Date", "Subject", "Chat Transcript", "Translated", "Summary", "Tag", "Sentiment"]);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }

  const threads = GmailApp.search("from:" + SENDER + " newer_than:1d");
  if (threads.length === 0) {
    Logger.log("No new SalesIQ emails today.");
    return;
  }

  const lastRow = sheet.getLastRow();
  const seen = new Set(
    lastRow < 2 ? [] :
    sheet.getRange(2, 1, lastRow - 1, 2).getValues()
         .map(function (r) {
           const d = r[0];
           return (d instanceof Date ? d.getTime() : String(d)) + "|" + r[1];
         })
  );

  const rows = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      const key = msg.getDate().getTime() + "|" + msg.getSubject();
      if (seen.has(key)) return;
      seen.add(key);
      rows.push([
        msg.getDate(),
        msg.getSubject(),
        msg.getPlainBody().slice(0, 49000)
      ]);
    });
  });

  if (rows.length === 0) {
    Logger.log("No new messages (all already saved in " + sheetName + ").");
    return;
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  SpreadsheetApp.flush();
  Logger.log("Saved " + rows.length + " messages to sheet: " + sheetName);
}
