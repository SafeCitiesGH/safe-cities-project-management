# AI Prompt Log — Entry 1

**Date:** June 25, 2026  **Project Sprint:** Phase 6 — Multi-format document export  **Tool used:** Claude

---

## A | Before You Prompted — Problem Context

**Backlog story / task reference**
US-XX · *Multi-format export ("Download as…") for every document, sheet, and form*
*(placeholder — swap in the real sprint reference)*

**Functional area**
Document management / Export & interoperability

**Describe the problem in your own words — before opening any AI tool**
Every file in the platform — TipTap rich-text pages, ReactGrid sheets, and forms — can currently only be exported one way: a single **Download** button in the top-right header that produces a PDF. PDF is fine for read-only sharing but useless to clients who need to keep editing. A large part of our client base lives in Google Drive (some in OneDrive), so they need an *editable* artifact, not a flat PDF. The goal for Phase 6 is to convert that single Download button into a dropdown offering PDF, a format editable in OneDrive, and a format usable in Google Docs.

Constraints: it has to fit the existing stack (Next.js 15 App Router, tRPC, Clerk/Supabase, TipTap + Yjs collaborative content stored as HTML, ReactGrid for sheets) and respect the existing permission and file-lock/password logic. Ideally minimal new infrastructure. End users are programme/case-management staff and external partners, most of whom work in Google Workspace.

**What did you already know or try before using AI?**
I knew the export path was already centralized: the button lives in `file-header.tsx`, calls `handleDownload`, which calls `downloadFile()` in `pdfExport.client.ts` using **html2pdf.js** client-side against the TipTap HTML. I also knew Radix's `DropdownMenu` was already in the codebase, so the menu primitive was free. My first instinct was just to bolt a second "Download as Word" button next to the existing one and generate the docx client-side. I moved off that because (a) it didn't scale to three+ formats cleanly, (b) I wasn't confident how to convert TipTap HTML into a Word file that survives in both Word Online and Google Docs, and (c) I couldn't tell whether "Google Docs format" meant a separate file type or a full Google Drive API integration.

---

## B | The Prompt Session

**Your initial prompt (copy it exactly)**
> you are an expert in your field. now, for phase 6, i want the download button in the top right corner of every file/document/form that is created to be a drop down for a pdf, or a file type supported to be edited in one drive or a file type to be supported in google docs since a large part of our client base currently works in google drive. give a concrete plan, how you would go about this. do not make any changes, but give a summarized guide.

**Refined prompt (if applicable)**
I didn't refine it mid-session, but I should have. The prompt left the biggest decision implicit — whether I wanted *generate-and-download* files or a *live "Open in Google Docs / Edit in OneDrive"* cloud integration — so the AI had to answer for both. A refined version would have said: "Scope to download-only for now; map document → PDF/DOCX, sheet → PDF/XLSX/CSV; here are the relevant files: `file-header.tsx`, `pdfExport.client.ts`."

**Summary of AI output**
A plan only, no code (as requested). The load-bearing insight: a single **`.docx`** is natively editable in *both* Word Online/OneDrive *and* Google Docs (Docs imports/converts `.docx`), so for documents PDF + DOCX covers all three asks; sheets map to XLSX/CSV. It split the work into two scopes — **Path A: generate-and-download** (no OAuth, recommended) vs **Path B: true cloud "Open in"** (Google Drive API + Microsoft Graph, OAuth, per-user token storage, a later sub-phase). Implementation steps for Path A: define an `ExportFormat` type plus a per-file-type allowed-format map; convert the single button into a Radix `DropdownMenu`; build a unified export module; run conversions **server-side** via a route handler / tRPC procedure (which also fixes the fact that sheets currently pass no `content` and so have no download today) using `html-to-docx` and SheetJS; add a normalization pass for custom TipTap nodes (`assignable-task-item`, `resizable-image`) before docx conversion; verify by round-tripping the `.docx` through both Word Online and Google Docs.

---

## C | Critical Reflection

**What did you have to change, fix, or discard from the AI output?**
Because it was a plan, nothing was discarded code-wise, but I narrowed it. I'm scoping Phase 6 to **Path A only** and shelving the cloud-integration path. I also flagged two things the AI correctly couldn't decide for me: the backlog reference is a placeholder, and "form export" needs a product call (blank form template as PDF vs. a CSV of submissions). The custom-TipTap-node caveat is the one technical claim I'm treating as a hypothesis to validate, not a fact to trust — those nodes are the most likely thing to break in conversion.

**How did you verify the output was correct?**
I cross-checked the AI's reading of the code against the actual files and confirmed it: export *is* centralized, the dropdown primitive *is* already imported, and sheets *don't* pass a `content` prop (so they genuinely have no download today). I also sanity-checked the central assumption — that Google Docs imports `.docx` and Word Online/OneDrive edits OOXML — which holds. Real verification will come at implementation: typecheck + lint, then generating one document, one sheet, and one form and opening the `.docx`/`.xlsx` in both Word Online and Google Docs/Sheets to confirm tables, images, headings, and task lists survive.

**What would you have needed to understand to write this without AI?**
Specifically: the OOXML/`.docx` format and HTML→docx conversion libraries (`html-to-docx`); the Office Online vs. Google Docs import-compatibility matrix; how to stream a generated binary from a Next.js Route Handler with the right `Content-Disposition`/MIME; SheetJS for building `.xlsx`/CSV from grid data; and, for the cloud path, Google Drive API + Microsoft Graph OAuth and token storage. My gap is the **document-conversion and cloud-OAuth layer** — I know the app architecture cold, but binary-format generation is the part I'd have had to research from scratch.

**What will you do differently next time?**
State the scope fork in the prompt up front so I don't get a two-headed plan. Specify the per-file-type → per-format mapping myself rather than letting the AI infer it. And paste the relevant file paths into the prompt — grounding the model in the actual code produced a far more concrete plan and would have done so on the first pass.

---

## D | Self-Assessment

**Confidence Without AI** (circle one)

1 — Could not do without AI  ·  2 — Needed a lot of help  ·  **➌ — Needed some help**  ·  4 — Could mostly do it  ·  5 — Could do it entirely

**Justify your rating in one or two sentences**
I could design the dropdown UI and wire the tRPC/route plumbing independently because I know this codebase, but I'd have spent real time researching reliable HTML→DOCX conversion and the OneDrive/Google compatibility specifics — the part AI compressed most. The architecture was mine; the format-conversion knowledge was the assist.
