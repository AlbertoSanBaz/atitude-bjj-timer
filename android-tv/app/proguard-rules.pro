# Los métodos del puente JavaScript se llaman por reflexión desde la WebView: no se pueden ofuscar ni eliminar.
-keepclassmembers class com.atitudebjj.timer.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
