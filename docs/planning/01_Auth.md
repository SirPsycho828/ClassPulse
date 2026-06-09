## Overview

ClassPulse uses Firebase Auth with two sign-in methods: email/password and Google sign-in. All users are teachers. There is no student-facing access, no multi-role hierarchy, and no organization/school-level accounts in MVP. A single admin flag on the teacher's Firestore document controls access to OpenRouter model configuration (see `20_OpenRouter_Admin.md`).

## Dependencies

- `02_Database_Schema.md` -- teacher profile document structure
- `04_UI_Design_System.md` -- auth page styling, form patterns
- `20_OpenRouter_Admin.md` -- admin-only routes and guards

## Auth Methods

### Email/Password

Standard Firebase email/password auth. Email verification required before accessing the app.

**Sign-up flow:**
1. Teacher enters name, email, password on sign-up page
2. Firebase creates auth user
3. Cloud Function `onUserCreate` trigger creates the teacher profile document in `teachers/{uid}` (see `02_Database_Schema.md`)
4. Verification email sent automatically
5. Teacher lands on "Check your email" screen
6. After clicking verification link, teacher is redirected to Dashboard

**Sign-in flow:**
1. Teacher enters email/password
2. Firebase authenticates
3. If email not verified, redirect to "Check your email" screen with resend option
4. If verified, redirect to Dashboard

### Google Sign-In

Firebase Google auth provider using popup method (not redirect -- popup works better with Firebase Hosting's default COOP headers).

**Flow:**
1. Teacher clicks "Sign in with Google" button
2. Google popup opens, teacher selects account
3. Firebase creates or links auth user
4. `onUserCreate` trigger fires for new users, creating the teacher profile document
5. Google accounts are treated as verified by default -- no email verification step
6. Redirect to Dashboard (new users) or Dashboard (returning users)

**No onboarding wizard.** New users land directly on the Dashboard with an empty state that guides them to create their first class and analysis. The empty state IS the onboarding (see `06_Dashboard.md`).

## Auth States

The app tracks four auth states. Route guards use these to control navigation.

| State | Meaning | Allowed Routes |
|-------|---------|---------------|
| `unauthenticated` | No Firebase user | Sign-in, Sign-up only |
| `unverified` | Firebase user exists, email not verified | Verify-email screen only |
| `authenticated` | Verified Firebase user with teacher profile | All app routes |
| `admin` | Authenticated + `isAdmin: true` on teacher doc | All app routes + admin settings |

**State detection logic:**
1. `onAuthStateChanged` fires -- if no user, state is `unauthenticated`
2. User exists but `emailVerified` is false and provider is not Google -- state is `unverified`
3. User exists and verified (or Google provider) -- state is `authenticated`
4. Check teacher profile doc for `isAdmin: true` -- if set, state is `admin`

Note: `admin` is a superset of `authenticated`, not a separate state. Admin users access everything authenticated users can, plus the OpenRouter admin page.

## Route Guards

### PublicRoute

Guards sign-in and sign-up pages. Redirects signed-in users away from auth pages.

```
if authenticated -> redirect to /dashboard
if unverified -> redirect to /verify-email
if unauthenticated -> render auth page
```

All signed-in states redirect. A teacher who just signed up with Google and lands in `authenticated` state must not get stuck on the sign-in page.

### PrivateRoute

Guards all app routes (Dashboard, Setup, Class Overview, etc.).

```
if unauthenticated -> redirect to /sign-in
if unverified -> redirect to /verify-email
if authenticated or admin -> render protected page
```

### AdminRoute

Guards the OpenRouter admin settings page only.

```
if not admin -> redirect to /dashboard
if admin -> render admin page
```

## Teacher Profile Creation

A Cloud Function `onUserCreate` trigger fires when Firebase Auth creates a new user (either method). This function creates the teacher profile document.

**Trigger:** `functions.auth.user().onCreate`

**Action:** Create document at `teachers/{uid}` with:

| Field | Value |
|-------|-------|
| `uid` | From auth user |
| `email` | From auth user |
| `displayName` | From auth user (Google provides this; email/password uses the name from sign-up form, passed via `displayName` on the auth user) |
| `isAdmin` | `false` |
| `preferences` | Default preferences object (see below) |
| `createdAt` | Server timestamp |

**Default preferences:**

| Preference | Default | Purpose |
|------------|---------|---------|
| `confidenceThreshold` | `0.7` | Below this, items are flagged for review |
| `autoConfirmExact` | `true` | Auto-confirm exact roster name matches |

These are fixed for v1. The spec mentions adaptive trust calibration (adjusting thresholds based on correction rate) but that is deferred to post-MVP (see `23_Future_Features.md`).

## Password Requirements

Use Firebase Auth defaults. Do not add custom password validation beyond what Firebase enforces (minimum 6 characters). Adding stricter rules creates friction for a teacher audience without meaningful security benefit for this application.

## Session Management

Firebase Auth handles session persistence automatically. Use the default `browserLocalPersistence` so teachers stay signed in across browser sessions. No custom token refresh logic needed.

**Session behavior:**
- Closing the browser does not sign the teacher out
- Token refresh is handled by the Firebase SDK
- Signing out clears the local session: `signOut(auth)`
- No server-side session store needed

## Password Reset

Standard Firebase password reset flow. "Forgot password?" link on sign-in page triggers `sendPasswordResetEmail`. No custom reset UI beyond the link and a confirmation message ("Check your email for a reset link").

## Account Deletion

Not in MVP scope. If needed, manually delete via Firebase Console. Mention in a future settings page (see `23_Future_Features.md`).

## Admin Assignment

**There is no admin sign-up flow or self-service admin promotion.** Admin status is assigned by manually setting `isAdmin: true` on a teacher's Firestore document via the Firebase Console. This is intentional for MVP -- the app owner (you) controls who can change AI model configuration.

For the development environment, seed your own teacher document with `isAdmin: true` after first sign-in.

## Firebase Auth Initialization

Use `getAuth(app)` for initialization, not `initializeAuth`. Simpler API, matches standard Firebase patterns, and avoids issues with custom persistence configuration.

Do not set `Cross-Origin-Opener-Policy` headers in `firebase.json` hosting config. Firebase Hosting's default (`unsafe-none`) is required for Google popup auth to work correctly.

## Security Rules Integration

Firebase Auth `uid` is the anchor for all Firestore security rules. Every collection uses `auth.uid` to scope reads and writes to the owning teacher. See `02_Database_Schema.md` for the complete rules.

Cloud Functions that modify data on behalf of a teacher must verify `auth.uid` matches the teacher ID on the target document. The Admin SDK bypasses security rules, so functions must enforce ownership checks in code.

## Routes Summary

| Route | Guard | Component |
|-------|-------|-----------|
| `/sign-in` | PublicRoute | Sign-in form (email/password + Google button) |
| `/sign-up` | PublicRoute | Sign-up form (name, email, password + Google button) |
| `/verify-email` | Requires auth user, unverified | Verification prompt with resend button |
| `/dashboard` | PrivateRoute | Dashboard (see `06_Dashboard.md`) |
| `/analysis/new` | PrivateRoute | Setup wizard (see `08_Assignment_Setup.md`) |
| `/analysis/:id` | PrivateRoute | Class Overview (see `17_Class_Overview.md`) |
| `/analysis/:id/student/:studentId` | PrivateRoute | Student Detail (see `18_Student_Detail.md`) |
| `/analysis/:id/interventions` | PrivateRoute | Intervention Planner (see `19_Intervention_Planner.md`) |
| `/admin/models` | AdminRoute | OpenRouter model config (see `20_OpenRouter_Admin.md`) |

## Gaps & Assumptions

| Item | Type | Resolution |
|------|------|------------|
| Admin role assignment | Gap | No UI for promoting users to admin. Manual Firestore edit only. Acceptable for MVP with a single admin. |
| Account deletion | Gap | Deferred. No self-service account deletion in MVP. |
| Multiple teachers per class | Assumption | One teacher per class. No sharing or collaboration features. |
| Sign-up form `displayName` | Assumption | The sign-up form collects a "Name" field and sets it as `displayName` on the Firebase Auth user before the `onUserCreate` trigger fires. This ensures the trigger has access to the name. |
| Email verification resend throttling | Assumption | Firebase handles throttling of verification emails. No custom rate limiting needed. |
| Adaptive confidence thresholds | Deferred | Spec describes sliding-window trust calibration based on correction rate. Fixed thresholds for v1. See `21_Override_Confidence_Model.md`. |  
