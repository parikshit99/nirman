package com.nirmaan.auditor;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Reads the text on a bill photo on the phone itself (Google ML Kit text
 * recognition, model bundled in the app), so no internet or API key is
 * needed. Returns each line with its position, so the app can rebuild the
 * bill's rows.
 */
@CapacitorPlugin(name = "TextReader")
public class TextReaderPlugin extends Plugin {

    private TextRecognizer recognizer;

    @PluginMethod
    public void read(PluginCall call) {
        String data = call.getString("image");
        if (data == null || data.isEmpty()) {
            call.reject("No image");
            return;
        }
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("The photo could not be read");
            return;
        }
        if (bitmap == null) {
            call.reject("The photo could not be read");
            return;
        }
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer
            .process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        Rect box = line.getBoundingBox();
                        if (box == null) continue;
                        JSObject item = new JSObject();
                        item.put("text", line.getText());
                        item.put("left", box.left);
                        item.put("top", box.top);
                        item.put("right", box.right);
                        item.put("bottom", box.bottom);
                        lines.put(item);
                    }
                }
                JSObject result = new JSObject();
                result.put("lines", lines);
                result.put("text", text.getText());
                call.resolve(result);
            })
            .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "Text recognition failed" : e.getMessage()));
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) recognizer.close();
        super.handleOnDestroy();
    }
}
