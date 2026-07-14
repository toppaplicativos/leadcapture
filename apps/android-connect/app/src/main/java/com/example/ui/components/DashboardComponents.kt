package com.example.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.data.AppClone
import com.example.ui.AppPreset
import com.example.ui.AppScreen
import com.example.ui.AppCloneViewModel
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun AppHeader(
    totalClones: Int,
    activeClones: Int,
    isMultiProfileSupported: Boolean,
    modifier: Modifier = Modifier,
    viewModel: AppCloneViewModel? = null
) {
    val isVipActive = viewModel?.isVipActive?.collectAsState()?.value ?: false

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f)
        ),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
    ) {
        Column(
            modifier = Modifier.padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .background(
                                color = Color(0xFF0EAB55).copy(alpha = 0.15f),
                                shape = RoundedCornerShape(10.dp)
                            )
                            .border(1.dp, Color(0xFF0EAB55), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Radar,
                            contentDescription = "App Icon",
                            tint = Color(0xFF0EAB55),
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = "CONNECT SPACE",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Black,
                                letterSpacing = 2.sp
                            ),
                            color = Color(0xFF0EAB55)
                        )
                        Spacer(modifier = Modifier.height(1.dp))
                        Text(
                            text = "LeadCapture",
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontWeight = FontWeight.Black,
                                letterSpacing = (-1).sp
                            ),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }

                val badgeColor = Color(0xFF0EAB55).copy(alpha = 0.1f)
                val badgeTextColor = Color(0xFF00E676)
                val statusText = "Integração Gratuita"

                Surface(
                    shape = RoundedCornerShape(50.dp),
                    color = badgeColor,
                    border = BorderStroke(1.dp, Color(0xFF00E676).copy(alpha = 0.3f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(Color(0xFF0EAB55), shape = CircleShape)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = statusText,
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = badgeTextColor
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    Column {
                        Text(
                            text = "Cadastrados",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
                        )
                        Text(
                            text = "$totalClones",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                    Column {
                        Text(
                            text = "Em Execução",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
                        )
                        Text(
                            text = "$activeClones",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = "Secured",
                            tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Perfil Isolado",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun AppCloneCard(
    clone: AppClone,
    onOpen: (Int) -> Unit,
    onTogglePin: (AppClone) -> Unit,
    onDelete: (Int) -> Unit,
    onToggleStartStop: (AppClone) -> Unit,
    onResetNotifications: (AppClone) -> Unit,
    onRenameGroup: (name: String, group: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val formatter = remember { SimpleDateFormat("HH:mm - dd/MM", Locale.getDefault()) }
    val lastActiveFormatted = remember(clone.lastActiveAt) {
        formatter.format(Date(clone.lastActiveAt))
    }

    var showEditMenu by remember { mutableStateOf(false) }
    var editName by remember { mutableStateOf(clone.name) }
    var editGroup by remember { mutableStateOf(clone.groupName) }

    val indicatorColor = Color(android.graphics.Color.parseColor(clone.colorHex))

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .testTag("clone_card_${clone.id}"),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = BorderStroke(
            width = if (clone.isPinned) 1.5.dp else 1.dp,
            color = if (clone.isPinned) {
                MaterialTheme.colorScheme.onBackground
            } else {
                MaterialTheme.colorScheme.onBackground.copy(alpha = 0.07f)
            }
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            // First Row: App Type Icon, Details, Controls toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .background(
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.05f),
                                shape = RoundedCornerShape(10.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        val iconVector = when (clone.appType) {
                            "WHATSAPP_BUSINESS" -> Icons.Default.Business
                            "INSTAGRAM" -> Icons.Default.CameraAlt
                            else -> Icons.Default.ChatBubbleOutline
                        }
                        Icon(
                            imageVector = iconVector,
                            contentDescription = clone.appType,
                            tint = indicatorColor,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = clone.name,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (clone.isPinned) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Default.PushPin,
                                    contentDescription = "Pinned",
                                    tint = MaterialTheme.colorScheme.onBackground,
                                    modifier = Modifier.size(11.dp)
                                )
                            }
                        }

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            // Group tag
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f),
                                modifier = Modifier.padding(top = 2.dp)
                            ) {
                                Text(
                                    text = clone.groupName.uppercase(),
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 8.sp),
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                )
                            }

                            // Application identification tag
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(
                                    text = if (clone.appType == "WHATSAPP_BUSINESS") "WhatsApp Business" else if (clone.appType == "WHATSAPP") "WhatsApp" else clone.appType,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                                )
                                Text(
                                    text = "• Web Corporativo",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, color = MaterialTheme.colorScheme.primary),
                                    modifier = Modifier.padding(start = 2.dp)
                                )
                            }
                        }
                    }
                }

                // Action Menu
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Notification Badge
                    if (clone.notificationsCount > 0) {
                        Box(
                            modifier = Modifier
                                .padding(end = 6.dp)
                                .background(indicatorColor, shape = CircleShape)
                                .clip(CircleShape)
                                .clickable { onResetNotifications(clone) }
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "${clone.notificationsCount} Leads",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 9.sp),
                                color = Color.White
                            )
                        }
                    }

                    IconButton(onClick = { onTogglePin(clone) }) {
                        Icon(
                            imageVector = if (clone.isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                            contentDescription = "Pin Instance",
                            tint = if (clone.isPinned) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    IconButton(onClick = { showEditMenu = !showEditMenu }) {
                        Icon(
                            imageVector = Icons.Default.Edit,
                            contentDescription = "Edit Instance",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    IconButton(onClick = { onDelete(clone.id) }) {
                        Icon(
                            imageVector = Icons.Outlined.Delete,
                            contentDescription = "Delete Instance",
                            tint = MaterialTheme.colorScheme.error.copy(alpha = 0.7f),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // Edit Block Menu
            AnimatedVisibility(visible = showEditMenu) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp)
                        .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Text("Editar Identidade", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = editName,
                        onValueChange = { editName = it },
                        label = { Text("Nome Customizado") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = editGroup,
                        onValueChange = { editGroup = it },
                        label = { Text("Agrupamento (Ex: Suporte, Vendas)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showEditMenu = false }) {
                            Text("Fechar")
                        }
                        Button(
                            onClick = {
                                onRenameGroup(editName, editGroup)
                                showEditMenu = false
                            },
                            shape = RoundedCornerShape(6.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onBackground)
                        ) {
                            Text("Salvar", color = MaterialTheme.colorScheme.background)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Connection Info Row
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.onBackground.copy(alpha = 0.02f), RoundedCornerShape(8.dp))
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            text = "Acessos: ${clone.openingsCount}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                        if (clone.notificationsCount > 0) {
                            Text(
                                text = "Novidades: ${clone.notificationsCount}",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(5.dp)
                                .background(Color(0xFF0EAB55), shape = CircleShape)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "PRONTO",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = Color(0xFF0EAB55),
                            fontSize = 8.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action Launch Controls row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Último uso:",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                    )
                    Text(
                        text = lastActiveFormatted,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }

                // Open Web Context container (Acessar Canal)
                Button(
                    onClick = { onOpen(clone.id) },
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.onBackground,
                        contentColor = MaterialTheme.colorScheme.background
                    ),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp),
                    modifier = Modifier
                        .height(36.dp)
                        .testTag("launch_button_${clone.id}")
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Launch,
                            contentDescription = "Acessar",
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Acessar Canal",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun AddCloneDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, appType: String, url: String, colorHex: String, groupName: String) -> Unit,
    viewModel: AppCloneViewModel
) {
    val context = LocalContext.current
    val presets = AppPreset.values()

    var selectedPreset by remember { mutableStateOf(presets.first()) }
    var inputName by remember { mutableStateOf("") }
    var inputGroupName by remember { mutableStateOf("Geral") }
    var selectedColorHex by remember { mutableStateOf(presets.first().defaultColorHex) }

    // Check package base status
    val isLocalBaseInstalled = remember(selectedPreset) {
        viewModel.checkPackageInstalled(context, selectedPreset.packageName)
    }

    LaunchedEffect(selectedPreset) {
        inputName = when (selectedPreset) {
            AppPreset.WHATSAPP -> "WhatsApp Messenger"
            AppPreset.WHATSAPP_BUSINESS -> "Whats Business 01"
            AppPreset.INSTAGRAM -> "Instagram Comercial"
            AppPreset.TELEGRAM -> "Telegram Canal"
            AppPreset.TIKTOK -> "TikTok Leads"
            AppPreset.FACEBOOK -> "Facebook Pages"
        }
        selectedColorHex = selectedPreset.defaultColorHex
    }

    val availableColors = listOf(
        "#0EAB55", // WhatsApp Business Green
        "#E1306C", // Instagram Magenta
        "#000000", // Obsidian Dark
        "#3A3A3C", // Charcoal Slate
        "#7A7A7A", // Standard Silver
        "#9E9E9E", // Light Gray
        "#FFFFFF"  // Premium White
    )

    val groups = listOf("Geral", "Atendimento", "Comercial", "Marketing", "Suporte", "Gerência")

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp)
                .testTag("add_clone_dialog"),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .fillMaxWidth()
            ) {
                Text(
                    text = "Criar Conexão Corporativa",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Crie canais de captura independentes com caches, perfis e cookies 100% apartados e seguros.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Select Preset Apps
                Text(
                    text = "Aplicativo Alvo:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    presets.forEach { preset ->
                        val isPresetSelected = preset == selectedPreset
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { selectedPreset = preset }
                                .testTag("preset_${preset.idName}"),
                            shape = RoundedCornerShape(8.dp),
                            color = if (isPresetSelected) MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f) else Color.Transparent,
                            border = BorderStroke(if (isPresetSelected) 1.5.dp else 1.dp, if (isPresetSelected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                        ) {
                            Row(
                                modifier = Modifier.padding(vertical = 10.dp, horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = if (preset == AppPreset.WHATSAPP_BUSINESS) Icons.Default.Business else Icons.Default.CameraAlt,
                                    contentDescription = preset.displayName,
                                    tint = if (isPresetSelected) Color(android.graphics.Color.parseColor(preset.defaultColorHex)) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = preset.displayName,
                                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Native Package Status Verification Block
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = if (isLocalBaseInstalled) Color(0xFF0EAB55).copy(alpha = 0.08f) else MaterialTheme.colorScheme.error.copy(alpha = 0.06f),
                    border = BorderStroke(1.dp, if (isLocalBaseInstalled) Color(0xFF0EAB55).copy(alpha = 0.15f) else MaterialTheme.colorScheme.error.copy(alpha = 0.15f))
                ) {
                    Row(
                        modifier = Modifier.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isLocalBaseInstalled) Icons.Default.CheckCircle else Icons.Default.Warning,
                            contentDescription = "Status",
                            tint = if (isLocalBaseInstalled) Color(0xFF0EAB55) else MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (isLocalBaseInstalled) "Aplicativo Local Detectado" else "Instale o Aplicativo Oficial",
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                                color = if (isLocalBaseInstalled) Color(0xFF0EAB55) else MaterialTheme.colorScheme.error
                            )
                            Text(
                                text = if (isLocalBaseInstalled) "A integridade do aplicativo base está OK no Android." else "Recomendado instalar pela Play Store para sincronizar suas credenciais empresariais nativas.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }

                        if (!isLocalBaseInstalled) {
                            TextButton(
                                onClick = {
                                    val intent = Intent(Intent.ACTION_VIEW).apply {
                                        data = Uri.parse("market://details?id=${selectedPreset.packageName}")
                                    }
                                    try {
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=${selectedPreset.packageName}")))
                                    }
                                },
                                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp)
                            ) {
                                Text("Baixar", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Name input
                OutlinedTextField(
                    value = inputName,
                    onValueChange = { inputName = it },
                    label = { Text("Nome Customizado do Canal") },
                    placeholder = { Text("Ex: Comercial RJ - WhatsApp") },
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Group filter Selector
                Text(
                    text = "Grupo de Operação Comercial:",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Spacer(modifier = Modifier.height(4.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(groups) { group ->
                        val isGrpSel = group == inputGroupName
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (isGrpSel) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.04f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.1f)),
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .clickable { inputGroupName = group }
                        ) {
                            Text(
                                text = group,
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                                color = if (isGrpSel) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onBackground,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Identification Shade Color selector
                Text(
                    text = "Selecionar Indicador Visual (SaaS Theme):",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    availableColors.forEach { colHex ->
                        val targetColor = Color(android.graphics.Color.parseColor(colHex))
                        val isColorSelected = colHex.equals(selectedColorHex, ignoreCase = true)
                        val isWhiteColor = colHex.equals("#FFFFFF", ignoreCase = true)

                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(targetColor)
                                .border(
                                    width = if (isColorSelected) 2.dp else if (isWhiteColor) 1.dp else 0.dp,
                                    color = if (isColorSelected) {
                                        if (isWhiteColor) Color.Black else MaterialTheme.colorScheme.onBackground
                                    } else {
                                        Color.LightGray
                                    },
                                    shape = CircleShape
                                )
                                .clickable { selectedColorHex = colHex },
                            contentAlignment = Alignment.Center
                        ) {
                            if (isColorSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected",
                                    tint = if (isWhiteColor) Color.Black else Color.White,
                                    modifier = Modifier.size(12.dp)
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Actions buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancelar", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f))
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    Button(
                        onClick = {
                            if (inputName.isNotBlank()) {
                                onConfirm(
                                    inputName,
                                    selectedPreset.idName,
                                    selectedPreset.defaultUrl,
                                    selectedColorHex,
                                    inputGroupName
                                )
                            }
                        },
                        enabled = inputName.isNotBlank(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.onBackground,
                            contentColor = MaterialTheme.colorScheme.background
                        )
                    ) {
                        Text("Criar Conexão")
                    }
                }
            }
        }
    }
}

@Composable
fun SplashView(onFinished: () -> Unit) {
    var animateStart by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        animateStart = true
        delay(1800)
        onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF000000)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Animated concentric rings
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(130.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .background(Color.Transparent)
                        .border(1.5.dp, Color.White.copy(alpha = 0.12f), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .background(Color.Transparent)
                        .border(1.5.dp, Color.White.copy(alpha = 0.25f), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(50.dp)
                        .background(Color.Transparent)
                        .border(1.5.dp, Color.White.copy(alpha = 0.45f), CircleShape)
                )
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .background(Color.White, shape = CircleShape)
                )

                // Reticle Crosshairs
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(120.dp)
                        .background(Color.White.copy(alpha = 0.15f))
                )
                Box(
                    modifier = Modifier
                        .width(120.dp)
                        .height(1.dp)
                        .background(Color.White.copy(alpha = 0.15f))
                )
            }

            Spacer(modifier = Modifier.height(28.dp))

            Text(
                text = "LEadCapture",
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-1.5).sp,
                    fontSize = 32.sp
                ),
                color = Color.White
            )

            Text(
                text = "CONNECT SPACE • BUSINESS",
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 4.sp,
                    fontSize = 9.sp
                ),
                color = Color.White.copy(alpha = 0.5f)
            )

            Spacer(modifier = Modifier.height(48.dp))

            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

@Composable
fun OnboardingView(onStartClicked: () -> Unit) {
    var step by remember { mutableStateOf(1) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF000000))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxHeight()
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 28.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "LEadCapture",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                    color = Color.White
                )

                TextButton(onClick = onStartClicked) {
                    Text("Pular", color = Color.White.copy(alpha = 0.4f))
                }
            }

            // Interactive dynamic slide graphic based on step
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth()
            ) {
                AnimatedContent(
                    targetState = step,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "SlideContent"
                ) { targetStep ->
                    when (targetStep) {
                        1 -> OnboardingSlideContent(
                            icon = Icons.Default.Business,
                            title = "Espaços Multi-Conta",
                            description = "Clone e gerencie múltiplos canais de recepção do WhatsApp Business e Instagram simultâneos em um único dispositivo."
                        )
                        2 -> OnboardingSlideContent(
                            icon = Icons.Default.Security,
                            title = "Conexão 100% Isolada",
                            description = "Cada instância criada possui armazenamento, perfis, cache e cookies totalmente isolados e cryptografados."
                        )
                        3 -> OnboardingSlideContent(
                            icon = Icons.Default.TrendingUp,
                            title = "Painel de Atendimento",
                            description = "Controle o status das sessões, canais ativos, e contadores de notificações/leads recebidos de forma centralizada."
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Phase Dots
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (1..3).forEach { d ->
                        Box(
                            modifier = Modifier
                                .size(height = 6.dp, width = if (d == step) 20.dp else 6.dp)
                                .background(
                                    color = if (d == step) Color.White else Color.White.copy(alpha = 0.2f),
                                    shape = CircleShape
                                )
                        )
                    }
                }
            }

            // Navigation Button Call to Action
            Button(
                onClick = {
                    if (step < 3) {
                        step++
                    } else {
                        onStartClicked()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .padding(bottom = 8.dp),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black
                )
            ) {
                Text(
                    text = if (step == 3) "Começar Operação de Leads" else "Próximo Passo",
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun OnboardingSlideContent(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(horizontal = 16.dp)
    ) {
        Box(
            modifier = Modifier
                .size(90.dp)
                .background(Color.White.copy(alpha = 0.08f), shape = RoundedCornerShape(20.dp))
                .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(20.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(40.dp)
            )
        }

        Spacer(modifier = Modifier.height(28.dp))

        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black, fontSize = 24.sp),
            color = Color.White,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(10.dp))

        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
    }
}

@Composable
fun PinLockView(
    viewModel: AppCloneViewModel,
    onUnlocked: () -> Unit
) {
    val savedPin by viewModel.storedPin.collectAsState()
    var inputCode by remember { mutableStateOf("") }
    var triedCount by remember { mutableStateOf(0) }
    var errorText by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF000000))
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = "Lock",
                tint = Color.White,
                modifier = Modifier.size(44.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Segurança Ativa",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black),
                color = Color.White
            )

            Text(
                text = "Digite seu PIN de 4 dígitos para acessar a central de conexões.",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.6f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Asterisks for security indicator
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                (0..3).forEach { index ->
                    val filled = index < inputCode.length
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .background(
                                color = if (filled) Color.White else Color.White.copy(alpha = 0.2f),
                                shape = CircleShape
                            )
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            errorText?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
            }

            Spacer(modifier = Modifier.height(34.dp))

            // Keypad numbers
            val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar", "0", "Corrigir")
            Column(
                modifier = Modifier.width(280.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                for (row in 0..3) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        for (col in 0..2) {
                            val key = keys[row * 3 + col]
                            Surface(
                                modifier = Modifier
                                    .size(68.dp)
                                    .clip(CircleShape)
                                    .clickable {
                                        when (key) {
                                            "Limpar" -> inputCode = ""
                                            "Corrigir" -> if (inputCode.isNotEmpty()) inputCode = inputCode.dropLast(1)
                                            else -> {
                                                if (inputCode.length < 4) {
                                                    inputCode += key
                                                    if (inputCode.length == 4) {
                                                        if (inputCode == savedPin) {
                                                            onUnlocked()
                                                        } else {
                                                            triedCount++
                                                            inputCode = ""
                                                            errorText = "PIN incorreto. Tentativa #$triedCount"
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    },
                                shape = CircleShape,
                                color = Color.White.copy(alpha = 0.08f),
                                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.1f))
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text(
                                        text = key,
                                        style = if (key.length > 1) MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold) else MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                        color = Color.White
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MonitoringView(viewModel: AppCloneViewModel) {
    val context = LocalContext.current
    val list by viewModel.allClones.collectAsState()
    val activeCount by viewModel.activeClonesCount.collectAsState()
    val isBoosting by viewModel.isBoosting.collectAsState()
    val ramFreed by viewModel.boostRamMbFreed.collectAsState()
    val healthScore by viewModel.systemHealthScore.collectAsState()

    var simulatedPing by remember { mutableStateOf(14) }
    var simulatedTotalRam by remember { mutableStateOf(240) }

    LaunchedEffect(activeCount) {
        simulatedPing = if (activeCount > 0) (10..18).random() else 0
        simulatedTotalRam = activeCount * 45 + (12..28).random()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "TURBO BOOSTER",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Black,
                            letterSpacing = 2.sp
                        ),
                        color = Color(0xFFFFB300)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Otimizador de Caixa de Areia",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                }
            }
        }

        // Circular Gauge
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.15f)),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)),
                shape = RoundedCornerShape(24.dp)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier.size(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        // Pulsing / glowing background circle
                        val infiniteTransition = rememberInfiniteTransition(label = "booster_pulse")
                        val scale by infiniteTransition.animateFloat(
                            initialValue = 1f,
                            targetValue = 1.05f,
                            animationSpec = infiniteRepeatable(
                                animation = tween(1200, easing = LinearEasing),
                                repeatMode = RepeatMode.Reverse
                            ),
                            label = "scale"
                        )
                        
                        Box(
                            modifier = Modifier
                                .size(160.dp)
                                .shadow(8.dp, CircleShape)
                                .background(
                                    brush = Brush.radialGradient(
                                        colors = if (isBoosting) {
                                            listOf(Color(0xFFE040FB).copy(alpha = 0.3f), Color.Transparent)
                                        } else {
                                            listOf(Color(0xFF00E676).copy(alpha = 0.15f), Color.Transparent)
                                        }
                                    ),
                                    shape = CircleShape
                                )
                        )

                        // Progress representation
                        CircularProgressIndicator(
                            progress = { if (isBoosting) 0.5f else (healthScore / 100f) },
                            modifier = Modifier.size(175.dp),
                            color = if (isBoosting) Color(0xFFE040FB) else Color(0xFF00E676),
                            strokeWidth = 8.dp,
                            trackColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.06f)
                        )

                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            if (isBoosting) {
                                Icon(
                                    imageVector = Icons.Default.RocketLaunch,
                                    contentDescription = "Otimizando",
                                    tint = Color(0xFFE040FB),
                                    modifier = Modifier.size(48.dp)
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = "OTIMIZANDO...",
                                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Black)
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Security,
                                    contentDescription = "Security Status",
                                    tint = Color(0xFF00E676),
                                    modifier = Modifier.size(42.dp)
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = "$healthScore%",
                                    style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.ExtraBold)
                                )
                                Text(
                                    text = "SAÚDE DO ESPAÇO",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = { viewModel.performBoost() },
                        enabled = !isBoosting,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isBoosting) Color.Gray else Color(0xFFFFB300)
                        ),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(52.dp)
                    ) {
                        Icon(imageVector = Icons.Default.FlashOn, contentDescription = "Boost", tint = Color.Black)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (isBoosting) "Turbinando Motores..." else "Acelerar e Limpar Memória",
                            color = Color.Black,
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Black)
                        )
                    }
                }
            }
        }

        // Animated results / Metrics boxes
        item {
            AnimatedVisibility(
                visible = ramFreed > 0 && !isBoosting,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                    border = BorderStroke(1.dp, Color(0xFF38BDF8))
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(imageVector = Icons.Default.CheckCircle, contentDescription = "Sucesso", tint = Color(0xFF38BDF8), modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Turbo Otimização Concluída!", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), color = Color.White)
                            Text(
                                text = "Espaço virtual consolidado. Foram liberados $ramFreed MB de memória cache.",
                                style = MaterialTheme.typography.labelMedium,
                                color = Color(0xFF94A3B8)
                            )
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("RAM Alocada", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f))
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (activeCount > 0) "$simulatedTotalRam MB" else "0 MB",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
                        )
                    }
                }

                Card(
                    modifier = Modifier.weight(1f),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("Modo Sandbox", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f))
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (activeCount > 0) "Isolamento Multiprofil" else "Repouso",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
                        )
                    }
                }
            }
        }

        // Active instances diagnostics
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Pool de Memória Virtual",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    if (list.isEmpty()) {
                        Text("Nenhum clone criado para alocação.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                    } else {
                        list.forEach { instance ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .background(
                                                color = if (instance.isStopped) Color.Gray else Color(0xFF00E676),
                                                shape = CircleShape
                                            )
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(text = instance.name, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                                }

                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Text(
                                        text = "${if (instance.isStopped) 0 else instance.memoryUsageMb} MB",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = FontFamily.Monospace
                                    )
                                    Text(
                                        text = "${if (instance.isStopped) 0 else instance.cpuUsagePct}% CPU",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun VipPremiumView(viewModel: AppCloneViewModel) {
    val context = LocalContext.current
    val isVipActive by viewModel.isVipActive.collectAsState()
    var selectedPlan by remember { mutableStateOf("annual") } // annual, monthly

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Luxury Card Header
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                border = BorderStroke(1.5.dp, Color(0xFFD4AF37)),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0A0A0E))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            brush = Brush.verticalGradient(
                                colors = listOf(Color(0xFF1E1E26), Color(0xFF0F0F14))
                            )
                        )
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .background(
                                brush = Brush.radialGradient(
                                    colors = listOf(Color(0xFFF9D976), Color(0xFFE9B646))
                                ),
                                shape = CircleShape
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Stars,
                            contentDescription = "VIP Stars",
                            tint = Color.Black,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = if (isVipActive) "VOCÊ É MEMBRO VIP" else "ASSINE O CONNECT SPACE VIP",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 1.sp
                        ),
                        color = Color(0xFFD4AF37),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = if (isVipActive) "Recursos Premium ativos por tempo ilimitado" else "Desbloqueie todo o poder da virtualização de aplicativos",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.7f),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // List of Perks
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "VANTAGENS EXCLUSIVAS",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp
                    ),
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                )

                // Perk 1
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.AllInclusive, contentDescription = "Clones", tint = Color(0xFFD4AF37), modifier = Modifier.size(28.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("Clonagem de Aplicativos Ilimitada", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                        Text("Crie ilimitadas duplicatas separadamente da matriz.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f))
                    }
                }

                // Perk 2
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.Lock, contentDescription = "Lock", tint = Color(0xFFD4AF37), modifier = Modifier.size(28.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("App Lock com Senha Individual", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                        Text("Proteja cada clone de forma segura com senha exclusiva.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f))
                    }
                }

                // Perk 3
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.Speed, contentDescription = "Speed", tint = Color(0xFFD4AF37), modifier = Modifier.size(28.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("Modo Turbo Acelerado", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                        Text("Priorização em RAM para carregamento ultra veloz.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f))
                    }
                }

                // Perk 4
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Default.SettingsSuggest, contentDescription = "Identity", tint = Color(0xFFD4AF37), modifier = Modifier.size(28.dp))
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("Simulador de Dispositivo Completo", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                        Text("Emule hardware, IMEI, e MAC individuais no sandbox.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.4f))
                    }
                }
            }
        }

        if (!isVipActive) {
            // Plan Selector
            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Plan Option 1: Annual
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedPlan = "annual" },
                        colors = CardDefaults.cardColors(
                            containerColor = if (selectedPlan == "annual") Color(0xFF1E1B10) else MaterialTheme.colorScheme.surface
                        ),
                        border = BorderStroke(
                            width = if (selectedPlan == "annual") 1.5.dp else 1.dp,
                            color = if (selectedPlan == "annual") Color(0xFFD4AF37) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                        )
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(
                                    selected = selectedPlan == "annual",
                                    onClick = { selectedPlan = "annual" },
                                    colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFD4AF37))
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text("Plano Anual Especial", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                                    Text("Cobrado anualmente. Economize 60%!", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                                }
                            }
                            Text("R$ 59,90", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), color = Color(0xFFD4AF37))
                        }
                    }

                    // Plan Option 2: Monthly
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedPlan = "monthly" },
                        colors = CardDefaults.cardColors(
                            containerColor = if (selectedPlan == "monthly") Color(0xFF1E1B10) else MaterialTheme.colorScheme.surface
                        ),
                        border = BorderStroke(
                            width = if (selectedPlan == "monthly") 1.5.dp else 1.dp,
                            color = if (selectedPlan == "monthly") Color(0xFFD4AF37) else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f)
                        )
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(
                                    selected = selectedPlan == "monthly",
                                    onClick = { selectedPlan = "monthly" },
                                    colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFD4AF37))
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text("Plano Mensal Corporativo", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                                    Text("Acesso recorrente mês a mês", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                                }
                            }
                            Text("R$ 14,90", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                        }
                    }
                }
            }

            // Pay Button
            item {
                Button(
                    onClick = { viewModel.setVipActive(context, true) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD4AF37)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                ) {
                    Text(
                        text = "Liberar LeadCapture VIP ✨",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Black),
                        color = Color.Black
                    )
                }
            }
        } else {
            // Already VIP layout
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1A3620)),
                    border = BorderStroke(1.dp, Color(0xFF2E7D32))
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(imageVector = Icons.Default.Stars, contentDescription = "VIP Active badge", tint = Color(0xFFE9B646), modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Sua Assinatura VIP está Ativa!",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Você possui acesso livre e ilimitado a todas as simulações de privacidade, isolamento multi-profile e senhas individuais de clones.",
                            style = MaterialTheme.typography.labelMedium,
                            color = Color.White.copy(alpha = 0.8f),
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = { viewModel.setVipActive(context, false) },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White.copy(alpha = 0.6f)),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.3f))
                        ) {
                            Text("Desativar Modo VIP")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LogsView(viewModel: AppCloneViewModel) {
    val logs by viewModel.operationsLogs.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Console de Auditoria",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
                )
                Text(
                    text = "Ações operacionais gravadas dinamicamente.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
                )
            }

            IconButton(onClick = { viewModel.addLog("Forçado refresh de auditoria local.") }) {
                Icon(imageVector = Icons.Default.Refresh, contentDescription = "Refresh logs")
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF040405)),
            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.12f))
        ) {
            LazyColumn(
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(logs) { log ->
                    Text(
                        text = log,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = if (log.contains("[OK]") || log.contains("sucesso") || log.contains("criada")) Color(0xFF27C93F) else if (log.contains("Navegou") || log.contains("[INFO]")) Color(0xFF9E9E9E) else Color(0xFFFFBD2E)
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsView(viewModel: AppCloneViewModel) {
    val context = LocalContext.current
    val isPinActive by viewModel.isPinEnabled.collectAsState()
    val savedPin by viewModel.storedPin.collectAsState()
    val isBiometricActive by viewModel.isDeviceBiometricEnabled.collectAsState()
    val isMultiProfileActive by viewModel.isMultiProfileActive.collectAsState()

    var inputPinState by remember { mutableStateOf(savedPin) }
    var isEditingPin by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Segurança e Ajustes",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
            Text(
                text = "Configure bloqueios empresariais e faça backup de suas instâncias de captação.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
            )
        }

        // Security PIN toggle
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Proteger com PIN", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
                            Text("Exigir senha de 4 dígitos para abrir o app central.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                        }
                        Switch(
                            checked = isPinActive,
                            onCheckedChange = { active ->
                                if (!active) {
                                    viewModel.setupPin("")
                                    inputPinState = ""
                                } else {
                                    isEditingPin = true
                                }
                            }
                        )
                    }

                    if (isEditingPin) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = inputPinState,
                                onValueChange = { if (it.length <= 4) inputPinState = it.filter { c -> c.isDigit() } },
                                label = { Text("Novo Código PIN (4 digitos)") },
                                placeholder = { Text("Ex: 1234") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                singleLine = true,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Button(
                                onClick = {
                                    if (inputPinState.length == 4) {
                                        viewModel.setupPin(inputPinState)
                                        isEditingPin = false
                                    } else {
                                        Toast.makeText(context, "Digite 4 dígitos numéricos.", Toast.LENGTH_SHORT).show()
                                    }
                                },
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onBackground)
                            ) {
                                Text("OK", color = MaterialTheme.colorScheme.background)
                            }
                        }
                    }

                    if (isPinActive && !isEditingPin) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Lock, contentDescription = "Pin Actived", tint = Color(0xFF0EAB55), modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("PIN ativo: **** (Clique no botão para redefinir)", style = MaterialTheme.typography.labelSmall, color = Color(0xFF0EAB55))
                            Spacer(modifier = Modifier.width(12.dp))
                            TextButton(onClick = { isEditingPin = true }) {
                                Text("Editar", style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }

        // Biometric Sync Section
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Proteção Biométrica (Central)", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
                        Text("Usa a impressão digital do sistema para desbloqueio rápido das conexões.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                    }
                    Switch(
                        checked = isBiometricActive,
                        enabled = isPinActive,
                        onCheckedChange = { viewModel.setBiometricEnabled(it) }
                    )
                }
            }
        }

        // Cookie Multi-Profile Section (Active Cookie Isolation)
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Isolamento de Cookies (Multi-Perfil)", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
                        Text("Isola cookies e dados de cada perfil. Desative caso queira compartilhar dados de navegação entre as instâncias.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Switch(
                        checked = isMultiProfileActive,
                        onCheckedChange = { active ->
                            viewModel.setMultiProfileActiveState(active)
                            val sharedPrefs = context.getSharedPreferences("leadcapture_prefs", Context.MODE_PRIVATE)
                            sharedPrefs.edit().putBoolean("multi_profile_active", active).commit()
                        }
                    )
                }
            }
        }

        // Import & Export Backup Configuration
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Migração de Contas", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
                    Text("Exporte as definições ou recupere outro backup de instâncias rapidamente.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Button(
                            onClick = {
                                val log = viewModel.exportBackup(context)
                                Toast.makeText(context, "Backup exportado para os logs de auditoria!", Toast.LENGTH_SHORT).show()
                                viewModel.navigateTo(AppScreen.LOGS)
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onBackground)
                        ) {
                            Icon(imageVector = Icons.Default.CloudDownload, contentDescription = "Export")
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Exportar Backup", color = MaterialTheme.colorScheme.background, fontSize = 11.sp)
                        }

                        Button(
                            onClick = {
                                // Simulate restoring backup of two active communication lists
                                val sampleBackup = "LeadCapture_v1\nWhats Comercial RJ|WHATSAPP_BUSINESS|https://web.whatsapp.com|#0EAB55|Comercial\nInstagram CRM|INSTAGRAM|https://www.instagram.com|#E1306C|Vendas\n"
                                val success = viewModel.importBackup(context, sampleBackup)
                                if (success) {
                                    Toast.makeText(context, "Sessões recuperadas com sucesso!", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant, contentColor = MaterialTheme.colorScheme.onSurfaceVariant)
                        ) {
                            Icon(imageVector = Icons.Default.CloudUpload, contentDescription = "Import")
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Conectar Amostra", fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PermissionsView(viewModel: AppCloneViewModel) {
    val context = LocalContext.current
    var hasNotifPerm by remember { mutableStateOf(true) }
    var hasBiometricPerm by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Centro de Permissões",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
        )
        Text(
            text = "Para total conformidade de processamento das instâncias do WhatsApp e Instagram, verifique as concessões.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f)
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.Notifications, contentDescription = "Notif")
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("Notificações em Segundo Plano", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                            Text("Exibir resumos de chamados e leads recebidos.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                        }
                    }

                    Box(
                        modifier = Modifier
                            .background(if (hasNotifPerm) Color(0xFF0EAB55).copy(alpha = 0.1f) else Color.Gray, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = if (hasNotifPerm) "CONCEDIDO" else "PENDENTE",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = if (hasNotifPerm) Color(0xFF0EAB55) else Color.Gray
                        )
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.onBackground.copy(alpha = 0.08f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(imageVector = Icons.Default.Fingerprint, contentDescription = "Biometric")
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("Acesso à Biometria Facial/Digital", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold))
                            Text("Validar segurança integrada do smartphone.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                        }
                    }

                    Switch(
                        checked = hasBiometricPerm,
                        onCheckedChange = {
                            hasBiometricPerm = it
                            viewModel.addLog("Permissão de impressão digital local: $it")
                        }
                    )
                }
            }
        }

        Button(
            onClick = {
                Toast.makeText(context, "Sincronizando permissões de sistema...", Toast.LENGTH_SHORT).show()
                viewModel.addLog("Solicitado sincronização total de hardware com o Android.")
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onBackground)
        ) {
            Text("Verificar Hardware", color = MaterialTheme.colorScheme.background)
        }
    }
}
