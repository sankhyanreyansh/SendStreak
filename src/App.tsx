import React, { useState, useEffect, useRef } from "react";
import { 
  Flame, 
  Users, 
  Sparkles, 
  Clock, 
  Settings as SettingsIcon, 
  GraduationCap,
  MessageSquare,
  User as UserIcon
} from "lucide-react";
import { Contact, UserProfile, LocalState, ContactStatus, Draft } from "./types";
import { 
  loadLocalState, 
  saveLocalState, 
  getLocalDateString, 
  handleEmailSent, 
  checkAndUnlockBadges,
  DEFAULT_BADGES,
  checkAndRefreshStreak
} from "./utils";
import { initAuth, googleSignIn, logout, appGoogleSignIn, auth, logAnalyticsEvent } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { 
  loadUserState, 
  migrateLocalToFirestore, 
  saveUserProfileToFirestore, 
  updateAppStatusInFirestore, 
  updateDraftsCountsInFirestore, 
  saveContactToFirestore, 
  deleteContactAndDraftFromFirestore, 
  saveDraftToFirestore, 
  saveStreakToFirestore, 
  saveBadgesToFirestore,
  updateUserAndGlobalStats
} from "./db";

// Subcomponents
import Onboarding from "./components/Onboarding";
import Walkthrough from "./components/Walkthrough";
import Dashboard from "./components/Dashboard";
import Contacts from "./components/Contacts";
import DraftGenerator from "./components/DraftGenerator";
import FollowUp from "./components/FollowUp";
import Replies from "./components/Replies";
import Settings from "./components/Settings";
import Profile from "./components/Profile";
import { SendStreakLogo } from "./components/SendStreakLogo";
import SleekLogin from "./components/SleekLogin";

export default function App() {
  const [state, setState] = useState<LocalState>({
    userProfile: null,
    contacts: [],
    drafts: {},
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      lastSentDate: null,
      totalEmailsSent: 0,
      dailyQuota: 3,
      sentToday: 0
    },
    badges: DEFAULT_BADGES
  });
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [selectedContactForDraft, setSelectedContactForDraft] = useState<Contact | null>(null);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);

  const hasValidProfile = !!(
    state.userProfile &&
    state.userProfile.school &&
    state.userProfile.major
  );

  // Self-hosted open-source version: all features unlocked
  const isPro = true;

  // App & Gmail Auth states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingAppAuth, setCheckingAppAuth] = useState(true);
  const [loadingFirestore, setLoadingFirestore] = useState(false);
  const [gmailUser, setGmailUser] = useState<User | null>(null);
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [checkingGmailAuth, setCheckingGmailAuth] = useState(true);

  const gmailTokenRef = useRef(gmailToken);
  useEffect(() => {
    gmailTokenRef.current = gmailToken;
  }, [gmailToken]);

  // 1. App Authentication & Firestore state synchronization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCheckingAppAuth(true);
        setCurrentUser(user);
        setLoadingFirestore(true);
        try {
          const fsState = await loadUserState(user.uid);
          
          if (fsState && fsState.userProfile && fsState.userProfile.school && fsState.userProfile.major) {
            if (fsState.streak) {
              fsState.streak = checkAndRefreshStreak(fsState.streak, fsState.streak.dailyQuota || 3, true);
            }
            setState(fsState);
            saveLocalState(fsState);
          } else {
            const localState = loadLocalState();
            if (localState && localState.userProfile && localState.userProfile.school && localState.userProfile.major) {
              await migrateLocalToFirestore(user.uid, localState, true, !!gmailTokenRef.current);
              setState(localState);
            } else if (fsState) {
              setState(fsState);
            } else {
              const defaultInitialState: LocalState = {
                userProfile: null,
                contacts: [],
                drafts: {},
                streak: {
                  currentStreak: 0,
                  longestStreak: 0,
                  lastSentDate: null,
                  totalEmailsSent: 0,
                  dailyQuota: 3,
                  sentToday: 0
                },
                badges: DEFAULT_BADGES
              };
              setState(defaultInitialState);
            }
          }
        } catch (err) {
          console.error("Error loading user state from Firestore:", err);
          const fallbackLocal = loadLocalState() || state;
          setState(fallbackLocal);
        } finally {
          setLoadingFirestore(false);
          setCheckingAppAuth(false);
        }
      } else {
        setCurrentUser(null);
        setCheckingAppAuth(false);
        setLoadingFirestore(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Initialize Gmail OAuth Client & Check Session
  useEffect(() => {
    setCheckingGmailAuth(true);
    const unsubscribeGmail = initAuth(
      (user, token) => {
        setGmailUser(user);
        setGmailToken(token);
        setCheckingGmailAuth(false);

        if (currentUser && user && token) {
          updateAppStatusInFirestore(currentUser.uid, { gmailConnected: true }).catch(err => {
            console.error("Error updating Gmail connected status in Firestore:", err);
          });
        }
      },
      () => {
        setCheckingGmailAuth(false);
      }
    );

    return () => {
      if (typeof unsubscribeGmail === "function") {
        unsubscribeGmail();
      }
    };
  }, [currentUser]);

  // Handle Interactive Tutorial First-Time trigger
  useEffect(() => {
    if (currentUser && hasValidProfile && !loadingFirestore && !checkingAppAuth) {
      try {
        const shown = localStorage.getItem(`sendstreak_tutorial_shown_${currentUser.uid}`);
        if (!shown) {
          setShowTutorial(true);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [currentUser, hasValidProfile, loadingFirestore, checkingAppAuth]);

  // Action: Connect Gmail Account
  const handleConnectGmail = async () => {
    try {
      logAnalyticsEvent("connect_gmail_click");
      const res = await googleSignIn();
      if (res) {
        setGmailUser(res.user);
        setGmailToken(res.accessToken);

        if (currentUser) {
          await updateAppStatusInFirestore(currentUser.uid, { gmailConnected: true });
        }
      }
    } catch (err: any) {
      console.error("Error connecting Gmail account:", err);
      alert(`Failed to connect Gmail: ${err.message || "Unknown error"}`);
    }
  };

  // Action: Disconnect Gmail Account
  const handleDisconnectGmail = async () => {
    try {
      await logout();
      setGmailUser(null);
      setGmailToken(null);

      if (currentUser) {
        await updateAppStatusInFirestore(currentUser.uid, { gmailConnected: false });
      }
    } catch (err: any) {
      console.error("Error disconnecting Gmail account:", err);
    }
  };

  const handleGmailTokenExpired = () => {
    setGmailToken(null);
  };

  // App Level Login Handler
  const handleAppLogin = async () => {
    try {
      logAnalyticsEvent("app_login_click");
      await appGoogleSignIn();
    } catch (err: any) {
      console.error("Error logging into application:", err);
      alert(`Login failed: ${err.message || "Unknown error"}`);
    }
  };

  // App Level Logout Handler
  const handleAppLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setGmailUser(null);
      setGmailToken(null);
      setActiveTab("dashboard");
      setSelectedContactForDraft(null);
    } catch (err: any) {
      console.error("Error logging out:", err);
    }
  };

  // Handle Onboarding Completion
  const handleOnboardingComplete = async (profile: UserProfile, dailyQuota: number) => {
    const updatedStreak = { ...state.streak, dailyQuota };
    const updatedState: LocalState = {
      ...state,
      userProfile: profile,
      streak: checkAndRefreshStreak(updatedStreak, dailyQuota, isPro)
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveUserProfileToFirestore(currentUser.uid, profile, dailyQuota, updatedStreak, true, !!gmailToken);
      } catch (err) {
        console.error("Error saving onboarding data to Firestore:", err);
      }
    }

    logAnalyticsEvent("onboarding_complete", { school: profile.school, major: profile.major });
  };

  // Handle Increment Drafts Count
  const handleIncrementDraftsCount = async () => {
    const currentMonth = getLocalDateString().substring(0, 7);
    const currentDay = getLocalDateString();
    
    const draftsCountByMonth = {
      ...(state.draftsCountByMonth || {}),
      [currentMonth]: ((state.draftsCountByMonth?.[currentMonth] || 0) + 1)
    };
    const draftsCountByDay = {
      ...(state.draftsCountByDay || {}),
      [currentDay]: ((state.draftsCountByDay?.[currentDay] || 0) + 1)
    };

    const updatedState = {
      ...state,
      draftsCountByMonth,
      draftsCountByDay
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await updateDraftsCountsInFirestore(currentUser.uid, draftsCountByMonth, draftsCountByDay);
      } catch (err) {
        console.error("Error persisting draft count to Firestore:", err);
      }
    }
  };

  // Contact Handlers
  const handleAddContact = async (contact: Contact) => {
    const newContacts = [contact, ...state.contacts];
    const updatedState = { ...state, contacts: newContacts };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveContactToFirestore(currentUser.uid, contact);
      } catch (err) {
        console.error("Error saving contact to Firestore:", err);
      }
    }

    logAnalyticsEvent("add_contact", { company: contact.company });
  };

  const handleAddContactsBatch = async (contactsBatch: Contact[]) => {
    const newContacts = [...contactsBatch, ...state.contacts];
    const updatedState = { ...state, contacts: newContacts };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        for (const c of contactsBatch) {
          await saveContactToFirestore(currentUser.uid, c);
        }
      } catch (err) {
        console.error("Error saving contacts batch to Firestore:", err);
      }
    }

    logAnalyticsEvent("add_contacts_batch", { count: contactsBatch.length });
  };

  const handleDeleteContact = async (contactId: string) => {
    const newContacts = state.contacts.filter(c => c.id !== contactId);
    const newDrafts = { ...state.drafts };
    delete newDrafts[contactId];

    const updatedState = {
      ...state,
      contacts: newContacts,
      drafts: newDrafts
    };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await deleteContactAndDraftFromFirestore(currentUser.uid, contactId);
      } catch (err) {
        console.error("Error deleting contact/draft from Firestore:", err);
      }
    }
  };

  const handleUpdateContactEmail = async (contactId: string, newEmail: string) => {
    const updatedContacts = state.contacts.map(c => {
      if (c.id === contactId) {
        return { ...c, email: newEmail };
      }
      return c;
    });

    const updatedState = { ...state, contacts: updatedContacts };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        const contactToSave = updatedContacts.find(c => c.id === contactId);
        if (contactToSave) {
          await saveContactToFirestore(currentUser.uid, contactToSave);
        }
      } catch (err) {
        console.error("Error updating contact email in Firestore:", err);
      }
    }
  };

  const handleUpdateContactFields = async (contactId: string, fields: Partial<Contact>) => {
    const updatedContacts = state.contacts.map(c => {
      if (c.id === contactId) {
        return { ...c, ...fields };
      }
      return c;
    });

    const updatedState = { ...state, contacts: updatedContacts };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        const contactToSave = updatedContacts.find(c => c.id === contactId);
        if (contactToSave) {
          await saveContactToFirestore(currentUser.uid, contactToSave);
        }
      } catch (err) {
        console.error("Error updating contact fields in Firestore:", err);
      }
    }
  };

  const handleUpdateStatus = async (contactId: string, newStatus: ContactStatus) => {
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact) return;

    let dateSent: string | undefined = contact.dateSent;
    if ((newStatus === "sent" || newStatus === "followed_up") && !dateSent) {
      dateSent = new Date().toISOString();
    }

    const updatedContact: Contact = {
      ...contact,
      status: newStatus,
      dateSent: dateSent
    };

    const newContacts = state.contacts.map(c => c.id === contactId ? updatedContact : c);
    let newStreak = state.streak;

    if (newStatus === "sent" || newStatus === "followed_up") {
      newStreak = handleEmailSent(state.streak);
    }

    const newBadges = checkAndUnlockBadges(newContacts, newStreak, state.badges);

    const updatedState = {
      ...state,
      contacts: newContacts,
      streak: newStreak,
      badges: newBadges
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveContactToFirestore(currentUser.uid, updatedContact);
        await saveStreakToFirestore(currentUser.uid, newStreak);
        await saveBadgesToFirestore(currentUser.uid, newBadges);
        if (newStatus === "sent" || newStatus === "followed_up") {
          await updateUserAndGlobalStats(currentUser.uid, newContacts, newStreak);
        }
      } catch (err) {
        console.error("Error updating contact status in Firestore:", err);
      }
    }

    logAnalyticsEvent("update_contact_status", { status: newStatus });
  };

  // Draft Handlers
  const handleSaveDraft = async (contactId: string, subjectLine: string, emailBody: string, edited: boolean) => {
    const draft: Draft = {
      contactId,
      subjectLine,
      emailBody,
      generatedAt: new Date().toISOString(),
      edited
    };

    const newDrafts = { ...state.drafts, [contactId]: draft };
    const updatedState = { ...state, drafts: newDrafts };
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveDraftToFirestore(currentUser.uid, draft);
      } catch (err) {
        console.error("Error saving draft to Firestore:", err);
      }
    }
  };

  const handleMarkAsSent = async (contactId: string) => {
    await handleUpdateStatus(contactId, "sent");
  };

  // Restore Streak handler
  const handleRestoreStreak = async () => {
    if (!state.streak.savedStreakValue) return;

    const restoredStreak = {
      ...state.streak,
      currentStreak: state.streak.savedStreakValue,
      longestStreak: Math.max(state.streak.longestStreak, state.streak.savedStreakValue),
      streakPendingRestoration: false,
      savedStreakValue: undefined
    };

    const updatedState = {
      ...state,
      streak: restoredStreak
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveStreakToFirestore(currentUser.uid, restoredStreak);
      } catch (err) {
        console.error("Error saving restored streak to Firestore:", err);
      }
    }
  };

  const handleDismissStreakRestoration = async () => {
    const dismissedStreak = {
      ...state.streak,
      streakPendingRestoration: false,
      savedStreakValue: undefined
    };

    const updatedState = {
      ...state,
      streak: dismissedStreak
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveStreakToFirestore(currentUser.uid, dismissedStreak);
      } catch (err) {
        console.error("Error saving dismissed streak restoration to Firestore:", err);
      }
    }
  };

  // Settings & Profile Handlers
  const handleSaveSettings = async (profile: UserProfile, dailyQuota: number) => {
    const updatedStreak = { ...state.streak, dailyQuota };
    const updatedState = {
      ...state,
      userProfile: profile,
      streak: updatedStreak
    };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveUserProfileToFirestore(currentUser.uid, profile, dailyQuota, updatedStreak, isPro, !!gmailToken);
      } catch (err) {
        console.error("Error saving settings to Firestore:", err);
      }
    }
  };

  const handleUpdateProfileFields = async (fields: Partial<UserProfile>) => {
    if (!state.userProfile) return;
    const updatedProfile = { ...state.userProfile, ...fields };
    const updatedState = { ...state, userProfile: updatedProfile };
    
    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveUserProfileToFirestore(currentUser.uid, updatedProfile, state.streak.dailyQuota, state.streak, isPro, !!gmailToken);
      } catch (err) {
        console.error("Error updating user profile fields in Firestore:", err);
      }
    }
  };

  const handleUpdateDelayDays = async (delayDays: number) => {
    if (!state.userProfile) return;
    const updatedProfile = { ...state.userProfile, followUpDelayDays: delayDays };
    const updatedState = { ...state, userProfile: updatedProfile };

    setState(updatedState);
    saveLocalState(updatedState);

    if (currentUser) {
      try {
        await saveUserProfileToFirestore(currentUser.uid, updatedProfile, state.streak.dailyQuota, state.streak, isPro, !!gmailToken);
      } catch (err) {
        console.error("Error updating follow-up delay in Firestore:", err);
      }
    }
  };

  const handleCheckReplies = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    setActiveTab("replies");
    return { success: true, count: 0 };
  };

  const handleResetAllData = async () => {
    const defaults: LocalState = {
      userProfile: state.userProfile,
      contacts: [],
      drafts: {},
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastSentDate: null,
        totalEmailsSent: 0,
        dailyQuota: state.streak.dailyQuota || 3,
        sentToday: 0
      },
      badges: DEFAULT_BADGES
    };
    setState(defaults);
    if (currentUser) {
      try {
        await migrateLocalToFirestore(currentUser.uid, defaults, true, !!gmailToken);
      } catch (err) {
        console.error("Error resetting all data in Firestore:", err);
      }
    }
    setActiveTab("dashboard");
    setSelectedContactForDraft(null);
  };

  const handleNavigate = (tab: string) => {
    setActiveTab(tab);
  };

  if (checkingAppAuth || loadingFirestore) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading SendStreak...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <SleekLogin onLogin={handleAppLogin} />;
  }

  if (!hasValidProfile) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans" id="app_root">
      
      {showTutorial && (
        <Walkthrough 
          onClose={() => {
            setShowTutorial(false);
            if (currentUser) {
              localStorage.setItem(`sendstreak_tutorial_shown_${currentUser.uid}`, "true");
            }
          }}
          onNavigate={(tab) => handleNavigate(tab)}
          activeTab={activeTab}
        />
      )}

      {state.streak.streakPendingRestoration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md" id="streak_restore_modal">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 max-w-md w-full shadow-2xl relative overflow-hidden text-center space-y-6">
            
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-12 w-48 h-48 bg-orange-100 rounded-full blur-3xl opacity-50 pointer-events-none" />

            <div className="relative mx-auto w-16 h-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shadow-inner animate-[bounce_2s_infinite]">
              <Flame className="w-8 h-8 fill-orange-500 text-orange-500" />
            </div>

            <div className="space-y-2">
              <h2 className="font-display text-xl font-extrabold text-slate-800 tracking-tight">
                Streak Recovery Available!
              </h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                You missed your daily quota yesterday, but your <span className="text-orange-500 font-bold">{state.streak.savedStreakValue}-Day Streak</span> is protected! Use your 1-day grace window to restore it now.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saved Streak</p>
                <p className="text-2xl font-extrabold text-slate-800">{state.streak.savedStreakValue} Days</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                id="streak_restore_confirm_btn"
                onClick={handleRestoreStreak}
                className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md shadow-orange-500/10 hover:shadow-orange-500/20 transition-all cursor-pointer text-xs uppercase tracking-wider text-center flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Restore Streak
              </button>
              
              <button
                id="streak_restore_dismiss_btn"
                onClick={handleDismissStreakRestoration}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-4 rounded-xl transition-all cursor-pointer text-xs text-center border border-slate-200/50"
              >
                No thanks, reset to 0
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* SIDEBAR FOR DESKTOP */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-100 p-6 shrink-0" id="desktop_sidebar">
        <div className="flex items-center gap-2.5 mb-8">
          <SendStreakLogo className="w-11 h-11" />
          <span className="font-display text-xl font-bold tracking-tight text-slate-800">
            Send<span className="text-orange-500">Streak</span>
          </span>
        </div>

        <div 
          id="sidebar_profile_trigger"
          onClick={() => handleNavigate("profile")}
          className={`mb-6 p-5 rounded-3xl border flex flex-col items-center text-center cursor-pointer transition-all hover:bg-slate-50 hover:border-slate-200 relative group ${
            activeTab === "profile" ? "bg-orange-50/50 border-orange-200" : "bg-slate-50 border-slate-100"
          }`}
        >
          <div className="relative mb-3">
            <div className="absolute inset-0 rounded-full border border-dashed border-orange-500/30 group-hover:border-orange-500 transition-colors animate-[spin_25s_linear_infinite]" />
            <div className="p-1 relative">
              {currentUser?.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || "User Profile"} 
                  className="w-20 h-20 rounded-full object-cover border border-slate-200 shadow-xs" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <div className="bg-orange-100 text-orange-600 w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl shadow-xs border border-orange-200">
                  {currentUser?.email ? currentUser.email[0].toUpperCase() : <GraduationCap className="w-9 h-9" />}
                </div>
              )}
            </div>
            <div className={`absolute bottom-1 right-1 w-3.5 h-3.5 border-2 border-white rounded-full shadow-xs ${
              gmailUser ? "bg-emerald-500" : "bg-slate-300"
            }`} title={gmailUser ? "Gmail Linked" : "Gmail Disconnected"} />
          </div>

          <div className="min-w-0 w-full">
            <div className="text-xs font-bold text-slate-800 truncate">
              {currentUser?.displayName || currentUser?.email || "Student User"}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">
              {state.userProfile?.school || "Set University"}
            </div>
            {state.userProfile?.major && (
              <div className="text-[9px] text-slate-400 font-medium truncate">
                {state.userProfile.major}
              </div>
            )}
          </div>
        </div>

        <nav className="space-y-1.5 flex-1" id="desktop_nav">
          <button
            id="nav_dash"
            onClick={() => handleNavigate("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Flame className={`w-5 h-5 ${activeTab === "dashboard" ? "fill-white" : ""}`} />
            <span>Dashboard</span>
            {state.streak.currentStreak > 0 && activeTab !== "dashboard" && (
              <span className="ml-auto text-[10px] bg-orange-100 text-orange-700 font-extrabold px-1.5 py-0.5 rounded-full">
                {state.streak.currentStreak}
              </span>
            )}
          </button>

          <button
            id="nav_contacts"
            onClick={() => handleNavigate("contacts")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "contacts"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Prospects</span>
          </button>

          <button
            id="nav_draft"
            onClick={() => handleNavigate("draft")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "draft"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Sparkles className={`w-5 h-5 ${activeTab === "draft" ? "fill-white" : ""}`} />
            <span>Drafts</span>
          </button>

          <button
            id="nav_followup"
            onClick={() => handleNavigate("followup")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "followup"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <Clock className="w-5 h-5" />
            <span>Follow-Ups</span>
          </button>

          <button
            id="nav_replies"
            onClick={() => handleNavigate("replies")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "replies"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Replies</span>
            {state.contacts.filter(c => c.status === "replied").length > 0 && (
              <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 font-extrabold px-1.5 py-0.5 rounded-full">
                {state.contacts.filter(c => c.status === "replied").length}
              </span>
            )}
          </button>

          <button
            id="nav_settings"
            onClick={() => handleNavigate("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "settings"
                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </nav>

        <div className="pt-6 border-t border-slate-100 text-center text-[11px] font-medium text-slate-400 flex items-center justify-center gap-1">
          <span>Streak Active: {state.streak.currentStreak} Days</span>
          {state.streak.currentStreak > 0 && <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />}
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <header className="flex md:hidden items-center justify-between bg-white px-5 py-4 border-b border-slate-100 sticky top-0 z-30" id="mobile_header">
        <div className="flex items-center gap-2">
          <SendStreakLogo className="w-9 h-9" />
          <span className="font-display text-lg font-bold tracking-tight text-slate-800">SendStreak</span>
        </div>

        {state.streak.currentStreak > 0 && (
          <div className="flex items-center gap-1.5 bg-orange-50 text-orange-700 font-black text-xs px-2.5 py-1.5 rounded-full border border-orange-100">
            <Flame className="w-4.5 h-4.5 fill-orange-500" />
            <span>{state.streak.currentStreak} DAY STREAK</span>
          </div>
        )}
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0" id="main_viewport">
        <div className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">

          {activeTab === "dashboard" && (
            <Dashboard 
              contacts={state.contacts} 
              streak={state.streak} 
              badges={state.badges} 
              onNavigate={handleNavigate}
              onCheckReplies={handleCheckReplies}
              gmailUser={gmailUser}
            />
          )}

          {activeTab === "contacts" && (
            <Contacts 
              contacts={state.contacts}
              onAddContact={handleAddContact}
              onDeleteContact={handleDeleteContact}
              onUpdateContactFields={handleUpdateContactFields}
              onNavigate={handleNavigate}
              isPro={true}
              onAddContactsBatch={handleAddContactsBatch}
            />
          )}

          {activeTab === "draft" && (
            <DraftGenerator 
              contacts={state.contacts}
              userProfile={state.userProfile}
              drafts={state.drafts}
              onSaveDraft={handleSaveDraft}
              onMarkAsSent={handleMarkAsSent}
              onNavigate={handleNavigate}
              selectedContactFromProps={selectedContactForDraft}
              gmailUser={gmailUser}
              gmailToken={gmailToken}
              onConnectGmail={handleConnectGmail}
              onGmailTokenExpired={handleGmailTokenExpired}
              onUpdateContactEmail={handleUpdateContactEmail}
              isPro={true}
              streak={state.streak}
              draftsCountToday={state.draftsCountByDay?.[getLocalDateString()] || 0}
              onIncrementDraftsCount={handleIncrementDraftsCount}
            />
          )}

          {activeTab === "followup" && (
            <FollowUp 
              contacts={state.contacts}
              drafts={state.drafts}
              onUpdateStatus={handleUpdateStatus}
              onUpdateContactFields={handleUpdateContactFields}
              gmailUser={gmailUser}
              gmailToken={gmailToken}
              onConnectGmail={handleConnectGmail}
              onGmailTokenExpired={handleGmailTokenExpired}
              isPro={true}
              streak={state.streak}
              draftsCountToday={state.draftsCountByDay?.[getLocalDateString()] || 0}
              onIncrementDraftsCount={handleIncrementDraftsCount}
              userProfile={state.userProfile}
            />
          )}

          {activeTab === "replies" && (
            <Replies 
              contacts={state.contacts}
              drafts={state.drafts}
              userProfile={state.userProfile}
              onUpdateStatus={handleUpdateStatus}
              onUpdateContactFields={handleUpdateContactFields}
              gmailUser={gmailUser}
              gmailToken={gmailToken}
              onConnectGmail={handleConnectGmail}
              onGmailTokenExpired={handleGmailTokenExpired}
              isPro={true}
              streak={state.streak}
              draftsCountToday={state.draftsCountByDay?.[getLocalDateString()] || 0}
              onIncrementDraftsCount={handleIncrementDraftsCount}
            />
          )}

          {activeTab === "profile" && (
            <Profile 
              userProfile={state.userProfile}
              dailyQuota={state.streak.dailyQuota}
              onSaveProfile={handleSaveSettings}
              gmailUser={gmailUser}
              currentUser={currentUser}
              isPro={true}
              streak={state.streak}
              checkingProStatus={false}
              onConnectGmail={handleConnectGmail}
              onDisconnectGmail={handleDisconnectGmail}
              onAppLogout={handleAppLogout}
              onUpdateUserProfile={handleUpdateProfileFields}
            />
          )}

          {activeTab === "settings" && (
            <Settings 
              followUpDelayDays={state.userProfile?.followUpDelayDays || 6}
              onUpdateDelayDays={handleUpdateDelayDays}
              onResetAllData={handleResetAllData}
              userProfile={state.userProfile}
              isPro={true}
              onUpdateUserProfile={handleUpdateProfileFields}
            />
          )}
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-1 py-2 justify-around z-30 shadow-lg" id="mobile_bottom_nav">
        <button
          onClick={() => handleNavigate("dashboard")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "dashboard" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <Flame className={`w-4.5 h-4.5 ${activeTab === "dashboard" ? "fill-orange-500" : ""}`} />
          <span className="text-[9px] font-bold">Streak</span>
        </button>

        <button
          onClick={() => handleNavigate("contacts")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "contacts" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <Users className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold">Prospects</span>
        </button>

        <button
          onClick={() => handleNavigate("draft")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "draft" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <Sparkles className={`w-4.5 h-4.5 ${activeTab === "draft" ? "fill-orange-500" : ""}`} />
          <span className="text-[9px] font-bold">Drafts</span>
        </button>

        <button
          onClick={() => handleNavigate("followup")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "followup" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <Clock className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold">Followups</span>
        </button>

        <button
          onClick={() => handleNavigate("replies")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all relative cursor-pointer ${
            activeTab === "replies" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <MessageSquare className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold">Replies</span>
          {state.contacts.filter(c => c.status === "replied").length > 0 && (
            <span className="absolute -top-1.5 -right-1 text-[8px] bg-emerald-500 text-white font-extrabold w-4 h-4 rounded-full flex items-center justify-center">
              {state.contacts.filter(c => c.status === "replied").length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleNavigate("profile")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "profile" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <UserIcon className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold">Profile</span>
        </button>

        <button
          onClick={() => handleNavigate("settings")}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all cursor-pointer ${
            activeTab === "settings" ? "text-orange-500" : "text-slate-400"
          }`}
        >
          <SettingsIcon className="w-4.5 h-4.5" />
          <span className="text-[9px] font-bold">Settings</span>
        </button>
      </nav>

    </div>
  );
}
