package com.mcfrench.guestjukebox;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Capacitor plugin for Master Device Mode: lets the web app set this
 * phone's own Android system (music stream) volume directly, since Spotify
 * Connect can't remotely control volume on a phone acting as a Connect
 * receiver (supports_volume: false).
 */
@CapacitorPlugin(name = "VolumeControl")
public class VolumeControlPlugin extends Plugin {

    @PluginMethod
    public void setVolume(PluginCall call) {
        if (!call.getData().has("percent")) {
            call.reject("Missing required parameter: percent");
            return;
        }

        int percent = call.getInt("percent", -1);
        if (percent < 0 || percent > 100) {
            call.reject("Invalid parameter: percent must be an integer between 0 and 100");
            return;
        }

        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager unavailable");
            return;
        }

        int maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int index = Math.round(percent * maxVolume / 100.0f);

        // flags = 0: no UI popup, no beep — a guest-triggered remote volume
        // change shouldn't surface anything on the bridging phone itself.
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0);

        JSObject ret = new JSObject();
        ret.put("percent", percent);
        ret.put("index", index);
        ret.put("maxIndex", maxVolume);
        call.resolve(ret);
    }

    @PluginMethod
    public void getVolume(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            call.reject("AudioManager unavailable");
            return;
        }

        int currentIndex = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        int maxIndex = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int percent = Math.round(currentIndex * 100.0f / maxIndex);

        JSObject ret = new JSObject();
        ret.put("percent", percent);
        call.resolve(ret);
    }
}
