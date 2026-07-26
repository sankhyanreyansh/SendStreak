import React, { useState } from "react";
import { motion } from "motion/react";
import { Clock, Calendar, Check, Copy, ExternalLink, RefreshCw, AlertCircle, MessageSquare, PhoneCall, Sparkles, Mail } from "lucide-react";
import { Contact, Draft, ContactStatus, StreakData, UserProfile } from "../types";
import { getLocalDateString, formatReadableDate } from "../utils";
import { auth, fetchWithAuth } from "../firebase";

interface FollowUpProps {
  contacts: Contact[];
  drafts: Record<string, Draft>;
  onUpdateStatus: (id: string, status: ContactStatus, followUpDueDate?: string) => void;
  onUpdateContactFields?: (id: string, fields: Partial<Contact>) => void;
  gmailUser: any;
  gmailToken: string | null;
  onConnectGmail: () => Promise<any>;
  onGmailTokenExpired?: () => void;
  isPro?: boolean;
  streak: StreakData;
  draftsCountToday?: number;
  onIncrementDraftsCount?: () => void;
  userProfile?: UserProfile | null;
}

export default function FollowUp({
  contacts,
  drafts,
  onUpdateStatus,
  onUpdateContactFields,
  gmailUser,
  gmailToken,
  onConnectGmail,
  onGmailTokenExpired,
  isPro = false,
  streak,
  draftsCountToday = 0,
  onIncrementDraftsCount,
  userProfile
}: FollowUpProps) {
  const today = getLocalDateString();

  // Active follow-up states
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [followUpBody, setFollowUpBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"due" | "tracking">("due");

  // Contacts that need follow-up today or earlier (status === "sent")
  const dueContacts = contacts.filter(c => 
    c.status === "sent" && 
    c.followUpDueDate && 
    c.followUpDueDate <= today
  );

  // Contacts that are sent or followed up but followUpDueDate is in the future
  const trackingContacts = contacts.filter(c => 
    (c.status === "sent" && c.followUpDueDate && c.followUpDueDate > today) ||
    c.status === "followed_up"
  );

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setFollowUpBody("");
    setError("");
  };

  // Generate Follow-Up via API
  const handleGenerateFollowUp = async () => {
    if (!selectedContact) return;

    const currentGens = selectedContact.followUpGenerationsCount || 0;
    if (isPro) {
      if (currentGens >= 3) {
        setError("Prospect follow-up limit reached: Pro Tier is limited to 3 AI follow-up generations per prospect.");
        return;
      }
      if (draftsCountToday >= 30) {
        setError("Daily AI generation limit reached: Pro Tier is limited to 30 AI generations per day.");
        return;
      }
    } else {
      if (currentGens >= 1) {
        setError("Prospect follow-up limit reached: Free Tier is limited to 1 AI follow-up generation per prospect. Upgrade to Pro on your Profile page to get 3 AI follow-up generations per prospect!");
        return;
      }
      if (draftsCountToday >= 5) {
        setError("Daily AI generation limit reached: Free Tier is limited to 5 AI generations per day. Upgrade to Pro on your Profile page to get 30 AI generations per day!");
        return;
      }
    }

    setIsLoading(true);
    setError("");

    // Look up original draft if available
    const originalDraft = drafts[selectedContact.id];
    const originalSubject = originalDraft?.subjectLine || "Networking request / Chat";
    const originalBody = originalDraft?.emailBody || "";

    try {
      const token = await auth.currentUser?.getIdToken(true);
      const response = await fetchWithAuth("/api/generate-followup", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          contact: selectedContact,
          originalSubject,
          originalBody,
          localDateStr: new Date().toLocaleDateString('sv')
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Server failed to generate follow-up email.");
      }

      const data = await response.json();
      setFollowUpBody(data.emailBody || "");
      if (onIncrementDraftsCount) {
        onIncrementDraftsCount();
      }

      const nextCount = currentGens + 1;
      if (onUpdateContactFields) {
        onUpdateContactFields(selectedContact.id, {
          followUpGenerationsCount: nextCount
        });
      }
      setSelectedContact(prev => prev ? { ...prev, followUpGenerationsCount: nextCount } : null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate follow-up bump. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Copy to Clipboard
  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(followUpBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  // Mark as Followed Up
  const handleFollowedUpAction = () => {
    if (!selectedContact) return;

    // Advance status to followed_up and push follow-up date into future based on settings
    const delayDays = userProfile?.followUpDelayDays || 7;
    const d = new Date();
    d.setDate(d.getDate() + delayDays);
    const nextDueDate = d.toISOString().split("T")[0];

    onUpdateStatus(selectedContact.id, "followed_up", nextDueDate);
    
    // Reset state
    setSelectedContact(null);
    setFollowUpBody("");
  };

  const [isSendingGmail, setIsSendingGmail] = useState(false);

  const handleSendFollowUpViaGmail = async () => {
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

    const recipientEmail = selectedContact.email;
    if (!recipientEmail || !recipientEmail.trim()) {
      setError("Please save an email address for this prospect first on the Prospects page!");
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

    setIsSendingGmail(true);
    setError("");

    try {
      const originalDraft = drafts[selectedContact.id];
      const fallbackSubject = originalDraft ? `Re: ${originalDraft.subjectLine}` : "Following up on my previous note";
      
      let subjectToUse = fallbackSubject;
      let parentMessageId = "";
      const threadId = selectedContact.gmailThreadId;

      if (threadId) {
        try {
          const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (threadRes.ok) {
            const threadData = await threadRes.json();
            const messages = threadData.messages || [];
            if (messages.length > 0) {
              const lastMessage = messages[messages.length - 1];
              const headers = lastMessage.payload?.headers || [];
              const msgIdHeader = headers.find((h: any) => h.name.toLowerCase() === "message-id")?.value;
              if (msgIdHeader) {
                parentMessageId = msgIdHeader;
              }
              const origSubject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value;
              if (origSubject) {
                subjectToUse = origSubject.toLowerCase().startsWith("re:") ? origSubject : `Re: ${origSubject}`;
              }
            }
          }
        } catch (e) {
          console.error("Error fetching original thread for follow-up:", e);
        }
      }

      // Convert plain text to clean, email-safe, full-width responsive HTML with no fixed wrappers
      const escapedBody = followUpBody
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      const htmlFollowUpBody = escapedBody.split("\n").join("<br />");

      // Build MIME
      const parts = [
        `To: ${recipientEmail.trim()}`,
        `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subjectToUse)))}?=`,
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit"
      ];

      if (parentMessageId) {
        parts.push(`In-Reply-To: ${parentMessageId}`);
        parts.push(`References: ${parentMessageId}`);
      }

      parts.push("");
      parts.push(htmlFollowUpBody);

      const messageStr = parts.join("\r\n");
      const base64Safe = btoa(unescape(encodeURIComponent(messageStr)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const sendBody: any = { raw: base64Safe };
      if (threadId) {
        sendBody.threadId = threadId;
      }

      let res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(sendBody)
      });

      if (res.status === 401) {
        console.warn("Gmail token expired on follow-up sending. Attempting refresh...");
        if (onGmailTokenExpired) {
          onGmailTokenExpired();
        }
        try {
          const result = await onConnectGmail();
          if (result && result.accessToken) {
            token = result.accessToken;
            // Retry sending follow-up with new token
            res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(sendBody)
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
        throw new Error(errData.error?.message || "Failed to send follow-up via Gmail API.");
      }

      handleFollowedUpAction();

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to send follow-up via Gmail.");
    } finally {
      setIsSendingGmail(false);
    }
  };

  // Mark as Replied
  const handleMarkReplied = (contactId: string) => {
    onUpdateStatus(contactId, "replied");
    if (selectedContact?.id === contactId) {
      setSelectedContact(null);
      setFollowUpBody("");
    }
  };

  // Build Mailto link for followup
  const originalDraft = selectedContact ? drafts[selectedContact.id] : null;
  const followupSubject = originalDraft ? `Re: ${originalDraft.subjectLine}` : "Following up on my previous note";
  const mailtoLink = selectedContact
    ? `mailto:?subject=${encodeURIComponent(followupSubject)}&body=${encodeURIComponent(followUpBody)}`
    : "#";

  const wordCount = followUpBody ? followUpBody.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 font-sans" id="followup_panel">
      
      {/* Left Panel: Lists */}
      <div className="xl:col-span-5 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="followup_queue_card">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-800">Follow-Up Pipeline</h2>
              <p className="text-slate-500 text-xs mt-0.5">A light bump gets replies</p>
            </div>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>

          {/* Tab buttons */}
          <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
            <button
              onClick={() => { setActiveTab("due"); setSelectedContact(null); }}
              className={`py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                activeTab === "due" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Due Today ({dueContacts.length})
            </button>
            <button
              onClick={() => { setActiveTab("tracking"); setSelectedContact(null); }}
              className={`py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                activeTab === "tracking" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              All Sent ({trackingContacts.length})
            </button>
          </div>

          {/* Render List */}
          {activeTab === "due" ? (
            dueContacts.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-slate-700 font-bold text-sm">All caught up!</p>
                <p className="text-slate-400 text-xs mt-1 px-4">
                  No prospects are due for a follow-up today. Way to go!
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {dueContacts.map((c) => (
                  <div 
                    key={c.id}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex justify-between items-start gap-4 ${
                      selectedContact?.id === c.id
                        ? "bg-amber-50 border-amber-300 ring-2 ring-amber-500/10"
                        : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <button 
                        onClick={() => handleSelectContact(c)}
                        className="w-full text-left cursor-pointer focus:outline-none"
                      >
                        <div className="font-bold text-slate-800 text-sm truncate">{c.name}</div>
                        <div className="text-slate-500 text-xs truncate">
                          {c.role} at <strong>{c.company}</strong>
                        </div>
                        <div className="text-[10px] text-amber-600 font-semibold mt-1.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Due {formatReadableDate(c.followUpDueDate || "")}
                        </div>
                      </button>
                    </div>

                    <div className="flex gap-1">
                      <button
                        id={`due_replied_${c.id}`}
                        onClick={() => handleMarkReplied(c.id)}
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 p-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0"
                        title="Mark as Replied"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            trackingContacts.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                You haven't sent any cold-emails to track yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {trackingContacts.map((c) => (
                  <div 
                    key={c.id}
                    className={`p-3.5 rounded-xl border transition-all flex justify-between items-start gap-4 ${
                      selectedContact?.id === c.id
                        ? "bg-amber-50 border-amber-300"
                        : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <button 
                        onClick={() => handleSelectContact(c)}
                        className="w-full text-left cursor-pointer focus:outline-none"
                      >
                        <div className="font-bold text-slate-800 text-sm truncate">{c.name}</div>
                        <div className="text-slate-500 text-xs truncate">
                          {c.role} at <strong>{c.company}</strong>
                        </div>
                        <div className="flex gap-2 items-center flex-wrap mt-1.5">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                            c.status === "followed_up" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {c.status === "followed_up" ? "Followed Up" : "Sent"}
                          </span>
                          {c.followUpDueDate && (
                            <span className="text-[10px] text-slate-400">
                              Next: {formatReadableDate(c.followUpDueDate)}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        id={`track_replied_${c.id}`}
                        onClick={() => handleMarkReplied(c.id)}
                        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 p-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                        title="Mark as Replied"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Right Panel: Follow-Up Composer */}
      <div className="xl:col-span-7">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 min-h-[360px] flex flex-col justify-between" id="followup_composer_card">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border-l-3 border-red-500 text-red-700 text-xs rounded-r-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {selectedContact ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              
              <div>
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-display font-bold text-slate-800 text-base">
                        Bump Outlook for {selectedContact.name}
                      </h3>
                      <p className="text-slate-500 text-xs">
                        {selectedContact.role} at {selectedContact.company}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg">
                      {selectedContact.status === "followed_up" ? "Followup #2" : "Followup #1"}
                    </span>
                  </div>
                </div>

                {!followUpBody && !isLoading ? (
                  <div className="text-center py-16" id="followup_composer_landing">
                    <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-slate-600 font-bold text-sm">Need a polite follow-up?</p>
                    <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                      Our AI will draft a highly professional, brief bump under 60 words to revive the conversation.
                    </p>
                    <button
                      id="generate_bump_btn"
                      onClick={handleGenerateFollowUp}
                      className="mt-5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 fill-white" /> Draft Polite Bump
                    </button>
                    <div className="text-[10px] text-slate-400 font-medium mt-3">
                      AI Generations used for this prospect: {selectedContact.followUpGenerationsCount || 0} / {isPro ? 3 : 1}
                    </div>
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-20" id="followup_composer_loading">
                    <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-800 font-bold text-sm">Drafting bump...</p>
                    <p className="text-slate-400 text-xs mt-1">Applying warm, respectful tone to stay professional</p>
                  </div>
                ) : (
                  <div className="space-y-4" id="followup_composer_editor">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          Polite Bump Text
                          <span className="text-[9px] font-normal text-slate-400 capitalize">
                            (AI Drafts: {selectedContact.followUpGenerationsCount || 0} / {isPro ? 3 : 1})
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          {((selectedContact.followUpGenerationsCount || 0) < (isPro ? 3 : 1)) && (
                            <button
                              onClick={handleGenerateFollowUp}
                              disabled={isLoading}
                              className="text-[10px] text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 cursor-pointer hover:underline disabled:text-slate-400"
                            >
                              <RefreshCw className="w-3 h-3 animate-none" /> Re-draft ({isPro ? 3 - (selectedContact.followUpGenerationsCount || 0) : 1 - (selectedContact.followUpGenerationsCount || 0)} left)
                            </button>
                          )}
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                            wordCount > 60 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                          }`}>
                            {wordCount} words (ideal: &lt;60 words)
                          </span>
                        </div>
                      </div>
                      <textarea
                        id="followup_editor_body"
                        rows={7}
                        value={followUpBody}
                        onChange={(e) => setFollowUpBody(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-slate-700"
                        placeholder="Follow-up draft will appear here..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {followUpBody && !isLoading && (
                <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 mt-4" id="followup_composer_actions">
                  {!selectedContact.email && (
                    <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100 text-xs text-amber-800 text-left">
                      <AlertCircle className="w-4 h-4 text-amber-600 inline mr-1.5 align-text-bottom" />
                      Please add an email address for <strong>{selectedContact.name}</strong> under the Directory tab first to enable direct sending.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      id="followup_copy_btn"
                      onClick={handleCopyToClipboard}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Bump Text
                        </>
                      )}
                    </button>

                    <a
                      id="followup_mailto_btn"
                      href={mailtoLink}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1 transition-all text-center cursor-pointer"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" /> Send via mailto
                    </a>

                    <button
                      id="followup_gmail_send_btn"
                      onClick={handleSendFollowUpViaGmail}
                      disabled={isSendingGmail || !selectedContact.email}
                      className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-orange-100 cursor-pointer"
                    >
                      {isSendingGmail ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5" /> Send via Gmail
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
                    <span className="text-slate-500 font-medium">Sent manually instead? Update your tracker status:</span>
                    <button
                      id="followup_mark_sent_btn"
                      onClick={handleFollowedUpAction}
                      className="text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      Mark Followed Up Manually
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="text-center py-24 text-slate-400 text-sm">
              Select a prospect from the due list on the left to draft a follow-up.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
