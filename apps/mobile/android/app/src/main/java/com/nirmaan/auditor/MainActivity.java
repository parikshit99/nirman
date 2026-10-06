package com.nirmaan.auditor;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedFilesPlugin.class);
        registerPlugin(TextReaderPlugin.class);
        super.onCreate(savedInstanceState);
        // On older WebViews Capacitor pads the window instead of the page; give that padding the
        // app's header and bottom bar colour rather than leaving the status and navigation bars see-through.
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        getWindow().getDecorView().setBackgroundColor(night ? 0xFF1C1D21 : 0xFFFFFFFF);
    }
}
