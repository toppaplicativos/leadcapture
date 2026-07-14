package com.example.network

import com.example.BuildConfig
import com.example.auth.SessionStore
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    @Volatile
    private var api: LeadCaptureApi? = null

    fun baseUrl(): String {
        val raw = try {
            BuildConfig.API_BASE_URL
        } catch (_: Throwable) {
            "https://app.leadcapture.online/"
        }.ifBlank { "https://app.leadcapture.online/" }
        return if (raw.endsWith("/")) raw else "$raw/"
    }

    fun get(sessionStore: SessionStore): LeadCaptureApi {
        api?.let { return it }
        synchronized(this) {
            api?.let { return it }
            val created = build(sessionStore)
            api = created
            return created
        }
    }

    /** Call after logout/login if token headers must refresh mid-process. */
    fun reset() {
        synchronized(this) { api = null }
    }

    private fun build(sessionStore: SessionStore): LeadCaptureApi {
        val authInterceptor = Interceptor { chain ->
            val original = chain.request()
            val builder = original.newBuilder()
                .header("Accept", "application/json")
            val token = sessionStore.token
            if (!token.isNullOrBlank()) {
                builder.header("Authorization", "Bearer $token")
            }
            val brandId = sessionStore.brandId
            if (!brandId.isNullOrBlank()) {
                builder.header("X-Brand-Id", brandId)
            }
            chain.proceed(builder.build())
        }

        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        val moshi = Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl())
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(LeadCaptureApi::class.java)
    }
}
