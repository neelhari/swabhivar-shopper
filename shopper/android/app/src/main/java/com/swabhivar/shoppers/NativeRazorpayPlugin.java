package com.swabhivar.shoppers;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.razorpay.Checkout;
import com.razorpay.PaymentData;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeRazorpay")
public class NativeRazorpayPlugin extends Plugin {
    private static final String TAG = "NativeRazorpay";
    private static NativeRazorpayPlugin instance;
    private PluginCall activeCall;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static NativeRazorpayPlugin getInstance() {
        return instance;
    }

    @PluginMethod
    public void open(PluginCall call) {
        this.activeCall = call;
        try {
            JSObject optionsJs = call.getObject("options");
            if (optionsJs == null) {
                call.reject("Options object is required");
                return;
            }

            JSONObject options = new JSONObject(optionsJs.toString());

            Checkout checkout = new Checkout();
            if (options.has("key")) {
                checkout.setKeyID(options.getString("key"));
            }

            checkout.open(getActivity(), options);
        } catch (Exception e) {
            Log.e(TAG, "Error opening Razorpay native checkout: " + e.getMessage(), e);
            call.reject("Failed to open Razorpay: " + e.getMessage(), e);
        }
    }

    public void handlePaymentSuccess(String razorpayPaymentId, PaymentData paymentData) {
        if (activeCall == null) {
            Log.w(TAG, "Payment succeeded but no active PluginCall found");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("razorpay_payment_id", razorpayPaymentId);
        if (paymentData != null) {
            if (paymentData.getOrderId() != null) {
                ret.put("razorpay_order_id", paymentData.getOrderId());
            }
            if (paymentData.getSignature() != null) {
                ret.put("razorpay_signature", paymentData.getSignature());
            }
        }
        activeCall.resolve(ret);
        activeCall = null;
    }

    public void handlePaymentError(int code, String response, PaymentData paymentData) {
        if (activeCall == null) {
            Log.w(TAG, "Payment error but no active PluginCall found");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("code", code);
        ret.put("description", response);
        if (paymentData != null && paymentData.getData() != null) {
            ret.put("data", paymentData.getData().toString());
        }
        activeCall.reject(response != null ? response : "Payment failed", String.valueOf(code), ret);
        activeCall = null;
    }
}
