# PRD — M00: Auth & Identity
**Platform:** AI-Powered All-in-One CRM & Growth Platform
**Version:** 1.0 | **Date:** July 2, 2026
**Layer:** L0 Foundation | **Priority:** P0 | **Build Phase:** 1 (Session 1)
**Depends On:** None (first module) | **Blocks:** Every other module

---

## 1. Purpose

Provide secure, reliable authentication and identity management for every user of the platform — agency owners, workspace staff, and (later) client portal users. This module is the front door of the entire system: every session, every API call, and every permission check flows through it.

M00 handles *who you are*. Workspace membership (M01) and *what you can do* (M02) are separate modules that consume M00's session.

---

## 2. Goals & Non-Goals

### Goals
- Email/password signup and login with secure password hashing
- Google OAuth as a one-click alternative
- Magic link (passwordless) login option
- Two-factor authentication (TOTP) as an optional security layer
- Session management: JWT-based sessions via NextAuth.js v5, refresh handling, device/session listing
- Password reset and email verification flows
- Account-level profile management (name, email, avatar, password change)
- Rate limiting and brute-force protection on all auth endpoints
- Auth events emitted to the audit log (M07) and notifications (M04)

### Non-Goals (handled elsewhere)
- Workspace creation/switching → M01
- Roles and permissions → M02
- White-label branded login pages → M42 (this module must be *themeable*, but branding config lives there)
- Client portal logins → M37 (reuses this module with a portal-scoped session type)
- SSO/SAML for enterprise → future roadmap, design for it but don't build now

---

## 3. User Stories

| # | As a... | I want to... | So that... |
|---|---|---|---|
| U1 | New agency owner | Sign up with email + password or Google | I can start using the platform in under 60 seconds |
| U2 | Returning user | Log in and stay logged in for 30 days | I don't re-authenticate constantly |
| U3 | Invited staff member | Accept an email invitation and set my password | I can join my agency's workspace |
| U4 | Security-conscious user | Enable 2FA with an authenticator app | My account can't be accessed with just a password |
| U5 | Forgetful user | Reset my password via email link | I can regain access safely |
| U6 | User on a shared computer | See all my active sessions and revoke them | I can log out a forgotten session remotely |
| U7 | User | Log in via a magic link emailed to me | I never need to remember a password |
| U8 | Platform (system) | Verify email ownership before account activation | Spam and typo'd accounts are prevented |

---

## 4. Feature Specifications

### 4.1 Signup (Email/Password)
- Fields: full name, email, password
- Password rules: minimum 8 characters, at least 1 number; strength meter shown live (zxcvbn library)
- Password hashed with **bcrypt (cost 12)** — never stored or logged in plaintext
- On signup: create `users` row → send verification email → redirect to "check your email" screen
- Unverified accounts can log in but see a verification banner; sending (SMS/email campaigns) is blocked until verified
- Duplicate email → friendly error: "An account with this email already exists. Log in instead?"

### 4.2 Login (Email/Password)
- Fields: email, password, "Remember me" checkbox
- Remember me: 30-day session; unchecked: 24-hour session
- Failed attempts: after 5 failures within 15 minutes → account locked for 15 minutes + email alert to the user
- Generic error message on failure ("Invalid email or password") — never reveal which field was wrong

### 4.3 Google OAuth
- NextAuth Google provider
- If email already exists as a password account → **link accounts** after confirming password once (prevents account takeover via OAuth)
- New Google signups: auto-verified email, profile name + avatar imported

### 4.4 Magic Link Login
- User enters email → receive one-time login link (valid 15 minutes, single use)
- Token: 32-byte random, stored hashed in `auth_tokens`, consumed on use
- Rate limit: max 3 magic link requests per email per hour

### 4.5 Two-Factor Authentication (TOTP)
- Setup flow: Settings → Security → Enable 2FA → show QR code (otplib) → user confirms with a 6-digit code → generate 10 single-use backup codes (shown once, stored hashed)
- Login with 2FA: password step → 2FA step (6-digit code or backup code)
- Disable 2FA requires current password + valid code
- Recovery: backup codes only (support-assisted recovery is an M44 admin tool)

### 4.6 Password Reset
- "Forgot password" → email with reset link (valid 1 hour, single use, hashed token)
- Reset invalidates **all** existing sessions for that user
- Email sent whether or not the account exists (identical response — no account enumeration)

### 4.7 Email Verification
- 24-hour verification links; resend allowed (max 3/hour)
- Changing email address triggers re-verification of the new address; old address gets a security notice

### 4.8 Session Management
- NextAuth.js v5, JWT strategy
- JWT payload: `{ user_id, email, name, avatar_url, email_verified, twofa_enabled }` — **no workspace data** (M01 adds active workspace via its own mechanism)
- Sessions page (Settings → Security): list active sessions with device, browser, IP-derived location, last active; "Revoke" per session and "Log out everywhere"
- Session revocation implemented via a `session_version` integer on `users` — bumping it invalidates all JWTs (checked in middleware)

### 4.9 Invitation Acceptance
- M01/M02 create invitations; M00 owns the acceptance flow:
- Invite link → if email has no account: signup form pre-filled with locked email → account created → M01 attaches workspace membership
- If account exists: login → M01 attaches membership

### 4.10 Profile Management
- Editable: name, avatar (upload → R2 via M06, or initials fallback), email (with re-verification), password (requires current password)
- Deleting account: soft delete with 30-day grace period; blocked if user is sole owner of any workspace (must transfer first — M01 rule)

### 4.11 Security Hardening
- Rate limiting (Redis): login 10/min/IP, signup 5/hour/IP, password reset 3/hour/email
- CSRF protection (NextAuth built-in) on all auth forms
- Secure cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`
- All auth events logged: login success/fail, logout, password change, 2FA enable/disable, session revoked → `auth_events` table (consumed by M07 audit log)
- Suspicious login detection (new device/country) → email notification via M04

---

## 5. Database Schema (Prisma)

```prisma
model User {
  id               String    @id @default(uuid())
  email            String    @unique
  emailVerified    DateTime?
  passwordHash     String?   // null for OAuth-only accounts
  name             String
  avatarUrl        String?
  twofaEnabled     Boolean   @default(false)
  twofaSecret      String?   // encrypted at rest (AES-256, key from env)
  sessionVersion   Int       @default(1)
  status           UserStatus @default(ACTIVE) // ACTIVE | LOCKED | DELETED
  deletedAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  oauthAccounts    OauthAccount[]
  authTokens       AuthToken[]
  backupCodes      BackupCode[]
  sessions         UserSession[]
  authEvents       AuthEvent[]
}

model OauthAccount {
  id                String  @id @default(uuid())
  userId            String
  provider          String  // "google"
  providerAccountId String
  user              User    @relation(fields: [userId], references: [id])
  @@unique([provider, providerAccountId])
}

model AuthToken {
  id         String    @id @default(uuid())
  userId     String
  tokenHash  String    @unique // sha256 of raw token
  type       TokenType // MAGIC_LINK | PASSWORD_RESET | EMAIL_VERIFY
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime  @default(now())
  user       User      @relation(fields: [userId], references: [id])
}

model BackupCode {
  id        String    @id @default(uuid())
  userId    String
  codeHash  String
  usedAt    DateTime?
  user      User      @relation(fields: [userId], references: [id])
}

model UserSession {
  id           String   @id @default(uuid())
  userId       String
  deviceInfo   String   // parsed user agent summary
  ipAddress    String
  location     String?  // "Toronto, CA" from IP
  lastActiveAt DateTime
  createdAt    DateTime @default(now())
  revokedAt    DateTime?
  user         User     @relation(fields: [userId], references: [id])
}

model AuthEvent {
  id        String   @id @default(uuid())
  userId    String?
  email     String   // captured even for failed logins on unknown emails
  type      String   // login_success | login_failed | logout | password_reset |
                     // password_changed | twofa_enabled | twofa_disabled |
                     // session_revoked | account_locked | email_changed
  ipAddress String
  userAgent String
  metadata  Json?
  createdAt DateTime @default(now())
  user      User?    @relation(fields: [userId], references: [id])
}

enum UserStatus { ACTIVE LOCKED DELETED }
enum TokenType { MAGIC_LINK PASSWORD_RESET EMAIL_VERIFY }
```

---

## 6. API Endpoints

All under `/api/auth/` (Next.js App Router route handlers). Response format: `{ success: boolean, data?: any, error?: string }`.

| Method | Endpoint | Purpose | Rate Limit |
|---|---|---|---|
| POST | `/api/auth/signup` | Create account (email/password) | 5/hr/IP |
| POST | `/api/auth/login` | Handled by NextAuth credentials provider | 10/min/IP |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth core (Google OAuth, callbacks, session) | — |
| POST | `/api/auth/magic-link` | Request magic link email | 3/hr/email |
| GET | `/api/auth/magic-link/verify?token=` | Consume magic link, create session | — |
| POST | `/api/auth/verify-email/send` | Resend verification email | 3/hr/email |
| GET | `/api/auth/verify-email?token=` | Confirm email | — |
| POST | `/api/auth/password/forgot` | Send reset email (identical response always) | 3/hr/email |
| POST | `/api/auth/password/reset` | Set new password with token; bump sessionVersion | — |
| POST | `/api/auth/password/change` | Change password (authed; requires current) | — |
| POST | `/api/auth/2fa/setup` | Generate TOTP secret + QR (authed) | — |
| POST | `/api/auth/2fa/confirm` | Verify first code, enable 2FA, return backup codes | — |
| POST | `/api/auth/2fa/verify` | Verify code during login step-up | 10/min/user |
| POST | `/api/auth/2fa/disable` | Disable (requires password + code) | — |
| GET | `/api/auth/sessions` | List active sessions (authed) | — |
| DELETE | `/api/auth/sessions/:id` | Revoke one session | — |
| DELETE | `/api/auth/sessions` | Revoke all (bump sessionVersion) | — |
| PATCH | `/api/auth/profile` | Update name/avatar/email | — |
| DELETE | `/api/auth/account` | Soft-delete account (grace period) | — |

**Middleware contract for all other modules:**
```ts
// lib/auth.ts — every protected route in every module uses this
export async function requireUser(req): Promise<{ userId: string; email: string }> 
// throws 401 if no valid session or sessionVersion mismatch
```

---

## 7. UI Pages & Components

| Route | Page | Key Elements |
|---|---|---|
| `/signup` | Signup | Name/email/password, strength meter, Google button, ToS checkbox, link to login |
| `/login` | Login | Email/password, Remember me, Google button, Magic link toggle, Forgot password link |
| `/login/2fa` | 2FA step | 6-digit code input (auto-advance boxes), backup code fallback link |
| `/verify-email` | Verification | Success/error states, resend button with cooldown timer |
| `/forgot-password` | Request reset | Email input, always-success confirmation screen |
| `/reset-password` | Set new password | New password + confirm, strength meter, expired-token state |
| `/invite/:token` | Accept invite | Pre-filled locked email, set name + password (or "log in to accept") |
| `/settings/profile` | Profile | Name, avatar upload, email change |
| `/settings/security` | Security | Change password card, 2FA card (setup wizard modal), Active sessions table |

**Design notes:**
- Auth pages: centered card layout (max-w-md), platform logo top, minimal footer
- All forms: React Hook Form + Zod, shadcn/ui `Input`, `Button`, `Card`, inline field errors
- Loading states on every submit button; disable during request
- White-label ready: logo, primary color, and platform name read from a `branding` config object (hardcoded default now; M42 overrides later)

---

## 8. Emails Sent by This Module

| Email | Trigger | Contains |
|---|---|---|
| Verify your email | Signup / email change | Verification link (24h) |
| Magic login link | Magic link request | Login link (15min) |
| Reset your password | Forgot password | Reset link (1h) |
| Password changed | Successful change/reset | Security notice + "wasn't you?" support link |
| New login detected | Login from new device/country | Device, location, time, revoke link |
| Account locked | 5 failed attempts | Unlock time, reset suggestion |
| 2FA enabled/disabled | 2FA change | Security notice |

All sent via Resend/SendGrid through a shared `sendAuthEmail()` helper. Templates: simple branded HTML (logo + button + footer), stored in `/emails/auth/`.

---

## 9. Acceptance Criteria (Definition of Done)

- [ ] User can sign up, verify email, log in, log out (email/password)
- [ ] Google OAuth works for both new signup and login; account-linking flow verified
- [ ] Magic link login works end-to-end; token single-use enforced
- [ ] 2FA setup, login step-up, backup codes, and disable all work
- [ ] Password reset invalidates all sessions
- [ ] Rate limits verified on login, signup, magic link, reset (Redis)
- [ ] Session list shows real device/location data; revoke-one and revoke-all work
- [ ] Locked account auto-unlocks after 15 minutes
- [ ] No account enumeration: forgot-password and signup errors reveal nothing
- [ ] All 10 auth event types written to `auth_events`
- [ ] `requireUser()` middleware exported and documented for downstream modules
- [ ] Zod validation on every endpoint; passwords never appear in any log
- [ ] All auth pages responsive at 375px

---

## 10. Claude Code Prompt — M00

```
You are building Module M00 (Auth & Identity) for [PLATFORM_NAME],
an AI-powered CRM platform. This is the FIRST module — nothing exists yet.

TECH STACK: Next.js 15 App Router, NextAuth.js v5, Prisma + PostgreSQL 16,
Redis (rate limiting), Resend (email), shadcn/ui + Tailwind v4,
React Hook Form + Zod, bcrypt, otplib.

BUILD, IN ORDER:
1. Prisma schema: User, OauthAccount, AuthToken, BackupCode, UserSession,
   AuthEvent models exactly as specified in the PRD. Run migration.
2. NextAuth v5 config: Credentials provider (bcrypt verify + lockout logic
   + sessionVersion check in JWT callback) and Google provider (with
   account-linking safety: existing password account requires password
   confirmation before linking).
3. API route handlers for: signup, magic-link request/verify,
   verify-email send/confirm, password forgot/reset/change,
   2FA setup/confirm/verify/disable, sessions list/revoke,
   profile update. All Zod-validated. All returning
   { success, data?, error? }. Rate limits via Redis
   (sliding window helper in lib/rateLimit.ts).
4. requireUser() helper in lib/auth.ts — the middleware every future
   module will import. Checks JWT validity AND sessionVersion.
5. UI pages: /signup, /login, /login/2fa, /verify-email,
   /forgot-password, /reset-password, /invite/[token],
   /settings/profile, /settings/security.
   Centered card layout, shadcn/ui components, inline Zod errors,
   loading states on all submit buttons.
6. sendAuthEmail() helper + 7 HTML email templates in /emails/auth/.
7. Auth event logging: write to auth_events on every listed event type.

SECURITY RULES (non-negotiable):
- bcrypt cost 12; tokens stored as sha256 hashes; TOTP secret encrypted
- Generic error messages — no account enumeration anywhere
- HttpOnly/Secure/SameSite=Lax cookies
- Passwords and tokens never logged
- Password reset bumps sessionVersion (kills all sessions)

Deliver complete, runnable code. Include a seed script creating one
test user (test@example.com / Password123) with verified email.
```

---

## 11. Open Questions / Decisions Needed

1. **Email provider:** Resend vs SendGrid for auth emails? (Recommend Resend — simpler DX; SendGrid stays for M16 campaigns.)
2. **Avatar storage:** Build now with local placeholder and wire R2 when M06 lands, or stub M06's upload helper immediately? (Recommend: initials avatar now, R2 in M06.)
3. **Account deletion grace period:** 30 days confirmed, or configurable?

---

*End of PRD — M00: Auth & Identity*
*Next in sequence: M01 — Workspaces & Multi-Tenancy*
