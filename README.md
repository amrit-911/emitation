# Emitation

Fills an [Emit](https://app.emit.work) timeline from one sentence: *"fill the emit of this project
from 12 Sept to 15 Sept from my commits"*. It reads your commits (GitHub, GitLab, Bitbucket, or a
local repo folder), notes and docs, writes every entry with the right tags, lets you review inline,
then pushes each activity to `POST /member/activity`.

## Setup

```bash
npm install
cp .env.example .env.local   # add your Gemini key
npm run dev
```

Open http://localhost:3000. The first visit plays a short tour and asks your role. Then open
**Control Center → Connect** (the sliders icon, top right):

| Field | Where to get it |
| --- | --- |
| Token | DevTools → Network → any `api.emit.work` request → Request Headers → `token` |
| Cookie | Only if your instance also checks cookies — usually leave blank |
| Profile JSON | The `get_profile` response body, pasted whole |
| Auto-fetch URL | Optional. The profile request URL, so you can refresh it with one click later |
| GitHub PAT | Classic token with `repo`, or fine-grained with Contents + Metadata read |
| GitLab PAT | User Settings → Access Tokens, scope `read_api`. Works against gitlab.com or a self-hosted instance URL |
| Bitbucket | Atlassian account email + a **scoped** API token from id.atlassian.com → Security → *Create API token with scopes* (`read:repository:bitbucket`, `read:workspace:bitbucket`, `read:account`). A plain unscoped API token is rejected. Leave the email blank only for a workspace/repo *access token*, which authenticates as a Bearer on its own — those can't enumerate workspaces, so name them in the Workspaces field |

Everything is stored in this browser's `localStorage` under `emitation.settings.v1` — nothing is
written server-side. Tokens expire; paste the new one and carry on.

## Flow

Emitation is prompt-first: say what to fill, review, push.

1. **Role** — Developer, Tester or Business Analyst, picked during the tour (change it under
   Control Center → Look). It shapes the example prompts, the suggestion pills and the writer's
   persona. Developers get repositories front and centre; for testers and BAs, code hosts are
   optional and live at the end of the Control Center.
2. **Prompt** — the planner (`/api/ai/plan`) turns the sentence into the run's settings: date
   range, weekends, hours per day, whether to pull commits and from which repos, and whether to
   spread bursts. What it decided shows as chips on the run card; the sliders button there lets you
   change any of it and re-run. Defaults come from Control Center → Defaults. If the AI can't be
   reached, a plain-code reader (`lib/localPlan.ts`) handles the common date phrasings so the run
   still happens.
   - **Pick dates** in the **+** menu locks the window instead: every prompt (and follow-up) stays
     inside those days until you remove the chip.
   - The mic button dictates the prompt (browser speech recognition — Chrome and Edge).
3. **Context** — the **+** button (or drag-and-drop) attaches a folder or notes files. A folder is
   read entirely in the browser: your own commits from `.git` reflogs (no token needed), the
   `origin` remote (matched to a loaded repo so its tag mapping applies), the README, and which
   files were last edited on which day. Only a compact summary is sent to the AI.
4. **Commits** — pulled for the selected repos across all three providers at once (optionally
   across all branches) and merged with any attached folder's commits by sha. Author filtering
   differs per provider: GitHub filters server-side by username/email, while GitLab and Bitbucket
   have no author parameter, so their commits are matched after fetching (GitLab by email;
   Bitbucket by Atlassian account id, then commit email or display name). Bitbucket commit authors
   carry no username — only a display name and an account id — so the account id is captured when
   repos load and is what recognises your own commits. Bitbucket also has no `since`/`until` on its
   commits endpoint, so it pages from newest and stops once a whole page predates the range; a range
   older than 80 pages of history reports a warning rather than quietly coming back short.
   Bitbucket repo discovery is workspace-scoped:
   [CHANGE-2770](https://developer.atlassian.com/cloud/bitbucket/changelog#CHANGE-2770) (April 2026)
   returned 410 for every cross-workspace listing endpoint, so workspaces come from
   `/user/workspaces` and repos from `/repositories/{workspace}` per workspace.
   - **Commit spreading**: if you commit once for several days of work, a burst day right after
     empty gap days gets split backward across them — chronologically, earliest commits to the
     earliest day — capped at "look back up to N days". Spread commits show a `↦ <date>` note in the
     day's commit list.
5. **Already on Emit** — `list_activities` is checked for every day in range. Each day's ring and
   `on Emit` chip show the logged total, and new entries are only sized to the remaining hours. A
   day that already meets the target is left alone. The refresh button in the bottom bar re-checks.
6. **Writing** — `/api/ai/custom` sees the prompt, every commit at its real authored date (not the
   spread), what's already on Emit, the attached context and each day's current draft, and decides
   per day how bursts map to days, how to summarise, which tags and `@mentions` to use, how hours
   split and which days to skip (leave, holidays). Windows longer than a month are written in
   chunks. Already-pushed entries are never replaced.
7. **Refine** — once a timeline exists, the prompt edits it instead of rebuilding: *"Friday was
   leave"*, *"shorter descriptions"*, *"add a 30 min standup tagging @priya"*. The wand on a day
   rewrites just that day (with its note, if you wrote one). Pin any prompt to keep it as a pill.
8. **Push** — every entry is validated against the team rules (min words, min unique tags, one
   project tag, one activity tag) before anything is sent. Only newly-built entries are ever pushed
   — what's already on Emit is never re-sent. Turn on **Dry run** in the bottom bar to build and
   validate the payloads without hitting Emit.

The working timeline is kept in `localStorage` (`emitation.draft.v1`), so a reload doesn't lose it.
The cross on the run card starts over.

## How an entry becomes a request

An entry is `text + #Project + #Activity`; the description Emit stores is those three joined. The
body mirrors what the web app sends, including the full `team` and `user` objects echoed back from
your profile:

```jsonc
{
  "date": 1785214858000,        // the day at 12:00 local, so it can't slide a day
  "time": 8,                    // hours, 0.25 steps
  "description": "worked on the invoice importer #ProjectName #BackendDevelopment",
  "isTimeManuallySet": true,
  "isDateManuallySet": true,
  "isSharedActivityEdited": false,
  "status": "ADDED",
  "team": { /* profile.activeTeam */ },
  "user": { /* the whole profile */ },
  "tags": ["#ProjectName", "#BackendDevelopment"],
  "mentions": []
}
```

Requests go out one at a time with a 250 ms gap, and each row shows its own result.

## Notes

- `activityMaxAddDelay` from your team (50 days in the bundled sample profile) is surfaced as a
  warning when the range reaches further back than Emit will accept.
- Emit's profile endpoint isn't documented, which is why the JSON is pasted rather than fetched by
  default. Drop the URL into the auto-fetch field once you've spotted it in DevTools.
