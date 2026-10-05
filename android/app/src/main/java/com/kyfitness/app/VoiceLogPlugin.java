package com.kyfitness.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Voice logging that never leaves the phone. It uses Android's on-device speech recogniser only (Android 13 and newer, with the
 * language pack installed). If that is not available it refuses to listen rather than falling back to Google's online recogniser,
 * which would send your voice to a server.
 */
@CapacitorPlugin(name = "VoiceLog", permissions = {@Permission(alias = "mic", strings = {Manifest.permission.RECORD_AUDIO})})
public class VoiceLogPlugin extends Plugin {
    private SpeechRecognizer recognizer;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            call.reject("On-device speech recognition is not available on this phone, so voice logging stays off. Your voice is never sent to a server.");
            return;
        }
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micResult");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void micResult(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) start(call);
        else call.reject("Microphone permission was not given.");
    }

    private void start(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (recognizer != null) recognizer.destroy();
                recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { notifyListeners("state", new JSObject().put("listening", true)); }
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() { notifyListeners("state", new JSObject().put("listening", false)); }
                    @Override public void onError(int error) {
                        call.reject(error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "I did not catch that. Try again." : "Speech recognition failed (" + error + ").");
                        finish();
                    }
                    @Override public void onResults(Bundle results) {
                        ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        JSObject o = new JSObject();
                        o.put("text", list != null && !list.isEmpty() ? list.get(0) : "");
                        call.resolve(o);
                        finish();
                    }
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                recognizer.startListening(intent);
            } catch (RuntimeException e) {
                call.reject("Could not start listening: " + e.getMessage());
            }
        });
    }

    private void finish() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.cancel();
            finish();
            call.resolve();
        });
    }
}
