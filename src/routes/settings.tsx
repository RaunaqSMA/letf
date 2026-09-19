import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Callout, PageHeader, Section } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account/account.functions";
import { useAuth } from "@/lib/account/auth";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Account settings — LETF DCA Lab" },
      { name: "description", content: "Manage your LETF DCA Lab account and saved records." },
      { property: "og:title", content: "Account settings — LETF DCA Lab" },
      { property: "og:description", content: "Manage your account and saved investment records." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, displayName, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  if (!user) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="px-4 py-8 md:px-8">
          <Callout title="Sign in required">
            <Button asChild size="sm" className="mt-2">
              <Link to="/login">Sign in</Link>
            </Button>
          </Callout>
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirm !== "DELETE") return;
    setBusy(true);
    try {
      await deleteMyAccount();
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Account deleted");
      void navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your account and saved records." />

      <Section title="Account">
        <div className="border border-border bg-card p-4 text-sm">
          <div className="num">{displayName}</div>
          <div className="num text-muted-foreground">{user.email}</div>
        </div>
      </Section>

      <Section
        title="Danger zone"
        description="This permanently deletes your saved portfolios and transactions."
      >
        <div className="border border-loss/50 bg-loss/5 p-4">
          <p className="text-sm">
            Deleting your account removes your profile, every portfolio and every transaction you
            saved. This cannot be undone.
          </p>
          <div className="mt-3 max-w-xs space-y-1.5">
            <Label className="label-xs">Type DELETE to confirm</Label>
            <Input className="num" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={confirm !== "DELETE" || busy}
            onClick={handleDelete}
            className="mt-3 border border-loss bg-loss/15 px-4 py-2 text-sm font-semibold text-loss transition-colors hover:bg-loss/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Permanently delete my account"}
          </button>
        </div>
      </Section>
    </div>
  );
}
