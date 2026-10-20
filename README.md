# app-web-group-member

Reference static web app for the **members of a Pryv group account**: a practitioner of a practice, a researcher of a team, a staff member of a bridge service. Each member signs in with their own Pryv account, joins the group, invites patients on the group's behalf and reads a patient's data under an access that names them.

There is **no backend**: the app is static files, built on [`pryv`](https://github.com/pryv/lib-js) and [`@pryv/cmc`](https://github.com/pryv/lib-js/tree/master/components/pryv-cmc). The group's Pryv core creates the per-member accesses on patients' accounts and removes them when a membership ends.

The pattern, its rules and its limits are described in the Pryv guide **Group accounts** (pryv.github.io, guides). This README covers the app.

> **Status: preview.** Group accounts need open-pryv.io 2.0.0-rc.53 or later, on the group's core and on the members' cores. The app depends on `@pryv/cmc` 3.21.0 or later. See [Demo](#demo).

## Walkthrough

1. **Sign in.** The member signs in to their **own** Pryv account through the platform's sign-in page (a standard Pryv auth request, in a pop-up). The app asks for the minimum a member app needs on that account:
   - `read` on `:_cmc:inbox`: the group's approval of a membership arrives there;
   - `contribute` on `:_cmc:apps:<appCode>`: where membership requests are written.
2. **Join a group.** The member names the group account (`username`, `host`) and the teams (team streams of the group, `:_cmc:apps:<app>:<team>`). The app writes a membership request on the member's account (`requestMembership`) and shows:
   - a **QR code** of a link to the group platform's account app, `<accountAppUrl>account/memberships?capabilityUrl=<request link>`: an administrator scans it, signs in to the group (or opens it in the group's session as a delegate) and approves, choosing the teams;
   - the same link as text, and the **bare request link** for the paste path (the administrator pastes it in the account app's "Group members" page).
   The link carries the request only: where the group files the membership is the administrator's decision. The app then waits for the approval (`waitForMembership`); a network or server error is shown and the wait goes on.
3. **Groups and patients.** The home page lists the member's groups (from the member's own account). A group's page lists, for each team the membership holds, the patients who accepted an invite (`listInvites` on the team stream, through the membership) and the invites still waiting.
4. **Invite a patient.** "Invite a patient" publishes an invite from the group's account, on the team stream, with `accessType: 'app'` (`createInvite`): the patient grants the group a **delegable** grant, so the group's core can create each member's access from it. The app shows the patient's link (the account app's `/cmc-accept` page, for a patient with an account on that platform), the bare invite link (a patient elsewhere pastes it in their own account app) and a QR code.
5. **Open a patient.** The app asks the group's core for a member access (`requestMemberAccess`). The group's core creates a short-lived access on the patient's account, named after the member, and returns it **once**. The app then reads the patient's recent data **directly from the patient's core** with it (read-only timeline). "In flight" and "patient core unreachable" answers are retried shortly; other refusals are shown as messages.
6. **Leave a group.** "Leave the group" (with an in-app confirmation) revokes the member's half of the relationship (`leaveMembership`); the group's core then removes every access it created for this member on patients' accounts.

## Trust model

- **Pryv attributes to the credential, not to the human.** A patient's audit log records the member access that read the data; that access names the member whose membership asked for it. It does not prove who sat at the keyboard. One Pryv account per person, never shared, is the group's responsibility.
- **The member access is a one-time token.** The group's core returns it in its answer only, never stores it, never logs it. This app keeps it in the memory of the patient's page: never in storage, never in the address, never in a log line, never on screen. It expires (`memberAccessTtl`, 1 hour by default here, bounded by the group's core) and is asked for again when needed.
- **What the browser keeps.** The member's own access, in `sessionStorage` (this tab only, gone when it closes). In `localStorage`, only the group (username and host) each waiting request was written for, so a pending request can show its group's name; no link and no token. The membership's endpoint is read again from the member's inbox on each visit and kept in memory.
- **The request and invite links are capabilities.** Whoever holds one can answer it. Hand a membership request to the group's administrators only, an invite to its patient only. Both work once and expire.
- **What members of a team see of each other:** the team's invites (links included) and who opened which patient and when (never a token). Groups that need more isolation give each member a sub-stream of their own team.
- **No secret in the app.** The deployment's settings are public; the app holds no credential of its own and calls no server other than Pryv cores.

## Configuration

The app reads `settings.json`, served next to `index.html` (the shipped file is `{}`). Each key falls back to a build-time variable (see `.env.example`) when the file does not set it.

```json
{
  "serviceInfoUrl": "https://reg.example.com/service/info",
  "accountAppUrl": "https://account.example.com/",
  "appCode": "practice",
  "appName": "Practice",
  "group": { "username": "practice", "host": "example.com" },
  "teams": [{ "streamId": ":_cmc:apps:practice:team-a", "name": "Team A" }],
  "invite": {
    "displayName": "The practice",
    "permissions": [{ "streamId": "diary", "level": "read" }],
    "consent": { "en": "Your care team reads your diary, each member under their own name." }
  },
  "memberAccessTtl": 3600
}
```

| Key | Env fallback | Default | Meaning |
|---|---|---|---|
| `serviceInfoUrl` | `VITE_SERVICE_INFO_URL` | none (required, unless the address names the platform) | The members' Pryv platform (`service/info`). The address's `pryvServiceInfoUrl` parameter wins over it (see below). |
| `accountAppUrl` | `VITE_ACCOUNT_APP_URL` | derived | Base URL of the group platform's account app ([app-web-user-account](https://github.com/pryv/app-web-user-account)), like `authUrl` for `@pryv/cmc`'s accept hand-off. Query parameters of the base (for example `pryvServiceInfoUrl`) are kept. Unset: when the group is on the member's platform (the member's API host is the group's host or under it), the account app next to the page the member signed in on, with `pryvServiceInfoUrl` set to the member's platform; for a group elsewhere, no link is derived and only the bare request link is shown. |
| `appCode` | `VITE_APP_CODE` | `group-member` | CMC app code: the app's scope is `:_cmc:apps:<appCode>` on the member's account, and the default patient-side scope in the patient's link. |
| `appName` | `VITE_APP_NAME` | `Group member` | Shown in the header and on the sign-in page. |
| `requestingAppId` | | `app-web-group-member` | `requestingAppId` of the sign-in request. |
| `group` | | none | Pre-fills the group in the join form. |
| `teams` | | none | Team streams offered as checkboxes in the join form. Without it the member types team stream ids. |
| `invite.displayName` | | `appName` | How the group is named to the patient. |
| `invite.permissions` | | `diary` at `read` | What a patient invite asks for (stream permissions, `read` or `contribute`, no `:_cmc:` stream). |
| `invite.consent` | | none | The invite's consent text, per language. Say who the group is and that its members read under their own names. |
| `memberAccessTtl` | | `3600` | Lifetime, in seconds, asked for each member access (the group's core bounds it: 60 s to 7 days by default). |

**Platform in the address.** The page address can name the members' platform with the `pryvServiceInfoUrl` query parameter (the same parameter as app-web-user-account), before the `#`:

```
https://pryv.github.io/app-web-group-member/?pryvServiceInfoUrl=https%3A%2F%2Fsandbox.pryv.me%2Freg%2Fservice%2Finfo
```

When it is an absolute http(s) URL it wins over `serviceInfoUrl` (and its env fallback); any other value is ignored and `serviceInfoUrl` applies. With neither, the app says it is not configured. It is read once when the page loads and stays in the address across the app's pages (they are hash routes). The value is used only to fetch the platform's service info, from which the sign-in request goes out; nothing else is read from the address. A link naming a platform makes the member sign in there, on that platform's own sign-in page, so share links naming the platforms you trust.

Invalid values are dropped, never guessed. The app uses hash routes (`#/groups/...`), so it can be served from any path of any static host; no address carries a credential.

**Rebranding:** colour tokens at the top of `src/index.css`, the logo in `src/brand.tsx`, the name in `appName`. Texts are in `src/locales/en.json` (add a language by adding a catalog with the same keys and listing it in `src/i18n.ts`).

## Development

Requires Node.js 20 or later.

```sh
npm ci              # install the locked dependencies
npm run dev         # Vite dev server
npm test            # unit and page tests (Vitest, jsdom)
npm run e2e         # end-to-end tests (Playwright, Chromium), hermetic
npm run lint        # oxlint
npm run typecheck   # tsc -b
npm run build       # type-check, then build into dist/
```

Put development settings in `public/settings.json` (or `.env.local`). The sign-in page of the platform must accept the dev server's origin; serve it over HTTPS (for example with [backloop.dev](https://backloop.dev)) when the platform requires it.

**Tests.** The unit and page tests run the real `@pryv/cmc` functions against a scripted stand-in for `pryv.Connection` (`src/test/fakePryv.ts`, `src/test/platform.ts`). The end-to-end tests run the app (Vite dev server) in Chromium against a mocked platform (`e2e/mockPlatform.ts`): every Pryv endpoint is answered by the test and anything else is refused, so the suite needs no network and no core. Together they check that no token reaches the page, the address or the storage, and every test of both suites fails if a token or a request link appears in any console output (every console method in the page tests, every page's console messages in the end-to-end tests).

## Release

Releases are cut from `main`, with every check green (`npm run lint`, `npm test`, `npm run e2e`, `npm run build`, `npm audit`).

1. Set the version: `npm version <x.y.z> --no-git-tag-version` (updates `package.json` and `package-lock.json`; skip it when `package.json` already holds the version), rename `## Unreleased` in `CHANGELOG.md` to `## <x.y.z> - <yyyy-mm-dd>`, commit as `release: <x.y.z> (<summary>)`.
2. Tag and push: `git tag -a v<x.y.z> -m v<x.y.z>`, then `git push origin main v<x.y.z>`.
3. Build from the lockfile: `npm ci && npm run build`. The build uses relative paths and hash routes, so the same `dist/` is served from any path of any static host.
4. GitHub release, with the bundle attached:

   ```sh
   COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf app-web-group-member-<x.y.z>.tar.gz -C dist .   # macOS; on Linux: tar -czf ...
   gh release create v<x.y.z> app-web-group-member-<x.y.z>.tar.gz --title v<x.y.z> --notes-file <the version's CHANGELOG section>
   ```

5. GitHub Pages copy (branch `gh-pages`, served at <https://pryv.github.io/app-web-group-member/>): `dist/` plus `.nojekyll` becomes the branch's next commit, without checking the branch out:

   ```sh
   git fetch origin
   touch dist/.nojekyll
   export GIT_INDEX_FILE="$(mktemp -d)/index"
   (cd dist && git --git-dir=../.git --work-tree=. add -A)
   parent=$(git rev-parse -q --verify origin/gh-pages)
   commit=$(git commit-tree "$(git write-tree)" ${parent:+-p "$parent"} -m "publish app-web-group-member $(git rev-parse --short HEAD): v<x.y.z> (GitHub Pages copy)")
   unset GIT_INDEX_FILE
   git push origin "$commit:refs/heads/gh-pages"
   ```

   The Pages copy ships the default `settings.json` (`{}`): it names no platform and says so on its first page, unless the address names one (`?pryvServiceInfoUrl=`, see [Configuration](#configuration)). A deployment serves its own `settings.json` next to `index.html` (see [Configuration](#configuration)).

## Demo

A live demo needs a platform running open-pryv.io 2.0.0-rc.53 or later, with a group account (team streams created), its administrator using app-web-user-account's "Group members" page, a member account and a patient account. No public demo is published yet.

## License

[BSD-3-Clause](LICENSE)
