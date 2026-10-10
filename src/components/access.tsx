"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ChartNoAxesCombined, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase-browser";
import { Dashboard } from "./dashboard";

export function Access() {
  const [step, setStep] = useState<"loading" | "login" | "mfa" | "enroll" | "ready" | "reset">("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [factor, setFactor] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const db = browserDb();

  async function check() {
    if (!db) { setStep("login"); return; }
    const { data } = await db.auth.getSession();
    if (!data.session) { setStep("login"); return; }
    const assurance = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.data?.currentLevel === "aal2") {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (response.ok) { setStep("ready"); return; }
      const result = await response.json(); setMessage(result.error || "Accesso non disponibile");
      await db.auth.signOut(); setStep("login"); return;
    }
    const factors = await db.auth.mfa.listFactors();
    const verified = factors.data?.totp.find(item => item.status === "verified");
    if (verified) { setFactor(verified.id); setStep("mfa"); }
    else setStep("enroll");
  }

  useEffect(() => {
    let recovery = false;
    const subscription = db?.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") { recovery = true; setStep("reset"); }
    });
    const handle = setTimeout(() => { if (!recovery) void check(); }, 100);
    return () => { clearTimeout(handle); subscription?.data.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await operation(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      if (!db) throw new Error("Supabase non configurato. Consulta la guida di installazione.");
      const result = await db.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
      if (result.error) throw new Error("Email o password non valide");
      await check();
    });
  }
  async function enroll() {
    await run(async () => {
      if (!db) return;
      const factors = await db.auth.mfa.listFactors();
      for (const item of factors.data?.all || []) if (item.status === "unverified") await db.auth.mfa.unenroll({ factorId: item.id });
      const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "HelpMe", issuer: "HelpMe" });
      if (error) throw error;
      setFactor(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
    });
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(async () => {
      if (!db) return;
      const result = await db.auth.mfa.challengeAndVerify({ factorId: factor, code: String(form.get("code")) });
      if (result.error) throw new Error("Codice non valido o scaduto");
      setSecret(""); setQr(""); await check();
    });
  }
  if (step === "ready") return <Dashboard />;
  return <main className="access-page">
    <a className="wordmark" href="/"><span className="brand-icon"><ChartNoAxesCombined size={22} /></span>HelpMe<span className="wordmark-dot">.</span></a>
    <div className="access-layout">
      <section className="access-intro"><div className="eyebrow"><span className="status-dot" /> FINANZE PERSONALI</div>
        <h1>I tuoi conti.<br />Il tuo punto<br />di vista.</h1>
        <div className="access-art" aria-hidden="true"><div className="art-rule" /><span className="art-label">ENTRATE / SPESE</span>
          {[38, 62, 46, 79, 52, 90, 65, 82, 54, 74, 59, 96].map((height, index) => <span key={index} style={{ height: `${height}%`, background: index % 2 ? "#19765b" : "#d9a52d" }} />)}
        </div><div className="access-footnote"><ShieldCheck size={18} /> Spazio personale. Accesso protetto.</div>
      </section>
      <section className="access-form">
        <div className="access-symbol"><LockKeyhole size={25} /></div>
        <div className="eyebrow">AREA RISERVATA</div>
        <h2>{step === "mfa" ? "Verifica il tuo accesso" : step === "enroll" ? "Proteggi il tuo account" : step === "reset" ? "Nuova password" : "Bentornato"}</h2>
        {step === "loading" ? <p role="status">Verifica della sessione...</p> : step === "login" ? <>
          <form onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required placeholder="nome@email.it" /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="La tua password" /></label>
            <button className="primary wide" disabled={busy || !db}><span>Accedi</span><ArrowRight size={18} /></button></form>
          <div className="divider"><span>oppure</span></div>
          <button className="secondary wide" disabled={busy || !db} onClick={() => void run(async () => { if (!db) return; const result = await db.auth.signInWithPasskey(); if (result.error) throw result.error; await check(); })}><Fingerprint size={19} /> Accedi con passkey</button>
          <button className="text-button" disabled={busy || !db} onClick={() => void run(async () => { if (!db) return; const input = document.querySelector<HTMLInputElement>('input[name="email"]'); const email = input?.value; if (!email) throw new Error("Inserisci prima la tua email"); const result = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/" }); if (result.error) throw result.error; setMessage("Se l'account esiste, riceverai un'email per il recupero. Il secondo fattore resta necessario."); })}>Password dimenticata?</button>
        </> : step === "reset" ? <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(async () => { if (!db) return; const result = await db.auth.updateUser({ password: String(form.get("password")) }); if (result.error) throw result.error; await check(); }); }}><label>Nuova password<input name="password" type="password" minLength={12} required autoComplete="new-password" /></label><button className="primary wide" disabled={busy}>Aggiorna password</button></form> : <>
          {step === "enroll" && !qr ? <button className="primary wide" disabled={busy} onClick={() => void enroll()}><KeyRound size={18} /> Configura Authenticator</button> : null}
          {qr && <><img className="qr" src={qr} alt="QR per configurare il secondo fattore" /><details><summary>Chiave per inserimento manuale</summary><code className="secret">{secret}</code></details></>}
          {(step === "mfa" || qr) && <form onSubmit={verify}><label>Codice Authenticator<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} required placeholder="000000" /></label><button className="primary wide" disabled={busy}>Verifica e accedi<ArrowRight size={18} /></button></form>}
          <button className="text-button" onClick={() => void run(async () => { await db?.auth.signOut(); setStep("login"); setQr(""); setSecret(""); })}>Torna all&apos;accesso</button>
        </>}
        {message && <p className="notice error" role="alert">{message}</p>}
        {!db && <p className="notice">Servizi non configurati. Nessun conto reale collegato.</p>}
        <a className="demo-link" href="/demo">Apri anteprima con dati fittizi <ArrowRight size={15} /></a>
      </section>
    </div><footer className="access-footer">HelpMe / Il tuo spazio finanziario personale <span><LockKeyhole size={13} /> Accesso riservato</span></footer>
  </main>;
}