package com.kyfitness.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Native Bluetooth LE heart-rate client (standard Heart Rate service 0x180D): chest straps, arm
 * bands and any device that broadcasts standard heart rate. Android's WebView has no Web Bluetooth,
 * so the app scans, connects and streams through this plugin instead.
 *
 * Events: "device" {id, name} while scanning, "scanStopped", "heartRate" {bpm, ts},
 * "connection" {state: "connected" | "disconnected", name}.
 */
@CapacitorPlugin(
    name = "BleHeartRate",
    permissions = {
        @Permission(strings = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, alias = "bt"),
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "btLegacy"),
    }
)
public class BleHeartRatePlugin extends Plugin {

    private static final UUID HR_SERVICE = UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
    private static final UUID HR_MEASUREMENT = UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final long SCAN_MS = 12_000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> seen = new HashSet<>();
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private BluetoothGatt gatt;
    private String connectedName = "";

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bt" : "btLegacy";
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BluetoothAdapter a = adapter();
        JSObject r = new JSObject();
        r.put("available", a != null);
        r.put("enabled", a != null && a.isEnabled());
        call.resolve(r);
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (getPermissionState(permissionAlias()) != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias(permissionAlias(), call, "scanPermissionResult");
            return;
        }
        beginScan(call);
    }

    @PermissionCallback
    private void scanPermissionResult(PluginCall call) {
        if (getPermissionState(permissionAlias()) == com.getcapacitor.PermissionState.GRANTED) {
            beginScan(call);
        } else {
            call.reject("Bluetooth permission was denied. Allow \"Nearby devices\" for Minimal Fitness in Android settings.");
        }
    }

    @SuppressLint("MissingPermission")
    private void beginScan(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) {
            call.reject("This phone has no Bluetooth.");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth is turned off. Turn it on and try again.");
            return;
        }
        stopScanInternal(false);
        seen.clear();
        scanner = a.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("Bluetooth scanning is unavailable right now.");
            return;
        }
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice d = result.getDevice();
                if (!seen.add(d.getAddress())) return;
                JSObject o = new JSObject();
                o.put("id", d.getAddress());
                String name = result.getScanRecord() != null ? result.getScanRecord().getDeviceName() : null;
                o.put("name", name != null ? name : "Heart-rate sensor");
                notifyListeners("device", o);
            }

            @Override
            public void onScanFailed(int errorCode) {
                notifyListeners("scanStopped", new JSObject());
            }
        };
        List<ScanFilter> filters = Collections.singletonList(
            new ScanFilter.Builder().setServiceUuid(new ParcelUuid(HR_SERVICE)).build());
        ScanSettings settings = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        scanner.startScan(filters, settings, scanCallback);
        main.postDelayed(() -> stopScanInternal(true), SCAN_MS);
        call.resolve();
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopScanInternal(true);
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void stopScanInternal(boolean notify) {
        main.removeCallbacksAndMessages(null);
        if (scanner != null && scanCallback != null) {
            try {
                scanner.stopScan(scanCallback);
            } catch (RuntimeException ignored) {
                // Bluetooth was switched off mid-scan.
            }
            if (notify) notifyListeners("scanStopped", new JSObject());
        }
        scanner = null;
        scanCallback = null;
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void connect(PluginCall call) {
        String id = call.getString("id");
        BluetoothAdapter a = adapter();
        if (id == null || a == null) {
            call.reject("No device selected.");
            return;
        }
        stopScanInternal(false);
        disconnectInternal();
        try {
            BluetoothDevice device = a.getRemoteDevice(id);
            connectedName = device.getName() != null ? device.getName() : "Heart-rate sensor";
            gatt = device.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            call.resolve();
        } catch (IllegalArgumentException | SecurityException e) {
            call.reject("Could not connect: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void disconnectInternal() {
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (RuntimeException ignored) {
                // Already closed.
            }
            gatt = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopScanInternal(false);
        disconnectInternal();
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                g.close();
                if (gatt == g) gatt = null;
                JSObject o = new JSObject();
                o.put("state", "disconnected");
                o.put("name", connectedName);
                o.put("failed", status != BluetoothGatt.GATT_SUCCESS);
                notifyListeners("connection", o);
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService service = g.getService(HR_SERVICE);
            BluetoothGattCharacteristic ch = service == null ? null : service.getCharacteristic(HR_MEASUREMENT);
            if (ch == null) {
                JSObject o = new JSObject();
                o.put("state", "disconnected");
                o.put("name", connectedName);
                o.put("failed", true);
                o.put("reason", "This device does not offer standard heart rate.");
                notifyListeners("connection", o);
                g.disconnect();
                return;
            }
            g.setCharacteristicNotification(ch, true);
            BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
            if (cccd != null) {
                if (Build.VERSION.SDK_INT >= 33) {
                    g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                } else {
                    cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    g.writeDescriptor(cccd);
                }
            }
            JSObject o = new JSObject();
            o.put("state", "connected");
            o.put("name", connectedName);
            notifyListeners("connection", o);
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value) {
            deliver(ch.getUuid(), value);
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) {
            // Pre-Android 13 delivery.
            if (Build.VERSION.SDK_INT < 33) deliver(ch.getUuid(), ch.getValue());
        }

        private void deliver(UUID uuid, byte[] data) {
            if (!HR_MEASUREMENT.equals(uuid) || data == null || data.length < 2) return;
            boolean sixteenBit = (data[0] & 0x01) != 0;
            int bpm = sixteenBit && data.length >= 3
                ? ((data[2] & 0xFF) << 8) | (data[1] & 0xFF)
                : (data[1] & 0xFF);
            if (bpm <= 0 || bpm > 300) return;
            SampleBuffer.addHeartRate(System.currentTimeMillis(), bpm);
            JSObject o = new JSObject();
            o.put("bpm", bpm);
            o.put("ts", System.currentTimeMillis());
            notifyListeners("heartRate", o);
        }
    };
}
