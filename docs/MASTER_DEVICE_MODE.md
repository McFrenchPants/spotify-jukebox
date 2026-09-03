# Master Device Mode (optional native Android build)

This is a how-to for self-hosters. For the rationale and history behind
this feature, see [docs/proposals/ARCHIVE.md](proposals/ARCHIVE.md) (item
8).

## 1. What this is and why

Spotify's Web API reports `supports_volume: false` for a phone acting as a
Spotify Connect receiver, which means guests can't adjust volume from the
web app when the bridge device is a phone (e.g. a phone paired to a
Bluetooth speaker with no Connect support of its own) — see [DESIGN_SPEC.md
§1](proposals/master-device-mode/DESIGN_SPEC.md#1-problem). Master Device
Mode works around this by building the same frontend as a native Android
app, which can set the phone's system volume directly instead of going
through Spotify's (unsupported) volume API.

This is an **optional additional build target**, not a replacement for the
standard web deployment. If your bridge device isn't a phone, or you don't
care about guest volume control, you don't need any of this — the regular
web app deployment is unaffected either way.

## 2. How to build the APK

From `frontend/`:

```bash
npm run build:android
```

This one command chains the web build, `cap sync android`, and the Gradle
`assembleDebug` task, auto-detecting a JDK 21 install if needed. If you
haven't set up the Android toolchain yet (JDK 21, Android SDK,
`local.properties`), see
[ANDROID_BUILD.md](ANDROID_BUILD.md) for
prerequisites — that doc also covers the exact error you'll hit if only
JDK 17 is installed.

On success, the APK lands at:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## 3. How to install it on the bridge phone

Either:

- **`adb install`** from your build machine:

  ```bash
  adb install frontend/android/app/build/outputs/apk/debug/app-debug.apk
  ```

- **Copy the APK onto the phone** (USB transfer, cloud drive, email to
  yourself, etc.) and open it directly from a file manager or whichever
  app you used to get it there.

Either way, the phone needs **"Install unknown apps"** permission enabled
for the app you're using to install/open the APK (file manager, browser,
or `adb`'s installer) — Android will prompt for this on first attempt if
it isn't already granted.

## 4. The "install from unknown sources" warning

Android will show its standard "install from unknown sources" warning when
installing this APK. **This is normal and expected** — this is a
self-signed, sideloaded app with no Google Play signing identity, so every
self-built APK triggers this warning regardless of how correctly it was
built. It is not a sign of a broken or tampered build.

Also worth knowing: only an Android build exists (iOS has no public API for
programmatic system volume control), and there's no Play Store
distribution — this is a build-it-yourself artifact, not a maintained
downloadable release.

## 5. Enabling Jukebox device mode

After installing, open the app on the bridge phone itself:

1. Log into the admin **Settings** tab using the same PIN as the web app.
2. Find the **"Jukebox device"** card and tap **"Set this as the Jukebox
   device."**

This registers the phone with the backend as the current volume-control
target. Registering a new device **supersedes** any previously-registered
one — only one Jukebox device is active at a time. The setting persists
across app restarts on that phone, so you shouldn't need to re-enable it
after every reboot.

## 6. Verifying it worked

- A guest's volume slider in the web app should now actually work, even
  though the phone's Spotify Connect device still reports no remote volume
  support — the app is routing the command to the phone directly instead
  of through Spotify's API.
- If the app on the bridge phone is closed, or the phone goes offline, all
  guest playback controls (not just volume) should show as disabled until
  it reconnects — see [DESIGN_SPEC.md
  §4.4](proposals/master-device-mode/DESIGN_SPEC.md#44-guest-experience)
  for the exact expected behavior.
