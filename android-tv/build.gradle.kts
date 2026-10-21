// Archivo de build raíz: solo declara los plugins; la configuración vive en app/build.gradle.kts
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}
