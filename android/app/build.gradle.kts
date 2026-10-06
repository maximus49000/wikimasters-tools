plugins {
    id("com.android.application")
}

android {
    namespace = "io.github.maximus49000.wikimasterstools"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.maximus49000.wikimasterstools"
        minSdk = 30
        targetSdk = 35
        // Fournis par scripts/build-apk.mjs (-PversionCode / -PversionName) : Android n'accepte une mise à jour que si versionCode augmente.
        versionCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as String?) ?: "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // APK d'installation directe (sans Play Store) : signé avec la clé de debug du poste, sans service tiers.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
}
