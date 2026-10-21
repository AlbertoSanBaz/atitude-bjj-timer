package com.atitudebjj.timer

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * - Sirve los assets locales a través de WebViewAssetLoader.
 * - Impide que la WebView navegue fuera de la app: cualquier enlace externo
 *   se entrega al sistema (navegador, si lo hay).
 */
class TimerWebViewClient(
    private val assetLoader: WebViewAssetLoader,
    private val onExternalLink: (Uri) -> Unit,
) : WebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url
        if (url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
        if (request.isForMainFrame) onExternalLink(url)
        return true
    }
}
