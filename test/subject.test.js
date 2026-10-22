import assert from "node:assert/strict";
import test from "node:test";
import { subject } from "../src/subject.js";

test("subject keeps a calendar report date in the PT edition", () => {
  assert.equal(
    subject("Travel Animator chats", "2025-10-21", "America/Los_Angeles", "14 chats"),
    "Travel Animator chats · Tue, Oct 21 — 14 chats"
  );
});

test("subject uses a single-digit day without a year", () => {
  assert.equal(
    subject("MarineRadar chats", "2025-11-01", "Asia/Kolkata", "1 chat"),
    "MarineRadar chats · Sat, Nov 1 — 1 chat"
  );
});

test("subject converts instants into the edition timezone", () => {
  const instant = new Date("2026-10-21T01:00:00Z");
  assert.equal(subject("Chats", instant, "America/Los_Angeles", "0 chats"), "Chats · Tue, Oct 20 — 0 chats");
  assert.equal(subject("Chats", instant, "Asia/Kolkata", "0 chats"), "Chats · Wed, Oct 21 — 0 chats");
});

test("subject rejects an invalid calendar date", () => {
  assert.throws(() => subject("Chats", "2026-02-30", "Asia/Kolkata", "0 chats"), /Invalid report date/);
});
