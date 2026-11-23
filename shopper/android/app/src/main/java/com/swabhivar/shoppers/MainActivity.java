package com.swabhivar.shoppers;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import com.razorpay.PaymentResultWithDataListener;

public class MainActivity extends BridgeActivity implements PaymentResultWithDataListener {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeRazorpayPlugin.class);
        super.onCreate(savedInstanceState);

        try {
            Checkout.preload(getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "Checkout preload notice: " + e.getMessage());
        }
    }

    @Override
    public void onPaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        Log.i(TAG, "Razorpay Payment Success: " + razorpayPaymentId);
        NativeRazorpayPlugin plugin = NativeRazorpayPlugin.getInstance();
        if (plugin != null) {
            plugin.handlePaymentSuccess(razorpayPaymentId, paymentData);
        }
    }

    @Override
    public void onPaymentError(int code, String response, PaymentData paymentData) {
        Log.e(TAG, "Razorpay Payment Error: [" + code + "] " + response);
        NativeRazorpayPlugin plugin = NativeRazorpayPlugin.getInstance();
        if (plugin != null) {
            plugin.handlePaymentError(code, response, paymentData);
        }
    }
}
