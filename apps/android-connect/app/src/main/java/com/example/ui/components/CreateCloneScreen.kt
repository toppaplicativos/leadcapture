package com.example.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import com.example.ui.AppPreset
import com.example.ui.AppScreen
import com.example.ui.AppCloneViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateCloneScreen(
    viewModel: AppCloneViewModel,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val presets = AppPreset.values()

    var selectedPreset by remember { mutableStateOf(presets.first()) }
    var inputName by remember { mutableStateOf("") }
    var inputGroupName by remember { mutableStateOf("Geral") }
    var selectedColorHex by remember { mutableStateOf(presets.first().defaultColorHex) }

    // Isolamento: HOST | SIDECAR | WORK_PROFILE | VIRTUAL
    var isolationMode by remember { mutableStateOf("HOST") }
    var customPackage by remember { mutableStateOf("") }
    var isApkImported by remember { mutableStateOf(false) }
    val useSidecar = isolationMode == "SIDECAR"

    val effectivePackage = when {
        isolationMode == "SIDECAR" && customPackage.isNotBlank() -> customPackage.trim()
        else -> selectedPreset.packageName
    }

    // Detect package status
    val isAppInstalled = remember(effectivePackage) {
        viewModel.checkPackageInstalled(context, effectivePackage)
    }

    // Auto update name recommendations
    LaunchedEffect(selectedPreset) {
        inputName = when (selectedPreset) {
            AppPreset.WHATSAPP -> "Canal WhatsApp"
            AppPreset.WHATSAPP_BUSINESS -> "Whats Business 01"
            AppPreset.INSTAGRAM -> "Instagram Comercial"
            AppPreset.TELEGRAM -> "Telegram Canal"
            AppPreset.TIKTOK -> "TikTok Leads"
            AppPreset.FACEBOOK -> "Facebook Pages"
        }
        selectedColorHex = selectedPreset.defaultColorHex
        if (!useSidecar) customPackage = selectedPreset.packageName
        isApkImported = viewModel.checkPackageInstalled(context, selectedPreset.packageName)
    }

    val availableColors = listOf(
        "#128C7E", // WhatsApp Teal Blue
        "#0EAB55", // WhatsApp Business Green
        "#E1306C", // Instagram Magenta
        "#0088CC", // Telegram Blue
        "#FE2C55", // TikTok Red/Pink
        "#1877F2", // Facebook Blue
        "#FFFFFF", // Pure White
        "#F59E0B"  // Warm Gold
    )

    val groupsList = listOf("Geral", "Atendimento", "Vendas", "Suporte", "Marketing", "Gerência")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Novo Canal de Atendimento",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("create_back_btn")) {
                        Icon(imageVector = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        },
        contentWindowInsets = WindowInsets.safeDrawing,
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Screen explanation
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.03f)
                ),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Language,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Novo slot nativo",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "Cada slot aponta para um app instalado no aparelho (package Android). O LeadCapture dispara a conexão (pairing) nesse app — sem WhatsApp Web.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    }
                }
            }

            // Presets List - Polished Grid-like flow
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "SELECIONE O APP OFICIAL:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )

                // Layout options as individual luxury cards
                presets.forEach { preset ->
                    val isSelected = preset == selectedPreset
                    val presetColor = Color(android.graphics.Color.parseColor(preset.defaultColorHex))
                    val isThisInstalled = viewModel.checkPackageInstalled(context, preset.packageName)

                    Surface(
                        onClick = { selectedPreset = preset },
                        shape = RoundedCornerShape(12.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f) else Color.Transparent,
                        border = BorderStroke(
                            width = if (isSelected) 2.dp else 1.dp,
                            color = if (isSelected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("create_preset_${preset.idName}")
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .background(presetColor.copy(alpha = 0.1f), RoundedCornerShape(10.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    val iconImage = when (preset) {
                                        AppPreset.WHATSAPP -> Icons.Default.Chat
                                        AppPreset.WHATSAPP_BUSINESS -> Icons.Default.Business
                                        AppPreset.INSTAGRAM -> Icons.Default.CameraAlt
                                        AppPreset.TELEGRAM -> Icons.Default.Send
                                        AppPreset.TIKTOK -> Icons.Default.PlayCircle
                                        AppPreset.FACEBOOK -> Icons.Default.Pages
                                    }
                                    Icon(
                                        imageVector = iconImage,
                                        contentDescription = preset.displayName,
                                        tint = presetColor,
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                                Column {
                                    Text(
                                        text = preset.displayName,
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = preset.packageName,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                    )
                                }
                            }

                            // Dynamic Install Marker indicator next to card
                            Surface(
                                shape = RoundedCornerShape(50.dp),
                                color = if (isThisInstalled) Color(0xFF0EAB55).copy(alpha = 0.1f) else Color(0xFFEF4444).copy(alpha = 0.1f),
                                border = BorderStroke(1.dp, if (isThisInstalled) Color(0xFF0EAB55).copy(alpha = 0.2f) else Color(0xFFEF4444).copy(alpha = 0.2f))
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        imageVector = if (isThisInstalled) Icons.Default.CheckCircle else Icons.Default.Info,
                                        contentDescription = null,
                                        tint = if (isThisInstalled) Color(0xFF0EAB55) else Color(0xFFEF4444),
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Text(
                                        text = if (isThisInstalled) "Instalado" else "Disponível",
                                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                        color = if (isThisInstalled) Color(0xFF0EAB55) else Color(0xFFEF4444)
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Canal de Atendimento Multi-Instância
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.01f)
                ),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f)),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Language,
                        contentDescription = "Web",
                        tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Visualização e autenticação direta via Web. Sem necessidade de app extra instalado.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }

            // Custom name input field
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "NOME CUSTOMIZADO DO CANAL:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
                OutlinedTextField(
                    value = inputName,
                    onValueChange = { inputName = it },
                    placeholder = { Text("Ex: Suporte Vendas RJ") },
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.onBackground,
                        unfocusedBorderColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f)
                    ),
                    modifier = Modifier.fillMaxWidth().testTag("create_name_input")
                )
            }

            // Group operation selectable tag-row
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "GRUPO DE ATUAÇÃO COMERCIAL:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
                
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(groupsList) { grp ->
                        val isGrpSel = grp == inputGroupName
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = if (isGrpSel) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f)),
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .clickable { inputGroupName = grp }
                        ) {
                            Text(
                                text = grp,
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                color = if (isGrpSel) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                            )
                        }
                    }
                }
            }

            // Personalized color badge selector
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "MARCADOR VISUAL DE CORES:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    availableColors.forEach { colorString ->
                        val colorVal = Color(android.graphics.Color.parseColor(colorString))
                        val isSelectedColor = colorString.equals(selectedColorHex, ignoreCase = true)

                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(colorVal.copy(alpha = 0.15f))
                                .border(
                                    width = if (isSelectedColor) 2.dp else 1.dp,
                                    color = if (isSelectedColor) MaterialTheme.colorScheme.onBackground else colorVal.copy(alpha = 0.4f),
                                    shape = CircleShape
                                )
                                .clickable { selectedColorHex = colorString }
                                .padding(4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .clip(CircleShape)
                                    .background(colorVal)
                            )
                        }
                    }
                }
            }

            // Package / sidecar
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.03f)
                ),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = "PACKAGE ANDROID",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp
                        ),
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                    )
                    Text(
                        text = effectivePackage,
                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = if (isAppInstalled) "✓ Instalado neste aparelho"
                        else "○ Não instalado — você poderá abrir a Play Store depois",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isAppInstalled) Color(0xFF0EAB55) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                    )
                    Text(
                        text = "MODO DE ISOLAMENTO",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.45f)
                    )
                    listOf(
                        "HOST" to "Oficial (1 package = 1 conta)",
                        "SIDECAR" to "Package custom / clone sideload",
                        "WORK_PROFILE" to "2º perfil Android (se existir)",
                        "VIRTUAL" to "Pool virtual (multiplica com packages descobertos)"
                    ).forEach { (mode, desc) ->
                        val selected = isolationMode == mode
                        Surface(
                            onClick = {
                                isolationMode = mode
                                if (mode == "SIDECAR" && customPackage.isBlank()) {
                                    customPackage = selectedPreset.packageName
                                }
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = if (selected) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                            else Color.Transparent,
                            border = BorderStroke(
                                1.dp,
                                if (selected) MaterialTheme.colorScheme.onBackground
                                else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(Modifier.padding(10.dp)) {
                                Text(mode, fontWeight = FontWeight.Black)
                                Text(
                                    desc,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.55f)
                                )
                            }
                        }
                    }
                    if (useSidecar) {
                        OutlinedTextField(
                            value = customPackage,
                            onValueChange = { customPackage = it },
                            label = { Text("packageName sidecar") },
                            placeholder = { Text("com.exemplo.whatsapp.clone") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    if (isolationMode == "VIRTUAL") {
                        Text(
                            text = "O motor VIRTUAL aloca o próximo package livre (WA, Business, clones instalados). " +
                                "Para N cópias do mesmo APK é preciso SIDECAR ou Work Profile.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                        )
                    }
                    if (!isAppInstalled && !useSidecar) {
                        OutlinedButton(
                            onClick = {
                                try {
                                    context.startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse("market://details?id=${selectedPreset.packageName}")
                                        )
                                    )
                                } catch (_: Exception) {
                                    context.startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse(
                                                "https://play.google.com/store/apps/details?id=${selectedPreset.packageName}"
                                            )
                                        )
                                    )
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Instalar na Play Store")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Action Trigger Footer Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onBack,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                ) {
                    Text("Cancelar", fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = {
                        if (inputName.isNotBlank()) {
                            viewModel.createClone(
                                name = inputName,
                                appType = selectedPreset.idName,
                                url = "",
                                colorHex = selectedColorHex,
                                groupName = inputGroupName,
                                engineMode = when (isolationMode) {
                                    "SIDECAR" -> "NATIVE_SIDECAR"
                                    "WORK_PROFILE" -> "WORK_PROFILE"
                                    "VIRTUAL" -> "VIRTUAL"
                                    else -> "NATIVE_HOST"
                                },
                                sandboxDirectory = "",
                                isApkImported = isAppInstalled,
                                virtualApkSizeMb = 0,
                                packageName = if (isolationMode == "SIDECAR") effectivePackage else "",
                                isolationMode = isolationMode
                            )
                            viewModel.navigateTo(AppScreen.DASHBOARD)
                        }
                    },
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onBackground),
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp)
                        .testTag("create_confirm_button")
                ) {
                    Icon(imageVector = Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Criar slot nativo", fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.background)
                }
            }
        }
    }
}
