# Emitation

Fills an [Emit](https://app.emit.work) timeline for you: pick a date range, hydrate it from your
GitHub and/or GitLab commits, let Gemini write the days that have no commits, review everything
inline, then push each activity to `POST /member/activity`.

## Setup

```bash
npm install
cp .env.example .env.local   # add your Gemini key
npm run dev
```

Open http://localhost:3000 and fill in **Connections**:

| Field | Where to get it |
| --- | --- |
| Token | DevTools → Network → any `api.emit.work` request → Request Headers → `token` |
| Cookie | Only if your instance also checks cookies — usually leave blank |
| Profile JSON | The `get_profile` response body, pasted whole |
| Auto-fetch URL | Optional. The profile request URL, so you can refresh it with one click later |
| GitHub PAT | Classic token with `repo`, or fine-grained with Contents + Metadata read |
| GitLab PAT | User Settings → Access Tokens, scope `read_api`. Works against gitlab.com or a self-hosted instance URL |

Everything is stored in this browser's `localStorage` under `emitation.settings.v1` — nothing is
written server-side. Tokens expire; paste the new one and carry on.

## Flow

1. **Timeline** — pick a range (or a preset), decide whether Saturdays and Sundays get filled
   (both off by default), and set hours per day.
2. **Repositories** — load repos from GitHub and/or GitLab (Connections has a tab for each), tick
   the ones that count, and map each to an Emit `#Project` plus a default `#Activity`. Unmapped
   repos fall back to the defaults.
3. **Pull** — fetches commits in range for the selected repos across both providers at once
   (optionally across all branches), groups them per day per repo, and splits the day's hours
   between them. GitLab's commits API has no username filter, so GitLab-side author filtering only
   matches on email. **Pull** also checks `list_activities` for what's already logged on Emit for
   each day in range — a green badge shows the logged total, and both the commit split and the AI
   filler only size new entries to the remaining hours. A day that already meets the target shows
   as **already filled** and is skipped by both fillers (the wand disables itself). Use **Check
   Emit** in the stats bar to refresh those totals without re-pulling commits.
   - **Commit spreading** (Timeline card): if you commit once for several days of work, a burst day
     right after empty gap days gets split backward across them — chronologically, earliest commits
     to the earliest day — capped at "look back up to N days" so it won't spread a single commit
     across a real absence. Spread commits show a `↦ moved from <date>` note in the commit list so
     it's never a mystery why they landed on a day with no matching authored date.
   - **Polish commit messages with AI** (Repositories card): sends each day's raw commit messages to
     Gemini and swaps them for one clean sentence — useful when your history is full of "fix", "wip".
     Project/activity tags are never touched by this; they stay whatever your repo mapping says.
4. **Gap filler** — days with no commits get written by Gemini from your prompt; each day also has
   its own nudge field, and the wand icon regenerates a single day.
5. **Push** — every entry is validated against the team rules (min words, min unique tags, one
   project tag, one activity tag) before anything is sent. Only newly-built entries are ever pushed
   — what's already on Emit is never re-sent. Turn on **Dry run** to build and validate the
   payloads without hitting Emit.

## How an entry becomes a request

An entry is `text + #Project + #Activity`; the description Emit stores is those three joined. The
body mirrors what the web app sends, including the full `team` and `user` objects echoed back from
your profile:

```jsonc
{
  "date": 1785214858000,        // the day at 12:00 local, so it can't slide a day
  "time": 8,                    // hours, 0.25 steps
  "description": "worked on the invoice importer #Blackcurrant #BackendDevelopment",
  "isTimeManuallySet": true,
  "isDateManuallySet": true,
  "isSharedActivityEdited": false,
  "status": "ADDED",
  "team": { /* profile.activeTeam */ },
  "user": { /* the whole profile */ },
  "tags": ["#Blackcurrant", "#BackendDevelopment"],
  "mentions": []
}
```

Requests go out one at a time with a 250 ms gap, and each row shows its own result.

## Notes

- `activityMaxAddDelay` from your team (50 days on Blackcurrant) is surfaced as a warning when the
  range reaches further back than Emit will accept.
- Emit's profile endpoint isn't documented, which is why the JSON is pasted rather than fetched by
  default. Drop the URL into the auto-fetch field once you've spotted it in DevTools.
