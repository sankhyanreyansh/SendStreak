import { Badge, Contact, StreakData, LocalState } from "./types";

// Get today's local date in YYYY-MM-DD format
export function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate the day difference between two YYYY-MM-DD strings
export function getDaysDifference(dateStr1: string, dateStr2: string): number {
  if (!dateStr1 || !dateStr2) return 0;
  const d1 = new Date(dateStr1 + "T00:00:00");
  const d2 = new Date(dateStr2 + "T00:00:00");
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return isNaN(diffDays) ? 0 : diffDays;
}

// Format a date string into a readable format (e.g., July 7, 2026)
export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Initial default badges list
export const DEFAULT_BADGES: Badge[] = [
  {
    id: "first_send",
    name: "First Send",
    description: "Take the leap! Send your first personalized cold email.",
    unlocked: false
  },
  {
    id: "first_reply",
    name: "First Reply",
    description: "A connection made! Receive your first response from a professional.",
    unlocked: false
  },
  {
    id: "first_call",
    name: "First Call Booked",
    description: "Calendar secured! Book your first 15-minute chat.",
    unlocked: false
  },
  {
    id: "50_emails",
    name: "50 Emails Sent",
    description: "Outreach powerhouse! Reach 50 emails sent in total.",
    unlocked: false
  },
  {
    id: "7_streak",
    name: "7-Day Streak",
    description: "Unstoppable habit! Reach a 7-day quota streak.",
    unlocked: false
  },
  {
    id: "30_streak",
    name: "30-Day Streak",
    description: "Consistency King! Reach a 30-day quota streak.",
    unlocked: false
  }
];

// Refreshes the streak parameters on app boot or context switch
export function checkAndRefreshStreak(streak: StreakData, dailyQuota: number, isPro?: boolean): StreakData {
  const today = getLocalDateString();
  if (!streak.lastSentDate) {
    return {
      ...streak,
      sentToday: 0,
      dailyQuota
    };
  }

  const diff = getDaysDifference(streak.lastSentDate, today);

  if (diff === 0) {
    // Same day, no reset needed
    return {
      ...streak,
      dailyQuota
    };
  } else if (diff === 1) {
    // Opened the next day. Check if yesterday's quota was met
    const metYesterday = streak.sentToday >= streak.dailyQuota;
    if (metYesterday) {
      return {
        ...streak,
        sentToday: 0,
        dailyQuota
      };
    } else {
      // Missed yesterday's quota.
      const isAlreadyPending = !!streak.streakPendingRestoration;

      if (isPro && streak.currentStreak > 0 && !isAlreadyPending) {
        return {
          ...streak,
          sentToday: 0,
          currentStreak: 0, // Reset in background until restored
          dailyQuota,
          streakPendingRestoration: true,
          savedStreakValue: streak.currentStreak
        };
      } else if (isAlreadyPending) {
        return {
          ...streak,
          sentToday: 0,
          dailyQuota
        };
      } else {
        return {
          ...streak,
          sentToday: 0,
          currentStreak: 0,
          dailyQuota,
          streakPendingRestoration: false,
          savedStreakValue: undefined
        };
      }
    }
  } else {
    // Opened 2 or more days later. Streak is broken completely.
    return {
      ...streak,
      sentToday: 0,
      currentStreak: 0,
      dailyQuota,
      streakPendingRestoration: false,
      savedStreakValue: undefined
    };
  }
}

// Handles updating streak stats when an email is sent
export function handleEmailSent(streak: StreakData): StreakData {
  const today = getLocalDateString();
  const totalEmailsSent = streak.totalEmailsSent + 1;
  
  // First make sure we catch any new-day transition before incrementing today's count
  const refreshed = checkAndRefreshStreak(streak, streak.dailyQuota);
  
  const newSentToday = refreshed.sentToday + 1;
  let newCurrentStreak = refreshed.currentStreak;
  
  // Check if they just crossed or hit their quota today
  if (newSentToday === refreshed.dailyQuota) {
    newCurrentStreak = refreshed.currentStreak + 1;
  }
  
  const longestStreak = Math.max(refreshed.longestStreak, newCurrentStreak);
  
  return {
    ...refreshed,
    sentToday: newSentToday,
    currentStreak: newCurrentStreak,
    longestStreak,
    totalEmailsSent,
    lastSentDate: today
  };
}

// Inspects contacts and streak to unlock newly eligible achievements
export function checkAndUnlockBadges(contacts: Contact[], streak: StreakData, currentBadges: Badge[]): Badge[] {
  const today = getLocalDateString();
  const totalSent = streak.totalEmailsSent;
  const currentStreak = streak.currentStreak;
  
  const hasReply = contacts.some(c => c.status === "replied" || c.status === "call_booked");
  const hasCallBooked = contacts.some(c => c.status === "call_booked");

  return currentBadges.map(badge => {
    if (badge.unlocked) return badge;
    
    let shouldUnlock = false;
    switch (badge.id) {
      case "first_send":
        shouldUnlock = totalSent >= 1;
        break;
      case "first_reply":
        shouldUnlock = hasReply;
        break;
      case "first_call":
        shouldUnlock = hasCallBooked;
        break;
      case "50_emails":
        shouldUnlock = totalSent >= 50;
        break;
      case "7_streak":
        shouldUnlock = currentStreak >= 7;
        break;
      case "30_streak":
        shouldUnlock = currentStreak >= 30;
        break;
    }
    
    if (shouldUnlock) {
      return {
        ...badge,
        unlocked: true,
        unlockedDate: today
      };
    }
    return badge;
  });
}

// Local Storage Keys
const STORAGE_KEY = "sendstreak_state_v1";

export function loadLocalState(): LocalState {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (serialized) {
      const parsed = JSON.parse(serialized) as LocalState;
      // Refresh streak parameters on load
      if (parsed.streak) {
        parsed.streak = checkAndRefreshStreak(parsed.streak, parsed.streak.dailyQuota || 3);
        // Recalculate badges in case they missed any
        parsed.badges = checkAndUnlockBadges(parsed.contacts || [], parsed.streak, parsed.badges || DEFAULT_BADGES);
      }
      return parsed;
    }
  } catch (e) {
    console.error("Failed to load local state:", e);
  }

  return {
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
}

export function saveLocalState(state: LocalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save local state:", e);
  }
}
