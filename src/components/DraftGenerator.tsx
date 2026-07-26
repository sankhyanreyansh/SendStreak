import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Sparkles, Mail, Copy, Check, ExternalLink, Flame, Users, AlertCircle, RefreshCw } from "lucide-react";
import { Contact, UserProfile, Draft, StreakData } from "../types";
import { auth, fetchWithAuth } from "../firebase";

interface DraftGeneratorProps {
  contacts: Contact[];
  userProfile: UserProfile | null;
  drafts: Record<string, Draft>;
  onSaveDraft: (contactId: string, subject: string, body: string, edited: boolean) => void;
  onMarkAsSent: (contactId: string, gmailThreadId?: string) => void;
  onNavigate: (tab: string) => void;
  selectedContactFromProps: Contact | null;
  gmailUser: any;
  gmailToken: string | null;
  onConnectGmail: () => Promise<any>;
  onGmailTokenExpired?: () => void;
  onUpdateContactEmail: (id: string, email: string) => void;
  isPro?: boolean;
  streak: StreakData;
  draftsCountToday?: number;
  onIncrementDraftsCount?: () => void;
}

const TOPIC_OPTIONS = [
  { value: "Coffee Chat", label: "Coffee Chat" },
  { value: "Internship Opportunity", label: "Internship Opportunity" },
  { value: "Shadowing", label: "Shadowing" },
  { value: "Research Opportunity", label: "Research Opportunity" },
  { value: "Referral", label: "Referral" },
  { value: "Other", label: "Other (Custom...)" }
];

export default function DraftGenerator({
  contacts,
  userProfile,
  drafts,
  onSaveDraft,
  onMarkAsSent,
  onNavigate,
  selectedContactFromProps,
  gmailUser,
  gmailToken,
  onConnectGmail,
  onGmailTokenExpired,
  onUpdateContactEmail,
  isPro = false,
  streak,
  draftsCountToday = 0,
  onIncrementDraftsCount
}: DraftGeneratorProps) {
  // Backlog contacts (not sent yet)
  const backlogContacts = contacts.filter(c => c.status === "not_sent");

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [otherTopicText, setOtherTopicText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [tempEmail, setTempEmail] = useState("");
  const [isSendingGmail, setIsSendingGmail] = useState(false);

  // Sync tempEmail when contact changes
  useEffect(() => {
    if (selectedContact) {
      setTempEmail(selectedContact.email || "");
    }
  }, [selectedContact]);

  // Encouraging loading messages
  const loadingMessages = [
    "Reading their background context...",
    "Injecting your educational profile...",
    "Weaving in your proud accomplishments...",
    "Drafting low-commitment meeting request...",
    "Perfecting natural professional vibes..."
  ];

  // Sync selected contact from props if passed
  useEffect(() => {
    if (selectedContactFromProps && selectedContactFromProps.status === "not_sent") {
      setSelectedContact(selectedContactFromProps);
    } else if (backlogContacts.length > 0 && !selectedContact) {
      setSelectedContact(backlogContacts[0]);
    }
  }, [selectedContactFromProps, contacts]);

  // Load existing draft if selected contact changes
  useEffect(() => {
    if (selectedContact) {
      const existing = drafts[selectedContact.id];
      if (existing) {
        setSubject(existing.subjectLine);
        setBody(existing.emailBody);
      } else {
        setSubject("");
        setBody("");
      }
      setSelectedTopic("");
      setOtherTopicText("");
      setError("");
    }
  }, [selectedContact, drafts]);

  // Handle loading steps animation
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % loadingMessages.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Generate Draft via API call
  const handleGenerateDraft = async () => {
    if (!selectedContact) return;
    if (!userProfile) {
      setError("Please complete your User Profile first under Settings!");
      return;
    }

    if (isPro) {
      if (draftsCountToday >= 30) {
        setError("Daily AI generation limit reached: Pro Tier is limited to 30 AI generations per day.");
        return;
      }
    } else {
      if (draftsCountToday >= 5) {
        setError("Daily AI generation limit reached: Free Tier is limited to 5 AI generations per day. Upgrade to Pro on your Profile page to get 30 AI generations per day!");
        return;
      }
    }

    const resolvedTopic = selectedTopic === "Other" ? otherTopicText.trim() : selectedTopic;
    if (!resolvedTopic) {
      setError("Please select or specify an email topic first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const token = await auth.currentUser?.getIdToken(true);
      const response = await fetchWithAuth("/api/generate-draft", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          userProfile,
          contact: selectedContact,
          topic: resolvedTopic,
          localDateStr: new Date().toLocaleDateString('sv')
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Server failed to generate your draft email.");
      }

      const data = await response.json();
      setSubject(data.subjectLine || "");
      setBody(data.emailBody || "");
      onSaveDraft(selectedContact.id, data.subjectLine || "", data.emailBody || "", false);
      if (onIncrementDraftsCount) {
        onIncrementDraftsCount();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during generation. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle content edits
  const handleSubjectChange = (val: string) => {
    setSubject(val);
    if (selectedContact) {
      onSaveDraft(selectedContact.id, val, body, true);
    }
  };

  const handleBodyChange = (val: string) => {
    setBody(val);
    if (selectedContact) {
      onSaveDraft(selectedContact.id, subject, val, true);
    }
  };

  // Copy to Clipboard
  const handleCopyToClipboard = async () => {
    const fullText = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  // Mark as Sent
  const handleSentAction = () => {
    if (!selectedContact) return;

    if (isPro) {
      if (streak.sentToday >= 30) {
        alert("Daily cold email limit reached: Pro Tier is limited to 30 initial cold email sends per day.");
        return;
      }
    } else {
      if (streak.sentToday >= 3) {
        alert("Daily cold email limit reached: Free Tier is limited to 3 initial cold email sends per day. Upgrade to Pro on your Profile page to get 30 initial cold email sends per day!");
        return;
      }
    }

    onMarkAsSent(selectedContact.id);
    setJustSent(true);
    setTimeout(() => {
      setJustSent(false);
      // Select the next contact in the backlog if available
      const nextBacklog = backlogContacts.filter(c => c.id !== selectedContact.id);
      if (nextBacklog.length > 0) {
        setSelectedContact(nextBacklog[0]);
      } else {
        setSelectedContact(null);
      }
    }, 2500);
  };

  const handleSendViaGmail = async () => {
    if (!selectedContact) return;

    if (isPro) {
      if (streak.sentToday >= 30) {
        alert("Daily cold email limit reached: Pro Tier is limited to 30 initial cold email sends per day.");
        return;
      }
    } else {
      if (streak.sentToday >= 3) {
        alert("Daily cold email limit reached: Free Tier is limited to 3 initial cold email sends per day. Upgrade to Pro on your Profile page to get 30 initial cold email sends per day!");
        return;
      }
    }

    const recipientEmail = selectedContact.email || tempEmail;
    if (!recipientEmail || !recipientEmail.trim()) {
      setError("Please save an email address for this prospect first!");
      return;
    }

    let token = gmailToken;
    let currentUser = gmailUser;

    if (!token || !currentUser) {
      try {
        const result = await onConnectGmail();
        if (result) {
          token = result.accessToken;
          currentUser = result.user;
        } else {
          setError("Failed to connect your Gmail account. Please try again.");
          return;
        }
      } catch (err: any) {
        setError(err.message || "Failed to authenticate with Google.");
        return;
      }
    }

    if (!token) {
      setError("Authorization token is missing. Please reconnect Gmail.");
      return;
    }

    if (isPro && userProfile?.attachResume && (!userProfile?.resumeBase64 || !userProfile?.resumeName)) {
      setError("You have enabled 'Attach Resume' in Settings, but no resume file is uploaded. Please upload a PDF resume in your Student Profile first, or disable the option.");
      return;
    }

    setIsSendingGmail(true);
    setError("");

    try {
      // Convert plain text to clean, email-safe, full-width responsive HTML with no fixed wrappers
      const escapedBody = body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      const htmlBody = escapedBody.split("\n").join("<br />");

      // 1. Build MIME (either simple or multipart with resume attachment)
      let base64Safe = "";

      if (isPro && userProfile?.attachResume && userProfile?.resumeBase64 && userProfile?.resumeName) {
        const boundary = "foo_bar_baz_boundary_" + Date.now().toString(16);
        
        let rawBase64 = userProfile.resumeBase64;
        if (rawBase64.indexOf(",") !== -1) {
          rawBase64 = rawBase64.substring(rawBase64.indexOf(",") + 1);
        }
        rawBase64 = rawBase64.replace(/\s/g, "");

        const parts = [
          `To: ${recipientEmail.trim()}`,
          `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          "Content-Type: text/html; charset=UTF-8",
          "Content-Transfer-Encoding: 7bit",
          "",
          htmlBody,
          "",
          `--${boundary}`,
          `Content-Type: application/pdf; name="${userProfile.resumeName}"`,
          `Content-Disposition: attachment; filename="${userProfile.resumeName}"`,
          "Content-Transfer-Encoding: base64",
          "",
          rawBase64,
          "",
          `--${boundary}--`
        ];

        const messageStr = parts.join("\r\n");
        base64Safe = btoa(unescape(encodeURIComponent(messageStr)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      } else {
        const parts = [
          `To: ${recipientEmail.trim()}`,
          `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
          "MIME-Version: 1.0",
          "Content-Type: text/html; charset=UTF-8",
          "Content-Transfer-Encoding: 7bit",
          "",
          htmlBody
        ];

        const messageStr = parts.join("\r\n");
        base64Safe = btoa(unescape(encodeURIComponent(messageStr)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }

      // 2. Send via Gmail API
      let res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          raw: base64Safe
        })
      });

      if (res.status === 401) {
        console.warn("Gmail token expired on sending. Attempting refresh...");
        if (onGmailTokenExpired) {
          onGmailTokenExpired();
        }
        try {
          const result = await onConnectGmail();
          if (result && result.accessToken) {
            token = result.accessToken;
            // Retry sending with new token
            res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                raw: base64Safe
              })
            });
          } else {
            throw new Error("Gmail session expired. Please reconnect Gmail to send.");
          }
        } catch (reAuthErr: any) {
          throw new Error("Gmail session expired. Please reconnect Gmail to send.");
        }
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || "Failed to send email via Gmail API.");
      }

      const data = await res.json();
      const returnedThreadId = data.threadId;

      // 3. Complete and Mark as Sent automatically
      onMarkAsSent(selectedContact.id, returnedThreadId);
      
      setJustSent(true);
      setTimeout(() => {
        setJustSent(false);
        const nextBacklog = backlogContacts.filter(c => c.id !== selectedContact.id);
        if (nextBacklog.length > 0) {
          setSelectedContact(nextBacklog[0]);
        } else {
          setSelectedContact(null);
        }
      }, 2500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong while sending via Gmail. You can use Copy or mailto instead.");
    } finally {
      setIsSendingGmail(false);
    }
  };

  // Word count check
  const wordCount = body ? body.split(/\s+/).filter(Boolean).length : 0;

  // Build Mailto link
  const mailtoLink = selectedContact
    ? `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "#";

  const isGenerateDisabled = !selectedTopic || (selectedTopic === "Other" && !otherTopicText.trim());

  if (backlogContacts.length === 0 && !selectedContact && !justSent) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 md:p-12 text-center max-w-xl mx-auto font-sans" id="draft_empty_backlog">
        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mx-auto mb-4 animate-bounce-slow">
          <Mail className="w-8 h-8" />
        </div>
        <h2 className="font-display text-2xl font-bold text-slate-800">Backlog Fully Cleared!</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          You don't have any pending prospects to cold-email. Add some new professionals on the Directory tab to generate more pitches.
        </p>
        <button
          id="draft_add_prospects_btn"
          onClick={() => onNavigate("contacts")}
          className="mt-6 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-6 rounded-xl text-sm transition-colors cursor-pointer"
        >
          Add New Prospects
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 font-sans" id="draft_generator_panel">
      
      {/* Success Celebration Alert Overlay */}
      {justSent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-100 relative"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4 relative">
              <div className="absolute -inset-1.5 bg-emerald-400 rounded-full blur-md opacity-35 animate-ring-glow" />
              <Flame className="w-10 h-10 fill-emerald-500" />
            </div>
            <h3 className="font-display text-2xl font-extrabold text-slate-800 tracking-tight">Email Sent!</h3>
            <p className="text-slate-500 text-sm mt-2">
              Stat incremented and daily streak updated. Your habit is building momentum!
            </p>
            <div className="mt-4 bg-orange-50 rounded-xl p-3 text-xs font-semibold text-orange-700 inline-flex items-center gap-1">
              <span>Streak Protection Active</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Left Panel: Contact selector & pasted details */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5" id="prospect_selector_card">
          <h2 className="font-display text-base font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <Users className="w-5 h-5 text-orange-500" /> Select Recipient
          </h2>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {backlogContacts.map((c) => (
              <button
                id={`recipient_select_${c.id}`}
                key={c.id}
                onClick={() => setSelectedContact(c)}
                className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex flex-col gap-1 cursor-pointer ${
                  selectedContact?.id === c.id
                    ? "bg-orange-50 border-orange-300 ring-2 ring-orange-500/10 font-medium"
                    : "bg-slate-50 border-slate-100 hover:bg-slate-100/70"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-bold text-slate-800 truncate pr-2">{c.name}</span>
                  {drafts[c.id] && (
                    <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md shrink-0">Draft saved</span>
                  )}
                </div>
                <div className="text-slate-500 truncate">{c.role} at <strong className="text-slate-600 font-semibold">{c.company}</strong></div>
              </button>
            ))}
          </div>
        </div>

        {selectedContact && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4" id="prospect_meta_card">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Professional Context</h3>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs text-slate-600 max-h-[160px] overflow-y-auto leading-relaxed">
                {selectedContact.contextBlurb}
              </div>
            </div>
            
            <div className="text-[11px] text-slate-400">
              AI will use this specific LinkedIn or corporate background details to write a highly targeted, relevant draft.
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: Editor Area */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="draft_editor_card">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-3 border-red-500 text-red-700 text-sm rounded-r-xl flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {selectedContact ? (
            <>
              {/* Topic / Intent Dropdown (Required) */}
              <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left" id="email_topic_selector">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Email Topic / Intent <span className="text-orange-500 font-extrabold">*</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    id="topic_dropdown"
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800"
                  >
                    <option value="">-- Choose Cold Email Topic --</option>
                    {TOPIC_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  {selectedTopic === "Other" && (
                    <input
                      id="custom_topic_input"
                      type="text"
                      placeholder="e.g. Career Mentorship, Pitch, etc."
                      value={otherTopicText}
                      onChange={(e) => setOtherTopicText(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800"
                    />
                  )}
                </div>
              </div>

              {/* Draft state controller */}
              {!subject && !body && !isLoading ? (
                <div className="text-center py-20" id="draft_generate_landing">
                  <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mx-auto mb-4">
                    <Sparkles className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-slate-800">Ready to Personalize?</h3>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1">
                    Generate an email for <strong>{selectedContact.name}</strong> referencing their unique achievements and professional background.
                  </p>
                  <button
                    id="trigger_generate_btn"
                    onClick={handleGenerateDraft}
                    disabled={isGenerateDisabled}
                    className={`mt-6 text-white text-sm font-bold py-3 px-6 rounded-xl shadow-md flex items-center gap-2 mx-auto cursor-pointer transition-all ${
                      isGenerateDisabled
                        ? "bg-slate-350 cursor-not-allowed opacity-60 shadow-none"
                        : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-orange-100"
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-white fill-white" /> Generate AI Personalization
                  </button>

                  {!isPro && (
                    <div className="text-slate-400 text-[11px] mt-3 space-y-1">
                      <p>AI generations today: <strong className="text-slate-600 font-bold">{draftsCountToday} / 5</strong></p>
                    </div>
                  )}

                  {isPro && (
                    <div className="text-slate-400 text-[11px] mt-3 space-y-1">
                      <p>AI generations today: <strong className="text-slate-600 font-bold">{draftsCountToday} / 30</strong></p>
                    </div>
                  )}
                </div>
              ) : isLoading ? (
                /* Dynamic loading animation step */
                <div className="text-center py-24 space-y-4" id="draft_generate_loading">
                  <div className="relative w-16 h-16 mx-auto">
                    <div className="absolute inset-0 bg-orange-500 rounded-full blur-lg opacity-25 animate-ping" />
                    <div className="w-16 h-16 bg-orange-500 text-white rounded-full flex items-center justify-center animate-spin relative z-10">
                      <RefreshCw className="w-7 h-7" />
                    </div>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-800">Generating draft...</h3>
                  <p className="text-orange-500 text-xs font-semibold animate-pulse">
                    {loadingMessages[loadingStep]}
                  </p>
                </div>
              ) : (
                /* Active Editor */
                <div className="space-y-5" id="draft_generate_editor">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-800 flex items-center gap-1.5">
                        <Sparkles className="w-5 h-5 text-orange-500 fill-orange-500" /> Personalized Draft
                      </h2>
                      <p className="text-slate-500 text-xs mt-0.5">Recapping achievements for <strong>{selectedContact.name}</strong></p>
                    </div>
                    
                    <button
                      id="regenerate_draft_btn"
                      onClick={handleGenerateDraft}
                      disabled={isGenerateDisabled}
                      className={`text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                        isGenerateDisabled
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Re-Draft
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Subject Line</label>
                      <input
                        id="editor_subject"
                        type="text"
                        value={subject}
                        onChange={(e) => handleSubjectChange(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-800"
                        placeholder="Subject Line"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Email Body</label>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          wordCount > 130 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                        }`}>
                          {wordCount} words (ideal: 100-125)
                        </span>
                      </div>
                      <textarea
                        id="editor_body"
                        rows={10}
                        value={body}
                        onChange={(e) => handleBodyChange(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 font-sans"
                        placeholder="Personalized email body will appear here..."
                      />
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex flex-col gap-4 border-t border-slate-100 pt-5">
                    {/* Inline email address setup if missing */}
                    {!selectedContact.email && (
                      <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-0.5 text-left">
                          <div className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 text-amber-600" /> Missing Email Address
                          </div>
                          <div className="text-xs text-amber-700">Please provide {selectedContact.name}'s email to enable direct sending.</div>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            placeholder="e.g. sarah@stripe.com"
                            value={tempEmail}
                            onChange={(e) => setTempEmail(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 font-semibold"
                          />
                          <button
                            onClick={() => {
                              if (tempEmail.trim()) {
                                onUpdateContactEmail(selectedContact.id, tempEmail.trim());
                              }
                            }}
                            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Button 1: Copy to Clipboard */}
                      <button
                        id="editor_copy_btn"
                        onClick={handleCopyToClipboard}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" /> Copy Email Text
                          </>
                        )}
                      </button>

                      {/* Button 2: Mailto Fallback */}
                      <a
                        id="editor_mailto_btn"
                        href={mailtoLink}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4 text-slate-400" /> Send via mailto
                      </a>

                      {/* Button 3: Send via Gmail */}
                      <button
                        id="editor_gmail_send_btn"
                        onClick={handleSendViaGmail}
                        disabled={isSendingGmail || (!selectedContact.email && !tempEmail.trim())}
                        className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-orange-100 cursor-pointer"
                      >
                        {isSendingGmail ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Sending...
                          </>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" /> Send via Gmail
                          </>
                        )}
                      </button>
                    </div>

                    {/* Manual Mark as Sent Row */}
                    <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs mt-2">
                      <span className="text-slate-500 font-medium">Sent manually instead? Update your streak status:</span>
                      <button
                        id="editor_mark_sent_btn"
                        onClick={handleSentAction}
                        className="text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Flame className="w-4.5 h-4.5 fill-orange-500/20" /> Mark Sent Manually
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24 text-slate-400 text-sm">
              Select a prospect from the backlog on the left to personalize.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
