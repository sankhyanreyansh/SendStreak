import React, { useState } from "react";
import { motion } from "motion/react";
import { GraduationCap, Award, Sparkles, Flame, ArrowRight } from "lucide-react";
import { UserProfile } from "../types";
import { SendStreakLogo } from "./SendStreakLogo";

interface OnboardingProps {
  onComplete: (profile: UserProfile, dailyQuota: number) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [school, setSchool] = useState("");
  const [major, setMajor] = useState("");
  const [gradYear, setGradYear] = useState("2027");
  const [bio, setBio] = useState("");
  const [ach1, setAch1] = useState("");
  const [ach2, setAch2] = useState("");
  const [ach3, setAch3] = useState("");
  const [dailyQuota, setDailyQuota] = useState(3);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");

  const handleNextStep = () => {
    if (step === 1) {
      if (!school.trim() || !major.trim() || !gradYear.trim() || !bio.trim()) {
        setError("Please fill in all profile fields so the AI can craft the perfect pitch!");
        return;
      }
      setError("");
      setStep(2);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const achievements = [ach1, ach2, ach3].map(a => a.trim()).filter(Boolean);
    if (achievements.length === 0) {
      setError("Please add at least one proud achievement to introduce yourself!");
      return;
    }

    const profile: UserProfile = {
      school: school.trim(),
      major: major.trim(),
      gradYear: gradYear.trim(),
      bio: bio.trim(),
      achievements
    };

    onComplete(profile, dailyQuota);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 md:p-8 font-sans" id="onboarding_container">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden relative">
        {/* Top Decorative Banner */}
        <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-400 h-3 w-full" />
        
        <div className="p-8 md:p-12">
          {/* Logo / Header */}
          <div className="flex items-center gap-3 mb-8 justify-center">
            <SendStreakLogo className="w-12 h-12" />
            <span className="font-display text-2xl font-bold tracking-tight text-slate-800">
              Send<span className="text-orange-500">Streak</span>
            </span>
          </div>

          <div className="mb-6 flex justify-between items-center bg-slate-50 px-4 py-2 rounded-xl text-xs font-medium text-slate-500">
            <span>Step {step} of 2</span>
            <div className="w-32 bg-slate-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-orange-500 h-full transition-all duration-300"
                style={{ width: `${step * 50}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded-r-xl" id="onboarding_error">
              {error}
            </div>
          )}

          {step === 1 ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl font-extrabold text-slate-800 tracking-tight">
                   Welcome to SendStreak!
                </h1>
                <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">
                  Let's set up your student profile. Our AI will use this to write genuine, high-converting cold outreach.
                </p>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">School / University</label>
                    <div className="relative">
                      <GraduationCap className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                      <input
                        id="onboarding_school"
                        type="text"
                        placeholder="e.g. Stanford University"
                        value={school}
                        onChange={(e) => setSchool(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Major / Field of Study</label>
                    <input
                      id="onboarding_major"
                      type="text"
                      placeholder="e.g. Computer Science"
                      value={major}
                      onChange={(e) => setMajor(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Grad Year</label>
                    <select
                      id="onboarding_gradyear"
                      value={gradYear}
                      onChange={(e) => setGradYear(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                    >
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                      <option value="2028">2028</option>
                      <option value="2029">2029</option>
                      <option value="2030">2030</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Daily Send Quota</label>
                    <div className="flex items-center gap-3">
                      <input
                        id="onboarding_quota_range"
                        type="range"
                        min="1"
                        max="10"
                        value={dailyQuota}
                        onChange={(e) => setDailyQuota(Number(e.target.value))}
                        className="w-full accent-orange-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="font-display font-bold text-lg text-slate-700 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100 min-w-[50px] text-center">
                        {dailyQuota}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Short Bio / Career Goals</label>
                  <textarea
                    id="onboarding_bio"
                    rows={3}
                    placeholder="e.g. Aspiring software engineer interested in machine learning and scalable web systems. Passionate about building products that solve real-world problems."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all resize-none"
                  />
                  <p className="text-slate-400 text-[11px] mt-1">Briefly tell the recipient what your aspirations are.</p>
                </div>

                <div className="pt-4">
                  <button
                    id="onboarding_next_btn"
                    type="button"
                    onClick={handleNextStep}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-6 rounded-2xl shadow-lg shadow-slate-100 flex items-center justify-center gap-2 transition-all cursor-pointer group"
                  >
                    <span>Next: Add Your Achievements</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="font-display text-3xl font-extrabold text-slate-800 tracking-tight flex items-center justify-center gap-2">
                  Highlight Your Brag Sheet! <Award className="w-7 h-7 text-amber-500" />
                </h1>
                <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">
                  Add 2 to 3 accomplishments (projects, GPA, past internships, leadership) that our AI can drop in naturally.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Proud Achievement #1</label>
                  <div className="relative">
                    <Sparkles className="absolute left-3.5 top-3 w-5 h-5 text-amber-500" />
                    <input
                      id="onboarding_ach1"
                      type="text"
                      placeholder="e.g. Built a microservices app used by 500+ student organizations"
                      value={ach1}
                      onChange={(e) => setAch1(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Proud Achievement #2</label>
                  <input
                    id="onboarding_ach2"
                    type="text"
                    placeholder="e.g. Secured 1st place at the university hackathon out of 80 teams"
                    value={ach2}
                    onChange={(e) => setAch2(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Proud Achievement #3 (Optional)</label>
                  <input
                    id="onboarding_ach3"
                    type="text"
                    placeholder="e.g. Maintained 3.9 GPA while serving as VP of Computer Science Club"
                    value={ach3}
                    onChange={(e) => setAch3(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    id="onboarding_back_btn"
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-6 rounded-2xl transition-all cursor-pointer text-center text-sm"
                  >
                    Back
                  </button>
                  <button
                    id="onboarding_submit_btn"
                    type="submit"
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold py-3 px-6 rounded-2xl shadow-lg shadow-orange-100 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
                  >
                    <span>Launch SendStreak!</span>
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
