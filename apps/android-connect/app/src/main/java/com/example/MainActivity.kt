package com.example

import android.os.Bundle
import android.util.Log
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebView
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Date
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.webkit.WebViewFeature
import com.example.auth.SessionStore
import com.example.data.AppClone
import com.example.data.AppDatabase
import com.example.data.AppCloneRepository
import com.example.sync.ConnectSyncRepository
import com.example.ui.AppCloneViewModel
import com.example.ui.AppScreen
import com.example.ui.components.*
import com.example.ui.theme.MyApplicationTheme
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val sharedPrefs = getSharedPreferences("leadcapture_prefs", MODE_PRIVATE)
        val sessionStore = SessionStore(applicationContext)
        
        // Setup global uncaught exception guard to capture runtime crashes
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("CRITICAL_CRASH", "Uncaught exception on thread ${thread.name}", throwable)
            val stack = Log.getStackTraceString(throwable)
            sharedPrefs.edit()
                .putBoolean("has_crash", true)
                .putString("crash_message", throwable.message ?: "NullPointerException")
                .putString("crash_stacktrace", stack)
                .commit()
            
            android.os.Process.killProcess(android.os.Process.myPid())
            java.lang.System.exit(10)
        }

        val hasCrash = sharedPrefs.getBoolean("has_crash", false)
        val crashMessage = sharedPrefs.getString("crash_message", "") ?: ""
        val crashStacktrace = sharedPrefs.getString("crash_stacktrace", "") ?: ""

        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        // Safe Database & Repository Initialization
        var database: AppDatabase? = null
        var repository: AppCloneRepository? = null
        var syncRepository: ConnectSyncRepository? = null
        if (!hasCrash) {
            try {
                database = AppDatabase.getDatabase(applicationContext)
                repository = AppCloneRepository(database.appCloneDao())
                syncRepository = ConnectSyncRepository(applicationContext, sessionStore, repository)
            } catch (e: Throwable) {
                Log.e("MainActivity", "Database init error", e)
                val stack = Log.getStackTraceString(e)
                sharedPrefs.edit()
                    .putBoolean("has_crash", true)
                    .putString("crash_message", "Erro ao inicializar banco de dados Room: ${e.message}")
                    .putString("crash_stacktrace", stack)
                    .commit()
                recreate()
                return
            }
        }
        
        val isOnboardingDoneInitial = sharedPrefs.getBoolean("onboarding_done", false)
        val isMultiProfileActiveInitial = sharedPrefs.getBoolean("multi_profile_active", false)
        val skipLoginInitial = sharedPrefs.getBoolean("skip_login_offline", false)

        setContent {
            MyApplicationTheme {
                if (hasCrash) {
                    CrashRecoveryScreen(
                        message = crashMessage,
                        stacktrace = crashStacktrace,
                        onClearCrash = {
                            sharedPrefs.edit().putBoolean("has_crash", false).commit()
                            recreate()
                        },
                        onSafeMode = {
                            sharedPrefs.edit()
                                .putBoolean("has_crash", false)
                                .putBoolean("multi_profile_active", false)
                                .putBoolean("onboarding_done", true)
                                .commit()
                            recreate()
                        },
                        onHardReset = {
                            try {
                                deleteDatabase("clones_database")
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                            sharedPrefs.edit().clear().commit()
                            sessionStore.clearSession()
                            recreate()
                        }
                    )
                } else {
                    val appViewModel: AppCloneViewModel = viewModel(
                        factory = AppCloneViewModel.Factory(
                            repository!!,
                            sessionStore,
                            syncRepository,
                            applicationContext
                        )
                    )

                    // Detect multi-profile webview capability and load settings
                    LaunchedEffect(Unit) {
                        try {
                            appViewModel.initializeClonerStates(applicationContext)
                            val isSupported = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
                            appViewModel.checkMultiProfileSupport(isSupported)
                            appViewModel.setMultiProfileActiveState(isMultiProfileActiveInitial)
                            if (skipLoginInitial && !sessionStore.isLoggedIn) {
                                appViewModel.continueOffline()
                            }
                            if (sessionStore.isLoggedIn) {
                                appViewModel.syncNow()
                            }
                            appViewModel.refreshInstallStates()
                            appViewModel.refreshDiscovery()
                            Log.d("MainActivity", "WebView Multi-Profile Supported: $isSupported, Configured Active: $isMultiProfileActiveInitial")
                        } catch (e: Throwable) {
                            Log.e("MainActivity", "Error checking webview multi-profile support", e)
                            appViewModel.checkMultiProfileSupport(false)
                            appViewModel.setMultiProfileActiveState(false)
                        }
                    }

                    var isOnboardingDone by remember { mutableStateOf(isOnboardingDoneInitial) }
                    val isLoggedIn by appViewModel.isLoggedIn.collectAsStateWithLifecycle()
                    val offlineMode by appViewModel.offlineMode.collectAsStateWithLifecycle()
                    val authLoading by appViewModel.authLoading.collectAsStateWithLifecycle()
                    val authError by appViewModel.authError.collectAsStateWithLifecycle()

                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = MaterialTheme.colorScheme.background
                    ) {
                        if (!isLoggedIn && !offlineMode) {
                            LoginScreen(
                                isLoading = authLoading,
                                errorMessage = authError,
                                onLogin = { email, password ->
                                    appViewModel.login(email, password)
                                },
                                onContinueOffline = {
                                    sharedPrefs.edit().putBoolean("skip_login_offline", true).apply()
                                    appViewModel.continueOffline()
                                }
                            )
                        } else {
                            AppNavigationWrapper(
                                viewModel = appViewModel,
                                isOnboardingDone = isOnboardingDone,
                                onOnboardingComplete = {
                                    isOnboardingDone = true
                                    sharedPrefs.edit().putBoolean("onboarding_done", true).commit()
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CrashRecoveryScreen(
    message: String,
    stacktrace: String,
    onClearCrash: () -> Unit,
    onSafeMode: () -> Unit,
    onHardReset: () -> Unit
) {
    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
                .padding(innerPadding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(24.dp))
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .background(Color(0xFFEF4444).copy(alpha = 0.1f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = "Alerta",
                        tint = Color(0xFFEF4444),
                        modifier = Modifier.size(32.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Recuperação do Sistema",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = "O aplicativo fechou inesperadamente no último acesso. Isso pode ocorrer por incompatibilidade de WebView, permissões ausentes ou restrições do sistema.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )

                Spacer(modifier = Modifier.height(24.dp))

                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .padding(bottom = 16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    border = BorderStroke(1.dp, Color(0xFFEF4444).copy(alpha = 0.2f))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "DETALHES DO ERRO:",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFFF1F5F9)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFFEF4444)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f)
                                .background(Color(0xFF0F172A), RoundedCornerShape(4.dp))
                                .border(1.dp, Color(0xFF334155), RoundedCornerShape(4.dp))
                                .padding(8.dp)
                        ) {
                            LazyColumn(modifier = Modifier.fillMaxSize()) {
                                item {
                                    Text(
                                        text = stacktrace,
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onSafeMode,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFF59E0B),
                        contentColor = Color(0xFF0F172A)
                    ),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Icon(imageVector = Icons.Default.Build, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Reiniciar Configurações (Modo Seguro)", fontWeight = FontWeight.Bold)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onClearCrash,
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color.White
                        ),
                        border = BorderStroke(1.dp, Color(0xFF475569)),
                        modifier = Modifier.weight(1f).height(48.dp)
                    ) {
                        Text("Iniciar Regular", fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = onHardReset,
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFEF4444),
                            contentColor = Color.White
                        ),
                        modifier = Modifier.weight(1f).height(48.dp)
                    ) {
                        Text("Reset Total", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun AppNavigationWrapper(
    viewModel: AppCloneViewModel,
    isOnboardingDone: Boolean,
    onOnboardingComplete: () -> Unit
) {
    val activeClone by viewModel.activeClone.collectAsStateWithLifecycle()
    val isPinActive by viewModel.isPinEnabled.collectAsStateWithLifecycle()
    val screenState by viewModel.currentScreen.collectAsStateWithLifecycle()
    val isMultiProfileActive by viewModel.isMultiProfileActive.collectAsStateWithLifecycle()

    // Control initial bypass of Splash and Lock Screen
    var isUnlocked by remember { mutableStateOf(false) }

    // Nativo: slot ativo = assistente de conexão (sem WebView)
    if (activeClone != null) {
        NativeConnectionAssistScreen(
            viewModel = viewModel,
            clone = activeClone!!,
            onBack = {
                viewModel.closeActiveClone()
                viewModel.navigateTo(AppScreen.DASHBOARD)
            }
        )
    } else {
        AnimatedContent(
            targetState = screenState,
            label = "ScreenRouting"
        ) { targetScreen ->
            when (targetScreen) {
                AppScreen.SPLASH -> {
                    SplashView(
                        onFinished = {
                            if (isPinActive && !isUnlocked) {
                                viewModel.navigateTo(AppScreen.PIN_LOCK)
                            } else if (!isOnboardingDone) {
                                viewModel.navigateTo(AppScreen.ONBOARDING)
                            } else {
                                viewModel.navigateTo(AppScreen.DASHBOARD)
                            }
                        }
                    )
                }
                AppScreen.ONBOARDING -> {
                    OnboardingView(
                        onStartClicked = {
                            onOnboardingComplete()
                            viewModel.navigateTo(AppScreen.DASHBOARD)
                        }
                    )
                }
                AppScreen.PIN_LOCK -> {
                    PinLockView(
                        viewModel = viewModel,
                        onUnlocked = {
                            isUnlocked = true
                            viewModel.navigateTo(AppScreen.DASHBOARD)
                        }
                    )
                }
                AppScreen.DASHBOARD, AppScreen.CONNECTION_ASSIST -> {
                    DashboardScreen(viewModel = viewModel)
                }
                AppScreen.CREATE_CLONE -> {
                    CreateCloneScreen(
                        viewModel = viewModel,
                        onBack = { viewModel.navigateTo(AppScreen.DASHBOARD) }
                    )
                }
                else -> DashboardScreen(viewModel = viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NativeConnectionAssistScreen(
    viewModel: AppCloneViewModel,
    clone: AppClone,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val dispatchLoading by viewModel.dispatchLoading.collectAsStateWithLifecycle()
    val lastDispatch by viewModel.lastDispatch.collectAsStateWithLifecycle()
    val phone by viewModel.assistPhone.collectAsStateWithLifecycle()
    val isLoggedIn by viewModel.isLoggedIn.collectAsStateWithLifecycle()
    val accent = Color(android.graphics.Color.parseColor(clone.colorHex))
    val pkg = clone.packageName.ifBlank { "com.whatsapp" }
    val installed = remember(clone.installState, pkg) {
        clone.installState == "installed" ||
            try {
                context.packageManager.getPackageInfo(pkg, 0)
                true
            } catch (_: Exception) {
                false
            }
    }

    BackHandler(onBack = onBack)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = clone.name,
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = pkg,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        contentWindowInsets = WindowInsets.safeDrawing
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = accent.copy(alpha = 0.08f)
                ),
                border = BorderStroke(1.dp, accent.copy(alpha = 0.35f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Conexão nativa (sem web)",
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.titleSmall
                    )
                    Text(
                        text = "O LeadCapture gera o vínculo no servidor (Baileys). " +
                            "Você confirma no app oficial instalado neste slot.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f)
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(8.dp)
                                .background(if (installed) Color(0xFF0EAB55) else Color(0xFFEF4444), CircleShape)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = if (installed) "App instalado no aparelho" else "App ainda não instalado",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    if (!clone.instanceId.isNullOrBlank()) {
                        Text(
                            text = "Instância: ${clone.instanceId} · status: ${clone.serverStatus ?: "—"}",
                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                        )
                    } else {
                        Text(
                            text = "Sem instance_id — vincule na aba Sync antes de disparar pairing.",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFFF59E0B)
                        )
                    }
                }
            }

            if (!installed) {
                Button(
                    onClick = { viewModel.installNativeApp(clone) },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Instalar na Play Store", fontWeight = FontWeight.Bold)
                }
            } else {
                OutlinedButton(
                    onClick = { viewModel.openNativeApp(clone) },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Abrir app nativo", fontWeight = FontWeight.Bold)
                }
            }

            Text(
                text = "DISPARAR CONEXÃO (servidor → este app)",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp
                ),
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
            )

            OutlinedTextField(
                value = phone,
                onValueChange = { viewModel.setAssistPhone(it) },
                label = { Text("Celular com DDD (ex. 85996437477)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            if (clone.instanceId.isNullOrBlank()) {
                Button(
                    onClick = { viewModel.bootstrapAndPair(clone, phone) },
                    enabled = !dispatchLoading && phone.length >= 10 && isLoggedIn,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = accent)
                ) {
                    if (dispatchLoading) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                    } else {
                        Text("Criar instância + disparar pairing", fontWeight = FontWeight.Black)
                    }
                }
                Text(
                    text = "Cria sessão no LeadCapture, vincula este slot e abre o app nativo com o código.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                )
            } else {
                Button(
                    onClick = { viewModel.fireNativePairing(clone, phone) },
                    enabled = !dispatchLoading && phone.length >= 10,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = accent)
                ) {
                    if (dispatchLoading) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                    } else {
                        Text("Disparar código de pareamento", fontWeight = FontWeight.Black)
                    }
                }
            }

            OutlinedButton(
                onClick = { viewModel.fireNativeQr(clone) },
                enabled = !dispatchLoading && !clone.instanceId.isNullOrBlank(),
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("Disparar QR (escanear no app nativo)")
            }

            Text(
                text = "Isolamento: ${clone.isolationMode} · engine: ${clone.engineMode} · package: $pkg",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
            )

            lastDispatch?.let { result ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (result.ok) Color(0xFF0EAB55).copy(alpha = 0.1f)
                        else Color(0xFFEF4444).copy(alpha = 0.1f)
                    ),
                    border = BorderStroke(
                        1.dp,
                        if (result.ok) Color(0xFF0EAB55) else Color(0xFFEF4444)
                    )
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = result.message,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium
                        )
                        result.pairingCode?.let { code ->
                            Text(
                                text = code.chunked(4).joinToString("-"),
                                style = MaterialTheme.typography.headlineMedium.copy(
                                    fontWeight = FontWeight.Black,
                                    fontFamily = FontFamily.Monospace
                                ),
                                color = accent
                            )
                            Text(
                                text = "No WhatsApp: Configurações → Aparelhos conectados → Conectar com número de telefone → cole este código.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.55f)
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { viewModel.copyPairingCodeToClipboard() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Copiar código", fontWeight = FontWeight.Bold)
                                }
                                OutlinedButton(
                                    onClick = { viewModel.openNativeApp(clone) },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Abrir app")
                                }
                            }
                        }
                        if (!result.qrCode.isNullOrBlank()) {
                            Text(
                                text = "QR recebido do servidor (${result.qrCode.take(48)}…)",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "No app nativo: Aparelhos conectados → Escanear QR do LeadCapture (painel/QR).",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.55f)
                            )
                        }
                    }
                }
            }

            Text(
                text = "Multiplicar o mesmo app N vezes (várias contas no mesmo package) exige motor VIRTUAL (fase 3) ou Work Profile (fase 2). " +
                    "Hoje: 1 package instalado = 1 conta; use WhatsApp + Business, ou packages sidecar, para mais de uma.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(viewModel: AppCloneViewModel) {
    val clonesList by viewModel.allClones.collectAsStateWithLifecycle()
    val showCreateDialogState by viewModel.showCreateDialog.collectAsStateWithLifecycle()
    val isMultiProfileSupported = viewModel.isMultiProfileSupported.value
    val activeClonesCount by viewModel.activeClonesCount.collectAsStateWithLifecycle()

    // Nested layout sub-tabs configuration
    var selectedTab by remember { mutableStateOf("CONEXOES") } // CONEXOES, SYNC, MONITORING, LOGS, SETTINGS

    // --- MULTI PARALLEL STATES & OVERLAYS ---
    val context = LocalContext.current
    val isLoggedIn by viewModel.isLoggedIn.collectAsStateWithLifecycle()
    val syncLoading by viewModel.syncLoading.collectAsStateWithLifecycle()
    val syncMessage by viewModel.syncMessage.collectAsStateWithLifecycle()
    val serverInstances by viewModel.serverInstances.collectAsStateWithLifecycle()
    val lastSyncAt by viewModel.lastSyncAt.collectAsStateWithLifecycle()
    val poolInfo by viewModel.poolInfo.collectAsStateWithLifecycle()
    val sessionEmail = viewModel.sessionEmail
    var isGridLayout by remember { mutableStateOf(true) }
    var showOptionsClone by remember { mutableStateOf<AppClone?>(null) }
    var showDeviceInfoClone by remember { mutableStateOf<AppClone?>(null) }
    var showEditCloneDialog by remember { mutableStateOf<AppClone?>(null) }
    var editCloneNameInput by remember { mutableStateOf("") }
    var editCloneGroupInput by remember { mutableStateOf("") }

    var pendingOpenClone by remember { mutableStateOf<AppClone?>(null) }
    var inputClonePinCode by remember { mutableStateOf("") }
    var clonePinError by remember { mutableStateOf(false) }

    // Filter and Live Search states
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val selectedGroup by viewModel.selectedGroup.collectAsStateWithLifecycle()

    val filteredClonesList = remember(clonesList, searchQuery, selectedGroup) {
        clonesList.filter { clone ->
            val matchesSearch = clone.name.contains(searchQuery, ignoreCase = true) ||
                    clone.appType.contains(searchQuery, ignoreCase = true)
            val matchesGroup = selectedGroup == "Todos" || clone.groupName.equals(selectedGroup, ignoreCase = true)
            matchesSearch && matchesGroup
        }
    }

    val availableGroupsList = remember(clonesList) {
        listOf("Todos") + clonesList.map { it.groupName }.distinct().filter { it.isNotBlank() }
    }

    Scaffold(
        floatingActionButton = {
            if (selectedTab == "CONEXOES") {
                PremiumFAB(
                    onClick = { viewModel.navigateTo(AppScreen.CREATE_CLONE) },
                    modifier = Modifier.testTag("add_clone_fab")
                )
            }
        },
        contentWindowInsets = WindowInsets.safeDrawing,
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // General Controls Header
            AppHeader(
                totalClones = clonesList.size,
                activeClones = activeClonesCount,
                isMultiProfileSupported = isMultiProfileSupported,
                viewModel = viewModel
            )

            // Segmented sub-navigation command bar
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                SingleLineSegmentNav(
                    options = listOf(
                        "CONEXOES" to "Clones",
                        "SYNC" to "Sync",
                        "MONITORING" to "Turbo",
                        "SETTINGS" to "Ajustes",
                        "LOGS" to "Logs"
                    ),
                    selectedOption = selectedTab,
                    onSelectedChange = { selectedTab = it }
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Sub-screen panels based on selection
            Box(modifier = Modifier.weight(1f)) {
                when (selectedTab) {
                    "CONEXOES" -> {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // Search & Filter Box
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 6.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedTextField(
                                    value = searchQuery,
                                    onValueChange = { viewModel.searchQuery.value = it },
                                    placeholder = { Text("Buscar conexão ou app...") },
                                    leadingIcon = { Icon(imageVector = Icons.Default.Search, contentDescription = "Search", modifier = Modifier.size(16.dp)) },
                                    singleLine = true,
                                    shape = RoundedCornerShape(8.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = MaterialTheme.colorScheme.onBackground,
                                        unfocusedBorderColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                                    ),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(48.dp)
                                )
                            }

                            if (availableGroupsList.size > 1) {
                                LazyRow(
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    items(availableGroupsList) { group ->
                                        val isGrpSel = group == selectedGroup
                                        Surface(
                                            shape = RoundedCornerShape(20.dp),
                                            color = if (isGrpSel) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f),
                                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(20.dp))
                                                .clickable { viewModel.selectedGroup.value = group }
                                        ) {
                                            Text(
                                                text = group,
                                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                                                color = if (isGrpSel) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
                                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                            )
                                        }
                                    }
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                            }

                            // Grade vs Lista Toggle Option Row
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Espaços Clonados",
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Black, letterSpacing = 1.sp),
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                                )
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    IconButton(
                                        onClick = { isGridLayout = true },
                                        colors = IconButtonDefaults.iconButtonColors(
                                            containerColor = if (isGridLayout) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f) else Color.Transparent
                                        ),
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.GridView,
                                            contentDescription = "Grade",
                                            tint = if (isGridLayout) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                    IconButton(
                                        onClick = { isGridLayout = false },
                                        colors = IconButtonDefaults.iconButtonColors(
                                            containerColor = if (!isGridLayout) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f) else Color.Transparent
                                        ),
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.List,
                                            contentDescription = "Lista",
                                            tint = if (!isGridLayout) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }

                            if (clonesList.isEmpty()) {
                                EmptyState(onAddClick = { viewModel.navigateTo(AppScreen.CREATE_CLONE) })
                            } else {
                                if (isGridLayout) {
                                    // AMAZING GRID LAYOUT
                                    androidx.compose.foundation.lazy.grid.LazyVerticalGrid(
                                        columns = androidx.compose.foundation.lazy.grid.GridCells.Fixed(3),
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .testTag("clones_grid"),
                                        contentPadding = PaddingValues(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 80.dp),
                                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(16.dp)
                                    ) {
                                        items(
                                            items = filteredClonesList,
                                            key = { it.id }
                                        ) { clone ->
                                            val col = Color(android.graphics.Color.parseColor(clone.colorHex))
                                            val cloneLocked = viewModel.lockedCloneIds.collectAsState().value.contains(clone.id)
                                            
                                            Card(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clickable { showOptionsClone = clone },
                                                shape = RoundedCornerShape(16.dp),
                                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f)),
                                                border = BorderStroke(1.dp, if (cloneLocked) Color(0xFFFFB300).copy(alpha = 0.5f) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                                            ) {
                                                Column(
                                                    modifier = Modifier.padding(12.dp),
                                                    horizontalAlignment = Alignment.CenterHorizontally,
                                                    verticalArrangement = Arrangement.Center
                                                ) {
                                                    Box(contentAlignment = Alignment.TopEnd) {
                                                        Box(
                                                            modifier = Modifier
                                                                .size(54.dp)
                                                                .background(
                                                                    brush = Brush.radialGradient(
                                                                        colors = listOf(col.copy(alpha = 0.2f), Color.Transparent)
                                                                    ),
                                                                    shape = CircleShape
                                                                )
                                                                .border(1.5.dp, col, CircleShape),
                                                            contentAlignment = Alignment.Center
                                                        ) {
                                                            val iconVector = when (clone.appType) {
                                                                "WHATSAPP_BUSINESS" -> Icons.Default.Business
                                                                "INSTAGRAM" -> Icons.Default.CameraAlt
                                                                else -> Icons.Default.ChatBubbleOutline
                                                            }
                                                            Icon(
                                                                imageVector = iconVector,
                                                                contentDescription = null,
                                                                tint = col,
                                                                modifier = Modifier.size(20.dp)
                                                            )
                                                        }
                                                        
                                                        // Clone copy index number indicator
                                                        Box(
                                                            modifier = Modifier
                                                                .size(16.dp)
                                                                .background(Color.DarkGray, CircleShape),
                                                            contentAlignment = Alignment.Center
                                                        ) {
                                                            Text("#${clone.id}", style = MaterialTheme.typography.labelSmall.copy(fontSize = 7.sp, fontWeight = FontWeight.Black))
                                                        }
                                                    }
                                                    
                                                    Spacer(modifier = Modifier.height(8.dp))
                                                    
                                                    Text(
                                                        text = clone.name,
                                                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp),
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                    
                                                    Spacer(modifier = Modifier.height(4.dp))
                                                    
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Box(
                                                            modifier = Modifier
                                                                .size(5.dp)
                                                                .background(if (clone.isStopped) Color.Gray else Color(0xFF00E676), CircleShape)
                                                        )
                                                        Spacer(modifier = Modifier.width(4.dp))
                                                        Text(
                                                            text = if (clone.isStopped) "Pausado" else "Ativo",
                                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp),
                                                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    // AMAZING LIST LAYOUT
                                    LazyColumn(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .testTag("clones_list"),
                                        contentPadding = PaddingValues(bottom = 80.dp)
                                    ) {
                                        item {
                                            TipBanner()
                                        }
                                        items(
                                            items = filteredClonesList,
                                            key = { it.id }
                                        ) { clone ->
                                            AppCloneCard(
                                                clone = clone,
                                                onOpen = { 
                                                    if (viewModel.isCloneLocked(clone.id)) {
                                                        pendingOpenClone = clone
                                                    } else {
                                                        viewModel.openClone(clone.id)
                                                    }
                                                },
                                                onTogglePin = { viewModel.togglePin(clone) },
                                                onDelete = { viewModel.deleteClone(clone.id) },
                                                onToggleStartStop = { viewModel.toggleStartStop(it) },
                                                onResetNotifications = { viewModel.resetNotifications(it) },
                                                onRenameGroup = { name, group ->
                                                    viewModel.renameClone(clone, name, group)
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "SYNC" -> {
                        ServerSyncPanel(
                            isLoggedIn = isLoggedIn,
                            syncLoading = syncLoading,
                            syncMessage = syncMessage,
                            lastSyncAt = lastSyncAt,
                            sessionEmail = sessionEmail,
                            serverInstances = serverInstances,
                            localClones = clonesList,
                            poolInfo = poolInfo,
                            onSync = { viewModel.syncNow() },
                            onLogout = { viewModel.logout() },
                            onBind = { clone, instanceId -> viewModel.bindClone(clone, instanceId) },
                            onOpenClone = { id -> viewModel.openClone(id) },
                            onOpenInstanceSlot = { instanceId -> viewModel.openSlotForInstance(instanceId) },
                            onCreateVirtualBatch = { viewModel.createVirtualBatch(2, "WHATSAPP") },
                            onRefreshDiscovery = { viewModel.refreshDiscovery() }
                        )
                    }
                    "MONITORING" -> {
                        MonitoringView(viewModel = viewModel)
                    }
                    "LOGS" -> {
                        LogsView(viewModel = viewModel)
                    }
                    "SETTINGS" -> {
                        SettingsView(viewModel = viewModel)
                    }
                }
            }
        }
    }
}

@Composable
fun ServerSyncPanel(
    isLoggedIn: Boolean,
    syncLoading: Boolean,
    syncMessage: String?,
    lastSyncAt: Long?,
    sessionEmail: String?,
    serverInstances: List<com.example.network.ServerInstanceDto>,
    localClones: List<AppClone>,
    poolInfo: String? = null,
    onSync: () -> Unit,
    onLogout: () -> Unit,
    onBind: (AppClone, String) -> Unit,
    onOpenClone: (Int) -> Unit,
    onOpenInstanceSlot: (String) -> Unit = {},
    onCreateVirtualBatch: () -> Unit = {},
    onRefreshDiscovery: () -> Unit = {}
) {
    val dateFmt = remember { SimpleDateFormat("dd/MM HH:mm:ss", Locale.getDefault()) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f)
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "LeadCapture Sync",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
                )
                Text(
                    text = if (isLoggedIn) {
                        "Conectado como ${sessionEmail ?: "usuário"}"
                    } else {
                        "Modo local — faça login para sincronizar instâncias do servidor"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.65f)
                )
                if (lastSyncAt != null) {
                    Text(
                        text = "Último sync: ${dateFmt.format(Date(lastSyncAt))}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                    )
                }
                if (!syncMessage.isNullOrBlank()) {
                    Text(
                        text = syncMessage,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onSync,
                        enabled = isLoggedIn && !syncLoading,
                        modifier = Modifier.weight(1f)
                    ) {
                        if (syncLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Sincronizar agora")
                        }
                    }
                    if (isLoggedIn) {
                        OutlinedButton(onClick = onLogout) {
                            Text("Sair")
                        }
                    }
                }
                if (!poolInfo.isNullOrBlank()) {
                    Text(
                        text = poolInfo,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = onRefreshDiscovery,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Scan packages")
                    }
                    OutlinedButton(
                        onClick = onCreateVirtualBatch,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("+2 slots virtual")
                    }
                }
            }
        }

        Text(
            text = "INSTÂNCIAS NO SERVIDOR (${serverInstances.size})",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
        )

        if (serverInstances.isEmpty()) {
            Text(
                text = if (isLoggedIn) "Nenhuma instância no escopo. Crie no painel web e toque em Sincronizar."
                else "Login necessário para listar instâncias Baileys.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
            )
        } else {
            serverInstances.forEach { inst ->
                val boundClone = localClones.find { it.instanceId == inst.id }
                val statusColor = when (inst.status?.lowercase()) {
                    "connected" -> Color(0xFF0EAB55)
                    "connecting", "qr", "pairing" -> Color(0xFFF59E0B)
                    else -> Color(0xFF94A3B8)
                }
                Card(
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                    ),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = inst.name ?: inst.id.take(8),
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = inst.phone ?: "sem telefone",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .background(statusColor, CircleShape)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = inst.status ?: "?",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = statusColor
                                )
                            }
                        }
                        Text(
                            text = "id: ${inst.id}",
                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace, fontSize = 10.sp),
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.35f)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (boundClone != null) {
                                Button(
                                    onClick = { onOpenClone(boundClone.id) },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Conectar nativo #${boundClone.id}")
                                }
                            } else {
                                val unbound = localClones.filter { it.instanceId.isNullOrBlank() }
                                if (unbound.isNotEmpty()) {
                                    var expanded by remember { mutableStateOf(false) }
                                    Box(modifier = Modifier.weight(1f)) {
                                        OutlinedButton(
                                            onClick = { expanded = true },
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            Text("Vincular a slot local")
                                        }
                                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                                            unbound.forEach { c ->
                                                DropdownMenuItem(
                                                    text = { Text("${c.name} (#${c.id})") },
                                                    onClick = {
                                                        expanded = false
                                                        onBind(c, inst.id)
                                                    }
                                                )
                                            }
                                        }
                                    }
                                } else {
                                    Button(
                                        onClick = { onOpenInstanceSlot(inst.id) },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Text("Abrir / criar slot")
                                    }
                                }
                            }
                        }
                        if (boundClone != null) {
                            Text(
                                text = "Package: ${boundClone.packageName.ifBlank { "—" }} · ${boundClone.installState}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
                            )
                        }
                    }
                }
            }
        }

        Text(
            text = "Slots locais com binding: ${localClones.count { !it.instanceId.isNullOrBlank() }} / ${localClones.size}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
        )
    }
}

@Composable
fun SingleLineSegmentNav(
    options: List<Pair<String, String>>,
    selectedOption: String,
    onSelectedChange: (String) -> Unit
) {
    Card(
        shape = RoundedCornerShape(6.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f)),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(3.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            options.forEach { (key, display) ->
                val isSelected = key == selectedOption
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (isSelected) MaterialTheme.colorScheme.onBackground else Color.Transparent)
                        .clickable { onSelectedChange(key) }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = display,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                        color = if (isSelected) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
fun PremiumFAB(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isPressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.88f else 1.0f,
        animationSpec = spring(dampingRatio = 0.5f, stiffness = 400f),
        label = "fab_elastic_scale"
    )

    Box(
        modifier = modifier
            .padding(bottom = 16.dp, end = 16.dp)
            .scale(scale)
            .size(56.dp)
            .shadow(
                elevation = 16.dp,
                shape = RoundedCornerShape(16.dp),
                clip = false,
                ambientColor = Color.Black.copy(alpha = 0.8f),
                spotColor = Color.Black.copy(alpha = 0.8f)
            )
            .background(
                color = MaterialTheme.colorScheme.onBackground,
                shape = RoundedCornerShape(16.dp)
            )
            .border(
                width = 1.5.dp,
                color = MaterialTheme.colorScheme.background.copy(alpha = 0.25f),
                shape = RoundedCornerShape(16.dp)
            )
            .clickable {
                onClick()
            },
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Default.Add,
            contentDescription = "Adicionar Canal",
            tint = MaterialTheme.colorScheme.background,
            modifier = Modifier.size(28.dp)
        )
    }
}

@Composable
fun TipBanner(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f)
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = "Tips",
                tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Cada slot usa o app nativo instalado. Vincule à instância do painel e dispare a conexão — sem navegador embutido.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f)
            )
        }
    }
}

@Composable
fun EmptyState(onAddClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
            .testTag("empty_state"),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(90.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f), shape = CircleShape)
            ) {
                Box(
                    modifier = Modifier
                        .size(70.dp)
                        .background(Color.Transparent)
                        .border(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(Color.Transparent)
                        .border(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.25f), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(MaterialTheme.colorScheme.onBackground, shape = CircleShape)
                )
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(80.dp)
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f))
                )
                Box(
                    modifier = Modifier
                        .width(80.dp)
                        .height(1.dp)
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f))
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Nenhum slot nativo",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "Crie um slot, instale o app oficial se faltar, vincule à instância do LeadCapture e dispare a conexão no aparelho.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 20.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onAddClick,
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.onBackground,
                    contentColor = MaterialTheme.colorScheme.background
                ),
                modifier = Modifier.testTag("empty_state_add_button")
            ) {
                Icon(imageVector = Icons.Default.Add, contentDescription = "Add")
                Spacer(modifier = Modifier.width(6.dp))
                Text("Conectar Novo Canal", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveSessionScreen(
    clone: AppClone,
    isMultiProfileActive: Boolean,
    onBack: () -> Unit,
    onUpdateZoom: (Int) -> Unit
) {
    val accentColor = Color(android.graphics.Color.parseColor(clone.colorHex))

    BackHandler(enabled = true) {
        onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .background(accentColor, shape = CircleShape)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = clone.name,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                                maxLines = 1
                            )
                            Text(
                                text = "Conexão de Atendimento Direta Ativa",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF0EAB55)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("session_back_button")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Voltar"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                ),
                modifier = Modifier.testTag("session_top_app_bar")
            )
        },
        contentWindowInsets = WindowInsets.safeDrawing,
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                contentColor = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(modifier = Modifier.size(6.dp).background(Color(0xFF0EAB55), CircleShape))
                        Text(
                            text = "Canal de Atendimento Ativo",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = Color(0xFF0EAB55))
                        )
                    }
                    Text(
                        text = "Isolamento de Dados Seguro",
                        style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f)
            ) {
                WebViewContainer(
                    clone = clone,
                    onProgressChange = {},
                    isMultiProfileActive = isMultiProfileActive
                )
            }
        }
    }
}

