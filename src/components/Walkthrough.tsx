import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Users, ArrowRight, X, ChevronRight, Check, Play, BookOpen } from "lucide-react";

interface WalkthroughProps {
  onClose: () => void;
  onNavigate: (tab: string) => void;
  activeTab: string;
}

export default function Walkthrough({ onClose, onNavigate, activeTab }: WalkthroughProps) {
  const [step, setStep] = useState(1);

  const steps = [
    {
      title: "Welcome to SendStreak",
      description: "Let's build consistent, high-impact outreach habits. In less than 2 minutes, you'll learn how to leverage AI to automate your networking and maintain daily momentum.",
      buttonText: "Let's Start!",
      icon: <img src="/logo.png" alt="SendStreak Logo" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />,
      action: () => {
        onNavigate("dashboard");
      }
    },
    {
      title: "Step 1: Your Prospects",
      description: "This is where you organize contacts. Simply add details or use our Pro CSV Bulk Import. Give the AI brief context, and the Assistant handles the draft.",
      buttonText: "Show Prospects Tab",
      icon: <Users className="w-6 h-6 text-orange-500" />,
      action: () => {
        onNavigate("contacts");
      }
    },
    {
      title: "Step 2: Generate AI Drafts",
      description: "Once prospects are added, choose them in the Drafts tab. SendStreak immediately drafts personalized introductory emails pulling from your achievements.",
      buttonText: "Show Drafts Tab",
      icon: <Sparkles className="w-6 h-6 text-orange-500" />,
      action: () => {
        onNavigate("draft");
      }
    },
    {
      title: "Step 3: Keep Your Streak Hot",
      description: "Every outreach email you send helps secure your streak for the day. Meet your daily quota to level up and unlock exclusive achievements.",
      buttonText: "Finish & Start!",
      icon: <img src="/logo.png" alt="SendStreak Logo" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />,
      action: () => {
        onNavigate("dashboard");
      }
    }
  ];

  const currentStepData = steps[step - 1];

  const handleNext = () => {
    if (currentStepData.action) {
      currentStepData.action();
    }
    if (step < steps.length) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  const handleSkip = () => {
    onNavigate("dashboard");
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[110] w-[calc(100vw-32px)] sm:w-[360px] pointer-events-none font-sans" id="walkthrough_overlay">
        {/* Main Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="bg-white rounded-2xl border border-slate-100 shadow-2xl relative overflow-hidden flex flex-col pointer-events-auto"
          id="walkthrough_card"
        >
          {/* Progress Indicator Accent Top Bar */}
          <div className="h-1 bg-slate-100 w-full relative">
            <motion.div 
              className="h-full bg-orange-500"
              initial={{ width: "0%" }}
              animate={{ width: `${(step / steps.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>

          <div className="p-5 md:p-6 flex-1">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-extrabold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Walkthrough • Step {step} of {steps.length}
              </span>
              <button 
                id="walkthrough_close_btn"
                onClick={handleSkip}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-full transition-all cursor-pointer"
                title="Skip Tutorial"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Icon, Title & Description (Compact Row/Block) */}
            <div className="flex gap-4 items-start my-2">
              <motion.div 
                key={step}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-12 h-12 bg-orange-50/50 border border-orange-100 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
              >
                {currentStepData.icon}
              </motion.div>

              <div className="space-y-1 flex-1">
                <h3 className="font-display text-sm font-bold text-slate-800 tracking-tight">
                  {currentStepData.title}
                </h3>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  {currentStepData.description}
                </p>
              </div>
            </div>

            {/* Highlighted Helper Overlay Context */}
            {step === 2 && activeTab === "contacts" && (
              <div className="mt-3 p-2 bg-orange-50/60 border border-orange-100 rounded-xl flex items-center gap-2.5 text-[10px] text-slate-700 font-semibold shadow-xs">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
                <span>Switched to Prospects view!</span>
              </div>
            )}

            {step === 3 && activeTab === "draft" && (
              <div className="mt-3 p-2 bg-orange-50/60 border border-orange-100 rounded-xl flex items-center gap-2.5 text-[10px] text-slate-700 font-semibold shadow-xs">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                </span>
                <span>Navigated to AI Draft Generator!</span>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="bg-slate-50/80 border-t border-slate-100 px-5 py-3 md:px-6 flex items-center justify-between">
            <button 
              id="walkthrough_skip_link"
              onClick={handleSkip}
              className="text-slate-400 hover:text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
            >
              Skip
            </button>

            {/* Dots */}
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    step === idx + 1 ? "bg-orange-500 w-3" : "bg-slate-200 w-1"
                  }`}
                />
              ))}
            </div>

            <button 
              id="walkthrough_next_btn"
              onClick={handleNext}
              className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all shadow-xs cursor-pointer group"
            >
              <span>{currentStepData.buttonText}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
