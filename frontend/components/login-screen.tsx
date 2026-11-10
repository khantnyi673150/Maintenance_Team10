"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { assignedStaffCategory, maintenanceRole } from "@/lib/maintenance-role";
import { canUseLocalDemo } from "@/lib/local-demo";
import { CampusHeader } from "@/components/campus-brand";

const accessMessage = "This account has no maintenance role. Contact your campus administrator.";

function accountAccessError(user: User): string | null {
  const role = maintenanceRole(user);
  if (!role) return accessMessage;
  if (role === "staff" && !assignedStaffCategory(user)) {
    return "Your staff account is waiting for a maintenance category. Contact your campus administrator.";
  }
  return null;
}

function signInError(code?: string): string {
  if (code === "invalid_credentials") return "The email or password is incorrect. Please try again.";
  if (code === "email_not_confirmed") return "Please confirm your email address before signing in.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Too many sign-in attempts. Please wait a moment and try again.";
  return "We couldn’t sign you in. Check your connection and try again.";
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDemoAvailable, setLocalDemoAvailable] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    setLocalDemoAvailable(canUseLocalDemo(window.location.hostname));
    let subscription: { unsubscribe(): void } | undefined;
    try {
      const client = createBrowserSupabaseClient();
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (!mounted.current) return;
        if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
        if (session) {
          const accessError = accountAccessError(session.user);
          if (!accessError) { router.replace("/"); return; }
          setError(accessError);
        }
        setCheckingSession(false);
      }).data.subscription;
    } catch {
      setCheckingSession(false);
      setError("Sign-in is temporarily unavailable. Please contact your campus administrator.");
    }
    return () => { mounted.current = false; subscription?.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || checkingSession) return;
    inFlight.current = true;
    setSigningIn(true);
    setError(null);
    setShowPassword(false);
    try {
      const client = createBrowserSupabaseClient();
      const { data, error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (!mounted.current) return;
      const accessError = data.session && data.user ? accountAccessError(data.user) : accessMessage;
      setPassword("");
      if (authError) {
        setError(signInError(authError.code));
      } else if (accessError) {
        await client.auth.signOut({ scope: "local" });
        if (mounted.current) setError(accessError);
      }
    } catch {
      if (mounted.current) setError("We couldn’t sign you in. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSigningIn(false);
    }
  }

  const busy = signingIn || checkingSession;

  return (
    <div className="login-page">
      <CampusHeader action={<Link className="btn-switch-role" href="/"><ArrowLeft size={16} aria-hidden="true" />Home</Link>} />
      <main className="login-main">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card-heading">
            <h1 id="login-title">Sign in</h1>
            <p>Sign in with your campus email and password.</p>
          </div>
          <form className="login-form" onSubmit={handleSignIn} aria-busy={busy} aria-describedby={error ? "login-error" : undefined}>
            <fieldset className="login-fields" disabled={busy}>
              <legend className="sr-only">Campus account credentials</legend>
              <div className="login-field">
                <label htmlFor="login-email">Email address</label>
                <div className="login-input-wrap"><Mail size={18} aria-hidden="true" /><input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} /></div>
              </div>
              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} /><button className="login-password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>
              </div>
              <div className="login-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
              <button className="login-submit" type="submit">{busy ? <><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{checkingSession ? "Checking session…" : "Signing in…"}</> : <>Sign in<ArrowRight size={18} aria-hidden="true" /></>}</button>
            </fieldset>
          </form>
          <p className="login-progress sr-only" role="status" aria-live="polite">{checkingSession ? "Checking your existing session." : signingIn ? "Signing you in. Please wait." : ""}</p>
          {error && <div className="login-error" id="login-error" ref={errorRef} role="alert" tabIndex={-1}><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}
          {localDemoAvailable && <div className="login-demo-access"><strong>Local preview</strong><div><button type="button" onClick={() => router.push("/?demo=reporter")}>Reporter demo</button><button type="button" onClick={() => router.push("/?demo=staff")}>Staff demo</button></div></div>}
          <p className="login-account-note">Need access? Contact your campus administrator.</p>
        </section>
      </main>
    </div>
  );
}
