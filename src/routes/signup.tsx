import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpWithEmail } from "@/lib/account/auth";
import { AuthShell } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — LETF DCA Lab" },
      {
        name: "description",
        content: "Create a free account to save your investment records and use them in the simulator.",
      },
      { property: "og:title", content: "Create account — LETF DCA Lab" },
      {
        property: "og:description",
        content: "Create a free account to save your investment records.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: err } = await signUpWithEmail(
      email.trim(),
      password,
      displayName.trim() || undefined,
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      void navigate({ to: "/records", replace: true });
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="Confirm your address to finish signing up.">
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to {email}. Once confirmed you can sign in and your records
          will be saved to your account.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Only your investment records are stored. Never broker or bank details."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label className="label-xs">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="label-xs">Email</Label>
          <Input
            type="email"
            required
            className="num"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="label-xs">Password</Label>
          <Input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-xs text-loss">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
