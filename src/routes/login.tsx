import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmail, useAuth } from "@/lib/account/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — LETF DCA Lab" },
      {
        name: "description",
        content: "Sign in to save your personal investment records and replay them in the simulator.",
      },
      { property: "og:title", content: "Sign in — LETF DCA Lab" },
      {
        property: "og:description",
        content: "Sign in to save your personal investment records across devices.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) void navigate({ to: "/records", replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    void navigate({ to: "/records", replace: true });
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Your records are private to your account."
      footer={
        <>
          <Link to="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
          <Link to="/forgot-password" className="text-muted-foreground hover:underline">
            Forgot password?
          </Link>
        </>
      }
    >
      <form className="space-y-3" onSubmit={submit}>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? <p className="text-xs text-loss">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm border border-border bg-card p-6">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-5">{children}</div>
        {footer ? (
          <div className="mt-5 flex items-center justify-between text-xs">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
