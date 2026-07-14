package com.example.nativeapps

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Lança e inspeciona apps **nativos** instalados no aparelho.
 * Não usa WebView.
 */
object NativeAppLauncher {

    data class PackageStatus(
        val packageName: String,
        val installed: Boolean,
        val versionName: String? = null,
        val versionCode: Long? = null,
        val canLaunch: Boolean = false
    )

    fun status(context: Context, packageName: String): PackageStatus {
        if (packageName.isBlank()) {
            return PackageStatus(packageName, installed = false)
        }
        return try {
            val pm = context.packageManager
            val info = if (Build.VERSION.SDK_INT >= 33) {
                pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(packageName, 0)
            }
            val launch = pm.getLaunchIntentForPackage(packageName) != null
            val vCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            PackageStatus(
                packageName = packageName,
                installed = true,
                versionName = info.versionName,
                versionCode = vCode,
                canLaunch = launch
            )
        } catch (_: Exception) {
            PackageStatus(packageName, installed = false)
        }
    }

    /** Abre o app nativo. Retorna false se não instalado / sem launcher. */
    fun launch(context: Context, packageName: String): Boolean {
        val pm = context.packageManager
        val intent = pm.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    /** Abre a página do app na Play Store (ou browser). */
    fun openPlayStore(context: Context, packageName: String) {
        try {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (_: Exception) {
            context.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=$packageName")
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            )
        }
    }

    /** Tela de detalhes do app nas configurações do sistema. */
    fun openAppInfo(context: Context, packageName: String) {
        try {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (_: Exception) {
            /* ignore */
        }
    }

    /**
     * Atalho para fluxo de aparelhos conectados do WhatsApp
     * (melhor esforço — deep links mudam com a versão do WA).
     */
    fun launchWhatsAppLinkedDevices(context: Context, packageName: String = "com.whatsapp"): Boolean {
        // 1) tenta launch normal; usuário segue: Configurações → Aparelhos conectados
        if (launch(context, packageName)) return true
        // 2) fallback Business
        if (packageName != "com.whatsapp.w4b" && launch(context, "com.whatsapp.w4b")) return true
        return false
    }
}
