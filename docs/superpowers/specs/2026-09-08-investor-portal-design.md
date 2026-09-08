# Gradient Investor Portal Design

**Date:** September 8, 2026
**Status:** Approved for implementation planning

## Purpose

Extend the existing Gradient landing page with a polished, credible investor-portal preview. The preview should feel complete enough for a website demonstration while remaining a static, replaceable front end. It must not store credentials, imply that real investor data is available, or couple the interface to a particular authentication vendor.

This change also normalizes the About and Contact page heading sizes at `2.5rem`.

## Goals

- Add **Investor Login** as the third item in the glass navigation beneath the Gradient logo.
- Create a realistic sign-in experience and populated investor dashboard.
- Use the official Gradient brand palette, typeface, logos, and topographic artwork.
- Give important controls believable local UI states even though no backend is connected.
- Keep authentication behind a small interface so a real identity provider and an Authy-compatible MFA challenge can be introduced later.
- Work cleanly on desktop and mobile and meet basic keyboard, contrast, and reduced-motion expectations.

## Non-goals

- Real authentication, authorization, investor accounts, or MFA enrollment.
- Storage or transmission of passwords, personal information, or financial data.
- A production document-download service.
- Claims about security, compliance, performance, or live portfolio values.
- A framework migration or unrelated redesign of the existing public pages.

## Brand System

The portal will use supplied assets from the official 2026 Gradient brand package.

### Core tokens

- Gradient Black: `#0D0D0D`
- Gradient Eggshell: `#F9F9F9`
- Gradient Navy: `#01184D`
- Royal: `#0E389B`
- Dusk: `#5566C6`
- Tang: `#6684DB`
- Orchard: `#9A9AD9`
- Sunrise: `#C7C4EF`
- Citrus: `#FFAA17`
- Butter: `#FFDC17`
- Peach: `#EFB4C8`
- Lychee: `#F5E5D6`

Eggshell will be the primary portal canvas, Navy the dominant institutional color, and Black the primary text color. Secondary colors will be reserved for charts, statuses, and small accents, with Navy remaining predominant whenever blue is used.

### Typography and imagery

- Self-host the supplied Geist variable font for portal UI text.
- Use Geist Regular for body copy and Geist Semibold for titles, metrics, and navigation emphasis.
- Use the supplied navy and white Gradient logos rather than approximating the mark.
- Use official topographic artwork as a restrained background/detail, never at the expense of legibility.
- Keep the visual language spacious, quiet, and institutional; glass and gradients are accents rather than the default treatment for every surface.

## User Experience

### Public navigation

The glass pill beneath the home-page logo will contain three equal navigation items:

1. About
2. Contact
3. Investor Login

The pill will widen responsively to preserve the existing visual balance and remain usable at small widths. **Investor Login** opens the portal sign-in page.

### Sign-in screen

The sign-in page will pair a focused credential panel with branded topographic artwork. It will include:

- Gradient logo linked back to the public home page
- Email and password fields with persistent labels
- Show/hide password control
- Remember-me control as a visual preference only
- Forgot-password link with a believable informational state
- Primary **Sign in** action
- Support contact link
- Accessible inline validation and loading feedback

The form will require a syntactically valid email and a non-empty password. On submission, the mock adapter will discard the password immediately and return an authenticated demo result. The browser will retain only a non-sensitive demo-session flag in `sessionStorage`, then navigate to the dashboard. No credential value will be logged, persisted, or transmitted.

### Dashboard

The dashboard will present fictional sample data through a mature investor experience:

- Welcome header and account/profile control
- Summary cards for committed capital, invested capital, current value, and distributions
- Portfolio allocation visualization with accessible text equivalents
- Investments table with status, ownership, invested amount, and current value
- Recent capital activity timeline
- Documents area with quarter/type filters and realistic report rows
- Account/security panel showing contact preferences and an MFA-ready status card
- Mobile navigation and responsive table/card transformations

All displayed people, entities, figures, dates, and documents will be fictional. The source will identify demo data clearly, while the rendered interface remains polished and uncluttered.

### Local interactions

Tabs, filters, disclosure controls, profile menu, show-password control, forgot-password feedback, security settings, and sign-out will update locally. Document actions will show a non-destructive preview/download-ready state rather than fabricate a real file or contact a remote service. Sign-out clears the demo-session flag and returns to the sign-in screen.

## Authentication Boundary

The portal UI will call a dedicated auth client with a narrow contract:

```js
signIn({ email, password })
verifyChallenge({ challengeId, code })
getSession()
signOut()
```

The initial implementation will provide a mock adapter. UI code will respond to auth outcomes such as `authenticated`, `mfa_required`, and `error` without knowing how they were produced.

A future production integration will replace the adapter with server-backed authentication. If MFA is required, `signIn` can return `mfa_required` plus an opaque challenge ID; the existing flow can then reveal a verification-code step and call `verifyChallenge`. Vendor secrets and verification decisions must remain server-side. This keeps an Authy-compatible or other MFA provider replaceable without rebuilding the portal pages.

## File Organization

- `index.html`: add the Investor Login navigation item.
- `styles.css`: widen the home pill and normalize About/Contact H1 sizes.
- `portal-login.html`: sign-in document and accessible form structure.
- `portal.html`: authenticated dashboard document.
- `portal.css`: isolated portal design system and responsive layouts.
- `portal.js`: dashboard and local interaction behavior.
- `auth-client.js`: provider-neutral auth interface and mock adapter.
- `assets/brand/`: only the approved logo, font, and topographic assets required by the portal.
- `tests/`: lightweight source-contract tests using the available runtime without introducing a framework dependency.

Portal-specific selectors will be namespaced so the new styles do not unintentionally alter the public pages.

## Error and Empty States

- Invalid or missing form values receive field-level text and `aria-invalid` state.
- Mock sign-in exposes a short pending state to make submission feedback clear.
- Auth-client errors render in a polite status region without exposing technical details.
- Empty/filter-miss document results show a useful reset action.
- Unsupported document actions explain that the preview file is unavailable.
- Direct dashboard access without a demo session returns to the login page.
- Reduced-motion users receive state changes without decorative animation.

## Verification Strategy

### Automated source contracts

- Public navigation contains the Investor Login route.
- About and Contact use the same `2.5rem` heading token.
- Login fields are labeled and the form exposes an accessible status region.
- Auth UI depends on the auth-client contract rather than embedding vendor logic.
- Password values are neither written to web storage nor logged.
- Dashboard landmarks, tables, and interactive controls have accessible names.

### Browser verification

- Home, About, Contact, login, and dashboard routes all load without console errors.
- Sign-in validation, successful demo flow, guarded dashboard access, and sign-out work end-to-end.
- Dashboard tabs, filters, menus, and empty states respond correctly.
- Layout is visually checked at representative desktop and mobile widths.
- Keyboard focus remains visible and sensible throughout the primary flow.
- Brand assets render sharply, colors match the official palette, and text remains legible.

## Acceptance Criteria

1. The home-page glass navigation includes a balanced, responsive Investor Login item.
2. About and Contact H1 text both render at `2.5rem`.
3. The sign-in page and dashboard look production-quality and consistently Gradient-branded.
4. A visitor can complete the mock sign-in flow, explore the dashboard, and sign out.
5. No entered password or personal information is stored, logged, or transmitted.
6. The auth client cleanly represents a future MFA challenge without importing or depending on Authy today.
7. All sample portfolio content is fictional and isolated from future live-data integration.
8. The experience is responsive, keyboard-accessible, and free of browser-console errors in the tested flow.
