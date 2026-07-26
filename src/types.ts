export interface UserProfile {
  school: string;
  major: string;
  gradYear: string;
  bio: string;
  achievements: string[];
  followUpDelayDays?: number;
  attachResume?: boolean;
  resumeBase64?: string;
  resumeName?: string;
  resumeUploadedAt?: string;
}

export type ContactStatus = "not_sent" | "sent" | "followed_up" | "replied" | "call_booked" | "declined" | "awaiting_response" | "no_longer_relevant";

export interface Contact {
  id: string;
  name: string;
  email?: string; // email address for Gmail sending
  company: string;
  role: string;
  contextBlurb: string;
  status: ContactStatus;
  dateAdded: string; // YYYY-MM-DD
  dateSent?: string; // YYYY-MM-DD
  followUpDueDate?: string; // YYYY-MM-DD
  gmailThreadId?: string; // Gmail Thread ID for thread tracking and follow-up reply detection
  contactReplyText?: string; // Pasted reply from the contact
  generatedResponseText?: string; // AI generated draft response to the contact's reply
  followUpGenerationsCount?: number;
  replyGenerationsCount?: number;
}

export interface Draft {
  contactId: string;
  emailBody: string;
  subjectLine: string;
  generatedAt: string; // ISO
  edited: boolean;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastSentDate: string | null; // YYYY-MM-DD
  totalEmailsSent: number;
  dailyQuota: number; // default 3
  sentToday: number;
  streakPendingRestoration?: boolean;
  savedStreakValue?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedDate?: string;
}

export interface LocalState {
  userProfile: UserProfile | null;
  contacts: Contact[];
  drafts: Record<string, Draft>; // contactId -> Draft
  streak: StreakData;
  badges: Badge[];
  draftsCountByMonth?: Record<string, number>; // YYYY-MM -> count
  draftsCountByDay?: Record<string, number>; // YYYY-MM-DD -> count
}
