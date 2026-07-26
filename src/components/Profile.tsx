import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { StreakData, UserProfile } from "../types";
import { fetchWithAuth } from "../firebase";
import { 
  Flame, Mail, CheckCircle2, GraduationCap, Award, Settings as SettingsIcon, Check, RefreshCw,
  FileText, Trash2, FileUp, AlertCircle
} from "lucide-react";

interface ProfileProps {
  userProfile: UserProfile | null;
  dailyQuota: number;
  onSaveProfile: (profile: UserProfile, dailyQuota: number) => void;
  gmailUser: User | null;
  currentUser?: User | null;
  isPro: boolean;
  streak: StreakData;
  checkingProStatus: boolean;
  onConnectGmail: () => Promise<any>;
  onDisconnectGmail: () => Promise<any>;
  onAppLogout?: () => void;
  onUpdateUserProfile?: (fields: Partial<UserProfile>) => void;
}

const GoogleButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button
    id="profile_connect_gmail_btn"
    onClick={onClick}
    disabled={disabled}
    className="flex items-center gap-3 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
  >
    <div className="w-5 h-5 flex items-center justify-center shrink-0">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4.5 h-4.5">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
      </svg>
    </div>
    <span>Connect Gmail with Google</span>
  </button>
);

export default function Profile({
  userProfile,
  dailyQuota,
  onSaveProfile,
  gmailUser,
  currentUser,
  streak,
  onConnectGmail,
  onDisconnectGmail,
  onAppLogout,
  onUpdateUserProfile,
}: ProfileProps) {
  const [error, setError] = useState<string | null>(null);

  // Form states for Settings embedded in Profile
  const [school, setSchool] = useState("");
  const [major, setMajor] = useState("");
  const [gradYear, setGradYear] = useState("2027");
  const [bio, setBio] = useState("");
  const [ach1, setAch1] = useState("");
  const [ach2, setAch2] = useState("");
  const [ach3, setAch3] = useState("");
  const [quota, setQuota] = useState(3);
  const [isSaved, setIsSaved] = useState(false);

  // Resume Upload States
  const [resumeName, setResumeName] = useState<string | null>(userProfile?.resumeName || null);
  const [resumeUploadedAt, setResumeUploadedAt] = useState<string | null>(userProfile?.resumeUploadedAt || null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSuccess, setResumeSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setResumeName(userProfile.resumeName || null);
      setResumeUploadedAt(userProfile.resumeUploadedAt || null);
    }
  }, [userProfile]);

  useEffect(() => {
    if (userProfile) {
      setSchool(userProfile.school || "");
      setMajor(userProfile.major || "");
      setGradYear(userProfile.gradYear || "2027");
      setBio(userProfile.bio || "");
      setAch1(userProfile.achievements?.[0] || "");
      setAch2(userProfile.achievements?.[1] || "");
      setAch3(userProfile.achievements?.[2] || "");
    }
    setQuota(dailyQuota || 3);
  }, [userProfile, dailyQuota]);

  const handleSubmitProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const achievements = [ach1, ach2, ach3].map(a => a.trim()).filter(Boolean);

    const updatedProfile: UserProfile = {
      ...userProfile,
      school: school.trim(),
      major: major.trim(),
      gradYear: gradYear.trim(),
      bio: bio.trim(),
      achievements
    };

    onSaveProfile(updatedProfile, quota);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResumeError(null);
    setResumeSuccess(null);

    if (file.size > 800 * 1024) {
      setResumeError("File is too large. Maximum size is 800KB.");
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setResumeError("Only PDF files are supported.");
      return;
    }

    setUploadingResume(true);

    try {
      const userToUse = currentUser || gmailUser;
      if (!userToUse) {
        throw new Error("User not authenticated.");
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Result = reader.result as string;
          const fileBase64 = base64Result.split(",")[1];

          const token = await userToUse.getIdToken(true);

          const response = await fetchWithAuth("/api/upload-resume", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || "Failed to process and upload resume.");
          }

          const data = await response.json();
          setResumeName(data.resumeFileName);
          setResumeUploadedAt(data.resumeUploadedAt);
          setResumeSuccess("Resume uploaded and processed successfully!");
          if (onUpdateUserProfile) {
            onUpdateUserProfile({
              resumeName: file.name,
              resumeBase64: base64Result
            });
          }
        } catch (err: any) {
          console.error(err);
          setResumeError(err.message || "An unexpected error occurred during processing.");
        } finally {
          setUploadingResume(false);
        }
      };
      reader.onerror = () => {
        setResumeError("Failed to read the file.");
        setUploadingResume(false);
      };
    } catch (err: any) {
      console.error(err);
      setResumeError(err.message || "An unexpected error occurred during upload.");
      setUploadingResume(false);
    }
  };

  const handleResumeDelete = async () => {
    const userToUse = currentUser || gmailUser;
    if (!userToUse) return;

    setUploadingResume(true);
    setResumeError(null);
    setResumeSuccess(null);

    try {
      const token = await userToUse.getIdToken(true);
      const response = await fetchWithAuth("/api/delete-resume", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to remove resume.");
      }

      setResumeName(null);
      setResumeUploadedAt(null);
      setResumeSuccess("Resume context removed successfully.");
      setShowDeleteConfirm(false);
      if (onUpdateUserProfile) {
        onUpdateUserProfile({
          resumeName: "",
          resumeBase64: ""
        });
      }
    } catch (err: any) {
      console.error(err);
      setResumeError(err.message || "Failed to remove resume.");
    } finally {
      setUploadingResume(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 font-sans" id="profile_page_container">
      {/* Page Header */}
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-800">Student Profile</h2>
        <p className="text-slate-500 text-xs mt-0.5">Manage your outreach profile, brag sheet, and daily email quota</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs flex items-start gap-2 animate-fade-in" id="profile_error_banner">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Self-Hosted Open Source Banner */}
      <div className="rounded-3xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/50 border-emerald-100 text-slate-800" id="profile_active_plan_info">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5.5 h-5.5" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workspace Mode</div>
            <div className="text-sm font-bold text-slate-850 mt-0.5">
              <span className="text-emerald-700 font-extrabold">SendStreak Open Source (Full Access)</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 max-w-xs sm:text-right font-medium">
          All features unlocked for self-hosting: unlimited AI drafts, Gmail integration, and resume context parsing.
        </div>
      </div>

      {/* Stats Counter Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="profile_quick_stats">
        <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0">
            <Flame className="w-6 h-6 fill-orange-500 text-orange-500" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Streak</div>
            <div className="text-2xl font-extrabold text-slate-800">{streak.currentStreak} days</div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Emails Sent</div>
            <div className="text-2xl font-extrabold text-slate-800">{streak.totalEmailsSent} emails</div>
          </div>
        </div>
      </div>

      {/* GMAIL CONNECTION CARD */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8" id="gmail_connection_card">
        <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
          <Mail className="w-5 h-5 text-orange-500" /> Gmail Integration
        </h3>
        <p className="text-slate-500 text-xs mt-0.5">Link your Gmail account to send cold emails directly from your inbox and automatically detect replies.</p>
        
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {gmailUser ? (
              <>
                {gmailUser.photoURL ? (
                  <img src={gmailUser.photoURL} alt={gmailUser.displayName || "Google User"} className="w-10 h-10 rounded-full object-cover border border-slate-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm border border-orange-200">
                    {gmailUser.email?.[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-bold text-slate-800">{gmailUser.displayName || "Connected User"}</div>
                  <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    Connected to {gmailUser.email}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-sm font-bold text-slate-800">Gmail Not Connected</div>
                <div className="text-xs text-slate-400 mt-0.5">Emails will fall back to manual copy/mailto.</div>
              </div>
            )}
          </div>

          <div>
            {gmailUser ? (
              <button
                id="disconnect_gmail_btn"
                onClick={onDisconnectGmail}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-xl transition-colors cursor-pointer border border-slate-200"
              >
                Disconnect Gmail
              </button>
            ) : (
              <GoogleButton onClick={onConnectGmail} />
            )}
          </div>
        </div>
      </div>

      {/* ACCOUNT SETTINGS FORM CARD */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8" id="profile_form_card">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-orange-500" /> Account Settings
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">Customize your student brag sheet and habit quota</p>
          </div>
          
          {isSaved && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full flex items-center gap-1 animate-pulse" id="profile_saved_alert">
              <Check className="w-3.5 h-3.5" /> Changes saved!
            </span>
          )}
        </div>

        <form onSubmit={handleSubmitProfile} className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">Student Profile</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">School / University</label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                  <input
                    id="settings_school"
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Major / Field</label>
                <input
                  id="settings_major"
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Grad Year</label>
                <select
                  id="settings_gradyear"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                >
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                  <option value="2029">2029</option>
                  <option value="2030">2030</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                  <span>Daily Cold Email Quota</span>
                  <span className="font-bold text-orange-500">{quota} emails / day</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="settings_quota_range"
                    type="range"
                    min="1"
                    max="10"
                    value={quota}
                    onChange={(e) => setQuota(Number(e.target.value))}
                    className="w-full accent-orange-500 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Aspirations & Summary Bio</label>
              <textarea
                id="settings_bio"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 resize-none font-sans"
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">Brag Sheet (Achievements)</h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Proud Accomplishment #1</label>
                <div className="relative">
                  <Award className="absolute left-3 top-2.5 w-4 h-4 text-amber-500" />
                  <input
                    id="settings_ach1"
                    type="text"
                    value={ach1}
                    onChange={(e) => setAch1(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Proud Accomplishment #2</label>
                <input
                  id="settings_ach2"
                  type="text"
                  value={ach2}
                  onChange={(e) => setAch2(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Proud Accomplishment #3 (Optional)</label>
                <input
                  id="settings_ach3"
                  type="text"
                  value={ach3}
                  onChange={(e) => setAch3(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 font-medium"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Resume PDF Context
            </h4>

            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-3">
              {resumeName ? (
                <div className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-3.5 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate max-w-[200px] sm:max-w-[300px]">
                        {resumeName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Uploaded {resumeUploadedAt ? new Date(resumeUploadedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResumeDelete}
                        disabled={uploadingResume}
                        className="px-2.5 py-1.5 text-[10px] font-extrabold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all cursor-pointer shadow-sm"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={uploadingResume}
                        className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={uploadingResume}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                      title="Remove resume context"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-orange-500/40 rounded-2xl p-6 cursor-pointer bg-white transition-all text-center group">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleResumeUpload}
                    disabled={uploadingResume}
                    className="hidden"
                  />
                  {uploadingResume ? (
                    <div className="space-y-2">
                      <RefreshCw className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
                      <p className="text-xs font-medium text-slate-600">Extracting resume context...</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 group-hover:text-orange-500 group-hover:bg-orange-50 flex items-center justify-center mx-auto transition-all">
                        <FileUp className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-700">Upload Resume PDF</p>
                        <p className="text-[10px] text-slate-400">Drag & drop or click to select (PDF, max 800KB)</p>
                      </div>
                    </div>
                  )}
                </label>
              )}

              {resumeError && (
                <div className="flex items-center gap-2 text-[11px] font-medium text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{resumeError}</span>
                </div>
              )}

              {resumeSuccess && (
                <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{resumeSuccess}</span>
                </div>
              )}
            </div>
          </div>

          <button
            id="profile_save_settings_btn"
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-extrabold py-3 px-4 rounded-xl shadow-md shadow-orange-500/10 hover:shadow-orange-500/20 transition-all cursor-pointer text-sm tracking-wide text-center"
          >
            Save Profile & Quota Settings
          </button>
        </form>
      </div>

      {/* Account Settings / Sign Out */}
      {onAppLogout && (
        <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-6" id="profile_sign_out_section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800">Account Access</h4>
              <p className="text-xs text-slate-500 mt-0.5">Log out of your SendStreak account on this device</p>
            </div>
            <button
              id="profile_signout_btn"
              type="button"
              onClick={onAppLogout}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold py-2 px-5 rounded-xl text-xs transition-colors cursor-pointer text-center"
            >
              Sign Out of SendStreak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
