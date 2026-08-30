package com.mcfrench.guestjukebox;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeControlPlugin.class);
        super.onCreate(savedInstanceState);
        // Debug-build-only diagnostic aid: lets a USB-connected dev machine
        // open chrome://inspect and see the WebView's real Network-tab
        // failure reason for a fetch() (mixed content, cleartext block,
        // DNS failure, connection refused, etc.) -- fetch()'s own catch
        // handler in JS only ever gets a generic "Failed to fetch" for
        // network-level failures, which isn't enough to diagnose this kind
        // of LAN-connectivity issue from the error message alone.
        WebView.setWebContentsDebuggingEnabled(true);
    }
}
