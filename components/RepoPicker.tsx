"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, GitBranch, Lock, Search } from "lucide-react";
import { BitbucketMark, GithubMark, GitlabMark, Segmented, TagPicker, cx, spring } from "./ui";
import type { Repo, RepoMapping } from "@/lib/types";

export function ProviderMark({ provider, className }: { provider: Repo["provider"]; className?: string }) {
  if (provider === "gitlab") return <GitlabMark className={cx("text-orange-400", className)} />;
  if (provider === "bitbucket") return <BitbucketMark className={cx("text-blue-400", className)} />;
  return <GithubMark className={cx("text-label-2", className)} />;
}

export function RepoPicker({
  repos,
  selected,
  repoMap,
  projects,
  activities,
  onToggle,
  onSelectMany,
  onMap,
}: {
  repos: Repo[];
  selected: string[];
  repoMap: Record<string, RepoMapping>;
  projects: string[];
  activities: string[];
  onToggle: (id: string, on: boolean) => void;
  onSelectMany: (ids: string[], on: boolean) => void;
  onMap: (id: string, mapping: Partial<RepoMapping>) => void;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "selected">("all");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos
      .filter((r) => (view === "selected" ? selected.includes(r.id) : true))
      .filter((r) => (q ? r.fullName.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const sa = selected.includes(a.id) ? 0 : 1;
        const sb = selected.includes(b.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
      });
  }, [repos, query, view, selected]);

  if (repos.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-white/10 px-5 py-8 text-center">
        <div className="mb-3 flex justify-center gap-2 text-label-3">
          <GithubMark className="size-5" />
          <GitlabMark className="size-5" />
          <BitbucketMark className="size-5" />
        </div>
        <p className="text-[13px] text-label-2">No repositories loaded yet.</p>
        <p className="mt-1 text-xs text-label-3">
          Add a token under Connections and hit <span className="text-label-2">Load repos</span> — or just attach a
          folder to the prompt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-full border border-white/[0.08] bg-black/25 px-3 transition focus-within:border-white/20">
          <Search className="size-3.5 text-label-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repositories"
            className="w-full bg-transparent text-xs text-label outline-none placeholder:text-label-4"
          />
        </label>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { id: "all", label: "All" },
            { id: "selected", label: `On ${selected.length}` },
          ]}
        />
      </div>

      <div className="flex items-center gap-1 text-[11px] text-label-3">
        <button
          type="button"
          className="rounded-full px-2 py-0.5 text-accent transition hover:bg-white/[0.06]"
          onClick={() => onSelectMany(list.map((r) => r.id), true)}
        >
          Select {query ? "matching" : "all"} ({list.length})
        </button>
        <button
          type="button"
          className="rounded-full px-2 py-0.5 transition hover:bg-white/[0.06] hover:text-label-2"
          onClick={() => onSelectMany(selected, false)}
        >
          Clear
        </button>
      </div>

      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {list.slice(0, 200).map((repo) => {
            const on = selected.includes(repo.id);
            const mapping = repoMap[repo.id] ?? { project: "", activity: "" };
            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={spring.snappy}
                className={cx(
                  "rounded-[16px] border px-3 py-2.5 transition-[background-color,border-color] duration-300",
                  on
                    ? "border-[color-mix(in_oklab,var(--accent)_28%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(repo.id, !on)}
                  className="flex w-full min-w-0 items-center gap-2.5 text-left"
                >
                  <span
                    className={cx(
                      "grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors duration-200",
                      on ? "border-transparent text-white" : "border-white/20",
                    )}
                    style={on ? { background: "var(--accent-grad)" } : undefined}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <ProviderMark provider={repo.provider} className="size-3.5 shrink-0" />
                  <span className="truncate text-[13px] text-label">{repo.fullName}</span>
                  {repo.private && <Lock className="size-3 shrink-0 text-label-4" />}
                  {repo.language && (
                    <span className="hidden shrink-0 text-[10.5px] text-label-4 sm:inline">{repo.language}</span>
                  )}
                  {!on && repo.pushedAt && (
                    <span className="ml-auto shrink-0 text-[10.5px] text-label-4">
                      {new Date(repo.pushedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={spring.smooth}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 pl-7 pt-2.5">
                        <TagPicker
                          value={mapping.project}
                          options={projects}
                          onChange={(v) => onMap(repo.id, { project: v })}
                          placeholder="→ project"
                        />
                        <TagPicker
                          value={mapping.activity}
                          options={activities}
                          onChange={(v) => onMap(repo.id, { activity: v })}
                          placeholder="→ activity"
                          tone="cyan"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-label-4">
        <GitBranch className="size-3" />
        Unmapped repos fall back to your default project tag.
      </p>
    </div>
  );
}
