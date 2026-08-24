# LAN Access & QR Code Runbook

Guests need one URL that works from their phone's browser on the home wifi.
This doc covers how to find that URL, how the admin panel's QR code stays in
sync with it automatically, and an optional advanced networking mode.

---

## 1. The static LAN IP:port URL (always works — do this first)

This is the reliable, always-available method. It doesn't depend on mDNS,
Bonjour, or any host-level feature — just the host's own LAN IP address.

1. **Find the host's LAN IP.** On the machine running the `guest-jukebox`
   container:
   - Linux: `hostname -I` or `ip addr show` (look for the address on your
     LAN interface, typically `192.168.x.x` or `10.x.x.x`).
   - Home Assistant OS: Settings → System → Network shows the IP directly.
   - macOS: System Settings → Network, or `ipconfig getifaddr en0`.
   - Windows: `ipconfig` and look under your active adapter.
2. **Find the published port.** By default this is `3001`, from
   `docker-compose.yml`'s `ports: ["${PORT:-3001}:3001"]`, unless a `PORT`
   environment variable overrides it. Check `backend/.env` or however the
   container was started if unsure.
3. **Combine them:** `http://<lan-ip>:<port>` — e.g. `http://192.168.1.42:3001`.

This URL works from any device on the same LAN/wifi, with no extra
configuration. Bookmark it, or just remember it — you'll use it in Section 3
below.

## 2. Opportunistic `.local` hostname (host-dependent, not guaranteed)

Some home server hosts already answer to a `<hostname>.local` address on the
LAN, via **their own system-level mDNS/Bonjour**, entirely independent of
Guest Jukebox:

- **Home Assistant OS** boxes commonly already advertise themselves this
  way out of the box (check Settings → System → Network for the hostname,
  often `homeassistant.local`).
- Any Linux host with `avahi-daemon` installed and running.
- Mac hosts, via built-in Bonjour.

If the host already does this, the container's published port is also
reachable through it, for free — Guest Jukebox doesn't need to do anything
special, because it's just the *host's* network stack answering, and the
container's port is published on the host like any other port.

**To check if this applies to your host**, try, from another device on the
same LAN:

```
http://<host-hostname>.local:<port>
```

(e.g. `http://homeassistant.local:3001`). If the app loads, it works — use
this friendlier URL if you like. If it times out or fails to resolve, your
host doesn't have working local mDNS, and that's fine — fall back to the
static IP:port URL from Section 1. This is opportunistic and host-dependent;
**Guest Jukebox does not implement, bundle, or guarantee mDNS/avahi itself**
(see Section 4 for why).

## 3. Getting the QR code to match — no configuration needed

The admin panel's "Guest link" card (Settings tab,
`frontend/src/components/admin/GuestUrlCard.tsx`) generates its QR code and
plain-text URL from `window.location.origin` — i.e. whatever URL is
currently in the admin's own browser address bar when the admin panel page
is loaded.

There is no separate "guest URL" setting to configure. Instead:

1. Decide which URL you want guests to use — the static IP:port from
   Section 1, or the `.local` hostname from Section 2 if it works for your
   host.
2. Load the admin panel in your own browser using **that same URL**
   (e.g. `http://192.168.1.42:3001/admin`, or
   `http://homeassistant.local:3001/admin`).
3. Open the Settings tab. The Guest Link card's QR code and printed URL will
   automatically match whatever URL is in your address bar — no code change,
   no settings screen, no restart needed.

If you ever want to switch which URL guests use (e.g. you set up `.local`
access later), just reload the admin panel via the new URL and the QR code
updates itself on the next render.

**Caveat:** in local dev (`npm run dev`, Vite on `localhost:5173`), the QR
code will encode `http://localhost:5173`, which only works on the machine
running dev mode — not guest-reachable. This is expected in dev and not a
bug; it only matters for the production container deployment described
above.

## 4. Advanced (optional, Linux-only): `network_mode: host`

By default, `docker-compose.yml` uses Docker's bridge networking with the
port published via `ports:`. This is the recommended default — it works
identically across Linux, macOS, and Windows Docker hosts, and combined with
Section 2's opportunistic host-level mDNS, it covers the common cases with
zero added complexity.

**Why we did not build in-container mDNS/avahi:** having the *container
itself* advertise its own `jukebox.local`-style name independent of the
host would require both `network_mode: host` (Linux-only — mDNS multicast
does not traverse Docker's default bridge network, and host networking
doesn't work the same way on Docker Desktop for Mac/Windows) and bundling
an `avahi-daemon` process inside the image. That's a real added dependency
and moving part for a LAN party jukebox app, when Section 1's static IP
already always works and Section 2's host-level mDNS already covers the
common "friendly hostname" case for free. We judged this not worth the
added complexity/fragility as the default.

If you're on a Linux host and specifically want the container to participate
directly in the host's network namespace (for reasons beyond mDNS, or
because your host's own mDNS setup doesn't cover the container for some
other reason), you can opt in by editing `docker-compose.yml`:

```yaml
services:
  jukebox:
    # ...
    network_mode: host
    # NOTE: when network_mode is "host", the `ports:` section below is
    # ignored entirely — the container shares the host's network stack
    # directly and listens on port 3001 (or $PORT) on every host interface
    # without any Docker-level port mapping. Remove or comment out `ports:`
    # to avoid confusion.
    # ports:
    #   - "${PORT:-3001}:3001"
```

This is an advanced, opt-in configuration change, not the default — treat it
as a distinct deployment choice, not just "adding a line." It's Linux-only;
`network_mode: host` is not supported the same way on Docker Desktop for
Mac/Windows.

---

## Summary

| Method | Reliability | Setup effort | Notes |
|---|---|---|---|
| Static `http://<lan-ip>:<port>` | Always works | None (just look up the IP) | Recommended primary method |
| `http://<host>.local:<port>` | Host-dependent | None (if host already has mDNS) | Opportunistic, not guaranteed |
| `network_mode: host` + host's own avahi | Linux-only, host-dependent | Manual compose edit | Advanced/optional, not the default |

Whichever URL you pick, load the admin panel via that URL — the Guest Link
QR code on the Settings tab will always match it automatically.
