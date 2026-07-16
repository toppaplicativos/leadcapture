plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.google.devtools.ksp)
  alias(libs.plugins.roborazzi)
  // secrets plugin removido: legado AI Studio / Gemini.
  // IA do produto usa Atlas no backend LeadCapture (mesmo provider do admin).
}

// Override opcional em gradle.properties ou -PAPI_BASE_URL=...
val apiBaseUrl: String =
  (project.findProperty("API_BASE_URL") as String?)
    ?: System.getenv("API_BASE_URL")
    ?: "https://app.leadcapture.online/"

// Provider de IA documentado no app (execução real é server-side via Atlas)
val aiProvider: String =
  (project.findProperty("AI_PROVIDER") as String?)
    ?: System.getenv("AI_PROVIDER")
    ?: "atlas"

android {
  namespace = "com.example"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "online.leadcapture.connect"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

    // Strings sempre entre aspas — evita BuildConfig quebrado (ex.: chave vazia)
    buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.trim().replace("\"", "")}\"")
    buildConfigField("String", "AI_PROVIDER", "\"${aiProvider.trim().replace("\"", "")}\"")
  }

  signingConfigs {
    // Debug: prefer project keystore, else ~/.android/debug.keystore (padrão Android)
    create("debugConfig") {
      val projectDebug = rootProject.file("debug.keystore")
      val userDebug = file("${System.getProperty("user.home")}/.android/debug.keystore")
      storeFile = when {
        projectDebug.exists() -> projectDebug
        userDebug.exists() -> userDebug
        else -> projectDebug // será gerado/validado; se não existir, AGP default abaixo
      }
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
    // Release só se KEYSTORE_PATH apontar para arquivo real
    val releasePath = System.getenv("KEYSTORE_PATH")
    if (!releasePath.isNullOrBlank() && file(releasePath).exists()) {
      create("release") {
        storeFile = file(releasePath)
        storePassword = System.getenv("STORE_PASSWORD")
        keyAlias = System.getenv("KEY_ALIAS") ?: "upload"
        keyPassword = System.getenv("KEY_PASSWORD")
      }
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      // Se não houver release keystore, usa debug (dev/local). Produção: defina KEYSTORE_PATH.
      signingConfig = signingConfigs.findByName("release")
        ?: signingConfigs.getByName("debugConfig")
    }
    debug {
      // Usa debugConfig se o keystore existir; senão deixa o default do AGP
      val dbg = signingConfigs.getByName("debugConfig")
      if (dbg.storeFile?.exists() == true) {
        signingConfig = dbg
      }
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
  implementation(platform(libs.androidx.compose.bom))
  // Firebase BOM só se for usar FCM depois; sem firebase-ai / Gemini
  implementation(platform(libs.firebase.bom))
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.room.ktx)
  implementation(libs.androidx.room.runtime)
  implementation(libs.androidx.webkit)
  implementation(libs.converter.moshi)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.logging.interceptor)
  implementation(libs.moshi.kotlin)
  implementation(libs.okhttp)
  implementation(libs.retrofit)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  testImplementation(libs.roborazzi)
  testImplementation(libs.roborazzi.compose)
  testImplementation(libs.roborazzi.junit.rule)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
  "ksp"(libs.androidx.room.compiler)
  "ksp"(libs.moshi.kotlin.codegen)
}
