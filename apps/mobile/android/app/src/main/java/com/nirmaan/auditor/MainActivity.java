package com.nirmaan.auditor;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SharedFilesPlugin.class);
        registerPlugin(TextReaderPlugin.class);
        registerPlugin(HapticsPlugin.class);
        super.onCreate(savedInstanceState);
        // On older WebViews Capacitor pads the window instead of the page; give that padding the
        // app's header and bottom bar colour rather than leaving the status and navigation bars see-through.
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        getWindow().getDecorView().setBackgroundColor(night ? 0xFF1C1D21 : 0xFFFFFFFF);
        // No stretch when a list is pulled past its end: Android 12+ stretches the whole WebView, which
        // drags the bottom bar down under the navigation bar.
        getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
    }
}
