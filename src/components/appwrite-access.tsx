"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ChartNoAxesCombined, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { authRequest, signInWithPasskey } from "@/lib/auth-client";
import { Dashboard } from "./dashboard";

type Step = "loading" | "login" | "register" | "reset" | "confirm" | "mfa" | "enroll" | "ready";
export function Access() {
  const [step, setStep] = useState<Step>("loading");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  async function check() {
    const response = await fetch("/api/auth", { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setConfigured(data.configured); setStep(data.step);
  }
  useEffect(() => {
    const params = new URL(location.href).searchParams;
    if (params.get("recovery") === "1" && params.get("userId") && params.get("secret")) { setConfigured(true); setStep("reset"); }
    else void check().catch(error => { setStep("login"); setMessage(error.message); });
  }, []);
  async function run(operation: () => Promise<void>) {
    setBusy(true); setMessage(""); try { await operation(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(async () => {
      if (step === "login") { await authRequest("login", { email, password: form.get("password") }); await check(); }
      if (step === "register") {
        if (form.get("password") !== form.get("confirmation")) throw new Error("Le password non coincidono");
        const response = await fetch("/api/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: form.get("password") }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        if (data.created) { setStep("confirm"); setConfigured(true); }
        setMessage(data.message);
      }
      if (step === "reset") {
        if (form.get("password") !== form.get("confirmation")) throw new Error("Le password non coincidono");
        const params = new URL(location.href).searchParams;
        await authRequest("reset", { userId: params.get("userId"), secret: params.get("secret"), password: form.get("password") });
        history.replaceState(null, "", location.pathname); setStep("login"); setMessage("Password aggiornata. Accedi con il secondo fattore.");
      }
      if (step === "enroll") {
        await authRequest("verifyEnrollment", { code: form.get("code") });
        setQr(""); setSecret(""); await check();
      }
      if (step === "mfa") {
        const challenge = await authRequest("challenge");
        await authRequest("verify", { challengeId: challenge.challengeId, code: form.get("code") }); await check();
      }
    });
  }
  const titles: Record<Step, string> = { loading: "Bentornato", login: "Bentornato", register: "Crea il tuo account", reset: "Nuova password", confirm: "Conferma la tua email", mfa: "Verifica il tuo accesso", enroll: "Proteggi il tuo account", ready: "" };
  if (step === "ready") return <Dashboard />;
  return <main className="access-page"><a className="wordmark" href="/"><span className="brand-icon"><ChartNoAxesCombined size={22} /></span>HelpMe<span className="wordmark-dot">.</span></a>
    <div className="access-layout"><section className="access-intro"><div className="eyebrow"><span className="status-dot" /> FINANZE PERSONALI</div><h1>I tuoi conti.<br />Il tuo punto<br />di vista.</h1><div className="access-art" aria-hidden="true"><div className="art-rule" /><span className="art-label">ENTRATE / SPESE</span>{[38,62,46,79,52,90,65,82,54,74,59,96].map((height,index) => <span key={index} style={{ height: `${height}%`, background: index % 2 ? "#19765b" : "#d9a52d" }} />)}</div><div className="access-footnote"><ShieldCheck size={18} />Spazio personale. Accesso protetto.</div></section>
      <section className="access-form"><div className="access-symbol"><LockKeyhole size={25} /></div><div className="eyebrow">AREA RISERVATA</div><h2>{titles[step]}</h2>
        {step === "loading" ? <p role="status">Verifica della sessione...</p> : null}
        {["login","register","reset"].includes(step) && <form onSubmit={submit}>
          {step !== "reset" && <label>Email<input name="email" type="email" autoComplete="username" required placeholder="nome@email.it" value={email} onChange={event => setEmail(event.target.value)} /></label>}
          <label>{step === "reset" ? "Nuova password" : "Password"}<input name="password" type="password" autoComplete={step === "login" ? "current-password" : "new-password"} required minLength={step === "login" ? 1 : 12} maxLength={256} /></label>
          {step !== "login" && <label>Conferma password<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>}
          <button className="primary wide" disabled={busy || (!configured && step === "login")}><span>{step === "login" ? "Accedi" : step === "register" ? "Crea account" : "Aggiorna password"}</span><ArrowRight size={18} /></button>
        </form>}
        {step === "login" && <><div className="divider"><span>oppure</span></div><button className="secondary wide" disabled={busy || !configured} onClick={() => void run(async () => { await signInWithPasskey(); await check(); })}><Fingerprint size={19} />Accedi con passkey</button><button className="text-button" disabled={busy || !configured} onClick={() => void run(async () => { if (!email) throw new Error("Inserisci prima la tua email"); const result = await authRequest("recover", { email }); setMessage(result.message); })}>Password dimenticata?</button><button className="text-button" disabled={busy} onClick={() => { setMessage(""); setStep("register"); }}>Crea account personale</button></>}
        {step === "register" && <><p className="muted-text">Crea il tuo account personale. Conferma email e Authenticator prima dell&apos;accesso ai dati.</p><button className="text-button" onClick={() => { setMessage(""); setStep("login"); }}>Torna al login</button></>}
        {step === "confirm" && <><p className="muted-text">Apri il link di conferma ricevuto via email.</p><button className="primary wide" disabled={busy} onClick={() => void run(async () => { const result = await authRequest("verification"); setMessage(result.message); })}>Reinvia conferma</button><button className="text-button" disabled={busy} onClick={() => void run(check)}>Ho confermato l&apos;email</button></>}
        {step === "enroll" && !qr && <button className="primary wide" disabled={busy} onClick={() => void run(async () => { const data = await authRequest("enroll"); setQr(data.qr); setSecret(data.secret); })}><KeyRound size={18} />Configura Authenticator</button>}
        {qr && <><img className="qr" src={qr} alt="QR per configurare il secondo fattore" /><details><summary>Chiave per inserimento manuale</summary><code className="secret">{secret}</code></details></>}
        {(step === "mfa" || (step === "enroll" && qr)) && <form onSubmit={submit}><label>Codice Authenticator<input name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} pattern="[0-9]{6}" /></label><button className="primary wide" disabled={busy}>Verifica e accedi<ArrowRight size={18} /></button></form>}
        {["confirm","mfa","enroll"].includes(step) && <button className="text-button" disabled={busy} onClick={() => void run(async () => { await authRequest("logout"); setQr(""); setSecret(""); setStep("login"); })}>Torna all&apos;accesso</button>}
        {message && <p className="notice" role="status">{message}</p>}{!configured && step !== "loading" && <p className="notice">Appwrite non configurato. Nessun conto reale collegato.</p>}
        <a className="demo-link" href="/demo">Apri anteprima con dati fittizi<ArrowRight size={15} /></a>
      </section></div><footer className="access-footer">HelpMe / Il tuo spazio finanziario personale<span><LockKeyhole size={13} />Accesso riservato</span></footer>
  </main>;
}