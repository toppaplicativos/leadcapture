package com.example.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val email: String,
    val password: String
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val success: Boolean? = null,
    val token: String? = null,
    val user: AuthUser? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class AuthUser(
    val id: String? = null,
    val email: String? = null,
    val name: String? = null,
    val role: String? = null,
    @Json(name = "account_kind") val accountKind: String? = null
)

@JsonClass(generateAdapter = true)
data class ConnectMeResponse(
    val success: Boolean? = null,
    val user: ConnectMeUser? = null,
    val devices: List<ConnectDeviceDto>? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class ConnectMeUser(
    val id: String? = null,
    @Json(name = "owner_user_id") val ownerUserId: String? = null,
    @Json(name = "is_affiliate") val isAffiliate: Boolean? = null,
    @Json(name = "brand_id") val brandId: String? = null,
    val email: String? = null,
    val role: String? = null
)

@JsonClass(generateAdapter = true)
data class DeviceRegisterRequest(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "display_name") val displayName: String? = null,
    val model: String? = null,
    val manufacturer: String? = null,
    @Json(name = "os_version") val osVersion: String? = null,
    @Json(name = "app_version") val appVersion: String? = null,
    @Json(name = "fcm_token") val fcmToken: String? = null
)

@JsonClass(generateAdapter = true)
data class DeviceRegisterResponse(
    val success: Boolean? = null,
    val device: ConnectDeviceDto? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class ConnectDeviceDto(
    val id: String? = null,
    @Json(name = "device_id") val deviceId: String? = null,
    @Json(name = "display_name") val displayName: String? = null,
    val model: String? = null,
    @Json(name = "last_seen_at") val lastSeenAt: String? = null,
    @Json(name = "is_active") val isActive: Boolean? = null
)

@JsonClass(generateAdapter = true)
data class HeartbeatRequest(
    @Json(name = "device_id") val deviceId: String,
    val battery: Int? = null,
    val network: String? = null,
    @Json(name = "clones_summary") val clonesSummary: ClonesSummaryDto? = null
)

@JsonClass(generateAdapter = true)
data class ClonesSummaryDto(
    val active: Int? = null,
    val total: Int? = null
)

@JsonClass(generateAdapter = true)
data class SyncResponse(
    val success: Boolean? = null,
    @Json(name = "device_id") val deviceId: String? = null,
    @Json(name = "brand_id") val brandId: String? = null,
    val instances: List<ServerInstanceDto>? = null,
    val bindings: List<BindingDto>? = null,
    val commands: List<CommandDto>? = null,
    @Json(name = "server_time") val serverTime: String? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class ServerInstanceDto(
    val id: String,
    val name: String? = null,
    val phone: String? = null,
    val status: String? = null,
    @Json(name = "has_qr") val hasQr: Boolean? = null,
    @Json(name = "brand_id") val brandId: String? = null,
    @Json(name = "owner_type") val ownerType: String? = null,
    @Json(name = "created_at") val createdAt: String? = null,
    @Json(name = "last_connected_at") val lastConnectedAt: String? = null
)

@JsonClass(generateAdapter = true)
data class BindingDto(
    val id: String? = null,
    @Json(name = "device_id") val deviceId: String? = null,
    @Json(name = "local_clone_id") val localCloneId: Int? = null,
    @Json(name = "instance_id") val instanceId: String? = null,
    val label: String? = null,
    @Json(name = "color_hex") val colorHex: String? = null,
    @Json(name = "group_name") val groupName: String? = null,
    @Json(name = "app_type") val appType: String? = null,
    @Json(name = "is_active") val isActive: Boolean? = null
)

@JsonClass(generateAdapter = true)
data class BindingRequest(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "instance_id") val instanceId: String,
    @Json(name = "local_clone_id") val localCloneId: Int? = null,
    val label: String? = null,
    @Json(name = "color_hex") val colorHex: String? = null,
    @Json(name = "group_name") val groupName: String? = null,
    @Json(name = "app_type") val appType: String? = "WHATSAPP"
)

@JsonClass(generateAdapter = true)
data class BindingResponse(
    val success: Boolean? = null,
    val binding: BindingDto? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class CommandDto(
    val id: String,
    @Json(name = "device_id") val deviceId: String? = null,
    @Json(name = "command_type") val commandType: String? = null,
    @Json(name = "payload_json") val payloadJson: CommandPayloadDto? = null,
    val status: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "created_at") val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class CommandPayloadDto(
    @Json(name = "instance_id") val instanceId: String? = null,
    @Json(name = "instanceId") val instanceIdAlt: String? = null,
    val phone: String? = null,
    val note: String? = null
) {
    fun resolvedInstanceId(): String? = instanceId?.takeIf { it.isNotBlank() } ?: instanceIdAlt
}

@JsonClass(generateAdapter = true)
data class CommandsResponse(
    val success: Boolean? = null,
    val commands: List<CommandDto>? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class CommandAckRequest(
    val status: String,
    val detail: CommandAckDetailDto? = null
)

@JsonClass(generateAdapter = true)
data class CommandAckDetailDto(
    val note: String? = null,
    @Json(name = "handled_at") val handledAt: Long? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class CommandAckResponse(
    val success: Boolean? = null,
    val command: CommandDto? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class CreateInstanceRequest(
    val name: String? = null
)

@JsonClass(generateAdapter = true)
data class CreateInstanceResponse(
    val success: Boolean? = null,
    val id: String? = null,
    val name: String? = null,
    val instance: ServerInstanceDto? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class BootstrapConnectRequest(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "local_clone_id") val localCloneId: Int? = null,
    val label: String? = null,
    @Json(name = "color_hex") val colorHex: String? = null,
    @Json(name = "group_name") val groupName: String? = null,
    @Json(name = "app_type") val appType: String? = "WHATSAPP",
    @Json(name = "package_name") val packageName: String? = null,
    @Json(name = "isolation_mode") val isolationMode: String? = null,
    @Json(name = "instance_name") val instanceName: String? = null,
    /** se true, já enfileira OPEN_PAIRING (precisa phone) */
    @Json(name = "enqueue_pairing") val enqueuePairing: Boolean? = false,
    val phone: String? = null
)

@JsonClass(generateAdapter = true)
data class BootstrapConnectResponse(
    val success: Boolean? = null,
    val instance: ServerInstanceDto? = null,
    @Json(name = "instance_id") val instanceId: String? = null,
    val binding: BindingDto? = null,
    val command: CommandDto? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class DeviceCapabilitiesRequest(
    @Json(name = "device_id") val deviceId: String,
    @Json(name = "packages") val packages: List<String>? = null,
    @Json(name = "slot_count") val slotCount: Int? = null,
    @Json(name = "work_profile") val workProfile: Boolean? = null,
    @Json(name = "max_practical_slots") val maxPracticalSlots: Int? = null,
    @Json(name = "virtual_engine") val virtualEngine: String? = null,
    @Json(name = "isolation_modes") val isolationModes: List<String>? = null
)

@JsonClass(generateAdapter = true)
data class PairingCodeRequest(
    @Json(name = "phoneNumber") val phoneNumber: String? = null,
    val phone: String? = null
)

@JsonClass(generateAdapter = true)
data class PairingCodeResponse(
    val success: Boolean? = null,
    val code: String? = null,
    @Json(name = "pairingCode") val pairingCode: String? = null,
    val error: String? = null,
    val message: String? = null
)

@JsonClass(generateAdapter = true)
data class QrResponse(
    val success: Boolean? = null,
    @Json(name = "qrCode") val qrCode: String? = null,
    val message: String? = null,
    val error: String? = null
)
