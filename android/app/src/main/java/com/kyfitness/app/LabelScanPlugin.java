package com.kyfitness.app;

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
import com.google.mlkit.vision.label.ImageLabel;
import com.google.mlkit.vision.label.ImageLabeler;
import com.google.mlkit.vision.label.ImageLabeling;
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Reads the text in a photo of a nutrition label, on the phone. The recognition model is part of the app (not downloaded), and the
 * picture never leaves the phone: it arrives from the page as text, is read here, and the pieces of text come back with their positions.
 */
@CapacitorPlugin(name = "LabelScan")
public class LabelScanPlugin extends Plugin {
    private TextRecognizer recognizer;
    private ImageLabeler labeler;

    /** {@code image} is a JPEG as base64 text. Resolves {@code lines: [{text, left, top, right, bottom}]}. */
    @PluginMethod
    public void read(PluginCall call) {
        String b64 = call.getString("image");
        if (b64 == null || b64.isEmpty()) {
            call.reject("No picture");
            return;
        }
        Bitmap bmp;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (RuntimeException e) {
            call.reject("The picture could not be opened");
            return;
        }
        if (bmp == null) {
            call.reject("The picture could not be opened");
            return;
        }
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        final Bitmap picture = bmp;
        recognizer
            .process(InputImage.fromBitmap(picture, 0))
            .addOnSuccessListener(
                text -> {
                    JSArray lines = new JSArray();
                    for (Text.TextBlock block : text.getTextBlocks()) {
                        for (Text.Line line : block.getLines()) {
                            Rect r = line.getBoundingBox();
                            if (r == null) continue;
                            JSObject o = new JSObject();
                            o.put("text", line.getText());
                            o.put("left", r.left);
                            o.put("top", r.top);
                            o.put("right", r.right);
                            o.put("bottom", r.bottom);
                            lines.put(o);
                        }
                    }
                    picture.recycle();
                    JSObject out = new JSObject();
                    out.put("lines", lines);
                    call.resolve(out);
                }
            )
            .addOnFailureListener(
                e -> {
                    picture.recycle();
                    call.reject("The text could not be read: " + e.getMessage());
                }
            );
    }

    /**
     * Names what is in a photo of a meal, on the phone. {@code image} is a JPEG as base64 text. Resolves
     * {@code labels: [{text, confidence}]}, most likely first. The model is part of the app; the picture is not kept or sent.
     */
    @PluginMethod
    public void labels(PluginCall call) {
        String b64 = call.getString("image");
        if (b64 == null || b64.isEmpty()) {
            call.reject("No picture");
            return;
        }
        Bitmap bmp;
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (RuntimeException e) {
            call.reject("The picture could not be opened");
            return;
        }
        if (bmp == null) {
            call.reject("The picture could not be opened");
            return;
        }
        if (labeler == null) labeler = ImageLabeling.getClient(new ImageLabelerOptions.Builder().setConfidenceThreshold(0.4f).build());
        final Bitmap picture = bmp;
        labeler
            .process(InputImage.fromBitmap(picture, 0))
            .addOnSuccessListener(
                found -> {
                    JSArray list = new JSArray();
                    for (ImageLabel l : found) {
                        JSObject o = new JSObject();
                        o.put("text", l.getText());
                        o.put("confidence", Math.round(l.getConfidence() * 100) / 100.0);
                        list.put(o);
                    }
                    picture.recycle();
                    JSObject out = new JSObject();
                    out.put("labels", list);
                    call.resolve(out);
                }
            )
            .addOnFailureListener(
                e -> {
                    picture.recycle();
                    call.reject("The photo could not be looked at: " + e.getMessage());
                }
            );
    }

    @Override
    protected void handleOnDestroy() {
        if (labeler != null) labeler.close();
        if (recognizer != null) recognizer.close();
        super.handleOnDestroy();
    }
}
