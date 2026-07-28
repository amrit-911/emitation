export type CategorySet = {
  name: string;
  required: boolean;
  exclusive: boolean;
  tags: string[];
  _id: string;
};

export type EmitTeam = {
  _id: string;
  name: string;
  avatarColour?: string;
  activityMinWordCount?: number;
  activityMinUniqueTags?: number;
  activityMaxAddDelay?: number;
  activityFillingInstructions?: string;
  categorySets: CategorySet[];
  [k: string]: unknown;
};

export type EmitProfile = {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  activeTeam: EmitTeam;
  activeMember?: { mention?: string; [k: string]: unknown };
  teams?: EmitTeam[];
  [k: string]: unknown;
};

export type RepoProvider = "github" | "gitlab";

export type Commit = {
  sha: string;
  /** Matches Repo.id — used for repoMap lookups and per-day grouping. */
  repoId: string;
  provider: RepoProvider;
  /** owner/repo (GitHub) or namespace/path (GitLab), for display. */
  repo: string;
  message: string;
  /** ISO string of the commit's author date */
  date: string;
  url: string;
  authorLogin?: string | null;
  authorEmail?: string;
  branch?: string;
};

export type Repo = {
  /** `${provider}:${fullName}` — stable key across both providers. */
  id: string;
  provider: RepoProvider;
  fullName: string;
  private: boolean;
  pushedAt: string | null;
  defaultBranch: string;
  language: string | null;
  /** GitLab only: numeric project id, required by its commits API. */
  providerId?: number;
};

/** Which repo maps to which Emit project (and a default activity tag). */
export type RepoMapping = {
  project: string;
  activity: string;
};

export type WeekendPolicy = {
  saturday: boolean;
  sunday: boolean;
};

export type Settings = {
  /** Emit bearer token from the `token` request header. */
  token: string;
  /** Optional raw cookie header, only sent if non-empty. */
  cookie: string;
  /** Raw JSON of GET profile, pasted from the network tab. */
  profileJson: string;
  /** Optional URL for auto-fetching the profile. */
  profileUrl: string;
  githubToken: string;
  githubUser: string;
  /** Extra emails the user commits under, comma separated. */
  githubEmails: string;
  gitlabToken: string;
  gitlabBaseUrl: string;
  gitlabUser: string;
  /** GitLab's commits API has no username filter, only emails. */
  gitlabEmails: string;
  scanAllBranches: boolean;
  selectedRepos: string[];
  repoMap: Record<string, RepoMapping>;
  hoursPerDay: number;
  weekend: WeekendPolicy;
  fallbackProject: string;
  fallbackActivity: string;
  aiPrompt: string;
  aiSummarizeCommits: boolean;
};

export type EntryStatus = "idle" | "queued" | "sending" | "done" | "error";
export type EntrySource = "commits" | "ai" | "manual";

export type Entry = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  text: string;
  project: string;
  activity: string;
  hours: number;
  source: EntrySource;
  commitShas: string[];
  status: EntryStatus;
  message?: string;
};

/** An activity that already exists on Emit — read-only, never re-pushed. */
export type ExistingEntry = {
  id: string;
  description: string;
  hours: number;
  tags: string[];
};

export type Day = {
  /** yyyy-MM-dd */
  date: string;
  isWeekend: boolean;
  /** User toggled this day off — nothing gets pushed. */
  enabled: boolean;
  commits: Commit[];
  entries: Entry[];
  /** Per-day nudge handed to the model when filling this gap. */
  hint?: string;
  /** Hours already logged on Emit for this day, fetched via list_activities. */
  existingHours: number;
  existingEntries: ExistingEntry[];
};
