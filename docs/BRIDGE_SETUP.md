# Bridge Phone Setup Runbook

The "bridge phone" is a dedicated phone whose only job is to run the Spotify
app permanently, connected over Bluetooth to the venue's speaker. Guest
Jukebox never talks to this phone directly — it talks to the **Spotify Web
API**, which finds the phone as a "Spotify Connect device" and sends
playback/queue commands to it. If the phone isn't logged in, isn't
reachable, or Spotify isn't actively routing audio to the speaker, the
backend has nothing to target and playback will silently fail.

This doc covers: initial setup, keeping it alive, recovering when something
goes wrong, and how to verify it's working from the admin side.

---

## 1. Spotify setup on the bridge phone

1. Install the official **Spotify** app from the Play Store (Android) or App
   Store (iOS) on the dedicated phone.
2. Log in with the household's **Spotify Premium** account.
   - **Premium is required.** Spotify Connect remote playback control and
     queueing (what this whole app depends on) does not work on a Free
     account — the Web API calls the backend makes will fail or be ignored.
   - Use the same Premium account every time. Do not log this phone in and
     out of different accounts — the backend authenticates once (via a
     one-time PKCE login flow, already completed) against whichever account
     was connected at setup time, and it needs to keep seeing this same
     account's devices.
3. Open the Spotify app and let it fully load the home screen at least
   once after logging in. It doesn't need to play anything yet.
4. Leave the Spotify app **open and in the foreground** (or at minimum
   running in the background — see the keep-alive section below) at all
   times. Spotify Connect devices only show up in the API's device list
   while the app is running and connected to the internet.

## 2. Bluetooth pairing

Two separate things need to be true — OS-level Bluetooth pairing, **and**
Spotify itself picking that Bluetooth speaker as its output. Doing only the
first is a common mistake: audio can be "paired" at the OS level but
Spotify is still playing out of the phone's own speaker.

1. **Pair at the OS level:**
   - Android: Settings → Connected devices → Pair new device → select the
     venue speaker.
   - iOS: Settings → Bluetooth → select the venue speaker under "My
     Devices" / "Other Devices".
2. **Route audio to it inside Spotify:**
   - With something playing (or paused) in Spotify, tap the "Connect to a
     device" icon (bottom-left of the Now Playing bar, looks like a
     speaker/monitor icon).
   - In the device picker, select the Bluetooth speaker. It should appear
     as an "Audio device" once it's Bluetooth-paired.
3. **Confirm:** play a track and confirm audio is actually coming out of
   the venue speaker, not the phone. The Now Playing bar / Connect picker
   should show the speaker's name as the active output.
4. Re-check this after any phone reboot or Bluetooth disconnect — Spotify
   does not always automatically resume routing to the speaker even if the
   OS reconnects the Bluetooth pairing (see Section 4).

## 3. Keep-alive settings

The phone is a permanent, always-on fixture — treat it like an appliance,
not a phone. Keep it **plugged into a charger continuously**; do not rely on
battery.

### Android

1. Settings → Battery → Battery optimization (or "App battery usage") →
   find Spotify → set to **"Don't optimize" / "Unrestricted"**. This stops
   Android from killing Spotify when the screen is off or the app is
   backgrounded.
2. Settings → Display → Screen timeout → set to the longest option, or
   **disable auto-lock entirely** if the phone is in a secure/hidden
   location. If you'd rather keep a lock timeout for physical security,
   at minimum keep it unlocked/awake while plugged in:
   Settings → Battery (or Developer options) → **"Stay awake while
   charging"** (in Developer Options: Settings → About phone → tap "Build
   number" 7 times to unlock Developer Options → enable "Stay awake").
3. Some Android OEMs (Samsung, Xiaomi/MIUI, OnePlus, Huawei) have their own
   aggressive background-app killers layered on top of stock Android.
   Check for and disable any of:
   - Samsung: Settings → Battery → Background usage limits → remove
     Spotify from "Sleeping apps" / "Deep sleeping apps", and add it to
     "Never sleeping apps" if available.
   - MIUI (Xiaomi): Settings → Apps → Manage apps → Spotify → Battery
     saver → **No restrictions**; also disable "MIUI optimization" if
     Spotify keeps getting killed.
   - Any "adaptive battery" / "app hibernation" feature: exclude Spotify.
4. Disable Wi-Fi/Bluetooth power-saving that disconnects when idle, if the
   phone's OEM exposes such a toggle.

### iOS

1. Settings → General → Background App Refresh → make sure it's **on**
   globally and **on for Spotify** specifically.
2. Settings → Display & Brightness → Auto-Lock → set to **Never** (this is
   safe since the phone is plugged in and in a fixed location).
3. Settings → Battery → Low Power Mode → keep this **off** — Low Power Mode
   throttles background activity and can affect background audio/network
   behavior.
4. Since the phone is permanently plugged in, iOS's battery-based
   throttling is largely moot, but leave Low Power Mode off regardless.

### General

- Plug the phone into power at all times — treat "unplugged" as a fault
  condition, not normal operation.
- If the phone has a case, make sure it doesn't block passive cooling —
  a phone under constant charge/screen-on load can throttle or shut down
  if it overheats.
- Turn off automatic OS updates that could reboot the phone unattended
  (or at least be aware they can happen and check the phone the next day
  if one lands overnight).

## 4. Auto-reconnect behavior and manual recovery

Understand what the backend can and can't do here:

- `resolveDevice()` (`backend/src/spotify/device.ts`) calls Spotify's
  `GET /v1/me/player/devices` on every check. If a previously-selected
  device ID reappears in that live list, it's automatically re-resolved as
  "the" device — no admin action needed.
- But if the bridge phone is offline, asleep, has Spotify killed, or has
  lost its Bluetooth/Spotify Connect routing, **it simply won't appear in
  that list at all.** There is no push mechanism — the backend cannot
  "wake" or "reconnect" the phone remotely. Recovery is a physical, manual
  step on the phone itself.

### Symptoms something's wrong

- Guests can queue tracks but nothing actually plays out of the speaker.
- `GET /api/device` returns `"resolved": null`, or `"devices": []`.
- The admin panel's device selector (Settings tab) shows "No devices are
  currently visible to Spotify."

### Common causes and fixes

| Cause | Fix |
|---|---|
| Phone rebooted (OS update, power blip) | Unlock phone, open Spotify app, wait for it to load |
| Bluetooth disconnected from speaker | Re-pair or reconnect Bluetooth in OS settings, then re-open Spotify |
| Spotify was killed by the OS in the background | Reopen the Spotify app manually |
| Spotify open but routed to phone speaker, not Bluetooth | Open Spotify → tap "Connect to a device" → re-select the venue speaker |
| Spotify session logged out / expired | Log back in with the household Premium account |
| Device visible again but not auto-picked (multiple devices now visible, e.g. phone speaker also showing) | Open the admin panel Settings tab and manually select the correct device via `POST /api/device/select` (the UI does this for you — just click it) |

After any recovery step, re-check `GET /api/device` or the admin panel
(Section 5) to confirm the phone reappeared and was resolved correctly.

## 5. Verifying it shows up in `GET /api/device`

Two ways to check, from easiest to most direct:

### A. Admin panel (recommended for non-technical admins)

1. Open the Guest Jukebox admin panel and log in.
2. Go to the **Settings** tab — the "Playback device" card
   (`frontend/src/components/admin/DeviceSelector.tsx`) loads
   `GET /api/device` automatically on open.
3. Read the card:
   - **"Currently playing on: `<phone/device name>`"** — success, the
     bridge phone is resolved and pinned as the playback target.
   - **"No device selected yet — choose one below."** with a list of
     device buttons — Spotify sees one or more devices but couldn't
     pick automatically (see below); tap the bridge phone's entry in the
     list to select it. A toast confirms "Playing on `<name>`" once
     selected.
   - **"No devices are currently visible to Spotify."** — nothing is
     visible at all; work through Section 4's recovery steps on the phone,
     then reopen/refresh this tab.
   - A red error banner — see the API error cases below (most likely
     Spotify isn't connected at all).

### B. Direct API check (for technical verification)

Hit the endpoint directly in a browser or with `curl`, from a device on the
same network as the backend:

```
GET http://<backend-host>:<port>/api/device
```

(Default port is `8085` in the Docker deployment, unless overridden by the `PORT` environment
variable — check how the backend was started if unsure.)

**Successful response — a device is resolved (HTTP 200):**

```json
{
  "resolved": {
    "id": "abc123...",
    "name": "Pixel 7",
    "type": "Smartphone",
    "is_active": true,
    "volume_percent": 70
  },
  "devices": [ /* full live list, including the resolved device */ ]
}
```

**Ambiguous — no device auto-selected (still HTTP 200):**

```json
{
  "resolved": null,
  "devices": [ /* zero, one-if-stale-selection-missing, or multiple devices */ ]
}
```

If `devices` is non-empty here, an admin needs to pick one via
`POST /api/device/select` with `{ "deviceId": "<id>" }` (this requires
admin auth — the admin panel button does this for you, no need to call the
API by hand).

**Failure — Spotify not connected at all (HTTP 503):**

```json
{
  "error": "spotify_not_connected",
  "message": "Spotify not connected yet — complete /api/auth/login first."
}
```

This means the backend itself has no Spotify auth on file (not a bridge
phone problem) — this should only happen on a fresh install before the
one-time PKCE consent flow has been completed; it's not expected in normal
operation once Spotify is connected.

**Failure — Spotify API call itself failed (HTTP 502):**

```json
{
  "error": "spotify_device_lookup_failed",
  "message": "<details from Spotify's error response>"
}
```

This typically means Spotify's API itself had a transient failure. Retry
after a few seconds; if it persists, check the backend logs for the
underlying Spotify error message.
