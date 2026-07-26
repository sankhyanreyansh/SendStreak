import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported, logEvent, Analytics } from "firebase/analytics";
import firebaseConfig from "../firebase-applet-config.json";

const metaEnv = (import.meta as any).env || {};

const config = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfig.measurementId,
};

const app = initializeApp(config);
export const auth = getAuth(app);

// Safe Analytics Initialization
let analyticsInstance: Analytics | null = null;

// Only initialize analytics if running with user's custom production environment variables
if (metaEnv.VITE_FIREBASE_PROJECT_ID) {
  isSupported().then((supported) => {
    if (supported) {
      try {
        analyticsInstance = getAnalytics(app);
        console.log("Firebase Analytics initialized successfully.");
      } catch (e) {
        console.warn("Firebase Analytics initialization failed (likely due to iframe/privacy settings):", e);
      }
    } else {
      console.log("Firebase Analytics is not supported in this environment.");
    }
  }).catch((err) => {
    console.warn("Error checking Firebase Analytics support:", err);
  });
} else {
  console.log("Firebase Analytics initialization skipped in development sandbox mode.");
}

export const logAnalyticsEvent = (eventName: string, params?: Record<string, any>) => {
  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, eventName, params);
    } catch (e) {
      console.error("Failed to log event:", eventName, e);
    }
  }
};

// Use custom db ID if provided. If we are in production (custom project ID is specified), 
// default to the standard Firestore database (default) unless explicitly specified.
export const db = metaEnv.VITE_FIREBASE_PROJECT_ID
  ? (metaEnv.VITE_FIREBASE_FIRESTORE_DB_ID ? getFirestore(app, metaEnv.VITE_FIREBASE_FIRESTORE_DB_ID) : getFirestore(app))
  : getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Use Google Auth Provider
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/gmail.send");
provider.addScope("https://www.googleapis.com/auth/gmail.readonly");

let isSigningIn = false;
let cachedAccessToken: string | null = null;
try {
  cachedAccessToken = localStorage.getItem("sendstreak_gmail_token");
} catch (e) {
  console.error("Failed to read sendstreak_gmail_token from localStorage:", e);
}

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        try {
          cachedAccessToken = localStorage.getItem("sendstreak_gmail_token");
        } catch (e) {
          console.error("Failed to load cached gmail token", e);
        }
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Login via Popup
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Firebase Auth");
    }

    cachedAccessToken = credential.accessToken;
    try {
      localStorage.setItem("sendstreak_gmail_token", cachedAccessToken);
      localStorage.setItem(
        "sendstreak_gmail_user",
        JSON.stringify({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
        })
      );
    } catch (e) {
      console.error("Failed to save gmail credentials to localStorage:", e);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    try {
      localStorage.setItem("sendstreak_gmail_token", token);
    } catch (e) {
      console.error(e);
    }
  } else {
    try {
      localStorage.removeItem("sendstreak_gmail_token");
      localStorage.removeItem("sendstreak_gmail_user");
    } catch (e) {
      console.error(e);
    }
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    localStorage.removeItem("sendstreak_gmail_token");
    localStorage.removeItem("sendstreak_gmail_user");
  } catch (e) {
    console.error("Failed to clear gmail cache on logout", e);
  }
};

// Standard App Sign-in (no Gmail scopes)
export const appGoogleSignIn = async (): Promise<User | null> => {
  try {
    const appProvider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, appProvider);
    return result.user;
  } catch (error: any) {
    console.error("App login error:", error);
    throw error;
  }
};

// fetchWithAuth helper to securely pass user ID token to server
export const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const user = auth.currentUser;
  let authHeaders: Record<string, string> = {};
  if (user) {
    try {
      const token = await user.getIdToken();
      authHeaders["Authorization"] = `Bearer ${token}`;
    } catch (e) {
      console.error("Failed to get auth ID token:", e);
    }
  }
  
  const mergedInit: RequestInit = {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.headers || {})
    }
  };
  
  return fetch(input, mergedInit);
};

