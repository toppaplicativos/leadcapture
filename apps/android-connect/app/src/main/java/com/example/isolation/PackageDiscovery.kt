package com.example.isolation

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.example.nativeapps.NativeAppLauncher

/**
 * Descobre packages instalados que podem servir como "cópias" de mensageria.
 * Inclui oficiais + clones sideload com nome/package suspeito de multi-conta.
 */
object PackageDiscovery {

    data class DiscoveredApp(
        val packageName: String,
        val label: String,
        val appType: String,
        val official: Boolean,
        val versionName: String? = null,
        val canLaunch: Boolean = false
    )

    private val OFFICIAL = listOf(
        Triple("com.whatsapp", "WhatsApp", "WHATSAPP"),
        Triple("com.whatsapp.w4b", "WhatsApp Business", "WHATSAPP_BUSINESS"),
        Triple("com.instagram.android", "Instagram", "INSTAGRAM"),
        Triple("org.telegram.messenger", "Telegram", "TELEGRAM"),
        Triple("com.zhiliaoapp.musically", "TikTok", "TIKTOK"),
        Triple("com.facebook.katana", "Facebook", "FACEBOOK"),
    )

    private val CLONE_HINTS = listOf(
        "whatsapp", "w4b", "gbwhats", "fmwhats", "yowhats", "dual", "clone",
        "parallel", "multi", "space", "2nd", "second", "instagram", "telegram"
    )

    fun discoverMessagingApps(context: Context): List<DiscoveredApp> {
        val pm = context.packageManager
        val found = linkedMapOf<String, DiscoveredApp>()

        // Oficiais primeiro
        for ((pkg, label, type) in OFFICIAL) {
            val st = NativeAppLauncher.status(context, pkg)
            if (st.installed) {
                found[pkg] = DiscoveredApp(
                    packageName = pkg,
                    label = label,
                    appType = type,
                    official = true,
                    versionName = st.versionName,
                    canLaunch = st.canLaunch
                )
            }
        }

        // Scan launcher apps por heurística de clone
        try {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val resolves = if (Build.VERSION.SDK_INT >= 33) {
                pm.queryIntentActivities(
                    intent,
                    PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong())
                )
            } else {
                @Suppress("DEPRECATION")
                pm.queryIntentActivities(intent, 0)
            }
            for (ri in resolves) {
                val pkg = ri.activityInfo?.packageName ?: continue
                if (found.containsKey(pkg)) continue
                val label = try {
                    ri.loadLabel(pm)?.toString() ?: pkg
                } catch (_: Exception) {
                    pkg
                }
                val blob = "${pkg.lowercase()} ${label.lowercase()}"
                val hit = CLONE_HINTS.any { blob.contains(it) }
                if (!hit) continue
                // ignora nosso próprio app
                if (pkg == context.packageName) continue
                val appType = when {
                    blob.contains("business") && blob.contains("whats") -> "WHATSAPP_BUSINESS"
                    blob.contains("whats") -> "WHATSAPP"
                    blob.contains("instagram") -> "INSTAGRAM"
                    blob.contains("telegram") -> "TELEGRAM"
                    blob.contains("tiktok") || blob.contains("musical") -> "TIKTOK"
                    blob.contains("facebook") -> "FACEBOOK"
                    else -> "WHATSAPP"
                }
                val st = NativeAppLauncher.status(context, pkg)
                found[pkg] = DiscoveredApp(
                    packageName = pkg,
                    label = label,
                    appType = appType,
                    official = false,
                    versionName = st.versionName,
                    canLaunch = st.canLaunch
                )
            }
        } catch (_: Exception) {
            /* best effort */
        }

        return found.values.toList()
    }

    /**
     * Packages candidatos a slots WhatsApp na ordem preferida.
     */
    fun whatsAppPackagePool(context: Context): List<DiscoveredApp> {
        return discoverMessagingApps(context).filter {
            it.appType == "WHATSAPP" || it.appType == "WHATSAPP_BUSINESS" ||
                it.packageName.contains("whats", ignoreCase = true)
        }
    }

    fun isSystemApp(context: Context, packageName: String): Boolean {
        return try {
            val pm = context.packageManager
            val ai = if (Build.VERSION.SDK_INT >= 33) {
                pm.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                pm.getApplicationInfo(packageName, 0)
            }
            (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        } catch (_: Exception) {
            false
        }
    }
}
