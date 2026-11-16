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

export type RepoProvider = "github" | "gitlab" | "bitbucket";
/** Where a commit came from — a code host, or a folder read locally in the browser. */
export type CommitSource = RepoProvider | "local";

/** Who is using the app. Shapes examples, pills and whether code hosts are front and centre. */
export type Role = "developer" | "tester" | "ba";

export type AccentId = "intelligence" | "ocean" | "mint" | "sunset" | "rose";

export type Commit = {
  sha: string;
  /** Matches Repo.id — used for repoMap lookups and per-day grouping. */
  repoId: string;
  provider: CommitSource;
  /** owner/repo (GitHub), namespace/path (GitLab), workspace/slug (Bitbucket). */
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
  /** `${provider}:${fullName}` — stable key across every provider. */
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
  /** Atlassian account email — pairs with the API token for Basic auth. */
  bitbucketAuthEmail: string;
  /** Atlassian API token, or a workspace/repo access token (used as Bearer if no email). */
  bitbucketToken: string;
  /**
   * Optional workspace slugs. Discovery via /user/workspaces covers account
   * credentials; access tokens can't enumerate, so they need these spelled out.
   */
  bitbucketWorkspaces: string;
  bitbucketUser: string;
  /**
   * Atlassian `account_id`, captured when repos load. Commit author objects
   * carry this and a display name but no username, so it is the only reliable
   * way to recognise your own commits.
   */
  bitbucketAccountId: string;
  /** Bitbucket's commits API has no author filter, only post-hoc email matching. */
  bitbucketEmails: string;
  scanAllBranches: boolean;
  selectedRepos: string[];
  repoMap: Record<string, RepoMapping>;
  hoursPerDay: number;
  weekend: WeekendPolicy;
  fallbackProject: string;
  fallbackActivity: string;
  /** Standing writing-style guidance handed to the writer on every run. */
  aiPrompt: string;
  /** When a commit day is preceded by empty gap days, spread its commits back across them. */
  spreadCommits: boolean;
  /** How many empty days back a commit burst is allowed to spread into. */
  spreadMaxDays: number;
  /** Null until picked during onboarding. */
  role: Role | null;
  /** The animated tutorial has been seen (or skipped). */
  onboarded: boolean;
  accent: AccentId;
  reduceMotion: boolean;
  /** User-pinned prompts, shown as pills next to the role's built-in ones. */
  savedPrompts: string[];
};

/** What the planner understood from a prompt — the run's knobs, all visible and editable. */
export type RunConfig = {
  from: string;
  to: string;
  weekend: WeekendPolicy;
  hoursPerDay: number;
  spreadCommits: boolean;
  spreadMaxDays: number;
};

export type Plan = {
  mode: "build" | "refine";
  config: RunConfig;
  useCommits: boolean;
  /** Repos to pull from; empty means "whatever is selected". */
  repoIds: string[];
  summary: string;
};

/** A folder (or loose file) the user attached, read locally in the browser. */
export type FolderAttachment = {
  kind: "folder";
  id: string;
  name: string;
  fileCount: number;
  /** Commits recovered from .git reflogs — the user's own, with real timestamps. */
  commits: Commit[];
  remote?: string;
  branch?: string;
  /** A loaded repo whose remote matches this folder, so its tag mapping applies. */
  matchedRepoId?: string;
  manifest?: string;
  readme?: string;
  /** Recently modified files, newest first. */
  files: { path: string; modified: number }[];
};

export type FileAttachment = {
  kind: "file";
  id: string;
  name: string;
  size: number;
  text: string;
};

export type Attachment = FolderAttachment | FileAttachment;

export type EntryStatus = "idle" | "queued" | "sending" | "done" | "error";
export type EntrySource = "commits" | "ai" | "custom" | "manual";

export type Entry = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  text: string;
  project: string;
  activity: string;
  hours: number;
  /** Emit member handles (`@name`), written inline and sent as `mentions`. */
  mentions?: string[];
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
