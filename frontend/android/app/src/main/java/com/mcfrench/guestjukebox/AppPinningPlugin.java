package com.mcfrench.guestjukebox;

import android.app.ActivityManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native Capacitor plugin for Master Device Mode: lets the web app query
 * and enable Android screen pinning (lock task mode) on this phone, so a
 * guest-facing device can be pinned into the app and prevented from being
 * navigated away from accidentally.
 */
@CapacitorPlugin(name = "AppPinning")
public class AppPinningPlugin extends Plugin {

    @PluginMethod
    public void isPinned(PluginCall call) {
        ActivityManager activityManager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            call.reject("ActivityManager unavailable");
            return;
        }

        int lockTaskModeState = activityManager.getLockTaskModeState();
        boolean pinned = lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE;

        JSObject ret = new JSObject();
        ret.put("pinned", pinned);
        call.resolve(ret);
    }

    @PluginMethod
    public void enablePinning(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }

        try {
            getActivity().startLockTask();
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }

        call.resolve(new JSObject());
    }
}
