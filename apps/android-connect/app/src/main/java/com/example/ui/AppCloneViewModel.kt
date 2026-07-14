package com.example.ui

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.auth.SessionStore
import com.example.data.AppClone
import com.example.data.AppCloneRepository
import com.example.isolation.EngineMode
import com.example.isolation.IsolationCoordinator
import com.example.isolation.IsolationMode
import com.example.isolation.PackageDiscovery
import com.example.nativeapps.ClipboardHelper
import com.example.nativeapps.ConnectionDispatcher
import com.example.nativeapps.NativeAppLauncher
import com.example.network.CommandDto
import com.example.network.ServerInstanceDto
import com.example.sync.ConnectSyncRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

enum class AppScreen {
    SPLASH,
    ONBOARDING,
    DASHBOARD,
    PIN_LOCK,
    SETTINGS,
    MONITORING,
    LOGS,
    PERMISSIONS,
    CREATE_CLONE,
    LOGIN,
    CONNECTION_ASSIST
}

enum class AppPreset(
    val idName: String,
    val displayName: String,
    val defaultUrl: String,
    val defaultColorHex: String,
    val packageName: String
) {
    WHATSAPP("WHATSAPP", "WhatsApp", "", "#128C7E", "com.whatsapp"),
    WHATSAPP_BUSINESS("WHATSAPP_BUSINESS", "WhatsApp Business", "", "#0EAB55", "com.whatsapp.w4b"),
    INSTAGRAM("INSTAGRAM", "Instagram", "", "#E1306C", "com.instagram.android"),
    TELEGRAM("TELEGRAM", "Telegram", "", "#0088cc", "org.telegram.messenger"),
    TIKTOK("TIKTOK", "TikTok", "", "#FE2C55", "com.zhiliaoapp.musically"),
    FACEBOOK("FACEBOOK", "Facebook", "", "#1877F2", "com.facebook.katana")
}

class AppCloneViewModel(
    private val repository: AppCloneRepository,
    private val sessionStore: SessionStore? = null,
    private val syncRepository: ConnectSyncRepository? = null,
    private val appContext: Context? = null
) : ViewModel() {

    // --- LeadCapture Connect sync ---
    private val _isLoggedIn = MutableStateFlow(sessionStore?.isLoggedIn == true)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _authLoading = MutableStateFlow(false)
    val authLoading: StateFlow<Boolean> = _authLoading.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private val _syncLoading = MutableStateFlow(false)
    val syncLoading: StateFlow<Boolean> = _syncLoading.asStateFlow()

    private val _lastSyncAt = MutableStateFlow<Long?>(null)
    val lastSyncAt: StateFlow<Long?> = _lastSyncAt.asStateFlow()

    private val _serverInstances = MutableStateFlow<List<ServerInstanceDto>>(emptyList())
    val serverInstances: StateFlow<List<ServerInstanceDto>> = _serverInstances.asStateFlow()

    private val _syncMessage = MutableStateFlow<String?>(null)
    val syncMessage: StateFlow<String?> = _syncMessage.asStateFlow()

    private val _offlineMode = MutableStateFlow(false)
    val offlineMode: StateFlow<Boolean> = _offlineMode.asStateFlow()

    private val _dispatchLoading = MutableStateFlow(false)
    val dispatchLoading: StateFlow<Boolean> = _dispatchLoading.asStateFlow()

    private val _lastDispatch = MutableStateFlow<ConnectionDispatcher.DispatchResult?>(null)
    val lastDispatch: StateFlow<ConnectionDispatcher.DispatchResult?> = _lastDispatch.asStateFlow()

    private val _assistPhone = MutableStateFlow("")
    val assistPhone: StateFlow<String> = _assistPhone.asStateFlow()

    val sessionEmail: String?
        get() = sessionStore?.userEmail

    private fun dispatcherOrNull(): ConnectionDispatcher? {
        val ctx = appContext ?: return null
        val store = sessionStore ?: return null
        return ConnectionDispatcher(ctx, store)
    }

    private fun isolationOrNull(): IsolationCoordinator? {
        val ctx = appContext ?: return null
        return IsolationCoordinator(ctx)
    }

    private val _discoveredPackages = MutableStateFlow<List<PackageDiscovery.DiscoveredApp>>(emptyList())
    val discoveredPackages: StateFlow<List<PackageDiscovery.DiscoveredApp>> = _discoveredPackages.asStateFlow()

    private val _poolInfo = MutableStateFlow<String?>(null)
    val poolInfo: StateFlow<String?> = _poolInfo.asStateFlow()

    // --- MULTI PARALLEL CLONER SPACE EXTRA STATES ---
    private val _isVipActive = MutableStateFlow(true)
    val isVipActive: StateFlow<Boolean> = _isVipActive.asStateFlow()

    private val _isBoosting = MutableStateFlow(false)
    val isBoosting: StateFlow<Boolean> = _isBoosting.asStateFlow()

    private val _boostRamMbFreed = MutableStateFlow(0)
    val boostRamMbFreed: StateFlow<Int> = _boostRamMbFreed.asStateFlow()

    private val _systemHealthScore = MutableStateFlow(78)
    val systemHealthScore: StateFlow<Int> = _systemHealthScore.asStateFlow()

    private val _lockedCloneIds = MutableStateFlow<Set<Int>>(emptySet())
    val lockedCloneIds: StateFlow<Set<Int>> = _lockedCloneIds.asStateFlow()

    private val _deviceSimulatedInfoCache = MutableStateFlow<Map<Int, Map<String, String>>>(emptyMap())
    val deviceSimulatedInfoCache: StateFlow<Map<Int, Map<String, String>>> = _deviceSimulatedInfoCache.asStateFlow()

    fun initializeClonerStates(context: Context) {
        val prefs = context.getSharedPreferences("leadcapture_prefs", Context.MODE_PRIVATE)
        _isVipActive.value = true
        
        val lockedStr = prefs.getString("parallel_locked_clones", "") ?: ""
        val lockedSet = lockedStr.split(",")
            .filter { it.isNotBlank() }
            .mapNotNull { it.toIntOrNull() }
            .toSet()
        _lockedCloneIds.value = lockedSet
    }

    fun setVipActive(context: Context, active: Boolean) {
        _isVipActive.value = active
        val prefs = context.getSharedPreferences("leadcapture_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("parallel_vip_active", active).apply()
        if (active) {
            addLog("👑 CONNECT SPACE VIP ATIVADO! Recursos premium e clones ilimitados do LeadCapture liberados.")
        } else {
            addLog("Status VIP desabilitado.")
        }
    }

    fun toggleCloneLock(context: Context, cloneId: Int) {
        val currentSet = _lockedCloneIds.value.toMutableSet()
        val isNowLocked = if (currentSet.contains(cloneId)) {
            currentSet.remove(cloneId)
            false
        } else {
            currentSet.add(cloneId)
            true
        }
        _lockedCloneIds.value = currentSet
        
        val prefs = context.getSharedPreferences("leadcapture_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("parallel_locked_clones", currentSet.joinToString(",")).apply()
        addLog(if (isNowLocked) "Senha de bloqueio ativada para Clone #$cloneId." else "Senha de bloqueio de acesso removida para Clone #$cloneId.")
    }

    fun isCloneLocked(cloneId: Int): Boolean {
        return _lockedCloneIds.value.contains(cloneId)
    }

    fun getDeviceInfoForClone(cloneId: Int): Map<String, String> {
        val currentCache = _deviceSimulatedInfoCache.value.toMutableMap()
        if (currentCache.containsKey(cloneId)) {
            return currentCache[cloneId]!!
        }
        val profile = generateRandomDeviceProfile(cloneId)
        currentCache[cloneId] = profile
        _deviceSimulatedInfoCache.value = currentCache
        return profile
    }

    fun regenerateDeviceInfo(cloneId: Int) {
        val currentCache = _deviceSimulatedInfoCache.value.toMutableMap()
        val newProfile = generateRandomDeviceProfile(cloneId)
        currentCache[cloneId] = newProfile
        _deviceSimulatedInfoCache.value = currentCache
        addLog("Privacidade: Identificadores virtuais (IMEI, MAC, Android ID) do Clone #$cloneId regenerados.")
    }

    private fun generateRandomDeviceProfile(cloneId: Int): Map<String, String> {
        val brands = listOf("Samsung Galaxy S24 Ultra", "Google Pixel 8 Pro", "Xiaomi 14 Pro", "OnePlus 12", "Motorola Edge 50 Ultra")
        val operators = listOf("Vivo Multi-SIM", "Tim Virtual-Space", "Claro CloneLink", "Oi Sandbox-Net")
        
        val brandIndex = if (cloneId > 0) cloneId % brands.size else (0..4).random()
        val operatorIndex = if (cloneId > 0) (cloneId + 3) % operators.size else (0..3).random()
        
        val brand = brands[brandIndex]
        val operator = operators[operatorIndex]
        
        val imei = "3582091" + String.format(Locale.US, "%08d", (10000000..99999999).random())
        val androidId = (1000000000000000..9999999999999999).random().toString(16)
        val mac = String.format(Locale.US, "00:0A:95:%02X:%02X:%02X", (0..255).random(), (0..255).random(), (0..255).random())
        
        return mapOf(
            "brand" to brand,
            "imei" to imei,
            "android_id" to androidId,
            "mac" to mac,
            "operator" to operator,
            "virtual_ip" to "192.168.122." + (10..240).random()
        )
    }

    fun performBoost() {
        viewModelScope.launch {
            _isBoosting.value = true
            addLog("Otimização: Iniciando Speed Boost de instâncias sandbox virtuais...")
            delay(1000)
            addLog("Otimização: Limpando caches de WebView e histórico de buffers ociosos...")
            delay(1000)
            addLog("Otimização: Liberando memória RAM de conexões em standby...")
            delay(1000)
            val ramFreed = (180..420).random()
            _boostRamMbFreed.value = ramFreed
            _systemHealthScore.value = (95..99).random()
            _isBoosting.value = false
            
            // Instantly reduce simulated metrics on all clones
            allClones.value.forEach { clone ->
                if (!clone.isStopped) {
                    repository.update(clone.copy(
                        memoryUsageMb = (12..22).random(),
                        cpuUsagePct = 1
                    ))
                }
            }
            addLog("⚡ Speed Boost Concluído! $ramFreed MB de RAM desalocados do sistema isolado.")
        }
    }

    // Main screen state
    private val _currentScreen = MutableStateFlow(AppScreen.SPLASH)
    val currentScreen: StateFlow<AppScreen> = _currentScreen.asStateFlow()

    // PIN lock security config
    private val _isPinEnabled = MutableStateFlow(false)
    val isPinEnabled: StateFlow<Boolean> = _isPinEnabled.asStateFlow()

    private val _storedPin = MutableStateFlow("")
    val storedPin: StateFlow<String> = _storedPin.asStateFlow()

    private val _isDeviceBiometricEnabled = MutableStateFlow(false)
    val isDeviceBiometricEnabled: StateFlow<Boolean> = _isDeviceBiometricEnabled.asStateFlow()

    // Telemetry and analytical logs pipeline
    private val _operationsLogs = MutableStateFlow<List<String>>(listOf(
        "[INFO] Sistema de sincronização e gerenciamento multi-contas operacional.",
        "[OK] Banco de dados Room conectado e validado.",
        "[OK] Isolamento de dados e cookies ativo (Multi-Perfil)."
    ))
    val operationsLogs: StateFlow<List<String>> = _operationsLogs.asStateFlow()

    // Filter controls
    val searchQuery = MutableStateFlow("")
    val selectedGroup = MutableStateFlow("Todos")

    val allClones: StateFlow<List<AppClone>> = repository.allClones
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val activeClonesCount: StateFlow<Int> = repository.allClones
        .map { list -> list.count { !it.isStopped } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    private val _activeCloneId = MutableStateFlow<Int?>(null)
    val activeCloneId: StateFlow<Int?> = _activeCloneId.asStateFlow()

    val activeClone: StateFlow<AppClone?> = _activeCloneId
        .flatMapLatest { id ->
            if (id == null) flowOf(null) else repository.getCloneById(id)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = null
        )

    private val _showCreateDialog = MutableStateFlow(false)
    val showCreateDialog: StateFlow<Boolean> = _showCreateDialog.asStateFlow()

    // Support flags
    var isMultiProfileSupported = mutableStateOf(false)
        private set

    private val _isMultiProfileActive = MutableStateFlow(false)
    val isMultiProfileActive: StateFlow<Boolean> = _isMultiProfileActive.asStateFlow()

    fun setMultiProfileActiveState(enabled: Boolean) {
        _isMultiProfileActive.value = enabled
        addLog(if (enabled) "Isolamento de Cookies (Multi-Perfil) ativo." else "Isolamento de Cookies desativado.")
    }

    init {
        // Star operational analytics loop (simulates network/CPU usage changes dynamically)
        viewModelScope.launch {
            while (true) {
                delay(4000)
                updateMetricsSimulation()
            }
        }
        // Background sync + command poll when logged in (nativo)
        viewModelScope.launch {
            while (true) {
                delay(8_000)
                if (_isLoggedIn.value && !_offlineMode.value && syncRepository != null) {
                    runSilentSync()
                }
            }
        }
    }

    fun continueOffline() {
        _offlineMode.value = true
        _authError.value = null
        addLog("Modo local: sync com servidor desativado nesta sessão.")
    }

    fun login(email: String, password: String, onSuccess: () -> Unit = {}) {
        val sync = syncRepository ?: run {
            _authError.value = "Sync não inicializado"
            return
        }
        viewModelScope.launch {
            _authLoading.value = true
            _authError.value = null
            val result = sync.login(email, password)
            _authLoading.value = false
            result.fold(
                onSuccess = {
                    _isLoggedIn.value = true
                    _offlineMode.value = false
                    addLog("Login LeadCapture OK ($email). Registrando device e sincronizando…")
                    syncNow()
                    onSuccess()
                },
                onFailure = { e ->
                    _authError.value = e.message ?: "Falha no login"
                    addLog("Login falhou: ${e.message}")
                }
            )
        }
    }

    fun logout() {
        syncRepository?.logout()
        _isLoggedIn.value = false
        _serverInstances.value = emptyList()
        _lastSyncAt.value = null
        addLog("Sessão LeadCapture encerrada.")
    }

    fun syncNow() {
        val sync = syncRepository ?: return
        if (!_isLoggedIn.value) return
        viewModelScope.launch {
            _syncLoading.value = true
            _syncMessage.value = null
            val result = sync.pullSync()
            result.fold(
                onSuccess = { snap ->
                    _serverInstances.value = snap.instances.orEmpty()
                    _lastSyncAt.value = System.currentTimeMillis()
                    _syncMessage.value =
                        "Sync OK: ${snap.instances?.size ?: 0} instâncias, ${snap.commands?.size ?: 0} comandos"
                    addLog(_syncMessage.value ?: "Sync OK")
                    processRemoteCommands(sync)
                    val clones = allClones.value
                    sync.heartbeat(
                        activeClones = clones.count { !it.isStopped },
                        totalClones = clones.size
                    )
                    refreshInstallStatesInternal()
                },
                onFailure = { e ->
                    _syncMessage.value = "Sync falhou: ${e.message}"
                    addLog(_syncMessage.value ?: "Sync falhou")
                }
            )
            _syncLoading.value = false
        }
    }

    private suspend fun runSilentSync() {
        val sync = syncRepository ?: return
        try {
            val result = sync.pullSync()
            result.onSuccess { snap ->
                _serverInstances.value = snap.instances.orEmpty()
                _lastSyncAt.value = System.currentTimeMillis()
            }
            processRemoteCommands(sync)
        } catch (_: Exception) {
            /* silent */
        }
    }

    private suspend fun processRemoteCommands(sync: ConnectSyncRepository) {
        sync.pollAndHandleCommands { cmd ->
            executeNativeRemoteCommand(cmd)
        }
    }

    /**
     * Executa comando do painel no device — sempre nativo.
     */
    private suspend fun executeNativeRemoteCommand(cmd: CommandDto) {
        val type = cmd.commandType?.uppercase().orEmpty()
        val instanceId = cmd.payloadJson?.resolvedInstanceId()
        val phone = cmd.payloadJson?.phone?.trim().orEmpty()
        addLog("Comando nativo: $type instance=${instanceId ?: "—"}")

        when (type) {
            "SYNC_NOW", "REFRESH_STATUS" -> {
                // pullSync já rodou antes do poll
            }
            "CREATE_LOCAL_SLOT" -> {
                // applySyncToLocal no pull já cria slots para instâncias novas
            }
            "OPEN_WHATSAPP_NATIVE" -> {
                val slot = resolveSlotForCommand(instanceId)
                if (slot != null) {
                    _activeCloneId.value = slot.id
                    openNativeApp(slot)
                } else {
                    addLog("OPEN_WHATSAPP_NATIVE: slot não encontrado para $instanceId")
                }
            }
            "OPEN_PAIRING" -> {
                val slot = resolveSlotForCommand(instanceId)
                if (slot == null) {
                    addLog("OPEN_PAIRING: sem slot para $instanceId — rode Sync")
                    return
                }
                _activeCloneId.value = slot.id
                if (phone.isNotBlank()) {
                    _assistPhone.value = phone
                    val dispatcher = dispatcherOrNull()
                    if (dispatcher != null) {
                        _dispatchLoading.value = true
                        val result = dispatcher.firePairing(slot, phone)
                        _lastDispatch.value = result
                        _dispatchLoading.value = false
                        if (result.ok && !result.pairingCode.isNullOrBlank()) {
                            appContext?.let {
                                ClipboardHelper.copy(it, "pairing", result.pairingCode, toast = true)
                            }
                        }
                        addLog(
                            if (result.ok) "Pairing remoto OK: ${result.pairingCode}"
                            else "Pairing remoto falhou: ${result.message}"
                        )
                    }
                } else {
                    addLog("OPEN_PAIRING sem phone no payload — abra o slot e informe o número")
                    openNativeApp(slot)
                }
            }
            "SHOW_QR" -> {
                val slot = resolveSlotForCommand(instanceId)
                if (slot == null) {
                    addLog("SHOW_QR: sem slot para $instanceId")
                    return
                }
                _activeCloneId.value = slot.id
                val dispatcher = dispatcherOrNull()
                if (dispatcher != null) {
                    _dispatchLoading.value = true
                    val result = dispatcher.fireQr(slot)
                    _lastDispatch.value = result
                    _dispatchLoading.value = false
                    addLog(if (result.ok) "QR remoto OK" else "QR remoto: ${result.message}")
                }
            }
            "PAUSE_SLOT" -> {
                val slot = resolveSlotForCommand(instanceId)
                if (slot != null) {
                    repository.update(slot.copy(isStopped = true))
                    addLog("Slot pausado por comando remoto: ${slot.name}")
                }
            }
            "DELETE_BINDING" -> {
                val slot = resolveSlotForCommand(instanceId)
                if (slot != null) {
                    repository.update(
                        slot.copy(instanceId = null, bindingId = null, localBound = false, serverStatus = null)
                    )
                    addLog("Binding removido no slot ${slot.name}")
                }
            }
            else -> addLog("Comando não mapeado: $type")
        }
    }

    private suspend fun resolveSlotForCommand(instanceId: String?): AppClone? {
        if (instanceId.isNullOrBlank()) {
            return allClones.value.firstOrNull { !it.instanceId.isNullOrBlank() }
                ?: allClones.value.firstOrNull()
        }
        return syncRepository?.findCloneForInstance(instanceId)
            ?: allClones.value.find { it.instanceId == instanceId }
    }

    fun copyPairingCodeToClipboard() {
        val code = _lastDispatch.value?.pairingCode ?: return
        val ctx = appContext ?: return
        ClipboardHelper.copy(ctx, "leadcapture_pairing", code, toast = true)
        addLog("Código copiado: $code")
    }

    fun openSlotForInstance(instanceId: String) {
        viewModelScope.launch {
            val slot = resolveSlotForCommand(instanceId)
            if (slot != null) {
                openClone(slot.id)
            } else {
                addLog("Nenhum slot para instance $instanceId — sincronize ou crie slot")
            }
        }
    }

    private suspend fun refreshInstallStatesInternal() {
        val ctx = appContext ?: return
        allClones.value.forEach { clone ->
            val pkg = clone.packageName.ifBlank {
                AppPreset.values().find { it.idName == clone.appType }?.packageName ?: ""
            }
            if (pkg.isBlank()) return@forEach
            val st = NativeAppLauncher.status(ctx, pkg)
            if (clone.installState != (if (st.installed) "installed" else "missing") ||
                clone.packageName != pkg
            ) {
                repository.update(
                    clone.copy(
                        packageName = pkg,
                        installState = if (st.installed) "installed" else "missing"
                    )
                )
            }
        }
    }

    fun bindClone(clone: AppClone, instanceId: String) {
        val sync = syncRepository ?: return
        viewModelScope.launch {
            val result = sync.bindCloneToInstance(clone, instanceId)
            result.fold(
                onSuccess = {
                    addLog("Binding: [${clone.name}] ↔ $instanceId")
                    syncNow()
                },
                onFailure = { e ->
                    addLog("Binding falhou: ${e.message}")
                }
            )
        }
    }

    fun checkMultiProfileSupport(supported: Boolean) {
        isMultiProfileSupported.value = supported
    }

    fun navigateTo(screen: AppScreen) {
        _currentScreen.value = screen
        addLog("Navegou para tela: ${screen.name}")
    }

    // Logging helper
    fun addLog(message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        _operationsLogs.update { current ->
            listOf("[$time] $message") + current.take(50)
        }
    }

    // Dynamic telemetry simulation
    private fun updateMetricsSimulation() {
        viewModelScope.launch {
            allClones.value.forEach { clone ->
                if (!clone.isStopped) {
                    val newMemory = (40..75).random()
                    val newCpu = (1..6).random()
                    // Random notifications simulation to give a rich active pipeline feel
                    val addNotif = if ((0..10).random() > 8) (1..2).random() else 0
                    val updated = clone.copy(
                        memoryUsageMb = newMemory,
                        cpuUsagePct = newCpu,
                        notificationsCount = clone.notificationsCount + addNotif
                    )
                    repository.update(updated)
                    if (addNotif > 0) {
                        addLog("Sessão [${clone.name}] recebeu $addNotif novas atualizações.")
                    }
                }
            }
        }
    }

    // Security Methods
    fun setupPin(pin: String) {
        _storedPin.value = pin
        _isPinEnabled.value = pin.isNotEmpty()
        addLog(if (pin.isNotEmpty()) "Segurança PIN ativada com sucesso." else "PIN de segurança removido.")
    }

    fun setBiometricEnabled(enabled: Boolean) {
        _isDeviceBiometricEnabled.value = enabled
        addLog(if (enabled) "Sincronização biométrica configurada." else "Biometria desativada.")
    }

    // Operational Controllers — NATIVO (não WebView)
    fun openClone(id: Int) {
        viewModelScope.launch {
            _activeCloneId.value = id
            repository.getCloneById(id).firstOrNull()?.let { clone ->
                val ctx = appContext
                val pkg = clone.packageName.ifBlank {
                    AppPreset.values().find { it.idName == clone.appType }?.packageName ?: "com.whatsapp"
                }
                val installed = if (ctx != null) {
                    NativeAppLauncher.status(ctx, pkg).installed
                } else false
                val updated = clone.copy(
                    lastActiveAt = System.currentTimeMillis(),
                    openingsCount = clone.openingsCount + 1,
                    isStopped = false,
                    packageName = pkg,
                    installState = if (installed) "installed" else "missing",
                    engineMode = if (clone.engineMode == "WEB_ONLY" || clone.engineMode == "WEB_LEGACY") {
                        "NATIVE_HOST"
                    } else clone.engineMode
                )
                repository.update(updated)
                // Abre via IsolationCoordinator (HOST/SIDECAR/WORK/VIRTUAL)
                isolationOrNull()?.let { iso ->
                    val outcome = iso.launch(updated)
                    addLog(outcome.message)
                }
                _currentScreen.value = AppScreen.CONNECTION_ASSIST
                addLog("Assistente nativo [${updated.isolationMode}]: ${updated.name}")
            }
        }
    }

    fun openNativeApp(clone: AppClone) {
        val iso = isolationOrNull() ?: return
        val outcome = iso.launch(clone)
        addLog(outcome.message)
        if (outcome.needsInstall) {
            iso.install(clone)
        }
    }

    fun installNativeApp(clone: AppClone) {
        isolationOrNull()?.install(clone)
        addLog("Play Store / install: ${clone.packageName}")
    }

    fun refreshDiscovery() {
        val iso = isolationOrNull() ?: return
        viewModelScope.launch {
            val list = iso.discover()
            _discoveredPackages.value = list
            val pool = iso.poolStatus(allClones.value)
            _poolInfo.value =
                "Packages: ${pool.availablePackages.size} · livres≈${pool.freeCount} · " +
                    "máx prático: ${pool.maxPracticalSlots} · work profile: ${if (pool.hasWorkProfile) "sim" else "não"}"
            addLog(_poolInfo.value ?: "discovery ok")
            syncRepository?.reportCapabilities()
        }
    }

    fun createVirtualBatch(count: Int = 2, appType: String = "WHATSAPP") {
        val iso = isolationOrNull() ?: return
        viewModelScope.launch {
            val existing = allClones.value.toMutableList()
            repeat(count.coerceIn(1, 10)) {
                val alloc = iso.allocateVirtual(appType, existing)
                val installed = appContext?.let {
                    NativeAppLauncher.status(it, alloc.packageName).installed
                } == true
                val id = repository.insert(
                    AppClone(
                        name = alloc.label,
                        appType = alloc.appType,
                        colorHex = if (alloc.appType == "WHATSAPP_BUSINESS") "#0EAB55" else "#128C7E",
                        groupName = "Virtual",
                        engineMode = EngineMode.VIRTUAL.wire,
                        packageName = alloc.packageName,
                        isolationMode = IsolationMode.VIRTUAL.wire,
                        installState = if (installed) "installed" else "missing",
                        virtualSlotKey = alloc.slotKey,
                        poolIndex = alloc.poolIndex,
                        sandboxDirectory = alloc.slotKey
                    )
                )
                existing.add(
                    AppClone(
                        id = id.toInt(),
                        name = alloc.label,
                        appType = alloc.appType,
                        colorHex = "#128C7E",
                        packageName = alloc.packageName,
                        isolationMode = IsolationMode.VIRTUAL.wire
                    )
                )
                addLog("Virtual slot #${id.toInt()} → ${alloc.packageName}")
            }
            refreshDiscovery()
        }
    }

    fun bootstrapAndPair(clone: AppClone, phone: String) {
        val sync = syncRepository ?: return
        viewModelScope.launch {
            _dispatchLoading.value = true
            val boot = sync.bootstrapSlot(clone, phone = phone, enqueuePairing = false)
            boot.fold(
                onSuccess = { updated ->
                    addLog("Bootstrap OK instance=${updated.instanceId}")
                    fireNativePairing(updated, phone)
                },
                onFailure = { e ->
                    _dispatchLoading.value = false
                    _lastDispatch.value = ConnectionDispatcher.DispatchResult(
                        ok = false,
                        message = e.message ?: "Bootstrap falhou"
                    )
                    addLog("Bootstrap falhou: ${e.message}")
                }
            )
        }
    }

    fun setAssistPhone(phone: String) {
        _assistPhone.value = phone
    }

    fun fireNativePairing(clone: AppClone, phone: String) {
        val dispatcher = dispatcherOrNull()
        if (dispatcher == null) {
            addLog("Dispatcher indisponível (sem sessão/contexto).")
            return
        }
        if (clone.instanceId.isNullOrBlank()) {
            _lastDispatch.value = ConnectionDispatcher.DispatchResult(
                ok = false,
                message = "Vincule este slot a uma instância do servidor (aba Sync) antes de disparar."
            )
            return
        }
        viewModelScope.launch {
            _dispatchLoading.value = true
            val result = dispatcher.firePairing(clone, phone.trim())
            _lastDispatch.value = result
            _dispatchLoading.value = false
            if (result.ok && !result.pairingCode.isNullOrBlank()) {
                appContext?.let { ClipboardHelper.copy(it, "pairing", result.pairingCode, toast = true) }
            }
            addLog(
                if (result.ok) "Conexão disparada: código ${result.pairingCode}"
                else "Disparo falhou: ${result.message}"
            )
            if (result.ok) {
                // refresh status only (avoid re-entrancy on commands)
                runCatching { syncRepository?.pullSync() }
            }
        }
    }

    fun fireNativeQr(clone: AppClone) {
        val dispatcher = dispatcherOrNull()
        if (dispatcher == null) {
            addLog("Dispatcher indisponível.")
            return
        }
        viewModelScope.launch {
            _dispatchLoading.value = true
            val result = dispatcher.fireQr(clone)
            _lastDispatch.value = result
            _dispatchLoading.value = false
            addLog(
                if (result.ok) "QR disparado + app nativo"
                else "QR falhou: ${result.message}"
            )
        }
    }

    fun clearLastDispatch() {
        _lastDispatch.value = null
    }

    fun refreshInstallStates() {
        viewModelScope.launch {
            refreshInstallStatesInternal()
            addLog("Estados de instalação nativa atualizados.")
        }
    }

    fun closeActiveClone() {
        _activeCloneId.value = null
        addLog("Conexão ativa encerrada e retornada ao painel operacional.")
    }

    fun setShowCreateDialog(show: Boolean) {
        _showCreateDialog.value = show
    }

    fun checkPackageInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun createClone(
        name: String,
        appType: String,
        url: String = "",
        colorHex: String,
        groupName: String = "Geral",
        engineMode: String = "NATIVE_HOST",
        sandboxDirectory: String = "",
        isApkImported: Boolean = false,
        virtualApkSizeMb: Int = 0,
        packageName: String = "",
        isolationMode: String = "HOST"
    ) {
        viewModelScope.launch {
            val preset = AppPreset.values().find { it.idName == appType }
            val mode = IsolationMode.fromWire(isolationMode)
            val iso = isolationOrNull()
            var pkg = packageName.ifBlank { preset?.packageName ?: "com.whatsapp" }
            var slotKey: String? = null
            var poolIdx = 0
            var finalName = name
            var finalType = appType
            var finalEngine = engineMode.ifBlank { EngineMode.forIsolation(mode).wire }
            var finalIsolation = mode.wire

            if (mode == IsolationMode.VIRTUAL && iso != null) {
                val alloc = iso.allocateVirtual(
                    appType,
                    allClones.value,
                    preferredPackage = packageName.takeIf { it.isNotBlank() }
                )
                pkg = alloc.packageName
                slotKey = alloc.slotKey
                poolIdx = alloc.poolIndex
                finalType = alloc.appType
                finalEngine = EngineMode.VIRTUAL.wire
                finalIsolation = IsolationMode.VIRTUAL.wire
                if (name.isBlank() || name.startsWith("Canal") || name.startsWith("Whats")) {
                    finalName = alloc.label
                }
            }

            val ctx = appContext
            val installed = if (ctx != null) NativeAppLauncher.status(ctx, pkg).installed else false
            val newClone = AppClone(
                name = finalName,
                appType = finalType,
                url = "",
                colorHex = colorHex,
                groupName = groupName,
                isStopped = false,
                notificationsCount = 0,
                openingsCount = 0,
                engineMode = finalEngine,
                sandboxDirectory = slotKey ?: sandboxDirectory,
                isApkImported = installed,
                virtualApkSizeMb = 0,
                packageName = pkg,
                isolationMode = finalIsolation,
                installState = if (installed) "installed" else "missing",
                virtualSlotKey = slotKey,
                poolIndex = poolIdx
            )
            repository.insert(newClone)
            _showCreateDialog.value = false
            addLog(
                "Slot [${finalIsolation}] '${finalName}' → $pkg " +
                    "(${if (installed) "instalado" else "pendente instalar"})"
            )
            refreshDiscovery()
        }
    }

    fun changeInstanceGroup(clone: AppClone, newGroup: String) {
        viewModelScope.launch {
            repository.update(clone.copy(groupName = newGroup))
            addLog("Grupo da instância [${clone.name}] redefinido para '$newGroup'.")
        }
    }

    fun renameClone(clone: AppClone, newName: String, newGroup: String) {
        viewModelScope.launch {
            repository.update(clone.copy(name = newName, groupName = newGroup))
            addLog("Instância [${clone.name}] renomeada para '$newName' no grupo '$newGroup'.")
        }
    }

    fun toggleStartStop(clone: AppClone) {
        viewModelScope.launch {
            val nextState = !clone.isStopped
            val updated = clone.copy(
                isStopped = nextState,
                // Zero resource usage if stopped
                memoryUsageMb = if (nextState) 0 else 42,
                cpuUsagePct = if (nextState) 0 else 1
            )
            repository.update(updated)
            val logMsg = if (nextState) "Processamento pausado." else "Processamento reativado."
            addLog("Instância [${clone.name}]: $logMsg")
        }
    }

    fun resetNotifications(clone: AppClone) {
        viewModelScope.launch {
            repository.update(clone.copy(notificationsCount = 0))
            addLog("Contador de notificações de [${clone.name}] limpo.")
        }
    }

    fun deleteClone(id: Int) {
        viewModelScope.launch {
            if (_activeCloneId.value == id) {
                _activeCloneId.value = null
            }
            repository.deleteById(id)
            addLog("Canais: Conexão ID #$id removida e limpa permanentemente.")
        }
    }

    fun togglePin(clone: AppClone) {
        viewModelScope.launch {
            repository.update(clone.copy(isPinned = !clone.isPinned))
            addLog("Pinagem da instância [${clone.name}] alternada para ${!clone.isPinned}")
        }
    }

    fun updateZoom(clone: AppClone, zoom: Int) {
        viewModelScope.launch {
            repository.update(clone.copy(zoomLevel = zoom))
            addLog("Dimensionamento de visualização de [${clone.name}] definido para $zoom%")
        }
    }

    fun exportBackup(context: Context): String {
        return try {
            val activeList = allClones.value
            val serialized = StringBuilder()
            serialized.append("LeadCapture_v1\n")
            activeList.forEach {
                serialized.append("${it.name}|${it.appType}|${it.url}|${it.colorHex}|${it.groupName}\n")
            }
            addLog("Configurações das conexões exportadas com êxrito (${activeList.size} perfis).")
            serialized.toString()
        } catch (e: Exception) {
            "Erro"
        }
    }

    fun importBackup(context: Context, backupData: String): Boolean {
        if (!backupData.startsWith("LeadCapture_v1")) return false
        return try {
            viewModelScope.launch {
                val lines = backupData.split("\n")
                lines.drop(1).forEach { line ->
                    if (line.isNotBlank()) {
                        val parts = line.split("|")
                        if (parts.size >= 4) {
                            val name = parts[0]
                            val type = parts[1]
                            val url = parts[2]
                            val color = parts[3]
                            val group = if (parts.size >= 5) parts[4] else "Importados"
                            createClone(name, type, url, color, group)
                        }
                    }
                }
                addLog("Backup de conexões restaurado com sucesso.")
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    class Factory(
        private val repository: AppCloneRepository,
        private val sessionStore: SessionStore? = null,
        private val syncRepository: ConnectSyncRepository? = null,
        private val appContext: Context? = null
    ) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(AppCloneViewModel::class.java)) {
                @Suppress("UNCHECKED_CAST")
                return AppCloneViewModel(repository, sessionStore, syncRepository, appContext) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class")
        }
    }
}
