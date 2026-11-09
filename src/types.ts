export type DocType = "proforma" | "invoice" | "receipt";
export type ThemeId = "corporate" | "minimal" | "executive" | "creative";
export type Item = { id: string; description: string; quantity: number; unit: string; unitPrice: number };
export type Profile = {
  name: string; tradingName: string; address: string; phone: string; email: string;
  website: string; taxId: string; currency: string; bankName: string;
  accountName: string; accountNumber: string; logo: string; signature: string;
};
export type Client = { id: string; name: string; contact: string; address: string; phone: string; email: string; taxId: string };
export type SavedDocument = {
  id: string; number: string; type: DocType; createdAt: string; profile: Profile;
  recipient: Client; items: Item[]; currency: string; theme: ThemeId;
  discount: number; taxRate: number; additionalCharges: number;
  paymentDate: string; paymentMethod: string; paymentReference: string;
  amountReceived: number; notes: string; total: number; pdfData?: string;
  status: "issued" | "void";
};
export const emptyProfile: Profile = {
  name: "", tradingName: "", address: "", phone: "", email: "", website: "", taxId: "",
  currency: "NGN", bankName: "", accountName: "", accountNumber: "", logo: "", signature: ""
};
export const emptyClient: Client = { id: "", name: "", contact: "", address: "", phone: "", email: "", taxId: "" };
