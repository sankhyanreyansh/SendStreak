import React from "react";
import { SendStreakLogo } from "./SendStreakLogo";
import { motion } from "motion/react";

interface SleekLoginProps {
  onLogin: () => void;
}

export default function SleekLogin({ onLogin }: SleekLoginProps) {
  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-between p-6 md:p-10 font-sans select-none overflow-hidden">
      
      {/* Background Decor */}
      <div 
        className="pointer-events-none fixed inset-0 z-0 bg-no-repeat opacity-80"
        style={{
          backgroundImage: `
            radial-gradient(circle at 10% 10%, rgba(249, 115, 22, 0.08), transparent 24rem),
            radial-gradient(circle at 90% 90%, rgba(148, 163, 184, 0.1), transparent 24rem)
          `
        }}
      />

      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <SendStreakLogo className="w-8 h-8" />
          <span className="font-display text-base font-bold text-slate-800">SendStreak</span>
        </div>
      </header>

      {/* Main Card Container */}
      <main className="relative z-10 my-auto flex items-center justify-center py-10">
        <motion.div 
          initial={{ opacity: 0, y: 15, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-md w-full bg-white rounded-3xl border border-slate-100 p-8 md:p-10 shadow-xl shadow-slate-100/50 flex flex-col"
          id="sleek_login_card"
        >
          {/* Logo Section */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <SendStreakLogo className="w-12 h-12" />
              <span className="font-display text-2xl font-extrabold tracking-tight text-slate-800">
                Send<span className="text-orange-500">Streak</span>
              </span>
            </div>
            <h1 className="font-display text-xl font-extrabold text-slate-800 tracking-tight mb-2">
              Sign In to Your Workspace
            </h1>
            <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto leading-relaxed">
              Log in to manage your prospects, compile AI outreach drafts, and track your daily email streak.
            </p>
          </div>

          {/* Social Sign-In Button */}
          <button
            id="google_signin_btn"
            onClick={onLogin}
            className="w-full relative group min-h-12 flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20 transition-all cursor-pointer text-xs font-extrabold uppercase tracking-wider text-center"
          >
            {/* Google Vector Icon */}
            <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 24 24">
              <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.513 0-6.386-2.873-6.386-6.386s2.873-6.386 6.386-6.386c1.616 0 3.078.61 4.22 1.625l3.197-3.196C19.314 2.26 15.965 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.48 0 10.748-4.514 10.748-10.954 0-.648-.065-1.2-.185-1.741H12.24z"/>
            </svg>
            <span>Continue with Google</span>
          </button>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto flex justify-between items-center pt-6 border-t border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <div>
          <span>© {new Date().getFullYear()} SendStreak. Open Source Edition.</span>
        </div>
      </footer>

    </div>
  );
}
