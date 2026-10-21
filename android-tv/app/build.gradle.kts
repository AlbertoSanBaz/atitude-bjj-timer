import javax.inject.Inject
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.atitudebjj.timer"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.atitudebjj.timer"
        minSdk = 24          // Android 7.0 (la mayoría de cajas y teles Android TV)
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Para instalar el release sin configurar una firma propia se usa la de debug.
            // Antes de publicar en Google Play, crea tu keystore (ver README).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.webkit)
}

/* ------------------------------------------------------------------
 * La web (../../web) es la única fuente de la interfaz.
 * En cada build se copia a assets/www dentro del APK, así la app funciona sin conexión.
 * El service worker es solo para la PWA y no se incluye.
 * ------------------------------------------------------------------ */
abstract class SyncWebAssets : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val webDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun sync() {
        fs.sync {
            from(webDir) {
                exclude("sw.js")
            }
            into(outputDir.dir("www"))
        }
    }
}

val syncWebAssets = tasks.register<SyncWebAssets>("syncWebAssets") {
    group = "build"
    description = "Copia la app web (../web) a los assets del APK."
    webDir.set(rootProject.file("../web"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncWebAssets, SyncWebAssets::outputDir)
    }
}
