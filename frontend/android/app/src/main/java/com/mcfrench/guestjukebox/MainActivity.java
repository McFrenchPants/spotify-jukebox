package com.mcfrench.guestjukebox;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeControlPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
