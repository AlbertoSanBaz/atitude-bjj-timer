package com.atitudebjj.timer

import android.annotation.SuppressLint
import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Pantalla única: una WebView a pantalla completa que carga la app web empaquetada en assets/www.
 *
 * - Los archivos se sirven desde https://appassets.androidplatform.net (WebViewAssetLoader),
 *   un origen seguro y local: sin internet y sin habilitar el acceso a file://.
 * - El mando a distancia: las flechas y OK llegan a la web (navegación espacial en js/spatial-nav.js);
 *   Atrás y las teclas multimedia se traducen aquí a comandos de la web.
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView

    /** true en Android TV / Google TV. La web lo consulta para activar el modo TV. */
    val isTelevision: Boolean by lazy {
        val ui = getSystemService(UI_MODE_SERVICE) as UiModeManager
        ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
    }

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enterImmersiveMode()

        webView = WebView(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.ink))
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true                 // localStorage: guarda la última configuración
                mediaPlaybackRequiresUserGesture = false // campana y claqueta sin bloqueo de autoplay
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                userAgentString = "$userAgentString AtitudeTimer/${BuildConfig.VERSION_NAME}"
            }
            webViewClient = TimerWebViewClient(assetLoader, ::openExternal)
            // Se registra antes de cargar la página para que js/platform.js lo encuentre al arrancar
            addJavascriptInterface(WebAppBridge(this@MainActivity), WebAppBridge.NAME)
        }
        setContentView(webView)
        webView.requestFocus()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // La web decide: en marcha → pausa; en pausa → ajustes; en ajustes → salir de la app
                webView.evaluateJavascript(
                    "(window.AtitudeApp && window.AtitudeApp.handleBack()) === true"
                ) { handled -> if (handled != "true") finish() }
            }
        })

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
        webView.loadUrl(START_URL)
    }

    /** Teclas multimedia del mando: ▶❚❚ pausa/continúa, ⏭ salta fase, ⏮ reinicia. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val command = when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK -> "toggle"
            KeyEvent.KEYCODE_MEDIA_NEXT,
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "skip"
            KeyEvent.KEYCODE_MEDIA_PREVIOUS,
            KeyEvent.KEYCODE_MEDIA_REWIND -> "reset"
            else -> null
        } ?: return super.dispatchKeyEvent(event)

        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            webView.evaluateJavascript(
                "window.AtitudeApp && window.AtitudeApp.command('$command')", null
            )
        }
        return true
    }

    /** Lo llama el puente JS mientras el timer está en marcha. */
    fun setKeepScreenOn(on: Boolean) {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /** Enlaces externos (web del club, Instagram). En muchas teles no hay navegador. */
    fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersiveMode()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        // No pausa el JavaScript: el timer sigue contando aunque se salga al launcher
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface(WebAppBridge.NAME)
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val START_URL =
            "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html"
    }
}
