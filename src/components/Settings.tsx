import React, { useState } from "react";
import { AlertTriangle, Clock, Paperclip, Lock, FileText, UploadCloud, Trash2 } from "lucide-react";
import { UserProfile } from "../types";

interface SettingsProps {
  followUpDelayDays: number;
  onUpdateDelayDays: (days: number) => void;
  onResetAllData: () => void;
  userProfile: UserProfile | null;
  isPro: boolean;
  onUpdateUserProfile: (fields: Partial<UserProfile>) => void;
}

export default function Settings({
  followUpDelayDays,
  onUpdateDelayDays,
  onResetAllData,
  userProfile,
  isPro,
  onUpdateUserProfile,
}: SettingsProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [localDelay, setLocalDelay] = useState<number | "">(followUpDelayDays);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = () => {
    if (localDelay === "") return;
    const delayVal = Number(localDelay);
    if (delayVal < 1 || delayVal > 30) {
      setError("Please choose a delay between 1 and 30 days.");
      return;
    }
    setError("");
    onUpdateDelayDays(delayVal);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans animate-fade-in" id="settings_panel">
      {/* Page Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-800">Settings</h2>
        <p className="text-slate-500 text-xs mt-0.5">Manage your system credentials and application state</p>
      </div>

      {/* Resume Attachment Preferences Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xs" id="settings_resume_card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
              <Paperclip className="w-5 h-5 text-indigo-500" /> Resume Attachment
            </h3>
            <p className="text-slate-500 text-xs leading-relaxed max-w-2xl">
              Automatically attach your PDF resume to the bottom of first outbound outreach drafts (excludes follow-ups and replies).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 pt-1">
            {!isPro && (
              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                <Lock className="w-3 h-3" /> PRO
              </span>
            )}
            <button
              id="toggle_resume_attach"
              onClick={() => {
                if (!isPro) return;
                onUpdateUserProfile({ attachResume: !userProfile?.attachResume });
              }}
              disabled={!isPro}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isPro && userProfile?.attachResume ? "bg-indigo-600" : "bg-slate-200"
              } ${!isPro ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  isPro && userProfile?.attachResume ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5">
          {userProfile?.resumeName ? (
            <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-700 block truncate">
                  {userProfile.resumeName}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Uploaded in your Student Profile
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-2.5">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
              <span>
                No resume file uploaded yet. Please upload a PDF resume in your{" "}
                <span className="font-bold text-indigo-600">Student Profile</span> if you want to automatically attach it to drafts.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Follow-Up Preferences Card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xs" id="settings_followup_card">
        <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-500" /> Follow-Up Preferences
        </h3>
        <p className="text-slate-500 text-xs mt-1">Configure when you want to be reminded to bump your outreach threads.</p>

        <div className="mt-5 border-t border-slate-100 pt-5 space-y-4">
          <div>
            <label htmlFor="followup_delay_input" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Remind me to follow up after (days)
            </label>
            <div className="flex gap-3 max-w-sm">
              <input
                id="followup_delay_input"
                type="number"
                min={1}
                max={30}
                value={localDelay}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setLocalDelay(isNaN(val) ? "" : val);
                  setError("");
                  setSaved(false);
                }}
                className="w-24 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 font-medium"
              />
              <button
                id="save_delay_btn"
                onClick={handleSave}
                disabled={localDelay === ""}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white font-bold px-5 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1 shadow-sm shadow-orange-100"
              >
                {saved ? "Saved!" : "Save Changes"}
              </button>
            </div>
            {error && <p className="text-red-500 text-[11px] font-semibold mt-1">{error}</p>}
            {saved && <p className="text-emerald-600 text-[11px] font-semibold mt-1">✓ Your follow-up pipeline will now use a {localDelay}-day delay going forward!</p>}
          </div>
        </div>
      </div>

      {/* Danger Zone Card */}
      <div className="bg-red-50/50 rounded-3xl border border-red-100 p-6 md:p-8" id="settings_danger_card">
        <h3 className="font-display text-lg font-bold text-red-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" /> Danger Zone
        </h3>
        <p className="text-red-700/80 text-xs mt-1">Actions in this section are permanent and irreversible.</p>

        <div className="mt-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-red-100 pt-5">
          <div>
            <h4 className="text-sm font-bold text-slate-850">Reset All App Data</h4>
            <p className="text-slate-500 text-xs mt-0.5 max-w-sm">
              Erase your profile bio, achievements brag sheet, prospects backlog, saved drafts, daily streaks, and unlocked badges.
            </p>
          </div>

          {showResetConfirm ? (
            <div className="flex gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                id="cancel_reset_btn"
                onClick={() => setShowResetConfirm(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2 px-3.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm_reset_btn"
                onClick={onResetAllData}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-3.5 rounded-lg transition-all cursor-pointer shadow-sm shadow-red-200"
              >
                Yes, Clear All Data
              </button>
            </div>
          ) : (
            <button
              id="trigger_reset_btn"
              onClick={() => setShowResetConfirm(true)}
              className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer shadow-xs shrink-0 w-full sm:w-auto"
            >
              Reset Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
