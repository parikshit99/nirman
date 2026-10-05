package com.nirmaan.auditor;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
