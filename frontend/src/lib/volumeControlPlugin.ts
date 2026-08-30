import { registerPlugin } from '@capacitor/core'

/**
 * Native bridge to the phone's own Android system (music stream) volume.
 *
 * Used only in Master Device Mode: the phone bridging audio to a Bluetooth
 * speaker via Spotify Connect can't have its volume controlled remotely
 * through Spotify's API (supports_volume: false for phone Connect
 * receivers), so this plugin sets the phone's system volume directly.
 * `getVolume` is the counterpart used to read that volume back so it can be
 * reported to the backend — seeding guest volume sliders accurately and
 * keeping them in sync when the phone's volume changes out-of-band (hardware
 * buttons, Android's own volume UI).
 *
 * Backed by the native plugin registered as "VolumeControl"
 * (frontend/android/app/src/main/java/com/mcfrench/guestjukebox/VolumeControlPlugin.java).
 * On non-Android platforms (web, iOS) there is no native implementation
 * registered, so calls will reject/no-op.
 */
export interface VolumeControlPlugin {
  /**
   * Sets the phone's system music-stream volume.
   *
   * @param options.percent - Target volume as an integer 0-100.
   */
  setVolume(options: { percent: number }): Promise<void>

  /** Reads the phone's current system music-stream volume. */
  getVolume(): Promise<{ percent: number }>
}

export const VolumeControl = registerPlugin<VolumeControlPlugin>('VolumeControl')
