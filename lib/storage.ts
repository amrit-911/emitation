"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROFILE_JSON } from "./default-profile";
import type { Settings } from "./types";

const KEY = "emitation.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  token: "",
  cookie: "",
  profileJson: DEFAULT_PROFILE_JSON,
  profileUrl: "",
  githubToken: "",
  githubUser: "",
  githubEmails: "",
  gitlabToken: "",
  gitlabBaseUrl: "https://gitlab.com",
  gitlabUser: "",
  gitlabEmails: "",
  bitbucketAuthEmail: "",
  bitbucketToken: "",
  bitbucketWorkspaces: "",
  bitbucketUser: "",
  bitbucketAccountId: "",
  bitbucketEmails: "",
  scanAllBranches: false,
  selectedRepos: [],
  repoMap: {},
  hoursPerDay: 8,
  weekend: { saturday: false, sunday: false },
  fallbackProject: "",
  fallbackActivity: "",
  aiPrompt:
    "Write like a senior full-stack engineer logging their day: concrete, specific, no fluff. " +
    "One short sentence per entry, lowercase start, no hashtags in the text itself.",
  spreadCommits: true,
  spreadMaxDays: 3,
  role: null,
  onboarded: false,
  accent: "intelligence",
  reduceMotion: false,
  savedPrompts: [],
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Settings saved before the profile was bundled hold an empty string, which
    // would otherwise shadow the default forever.
    if (!merged.profileJson.trim()) merged.profileJson = DEFAULT_PROFILE_JSON;
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
}

/** Settings live in localStorage; `hydrated` guards against SSR/client mismatch. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // localStorage only exists after mount; reading it here is syncing with an external store.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSettings(loadSettings());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  // Stable, so memoised children that receive it don't re-render on every keystroke.
  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), []);

  return { settings, setSettings, patch, hydrated };
}
