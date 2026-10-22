#!/usr/bin/env python3
"""Resolve chat digest matrices, local delivery times and dated delivery checks.

Only metadata reaches Actions outputs. Recipient values are masked before later
steps receive them, and delivery history is checked again after the hold inside
the workflow's event-independent product/edition concurrency lock.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
import json
import os
import sys
from zoneinfo import ZoneInfo

import catchup_gate as G

PRODUCTS = ("travel-animator", "marine-radar")


@dataclass(frozen=True)
class Edition:
    name: str
    timezone: str
    cron: str

    @property
    def zone(self):
        return ZoneInfo(self.timezone)

    def at(self, day, hour, minute):
        return datetime.combine(day, time(hour, minute), self.zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


EDITIONS = {
    "pt": Edition("pt", "America/Los_Angeles", "43 3,6,9 * * *"),
    "ist": Edition("ist", "Asia/Kolkata", "9 13,16,19 * * *"),
}


def resolve_daily_schedule(schedule):
    for name, edition in EDITIONS.items():
        if schedule == edition.cron:
            return name
    raise ValueError("unknown chat-summary schedule")


def truth(value):
    return str(value).lower() in ("true", "1")


def event_inputs(env):
    path = env.get("GITHUB_EVENT_PATH")
    if not path:
        return {}
    with open(path, encoding="utf-8") as stream:
        return json.load(stream).get("inputs") or {}


def report_date_for(edition, supplied, event, now):
    if supplied:
        day = date.fromisoformat(supplied)
        if str(day) != supplied:
            raise ValueError("report_date must be YYYY-MM-DD")
        return day
    if event == "schedule":
        return G.plan(now, edition.zone, (5, 5))[0]
    local = now.astimezone(edition.zone)
    return local.date()


def settings(env=None, now=None):
    env = os.environ if env is None else env
    now = G.now_utc() if now is None else now
    event = env.get("EVENT", "schedule")
    if event not in ("schedule", "workflow_dispatch"):
        raise ValueError("unsupported workflow event")
    inputs = event_inputs(env) if event == "workflow_dispatch" else {}
    name = env.get("EDITION") or (resolve_daily_schedule(env.get("SCHEDULE", "")) if event == "schedule"
                                  else env.get("INPUT_EDITION") or inputs.get("edition") or "both")
    names = tuple(EDITIONS) if name == "both" else (name,)
    if any(item not in EDITIONS for item in names):
        raise ValueError("unknown edition")
    product = env.get("PRODUCT") or env.get("INPUT_PRODUCT") or inputs.get("product") or "all"
    products = PRODUCTS if product == "all" else (product,)
    if any(item not in PRODUCTS for item in products):
        raise ValueError("unknown product")
    dry = event != "schedule" and truth(env.get("DRY_RUN", inputs.get("dry_run", "false")))
    test_to = env.get("TEST_EMAIL_TO") or inputs.get("test_email_to") or ""
    if test_to and not test_to.strip():
        raise ValueError("blank test recipient")
    test_to = test_to.strip()
    recovery = truth(env.get("RECOVERY", inputs.get("recovery", "false")))
    mode = "dry" if dry else "test" if test_to else "real"
    if event == "workflow_dispatch" and mode == "real" and not recovery:
        raise ValueError("manual production sends require recovery=true")
    if mode == "real":
        # The donor's history scan trusts main and bounds runs by creation date.
        # A fresh main dispatch keeps every permitted acceptance visible to it.
        if env.get("GITHUB_REF", "refs/heads/main") != "refs/heads/main":
            raise ValueError("production delivery requires main")
        if env.get("GITHUB_RUN_ATTEMPT", "1") != "1":
            raise ValueError("production recovery requires a fresh dispatch")
    supplied = env.get("REPORT_DATE") or (env.get("INPUT_DATE") or inputs.get("report_date") if event != "schedule" else "")
    dates = {item: report_date_for(EDITIONS[item], supplied, event, now) for item in names}
    if event == "workflow_dispatch" and mode == "real" and any(
            day > now.astimezone(EDITIONS[item].zone).date() for item, day in dates.items()):
        raise ValueError("production recovery cannot target a future report day")
    matrix = [{"product": p, "edition": e, "report_date": str(dates[e])} for e in names for p in products]
    edition_matrix = [{"edition": e, "label": e.upper(), "report_date": str(dates[e])} for e in names]
    first = EDITIONS[names[0]]
    day = dates[first.name]
    prefix = {"dry": "Dry run", "test": "Test send", "real": "Deliver"}[mode]
    return {
        "matrix": json.dumps({"include": matrix}, separators=(",", ":")),
        "edition_matrix": json.dumps({"include": edition_matrix}, separators=(",", ":")),
        "edition": first.name,
        "timezone": first.timezone,
        "report_date": str(day),
        "mode": mode,
        "sent_step": f"Delivered {first.name.upper()} for ",
        "product_sent_step": f"Deliver {products[0]} {first.name.upper()} for ",
        "send_step": f"{prefix} {products[0]} {first.name.upper()} for {day}",
        "send_at": first.at(day, 5, 55),
        "hold_until": first.at(day, 5, 55) if event == "schedule" else "",
        "tab_deadline": first.at(day, 5, 40) if event == "schedule" else "",
    }


def mask_test_recipient(env):
    inputs = event_inputs(env)
    raw = env.get("TEST_EMAIL_TO") or inputs.get("test_email_to") or ""
    for value in {raw.strip(), *(item.strip() for item in raw.split(","))}:
        if value:
            escaped = value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::add-mask::{escaped}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("command", choices=("settings", "dedupe"))
    args = ap.parse_args(argv)
    try:
        resolved = settings()
        if args.command == "settings":
            mask_test_recipient(os.environ)
            G.emit(**resolved)
        else:
            sent = resolved["mode"] == "real" and G.already_sent(
                date.fromisoformat(resolved["report_date"]), G.now_utc(),
                workflow="chat-summary.yml", sent_step=resolved["product_sent_step"])
            G.emit(sent=str(sent).lower())
        return 0
    except G.DedupeUnavailable:
        print("delivery history unavailable; refusing to send", file=sys.stderr)
        return 3
    except (ValueError, KeyError, OSError):
        print("invalid chat-summary workflow settings", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
