import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
// @ts-ignore
import { PDFParse } from "pdf-parse";

dotenv.config();

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn("Could not parse firebase-applet-config.json:", e);
  }
}

// Resolve dynamic configuration based on custom environment variables
const finalProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const isCustomProject = firebaseConfig.projectId && finalProjectId !== firebaseConfig.projectId;
const finalDatabaseId = process.env.FIREBASE_FIRESTORE_DB_ID || process.env.VITE_FIREBASE_FIRESTORE_DB_ID || (isCustomProject ? "(default)" : firebaseConfig.firestoreDatabaseId || "(default)");

if (finalProjectId) {
  process.env.FIREBASE_PROJECT_ID = finalProjectId;
  process.env.GOOGLE_CLOUD_PROJECT = finalProjectId;
  process.env.GCLOUD_PROJECT = finalProjectId;
}

const firebaseApp = initializeApp({
  projectId: finalProjectId || "sendstreak-selfhosted",
});
const db = getFirestore(firebaseApp, finalDatabaseId);

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${finalProjectId}/databases/${finalDatabaseId}/documents`;

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === "object") {
    const fields: any = {};
    for (const k of Object.keys(val)) {
      fields[k] = toFirestoreValue(val[k]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val) return null;
  if ("nullValue" in val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("arrayValue" in val) {
    const values = val.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const fields = val.mapValue.fields || {};
    const obj: any = {};
    for (const k of Object.keys(fields)) {
      obj[k] = fromFirestoreValue(fields[k]);
    }
    return obj;
  }
  return val;
}

async function getFirestoreDoc(userId: string, idToken?: string | null) {
  if (!idToken) {
    const docSnap = await db.collection("users").doc(userId).get();
    if (!docSnap.exists) return null;
    return docSnap.data() || null;
  }

  const url = `${BASE_URL}/users/${userId}`;
  const headers: any = {
    "Authorization": `Bearer ${idToken}`
  };

  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST read failed: ${res.status} ${errText}`);
  }

  const docData = await res.json();
  const fields = docData.fields || {};
  const data: any = {};
  for (const k of Object.keys(fields)) {
    data[k] = fromFirestoreValue(fields[k]);
  }
  return data;
}

async function saveFirestoreDoc(userId: string, data: any, idToken?: string | null) {
  if (!idToken) {
    await db.collection("users").doc(userId).set(data, { merge: true });
    return { name: `users/${userId}` };
  }

  const fields = toFirestoreValue(data).mapValue.fields;

  const qs = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `${BASE_URL}/users/${userId}?${qs}`;

  const headers: any = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST write failed: ${res.status} ${errText}`);
  }
  return await res.json();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Fast health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Lazily initialize Gemini AI client
  let aiClient: GoogleGenAI | null = null;
  function getAi(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "dummy_key") {
        throw new Error("GEMINI_API_KEY environment variable is required and must be configured");
      }
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // Simple in-memory IP rate limiter for generation requests
  const apiRequestLimits = new Map<string, { count: number; resetTime: number }>();

  function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString();
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const maxRequests = 20; // Max 20 requests per minute per IP

    const record = apiRequestLimits.get(ip);
    if (!record || now > record.resetTime) {
      apiRequestLimits.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({ error: "Too many generation requests. Please slow down and try again in a minute." });
    }

    record.count += 1;
    next();
  }

  // Verify Firebase token & get user data
  async function verifyUser(req: express.Request, res: express.Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing or invalid Authorization header" });
      return null;
    }

    const token = authHeader.substring(7);
    try {
      const decodedToken = await getAdminAuth(firebaseApp).verifyIdToken(token);
      const userId = decodedToken.uid;
      
      const userData = await getFirestoreDoc(userId, token);
      
      let draftsCountByDay: Record<string, number> = {};
      let resumeText = "";

      if (userData) {
        draftsCountByDay = userData.draftsCountByDay || {};
        resumeText = userData.resumeText || "";
      }

      const localDateStr = req.body.localDateStr || new Date().toLocaleDateString('sv');

      return { userId, isPro: true, draftsCountByDay, localDateStr, resumeText, token };
    } catch (error: any) {
      console.error("Auth Verification Error:", error);
      res.status(401).json({ 
        error: `Unauthorized: Invalid firebase token - ${error.message}`,
        details: error.message
      });
      return null;
    }
  }

  // API Route: Generate Initial Draft
  app.post("/api/generate-draft", rateLimiter, async (req, res) => {
    try {
      const authResult = await verifyUser(req, res);
      if (!authResult) return;

      const { userProfile, contact, topic } = req.body;
      if (!userProfile || !contact) {
        return res.status(400).json({ error: "userProfile and contact are required fields" });
      }

      const achievementsStr = Array.isArray(userProfile.achievements)
        ? userProfile.achievements.join(", ")
        : userProfile.achievements || "";

      let resumeContext = "";
      if (authResult.resumeText) {
        resumeContext = `\n- Additional Resume Context: ${authResult.resumeText.substring(0, 3000)}`;
      }

      const prompt = `You are helping a student write a short, genuine cold email to a professional.
Goal/Topic:
- The specific topic/intent of this email is: ${topic || "Coffee Chat"}. Please adapt the phrasing, angle, and call to action to fit this goal perfectly (e.g., if the topic is "Referral", ask for advice on referrals or a recommendation; if "Coffee Chat", ask for a 15-minute conversation; if "Research Opportunity", express interest in their research; if "Internship Opportunity", ask about potential roles; if "Shadowing", ask for shadowing guidance).

Student Info:
- School: ${userProfile.school || "N/A"}
- Major: ${userProfile.major || "N/A"}
- Graduation Year: ${userProfile.gradYear || "N/A"}
- Bio/Focus: ${userProfile.bio || "N/A"}
- Key Achievements: ${achievementsStr}${resumeContext}

Recipient Info:
- Name: ${contact.name || "N/A"}
- Role: ${contact.role || "N/A"}
- Company: ${contact.company || "N/A"}
- Context (e.g. LinkedIn, bio, posts): ${contact.contextBlurb || "N/A"}

Write a subject line under 40 characters and a personalized email body under 125 words.
Constraints:
- Reference something specific from the recipient's context/achievements/LinkedIn bio.
- Briefly introduce the student in one sentence.
- Align the framing and call to action with the chosen topic/intent ("${topic || 'Coffee Chat'}").
- Keep the tone warm, direct, respectful, and genuine (not overly formal/stiff).
- DO NOT use generic filler phrases like "I hope this email finds you well" or "I hope you are having a great week". Start directly with a natural greeting (e.g., "Hi ${contact.name || 'there'},").
- STRICTLY DO NOT use any emojis, icons, or symbols under any circumstances. Keep the text clean and plain.`;

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjectLine: {
                type: Type.STRING,
                description: "A compelling, personalized subject line under 40 characters, containing absolutely no emojis."
              },
              emailBody: {
                type: Type.STRING,
                description: "A personalized, genuine email body under 125 words, containing absolutely no emojis."
              }
            },
            required: ["subjectLine", "emailBody"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No text returned from AI generator");
      }

      const data = JSON.parse(responseText.trim());

      // Increment daily & monthly draft counts in Firestore server-side on success
      const updatedDraftsByDay = {
        ...authResult.draftsCountByDay,
        [authResult.localDateStr]: (authResult.draftsCountByDay[authResult.localDateStr] || 0) + 1
      };

      const currentMonthStr = authResult.localDateStr.substring(0, 7);
      const userData = await getFirestoreDoc(authResult.userId, authResult.token);
      let draftsCountByMonth: Record<string, number> = {};
      if (userData) {
        draftsCountByMonth = userData.draftsCountByMonth || {};
      }
      const updatedDraftsByMonth = {
        ...draftsCountByMonth,
        [currentMonthStr]: (draftsCountByMonth[currentMonthStr] || 0) + 1
      };

      await saveFirestoreDoc(authResult.userId, {
        draftsCountByDay: updatedDraftsByDay,
        draftsCountByMonth: updatedDraftsByMonth
      }, authResult.token);

      res.json(data);
    } catch (error: any) {
      console.error("Error generating draft:", error);
      res.status(500).json({ error: error.message || "Failed to generate draft" });
    }
  });

  // API Route: Generate Follow-Up
  app.post("/api/generate-followup", rateLimiter, async (req, res) => {
    try {
      const authResult = await verifyUser(req, res);
      if (!authResult) return;

      const { contact, originalSubject, originalBody } = req.body;
      if (!contact) {
        return res.status(400).json({ error: "contact is a required field" });
      }

      const prompt = `Write a brief, friendly follow-up email bump to a professional who has not responded yet.
Recipient Info:
- Name: ${contact.name || "N/A"}
- Role: ${contact.role || "N/A"}
- Company: ${contact.company || "N/A"}

Original Subject: ${originalSubject || "N/A"}
Original Email Body: ${originalBody || "N/A"}

Constraints:
- Keep the email body under 60 words.
- Tone must be extremely light, polite, and constructive (no guilt-tripping or needy tone).
- Briefly reference the previous conversation request or ask one simple small follow-up question.
- No generic, spammy sentences. Start naturally.
- STRICTLY DO NOT use any emojis, icons, or symbols under any circumstances. Keep the text clean and plain.`;

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emailBody: {
                type: Type.STRING,
                description: "A brief, light follow-up bump email body under 60 words, containing absolutely no emojis."
              }
            },
            required: ["emailBody"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No text returned from AI generator");
      }

      const data = JSON.parse(responseText.trim());

      // Increment daily & monthly draft counts in Firestore server-side on success
      const updatedDraftsByDay = {
        ...authResult.draftsCountByDay,
        [authResult.localDateStr]: (authResult.draftsCountByDay[authResult.localDateStr] || 0) + 1
      };

      const currentMonthStr = authResult.localDateStr.substring(0, 7);
      const userData = await getFirestoreDoc(authResult.userId, authResult.token);
      let draftsCountByMonth: Record<string, number> = {};
      if (userData) {
        draftsCountByMonth = userData.draftsCountByMonth || {};
      }
      const updatedDraftsByMonth = {
        ...draftsCountByMonth,
        [currentMonthStr]: (draftsCountByMonth[currentMonthStr] || 0) + 1
      };

      await saveFirestoreDoc(authResult.userId, {
        draftsCountByDay: updatedDraftsByDay,
        draftsCountByMonth: updatedDraftsByMonth
      }, authResult.token);

      res.json(data);
    } catch (error: any) {
      console.error("Error generating follow-up:", error);
      res.status(500).json({ error: error.message || "Failed to generate follow-up" });
    }
  });

  // API Route: Generate Reply Response
  app.post("/api/generate-reply", rateLimiter, async (req, res) => {
    try {
      const authResult = await verifyUser(req, res);
      if (!authResult) return;

      const { contact, originalEmail, contactReply, userProfile } = req.body;
      if (!contact || !contactReply || !userProfile) {
        return res.status(400).json({ error: "contact, contactReply, and userProfile are required fields" });
      }

      const school = userProfile.school || "N/A";
      const major = userProfile.major || "N/A";
      const bio = userProfile.bio || "N/A";

      const prompt = `You are helping a student write a reply to someone who responded to their cold outreach email.
Original email sent: ${originalEmail || "N/A"}
Their reply: ${contactReply}
Student info: ${bio}, School: ${school}, Major: ${major}.

Write a natural, appropriately toned reply that directly addresses what they said. Keep it under 100 words, warm but not overly formal.
STRICTLY DO NOT use any emojis, icons, or symbols under any circumstances. Keep the text clean and plain.`;

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emailBody: {
                type: Type.STRING,
                description: "A natural reply email body under 100 words, containing absolutely no emojis."
              }
            },
            required: ["emailBody"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No text returned from AI generator");
      }

      const data = JSON.parse(responseText.trim());

      const updatedDraftsByDay = {
        ...authResult.draftsCountByDay,
        [authResult.localDateStr]: (authResult.draftsCountByDay[authResult.localDateStr] || 0) + 1
      };

      const currentMonthStr = authResult.localDateStr.substring(0, 7);
      const userData = await getFirestoreDoc(authResult.userId, authResult.token);
      let draftsCountByMonth: Record<string, number> = {};
      if (userData) {
        draftsCountByMonth = userData.draftsCountByMonth || {};
      }
      const updatedDraftsByMonth = {
        ...draftsCountByMonth,
        [currentMonthStr]: (draftsCountByMonth[currentMonthStr] || 0) + 1
      };

      await saveFirestoreDoc(authResult.userId, {
        draftsCountByDay: updatedDraftsByDay,
        draftsCountByMonth: updatedDraftsByMonth
      }, authResult.token);

      res.json(data);
    } catch (error: any) {
      console.error("Error generating reply response:", error);
      res.status(500).json({ error: error.message || "Failed to generate reply response" });
    }
  });

  // Get user status
  app.get("/api/user-status", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId is required" });
      }

      let resumeFileName = null;
      let resumeUploadedAt = null;
      let resumeText = null;
      let resumeBase64 = null;

      try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
        const userData = await getFirestoreDoc(userId, token);
        if (userData) {
          resumeFileName = userData.resumeFileName || null;
          resumeUploadedAt = userData.resumeUploadedAt || null;
          resumeText = userData.resumeText || null;
          resumeBase64 = userData.resumeBase64 || null;
        }
      } catch (dbError: any) {
        console.warn("Firestore read in /api/user-status failed:", dbError.message);
      }

      return res.json({
        isPro: true,
        resumeFileName,
        resumeUploadedAt,
        resumeText,
        resumeBase64
      });
    } catch (error: any) {
      console.error("Error checking user status:", error);
      res.status(500).json({ error: error.message || "Failed to get user status" });
    }
  });

  // Upload and parse PDF Resume
  app.post("/api/upload-resume", rateLimiter, async (req, res) => {
    try {
      const authResult = await verifyUser(req, res);
      if (!authResult) return;

      const { fileBase64, fileName } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "No file content provided" });
      }

      if (fileName && !fileName.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({ error: "Invalid file type. Only PDF resumes are supported." });
      }

      const sizeInBytes = (fileBase64.length * 3) / 4;
      if (sizeInBytes > 800 * 1024) {
        return res.status(400).json({ error: "File size exceeds the 800KB limit. Please upload a smaller PDF resume under 800KB." });
      }

      const buffer = Buffer.from(fileBase64, "base64");
      // @ts-ignore
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const extractedText = pdfData.text || "";

      await saveFirestoreDoc(authResult.userId, {
        resumeText: extractedText,
        resumeFileName: fileName || "resume.pdf",
        resumeUploadedAt: new Date().toISOString(),
        resumeBase64: fileBase64
      }, authResult.token);

      return res.json({
        success: true,
        message: "Resume processed successfully!",
        resumeFileName: fileName || "resume.pdf",
        resumeUploadedAt: new Date().toISOString(),
        resumeText: extractedText,
        resumeBase64: fileBase64
      });
    } catch (parseError: any) {
      console.error("PDF Parsing Error:", parseError);
      return res.status(500).json({ error: `Failed to extract text from PDF: ${parseError.message}` });
    }
  });

  // Delete uploaded PDF Resume
  app.post("/api/delete-resume", async (req, res) => {
    try {
      const authResult = await verifyUser(req, res);
      if (!authResult) return;

      await saveFirestoreDoc(authResult.userId, {
        resumeText: null,
        resumeFileName: null,
        resumeUploadedAt: null,
        resumeBase64: null
      }, authResult.token);

      return res.json({ success: true, message: "Resume removed successfully!" });
    } catch (err: any) {
      console.error("Delete resume error:", err);
      return res.status(500).json({ error: err.message || "Failed to remove resume" });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
