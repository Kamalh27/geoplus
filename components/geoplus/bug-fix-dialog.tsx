"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Turnstile } from "@marsidev/react-turnstile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BugFixSeverity = "low" | "medium" | "high" | "critical";

type BugFixDraft = {
  isAnonymous: boolean;
  title: string;
  email: string;
  password?: string;
  module: string;
  severity: BugFixSeverity;
  steps: string;
  expected: string;
  actual: string;
  turnstileToken: string | null;
};

const defaultBugFixDraft: BugFixDraft = {
  isAnonymous: false,
  title: "",
  email: "",
  password: "",
  module: "",
  severity: "medium",
  steps: "",
  expected: "",
  actual: "",
  turnstileToken: null,
};

type BugFixDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function BugFixDialog({ isOpen, onOpenChange }: BugFixDialogProps) {
  const [bugFixDraft, setBugFixDraft] = useState<BugFixDraft>(defaultBugFixDraft);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bugFixDraft.turnstileToken) {
      setStatusMessage("Please complete the bot verification.");
      return;
    }

    if (!bugFixDraft.title.trim() || !bugFixDraft.steps.trim() || !bugFixDraft.actual.trim()) {
      setStatusMessage("Please fill issue title, reproducible steps, and actual behavior before saving.");
      return;
    }

    if (!bugFixDraft.isAnonymous && (!bugFixDraft.email.trim() || !bugFixDraft.password?.trim())) {
      setStatusMessage("Email and password are required for authenticated submission.");
      return;
    }

    setStatusMessage(`Bug draft saved locally on ${new Date().toLocaleString()}.`);
  };

  const handleReset = () => {
    setBugFixDraft(defaultBugFixDraft);
    setStatusMessage(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) {
        setStatusMessage(null);
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bug Fix Form</DialogTitle>
          <DialogDescription>
            Draft a high-quality bug report with severity, reproducible steps, and behavior details.
          </DialogDescription>
        </DialogHeader>

        <form id="geoplus-bug-fix-form" className="space-y-3" onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2">
            <input
              type="checkbox"
              id="geoplus-bug-anonymous"
              checked={bugFixDraft.isAnonymous}
              onChange={(event) =>
                setBugFixDraft((previous) => ({
                  ...previous,
                  isAnonymous: event.target.checked,
                  email: event.target.checked ? "" : previous.email,
                  password: event.target.checked ? "" : previous.password,
                }))
              }
              className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
            />
            <label htmlFor="geoplus-bug-anonymous" className="text-sm font-medium text-foreground">
              Submit Anonymously
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Issue Title</span>
              <Input
                placeholder="e.g. Layer style resets after refresh"
                value={bugFixDraft.title}
                onChange={(event) => setBugFixDraft((previous) => ({ ...previous, title: event.target.value }))}
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Module</span>
              <Input
                placeholder="Map, Layers, Tools, AI, Settings"
                value={bugFixDraft.module}
                onChange={(event) => setBugFixDraft((previous) => ({ ...previous, module: event.target.value }))}
              />
            </label>
          </div>

          {!bugFixDraft.isAnonymous && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contact Email</span>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={bugFixDraft.email}
                  onChange={(event) => setBugFixDraft((previous) => ({ ...previous, email: event.target.value }))}
                  required={!bugFixDraft.isAnonymous}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Password</span>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={bugFixDraft.password}
                  onChange={(event) => setBugFixDraft((previous) => ({ ...previous, password: event.target.value }))}
                  required={!bugFixDraft.isAnonymous}
                />
              </label>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Severity</span>
              <select
                value={bugFixDraft.severity}
                onChange={(event) =>
                  setBugFixDraft((previous) => ({
                    ...previous,
                    severity: event.target.value as BugFixSeverity,
                  }))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Repro Steps</span>
            <textarea
              rows={3}
              placeholder="1) Open Layers  2) Add dataset  3) Toggle style preset..."
              value={bugFixDraft.steps}
              onChange={(event) => setBugFixDraft((previous) => ({ ...previous, steps: event.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Expected Behavior</span>
              <textarea
                rows={3}
                placeholder="Describe what should happen."
                value={bugFixDraft.expected}
                onChange={(event) => setBugFixDraft((previous) => ({ ...previous, expected: event.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actual Behavior</span>
              <textarea
                rows={3}
                placeholder="Describe what actually happened."
                value={bugFixDraft.actual}
                onChange={(event) => setBugFixDraft((previous) => ({ ...previous, actual: event.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                required
              />
            </label>
          </div>

          <div className="flex justify-start pt-2">
            <Turnstile 
              siteKey="1x00000000000000000000AA"
              onSuccess={(token) => setBugFixDraft((prev) => ({ ...prev, turnstileToken: token }))}
              onExpire={() => setBugFixDraft((prev) => ({ ...prev, turnstileToken: null }))}
              onError={() => setBugFixDraft((prev) => ({ ...prev, turnstileToken: null }))}
            />
          </div>
        </form>

        {statusMessage ? (
          <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">{statusMessage}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Image src="/logo.svg" alt="SPADACE logo" width={16} height={16} className="size-4 opacity-50 grayscale" />
            <span>GeoPlus Bug Reporter</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={handleReset}>
              Reset
            </Button>
            <Button variant="secondary" type="submit" form="geoplus-bug-fix-form">
              Save Draft
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}