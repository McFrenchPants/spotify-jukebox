import { registerPlugin } from '@capacitor/core'

/**
 * Native bridge to Android screen pinning (lock task mode) for the phone
 * bridging audio to a Bluetooth speaker via Spotify Connect.
 *
 * Used only in Master Device Mode: pinning the app keeps that guest-facing
 * device from being accidentally navigated away from once it's set up.
 *
 * Backed by the native plugin registered as "AppPinning"
 * (frontend/android/app/src/main/java/com/mcfrench/guestjukebox/AppPinningPlugin.java).
 * On non-Android platforms (web, iOS) there is no native implementation
 * registered, so calls will reject/no-op.
 */
export interface AppPinningPlugin {
  /** Reads whether the app is currently pinned (Android lock task mode). */
  isPinned(): Promise<{ pinned: boolean }>

  /** Enables screen pinning (starts Android lock task mode) for this app. */
  enablePinning(): Promise<void>
}

export const AppPinning = registerPlugin<AppPinningPlugin>('AppPinning')
