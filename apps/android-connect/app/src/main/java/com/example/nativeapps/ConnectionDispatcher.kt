package com.example.nativeapps

import android.content.Context
import com.example.auth.SessionStore
import com.example.data.AppClone
import com.example.isolation.IsolationCoordinator
import com.example.network.ApiClient
import com.example.network.PairingCodeRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Dispara conexão LeadCapture → app nativo.
 *
 * Fluxo oficial:
 * 1. Backend Baileys gera pairing code / QR para a instance
 * 2. Abre o package nativo do slot (WhatsApp / Business / clone)
 * 3. UI mostra o código para o operador colar em
 *    Configurações → Aparelhos conectados → Conectar com número
 */
class ConnectionDispatcher(
    private val context: Context,
    private val sessionStore: SessionStore
) {
    data class DispatchResult(
        val ok: Boolean,
        val pairingCode: String? = null,
        val qrCode: String? = null,
        val message: String,
        val nativeLaunched: Boolean = false,
        val packageName: String? = null
    )

    private val api get() = ApiClient.get(sessionStore)
    private val isolation = IsolationCoordinator(context)

    suspend fun firePairing(
        slot: AppClone,
        phoneE164: String
    ): DispatchResult = withContext(Dispatchers.IO) {
        val instanceId = slot.instanceId
        if (instanceId.isNullOrBlank()) {
            return@withContext DispatchResult(
                ok = false,
                message = "Slot sem instance_id. Vincule a uma instância do servidor na aba Sync."
            )
        }
        val pkg = slot.packageName.ifBlank {
            AppPresets.packageForType(slot.appType)
        }
        val status = NativeAppLauncher.status(context, pkg)
        if (!status.installed) {
            return@withContext DispatchResult(
                ok = false,
                message = "App nativo não instalado ($pkg). Instale pela Play Store primeiro.",
                packageName = pkg
            )
        }

        try {
            val res = api.requestPairingCode(
                instanceId,
                PairingCodeRequest(phoneNumber = phoneE164, phone = phoneE164)
            )
            val code = res.code ?: res.pairingCode
            if (code.isNullOrBlank()) {
                return@withContext DispatchResult(
                    ok = false,
                    message = res.error ?: res.message ?: "Servidor não retornou código de pairing",
                    packageName = pkg
                )
            }

            val launched = withContext(Dispatchers.Main) {
                isolation.launch(slot).ok
            }
            DispatchResult(
                ok = true,
                pairingCode = code,
                message = if (launched) {
                    "Código gerado. App nativo aberto (${slot.isolationMode}) — cole o código em Aparelhos conectados."
                } else {
                    "Código gerado, mas não foi possível abrir o app. Abra manualmente."
                },
                nativeLaunched = launched,
                packageName = pkg
            )
        } catch (e: Exception) {
            DispatchResult(
                ok = false,
                message = e.message ?: "Falha ao disparar pairing",
                packageName = pkg
            )
        }
    }

    suspend fun fireQr(slot: AppClone): DispatchResult = withContext(Dispatchers.IO) {
        val instanceId = slot.instanceId
        if (instanceId.isNullOrBlank()) {
            return@withContext DispatchResult(
                ok = false,
                message = "Slot sem instance_id vinculado."
            )
        }
        val pkg = slot.packageName.ifBlank { AppPresets.packageForType(slot.appType) }
        val status = NativeAppLauncher.status(context, pkg)
        if (!status.installed) {
            return@withContext DispatchResult(
                ok = false,
                message = "App nativo não instalado ($pkg).",
                packageName = pkg
            )
        }
        try {
            // Garante que a instance está tentando conectar (QR disponível)
            runCatching { api.connectInstance(instanceId) }
            val qr = api.getInstanceQr(instanceId)
            val qrData = qr.qrCode
            if (qrData.isNullOrBlank()) {
                return@withContext DispatchResult(
                    ok = false,
                    message = qr.message ?: "QR ainda não disponível. Tente de novo em alguns segundos.",
                    packageName = pkg
                )
            }
            val launched = withContext(Dispatchers.Main) {
                isolation.launch(slot).ok
            }
            DispatchResult(
                ok = true,
                qrCode = qrData,
                message = "QR pronto. No app nativo: Aparelhos conectados → Escanear QR.",
                nativeLaunched = launched,
                packageName = pkg
            )
        } catch (e: Exception) {
            DispatchResult(ok = false, message = e.message ?: "Falha QR", packageName = pkg)
        }
    }

    fun openNativeOnly(slot: AppClone): Boolean = isolation.launch(slot).ok

    fun installNative(slot: AppClone) = isolation.install(slot)
}

object AppPresets {
    fun packageForType(appType: String): String = when (appType.uppercase()) {
        "WHATSAPP_BUSINESS" -> "com.whatsapp.w4b"
        "INSTAGRAM" -> "com.instagram.android"
        "TELEGRAM" -> "org.telegram.messenger"
        "TIKTOK" -> "com.zhiliaoapp.musically"
        "FACEBOOK" -> "com.facebook.katana"
        else -> "com.whatsapp"
    }

    fun displayName(appType: String): String = when (appType.uppercase()) {
        "WHATSAPP_BUSINESS" -> "WhatsApp Business"
        "INSTAGRAM" -> "Instagram"
        "TELEGRAM" -> "Telegram"
        "TIKTOK" -> "TikTok"
        "FACEBOOK" -> "Facebook"
        else -> "WhatsApp"
    }
}
