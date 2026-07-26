import React, { useState } from "react";
import { PlusCircle, Search, Trash2, Building, User, FileText, Mail, ArrowRight, Edit3, Check, X, Upload, Lock, Info, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Contact, ContactStatus } from "../types";
import { formatReadableDate } from "../utils";

interface ContactsProps {
  contacts: Contact[];
  onAddContact: (contact: Omit<Contact, "id" | "dateAdded" | "status">) => void;
  onDeleteContact: (id: string) => void;
  onUpdateContactFields?: (id: string, fields: Partial<Contact>) => void;
  onNavigate: (tab: string) => void;
  isPro?: boolean;
  onAddContactsBatch?: (contactsList: Omit<Contact, "id" | "dateAdded" | "status">[]) => void;
}

export default function Contacts({ 
  contacts, 
  onAddContact, 
  onDeleteContact, 
  onUpdateContactFields = () => {},
  onNavigate,
  isPro = false,
  onAddContactsBatch
}: ContactsProps) {
  // Form states for adding
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [contextBlurb, setContextBlurb] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // CSV Import States
  const [csvError, setCsvError] = useState("");
  const [csvSuccess, setCsvSuccess] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showCsvHelp, setShowCsvHelp] = useState(false);

  // Simple yet robust CSV parser that handles quotes and commas correctly
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const results: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        const cleanHeader = header.trim().toLowerCase();
        row[cleanHeader] = values[index] ? values[index].trim() : "";
      });
      results.push(row);
    }
    return results;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map(val => {
      let cleaned = val.trim();
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned;
    });
  };

  const handleCSVUpload = (file: File) => {
    setCsvError("");
    setCsvSuccess("");

    if (!file.name.endsWith(".csv")) {
      setCsvError("Invalid file format. Please upload a standard CSV (.csv) file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setCsvError("Failed to read CSV contents. The file is empty.");
          return;
        }

        const rows = parseCSV(text);
        if (rows.length === 0) {
          setCsvError("No data rows found in the CSV file.");
          return;
        }

        // Validate required headers
        // Required: name, company, role, context. Email is optional.
        const sampleRow = rows[0];
        const keys = Object.keys(sampleRow);

        const nameKey = keys.find(k => k.includes("name"));
        const emailKey = keys.find(k => k.includes("email"));
        const companyKey = keys.find(k => k.includes("company") || k.includes("org"));
        const roleKey = keys.find(k => k.includes("role") || k.includes("title"));
        const contextKey = keys.find(k => k.includes("context") || k.includes("background") || k.includes("blurb"));

        if (!nameKey || !companyKey || !roleKey || !contextKey) {
          setCsvError("Missing required columns. Your CSV must have columns for 'name', 'company', 'role', and 'context' (or background context).");
          return;
        }

        // Process rows
        const validContactsList: Omit<Contact, "id" | "dateAdded" | "status">[] = [];
        const skippedRows: number[] = [];

        rows.forEach((row, idx) => {
          const nameVal = row[nameKey]?.trim() || "";
          const emailVal = emailKey ? row[emailKey]?.trim() || "" : "";
          const companyVal = row[companyKey]?.trim() || "";
          const roleVal = row[roleKey]?.trim() || "";
          const contextVal = row[contextKey]?.trim() || "";

          // We require at least name, company, role, and context to be non-empty
          if (nameVal && companyVal && roleVal && contextVal) {
            validContactsList.push({
              name: nameVal,
              email: emailVal,
              company: companyVal,
              role: roleVal,
              contextBlurb: contextVal
            });
          } else {
            skippedRows.push(idx + 1);
          }
        });

        if (validContactsList.length === 0) {
          setCsvError("All rows in the CSV are missing required values. Ensure 'name', 'company', 'role', and 'context' fields are filled.");
          return;
        }

        if (onAddContactsBatch) {
          onAddContactsBatch(validContactsList);
          let successMessage = `Successfully imported ${validContactsList.length} prospects!`;
          if (skippedRows.length > 0) {
            successMessage += ` (${skippedRows.length} incomplete rows were skipped).`;
          }
          setCsvSuccess(successMessage);
        } else {
          // Fallback to loop
          validContactsList.forEach(c => onAddContact(c));
          setCsvSuccess(`Successfully imported ${validContactsList.length} prospects!`);
        }
      } catch (err) {
        console.error(err);
        setCsvError("An error occurred while parsing the CSV. Check the file formatting.");
      }
    };
    reader.onerror = () => {
      setCsvError("Failed to read the file. Please try again.");
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isPro) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isPro) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleCSVUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleCSVUpload(e.target.files[0]);
    }
  };

  // Editing states
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editContext, setEditContext] = useState("");

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "not_sent" | "pending" | "replied" | "completed">("all");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !company.trim() || !role.trim() || !contextBlurb.trim()) {
      setError("Please fill in all contact fields, including their email and background context.");
      return;
    }

    onAddContact({
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      role: role.trim(),
      contextBlurb: contextBlurb.trim()
    });

    // Reset Form
    setName("");
    setEmail("");
    setCompany("");
    setRole("");
    setContextBlurb("");
    setError("");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const startEditing = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditName(contact.name);
    setEditEmail(contact.email || "");
    setEditCompany(contact.company);
    setEditRole(contact.role);
    setEditContext(contact.contextBlurb);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim() || !editEmail.trim() || !editCompany.trim() || !editRole.trim() || !editContext.trim()) {
      alert("All fields are required.");
      return;
    }
    onUpdateContactFields(id, {
      name: editName.trim(),
      email: editEmail.trim(),
      company: editCompany.trim(),
      role: editRole.trim(),
      contextBlurb: editContext.trim()
    });
    setEditingContactId(null);
  };

  const cancelEditing = () => {
    setEditingContactId(null);
  };

  // Filtered contacts
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.role.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeCategory === "all") return true;
    if (activeCategory === "not_sent") return c.status === "not_sent";
    if (activeCategory === "pending") return c.status === "sent" || c.status === "followed_up" || c.status === "awaiting_response";
    if (activeCategory === "replied") return c.status === "replied";
    if (activeCategory === "completed") return c.status === "call_booked" || c.status === "declined" || c.status === "no_longer_relevant";
    return true;
  });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 font-sans text-left" id="contacts_panel">
      
      {/* Left Panel: Add Contact Form */}
      <div className="xl:col-span-5 space-y-6">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="add_contact_card">
          <h2 className="font-display text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-orange-500" /> Add Prospect
          </h2>
          <p className="text-slate-500 text-xs mb-5">Add a new professional lead to your tracking backlog.</p>

          {error && (
            <div className="mb-4 p-3.5 bg-red-50 border-l-3 border-red-500 text-red-700 text-xs rounded-r-xl">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3.5 bg-emerald-50 border-l-3 border-emerald-500 text-emerald-700 text-xs rounded-r-xl" id="add_contact_success">
              Prospect added successfully. Head over to the Drafts tab to create your outreach email.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" /> Full Name
              </label>
              <input
                id="contact_name"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address
              </label>
              <input
                id="contact_email"
                type="email"
                placeholder="jane.doe@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" /> Company
                </label>
                <input
                  id="contact_company"
                  type="text"
                  placeholder="Google"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Role / Title
                </label>
                <input
                  id="contact_role"
                  type="text"
                  placeholder="Engineering Manager"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> Context / Background
              </label>
              <textarea
                id="contact_context"
                rows={4}
                placeholder="Alum of my university who transitioned from finance to tech. Found them on LinkedIn and noticed they post about AI developer tools."
                value={contextBlurb}
                onChange={(e) => setContextBlurb(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700 resize-none font-sans"
                required
              />
              <p className="text-slate-400 text-[10px] mt-1">Provide background context details so that the AI can accurately personalize the outreach draft.</p>
            </div>

            <button
              id="add_contact_submit"
              type="submit"
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition-colors cursor-pointer text-sm"
            >
              Add Prospect
            </button>
          </form>
        </div>

        {/* CSV Import Card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 relative overflow-hidden" id="csv_import_card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-500" /> Bulk Import
            </h2>
            <button 
              type="button" 
              onClick={() => setShowCsvHelp(!showCsvHelp)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Show CSV formatting help"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-500 text-xs mb-4">Import multiple prospects at once using a CSV file.</p>

          {showCsvHelp && (
            <div className="mb-4 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] text-slate-600 space-y-2" id="csv_instructions">
              <p className="font-bold text-slate-700">CSV Column Guidelines:</p>
              <p>Your file must contain columns matching these names (case-insensitive):</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-slate-800">name</strong> (Full Name)</li>
                <li><strong className="text-slate-800">company</strong> (Current organization)</li>
                <li><strong className="text-slate-800">role</strong> (Job title/position)</li>
                <li><strong className="text-slate-800">context</strong> (Background background/context for drafting)</li>
                <li><strong className="text-slate-800">email</strong> (Optional: contact email)</li>
              </ul>
              <p className="text-[10px] text-slate-400 italic pt-1">Note: Ensure there are no commas in unquoted fields.</p>
            </div>
          )}

          {csvError && (
            <div className="mb-4 p-3.5 bg-red-50 border-l-3 border-red-500 text-red-700 text-xs rounded-r-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span>{csvError}</span>
            </div>
          )}

          {csvSuccess && (
            <div className="mb-4 p-3.5 bg-emerald-50 border-l-3 border-emerald-500 text-emerald-700 text-xs rounded-r-xl">
              {csvSuccess}
            </div>
          )}

          {!isPro ? (
            /* Locked state for Non-Pro users */
            <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50 flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center shadow-xs">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 px-2">
                <span className="text-[10px] font-extrabold text-orange-600 bg-orange-100/60 border border-orange-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Pro Feature
                </span>
                <p className="text-xs font-bold text-slate-700 mt-1">Unlock Spreadsheets Bulk Import</p>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Save time by uploading spreadsheets containing hundreds of prospects instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("profile")}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-4 rounded-xl shadow-xs transition-colors cursor-pointer text-xs flex items-center gap-1"
              >
                Upgrade to Pro Now →
              </button>
            </div>
          ) : (
            /* Active CSV drop-zone for Pro users */
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center transition-all relative ${
                isDragging 
                  ? "border-orange-500 bg-orange-50/20 shadow-inner scale-[0.99]" 
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/30"
              }`}
            >
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mb-3">
                <Upload className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-xs font-bold text-slate-700">Drag & drop your CSV file here</p>
              <p className="text-[10px] text-slate-400 mt-1 font-medium">or click to browse your files (.csv only)</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Prospect Directory */}
      <div className="xl:col-span-7 space-y-6" id="directory_container">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6" id="directory_card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-800">Prospect Directory</h2>
              <p className="text-slate-500 text-xs mt-0.5">View and update contact information (read-only view with inline edit & delete).</p>
            </div>

            {/* Search */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
              <input
                id="contact_search"
                type="text"
                placeholder="Search prospects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/15 focus:border-orange-500 transition-all text-slate-700"
              />
            </div>
          </div>

          {/* Directory Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-3 mb-6 border-b border-slate-100 scrollbar-none" id="directory_tabs">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer ${
                activeCategory === "all" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              All ({contacts.length})
            </button>
            <button
              onClick={() => setActiveCategory("not_sent")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer ${
                activeCategory === "not_sent" ? "bg-orange-100 text-orange-800" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Needs Draft ({contacts.filter(c => c.status === "not_sent").length})
            </button>
            <button
              onClick={() => setActiveCategory("pending")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer ${
                activeCategory === "pending" ? "bg-blue-100 text-blue-800" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Pending Reply ({contacts.filter(c => c.status === "sent" || c.status === "followed_up" || c.status === "awaiting_response").length})
            </button>
            <button
              onClick={() => setActiveCategory("replied")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer ${
                activeCategory === "replied" ? "bg-emerald-100 text-emerald-800" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Replied ({contacts.filter(c => c.status === "replied").length})
            </button>
            <button
              onClick={() => setActiveCategory("completed")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors cursor-pointer ${
                activeCategory === "completed" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Resolved ({contacts.filter(c => c.status === "call_booked" || c.status === "declined" || c.status === "no_longer_relevant").length})
            </button>
          </div>

          {/* Contact List */}
          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50" id="empty_contacts">
              <Building className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium text-sm">No prospects found in this category.</p>
            </div>
          ) : (
            <div className="space-y-4" id="contacts_grid">
              {filteredContacts.map((contact) => {
                const isEditing = editingContactId === contact.id;
                return (
                  <div 
                    key={contact.id} 
                    className="border border-slate-100 rounded-2xl p-4 bg-slate-50/20 hover:shadow-xs transition-all relative group flex flex-col gap-3"
                  >
                    {isEditing ? (
                      /* Editing Mode */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 mt-1"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Company</label>
                            <input
                              type="text"
                              value={editCompany}
                              onChange={(e) => setEditCompany(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 mt-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Role / Title</label>
                            <input
                              type="text"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 mt-1"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">Context / Background</label>
                          <textarea
                            rows={3}
                            value={editContext}
                            onChange={(e) => setEditContext(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 mt-1 resize-none"
                          />
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelEditing}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-1 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(contact.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1 px-3 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Read-Only Mode */
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-display font-bold text-slate-800 text-base truncate">{contact.name}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              contact.status === "not_sent" ? "bg-orange-100 text-orange-800" :
                              contact.status === "sent" ? "bg-blue-100 text-blue-800" :
                              contact.status === "followed_up" ? "bg-purple-100 text-purple-800" :
                              contact.status === "replied" ? "bg-emerald-100 text-emerald-800" :
                              contact.status === "call_booked" ? "bg-teal-500 text-white" :
                              contact.status === "declined" ? "bg-slate-200 text-slate-600" :
                              contact.status === "awaiting_response" ? "bg-amber-100 text-amber-800" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {contact.status === "not_sent" && "Needs Draft"}
                              {contact.status === "sent" && "Sent"}
                              {contact.status === "followed_up" && "Followed Up"}
                              {contact.status === "replied" && "Replied"}
                              {contact.status === "call_booked" && "Call Booked"}
                              {contact.status === "declined" && "Declined"}
                              {contact.status === "awaiting_response" && "Awaiting Reply"}
                              {contact.status === "no_longer_relevant" && "Archived"}
                            </span>
                          </div>

                          <div className="text-slate-500 text-xs font-medium flex flex-wrap items-center gap-y-1 gap-x-2.5">
                            <span className="flex items-center gap-1">
                              <Building className="w-3.5 h-3.5 text-slate-400" /> {contact.company}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>{contact.role}</span>
                            {contact.email && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="flex items-center gap-1 text-slate-500">
                                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {contact.email}
                                </span>
                              </>
                            )}
                          </div>

                          <p className="text-slate-400 text-xs italic pr-6 leading-relaxed">
                            "{contact.contextBlurb}"
                          </p>

                          <div className="text-[10px] text-slate-400 flex gap-3">
                            <span>Added {formatReadableDate(contact.dateAdded)}</span>
                            {contact.dateSent && (
                              <>
                                <span>•</span>
                                <span>Sent {formatReadableDate(contact.dateSent)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions: Edit, Delete, Navigations */}
                        <div className="flex flex-row md:flex-col items-center justify-end gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 md:self-stretch md:justify-between">
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEditing(contact)}
                              className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                              title="Edit contact info"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onDeleteContact(contact.id)}
                              className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                              title="Delete prospect"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Action navigation helper to direct to appropriate tab */}
                          <div className="flex gap-1.5">
                            {contact.status === "not_sent" && (
                              <button
                                onClick={() => onNavigate("draft")}
                                className="bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              >
                                Go to Drafts <ArrowRight className="w-3 h-3" />
                              </button>
                            )}

                            {(contact.status === "sent" || contact.status === "followed_up") && (
                              <button
                                onClick={() => onNavigate("followup")}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              >
                                Go to Follow-Ups <ArrowRight className="w-3 h-3" />
                              </button>
                            )}

                            {contact.status === "replied" && (
                              <button
                                onClick={() => onNavigate("replies")}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                              >
                                Go to Replies <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
