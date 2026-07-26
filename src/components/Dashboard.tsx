import React, { useState } from "react";
import { motion } from "motion/react";
import { Flame, Trophy, Award, Mail, Reply, Calendar, ChevronRight, CheckCircle2, TrendingUp, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { Contact, StreakData, Badge } from "../types";
import { getLocalDateString } from "../utils";

interface DashboardProps {
  contacts: Contact[];
  streak: StreakData;
  badges: Badge[];
  onNavigate: (tab: string) => void;
  onCheckReplies: () => Promise<{ success: boolean; count: number; error?: string }>;
  gmailUser: any;
}

export default function Dashboard({ contacts, streak, badges, onNavigate, onCheckReplies, gmailUser }: DashboardProps) {
  const [checkStatus, setCheckStatus] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [repliesFound, setRepliesFound] = useState(0);

  const handleCheck = async () => {
    setCheckStatus("checking");
    try {
      const res = await onCheckReplies();
      if (res && res.success) {
        setRepliesFound(res.count);
        setCheckStatus("success");
        setTimeout(() => setCheckStatus("idle"), 5000);
      } else {
        setCheckStatus("error");
        setTimeout(() => setCheckStatus("idle"), 5000);
      }
    } catch (e) {
      setCheckStatus("error");
      setTimeout(() => setCheckStatus("idle"), 5000);
    }
  };
  const today = getLocalDateString();
  
  // Calculate stats
  const totalSent = streak.totalEmailsSent;
  const totalReplies = contacts.filter(c => c.status === "replied" || c.status === "call_booked").length;
  const totalCallsBooked = contacts.filter(c => c.status === "call_booked").length;
  
  const replyRate = totalSent > 0 
    ? Math.round((totalReplies / totalSent) * 100) 
    : 0;

  // Follow-ups due today or earlier
  const followUpsDue = contacts.filter(c => 
    c.status === "sent" && 
    c.followUpDueDate && 
    c.followUpDueDate <= today
  );

  // Quota percentage
  const quotaPercent = Math.min(Math.round((streak.sentToday / streak.dailyQuota) * 100), 100);
  const isQuotaMet = streak.sentToday >= streak.dailyQuota;

  // Badges counts
  const unlockedBadgesCount = badges.filter(b => b.unlocked).length;

  return (
    <div className="space-y-6 md:space-y-8 font-sans" id="dashboard_panel">
      {/* Upper Grid: Streak Flame and Quota Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Streak Flame Card */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center relative overflow-hidden" id="streak_card">
          {isQuotaMet ? (
            <div className="absolute inset-0 bg-gradient-to-b from-orange-50/20 to-transparent pointer-events-none" />
          ) : null}
          
          {/* Flame Icon with Interactive State */}
          <div className="relative mb-4">
            {isQuotaMet ? (
              <>
                <div className="absolute -inset-2 bg-orange-500 rounded-full blur-xl opacity-30 animate-ring-glow" />
                <div className="absolute -inset-1 bg-amber-400 rounded-full blur-lg opacity-40 animate-pulse" />
              </>
            ) : null}
            
            <div className={`w-24 h-24 rounded-full flex items-center justify-center relative z-10 transition-all ${
              isQuotaMet 
                ? "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-xl shadow-orange-200 animate-bounce-slow" 
                : "bg-slate-100 text-slate-400 border-2 border-slate-200/50"
            }`}>
              <Flame className={`w-12 h-12 ${isQuotaMet ? "fill-white" : ""}`} />
            </div>
          </div>

          <span className="font-display text-5xl font-extrabold text-slate-800 tracking-tight">
            {streak.currentStreak}
          </span>
          <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider mt-1">
            Day Streak
          </span>

          <p className="text-xs text-slate-400 mt-3 max-w-[240px]">
            {isQuotaMet 
              ? "Daily quota locked in! Your streak is secure for today." 
              : `Send ${streak.dailyQuota - streak.sentToday} more email${streak.dailyQuota - streak.sentToday > 1 ? 's' : ''} today to grow your streak!`
            }
          </p>
        </div>

        {/* Daily Quota Progress Card */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between" id="quota_card">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-800">Daily Quota Tracker</h2>
                <p className="text-slate-500 text-xs mt-0.5">Build consistency one day at a time</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                isQuotaMet ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-orange-50 text-orange-700 border border-orange-100"
              }`}>
                {isQuotaMet ? "Goal Met" : "In Progress"}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-50 text-orange-600 p-2 rounded-xl">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent Today</div>
                  <div className="font-display text-lg font-bold text-slate-800">
                    {streak.sentToday} <span className="text-slate-400 font-normal text-sm">/ {streak.dailyQuota} emails</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="font-display font-extrabold text-2xl text-orange-500">{quotaPercent}%</span>
              </div>
            </div>

            {/* Custom progress bar */}
            <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden relative mb-4">
              <motion.div 
                className="bg-gradient-to-r from-orange-500 to-amber-500 h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${quotaPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Longest streak: <strong>{streak.longestStreak} days</strong></span>
            <button 
              id="dash_outreach_btn"
              onClick={() => onNavigate("contacts")} 
              className="text-orange-500 font-bold hover:text-orange-600 flex items-center gap-0.5 cursor-pointer"
            >
              Start personalizing <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Quick Glance Active Tasks Center */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="active_tasks_center">
        <h2 className="font-display text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
          Outreach Action Center
        </h2>
        <p className="text-slate-500 text-xs mb-5">Your pending actions to advance your professional conversation pipelines.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Drafts to Write */}
          <div 
            onClick={() => onNavigate("draft")}
            className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 hover:bg-orange-50/20 hover:border-orange-200 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Prospects to Draft</div>
              <div className="font-display text-3xl font-extrabold text-slate-800 mt-1.5">
                {contacts.filter(c => c.status === "not_sent").length}
              </div>
            </div>
            <div className="text-orange-600 font-bold text-xs mt-4 flex items-center gap-1 group-hover:text-orange-700">
              Write first drafts <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* Follow-Ups Due */}
          <div 
            onClick={() => onNavigate("followup")}
            className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 hover:bg-blue-50/20 hover:border-blue-200 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow-Ups Due</div>
              <div className="font-display text-3xl font-extrabold text-slate-800 mt-1.5">
                {contacts.filter(c => c.status === "sent" && c.followUpDueDate && c.followUpDueDate <= today).length}
              </div>
            </div>
            <div className="text-blue-600 font-bold text-xs mt-4 flex items-center gap-1 group-hover:text-blue-700">
              Send gentle follow-ups <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* New Replies to Handle */}
          <div 
            onClick={() => onNavigate("replies")}
            className="border border-slate-100 rounded-2xl p-4 bg-slate-50/30 hover:bg-emerald-50/20 hover:border-emerald-200 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Replies to Handle</div>
              <div className="font-display text-3xl font-extrabold text-slate-800 mt-1.5">
                {contacts.filter(c => c.status === "replied").length}
              </div>
            </div>
            <div className="text-emerald-600 font-bold text-xs mt-4 flex items-center gap-1 group-hover:text-emerald-700">
              Draft responses & outcomes <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Counter & Follow-Up Alert Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="stats_counters">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Total Sent</div>
            <div className="font-display text-xl font-bold text-slate-800">{totalSent}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]" id="dash_replies_card">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl">
              <Reply className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Total Replies</div>
              <div className="font-display text-xl font-bold text-slate-800">{totalReplies}</div>
            </div>
          </div>

          <div className="mt-3">
            {gmailUser ? (
              <button
                id="dash_check_replies_btn"
                onClick={handleCheck}
                disabled={checkStatus === "checking"}
                className="w-full bg-emerald-50 hover:bg-emerald-100 disabled:bg-slate-50 text-emerald-700 disabled:text-slate-400 text-[10px] font-bold py-1.5 px-2.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                {checkStatus === "checking" ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" /> Checking Gmail...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" /> Check for Replies
                  </>
                )}
              </button>
            ) : (
              <button
                id="dash_connect_prompt_btn"
                onClick={() => onNavigate("settings")}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-semibold py-1.5 px-2 rounded-xl text-center cursor-pointer transition-colors"
              >
                Connect Gmail to Track Replies
              </button>
            )}

            {checkStatus === "success" && (
              <div className="text-[10px] text-emerald-600 font-bold mt-1.5 flex items-center gap-1 justify-center animate-pulse">
                <CheckCircle className="w-3 h-3 shrink-0" />
                {repliesFound > 0 ? `Found ${repliesFound} new replies!` : "No new replies yet!"}
              </div>
            )}

            {checkStatus === "error" && (
              <div className="text-[10px] text-red-500 font-semibold mt-1.5 flex items-center gap-1 justify-center">
                <AlertCircle className="w-3 h-3 shrink-0" />
                Error. Reconnect in Settings.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-purple-50 text-purple-600 p-3 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Calls Booked</div>
            <div className="font-display text-xl font-bold text-slate-800">{totalCallsBooked}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Response Rate</div>
            <div className="font-display text-xl font-bold text-slate-800">{replyRate}%</div>
          </div>
        </div>
      </div>

      {/* Follow-up Callout Banner */}
      {followUpsDue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm" id="followups_alert_banner">
          <div className="flex gap-3">
            <div className="bg-amber-100 text-amber-700 p-2 rounded-xl shrink-0 mt-1 md:mt-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-amber-900 text-sm md:text-base">
                {followUpsDue.length} Follow-Up{followUpsDue.length > 1 ? 's' : ''} Due Today!
              </h3>
              <p className="text-amber-700 text-xs mt-0.5 max-w-xl">
                Professionals appreciate persistence. Send a gentle bump to stay top-of-mind. These don't counts towards quota, but they are crucial for response rate!
              </p>
            </div>
          </div>
          <button
            id="dash_followup_btn"
            onClick={() => onNavigate("followup")}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm cursor-pointer shrink-0 transition-colors"
          >
            Go to Follow-Ups ({followUpsDue.length})
          </button>
        </div>
      )}

      {/* Badges Shelf */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="badge_shelf">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-800 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Badge Shelf
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">Gamify your career search milestones</p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
            Unlocked: {unlockedBadgesCount} / {badges.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <div 
              key={badge.id}
              className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
                badge.unlocked 
                  ? "bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-100/80 shadow-xs" 
                  : "bg-slate-50/50 border-slate-100 opacity-60"
              }`}
            >
              <div className={`p-2.5 rounded-xl shrink-0 ${
                badge.unlocked 
                  ? "bg-gradient-to-br from-amber-500 to-orange-400 text-white shadow-md shadow-orange-100" 
                  : "bg-slate-200 text-slate-400"
              }`}>
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className={`text-sm font-bold truncate ${badge.unlocked ? "text-slate-800" : "text-slate-500"}`}>
                    {badge.name}
                  </h4>
                  {badge.unlocked && (
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {badge.description}
                </p>
                {badge.unlocked && badge.unlockedDate && (
                  <span className="text-[10px] text-amber-600 font-medium block mt-1.5">
                    Unlocked on {badge.unlockedDate}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
