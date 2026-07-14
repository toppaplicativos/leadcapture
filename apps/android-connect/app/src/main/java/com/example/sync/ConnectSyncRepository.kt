package com.example.sync

import android.content.Context
import android.os.Build
import com.example.BuildConfig
import com.example.auth.SessionStore
import com.example.data.AppClone
import com.example.data.AppCloneRepository
import com.example.isolation.IsolationCoordinator
import com.example.network.ApiClient
import com.example.network.BindingRequest
import com.example.network.BootstrapConnectRequest
import com.example.network.CommandAckDetailDto
import com.example.network.CommandAckRequest
import com.example.network.CommandDto
import com.example.network.DeviceCapabilitiesRequest
import com.example.network.DeviceRegisterRequest
import com.example.network.HeartbeatRequest
import com.example.network.LoginRequest
import com.example.network.ServerInstanceDto
import com.example.network.SyncResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

class ConnectSyncRepository(
    context: Context,
    private val sessionStore: SessionStore,
    private val cloneRepository: AppCloneRepository
) {
    private val appContext = context.applicationContext
    private val api get() = ApiClient.get(sessionStore)
    private val isolation = IsolationCoordinator(appContext)

    suspend fun login(email: String, password: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val res = api.login(LoginRequest(email.trim(), password))
            val token = res.token
            if (token.isNullOrBlank()) {
                return@withContext Result.failure(Exception(res.error ?: "Login falhou"))
            }
            sessionStore.saveLogin(
                token = token,
                userId = res.user?.id,
                email = res.user?.email ?: email.trim(),
                name = res.user?.name
            )
            ApiClient.reset()
            registerDeviceInternal()
            reportCapabilitiesInternal()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun logout() {
        sessionStore.clearSession()
        ApiClient.reset()
    }

    suspend fun ensureDeviceRegistered(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            registerDeviceInternal()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun registerDeviceInternal() {
        api.registerDevice(
            DeviceRegisterRequest(
                deviceId = sessionStore.deviceId,
                displayName = Build.MODEL,
                model = Build.MODEL,
                manufacturer = Build.MANUFACTURER,
                osVersion = Build.VERSION.RELEASE,
                appVersion = BuildConfig.VERSION_NAME,
                fcmToken = null
            )
        )
    }

    private suspend fun reportCapabilitiesInternal() {
        val pool = isolation.poolStatus(cloneRepository.allClones.first())
        val packages = isolation.discover().map { it.packageName }
        api.reportCapabilities(
            DeviceCapabilitiesRequest(
                deviceId = sessionStore.deviceId,
                packages = packages,
                slotCount = cloneRepository.allClones.first().size,
                workProfile = pool.hasWorkProfile,
                maxPracticalSlots = pool.maxPracticalSlots,
                virtualEngine = "v1-pool-mapper",
                isolationModes = listOf("HOST", "SIDECAR", "WORK_PROFILE", "VIRTUAL")
            )
        )
    }

    suspend fun reportCapabilities(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            if (!sessionStore.isLoggedIn) return@withContext Result.failure(Exception("not_logged_in"))
            reportCapabilitiesInternal()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Cria instance no servidor + binding + opcional pairing enqueue.
     */
    suspend fun bootstrapSlot(
        clone: AppClone,
        phone: String? = null,
        enqueuePairing: Boolean = false
    ): Result<AppClone> = withContext(Dispatchers.IO) {
        try {
            if (!sessionStore.isLoggedIn) {
                return@withContext Result.failure(Exception("Faça login para bootstrap"))
            }
            val res = api.bootstrapConnect(
                BootstrapConnectRequest(
                    deviceId = sessionStore.deviceId,
                    localCloneId = clone.id,
                    label = clone.name,
                    colorHex = clone.colorHex,
                    groupName = clone.groupName,
                    appType = clone.appType,
                    packageName = clone.packageName,
                    isolationMode = clone.isolationMode,
                    instanceName = clone.name,
                    enqueuePairing = enqueuePairing && !phone.isNullOrBlank(),
                    phone = phone
                )
            )
            val instanceId = res.instanceId ?: res.instance?.id
            if (instanceId.isNullOrBlank()) {
                return@withContext Result.failure(Exception(res.error ?: "Bootstrap sem instance_id"))
            }
            val updated = clone.copy(
                instanceId = instanceId,
                bindingId = res.binding?.id,
                localBound = true,
                serverStatus = res.instance?.status ?: "disconnected",
                lastServerSyncAt = System.currentTimeMillis()
            )
            cloneRepository.update(updated)
            Result.success(updated)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun heartbeat(activeClones: Int, totalClones: Int): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            if (!sessionStore.isLoggedIn) return@withContext Result.failure(Exception("not_logged_in"))
            api.heartbeat(
                HeartbeatRequest(
                    deviceId = sessionStore.deviceId,
                    network = "android",
                    clonesSummary = com.example.network.ClonesSummaryDto(
                        active = activeClones,
                        total = totalClones
                    )
                )
            )
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun pullSync(): Result<SyncResponse> = withContext(Dispatchers.IO) {
        try {
            if (!sessionStore.isLoggedIn) return@withContext Result.failure(Exception("not_logged_in"))
            val snap = api.sync(sessionStore.deviceId)
            applySyncToLocal(snap)
            Result.success(snap)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Espelha instâncias do servidor em cards locais (sem apagar slots só-web).
     */
    private suspend fun applySyncToLocal(snap: SyncResponse) {
        val instances = snap.instances.orEmpty()
        val bindings = snap.bindings.orEmpty()
        val local = cloneRepository.allClones.first()

        // Atualiza clones que já têm instanceId
        for (clone in local) {
            val instanceId = clone.instanceId
            if (instanceId.isNullOrBlank()) continue
            val remote = instances.find { it.id == instanceId } ?: continue
            val binding = bindings.find { it.instanceId == instanceId }
            val updated = clone.copy(
                name = remote.name?.takeIf { it.isNotBlank() } ?: clone.name,
                serverStatus = remote.status ?: clone.serverStatus,
                serverPhone = remote.phone ?: clone.serverPhone,
                bindingId = binding?.id ?: clone.bindingId,
                lastServerSyncAt = System.currentTimeMillis(),
                isStopped = (remote.status ?: "").equals("disconnected", ignoreCase = true) && clone.isStopped
            )
            if (updated != clone) cloneRepository.update(updated)
        }

        // Cria cards para instâncias sem binding/local
        val knownInstanceIds = local.mapNotNull { it.instanceId }.toSet()
        for (remote in instances) {
            if (knownInstanceIds.contains(remote.id)) continue
            val binding = bindings.find { it.instanceId == remote.id }
            val color = binding?.colorHex ?: colorForStatus(remote.status)
            val name = binding?.label ?: remote.name ?: "WhatsApp"
            val appType = binding?.appType ?: "WHATSAPP"
            val pkg = when (appType.uppercase()) {
                "WHATSAPP_BUSINESS" -> "com.whatsapp.w4b"
                else -> "com.whatsapp"
            }
            val installed = try {
                appContext.packageManager.getPackageInfo(pkg, 0)
                true
            } catch (_: Exception) {
                false
            }
            val newId = cloneRepository.insert(
                AppClone(
                    name = name,
                    appType = appType,
                    url = "",
                    colorHex = color,
                    groupName = binding?.groupName ?: "LeadCapture",
                    engineMode = "NATIVE_HOST",
                    packageName = pkg,
                    isolationMode = "HOST",
                    installState = if (installed) "installed" else "missing",
                    instanceId = remote.id,
                    bindingId = binding?.id,
                    serverStatus = remote.status ?: "disconnected",
                    serverPhone = remote.phone,
                    lastServerSyncAt = System.currentTimeMillis(),
                    isApkImported = installed,
                    virtualApkSizeMb = 0
                )
            )
            // upsert binding se ainda não existe no servidor
            if (binding == null) {
                try {
                    val res = api.upsertBinding(
                        BindingRequest(
                            deviceId = sessionStore.deviceId,
                            instanceId = remote.id,
                            localCloneId = newId.toInt(),
                            label = name,
                            colorHex = color,
                            groupName = "LeadCapture",
                            appType = "WHATSAPP"
                        )
                    )
                    val bid = res.binding?.id
                    if (!bid.isNullOrBlank()) {
                        val created = cloneRepository.getCloneById(newId.toInt()).first()
                        if (created != null) {
                            cloneRepository.update(
                                created.copy(bindingId = bid, localBound = true)
                            )
                        }
                    }
                } catch (_: Exception) {
                    /* best effort */
                }
            } else if (binding.localCloneId == null) {
                try {
                    api.upsertBinding(
                        BindingRequest(
                            deviceId = sessionStore.deviceId,
                            instanceId = remote.id,
                            localCloneId = newId.toInt(),
                            label = name,
                            colorHex = color,
                            groupName = binding.groupName,
                            appType = binding.appType ?: "WHATSAPP"
                        )
                    )
                } catch (_: Exception) {
                }
            }
        }
    }

    suspend fun bindCloneToInstance(clone: AppClone, instanceId: String): Result<AppClone> =
        withContext(Dispatchers.IO) {
            try {
                val res = api.upsertBinding(
                    BindingRequest(
                        deviceId = sessionStore.deviceId,
                        instanceId = instanceId,
                        localCloneId = clone.id,
                        label = clone.name,
                        colorHex = clone.colorHex,
                        groupName = clone.groupName,
                        appType = clone.appType
                    )
                )
                val updated = clone.copy(
                    instanceId = instanceId,
                    bindingId = res.binding?.id,
                    localBound = true,
                    engineMode = "NATIVE_HOST",
                    lastServerSyncAt = System.currentTimeMillis()
                )
                cloneRepository.update(updated)
                Result.success(updated)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    /**
     * Lista comandos abertos, marca accepted, executa [onCommand] e faz ack done/failed.
     * O handler deve ser a lógica nativa real (abrir app, pairing, etc.).
     */
    suspend fun pollAndHandleCommands(
        onCommand: suspend (CommandDto) -> Unit
    ): Result<List<CommandDto>> = withContext(Dispatchers.IO) {
        try {
            if (!sessionStore.isLoggedIn) return@withContext Result.success(emptyList())
            val res = api.listCommands(sessionStore.deviceId, "open")
            val commands = res.commands.orEmpty()
            for (cmd in commands) {
                try {
                    api.ackCommand(cmd.id, CommandAckRequest(status = "accepted"))
                    onCommand(cmd)
                    api.ackCommand(
                        cmd.id,
                        CommandAckRequest(
                            status = "done",
                            detail = CommandAckDetailDto(
                                note = "native_handled",
                                handledAt = System.currentTimeMillis()
                            )
                        )
                    )
                } catch (e: Exception) {
                    try {
                        api.ackCommand(
                            cmd.id,
                            CommandAckRequest(
                                status = "failed",
                                detail = CommandAckDetailDto(error = e.message ?: "error")
                            )
                        )
                    } catch (_: Exception) {
                    }
                }
            }
            Result.success(commands)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun findCloneForInstance(instanceId: String): AppClone? {
        val local = cloneRepository.allClones.first()
        return local.find { it.instanceId == instanceId }
    }

    suspend fun requestPairing(instanceId: String, phone: String): Result<String> =
        withContext(Dispatchers.IO) {
            try {
                val res = api.requestPairingCode(
                    instanceId,
                    com.example.network.PairingCodeRequest(phoneNumber = phone, phone = phone)
                )
                val code = res.code ?: res.pairingCode
                if (code.isNullOrBlank()) {
                    Result.failure(Exception(res.error ?: res.message ?: "Código indisponível"))
                } else {
                    Result.success(code)
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    fun instancesFromLastSync(snap: SyncResponse?): List<ServerInstanceDto> =
        snap?.instances.orEmpty()

    private fun colorForStatus(status: String?): String {
        return when (status?.lowercase()) {
            "connected" -> "#0EAB55"
            "connecting", "qr", "pairing" -> "#F59E0B"
            else -> "#128C7E"
        }
    }
}
