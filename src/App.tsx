import { useEffect, useMemo, useState } from "react";
import type { Client, DocType, Item, Profile, SavedDocument, ThemeId } from "./types";
import { emptyClient, emptyProfile } from "./types";
import { db } from "./storage";
import { createPdf, dataUrlFromBytes, bytesFromDataUrl } from "./pdf";

const themes: { id: ThemeId; name: string; description: string; swatches: string[] }[] = [
  { id: "corporate", name: "Corporate", description: "Formal navy and blue", swatches: ["#1a335f", "#3d6ead", "#eef2f8"] },
  { id: "minimal", name: "Modern Minimal", description: "Clean teal and white", swatches: ["#10766e", "#1f9e90", "#eaf7f5"] },
  { id: "executive", name: "Executive", description: "Charcoal with gold accents", swatches: ["#26292e", "#b38a47", "#f5f3eb"] },
  { id: "creative", name: "Creative", description: "Indigo and warm orange", swatches: ["#504099", "#e96339", "#f5f0fa"] }
];
const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number, c: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n); }
  catch { return `${c} ${n.toFixed(2)}`; }
};
const docLabel = (t: DocType) => t === "proforma" ? "Pro Forma Invoice" : t === "invoice" ? "Invoice" : "Receipt";
const newItem = (): Item => ({ id: uid(), description: "", quantity: 1, unit: "Unit", unitPrice: 0 });
const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  if (!["image/png", "image/jpeg"].includes(file.type)) return reject(new Error("Please upload a PNG or JPEG image."));
  if (file.size > 2 * 1024 * 1024) return reject(new Error("Image must be 2 MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Could not read image."));
  reader.readAsDataURL(file);
});

export default function App() {
  const [tab, setTab] = useState<"home" | "create" | "documents" | "profile" | "settings">("home");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [ready, setReady] = useState(false);
  const [type, setType] = useState<DocType>("invoice");
  const [theme, setTheme] = useState<ThemeId>("minimal");
  const [recipient, setRecipient] = useState<Client>(emptyClient);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [notes, setNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [amountReceived, setAmountReceived] = useState(0);
  const [includeBranding, setIncludeBranding] = useState(true);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewDoc, setPreviewDoc] = useState<SavedDocument | null>(null);
  const [message, setMessage] = useState("");
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientDraft, setClientDraft] = useState<Client>(emptyClient);
  const [backupPass, setBackupPass] = useState("");

  useEffect(() => {
    Promise.all([db.getProfile(), db.getClients(), db.getDocuments(), db.getSetting<ThemeId>("theme", "minimal"), db.getSetting<boolean>("branding", true)])
      .then(([p, c, d, t, b]) => { setProfile(p); setClients(c); setDocuments(d.sort((a,b) => b.createdAt.localeCompare(a.createdAt))); setTheme(t); setIncludeBranding(b); })
      .catch(() => setMessage("Local storage could not be opened. Please use a current browser with site storage enabled."))
      .finally(() => setReady(true));
  }, []);

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + Math.max(0, i.quantity) * Math.max(0, i.unitPrice), 0), [items]);
  const discountAmount = Math.min(Math.max(0, discount), subtotal);
  const taxAmount = Math.max(0, subtotal - discountAmount) * Math.max(0, taxRate) / 100;
  const total = Math.max(0, subtotal - discountAmount + taxAmount + Math.max(0, additionalCharges));
  const validItems = items.filter(i => i.description.trim() && i.quantity > 0 && i.unitPrice >= 0);

  const flash = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(""), 3500); };
  const refresh = async () => {
    const [c, d] = await Promise.all([db.getClients(), db.getDocuments()]);
    setClients(c); setDocuments(d.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  };
  const updateProfile = async (next: Profile) => { setProfile(next); await db.saveProfile(next); };
  const startCreate = (t: DocType) => {
    setType(t); setRecipient(emptyClient); setItems([newItem()]); setDiscount(0); setTaxRate(0);
    setAdditionalCharges(0); setNotes(""); setAmountReceived(0); setPaymentDate(today());
    setPaymentMethod("Bank transfer"); setPaymentReference(""); setTab("create");
  };
  const addItem = () => setItems(v => [...v, newItem()]);
  const updateItem = (id: string, patch: Partial<Item>) => setItems(v => v.map(i => i.id === id ? { ...i, ...patch } : i));
  const removeItem = (id: string) => setItems(v => v.length > 1 ? v.filter(i => i.id !== id) : v);
  const makeNumber = (t: DocType) => {
    const prefix = t === "proforma" ? "PF" : t === "invoice" ? "INV" : "RC";
    const year = new Date().getFullYear();
    const count = documents.filter(d => d.type === t && new Date(d.createdAt).getFullYear() === year).length + 1;
    return `${prefix}-${year}-${String(count).padStart(5, "0")}`;
  };
  const prepareDoc = (): SavedDocument => ({
    id: uid(), number: makeNumber(type), type, createdAt: new Date().toISOString(), profile: { ...profile },
    recipient: { ...recipient }, items: type === "receipt" ? items : validItems, currency: profile.currency || "NGN",
    theme, discount: discountAmount, taxRate, additionalCharges, paymentDate, paymentMethod,
    paymentReference, amountReceived: amountReceived || total, notes, total, status: "issued"
  });
  const issueDocument = async () => {
    if (!profile.name.trim()) { flash("Add your name or business name in Business Profile first."); setTab("profile"); return; }
    if (!recipient.name.trim()) { flash("Enter the client or payer name."); return; }
    if (type !== "receipt" && validItems.length === 0) { flash("Add at least one complete line item."); return; }
    if (type === "invoice" && (!profile.bankName || !profile.accountName || !profile.accountNumber)) {
      if (!window.confirm("Bank details are incomplete. Generate the invoice without bank details?")) return;
    }
    const doc = prepareDoc();
    try {
      const bytes = await createPdf({ ...doc, date: doc.createdAt.slice(0,10) }, includeBranding);
      const pdfData = dataUrlFromBytes(bytes);
      const issued = { ...doc, pdfData };
      await db.saveDocument(issued);
      await refresh();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPreviewUrl(url); setPreviewDoc(issued); setTab("documents");
      flash("PDF generated and saved on this device.");
    } catch (e) { flash(e instanceof Error ? e.message : "PDF generation failed."); }
  };
  const downloadDoc = (doc: SavedDocument) => {
    if (!doc.pdfData) { flash("PDF data is unavailable for this record."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytesFromDataUrl(doc.pdfData)], { type: "application/pdf" }));
    a.download = `INVOICEGEN-${doc.number}.pdf`; a.click(); URL.revokeObjectURL(a.href);
  };
  const shareDoc = async (doc: SavedDocument) => {
    if (!doc.pdfData) return flash("PDF data is unavailable.");
    const blob = new Blob([bytesFromDataUrl(doc.pdfData)], { type: "application/pdf" });
    const file = new File([blob], `INVOICEGEN-${doc.number}.pdf`, { type: "application/pdf" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: doc.number, text: `${docLabel(doc.type)} ${doc.number}` }); }
      catch (e) { if (e instanceof Error && e.name !== "AbortError") flash("Sharing was not completed."); }
    } else {
      downloadDoc(doc);
      flash("PDF downloaded. Attach it to WhatsApp or email.");
    }
  };
  const saveClient = async () => {
    if (!clientDraft.name.trim()) return flash("Client name is required.");
    const saved = { ...clientDraft, id: clientDraft.id || uid() };
    await db.saveClient(saved); setClientDraft(emptyClient); setClientFormOpen(false); await refresh(); flash("Client saved.");
  };
  const voidDoc = async (doc: SavedDocument) => {
    if (!window.confirm(`Mark ${doc.number} as void? The saved PDF will remain unchanged.`)) return;
    await db.saveDocument({ ...doc, status: "void" }); await refresh();
  };
  const makeBackup = async () => {
    if (backupPass.length < 10) return flash("Use a backup passphrase of at least 10 characters.");
    const data = JSON.stringify({ version: 1, profile, clients, documents, theme, includeBranding });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", enc.encode(backupPass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
    const bytes = new Uint8Array([...salt, ...iv, ...new Uint8Array(cipher)]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    a.download = "invoice-gen-backup.igbackup"; a.click(); URL.revokeObjectURL(a.href); flash("Encrypted backup exported.");
  };
  const restoreBackup = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length < 29) throw new Error("Backup file is invalid.");
      const salt = bytes.slice(0,16), iv = bytes.slice(16,28), ciphertext = bytes.slice(28);
      const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(backupPass), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const parsed = JSON.parse(new TextDecoder().decode(plain));
      if (parsed.version !== 1) throw new Error("Unsupported backup version.");
      if (!window.confirm("Restoring will replace the current local Invoice Gen data. Continue?")) return;
      await db.clearAll(); await db.saveProfile(parsed.profile ?? emptyProfile);
      for (const c of parsed.clients ?? []) await db.saveClient(c);
      for (const d of parsed.documents ?? []) await db.saveDocument(d);
      await db.saveSetting("theme", parsed.theme ?? "minimal");
      await db.saveSetting("branding", parsed.includeBranding ?? true);
      await refresh(); setProfile(parsed.profile ?? emptyProfile); setTheme(parsed.theme ?? "minimal");
      setIncludeBranding(parsed.includeBranding ?? true); flash("Backup restored successfully.");
    } catch { flash("Restore failed. Check the file and passphrase."); }
  };
  const changeTheme = async (value: ThemeId) => { setTheme(value); await db.saveSetting("theme", value); };
  const changeBranding = async (value: boolean) => { setIncludeBranding(value); await db.saveSetting("branding", value); };

  if (!ready) return <div className="loading">Loading Invoice Gen…</div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">IG</div><div><strong>Invoice Gen</strong><small>Simple business documents</small></div></div>
      <nav>
        {([["home","⌂","Dashboard"],["create","＋","Create document"],["documents","▤","Documents"],["profile","◉","Business profile"],["settings","⚙","Settings"]] as const).map(([id,icon,label]) =>
          <button key={id} className={`nav-item ${tab===id?"active":""}`} onClick={()=>setTab(id)}><span>{icon}</span>{label}</button>
        )}
      </nav>
      <div className="sidebar-note"><span className="status-dot"/> Offline-ready prototype <small>Your data stays in this browser.</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">INVOICE GEN / PROTOTYPE 0.1</span><h1>{({home:"Dashboard",create:"Create document",documents:"Your documents",profile:"Business profile",settings:"Settings"} as const)[tab]}</h1></div><div className="top-actions"><span className="offline-pill">● Local mode</span><button className="primary small" onClick={()=>startCreate("invoice")}>＋ New invoice</button></div></header>
      {message && <div className="toast" role="status">{message}</div>}
      {tab==="home" && <section className="content">
        <div className="welcome"><div><span className="eyebrow light">YOUR DOCUMENT WORKSPACE</span><h2>Professional documents.<br/>Made simple.</h2><p>Create and share quotes, invoices and receipts in minutes.</p><button className="white-button" onClick={()=>startCreate("proforma")}>Create a document <span>→</span></button></div><div className="welcome-art"><div className="paper paper-back"></div><div className="paper"><b>INVOICE</b><i>INV-2026-00001</i><hr/><span>Professional services</span><strong>₦250,000</strong><hr/><small>Thank you for your business.</small></div></div></div>
        <div className="section-heading"><div><h2>What would you like to create?</h2><p>Choose a document to get started.</p></div></div>
        <div className="type-grid">
          {([["proforma","▧","Pro Forma Invoice","Prepare a quotation before work begins."],["invoice","▤","Regular Invoice","Request payment for goods or services."],["receipt","✓","Payment Receipt","Acknowledge money received."]] as const).map(([t,icon,title,desc])=><button className="type-card" key={t} onClick={()=>startCreate(t)}><span className="type-icon">{icon}</span><b>{title}</b><p>{desc}</p><span className="card-arrow">Create →</span></button>)}
        </div>
        <div className="section-heading"><div><h2>Recent documents</h2><p>Your latest locally saved documents.</p></div><button className="text-button" onClick={()=>setTab("documents")}>View all →</button></div>
        <DocumentList documents={documents.slice(0,4)} onOpen={d=>{setPreviewDoc(d); if(d.pdfData)setPreviewUrl(URL.createObjectURL(new Blob([bytesFromDataUrl(d.pdfData)],{type:"application/pdf"})));}} onDownload={downloadDoc}/>
      </section>}
      {tab==="create" && <section className="content form-layout">
        <div className="form-main">
          <div className="step-heading"><div><span className="eyebrow">NEW DOCUMENT</span><h2>{docLabel(type)}</h2><p>Enter the details below. Your information is saved on this device.</p></div><select value={type} onChange={e=>setType(e.target.value as DocType)}><option value="proforma">Pro Forma Invoice</option><option value="invoice">Regular Invoice</option><option value="receipt">Payment Receipt</option></select></div>
          <div className="panel">
            <div className="panel-title"><span className="step-number">1</span><div><h3>Recipient details</h3><p>Who is this document for?</p></div></div>
            <label>Choose saved client<select value={recipient.id} onChange={e=>setRecipient(clients.find(c=>c.id===e.target.value) ?? {...emptyClient})}><option value="">Enter a new recipient</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="field-grid">
              <Field label="Client / organisation name" value={recipient.name} onChange={v=>setRecipient({...recipient,name:v})} required/>
              <Field label="Contact person" value={recipient.contact} onChange={v=>setRecipient({...recipient,contact:v})}/>
              <Field label="Email address" value={recipient.email} onChange={v=>setRecipient({...recipient,email:v})} type="email"/>
              <Field label="Phone number" value={recipient.phone} onChange={v=>setRecipient({...recipient,phone:v})}/>
              <div className="full"><Field label="Address" value={recipient.address} onChange={v=>setRecipient({...recipient,address:v})}/></div>
            </div>
            <button className="subtle-button" onClick={()=>{setClientDraft({...recipient,id:""});setClientFormOpen(true);}}>＋ Save recipient to client directory</button>
          </div>
          {type!=="receipt" && <div className="panel">
            <div className="panel-title"><span className="step-number">2</span><div><h3>Goods and services</h3><p>Add each item and its price.</p></div></div>
            <div className="items-head"><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span><span></span></div>
            {items.map(item=><div className="item-row" key={item.id}>
              <input aria-label="Description" placeholder="e.g. Website development" value={item.description} onChange={e=>updateItem(item.id,{description:e.target.value})}/>
              <input aria-label="Quantity" type="number" min="0.01" step="0.01" value={item.quantity} onChange={e=>updateItem(item.id,{quantity:Math.max(0,Number(e.target.value))})}/>
              <input aria-label="Unit price" type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>updateItem(item.id,{unitPrice:Math.max(0,Number(e.target.value))})}/>
              <strong>{money(item.quantity*item.unitPrice,profile.currency)}</strong>
              <button className="icon-button" aria-label="Remove item" onClick={()=>removeItem(item.id)}>×</button>
            </div>)}
            <button className="subtle-button" onClick={addItem}>＋ Add another item</button>
            <div className="field-grid totals-fields">
              <Field label="Discount (amount)" value={String(discount)} onChange={v=>setDiscount(Math.max(0,Number(v)||0))} type="number"/>
              <Field label="Tax rate (%)" value={String(taxRate)} onChange={v=>setTaxRate(Math.max(0,Number(v)||0))} type="number"/>
              <Field label="Additional charges" value={String(additionalCharges)} onChange={v=>setAdditionalCharges(Math.max(0,Number(v)||0))} type="number"/>
            </div>
            <div className="total-box"><span>Estimated total</span><strong>{money(total,profile.currency)}</strong></div>
          </div>}
          {type==="receipt" && <div className="panel">
            <div className="panel-title"><span className="step-number">2</span><div><h3>Payment details</h3><p>Record the payment being acknowledged.</p></div></div>
            <div className="field-grid">
              <Field label="Amount received" value={String(amountReceived)} onChange={v=>setAmountReceived(Math.max(0,Number(v)||0))} type="number"/>
              <Field label="Payment date" value={paymentDate} onChange={setPaymentDate} type="date"/>
              <label>Payment method<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option>Bank transfer</option><option>Cash</option><option>POS</option><option>Card</option><option>Mobile money</option><option>Other</option></select></label>
              <Field label="Transaction reference" value={paymentReference} onChange={setPaymentReference}/>
            </div>
          </div>}
          <div className="panel">
            <div className="panel-title"><span className="step-number">{type==="receipt"?"3":"3"}</span><div><h3>Theme and presentation</h3><p>Choose how your PDF will look.</p></div></div>
            <ThemePicker value={theme} onChange={changeTheme}/>
            <label className="check-row"><input type="checkbox" checked={includeBranding} onChange={e=>changeBranding(e.target.checked)}/> Include “Generated with Invoice Gen” footer</label>
            <label>Additional notes<textarea rows={3} placeholder="Payment terms, delivery details or other notes…" value={notes} onChange={e=>setNotes(e.target.value)}/></label>
          </div>
          <div className="form-actions"><button className="secondary" onClick={()=>setTab("home")}>Cancel</button><button className="primary" onClick={issueDocument}>Generate PDF →</button></div>
        </div>
        <aside className="form-aside"><div className="summary-card"><span className="eyebrow">DOCUMENT SUMMARY</span><h3>{docLabel(type)}</h3><p>{recipient.name || "Recipient not entered"}</p><div className="summary-total"><small>{type==="receipt"?"Amount received":"Total amount"}</small><strong>{money(type==="receipt" ? amountReceived : total,profile.currency)}</strong></div><div className="summary-line"><span>Currency</span><b>{profile.currency}</b></div><div className="summary-line"><span>Theme</span><b>{themes.find(t=>t.id===theme)?.name}</b></div><div className="summary-line"><span>Page size</span><b>{type==="receipt"?"A5":"A4"}</b></div><p className="summary-hint">Your PDF is generated on this device. No invoice details are uploaded to a server.</p></div></aside>
      </section>}
      {tab==="documents" && <section className="content"><div className="section-heading"><div><h2>Document history</h2><p>Documents saved on this device.</p></div><button className="primary small" onClick={()=>startCreate("invoice")}>＋ Create document</button></div><DocumentList documents={documents} onOpen={d=>{setPreviewDoc(d);if(d.pdfData)setPreviewUrl(URL.createObjectURL(new Blob([bytesFromDataUrl(d.pdfData)],{type:"application/pdf"})));}} onDownload={downloadDoc} onShare={shareDoc} onVoid={voidDoc}/></section>}
      {tab==="profile" && <section className="content narrow"><div className="panel"><div className="panel-title"><span className="step-number">1</span><div><h3>Your business information</h3><p>This information appears as the sender on your documents.</p></div></div>
        <div className="field-grid">
          <Field label="Your name / registered business name" value={profile.name} onChange={v=>updateProfile({...profile,name:v})} required/>
          <Field label="Trading name" value={profile.tradingName} onChange={v=>updateProfile({...profile,tradingName:v})}/>
          <Field label="Phone number" value={profile.phone} onChange={v=>updateProfile({...profile,phone:v})}/>
          <Field label="Email address" value={profile.email} onChange={v=>updateProfile({...profile,email:v})}/>
          <div className="full"><Field label="Business address" value={profile.address} onChange={v=>updateProfile({...profile,address:v})}/></div>
          <Field label="Website" value={profile.website} onChange={v=>updateProfile({...profile,website:v})}/>
          <Field label="Tax identification number" value={profile.taxId} onChange={v=>updateProfile({...profile,taxId:v})}/>
          <label>Default currency<select value={profile.currency} onChange={e=>updateProfile({...profile,currency:e.target.value})}><option value="NGN">NGN – Nigerian Naira</option><option value="USD">USD – US Dollar</option><option value="GBP">GBP – British Pound</option><option value="EUR">EUR – Euro</option></select></label>
        </div>
        <div className="upload-grid">
          <Upload label="Business logo" value={profile.logo} onChange={v=>updateProfile({...profile,logo:v})}/>
          <Upload label="Signature image" value={profile.signature} onChange={v=>updateProfile({...profile,signature:v})}/>
        </div>
      </div>
      <div className="panel"><div className="panel-title"><span className="step-number">2</span><div><h3>Bank details</h3><p>Displayed on regular invoices.</p></div></div><div className="field-grid">
        <Field label="Bank name" value={profile.bankName} onChange={v=>updateProfile({...profile,bankName:v})}/>
        <Field label="Account name" value={profile.accountName} onChange={v=>updateProfile({...profile,accountName:v})}/>
        <Field label="Account number" value={profile.accountNumber} onChange={v=>updateProfile({...profile,accountNumber:v})}/>
      </div></div>
      <div className="panel"><div className="panel-title"><span className="step-number">3</span><div><h3>Client directory</h3><p>Saved recipients for faster document creation.</p></div></div>
        <button className="secondary" onClick={()=>{setClientDraft(emptyClient);setClientFormOpen(true);}}>＋ Add client</button>
        {clients.map(c=><div className="client-row" key={c.id}><div><b>{c.name}</b><small>{c.email || c.phone}</small></div><button className="text-button" onClick={async()=>{if(confirm(`Delete ${c.name} from the client directory?`)){await db.deleteClient(c.id);await refresh();}}}>Delete</button></div>)}
      </div></section>}
      {tab==="settings" && <section className="content narrow">
        <div className="panel"><div className="panel-title"><span className="step-number">1</span><div><h3>Document branding</h3><p>Choose whether PDFs include Invoice Gen attribution.</p></div></div><label className="check-row"><input type="checkbox" checked={includeBranding} onChange={e=>changeBranding(e.target.checked)}/> Include Invoice Gen footer</label></div>
        <div className="panel"><div className="panel-title"><span className="step-number">2</span><div><h3>Encrypted backup</h3><p>Export your profiles, clients and documents. Keep your passphrase safe. It cannot be recovered.</p></div></div><label>Backup passphrase<input type="password" value={backupPass} onChange={e=>setBackupPass(e.target.value)} placeholder="At least 10 characters"/></label><div className="button-row"><button className="primary" onClick={makeBackup}>Export encrypted backup</button><label className="secondary file-button">Restore backup<input type="file" accept=".igbackup,application/octet-stream" onChange={e=>e.target.files?.[0] && restoreBackup(e.target.files[0])}/></label></div></div>
        <div className="panel"><div className="panel-title"><span className="step-number">3</span><div><h3>Local data and privacy</h3><p>Invoice Gen prototype stores information in this browser on this device.</p></div></div><div className="notice">This prototype does not have account registration or cloud synchronisation. Clearing browser data, private browsing or uninstalling a browser may remove locally stored information. Export a backup regularly. Do not use real sensitive financial information during public prototype testing.</div><button className="danger" onClick={async()=>{if(confirm("Permanently delete all local Invoice Gen data from this browser?")){await db.clearAll();setProfile(emptyProfile);setClients([]);setDocuments([]);flash("Local data cleared.");}}}>Delete all local data</button></div>
        <div className="about"><b>Invoice Gen Prototype v0.1</b><span>Offline-first document generator · A4 invoices · A5 receipts</span></div>
      </section>}
    </main>
    {clientFormOpen && <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h2>Save client</h2><button className="icon-button" onClick={()=>setClientFormOpen(false)}>×</button></div><div className="field-grid">
      <Field label="Client name" value={clientDraft.name} onChange={v=>setClientDraft({...clientDraft,name:v})} required/>
      <Field label="Contact person" value={clientDraft.contact} onChange={v=>setClientDraft({...clientDraft,contact:v})}/>
      <Field label="Email" value={clientDraft.email} onChange={v=>setClientDraft({...clientDraft,email:v})}/>
      <Field label="Phone" value={clientDraft.phone} onChange={v=>setClientDraft({...clientDraft,phone:v})}/>
      <div className="full"><Field label="Address" value={clientDraft.address} onChange={v=>setClientDraft({...clientDraft,address:v})}/></div>
    </div><div className="form-actions"><button className="secondary" onClick={()=>setClientFormOpen(false)}>Cancel</button><button className="primary" onClick={saveClient}>Save client</button></div></div></div>}
    {previewDoc && <div className="modal-backdrop"><div className="preview-modal"><div className="modal-head"><div><h2>{previewDoc.number}</h2><p>{docLabel(previewDoc.type)} · {previewDoc.status}</p></div><button className="icon-button" onClick={()=>{setPreviewDoc(null);if(previewUrl)URL.revokeObjectURL(previewUrl);setPreviewUrl("");}}>×</button></div>
      {previewUrl ? <iframe title="PDF preview" src={previewUrl}/> : <div className="notice">PDF preview is unavailable. You can try downloading the document.</div>}
      <div className="button-row"><button className="secondary" onClick={()=>downloadDoc(previewDoc)}>Download PDF</button><button className="primary" onClick={()=>shareDoc(previewDoc)}>Share document</button></div>
    </div></div>}
  </div>;
}

function Field({ label, value, onChange, type="text", required=false }: {label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}) {
  return <label>{label}{required && <em> *</em>}<input type={type} value={value} onChange={e=>onChange(e.target.value)} /></label>;
}
function Upload({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}) {
  const [error,setError]=useState("");
  return <div className="upload-card"><b>{label}</b>{value ? <img className="asset-preview" src={value} alt={label}/> : <div className="upload-placeholder">＋</div>}<label className="secondary file-button">Upload PNG/JPEG<input type="file" accept="image/png,image/jpeg" onChange={async e=>{const f=e.target.files?.[0];if(f){try{onChange(await fileToDataUrl(f));setError("");}catch(err){setError(err instanceof Error?err.message:"Upload failed");}}}}/></label>{value && <button className="text-button" onClick={()=>onChange("")}>Remove</button>}{error && <small className="error">{error}</small>}</div>;
}
function ThemePicker({value,onChange}:{value:ThemeId;onChange:(v:ThemeId)=>void}) {
  return <div className="theme-grid">{themes.map(t=><button type="button" key={t.id} className={`theme-option ${value===t.id?"selected":""}`} onClick={()=>onChange(t.id)}><div className="swatches">{t.swatches.map(s=><span key={s} style={{background:s}}/>)}</div><b>{t.name}</b><small>{t.description}</small>{value===t.id && <span className="selected-mark">✓</span>}</button>)}</div>;
}
function DocumentList({documents,onOpen,onDownload,onShare,onVoid}:{documents:SavedDocument[];onOpen:(d:SavedDocument)=>void;onDownload:(d:SavedDocument)=>void;onShare?:(d:SavedDocument)=>void;onVoid?:(d:SavedDocument)=>void}) {
  if (!documents.length) return <div className="empty-state"><div>▤</div><b>No documents yet</b><p>Your generated documents will appear here.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Document</th><th>Recipient</th><th>Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{documents.map(d=><tr key={d.id}><td><b>{d.number}</b><small>{docLabel(d.type)}</small></td><td>{d.recipient.name || "—"}</td><td>{new Date(d.createdAt).toLocaleDateString()}</td><td>{money(d.type==="receipt"?d.amountReceived:d.total,d.currency)}</td><td><span className={`status ${d.status}`}>{d.status}</span></td><td><div className="table-actions"><button onClick={()=>onOpen(d)}>View</button><button onClick={()=>onDownload(d)}>PDF</button>{onShare && <button onClick={()=>onShare(d)}>Share</button>}{onVoid && d.status==="issued" && <button onClick={()=>onVoid(d)}>Void</button>}</div></td></tr>)}</tbody></table></div>;
}
