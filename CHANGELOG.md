# Changelog

## Unreleased

### Added

- First version of the reference member app for Pryv group accounts, a static web app with no backend (React, Vite, TypeScript, Tailwind):
  - sign-in to the member's own account with a standard Pryv auth request (`read` on `:_cmc:inbox`, `contribute` on `:_cmc:apps:<appCode>`), kept in `sessionStorage` for the tab;
  - join a group: membership request (`requestMembership`), hand-off by QR code to the group platform's account app (`account/memberships?capabilityUrl=...`), the same link as text and the bare request link for pasting; an account app that is not configured is derived from the sign-in page only for a group on the member's platform; waiting for the approval (`waitForMembership`), going on after a transient error;
  - the member's groups and, per team, the patients and waiting invites (`listInvites` through the membership);
  - patient invites as delegable grants (`createInvite` with `accessType: 'app'` on the team stream), with the patient's link, the bare link and a QR code;
  - opening a patient: member access from the group's core (`requestMemberAccess`), kept in memory only, then a read-only timeline from the patient's core; short retries on "in flight" and "patient core unreachable";
  - leaving a group (`leaveMembership`) after an in-app confirmation;
  - readable messages for the client API's error ids; tokens masked in any displayed content and never logged;
  - configuration through `settings.json` with build-time fallbacks; English catalog; themeable colour tokens;
  - unit and page tests (Vitest) and hermetic end-to-end tests (Playwright).
- Requires `@pryv/cmc` 3.21.0 or later (from npm, locked in `package-lock.json`) and open-pryv.io 2.0.0-rc.53 or later.
