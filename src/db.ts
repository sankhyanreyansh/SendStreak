import { db, auth } from "./firebase";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  deleteDoc, 
  writeBatch,
  runTransaction
} from "firebase/firestore";
import { UserProfile, Contact, Draft, StreakData, Badge, LocalState } from "./types";
import { DEFAULT_BADGES, getLocalDateString, getDaysDifference } from "./utils";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively cleans objects to make them safe for Firestore (converts undefined to null / removes undefined keys).
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (typeof obj === "number") {
    if (isNaN(obj) || !isFinite(obj)) {
      return 0 as any;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof obj === "object" && obj !== null) {
    if (obj.constructor && obj.constructor.name !== "Object" && obj.constructor.name !== "Array") {
      return obj;
    }
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = sanitizeForFirestore(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
}

// Load full user state from Firestore
export async function loadUserState(userId: string): Promise<LocalState | null> {
  try {
    const userDocRef = doc(db, "users", userId);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      return null;
    }

    const userData = userSnap.data();
    
    // Parse UserProfile
    const userProfile: UserProfile | null = userData.userProfile || null;
    if (userProfile) {
      userProfile.resumeName = userData.resumeFileName || "";
      userProfile.resumeBase64 = userData.resumeBase64 || "";
      userProfile.resumeUploadedAt = userData.resumeUploadedAt || "";
    }
    const draftsCountByMonth: Record<string, number> = userData.draftsCountByMonth || {};
    const draftsCountByDay: Record<string, number> = userData.draftsCountByDay || {};

    // Load Contacts subcollection
    const contactsCol = collection(db, "users", userId, "contacts");
    const contactsSnap = await getDocs(contactsCol);
    const contacts: Contact[] = [];
    contactsSnap.forEach((docSnap) => {
      contacts.push(docSnap.data() as Contact);
    });

    // Load Drafts subcollection
    const draftsCol = collection(db, "users", userId, "drafts");
    const draftsSnap = await getDocs(draftsCol);
    const drafts: Record<string, Draft> = {};
    draftsSnap.forEach((docSnap) => {
      const d = docSnap.data() as Draft;
      drafts[d.contactId] = d;
    });

    // Load StreakData
    const streakDocRef = doc(db, "users", userId, "streakData", "main");
    const streakSnap = await getDoc(streakDocRef);
    let streak: StreakData;
    if (streakSnap.exists()) {
      streak = streakSnap.data() as StreakData;
    } else {
      streak = {
        currentStreak: 0,
        longestStreak: 0,
        lastSentDate: null,
        totalEmailsSent: 0,
        dailyQuota: 3,
        sentToday: 0
      };
    }

    // Load Badges subcollection
    const badgesCol = collection(db, "users", userId, "badges");
    const badgesSnap = await getDocs(badgesCol);
    const badges: Badge[] = [];
    badgesSnap.forEach((docSnap) => {
      badges.push(docSnap.data() as Badge);
    });

    // Default badges if none present
    const finalBadges = badges.length > 0 ? badges : DEFAULT_BADGES;

    return {
      userProfile,
      contacts,
      drafts,
      streak,
      badges: finalBadges,
      draftsCountByMonth,
      draftsCountByDay
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    throw error;
  }
}

// Migrate entire local state to Firestore
export async function migrateLocalToFirestore(userId: string, localState: LocalState, isPro: boolean, gmailConnected: boolean): Promise<void> {
  try {
    const batch = writeBatch(db);

    // 1. User document
    const userDocRef = doc(db, "users", userId);
    batch.set(userDocRef, sanitizeForFirestore({
      userProfile: localState.userProfile,
      draftsCountByMonth: localState.draftsCountByMonth || {},
      draftsCountByDay: localState.draftsCountByDay || {},
      planStatus: isPro ? "pro" : "free",
      gmailConnected
    }), { merge: true });

    // 2. Contacts
    if (localState.contacts && localState.contacts.length > 0) {
      localState.contacts.forEach((contact) => {
        const contactDocRef = doc(db, "users", userId, "contacts", contact.id);
        batch.set(contactDocRef, sanitizeForFirestore(contact));
      });
    }

    // 3. Drafts
    if (localState.drafts) {
      Object.entries(localState.drafts).forEach(([contactId, draft]) => {
        const draftDocRef = doc(db, "users", userId, "drafts", contactId);
        batch.set(draftDocRef, sanitizeForFirestore(draft));
      });
    }

    // 4. StreakData
    const streakDocRef = doc(db, "users", userId, "streakData", "main");
    batch.set(streakDocRef, sanitizeForFirestore(localState.streak || {
      currentStreak: 0,
      longestStreak: 0,
      lastSentDate: null,
      totalEmailsSent: 0,
      dailyQuota: 3,
      sentToday: 0
    }));

    // 5. Badges
    const badgesList = localState.badges && localState.badges.length > 0 ? localState.badges : DEFAULT_BADGES;
    badgesList.forEach((badge) => {
      const badgeDocRef = doc(db, "users", userId, "badges", badge.id);
      batch.set(badgeDocRef, sanitizeForFirestore(badge));
    });

    await batch.commit();
    console.log("Migration to Firestore complete for user:", userId);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/migration`);
    throw error;
  }
}

// Save/Update user profile
export async function saveUserProfileToFirestore(userId: string, profile: UserProfile, dailyQuota: number, currentStreakData: StreakData, isPro: boolean, gmailConnected: boolean): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    const userDocRef = doc(db, "users", userId);
    batch.set(userDocRef, sanitizeForFirestore({
      userProfile: profile,
      planStatus: isPro ? "pro" : "free",
      gmailConnected
    }), { merge: true });

    const streakDocRef = doc(db, "users", userId, "streakData", "main");
    batch.set(streakDocRef, sanitizeForFirestore({
      ...currentStreakData,
      dailyQuota
    }), { merge: true });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/profile`);
    throw error;
  }
}

// Update Gmail connection status & Plan Status
export async function updateAppStatusInFirestore(
  userId: string, 
  updates: { 
    planStatus?: "free" | "pro"; 
    gmailConnected?: boolean;
    customerId?: string | null;
    subscriptionId?: string | null;
    subscriptionStatus?: string | null;
  }
): Promise<void> {
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, sanitizeForFirestore(updates), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/status`);
  }
}

// Update draft counts for limits tracking
export async function updateDraftsCountsInFirestore(
  userId: string, 
  draftsCountByMonth: Record<string, number>,
  draftsCountByDay: Record<string, number>
): Promise<void> {
  try {
    const userDocRef = doc(db, "users", userId);
    await setDoc(userDocRef, sanitizeForFirestore({ draftsCountByMonth, draftsCountByDay }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/draftsCounts`);
  }
}

// Save or update a single contact
export async function saveContactToFirestore(userId: string, contact: Contact): Promise<void> {
  try {
    const contactDocRef = doc(db, "users", userId, "contacts", contact.id);
    await setDoc(contactDocRef, sanitizeForFirestore(contact));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/contacts/${contact.id}`);
    throw error;
  }
}

// Delete contact and its associated draft
export async function deleteContactAndDraftFromFirestore(userId: string, contactId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const contactDocRef = doc(db, "users", userId, "contacts", contactId);
    const draftDocRef = doc(db, "users", userId, "drafts", contactId);
    
    batch.delete(contactDocRef);
    batch.delete(draftDocRef);
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}/contacts_and_drafts/${contactId}`);
    throw error;
  }
}

// Save or update a single draft
export async function saveDraftToFirestore(userId: string, draft: Draft): Promise<void> {
  try {
    const draftDocRef = doc(db, "users", userId, "drafts", draft.contactId);
    await setDoc(draftDocRef, sanitizeForFirestore(draft));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/drafts/${draft.contactId}`);
    throw error;
  }
}

// Save/Update StreakData
export async function saveStreakToFirestore(userId: string, streak: StreakData): Promise<void> {
  try {
    const streakDocRef = doc(db, "users", userId, "streakData", "main");
    await setDoc(streakDocRef, sanitizeForFirestore(streak));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/streakData/main`);
    throw error;
  }
}

// Save all badges (or unlocked ones)
export async function saveBadgesToFirestore(userId: string, badges: Badge[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    badges.forEach((badge) => {
      const badgeDocRef = doc(db, "users", userId, "badges", badge.id);
      batch.set(badgeDocRef, sanitizeForFirestore(badge));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/badges`);
    throw error;
  }
}

// User stats structure inside users/{userId}/stats/summary
export interface UserAnalyticsSummary {
  userId: string;
  email: string | null;
  onboardingDate: string;
  totalEmailsSent: number;
  totalLeadsAdded: number;
  totalLeadsDeleted?: number;
  avgEmailsSentPerDay: number;
  currentStreak: number;
  longestStreak: number;
  avgStreak: number;
  streakSum: number;
  streakCount: number;
  updatedAt: string;
}

// Global stats structure inside global_stats/summary
export interface GlobalAnalyticsSummary {
  totalEmailsSent: number;
  totalLeadsAdded: number;
  totalLeadsDeleted?: number;
  totalUsers: number;
  currentStreakSum: number;
  longestStreakMax: number;
  avgStreakSum: number;
  avgEmailsSentPerDaySum: number;
  updatedAt: string;
}

/**
 * Updates both the individual user-level analytics stats document and the global aggregate
 * system stats document atomically inside a Firestore transaction.
 */
export async function updateUserAndGlobalStats(
  userId: string,
  contacts: Contact[],
  streak: StreakData
): Promise<void> {
  const userStatsRef = doc(db, "users", userId, "stats", "summary");
  const globalStatsRef = doc(db, "global_stats", "summary");

  try {
    await runTransaction(db, async (transaction) => {
      const email = auth.currentUser?.email || null;

      // 1. Fetch current user stats summary
      const userStatsSnap = await transaction.get(userStatsRef);
      
      const today = getLocalDateString();
      let onboardingDate = today;
      let oldEmailsSent = 0;
      let oldLeadsAdded = 0;
      let oldLeadsDeleted = 0;
      let oldCurrentStreak = 0;
      let oldLongestStreak = 0;
      let oldAvgStreak = 0;
      let oldAvgEmailsSentPerDay = 0;
      let streakSum = 0;
      let streakCount = 0;
      let isNewUserStats = true;

      if (userStatsSnap.exists()) {
        const data = userStatsSnap.data();
        onboardingDate = data.onboardingDate || today;
        oldEmailsSent = data.totalEmailsSent || 0;
        oldLeadsAdded = data.totalLeadsAdded || 0;
        oldLeadsDeleted = data.totalLeadsDeleted || 0;
        oldCurrentStreak = data.currentStreak || 0;
        oldLongestStreak = data.longestStreak || 0;
        oldAvgStreak = data.avgStreak || 0;
        oldAvgEmailsSentPerDay = data.avgEmailsSentPerDay || 0;
        streakSum = data.streakSum || 0;
        streakCount = data.streakCount || 0;
        isNewUserStats = false;
      }

      // Compute new values
      const totalEmailsSent = streak.totalEmailsSent || 0;
      const currentStreak = streak.currentStreak || 0;
      const longestStreak = streak.longestStreak || 0;

      // Compute total leads added/deleted using our math invariant
      const oldActiveContactsCount = oldLeadsAdded - oldLeadsDeleted;
      const currentActiveContactsCount = contacts.length;
      
      let totalLeadsAdded = oldLeadsAdded;
      let totalLeadsDeleted = oldLeadsDeleted;

      if (isNewUserStats) {
        totalLeadsAdded = currentActiveContactsCount;
        totalLeadsDeleted = 0;
      } else if (currentActiveContactsCount > oldActiveContactsCount) {
        totalLeadsAdded = oldLeadsAdded + (currentActiveContactsCount - oldActiveContactsCount);
      } else if (currentActiveContactsCount < oldActiveContactsCount) {
        totalLeadsDeleted = oldLeadsDeleted + (oldActiveContactsCount - currentActiveContactsCount);
      }

      // Days since onboarding
      const daysSinceOnboarding = Math.max(1, getDaysDifference(onboardingDate, today) + 1);
      const avgEmailsSentPerDay = Number((totalEmailsSent / daysSinceOnboarding).toFixed(2));

      // Handle streak tracking updates
      if (currentStreak > oldCurrentStreak) {
        if (oldCurrentStreak === 0) {
          streakCount += 1;
        }
        streakSum += (currentStreak - oldCurrentStreak);
      } else if (currentStreak < oldCurrentStreak && currentStreak > 0) {
        streakCount += 1;
        streakSum += currentStreak;
      }
      
      const avgStreak = streakCount > 0 ? Number((streakSum / streakCount).toFixed(2)) : 0;

      // User stats updates
      const newUserStats: UserAnalyticsSummary = {
        userId,
        email,
        onboardingDate,
        totalEmailsSent,
        totalLeadsAdded,
        totalLeadsDeleted,
        avgEmailsSentPerDay,
        currentStreak,
        longestStreak,
        avgStreak,
        streakSum,
        streakCount,
        updatedAt: new Date().toISOString()
      };

      // 3. Fetch global stats
      const globalStatsSnap = await transaction.get(globalStatsRef);
      let globalEmailsSent = 0;
      let globalLeadsAdded = 0;
      let globalLeadsDeleted = 0;
      let globalUsers = 0;
      let globalCurrentStreakSum = 0;
      let globalLongestStreakMax = 0;
      let globalAvgStreakSum = 0;
      let globalAvgEmailsSentPerDaySum = 0;

      if (globalStatsSnap.exists()) {
        const gData = globalStatsSnap.data();
        globalEmailsSent = gData.totalEmailsSent || 0;
        globalLeadsAdded = gData.totalLeadsAdded || 0;
        globalLeadsDeleted = gData.totalLeadsDeleted || 0;
        globalUsers = gData.totalUsers || 0;
        globalCurrentStreakSum = gData.currentStreakSum || 0;
        globalLongestStreakMax = gData.longestStreakMax || 0;
        globalAvgStreakSum = gData.avgStreakSum || 0;
        globalAvgEmailsSentPerDaySum = gData.avgEmailsSentPerDaySum || 0;
      }

      // Deltas for global stats
      const emailsSentDelta = totalEmailsSent - oldEmailsSent;
      const leadsAddedDelta = totalLeadsAdded - oldLeadsAdded;
      const leadsDeletedDelta = totalLeadsDeleted - oldLeadsDeleted;
      const currentStreakDelta = currentStreak - oldCurrentStreak;
      const usersDelta = isNewUserStats ? 1 : 0;
      const avgStreakDelta = avgStreak - oldAvgStreak;
      const avgEmailsSentPerDayDelta = avgEmailsSentPerDay - oldAvgEmailsSentPerDay;

      const newGlobalEmailsSent = globalEmailsSent + emailsSentDelta;
      const newGlobalLeadsAdded = globalLeadsAdded + leadsAddedDelta;
      const newGlobalLeadsDeleted = globalLeadsDeleted + leadsDeletedDelta;
      const newGlobalUsers = globalUsers + usersDelta;
      const newGlobalCurrentStreakSum = globalCurrentStreakSum + currentStreakDelta;
      const newGlobalLongestStreakMax = Math.max(globalLongestStreakMax, longestStreak);
      const newGlobalAvgStreakSum = globalAvgStreakSum + avgStreakDelta;
      const newGlobalAvgEmailsSentPerDaySum = globalAvgEmailsSentPerDaySum + avgEmailsSentPerDayDelta;

      const newGlobalStats: GlobalAnalyticsSummary = {
        totalEmailsSent: newGlobalEmailsSent,
        totalLeadsAdded: newGlobalLeadsAdded,
        totalLeadsDeleted: newGlobalLeadsDeleted,
        totalUsers: newGlobalUsers,
        currentStreakSum: newGlobalCurrentStreakSum,
        longestStreakMax: newGlobalLongestStreakMax,
        avgStreakSum: Number(newGlobalAvgStreakSum.toFixed(2)),
        avgEmailsSentPerDaySum: Number(newGlobalAvgEmailsSentPerDaySum.toFixed(2)),
        updatedAt: new Date().toISOString()
      };

      // Perform transaction writes
      const userStreakDocRef = doc(db, "users", userId, "streakData", "main");
      transaction.set(userStreakDocRef, sanitizeForFirestore(streak), { merge: true });
      transaction.set(userStatsRef, sanitizeForFirestore(newUserStats));
      transaction.set(globalStatsRef, sanitizeForFirestore(newGlobalStats));
    });
    console.log("Transaction for user and global stats successful");
  } catch (error) {
    console.error("Failed to update user and global stats in transaction:", error);
    // Fallback: non-transactional write so user stats still save even if transaction has conflicts
    try {
      const today = getLocalDateString();
      const userStatsSnap = await getDoc(userStatsRef);
      const onboardingDate = userStatsSnap.exists() ? userStatsSnap.data()?.onboardingDate || today : today;
      
      const email = auth.currentUser?.email || null;

      const totalEmailsSent = streak.totalEmailsSent || 0;
      const currentStreak = streak.currentStreak || 0;
      const longestStreak = streak.longestStreak || 0;

      // Compute total leads added/deleted using our math invariant in fallback as well
      const oldLeadsAdded = userStatsSnap.exists() ? userStatsSnap.data()?.totalLeadsAdded || 0 : 0;
      const oldLeadsDeleted = userStatsSnap.exists() ? userStatsSnap.data()?.totalLeadsDeleted || 0 : 0;
      const oldActiveContactsCount = oldLeadsAdded - oldLeadsDeleted;
      const currentActiveContactsCount = contacts.length;

      let totalLeadsAdded = oldLeadsAdded;
      let totalLeadsDeleted = oldLeadsDeleted;

      if (!userStatsSnap.exists()) {
        totalLeadsAdded = currentActiveContactsCount;
        totalLeadsDeleted = 0;
      } else if (currentActiveContactsCount > oldActiveContactsCount) {
        totalLeadsAdded = oldLeadsAdded + (currentActiveContactsCount - oldActiveContactsCount);
      } else if (currentActiveContactsCount < oldActiveContactsCount) {
        totalLeadsDeleted = oldLeadsDeleted + (oldActiveContactsCount - currentActiveContactsCount);
      }

      const newUserStats: UserAnalyticsSummary = {
        userId,
        email,
        onboardingDate,
        totalEmailsSent,
        totalLeadsAdded,
        totalLeadsDeleted,
        avgEmailsSentPerDay: Number((totalEmailsSent / 1).toFixed(2)),
        currentStreak,
        longestStreak,
        avgStreak: currentStreak,
        streakSum: currentStreak,
        streakCount: currentStreak > 0 ? 1 : 0,
        updatedAt: new Date().toISOString()
      };
      const userStreakDocRef = doc(db, "users", userId, "streakData", "main");
      await setDoc(userStreakDocRef, sanitizeForFirestore(streak), { merge: true });
      await setDoc(userStatsRef, sanitizeForFirestore(newUserStats));

      // Robust non-transactional fallback update for global_stats
      try {
        const globalStatsSnap = await getDoc(globalStatsRef);
        const gData = globalStatsSnap.exists() ? globalStatsSnap.data() : null;
        
        const isNewUserStats = !userStatsSnap.exists();
        const oldEmailsSent = userStatsSnap.exists() ? userStatsSnap.data()?.totalEmailsSent || 0 : 0;
        const oldCurrentStreak = userStatsSnap.exists() ? userStatsSnap.data()?.currentStreak || 0 : 0;
        const oldLongestStreak = userStatsSnap.exists() ? userStatsSnap.data()?.longestStreak || 0 : 0;
        const oldAvgStreak = userStatsSnap.exists() ? userStatsSnap.data()?.avgStreak || 0 : 0;
        const oldAvgEmailsSentPerDay = userStatsSnap.exists() ? userStatsSnap.data()?.avgEmailsSentPerDay || 0 : 0;

        const emailsSentDelta = totalEmailsSent - oldEmailsSent;
        const leadsAddedDelta = totalLeadsAdded - oldLeadsAdded;
        const leadsDeletedDelta = totalLeadsDeleted - oldLeadsDeleted;
        const currentStreakDelta = currentStreak - oldCurrentStreak;
        const usersDelta = isNewUserStats ? 1 : 0;
        const avgStreakDelta = newUserStats.avgStreak - oldAvgStreak;
        const avgEmailsSentPerDayDelta = newUserStats.avgEmailsSentPerDay - oldAvgEmailsSentPerDay;

        const newGlobalStats: GlobalAnalyticsSummary = {
          totalEmailsSent: (gData?.totalEmailsSent || 0) + emailsSentDelta,
          totalLeadsAdded: (gData?.totalLeadsAdded || 0) + leadsAddedDelta,
          totalLeadsDeleted: (gData?.totalLeadsDeleted || 0) + leadsDeletedDelta,
          totalUsers: (gData?.totalUsers || 0) + usersDelta,
          currentStreakSum: (gData?.currentStreakSum || 0) + currentStreakDelta,
          longestStreakMax: Math.max((gData?.longestStreakMax || 0), longestStreak),
          avgStreakSum: Number(((gData?.avgStreakSum || 0) + avgStreakDelta).toFixed(2)),
          avgEmailsSentPerDaySum: Number(((gData?.avgEmailsSentPerDaySum || 0) + avgEmailsSentPerDayDelta).toFixed(2)),
          updatedAt: new Date().toISOString()
        };

        await setDoc(globalStatsRef, sanitizeForFirestore(newGlobalStats), { merge: true });
        console.log("Fallback global stats update successful");
      } catch (e) {
        console.error("Fallback global stats write failed:", e);
      }
    } catch (e) {
      console.error("Fallback stats write failed:", e);
    }
  }
}
