import type { AccentId, Role } from "./types";

export type PromptPill = { label: string; prompt: string };

export type RoleDef = {
  id: Role;
  label: string;
  short: string;
  /** How the writer model should think of the person whose timesheet it fills. */
  persona: string;
  blurb: string;
  /** Code hosts are core for developers; for everyone else they live in the drawer. */
  codeFirst: boolean;
  /** Cycled through the composer's animated placeholder. */
  examples: string[];
  pills: PromptPill[];
  /** What to suggest once a timeline exists. */
  refine: PromptPill[];
};

const sharedRefine: PromptPill[] = [
  { label: "Fill the remaining gaps", prompt: "Fill every day that still has hours left, consistent with the rest of the week" },
  { label: "Shorter descriptions", prompt: "Rewrite every unsent entry shorter — one crisp clause each, same tags and hours" },
  { label: "Friday was leave", prompt: "I was on leave on Friday — skip it" },
];

export const ROLES: Record<Role, RoleDef> = {
  developer: {
    id: "developer",
    label: "Developer",
    short: "Dev",
    persona: "software engineer",
    blurb: "Fill from commits across GitHub, GitLab, Bitbucket or a local repo folder.",
    codeFirst: true,
    examples: [
      "Fill the emit of this project from 12 Sept to 15 Sept from my commits",
      "Log last week from my commits — spread Friday's burst back to Wednesday",
      "This week from the attached folder, plus a 30 min standup every morning",
      "Fill the gaps in October, I was on leave on the 20th and 21st",
      "Last two weeks from emitation, summarise by feature instead of by repo",
    ],
    pills: [
      { label: "This week from my commits", prompt: "Fill this week from my commits" },
      {
        label: "Last week, spread bursts",
        prompt:
          "Fill last week from my commits and spread any commit burst back into the empty days before it",
      },
      {
        label: "Month to date",
        prompt:
          "Fill everything from the 1st of this month until today from my commits; days without commits were code review and bug fixing",
      },
      {
        label: "With daily standup",
        prompt: "Fill this week from my commits, plus a 30 min standup meeting every morning",
      },
    ],
    refine: [
      ...sharedRefine,
      { label: "Summarise by feature", prompt: "Summarise the commits by feature instead of by repository" },
    ],
  },
  tester: {
    id: "tester",
    label: "Tester",
    short: "QA",
    persona: "QA engineer / software tester",
    blurb: "Describe your test cycles — attach test plans or docs for extra context.",
    codeFirst: false,
    examples: [
      "Log this week: regression testing on checkout, 1h standup daily",
      "Fill 12 Sept to 15 Sept — test case writing for the payments module",
      "Last week: verified sprint bug fixes, Friday was UAT with the client",
      "Fill the gaps this month from the test plan folder I attached",
    ],
    pills: [
      {
        label: "Regression this week",
        prompt: "Fill this week with regression testing on the release candidate, plus a 1h standup daily",
      },
      {
        label: "From my test docs",
        prompt: "Fill last week from the attached folder — base entries on the test cases and docs I edited",
      },
      {
        label: "Bug verification",
        prompt:
          "Log the last 5 working days as bug verification and retesting, with smoke testing on Friday afternoon",
      },
      {
        label: "UAT support",
        prompt: "This week: UAT support with the client on Tuesday and Thursday, test execution on the other days",
      },
    ],
    refine: sharedRefine,
  },
  ba: {
    id: "ba",
    label: "Business Analyst",
    short: "BA",
    persona: "business analyst",
    blurb: "Describe workshops, stories and docs — attach meeting notes for context.",
    codeFirst: false,
    examples: [
      "Fill this week: requirement workshops Mon & Wed, user stories the rest",
      "Log 12 Sept to 15 Sept from the meeting notes I attached",
      "Last week: stakeholder interviews, BRD drafting, 1h sprint planning Monday",
      "Fill the gaps this month — backlog grooming and acceptance criteria",
    ],
    pills: [
      {
        label: "Workshops & stories",
        prompt:
          "Fill this week: requirement workshops on Monday and Wednesday, user stories and acceptance criteria on the other days",
      },
      { label: "From my notes", prompt: "Fill last week from the notes and documents I attached" },
      {
        label: "Sprint ceremonies",
        prompt:
          "This week: 1h sprint planning Monday, 30 min standup daily, backlog grooming Thursday, documentation the rest",
      },
      {
        label: "Fill this month",
        prompt: "Fill every empty day this month with analysis work consistent with what's already logged",
      },
    ],
    refine: sharedRefine,
  },
};

export const ROLE_LIST = [ROLES.developer, ROLES.tester, ROLES.ba];

export const roleOf = (role: Role | null | undefined): RoleDef => ROLES[role ?? "developer"];

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: "intelligence", label: "Intelligence", swatch: "linear-gradient(135deg,#bc82f3,#8d9fff 50%,#ff8ab4)" },
  { id: "ocean", label: "Ocean", swatch: "linear-gradient(135deg,#5ac8fa,#3b82f6)" },
  { id: "mint", label: "Mint", swatch: "linear-gradient(135deg,#6ee7b7,#14b8a6)" },
  { id: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#ffba71,#ff6778)" },
  { id: "rose", label: "Rose", swatch: "linear-gradient(135deg,#f5b9ea,#ec4899)" },
];
