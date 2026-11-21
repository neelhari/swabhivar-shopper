package com.swabhivar.shoppers;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.razorpay.Checkout;
import java.lang.reflect.Method;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "RazorpayUpiDebug";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Preload Razorpay Checkout resources
        try {
            Checkout.preload(getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "Checkout preload notice: " + e.getMessage());
        }

        // =========================================================================
        // [TEMP DEBUG] REMOVE BEFORE RELEASE: Check which UPI apps are detected
        // =========================================================================
        checkUpiAppsDebug();
    }

    /**
     * [TEMP DEBUG] REMOVE BEFORE RELEASE
     * Verifies package visibility and logs which UPI apps are detected on this device.
     */
    private void checkUpiAppsDebug() {
        Log.i(TAG, "=== [TEMP DEBUG - REMOVE BEFORE RELEASE] Starting UPI App Detection Check ===");

        // 1. Android PackageManager check using the 'upi://pay' intent
        try {
            PackageManager pm = getPackageManager();
            Intent upiIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
            List<ResolveInfo> resolvedList = pm.queryIntentActivities(upiIntent, PackageManager.MATCH_DEFAULT_ONLY);
            int count = (resolvedList != null) ? resolvedList.size() : 0;
            Log.i(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Total UPI apps handling upi://pay: " + count);
            if (resolvedList != null) {
                for (ResolveInfo info : resolvedList) {
                    CharSequence label = info.loadLabel(pm);
                    String pkg = info.activityInfo.packageName;
                    Log.i(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Detected UPI App: " + label + " (" + pkg + ")");
                }
            }

            // Check individual whitelisted packages
            String[] targetPackages = new String[]{
                "com.google.android.apps.nbu.paisa.user", // Google Pay
                "com.phonepe.app",                         // PhonePe
                "net.one97.paytm",                         // Paytm
                "in.org.npci.upiapp",                      // BHIM
                "com.dreamplug.androidapp",                // CRED
                "com.whatsapp",                            // WhatsApp
                "in.amazon.mShop.android.shopping"         // Amazon
            };

            for (String pkg : targetPackages) {
                try {
                    pm.getPackageInfo(pkg, 0);
                    Log.i(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Installed & Visible: " + pkg);
                } catch (PackageManager.NameNotFoundException e) {
                    Log.d(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Not installed: " + pkg);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Error during PackageManager check: " + e.getMessage(), e);
        }

        // 2. Razorpay internal helper check via reflection (CheckoutUtils.getUpiIntentsDataInJsonArray)
        try {
            Class<?> utilsClass = Class.forName("com.razorpay.CheckoutUtils");
            Method method = utilsClass.getDeclaredMethod("getUpiIntentsDataInJsonArray", android.content.Context.class);
            method.setAccessible(true);
            Object result = method.invoke(null, this);
            Log.i(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Razorpay SDK CheckoutUtils UPI intents array: " + result);
        } catch (Exception e) {
            Log.d(TAG, "[TEMP DEBUG - REMOVE BEFORE RELEASE] Razorpay CheckoutUtils helper reflection note: " + e.getMessage());
        }

        Log.i(TAG, "=== [TEMP DEBUG - REMOVE BEFORE RELEASE] End of UPI App Detection Check ===");
    }
}
