# launchd templates (Phase 3.7 local scheduler)

Why launchd over plain `cron` on a MacBook: `cron` simply skips a job if the
Mac was asleep or off at the scheduled time — it never runs late. launchd's
`StartCalendarInterval` jobs **do** fire once the Mac wakes if it missed the
scheduled time while asleep, which is exactly the "safe recovery after the
MacBook was asleep or offline" behavior this phase asks for. Every job this
scheduler runs is already idempotent (each job function has its own
freshness/idempotency window), so a job firing a bit late — or being run
twice back to back — is always safe, never duplicates work.

## Setup

1. Copy a template below, replace every `/ABSOLUTE/PATH/TO/nextjs-blog-theme`
   with the real path to this repo on your Mac, and save it into
   `~/Library/LaunchAgents/` (create the directory if it doesn't exist).
2. Load it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.atlas.daily.plist
   ```
3. Confirm it's loaded:
   ```bash
   launchctl list | grep com.atlas
   ```
4. Logs go to the `StandardOutPath`/`StandardErrorPath` you set below (a
   `logs/` directory inside the repo is a reasonable default — create it
   first: `mkdir -p /ABSOLUTE/PATH/TO/nextjs-blog-theme/logs`).
5. To stop/unload: `launchctl unload ~/Library/LaunchAgents/com.atlas.daily.plist`.
6. To change the schedule, edit the `.plist`, then unload + load again
   (launchd doesn't pick up file changes on a running job automatically).

Each template invokes `node_modules/.bin/tsx` directly (not `npm run ...`)
because launchd's environment doesn't reliably have `npm`/`node` on its
`PATH` the way an interactive shell does — the absolute path sidesteps
that. `WorkingDirectory` is set so `tsx` (which auto-loads `.env` relative
to the current directory) finds this repo's `.env`.

## Templates

- **`com.atlas.daily.plist`** — the simple, recommended default: runs
  `scheduler run-all --scheduled` once each weekday morning (8:00 AM),
  covering every job in dependency order (market data → fundamentals →
  earnings → news → filings → risk → thesis → recommendations → health →
  opportunities → outcomes → briefing → alerts). This alone is enough for
  daily use.
- **`com.atlas.notify.plist`** — runs just `scheduler run alertDelivery
  --scheduled` every 15 minutes, matching the alert-delivery cadence
  `vercel.json` used — optional, only worth adding if you want alerts
  delivered faster than once a day.
- **`com.atlas.weekly.plist`** — runs `scheduler run weeklyLearning
  --scheduled` every Sunday morning, for the scorecard/calibration/pattern
  aggregates that only make sense on a weekly cadence.

## Crontab alternative

If you'd rather not use launchd, a plain crontab entry works too — it just
won't catch up on a run missed while the Mac was asleep the way launchd
does (see above). `crontab -e` and add:

```cron
# Atlas daily pipeline, weekday mornings at 8am
0 8 * * 1-5 cd /ABSOLUTE/PATH/TO/nextjs-blog-theme && ./node_modules/.bin/tsx scripts/scheduler.ts run-all --scheduled >> logs/scheduler-cron.log 2>&1

# Alert delivery every 15 minutes
*/15 * * * * cd /ABSOLUTE/PATH/TO/nextjs-blog-theme && ./node_modules/.bin/tsx scripts/scheduler.ts run alertDelivery --scheduled >> logs/scheduler-cron.log 2>&1

# Weekly learning suite, Sunday mornings
0 9 * * 0 cd /ABSOLUTE/PATH/TO/nextjs-blog-theme && ./node_modules/.bin/tsx scripts/scheduler.ts run weeklyLearning --scheduled >> logs/scheduler-cron.log 2>&1
```

## Checking status without waiting for the next scheduled run

```bash
npm run scheduler -- status     # every job's enabled state, lock state, last run
npm run scheduler -- run-all    # run everything right now, manually
npm run scheduler -- run <jobName>
npm run scheduler -- disable <jobName>   # scheduled runs of this job are skipped (recorded, not silently dropped)
npm run scheduler -- enable <jobName>
```
