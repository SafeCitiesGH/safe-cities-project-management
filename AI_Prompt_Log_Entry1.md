# AI Prompt Log · Study Abroad CS Programme

## ENTRY 1

**Date:** 17 June 2026
**Project Sprint:** Safe Cities PM — Access Control & File Security
**Tool used:** Claude (Cowork mode)

---

## A | Before You Prompted — Problem Context

**Backlog story / task reference**
US-31 · Restore non-admin visibility after DB recovery + US-32 · Password-protect individual files

**Functional area**
Authentication / Authorisation (file permissions) and File management

**Describe the problem in your own words — before opening any AI tool**

Our project database was lost and we rebuilt it from a backup, so all the data we have is from before the loss. As an admin I can see every programme, every chat, and every file — but a normal (non-admin) user logs in and sees nothing at all: no programmes, no chats, nothing. I needed to (1) understand *why* the user side is empty when the data clearly exists, and (2) add two features on top of that understanding. Feature 1: let an admin assign a user to a specific programme (e.g. Permaculture) so that user can finally see that programme's contents on their own account, without being made an admin. Feature 2: when creating a new file, let the creator flip a switch to password-protect it — they type and confirm a password, a lock icon shows next to the file, and re-opening it prompts for that password. The constraints are that it has to fit the existing Next.js / tRPC / Drizzle codebase and not break the recovered data. End users are programme staff (non-admins who should see only their assigned programmes) and admins who manage assignments.

**What did you already know or try before using AI?**

I already understood the *symptom* well: I knew the data survived recovery, that admins were unaffected, and that the problem was specific to the non-admin role — which told me it was a permissions/visibility issue rather than missing content. I knew the app had an admin role and some kind of per-file permission system because I'd used the share feature before. What I had *not* done was trace how the permission checks actually work end-to-end, or confirm which tables the recovery failed to repopulate. I also knew roughly what UX I wanted for both features (the members panel idea, the password switch + confirm + lock icon), but I hadn't decided on the technical approach — e.g. whether to hash or encrypt, or where assignment should live in the data model.

---

## B | The Prompt Session

**Your initial prompt (copy it exactly)**

> You are an expert in your field. I want to implement two features. But first, let me give context: As an admin in my database, I can see all of the programs. As you know, the database was lost and we worked to recover it, so all of the recovered data was made before it was lost. But, as a user, I cannot see anything. No programmes, no chats, nothing. I want to add two features: explain to me the process and why everything is as it is. I want to add a feature that allows an admin to assign a user to a program so that if someone wants to see stuff they don't have to be an admin. With this, let's say you have a permaculture programme — the admin can assign the user to permaculture and they can finally see things on their end. The other feature I want to implement is the ability, when making a new file, to choose whether or not you want it to be password protected. This can be a slider that the user activates. They are then prompted to type a password, confirm it, and now whenever they want to go back into it, there will be a lock icon next to it and they will be prompted with entering that specific password.

**Refined prompt (if applicable)**

I didn't rewrite the whole prompt, but I answered a set of clarifying questions the tool asked before it did any work. I told it to: plan first rather than build straight away (because a migration would touch the recovered DB), put the assignment control in a per-programme "Members" panel, prompt for the password on *every* open rather than caching it for the session, and use a hashed access-gate rather than full encryption at rest. Adding those constraints was the real refinement — my first prompt described *what* I wanted but left the safety/scope trade-offs open, and those decisions changed the design.

**Summary of AI output**

The tool read through the codebase first, then produced two things. A *diagnosis*: the app has two independent access paths — admins get edit on everything purely from `users.role`, while non-admins get visibility only from rows in `file_permission` / `effective_permission`. Recovery restored the content tables but not those grant rows, so every non-admin's accessible-file set computes to empty. That is the exact reason the user side is blank. Then an *implementation plan*: Feature 1 is mostly wiring because a programme is already a file row and an assignment is already a permission row, with an inheritance engine that already cascades a grant to descendants — so it needs admin-gated endpoints plus a Members panel, and one bug fix (the recent-chats query only reads direct grants, not inherited ones). Feature 2 needs two new non-destructive columns on the file table (`isPasswordProtected`, `passwordHash`), a `bcryptjs` dependency, a switch + confirm in the create dialog, a lock icon in the tree, and an unlock dialog that re-verifies on every open. It also listed migration sequencing, a verification plan, and open questions (admin bypass, whether uploads are lockable).

---

## C | Critical Reflection

**What did you have to change, fix, or discard from the AI output?**

I steered several decisions rather than accepting defaults. The tool initially left the password strength open between a hashed gate and full encryption-at-rest; I rejected encryption because losing a password would make content permanently unrecoverable, and chose the hashed gate. I also overrode the session-caching idea and required a prompt on *every* open, which matches what I actually described. On the assignment feature, the tool noted I *could* expose a view/comment/edit selector, but for our use case "view" is really all a non-admin should get, so that's still an open item I'll likely lock down. I also held back from letting it run the schema migration — I want to see the generated SQL diff against the recovered DB before anything touches it. Nothing in the diagnosis was wrong, but I treated the plan as a proposal to be pruned, not a finished spec.

**How did you verify the output was correct?**

The diagnosis was checkable against the actual code: it pointed at specific files and logic (`permissions-ultra-fast.ts` short-circuiting on `role === 'admin'`, `getFilteredFileTree` building the tree only from accessible IDs, `getRecentChats` reading `file_permission` directly), and those claims matched what I could read in the repo, so the "why" held up. I haven't fully verified the *plan* yet because no code has been written — the plan itself includes a verification step I intend to run: type-check and lint with `npm run check`, then manually test as both an admin and a freshly-assigned non-admin account, and confirm the password hash never appears in any network response. I'll only consider it correct once that passes.

**What would you have needed to understand to write this without AI?**

The big gap is the permission architecture: how role-based short-circuiting and the grant-based `file_permission` → `effective_permission` inheritance cache fit together, and why a folder/programme grant cascades to descendants. I'd also have needed to be fluent in tRPC procedures and Drizzle schema/migrations to know that adding nullable columns is a safe, non-destructive change, and to know the difference between hashing (bcrypt) and encryption-at-rest and the recoverability trade-off between them. I understood the *problem* and the *desired UX* on my own; what I leaned on AI for was the precise mapping of those onto this codebase.

**What will you do differently next time?**

Put the constraints in the *first* prompt instead of waiting to be asked — I knew I wanted "plan before build," "prompt every time," and "don't break the recovered DB," and stating those upfront would have produced a tighter first answer. I'd also explore the permissions code myself for ten minutes first so I'm reviewing the diagnosis as a peer rather than learning it cold, which is the difference between checking AI's work and trusting it.

---

## D | Self-Assessment

**Confidence Without AI (circle one):** **3 — Needed some help**

**Justify your rating in one or two sentences**

I genuinely understood the problem, scoped both features, and made the key engineering calls (hashed gate over encryption, view-only assignment, prompt-every-time, plan-before-migrate), so I was driving the decisions — but I could not have traced this specific permission architecture or confidently designed the Drizzle migration and bcrypt flow on my own yet. The understanding was mine; the codebase-specific mapping is the part I still need AI's help to produce quickly.
