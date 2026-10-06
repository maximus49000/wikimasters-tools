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

    buildFeatures {
        buildConfig = true
    }

    // Deux canaux installables côte à côte : production (stable, dernière release) et pré-production (main, pre-releases).
    // Chacun a son identifiant, son nom, son schéma de retour Spotify/Tidal et sa source de mises à jour GitHub.
    flavorDimensions += "channel"
    productFlavors {
        val releases = "https://api.github.com/repos/maximus49000/wikimasters-tools/releases"
        create("production") {
            dimension = "channel"
            manifestPlaceholders["appLabel"] = "Wikimasters Tools"
            manifestPlaceholders["redirectScheme"] = "wikimasterstools"
            buildConfigField("String", "REDIRECT_SCHEME", "\"wikimasterstools\"")
            buildConfigField("String", "UPDATE_URL", "\"$releases/latest\"")
            buildConfigField("String", "UPDATE_TAG_PREFIX", "\"android-\"")
        }
        create("preprod") {
            dimension = "channel"
            applicationIdSuffix = ".preprod"
            manifestPlaceholders["appLabel"] = "Wikimasters Tools (pré-prod)"
            manifestPlaceholders["redirectScheme"] = "wikimasterstools-preprod"
            buildConfigField("String", "REDIRECT_SCHEME", "\"wikimasterstools-preprod\"")
            // Les pre-releases sont absentes de /releases/latest : on lit la liste et on garde la plus récente `preprod-N`.
            buildConfigField("String", "UPDATE_URL", "\"$releases?per_page=30\"")
            buildConfigField("String", "UPDATE_TAG_PREFIX", "\"preprod-\"")
        }
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
