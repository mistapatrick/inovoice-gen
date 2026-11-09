# Invoice Gen Prototype v0.1

A mobile-first, offline-capable Progressive Web App prototype for creating:
- Pro Forma Invoices (A4)
- Regular Invoices (A4)
- Payment Receipts (A5)

It includes four document themes: Corporate, Modern Minimal, Executive and Creative.

## Technology

- React + TypeScript + Vite
- IndexedDB for local persistence
- pdf-lib + embedded DejaVu Sans fonts for on-device PDF generation and Naira/Unicode text support
- Web Crypto API for encrypted backup export/import
- PWA manifest and service worker

## Requirements

- Node.js 20 or later
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. For realistic mobile testing, open the development URL from a phone on the same network, or deploy a preview.

## Production build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`.

## GitHub

Create a new GitHub repository, then:

```bash
git init
git add .
git commit -m "Initial Invoice Gen prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/invoice-gen-prototype.git
git push -u origin main
```

## Netlify deployment

1. Import the GitHub repository into Netlify.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add a redirect rule for SPA routing if needed. The app currently uses client-side state rather than URL routes.
5. If the Powered by Netlify badge is enabled for the site, turn it off in the Netlify project settings where the option is available.

A `_redirects` file is included for SPA fallback.

## Vercel deployment

1. Import the GitHub repository into Vercel.
2. Framework preset: Vite.
3. Build command: `npm run build`
4. Output directory: `dist`

## Data and privacy notes

- No account registration or backend is included.
- Business profiles, clients and documents are stored in the browser's IndexedDB on the current device and origin.
- The app does not upload invoice data to a server.
- Exported encrypted backups use PBKDF2 + AES-GCM. Keep the passphrase safe; it cannot be recovered.
- Browser storage is not a substitute for native secure storage. Do not use real sensitive financial information during public testing.
- The current PDF hash/verification capability is not a central verification registry. A standalone QR verification service is intentionally not claimed in this prototype.
- The PDF signature is a visual signature, not a certificate-backed electronic signature.
- Premium billing is not connected in v0.1. The prototype contains the branding preference but no live payment flow.

## Prototype limitations to validate

- The prototype currently supports one local business profile.
- Document numbers are locally sequenced and may collide if a user clears browser storage or restores conflicting backups.
- Pro Forma validity is 30 calendar days from issue date.
- A receipt records information entered by the user; it does not independently verify receipt of funds.
- PDF layout and pagination need testing with long descriptions and large item counts.
- The app should be tested on actual Android and iOS browsers before user research begins.

## Suggested next steps

1. Run the app locally and test the three document workflows.
2. Test all four PDF themes.
3. Test downloads and native share support on Android and iOS.
4. Test offline reload after the first successful online load.
5. Deploy preview builds to Netlify and Vercel.
6. Conduct moderated usability testing with a small group of freelancers.
