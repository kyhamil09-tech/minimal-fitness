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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;

/**
 * Native Bluetooth LE client for cycling sensors: power meters (Cycling Power service 0x1818) and speed / cadence sensors (Cycling
 * Speed and Cadence service 0x1816). It can hold two connections at once, for example a power meter and a cadence sensor. It only
 * forwards the raw bytes of each reading as hex; src/lib/cyclingSensors.ts decodes them, so the maths is unit-tested.
 *
 * Events: "device" {id, name, kind}, "scanStopped", "data" {id, char ("2a63" power, "2a5b" speed/cadence), hex, ts},
 * "connection" {id, name, state: "connected" | "disconnected", failed, reason}.
 */
@CapacitorPlugin(
    name = "BleCycling",
    permissions = {
        @Permission(strings = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, alias = "bt"),
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "btLegacy"),
    }
)
public class BleCyclingPlugin extends Plugin {

    private static final UUID CPS_SERVICE = UUID.fromString("00001818-0000-1000-8000-00805f9b34fb");
    private static final UUID CPS_MEASUREMENT = UUID.fromString("00002a63-0000-1000-8000-00805f9b34fb");
    private static final UUID CSC_SERVICE = UUID.fromString("00001816-0000-1000-8000-00805f9b34fb");
    private static final UUID CSC_MEASUREMENT = UUID.fromString("00002a5b-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final long SCAN_MS = 12_000;
    private static final int MAX_CONNECTIONS = 2;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> seen = new HashSet<>();
    private final Map<String, BluetoothGatt> gatts = new HashMap<>();
    private final Map<String, String> names = new HashMap<>();
    /** Notifications still to switch on for a device (Android allows one descriptor write at a time). */
    private final Map<String, Queue<BluetoothGattCharacteristic>> pending = new HashMap<>();
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;

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
                boolean power = false;
                boolean csc = false;
                if (result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null) {
                    for (ParcelUuid u : result.getScanRecord().getServiceUuids()) {
                        if (CPS_SERVICE.equals(u.getUuid())) power = true;
                        if (CSC_SERVICE.equals(u.getUuid())) csc = true;
                    }
                }
                JSObject o = new JSObject();
                o.put("id", d.getAddress());
                String name = result.getScanRecord() != null ? result.getScanRecord().getDeviceName() : null;
                o.put("name", name != null ? name : (power ? "Power meter" : "Cycling sensor"));
                o.put("kind", power && csc ? "both" : power ? "power" : "speedcadence");
                notifyListeners("device", o);
            }

            @Override
            public void onScanFailed(int errorCode) {
                notifyListeners("scanStopped", new JSObject());
            }
        };
        List<ScanFilter> filters = new ArrayList<>();
        filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(CPS_SERVICE)).build());
        filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(CSC_SERVICE)).build());
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
        if (gatts.containsKey(id)) {
            call.resolve();
            return;
        }
        if (gatts.size() >= MAX_CONNECTIONS) {
            call.reject("Two sensors are already connected. Disconnect one first.");
            return;
        }
        stopScanInternal(false);
        try {
            BluetoothDevice device = a.getRemoteDevice(id);
            String name = call.getString("name");
            names.put(id, name != null ? name : (device.getName() != null ? device.getName() : "Cycling sensor"));
            gatts.put(id, device.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE));
            call.resolve();
        } catch (IllegalArgumentException | SecurityException e) {
            call.reject("Could not connect: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String id = call.getString("id");
        if (id == null) disconnectAll();
        else disconnectOne(id);
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void disconnectOne(String id) {
        BluetoothGatt g = gatts.remove(id);
        pending.remove(id);
        if (g != null) {
            try {
                g.disconnect();
                g.close();
            } catch (RuntimeException ignored) {
                // Already closed.
            }
        }
    }

    private void disconnectAll() {
        for (String id : new ArrayList<>(gatts.keySet())) disconnectOne(id);
    }

    @Override
    protected void handleOnDestroy() {
        stopScanInternal(false);
        disconnectAll();
    }

    private void announce(String id, String state, boolean failed, String reason) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("name", names.containsKey(id) ? names.get(id) : "Cycling sensor");
        o.put("state", state);
        o.put("failed", failed);
        if (reason != null) o.put("reason", reason);
        notifyListeners("connection", o);
    }

    @SuppressLint("MissingPermission")
    private void enableNext(BluetoothGatt g) {
        String id = g.getDevice().getAddress();
        Queue<BluetoothGattCharacteristic> q = pending.get(id);
        if (q == null) return;
        BluetoothGattCharacteristic ch = q.poll();
        if (ch == null) return;
        g.setCharacteristicNotification(ch, true);
        BluetoothGattDescriptor cccd = ch.getDescriptor(CCCD);
        if (cccd == null) {
            enableNext(g);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        } else {
            cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            g.writeDescriptor(cccd);
        }
    }

    private static String hex(byte[] data) {
        StringBuilder b = new StringBuilder(data.length * 2);
        for (byte x : data) b.append(String.format("%02x", x & 0xFF));
        return b.toString();
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            String id = g.getDevice().getAddress();
            if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                g.discoverServices();
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                g.close();
                gatts.remove(id);
                pending.remove(id);
                announce(id, "disconnected", status != BluetoothGatt.GATT_SUCCESS, null);
            }
        }

        @SuppressLint("MissingPermission")
        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            String id = g.getDevice().getAddress();
            Queue<BluetoothGattCharacteristic> q = new ArrayDeque<>();
            BluetoothGattService cps = g.getService(CPS_SERVICE);
            BluetoothGattService csc = g.getService(CSC_SERVICE);
            if (cps != null && cps.getCharacteristic(CPS_MEASUREMENT) != null) q.add(cps.getCharacteristic(CPS_MEASUREMENT));
            if (csc != null && csc.getCharacteristic(CSC_MEASUREMENT) != null) q.add(csc.getCharacteristic(CSC_MEASUREMENT));
            if (q.isEmpty()) {
                announce(id, "disconnected", true, "This device is not a power meter or a speed or cadence sensor.");
                g.disconnect();
                return;
            }
            pending.put(id, q);
            enableNext(g);
            announce(id, "connected", false, null);
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor descriptor, int status) {
            enableNext(g);
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch, byte[] value) {
            deliver(g, ch.getUuid(), value);
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic ch) {
            if (Build.VERSION.SDK_INT < 33) deliver(g, ch.getUuid(), ch.getValue());
        }

        private void deliver(BluetoothGatt g, UUID uuid, byte[] data) {
            if (data == null || data.length < 2) return;
            String which = CPS_MEASUREMENT.equals(uuid) ? "2a63" : CSC_MEASUREMENT.equals(uuid) ? "2a5b" : null;
            if (which == null) return;
            JSObject o = new JSObject();
            o.put("id", g.getDevice().getAddress());
            o.put("char", which);
            o.put("hex", hex(data));
            o.put("ts", System.currentTimeMillis());
            notifyListeners("data", o);
        }
    };
}
