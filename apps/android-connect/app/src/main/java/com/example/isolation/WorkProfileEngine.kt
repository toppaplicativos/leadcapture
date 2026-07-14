package com.example.isolation

import android.content.Context
import android.content.Intent
import android.content.pm.LauncherApps
import android.os.Build
import android.os.Process
import android.os.UserHandle
import android.os.UserManager
import android.provider.Settings
import com.example.nativeapps.NativeAppLauncher

/**
 * Work Profile / multi-user — 2º espaço do Android.
 *
 * Apps de usuário normal NÃO podem provisionar managed profile sem ser DPC.
 * Este engine:
 *  - detecta perfis disponíveis
 *  - tenta lançar app em outro perfil via LauncherApps (quando permitido)
 *  - orienta o usuário a criar perfil de trabalho (Island/Shelter/empresa)
 */
class WorkProfileEngine(private val context: Context) {

    data class ProfileInfo(
        val userSerial: Long,
        val isCurrent: Boolean,
        val isManaged: Boolean,
        val label: String
    )

    fun listProfiles(): List<ProfileInfo> {
        val um = context.getSystemService(Context.USER_SERVICE) as? UserManager
            ?: return emptyList()
        val out = mutableListOf<ProfileInfo>()
        try {
            val profiles = um.userProfiles ?: emptyList()
            val my = Process.myUserHandle()
            for (uh in profiles) {
                val serial = try {
                    um.getSerialNumberForUser(uh)
                } catch (_: Exception) {
                    -1L
                }
                val managed = try {
                    if (Build.VERSION.SDK_INT >= 30) um.isManagedProfile else false
                } catch (_: Exception) {
                    false
                }
                // isManagedProfile is for current user only on some APIs — best effort
                out.add(
                    ProfileInfo(
                        userSerial = serial,
                        isCurrent = uh == my,
                        isManaged = managed && uh == my,
                        label = if (uh == my) "Perfil principal" else "Perfil secundário #$serial"
                    )
                )
            }
        } catch (_: Exception) {
            /* ignore */
        }
        return out
    }

    fun hasSecondaryProfile(): Boolean = listProfiles().size > 1

    /**
     * Tenta abrir o app no primeiro perfil não-atual que tenha o package.
     * Fallback: abre no perfil atual.
     */
    fun launchInBestProfile(packageName: String): WorkLaunchResult {
        val launcherApps = context.getSystemService(Context.LAUNCHER_APPS_SERVICE) as? LauncherApps
        val um = context.getSystemService(Context.USER_SERVICE) as? UserManager
        if (launcherApps == null || um == null) {
            val ok = NativeAppLauncher.launch(context, packageName)
            return WorkLaunchResult(ok, "host", if (ok) "Aberto no perfil atual" else "Falha ao abrir")
        }

        val my = Process.myUserHandle()
        val profiles = try {
            um.userProfiles ?: listOf(my)
        } catch (_: Exception) {
            listOf(my)
        }

        // Prefer secondary profiles first for "multiplica conta"
        val ordered = profiles.sortedBy { if (it == my) 1 else 0 }
        for (user in ordered) {
            try {
                if (!launcherApps.isPackageEnabled(packageName, user)) continue
                val activities = launcherApps.getActivityList(packageName, user)
                val act = activities.firstOrNull() ?: continue
                launcherApps.startMainActivity(act.componentName, user, null, null)
                val where = if (user == my) "host" else "work_profile"
                return WorkLaunchResult(
                    true,
                    where,
                    "Aberto em ${if (user == my) "perfil principal" else "perfil secundário"}"
                )
            } catch (_: Exception) {
                continue
            }
        }

        val ok = NativeAppLauncher.launch(context, packageName)
        return WorkLaunchResult(ok, "host", if (ok) "Fallback perfil atual" else "Package não lançável")
    }

    fun openWorkProfileSettings() {
        try {
            // Tela de usuários / contas no sistema
            context.startActivity(
                Intent(Settings.ACTION_SYNC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (_: Exception) {
            try {
                context.startActivity(
                    Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) {
            }
        }
    }

    data class WorkLaunchResult(
        val ok: Boolean,
        val profile: String,
        val message: String
    )
}
