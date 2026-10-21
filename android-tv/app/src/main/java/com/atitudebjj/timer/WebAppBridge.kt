package com.atitudebjj.timer

import android.webkit.JavascriptInterface
import androidx.core.net.toUri

/**
 * Puente expuesto a la web como `window.AtitudeTV` (ver web/js/platform.js).
 * Los métodos se ejecutan en un hilo de la WebView: lo que toca la UI se pasa al hilo principal.
 */
class WebAppBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun isTv(): Boolean = activity.isTelevision

    @JavascriptInterface
    fun keepScreenOn(on: Boolean) {
        activity.runOnUiThread { activity.setKeepScreenOn(on) }
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        val uri = url.toUri()
        // solo enlaces web: nada de esquemas raros desde la página
        if (uri.scheme == "https" || uri.scheme == "http") {
            activity.runOnUiThread { activity.openExternal(uri) }
        }
    }

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    companion object {
        const val NAME = "AtitudeTV"
    }
}
