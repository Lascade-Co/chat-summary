import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
function python(source) {
  const result = spawnSync("python3", ["-c", `import sys\nsys.path.insert(0, 'scripts/gate')\n${source}`], {
    cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("gate cron instants fit both sleeping jobs across Pacific DST changes", () => {
  python(`
from datetime import date, datetime, timedelta, timezone
import catchup_gate as G
for day in (date(2026,3,7), date(2026,3,8), date(2026,10,31), date(2026,11,1)):
    for hour in (3,6,9):
        now = datetime.combine(day, datetime.min.time(), timezone.utc).replace(hour=hour, minute=43)
        report, wait, ok = G.plan(now, 'America/Los_Angeles', '05:05')
        assert report == day, (now, report)
        assert ok and 0 <= wait <= 680 * 60, (now, wait, ok)
    for hour in (13,16,19):
        now = datetime.combine(day-timedelta(days=1), datetime.min.time(), timezone.utc).replace(hour=hour, minute=9)
        report, wait, ok = G.plan(now, 'Asia/Kolkata', '05:05')
        assert report == day, (now, report)
        assert ok and 0 <= wait <= 680 * 60, (now, wait, ok)
`);
});

test("edition settings derive DST-safe delivery and tab deadlines", () => {
  python(`
import editions as E
cases = [('2026-03-07', '13:55', '13:40'), ('2026-03-08', '12:55', '12:40'),
         ('2026-10-31', '12:55', '12:40'), ('2026-11-01', '13:55', '13:40')]
for day, send, deadline in cases:
    settings = E.settings({'EVENT':'schedule', 'SCHEDULE':'43 3,6,9 * * *', 'REPORT_DATE':day, 'PRODUCT':'travel-animator'})
    assert settings['send_at'] == day+'T'+send+':00Z', settings
    assert settings['tab_deadline'] == day+'T'+deadline+':00Z', settings
    assert settings['hold_until'] == settings['send_at']
    settings = E.settings({'EVENT':'schedule', 'SCHEDULE':'9 13,16,19 * * *', 'REPORT_DATE':day, 'PRODUCT':'travel-animator'})
    assert settings['send_at'] == day+'T00:25:00Z', settings
    assert settings['tab_deadline'] == day+'T00:10:00Z', settings
`);
});

test("manual both-edition previews resolve individual dates without holds", () => {
  python(`
from datetime import datetime, timezone
import json
import editions as E
settings = E.settings({'EVENT':'workflow_dispatch', 'INPUT_EDITION':'both', 'DRY_RUN':'true'},
                      now=datetime(2026,10,21,2,tzinfo=timezone.utc))
matrix = json.loads(settings['matrix'])['include']
assert len(matrix) == 4
assert {(row['edition'],row['report_date']) for row in matrix} == {('pt','2026-10-20'),('ist','2026-10-21')}
assert settings['hold_until'] == '' and settings['tab_deadline'] == ''
early = E.settings({'EVENT':'workflow_dispatch', 'INPUT_EDITION':'pt', 'DRY_RUN':'true'},
                   now=datetime(2026,10,21,10,tzinfo=timezone.utc))
assert early['report_date'] == '2026-10-21'
settings = E.settings({'EVENT':'workflow_dispatch', 'INPUT_EDITION':'both', 'DRY_RUN':'true', 'INPUT_DATE':'2026-11-01'})
assert {row['report_date'] for row in json.loads(settings['matrix'])['include']} == {'2026-11-01'}
assert settings['mode'] == 'dry'
`);
});

test("manual production dispatch requires recovery and previews never get Deliver names", () => {
  python(`
import editions as E
base = {'EVENT':'workflow_dispatch','EDITION':'pt','PRODUCT':'travel-animator','REPORT_DATE':'2026-11-01'}
from datetime import datetime, timezone
now = datetime(2026,11,1,16,tzinfo=timezone.utc)
for extra, mode, prefix in [({'DRY_RUN':'true'},'dry','Dry run '),
                            ({'TEST_EMAIL_TO':'test@example.invalid'},'test','Test send '),
                            ({'RECOVERY':'true','TEST_EMAIL_TO':'test@example.invalid'},'test','Test send '),
                            ({'RECOVERY':'true'},'real','Deliver ' )]:
    settings = E.settings(dict(base, **extra), now=now)
    assert settings['mode'] == mode
    assert settings['send_step'] == prefix+'travel-animator PT for 2026-11-01'
    assert settings['hold_until'] == ''
try:
    E.settings(base, now=now)
except ValueError:
    pass
else:
    raise AssertionError('unsafe manual production dispatch was accepted')
`);
});

test("dated delivery dedupe works across matrix names, partial failure and attempts", () => {
  python(`
from datetime import date
import catchup_gate as G
repo = 'Lascade-Co/chat-summary'
def history(step, conclusion='success', branch='main', attempts=1):
    def fetch(path):
        if '/workflows/' in path:
            return {'total_count':1, 'workflow_runs':[{'id':23,'event':'workflow_dispatch', 'head_branch':branch,
                     'head_repository':{'full_name':repo},'run_attempt':attempts, 'conclusion':'failure'}]}
        return {'total_count':1,'jobs':[{'name':'email (travel-animator, pt)', 'conclusion':'failure',
                'steps':[{'name':step,'conclusion':conclusion}]}]}
    return fetch
day = date(2026,11,1)
prefix = 'Deliver travel-animator PT for '
assert G.sent_step_succeeded(day,history(prefix+str(day),attempts=2),repo,'chat-summary.yml',prefix)
for step, outcome in [('Test send travel-animator PT for 2026-11-01','success'),
                      ('Dry run travel-animator PT for 2026-11-01','success'),
                      ('Deliver marine-radar PT for 2026-11-01','success'),
                      (prefix+'2026-10-31','success'), (prefix+str(day),'failure')]:
    assert not G.sent_step_succeeded(day,history(step,outcome),repo,'chat-summary.yml',prefix), (step,outcome)
assert not G.sent_step_succeeded(day,history(prefix+str(day),branch='feature'),repo,'chat-summary.yml',prefix)
assert not G.sent_step_succeeded(day,history('Delivered PT for 2026-11-01'),repo,'chat-summary.yml',prefix)
`);
});

test("dedupe fails closed when paginated history is incomplete", () => {
  python(`
from datetime import date, datetime, timezone
import catchup_gate as G
def incomplete(path):
    return {'total_count':2, 'workflow_runs':[]}
try:
    G.already_sent(date(2026,11,1),datetime.now(timezone.utc),fetch=incomplete,
                   workflow='chat-summary.yml',sent_step='Deliver travel-animator PT for ')
except G.DedupeUnavailable:
    pass
else:
    raise AssertionError('incomplete delivery history was treated as not delivered')
`);
});

test("a whitespace-only test recipient cannot become an unchecked production send", () => {
  python(`
import editions as E
for recovery in ('false', 'true'):
    try:
        E.settings({'EVENT':'workflow_dispatch', 'EDITION':'pt', 'PRODUCT':'travel-animator',
                    'TEST_EMAIL_TO':'   ', 'RECOVERY':recovery})
    except ValueError:
        pass
    else:
        raise AssertionError('blank test recipient was accepted')
`);
});

test("production runs stay within main and fresh-run history while previews can rerun on branches", () => {
  python(`
import editions as E
base = {'EVENT':'workflow_dispatch', 'EDITION':'pt', 'PRODUCT':'travel-animator',
        'RECOVERY':'true', 'GITHUB_REF':'refs/heads/main', 'GITHUB_RUN_ATTEMPT':'1'}
assert E.settings(base)['mode'] == 'real'
for change in ({'GITHUB_REF':'refs/heads/feature'}, {'GITHUB_REF':'refs/tags/main'}, {'GITHUB_RUN_ATTEMPT':'2'}):
    try:
        E.settings(dict(base, **change))
    except ValueError:
        pass
    else:
        raise AssertionError('production delivery outside trusted history was accepted')
    assert E.settings(dict(base, **change, DRY_RUN='true'))['mode'] == 'dry'
    assert E.settings(dict(base, **change, TEST_EMAIL_TO='test@example.invalid'))['mode'] == 'test'
`);
});

test("manual production recovery cannot send a future report outside the dated history window", () => {
  python(`
from datetime import datetime, timezone
import editions as E
now = datetime(2026,10,21,15,tzinfo=timezone.utc)
base = {'EVENT':'workflow_dispatch', 'EDITION':'pt', 'PRODUCT':'travel-animator',
        'RECOVERY':'true', 'REPORT_DATE':'2026-11-01', 'GITHUB_REF':'refs/heads/main', 'GITHUB_RUN_ATTEMPT':'1'}
try:
    E.settings(base, now=now)
except ValueError:
    pass
else:
    raise AssertionError('future production recovery was accepted')
assert E.settings(dict(base, DRY_RUN='true'), now=now)['mode'] == 'dry'
assert E.settings(dict(base, TEST_EMAIL_TO='test@example.invalid'), now=now)['mode'] == 'test'
assert E.settings(dict(base, REPORT_DATE='2026-10-21'), now=now)['mode'] == 'real'
assert E.settings(dict(base, REPORT_DATE='2026-10-20'), now=now)['mode'] == 'real'
`);
});

test("manual phases skip sleep and phase two recomputes the absolute target", () => {
  python(`
from datetime import date, datetime, timezone
import os, sys
from unittest.mock import patch
import catchup_gate as G
assert G.phase2_wait(date(2026,11,1), datetime(2026,11,1,12,35,tzinfo=timezone.utc), 'America/Los_Angeles', '05:05') == 1800
assert G.phase2_wait(date(2026,11,1), datetime(2026,11,1,14,0,tzinfo=timezone.utc), 'America/Los_Angeles', '05:05') == 0
for phase in ('1','2'):
    with patch.object(sys,'argv',['gate','--phase',phase,'--event','workflow_dispatch','--report-date','2026-11-01',
                                 '--sent-step','Delivered PT for ']), patch.object(G.time,'sleep') as sleep, \
         patch.object(G,'already_sent', side_effect=AssertionError('manual gate must skip dedupe')):
        G.main()
        assert not sleep.called
`);
});

test("phase one honors the report date already frozen into the workflow matrix", () => {
  python(`
from datetime import date, datetime, timezone
import sys
from unittest.mock import patch
import catchup_gate as G
# Settings can resolve today's date just before 16:00 local; the gate may start just after it.
with patch.object(sys, 'argv', ['gate','--phase','1','--event','schedule','--report-date','2026-10-21',
                               '--tz','America/Los_Angeles','--sent-step','Delivered PT for ']), \
     patch.object(G, 'now_utc', return_value=datetime(2026,10,21,23,tzinfo=timezone.utc)), \
     patch.object(G, 'already_sent', return_value=False), patch.object(G.time, 'sleep') as sleep, \
     patch.object(G, 'emit') as emit:
    G.main()
    assert emit.call_args.kwargs['report_date'] == date(2026,10,21)
    assert emit.call_args.kwargs['proceed'] == 'true'
    sleep.assert_called_once_with(0)
`);
});
