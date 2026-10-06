package com.nirmaan.auditor;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A short buzz when a button is pressed, using Android's own touch feedback
 * (the same as native apps), so it follows the phone's "Touch feedback"
 * setting and needs no vibrate permission.
 */
@CapacitorPlugin(name = "Haptics")
public class HapticsPlugin extends Plugin {

    @PluginMethod
    public void perform(PluginCall call) {
        String type = call.getString("type", "tap");
        int constant;
        switch (type) {
            case "tick":
                constant = HapticFeedbackConstants.CLOCK_TICK;
                break;
            case "confirm":
                constant = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.CONTEXT_CLICK;
                break;
            case "reject":
                constant = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
                break;
            default:
                constant = HapticFeedbackConstants.CONTEXT_CLICK;
        }
        final int feedback = constant;
        View view = getBridge().getWebView();
        getActivity().runOnUiThread(() -> view.performHapticFeedback(feedback));
        call.resolve();
    }
}
