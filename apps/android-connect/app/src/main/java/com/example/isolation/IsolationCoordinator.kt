package com.example.isolation

import android.content.Context
import com.example.data.AppClone
import com.example.nativeapps.NativeAppLauncher

/**
 * Fachada única: decide como abrir / instalar cada slot.
 */
class IsolationCoordinator(private val context: Context) {

    private val virtual = VirtualSpaceEngine(context)
    private val work = WorkProfileEngine(context)

    fun launch(clone: AppClone): VirtualSpaceEngine.LaunchOutcome {
        return when (IsolationMode.fromWire(clone.isolationMode)) {
            IsolationMode.HOST, IsolationMode.SIDECAR -> {
                val pkg = clone.packageName.ifBlank { "com.whatsapp" }
                val st = NativeAppLauncher.status(context, pkg)
                if (!st.installed) {
                    VirtualSpaceEngine.LaunchOutcome(
                        ok = false,
                        needsInstall = true,
                        packageName = pkg,
                        message = "App não instalado: $pkg",
                        profile = "host"
                    )
                } else {
                    val ok = NativeAppLauncher.launch(context, pkg)
                    VirtualSpaceEngine.LaunchOutcome(
                        ok = ok,
                        needsInstall = false,
                        packageName = pkg,
                        message = if (ok) "Aberto ($pkg)" else "Falha launch",
                        profile = "host"
                    )
                }
            }
            IsolationMode.WORK_PROFILE -> {
                val pkg = clone.packageName.ifBlank { "com.whatsapp" }
                val st = NativeAppLauncher.status(context, pkg)
                if (!st.installed) {
                    VirtualSpaceEngine.LaunchOutcome(
                        false, true, pkg, "Instale $pkg no perfil de trabalho/principal", "none"
                    )
                } else {
                    val r = work.launchInBestProfile(pkg)
                    VirtualSpaceEngine.LaunchOutcome(r.ok, false, pkg, r.message, r.profile)
                }
            }
            IsolationMode.VIRTUAL -> virtual.launchSlot(clone)
        }
    }

    fun install(clone: AppClone) {
        val pkg = clone.packageName.ifBlank { "com.whatsapp" }
        NativeAppLauncher.openPlayStore(context, pkg)
    }

    fun allocateVirtual(
        appType: String,
        existing: List<AppClone>,
        preferredPackage: String? = null
    ) = virtual.allocatePackage(appType, existing, preferredPackage)

    fun poolStatus(existing: List<AppClone>) = virtual.poolStatus(existing)

    fun capabilities() = virtual.capabilities()

    fun discover() = PackageDiscovery.discoverMessagingApps(context)

    fun workProfiles() = work.listProfiles()

    fun openWorkProfileHelp() = work.openWorkProfileSettings()
}
