package com.nirmaan.auditor;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.MimeTypeMap;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * Receives photos and text shared to Nirman from other apps (e.g. a bill
 * forwarded on WhatsApp). Each photo is copied into the app's cache and its
 * path sent to the web app as a "shared" event, which is kept until the web
 * app listens, so a share that starts the app is not lost.
 */
@CapacitorPlugin(name = "SharedFiles")
public class SharedFilesPlugin extends Plugin {

    private static final String TAG = "SharedFiles";
    private static final int MAX_FILES = 10;

    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        if (handle(intent)) {
            // Don't read the same share again if the activity is recreated.
            getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
    }

    private boolean handle(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;

        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class)
                : legacyStream(intent);
            if (uri != null) uris.add(uri);
        } else {
            ArrayList<Uri> list = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class)
                : legacyStreams(intent);
            if (list != null) uris.addAll(list);
        }

        JSArray files = new JSArray();
        File dir = new File(getContext().getCacheDir(), "shared");
        dir.mkdirs();
        long stamp = System.currentTimeMillis();
        for (int i = 0; i < uris.size() && i < MAX_FILES; i++) {
            Uri uri = uris.get(i);
            try {
                String mimeType = getContext().getContentResolver().getType(uri);
                String name = displayName(uri);
                if (mimeType == null && name != null) {
                    int dot = name.lastIndexOf('.');
                    if (dot > 0) mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).toLowerCase());
                }
                if (mimeType == null || !mimeType.startsWith("image/")) continue;
                String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
                File out = new File(dir, "share_" + stamp + "_" + i + "." + (ext != null ? ext : "img"));
                try (InputStream in = getContext().getContentResolver().openInputStream(uri); FileOutputStream os = new FileOutputStream(out)) {
                    if (in == null) continue;
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) != -1) os.write(buffer, 0, n);
                }
                JSObject file = new JSObject();
                file.put("path", out.getAbsolutePath());
                file.put("mimeType", mimeType);
                files.put(file);
            } catch (Exception e) {
                Log.e(TAG, "Could not read shared file " + uri, e);
            }
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (files.length() == 0 && (text == null || text.trim().isEmpty())) return true;

        JSObject data = new JSObject();
        data.put("files", files);
        data.put("text", text != null ? text : "");
        notifyListeners("shared", data, true);
        return true;
    }

    private String displayName(Uri uri) {
        if ("file".equals(uri.getScheme())) return new File(uri.getPath()).getName();
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception e) {
            Log.w(TAG, "No name for " + uri, e);
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private Uri legacyStream(Intent intent) {
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> legacyStreams(Intent intent) {
        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
    }
}
