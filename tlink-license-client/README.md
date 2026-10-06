# Tlink License — activating & managing

**How to sign in, activate a license, and keep your installation licensed.**

Tlink runs a free 30-day local trial on first launch. After that you either sign in to a paid plan (Individual or Team) or activate with an offline code supplied by your admin. Everything is managed from the pill in the bottom-right of the window.

## Quickstart (first launch)

1. **Install and open Tlink.** A **"Sign in to activate"** modal opens automatically. The bottom-right pill shows **Trial: 30d**.
2. **Try before you buy.** Click the modal's **×** button (or press Escape) — you have a full 30-day local trial. The pill keeps counting down.
3. **When you're ready to pay**, click the green **Upgrade** pill next to the trial countdown. The pricing page opens in your browser; after paying you'll receive a sign-in email.
4. **Sign in.** Click the trial pill → **"Sign in to activate"** → enter the email + password you set during purchase → **Sign in**.
5. **Done.** Pill now shows **Individual** (solo plan) or **Team** (seat-based plan). You're licensed on this device.

## The bottom-right pill — one place for every state

| What you see | What it means | Click to |
|---|---|---|
| **Trial: Nd** (orange) | Local 30-day trial, N days remaining. App is fully functional. | Open account menu (Sign in, License settings). |
| **Upgrade** (green) | Shown next to the trial pill. Pricing / checkout page. | Open the pricing page in your browser. |
| **Sign in** (blue) | You haven't signed in yet (or you signed out). Not on trial. | Open the Sign-in modal. |
| **Individual** (blue) | Signed in on a paid solo plan. | Open account menu. |
| **Team** (purple) | Signed in on a team plan — seat allocated by your admin. | Open account menu. |
| **Trial** (orange, no number) | Server-side trial (purchased trial, not local). | Open account menu. |
| **Reactivate** (red) | License expired, invalid, or seat revoked. **App drops into read-only mode** — existing tabs keep working, new SSH / RDP / collector / gNMI sessions are blocked. | Open the activation modal to fix. |

Hover any pill for a tooltip explaining the exact state (e.g. *"Trial: 5 days remaining — subscribe to keep access"*).

## Online activation (standard)

1. Click the **Sign in** or **Reactivate** pill.
2. Type your account email + password.
3. Click **Sign in**.
4. On success the modal closes and the pill flips to your plan name.

Tokens are stored in your OS keychain (macOS Keychain · Windows Credential Manager · Linux libsecret) so you stay signed in across restarts. Tlink refreshes the session automatically in the background every hour.

## Offline activation (air-gapped / restricted networks)

Used when the device can't reach the license server (secure labs, segmented networks, customer sites behind strict firewalls).

1. Click the **Sign in** pill to open the modal.
2. Click **"Have an activation code?"** at the bottom of the modal.
3. The modal flips to offline mode and shows your **device fingerprint** — a short hash that uniquely identifies this install. Click **Copy** and send it to your admin.
4. Your admin mints an **offline activation code** bound to that fingerprint and sends it back. The code is a long string starting with `eyJ…`.
5. Paste the code into the **Activation code** textarea → click **Activate**.
6. The pill flips to your plan name — this device is licensed with no further network contact needed until the code's expiry date.

Offline codes carry their own expiry (set by your admin at mint time). You'll get a Reactivate pill when the code expires; repeat the process with a fresh code.

## Managing your license

**Settings → License** (open from the gear icon in the sidebar, then click **License** in the left column):

- **Account** — your signed-in email, plan, device fingerprint.
- **Refresh from server** — force a heartbeat if the status pill shows stale state. Useful after your admin changes your plan or adds you to a team.
- **Session details** — last server contact, heartbeat count, round-trip time, offline grace status.
- **Server URL** — override if your organization runs a self-hosted license server (Team plan).
- **Sign out of this device** — frees the seat on the server. You'll land back in the "Sign in" state (not the trial — one trial per device).

The **license dropdown** in the bottom-right pill is a lighter version of the same page: signed-in email, Sign out, License settings, Switch account.

## What happens when things go wrong

Tlink prefers to keep working rather than block you. The failure modes:

- **Trial expired, you haven't paid yet** → **Reactivate** pill, read-only mode. Existing tabs stay viewable, new sessions blocked. Click the pill to sign in or activate.
- **Paid license expired (billing failed, card declined)** → same **Reactivate** pill, same read-only mode. Fix billing in your account, click **Refresh from server** in Settings → License, and you're back.
- **Seat revoked by admin** → **Reactivate** pill with tooltip *"Your seat was revoked by your admin — contact them"*. Read-only mode.
- **Device limit reached** (you've installed on more devices than your plan allows) → **Reactivate** pill with tooltip *"Device limit reached — sign out of another device or upgrade your plan"*. Sign out of an older device from this one via Settings → License → **Sign out of this device**, or do it from your account web page.
- **License server unreachable** → **"Offline"** banner briefly. Tlink grants a **48-hour offline grace** so a flaky VPN or an airport Wi-Fi dropout doesn't lock you out. After 48h without server contact the Reactivate pill appears.

In all failure modes the activation dialog is **non-blocking** — you can close it, keep looking at existing tabs, and open it again whenever you're ready. The **"Clear local session and start over"** link in the modal is the nuclear option: wipes the keychain token and local trial state, drops you back to the first-launch flow.

## Team plans — admin notes

- Your admin invites you by email from the Team dashboard. You'll get a sign-in email; sign in as usual.
- The admin can also mint **offline codes** for team members on restricted networks — same offline flow as above.
- The **Admin panel** inside Tlink (visible only to admins) shows seat usage, pending invites, and lets you remove devices. Open it via Settings → License → **Open admin panel** (admins only).
- Team plans ship with a **self-hostable license server** — point `Settings → License → Server URL` at your deployment.

## FAQ

**I don't want to sign up for an account to try Tlink.** You don't have to — the 30-day local trial starts automatically on first launch. The sign-in modal is skippable with Escape.

**Do I need to be online for Tlink to work?** Only to activate. After sign-in Tlink heartbeats every hour but tolerates up to 48 hours offline before asking you to reconnect. Offline-activated installs don't heartbeat at all until their code expires.

**Can I use one license on multiple devices?** Individual plan: 2 devices concurrent. Team plan: configured per-seat by your admin (typically 1-3 devices per seat).

**I signed out and now I'm stuck in "Sign in" state — can I get my trial back?** The 30-day trial is per-device. Once consumed you need a paid plan or an admin-minted offline code. **Clear local session and start over** in the activation modal wipes device state but does not reset the trial clock.

**My card failed and the app went into read-only mode — did I lose my work?** No. All open tabs stay viewable. SSH / RDP sessions you had open keep running. You just can't open NEW profile sessions until you reactivate. Fix billing, click **Refresh from server** in Settings → License, and the pill flips back to your plan name.

**I just upgraded from Individual to Team / my admin just added me to a team — my pill still says the old plan.** Settings → License → **Refresh from server**. Takes 1-2 seconds. If still wrong after a minute, Sign out and Sign back in.

## Source

- Service: [`src/lib/tlink-license.service.ts`](./src/lib/tlink-license.service.ts)
- Activation dialog: [`src/lib/components/activation-dialog/activation-dialog.component.ts`](./src/lib/components/activation-dialog/activation-dialog.component.ts)
- Config: [`src/lib/tlink-license.config.ts`](./src/lib/tlink-license.config.ts)
- Dock pill template: [`../tlink-core/src/components/appRoot.component.pug`](../tlink-core/src/components/appRoot.component.pug) (search for `license-dock-`)

## Developers / library integrators

Embedding `@tlink/license-client` in another Angular app? See [`INTEGRATION.md`](./INTEGRATION.md) for the module setup, service API, provider configuration, and server-side contract.
