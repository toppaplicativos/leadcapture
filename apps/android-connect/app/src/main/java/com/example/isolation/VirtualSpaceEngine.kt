package com.example.isolation

import android.content.Context
import com.example.data.AppClone
import com.example.nativeapps.NativeAppLauncher
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Motor VIRTUAL — multiplica slots no device.
 *
 * Estratégia realista (sem root / sem VirtualApp proprietário):
 * 1. Descobre todos os packages de mensageria instalados (oficiais + clones)
 * 2. Cada slot VIRTUAL recebe um índice no pool e mapeia para um package
 * 3. Work Profile é usado quando há 2º perfil (2x packages oficiais possíveis)
 * 4. Metadados de sandbox por slot em filesDir/virtual_spaces/{slotKey}/
 *
 * Limite Android: não há N installs do mesmo packageName no mesmo user.
 * Para ir além do pool instalado, o usuário adiciona SIDECAR (APK clone)
 * ou Work Profile com 2ª cópia.
 */
class VirtualSpaceEngine(private val context: Context) {

    private val rootDir: File
        get() = File(context.filesDir, "virtual_spaces").also { if (!it.exists()) it.mkdirs() }

    private val registryFile: File
        get() = File(rootDir, "registry.json")

    data class VirtualBinding(
        val slotKey: String,
        val packageName: String,
        val appType: String,
        val poolIndex: Int,
        val isolation: IsolationMode,
        val label: String
    )

    data class PoolStatus(
        val availablePackages: List<PackageDiscovery.DiscoveredApp>,
        val usedCount: Int,
        val freeCount: Int,
        val hasWorkProfile: Boolean,
        val maxPracticalSlots: Int
    )

    fun poolStatus(usedSlots: List<AppClone>): PoolStatus {
        val pool = PackageDiscovery.whatsAppPackagePool(context)
        val messaging = PackageDiscovery.discoverMessagingApps(context)
        val work = WorkProfileEngine(context).hasSecondaryProfile()
        // Com work profile, teoricamente ~2x packages oficiais (se instalados nos dois)
        val max = messaging.size * (if (work) 2 else 1)
        val usedPkgs = usedSlots.map { it.packageName }.filter { it.isNotBlank() }.toSet()
        val free = messaging.count { it.packageName !in usedPkgs }
        return PoolStatus(
            availablePackages = messaging,
            usedCount = usedPkgs.size,
            freeCount = free,
            hasWorkProfile = work,
            maxPracticalSlots = max.coerceAtLeast(messaging.size)
        )
    }

    /**
     * Aloca package para um novo slot virtual.
     * Prefere packages ainda não usados por outros slots.
     */
    fun allocatePackage(
        appType: String,
        existingSlots: List<AppClone>,
        preferredPackage: String? = null
    ): VirtualBinding {
        val preferred = preferredPackage?.takeIf { it.isNotBlank() }
        if (preferred != null) {
            val st = NativeAppLauncher.status(context, preferred)
            val mode = if (st.installed) IsolationMode.VIRTUAL else IsolationMode.SIDECAR
            val key = newSlotKey()
            val binding = VirtualBinding(
                slotKey = key,
                packageName = preferred,
                appType = appType,
                poolIndex = existingSlots.size,
                isolation = mode,
                label = "Virtual ${existingSlots.size + 1}"
            )
            persistBinding(binding)
            ensureSandbox(key)
            return binding
        }

        val used = existingSlots.map { it.packageName }.filter { it.isNotBlank() }.toSet()
        val pool = when {
            appType.contains("WHATSAPP", true) -> PackageDiscovery.whatsAppPackagePool(context)
            else -> PackageDiscovery.discoverMessagingApps(context).filter { it.appType == appType }
        }.ifEmpty {
            PackageDiscovery.discoverMessagingApps(context)
        }

        val free = pool.firstOrNull { it.packageName !in used }
        val pick = free ?: pool.firstOrNull()
        val pkg = pick?.packageName ?: defaultPackageFor(appType)
        val type = pick?.appType ?: appType
        val key = newSlotKey()
        val binding = VirtualBinding(
            slotKey = key,
            packageName = pkg,
            appType = type,
            poolIndex = existingSlots.size,
            isolation = IsolationMode.VIRTUAL,
            label = pick?.label?.let { "$it · V${existingSlots.size + 1}" } ?: "Virtual ${existingSlots.size + 1}"
        )
        persistBinding(binding)
        ensureSandbox(key)
        return binding
    }

    fun launchSlot(clone: AppClone): LaunchOutcome {
        val pkg = clone.packageName.ifBlank { defaultPackageFor(clone.appType) }
        val st = NativeAppLauncher.status(context, pkg)
        if (!st.installed) {
            return LaunchOutcome(
                ok = false,
                needsInstall = true,
                packageName = pkg,
                message = "Package $pkg não instalado. Instale ou use SIDECAR com outro package.",
                profile = "none"
            )
        }

        // Se isolation WORK_PROFILE ou VIRTUAL com multi-perfil, tenta work engine
        val mode = IsolationMode.fromWire(clone.isolationMode)
        if (mode == IsolationMode.WORK_PROFILE ||
            (mode == IsolationMode.VIRTUAL && WorkProfileEngine(context).hasSecondaryProfile())
        ) {
            // Para slots pares, prefere secondary; ímpares host — multiplica uso dos perfis
            val preferSecondary = clone.id % 2 == 0
            if (preferSecondary && WorkProfileEngine(context).hasSecondaryProfile()) {
                val r = WorkProfileEngine(context).launchInBestProfile(pkg)
                return LaunchOutcome(
                    ok = r.ok,
                    needsInstall = false,
                    packageName = pkg,
                    message = r.message,
                    profile = r.profile
                )
            }
        }

        val ok = NativeAppLauncher.launch(context, pkg)
        return LaunchOutcome(
            ok = ok,
            needsInstall = false,
            packageName = pkg,
            message = if (ok) "App nativo aberto ($pkg)" else "Falha ao lançar $pkg",
            profile = "host"
        )
    }

    fun ensureSandbox(slotKey: String): File {
        val dir = File(rootDir, slotKey)
        if (!dir.exists()) dir.mkdirs()
        File(dir, "meta.json").writeText(
            JSONObject()
                .put("slotKey", slotKey)
                .put("createdAt", System.currentTimeMillis())
                .toString()
        )
        return dir
    }

    fun capabilities(): Map<String, Any?> {
        val pool = poolStatus(emptyList())
        val work = WorkProfileEngine(context)
        return mapOf(
            "virtual_engine" to "v1-pool-mapper",
            "packages_found" to pool.availablePackages.size,
            "whatsapp_pool" to PackageDiscovery.whatsAppPackagePool(context).map { it.packageName },
            "work_profile" to work.hasSecondaryProfile(),
            "profiles" to work.listProfiles().map {
                mapOf("serial" to it.userSerial, "current" to it.isCurrent, "label" to it.label)
            },
            "max_practical_slots" to pool.maxPracticalSlots,
            "note" to "N installs do mesmo package exige SIDECAR/Work Profile; pool multiplica com packages distintos"
        )
    }

    private fun defaultPackageFor(appType: String): String = when (appType.uppercase()) {
        "WHATSAPP_BUSINESS" -> "com.whatsapp.w4b"
        "INSTAGRAM" -> "com.instagram.android"
        "TELEGRAM" -> "org.telegram.messenger"
        "TIKTOK" -> "com.zhiliaoapp.musically"
        "FACEBOOK" -> "com.facebook.katana"
        else -> "com.whatsapp"
    }

    private fun newSlotKey(): String = "vs_${System.currentTimeMillis().toString(36)}_${(1000..9999).random()}"

    private fun persistBinding(binding: VirtualBinding) {
        try {
            val arr = if (registryFile.exists()) JSONArray(registryFile.readText()) else JSONArray()
            arr.put(
                JSONObject()
                    .put("slotKey", binding.slotKey)
                    .put("packageName", binding.packageName)
                    .put("appType", binding.appType)
                    .put("poolIndex", binding.poolIndex)
                    .put("isolation", binding.isolation.wire)
                    .put("label", binding.label)
            )
            registryFile.writeText(arr.toString())
        } catch (_: Exception) {
        }
    }

    data class LaunchOutcome(
        val ok: Boolean,
        val needsInstall: Boolean,
        val packageName: String,
        val message: String,
        val profile: String
    )
}
