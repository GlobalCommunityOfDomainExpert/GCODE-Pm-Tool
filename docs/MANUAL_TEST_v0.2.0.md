# Manual Test Plan - v0.2.0 (unpushed work)

Covers everything after `v0.1.3`: 3 unpushed commits (RBAC phases 0-2) + all uncommitted work
(phases 3-7: per-node UI perms, multi-org accounts, HTTPS + credential encryption, limits / confirm modals / live refresh).

## Setup
1. `npx prisma migrate deploy` (applies `add_auth_nonce` and the phase 0 migration). **Expect:** no errors; tables `RoleAssignment`, `Account`, `AuthNonce` exist.
2. `npx prisma db seed` / `prisma/seed-rbac.ts` if the DB is fresh.
3. `.env`: set `SMTP_SERVER=` (empty, no real mail). Optional `AUTH_RSA_PRIVATE_KEY` (dev auto-generates one).
4. `npm run dev` (port 3000, or 3100 for the scripts).
5. Prepare users: **Admin**, **Portfolio Manager** (scoped to Workspace A), **Program Manager**, **Team Member**, plus one email that belongs to two orgs.

Automated cross-check (optional): `npx tsx scripts/test-phase1.ts`, `test-phase2-api.ts`, `test-phase3-perms.ts`, `test-phase5-api.ts`, `test-phase6.ts`, `test-encryption-api.ts`.

---

## A. Data model / migrations (phase 0)
| # | Step | Expected |
|---|------|----------|
| A1 | Run migrations on a copy of an existing DB | Existing users/orgs untouched; each old user gets matching `RoleAssignment` rows |
| A2 | Log in as an existing pre-migration user | Login works, same role/scope as before |
| A3 | `npx tsx scripts/audit-phase0.ts` | Reports no mismatch between legacy roles/scope and RoleAssignment |

## B. Per-node permissions (phase 1 + 3)
| # | Step | Expected |
|---|------|----------|
| B1 | Admin opens Workspaces > any level | All create / edit / delete controls visible |
| B2 | Team Member opens same pages | No create/delete buttons on nodes they can't change; only allowed task actions |
| B3 | Portfolio Manager scoped to Workspace A: open A and B | A shows manage controls; B is hidden or read-only |
| B4 | Give a user *Program Manager on WS A* + *Team Member on WS B* | Manager controls only under A; member-only controls under B (union of rows covering the node) |
| B5 | As Team Member, call a write API directly (e.g. `PATCH /api/projects/<id>`) | 403; matches what the UI hid (UI and server agree on every node) |
| B6 | Create task/project in a node you may not write to (API) | 403, nothing created |
| B7 | `npx tsx scripts/test-phase3-perms.ts` | 0 FAIL: UI perms == server `canOnNode` for all nodes/users |

## C. Roles & team management (phase 2)
| # | Step | Expected |
|---|------|----------|
| C1 | Team > Invite user, add 2 role rows (different scopes) | Invite sent; user shows both assignments |
| C2 | Try to give Admin a scoped assignment | Form does not offer it; API returns 400 |
| C3 | Edit user: change/remove one role row | Saved; toast "success"; permissions change on next load |
| C4 | Edit user's roles while they are signed in | Their session is revoked; next request sends them to login |
| C5 | Role Definitions tab | Custom-role creation UI is gone; built-in roles only |
| C6 | `POST /api/team/custom-roles` | Rejected (feature removed) |
| C7 | Invite codes tab: create code with scope | Code created; join with it gives that role/scope |
| C8 | Revoke invite code | Confirm modal (not browser `confirm()`); code stops working |
| C9 | Deactivate / remove teammate | Confirm modal; teammate cannot log in after |
| C10 | Trigger any success and error action | Toast appears bottom area, auto-dismisses, errors are distinguishable |
| C11 | Open deep hierarchy page | Breadcrumbs correct; each crumb navigates to its level |

## D. Multi-organization accounts (phase 5)
| # | Step | Expected |
|---|------|----------|
| D1 | Log in with a single-org email | Goes straight to `/workspaces` |
| D2 | Log in with email in 2 orgs, same password, first time | Lands on `/select-org` listing both |
| D3 | Pick an org | Opens `/workspaces` for that org only; data from other org not visible |
| D4 | Log out and log in again | Opens the last-used org directly (remembered cookie), no picker |
| D5 | User menu (2+ orgs) | Lists orgs; current one marked |
| D6 | Switch org from user menu | Toast + page reloads in the other org; roles/scopes are the other org's |
| D7 | Org where membership is invited/suspended | Shown in the list but disabled |
| D8 | `POST /api/auth/switch-org` with a userId from another account | 404 "Not found." |
| D9 | `GET /api/auth/memberships` signed out | 401 |
| D10 | Open `/select-org` with only 1 membership | Redirects to `/workspaces` |
| D11 | Open `/select-org` signed out | Redirects to `/login` |
| D12 | Same email, **different** password in a second org | Not merged: logs into the org whose password matches only |
| D13 | Reset password for a multi-org email | Password changes for all memberships; all other sessions signed out |
| D14 | Wrong password / unknown email / suspended / invited user | `not-found` message / suspended message / pending message respectively |

## E. Credential encryption + HTTPS (phase 6 / EN_009)
| # | Step | Expected |
|---|------|----------|
| E1 | Browser dev tools > Network, log in | Request body to `/api/auth/login` is opaque base64 envelope; password not visible |
| E2 | Same for register-org, verify-otp, invite complete, join-with-code, forgot-password | All bodies encrypted |
| E3 | Replay a captured login request | Rejected (nonce already used) |
| E4 | Replay after >60s, or to a different endpoint | Rejected (stale / wrong path) |
| E5 | Tamper one byte of the ciphertext | Rejected, 400 |
| E6 | `GET /api/auth/public-key` | Returns `kid`, `publicKey`, `serverTime` |
| E7 | Send a plain JSON login with `AUTH_REQUIRE_ENCRYPTED=false` | Still works (rollout mode) |
| E8 | Same with `AUTH_REQUIRE_ENCRYPTED=true` | Rejected |
| E9 | Browser clock skewed by minutes, then log in | Still works (client uses server time offset) |
| E10 | Response headers of any page | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` present |
| E11 | Response headers of `/api/auth/*` | `Cache-Control: no-store` |
| E12 | Production build, plain `http://` GET to non-localhost host | 308 redirect to `https://` with path/query kept |
| E13 | Production build, plain `http://` POST/PUT/PATCH/DELETE | 400 `HTTPS is required.` (never redirected) |
| E14 | `next start` on `localhost` over http | Allowed |
| E15 | `AuthNonce` table after some logins | Old rows swept (~2 min) |

## F. Limits, confirm modals, live refresh (phase 7)
| # | Step | Expected |
|---|------|----------|
| F1 | Create item with name > 60 chars | Input stops at 60, counter shown; API with 61 chars returns 400 "Name can be at most 60 characters." |
| F2 | Task title > 60 | Same, "Title can be at most 60 characters." |
| F3 | Description > 255 | UI limited; API 400 |
| F4 | 60 emoji name | Accepted (counts characters, not UTF-16 units) |
| F5 | PATCH touching only `name` on an item that already has a long legacy description | Not rejected for the description |
| F6 | Very long names in cards, tree table, kanban, list, breadcrumbs, sidebar | Truncated / wrapped, no layout break |
| F7 | Delete hierarchy item | Delete confirm modal names the item |
| F8 | Deactivate/remove user, revoke invite code | `ConfirmActionModal`: Cancel closes, Confirm shows busy label then closes |
| F9 | Change data in tab 1 (API or 2nd browser), return to tab 2 | Tab 2 refreshes on focus without manual reload |
| F10 | Leave tab visible 30s | Data refreshes by itself |
| F11 | Open a modal / drag a kanban card while a refresh is due | No refresh during it; your edits are not overwritten |
| F12 | Hidden tab | No polling until visible again |

## G. Regression sweep
| # | Step | Expected |
|---|------|----------|
| G1 | Register new org (OTP flow) | Org + Admin created, lands in app |
| G2 | Invite by email, accept link, set password | Joins with invited role/scope |
| G3 | Join with invite code | Joins; wrong/expired code gives clear error |
| G4 | Forgot password flow | Same neutral message for existing and unknown email |
| G5 | Create / edit / delete workspace > initiative > program > project > task | All work for Admin |
| G6 | Task detail panel, kanban drag, list view, assignee combobox | Work as before |
| G7 | `npm run build` | Passes with no type errors |

## Sign-off
Version tag target: **v0.2.0** (after all rows pass).
