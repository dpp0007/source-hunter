"use client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Logo from "./Logo";

const steps = [
  { host: "dailyfeed.example", tag: "Repeated", text: "“73% of workers are burned out.”", tone: "bg-line" },
  { host: "bizweekly.example", tag: "Rounded", text: "“Roughly three quarters report burnout.”", tone: "bg-hi" },
  { host: "institute.example/report", tag: "Original", text: "“68% reported burnout in 2021.”", tone: "bg-[#c9f0d6]" },
];
const ease = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  const [run, setRun] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setRun((r) => r + 1), 9000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="mx-auto max-w-5xl px-5 pb-10 pt-16 sm:pt-24">
      <motion.p
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-white/60 px-3 py-1 text-sm text-mute"
      >
        <Logo size={18} /> Source Hunter · built on TinyFish Search, Fetch, TinyResearch and Agent
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.05 }}
        className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl"
      >
        Click once.<br />Find where it <span className="bg-linear-to-t from-hi from-45% to-transparent to-45%">began</span>.
      </motion.h1>
      <p className="mt-5 max-w-xl text-lg text-mute">
        Highlight a number, claim or quote on any page. Source Hunter follows the citations upstream, shows every step with the exact wording, and flags where it changed.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="#trace" className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:-translate-y-0.5">Trace a claim</a>
        <a href="#extension" className="rounded-full border border-line px-5 py-3 text-sm font-medium transition hover:bg-white">Get the extension</a>
      </div>

      <div key={run} className="relative mt-12 rounded-3xl border border-line bg-white p-5 shadow-[0_20px_60px_-30px_rgba(60,40,0,.35)] sm:p-8" aria-hidden>
        <p className="max-w-2xl text-xl leading-relaxed sm:text-2xl">
          “Employers should worry:{" "}
          <span className="relative inline-block">
            <motion.span
              className="absolute inset-0 origin-left rounded bg-hi" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ delay: 0.8, duration: 0.7, ease }}
            />
            <span className="relative">73% of workers are burned out</span>
          </span>
          , according to a recent report.”
        </p>
        <motion.div
          className="pointer-events-none absolute z-10" initial={{ left: "88%", top: "85%", opacity: 0 }}
          animate={{ left: ["88%", "8%", "52%"], top: ["85%", "42%", "42%"], opacity: [0, 1, 1] }}
          transition={{ duration: 2.2, times: [0, 0.55, 1], ease: "easeInOut", delay: 0.2 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#2f5bff" stroke="#fff" strokeWidth="1.5" /></svg>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.3 }}
            className="-mt-1 ml-4 block w-max rounded-full bg-blue px-3 py-1 text-xs font-medium text-white"
          >Trace it</motion.span>
        </motion.div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.host} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.9 + i * 0.45, duration: 0.5, ease }} className="rounded-2xl border border-line p-4"
            >
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{i === 2 ? "★ " : `${i + 1}. `}{s.tag}</span>
              <p className="mt-2 text-sm">{s.text}</p>
              <p className="mt-2 text-xs text-mute">{s.host}</p>
            </motion.div>
          ))}
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.8 }} className="mt-4 text-sm font-medium text-warn">
          ⚠ Changed: 68% became 73%, then “roughly three quarters”. (Illustrative example)
        </motion.p>
      </div>
    </section>
  );
}
