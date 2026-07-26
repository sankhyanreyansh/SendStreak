import React, { useState } from "react";
import { Sparkles, MessageSquare, Mail, PhoneCall, X, Trash2, Clock, Copy, ExternalLink, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Contact, ContactStatus, UserProfile, Draft, StreakData } from "../types";
import { auth, fetchWithAuth } from "../firebase";

interface RepliesProps {
  contacts: Contact[];
  userProfile?: UserProfile | null;
  drafts?: Record<string, Draft>;
  onUpdateStatus: (id: string, status: ContactStatus) => void;
  onUpdateContactFields?: (id: string, fields: Partial<Contact>) => void;
  gmailUser?: any;
  gmailToken?: any;
  onConnectGmail?: () => Promise<any>;
  onGmailTokenExpired?: () => void;
  isPro?: boolean;
  draftsCountToday?: number;
  streak?: StreakData;
  onIncrementDraftsCount?: () => void;
}

export default function Replies({
  contacts,
  userProfile,
  drafts = {},
  onUpdateStatus,
  onUpdateContactFields = () => {},
  gmailUser,
  gmailToken,
  onConnectGmail = async () => null,
  onGmailTokenExpired,
  isPro = false,
  draftsCountToday = 0,
  streak,
  onIncrementDraftsCount
}: RepliesProps) {
  // Filter for only replied contacts
  const repliedContacts = contacts.filter(c => c.status === "replied");

  // Selection state
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    repliedContacts.length > 0 ? repliedContacts[0].id : null
  );

  // If the selected contact is no longer in the list (e.g. status changed), select the first one
  const activeContact = repliedContacts.find(c => c.id === selectedContactId) || (repliedContacts.length > 0 ? repliedContacts[0] : null);

  // Assistant states for the active contact
  const [activeReplyText, setActiveReplyText] = useState("");
  const [activeDraftText, setActiveDraftText] = useState("");
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [replyCopied, setReplyCopied] = useState(false);
  const [isSendingReplyGmail, setIsSendingReplyGmail] = useState(false);
  const [replySentSuccess, setReplySentSuccess] = useState(false);
  const [showOriginalEmail, setShowOriginalEmail] = useState(false);
  const [showManualInputFallback, setShowManualInputFallback] = useState(false);

  // Sync state when active contact changes
  React.useEffect(() => {
    if (activeContact) {
      setActiveReplyText(activeContact.contactReplyText || "");
      setActiveDraftText(activeContact.generatedResponseText || "");
      setShowOriginalEmail(false);
      setShowManualInputFallback(!activeContact.contactReplyText);
    }
  }, [activeContact?.id]);

  const handleGenerateReply = async () => {
    if (!activeContact) return;
    if (!userProfile) {
      alert("Please complete your User Profile first under Settings.");
      return;
    }

    const replyTextToUse = activeReplyText.trim();
    if (!replyTextToUse) {
      alert("Please ensure there is reply content (either auto-fetched or manually entered as fallback) before generating.");
      return;
    }

    const currentGens = activeContact.replyGenerationsCount || 0;
    if (isPro) {
      if (currentGens >= 3) {
        alert("Prospect reply limit reached: Pro Tier is limited to 3 AI reply generations per prospect.");
        return;
      }
      if (draftsCountToday >= 30) {
        alert("Daily AI generation limit reached: Pro Tier is limited to 30 AI generations per day.");
        return;
      }
    } else {
      if (currentGens >= 1) {
        alert("Prospect reply limit reached: Free Tier is limited to 1 AI reply generation per prospect. Upgrade to Pro on your Profile page to get 3 AI reply generations per prospect!");
        return;
      }
      if (draftsCountToday >= 5) {
        alert("Daily AI generation limit reached: Free Tier is limited to 5 AI generations per day. Upgrade to Pro on your Profile page to get 30 AI generations per day!");
        return;
      }
    }

    setIsGeneratingReply(true);
    try {
      const originalDraft = drafts[activeContact.id];
      const originalEmail = originalDraft ? originalDraft.emailBody : "";

      const token = await auth.currentUser?.getIdToken(true);
      const response = await fetchWithAuth("/api/generate-reply", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          contact: activeContact,
          originalEmail,
          contactReply: replyTextToUse,
          userProfile,
          localDateStr: new Date().toLocaleDateString('sv')
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate response");
      }

      const data = await response.json();
      const generatedReplyText = data.emailBody || "";
      setActiveDraftText(generatedReplyText);
      const nextCount = currentGens + 1;
      onUpdateContactFields(activeContact.id, { 
        generatedResponseText: generatedReplyText,
        replyGenerationsCount: nextCount
      });
      if (onIncrementDraftsCount) {
        onIncrementDraftsCount();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to generate AI response. Please try again.");
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const handleCopyReply = async () => {
    if (!activeDraftText) return;
    try {
      await navigator.clipboard.writeText(activeDraftText);
      setReplyCopied(true);
      setTimeout(() => setReplyCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendReplyViaGmail = async () => {
    if (!activeContact || !activeDraftText) return;

    if (streak) {
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
          alert("Failed to connect your Gmail account.");
          return;
        }
      } catch (err: any) {
        alert(err.message || "Failed to authenticate with Google.");
        return;
      }
    }

    if (!token) return;

    setIsSendingReplyGmail(true);
    try {
      const originalDraft = drafts[activeContact.id];
      let subjectToUse = originalDraft ? `Re: ${originalDraft.subjectLine}` : "Re: Connection / Chat";
      let parentMessageId = "";
      const threadId = activeContact.gmailThreadId;

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
          console.error("Error fetching thread details:", e);
        }
      }

      // Convert plain text to clean, email-safe, full-width responsive HTML with no fixed wrappers
      const escapedBody = activeDraftText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

      const htmlReplyBody = escapedBody.split("\n").join("<br />");

      // Build MIME message
      const parts = [
        `To: ${activeContact.email?.trim()}`,
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
      parts.push(htmlReplyBody);

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
        console.warn("Gmail token expired on sending reply. Attempting refresh...");
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
        throw new Error(errData.error?.message || "Gmail send failed.");
      }

      onUpdateStatus(activeContact.id, "awaiting_response");
      setReplySentSuccess(true);
      setTimeout(() => {
        setReplySentSuccess(false);
      }, 3000);

    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to send reply via Gmail.");
    } finally {
      setIsSendingReplyGmail(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-left" id="replies_hub_view">
      
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-extrabold text-slate-800 tracking-tight">Replies Tab</h1>
        <p className="text-slate-500 text-sm mt-1">Manage prospects who have replied to your emails and schedule your next steps.</p>
      </div>

      {repliedContacts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-3xl bg-white" id="no_replies_state">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h2 className="font-display text-xl font-bold text-slate-800">No Pending Replies</h2>
          <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
            You are completely caught up. Use the "Check for Replies" button on the Dashboard to fetch new answers from your Gmail threads.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Side: Replying Contacts Sidebar List */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3" id="replied_contacts_list">
            <div className="px-2 py-1 border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unresolved Replies ({repliedContacts.length})</span>
            </div>
            
            <div className="space-y-2 overflow-y-auto max-h-[500px] pr-1">
              {repliedContacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedContactId(c.id);
                  }}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                    activeContact?.id === c.id
                      ? "bg-emerald-50/40 border-emerald-500/30 ring-2 ring-emerald-500/5 shadow-xs"
                      : "bg-slate-50/40 border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                  }`}
                >
                  <div className="font-bold text-slate-800 text-sm truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 truncate font-medium">{c.company}</div>
                  {c.contactReplyText && (
                    <div className="text-[11px] text-slate-400 truncate mt-1 italic">
                      "{c.contactReplyText}"
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right Side: active replied contact conversation view */}
          {activeContact && (
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6" id="active_reply_workspace">
              
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-800">{activeContact.name}</h2>
                  <p className="text-slate-500 text-xs font-medium mt-0.5">{activeContact.role} at <span className="font-bold">{activeContact.company}</span></p>
                  <p className="text-slate-400 text-[11px] mt-1">Email: {activeContact.email}</p>
                </div>

                {/* Outcome Updates buttons */}
                <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-2xl flex flex-wrap gap-2">
                  <button
                    onClick={() => onUpdateStatus(activeContact.id, "call_booked")}
                    className="bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-100 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-500" /> Call Booked
                  </button>

                  <button
                    onClick={() => onUpdateStatus(activeContact.id, "declined")}
                    className="bg-white hover:bg-red-50 hover:text-red-700 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-100 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <X className="w-3.5 h-3.5 text-red-500" /> Declined
                  </button>

                  <button
                    onClick={() => onUpdateStatus(activeContact.id, "awaiting_response")}
                    className="bg-white hover:bg-amber-50 hover:text-amber-700 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-100 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Awaiting Response
                  </button>

                  <button
                    onClick={() => onUpdateStatus(activeContact.id, "no_longer_relevant")}
                    className="bg-white hover:bg-slate-100 hover:text-slate-800 text-slate-600 text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-100 shadow-xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" /> No Longer Relevant
                  </button>
                </div>
              </div>

              {/* Message Thread Box */}
              <div className="space-y-4">
                
                {/* 1. Original Sent Email (Collapsible) */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <button
                    onClick={() => setShowOriginalEmail(!showOriginalEmail)}
                    className="w-full px-4 py-3 flex justify-between items-center bg-slate-50 hover:bg-slate-100/70 transition-all font-semibold text-slate-700 text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      Original Email Sent
                    </span>
                    {showOriginalEmail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  
                  {showOriginalEmail && (
                    <div className="p-4 border-t border-slate-100 bg-white space-y-2">
                      {drafts[activeContact.id] ? (
                        <>
                          <div className="text-xs font-bold text-slate-600">Subject: {drafts[activeContact.id].subjectLine}</div>
                          <div className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap pt-1 border-t border-slate-50 mt-1">
                            {drafts[activeContact.id].emailBody}
                          </div>
                        </>
                      ) : (
                        <p className="text-slate-400 text-xs italic">No record of the original draft exists. Email was marked sent manually.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Received Reply */}
                <div className="bg-emerald-50/10 border border-emerald-100 p-5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center border-b border-emerald-100/50 pb-2">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      Received Reply
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                      {activeContact.contactReplyText ? "Auto-Fetched" : "Missing"}
                    </span>
                  </div>

                  {activeContact.contactReplyText ? (
                    <blockquote className="text-slate-700 text-sm italic pl-3 border-l-2 border-emerald-500 leading-relaxed whitespace-pre-wrap">
                      "{activeContact.contactReplyText}"
                    </blockquote>
                  ) : (
                    <div className="text-slate-400 text-xs italic py-2">
                      No automated reply text could be found. It may be due to a disconnected Gmail account or lack of matching thread messages. Use the manual fallback below.
                    </div>
                  )}

                  {/* Manual Input Fallback */}
                  <div className="pt-2">
                    <button
                      onClick={() => setShowManualInputFallback(!showManualInputFallback)}
                      className="text-slate-400 hover:text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {showManualInputFallback ? "Hide Manual Input Fallback" : "Manual Input Fallback (Optional)"}
                    </button>

                    {showManualInputFallback && (
                      <div className="mt-2.5 space-y-1.5 border-t border-dashed border-slate-200/50 pt-2.5">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paste their reply manually:</label>
                        <textarea
                          rows={3}
                          value={activeReplyText}
                          onChange={(e) => {
                            setActiveReplyText(e.target.value);
                            onUpdateContactFields(activeContact.id, { contactReplyText: e.target.value });
                          }}
                          placeholder="Paste the received message here..."
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-slate-700 resize-none font-sans"
                        />
                      </div>
                    )}
                  </div>
                </div>

                 {/* 3. Generate AI Response Assistant */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1.5">
                      <button
                        onClick={handleGenerateReply}
                        disabled={isGeneratingReply || !activeReplyText.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        {isGeneratingReply ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating Response...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 fill-white" /> {(activeContact.replyGenerationsCount || 0) > 0 ? "Regenerate AI Response" : "Generate AI Response"}
                          </>
                        )}
                      </button>
                      <div className="text-[10px] text-slate-400 font-medium">
                        AI Drafts used for this prospect: {activeContact.replyGenerationsCount || 0} / {isPro ? 3 : 1}
                      </div>
                    </div>

                    {activeDraftText && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {activeDraftText.split(/\s+/).filter(Boolean).length} words
                      </span>
                    )}
                  </div>

                  {activeDraftText && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">AI Generated Response (Editable):</label>
                        <textarea
                          rows={6}
                          value={activeDraftText}
                          onChange={(e) => {
                            setActiveDraftText(e.target.value);
                            onUpdateContactFields(activeContact.id, { generatedResponseText: e.target.value });
                          }}
                          placeholder="Refine the email draft here..."
                          className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-xs leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-slate-700 font-sans"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          onClick={handleCopyReply}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          {replyCopied ? "Copied!" : "Copy Response"}
                        </button>

                        <a
                          href={`mailto:${activeContact.email || ""}?subject=${encodeURIComponent(
                            drafts[activeContact.id] ? `Re: ${drafts[activeContact.id].subjectLine}` : "Re: Connection / Chat"
                          )}&body=${encodeURIComponent(activeDraftText)}`}
                          className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" /> Send Mailto
                        </a>

                        <button
                          onClick={handleSendReplyViaGmail}
                          disabled={isSendingReplyGmail || !activeContact.email}
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        >
                          {isSendingReplyGmail ? (
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

                      {replySentSuccess && (
                        <div className="text-xs text-emerald-600 font-bold text-center pt-1.5 animate-pulse">
                          Reply successfully sent via Gmail! Outcome has been marked as Awaiting Response.
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
