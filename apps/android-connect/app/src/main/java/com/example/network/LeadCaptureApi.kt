package com.example.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface LeadCaptureApi {
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("api/connect/me")
    suspend fun connectMe(): ConnectMeResponse

    @POST("api/connect/devices/register")
    suspend fun registerDevice(@Body body: DeviceRegisterRequest): DeviceRegisterResponse

    @POST("api/connect/devices/heartbeat")
    suspend fun heartbeat(@Body body: HeartbeatRequest): DeviceRegisterResponse

    @GET("api/connect/sync")
    suspend fun sync(@Query("device_id") deviceId: String): SyncResponse

    @POST("api/connect/bindings")
    suspend fun upsertBinding(@Body body: BindingRequest): BindingResponse

    @GET("api/connect/bindings")
    suspend fun listBindings(@Query("device_id") deviceId: String): BindingResponseList

    @DELETE("api/connect/bindings/{id}")
    suspend fun deleteBinding(@Path("id") id: String): SimpleSuccess

    @GET("api/connect/commands")
    suspend fun listCommands(
        @Query("device_id") deviceId: String,
        @Query("status") status: String = "open"
    ): CommandsResponse

    @POST("api/connect/commands/{id}/ack")
    suspend fun ackCommand(
        @Path("id") id: String,
        @Body body: CommandAckRequest
    ): CommandAckResponse

    @POST("api/instances/{id}/pairing-code")
    suspend fun requestPairingCode(
        @Path("id") instanceId: String,
        @Body body: PairingCodeRequest
    ): PairingCodeResponse

    @GET("api/instances/{id}/qr")
    suspend fun getInstanceQr(@Path("id") instanceId: String): QrResponse

    @POST("api/instances/{id}/connect")
    suspend fun connectInstance(@Path("id") instanceId: String): SimpleSuccess

    @POST("api/instances")
    suspend fun createInstance(@Body body: CreateInstanceRequest): CreateInstanceResponse

    @POST("api/connect/bootstrap")
    suspend fun bootstrapConnect(@Body body: BootstrapConnectRequest): BootstrapConnectResponse

    @POST("api/connect/devices/capabilities")
    suspend fun reportCapabilities(@Body body: DeviceCapabilitiesRequest): SimpleSuccess

    @POST("api/connect/dispatch")
    suspend fun dispatch(@Body body: DispatchRequest): DispatchResponse
}

@JsonClass(generateAdapter = true)
data class DispatchRequest(
    @Json(name = "command_type") val commandType: String,
    @Json(name = "instance_id") val instanceId: String? = null,
    val phone: String? = null,
    @Json(name = "device_id") val deviceId: String? = null
)

@JsonClass(generateAdapter = true)
data class DispatchResponse(
    val success: Boolean? = null,
    val command: CommandDto? = null,
    @Json(name = "device_id") val deviceId: String? = null,
    val error: String? = null,
    val hint: String? = null
)

@JsonClass(generateAdapter = true)
data class BindingResponseList(
    val success: Boolean? = null,
    val bindings: List<BindingDto>? = null,
    val error: String? = null
)

@JsonClass(generateAdapter = true)
data class SimpleSuccess(
    val success: Boolean? = null,
    val error: String? = null,
    val message: String? = null
)
