"use client";

import { useMemo, useState } from "react";
import { GitBranch, Lock, Search } from "lucide-react";
import { Badge, Button, GithubMark, GitlabMark, TagPicker, cx } from "./ui";
import type { Repo, RepoMapping } from "@/lib/types";

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
  const [onlySelected, setOnlySelected] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos
      .filter((r) => (onlySelected ? selected.includes(r.id) : true))
      .filter((r) => (q ? r.fullName.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const sa = selected.includes(a.id) ? 0 : 1;
        const sb = selected.includes(b.id) ? 0 : 1;
        if (sa !== sb) return sa - sb;
        return (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "");
      });
  }, [repos, query, onlySelected, selected]);

  if (repos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-slate-500">
        Load your repos from Connections → GitHub or GitLab to map them onto Emit projects.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-ink-850/80 px-2.5">
          <Search className="size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter repos…"
            className="w-full bg-transparent py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600"
          />
        </div>
        <Button
          size="sm"
          variant={onlySelected ? "primary" : "outline"}
          onClick={() => setOnlySelected((v) => !v)}
        >
          Selected {selected.length}
        </Button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-brand-300 transition hover:bg-white/6"
          onClick={() => onSelectMany(list.map((r) => r.id), true)}
        >
          Select all {query ? "matching" : ""} ({list.length})
        </button>
        <span className="text-slate-700">|</span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 transition hover:bg-white/6 hover:text-slate-300"
          onClick={() => onSelectMany(selected, false)}
        >
          Clear
        </button>
      </div>

      <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {list.map((repo) => {
          const on = selected.includes(repo.id);
          const mapping = repoMap[repo.id] ?? { project: "", activity: "" };
          return (
            <div
              key={repo.id}
              className={cx(
                "rounded-xl border px-3 py-2.5 transition",
                on ? "border-brand-500/30 bg-brand-500/6" : "border-white/8 bg-white/2",
              )}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => onToggle(repo.id, e.target.checked)}
                  className="size-4 shrink-0 accent-brand-500"
                />
                <button
                  type="button"
                  onClick={() => onToggle(repo.id, !on)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {repo.provider === "gitlab" ? (
                    <GitlabMark className="size-3.5 shrink-0 text-orange-400" />
                  ) : (
                    <GithubMark className="size-3.5 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate text-sm text-slate-200">{repo.fullName}</span>
                  {repo.private && <Lock className="size-3 shrink-0 text-slate-500" />}
                  {repo.language && <Badge className="shrink-0">{repo.language}</Badge>}
                </button>
                {!on && repo.pushedAt && (
                  <span className="shrink-0 text-[11px] text-slate-600">
                    {new Date(repo.pushedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {on && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 pl-7">
                  <TagPicker
                    value={mapping.project}
                    options={projects}
                    onChange={(v) => onMap(repo.id, { project: v })}
                    placeholder="→ project tag"
                  />
                  <TagPicker
                    value={mapping.activity}
                    options={activities}
                    onChange={(v) => onMap(repo.id, { activity: v })}
                    placeholder="→ default activity"
                    tone="cyan"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <GitBranch className="size-3" />
        Commits from unmapped repos fall back to the default project tag.
      </p>
    </div>
  );
}
