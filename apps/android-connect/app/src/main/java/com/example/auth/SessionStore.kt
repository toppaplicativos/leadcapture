package com.example.auth

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

/**
 * Persistência simples de sessão JWT + identidade do device.
 * (EncryptedSharedPreferences pode substituir em hardening de release.)
 */
class SessionStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var userId: String?
        get() = prefs.getString(KEY_USER_ID, null)
        set(value) = prefs.edit().putString(KEY_USER_ID, value).apply()

    var userEmail: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(value) = prefs.edit().putString(KEY_EMAIL, value).apply()

    var userName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) = prefs.edit().putString(KEY_NAME, value).apply()

    var brandId: String?
        get() = prefs.getString(KEY_BRAND_ID, null)?.takeIf { it.isNotBlank() }
        set(value) = prefs.edit().putString(KEY_BRAND_ID, value).apply()

    val deviceId: String
        get() {
            val existing = prefs.getString(KEY_DEVICE_ID, null)
            if (!existing.isNullOrBlank()) return existing
            val generated = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_ID, generated).apply()
            return generated
        }

    val isLoggedIn: Boolean
        get() = !token.isNullOrBlank()

    fun saveLogin(token: String, userId: String?, email: String?, name: String?, brandId: String? = null) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_EMAIL, email)
            .putString(KEY_NAME, name)
            .apply {
                if (brandId != null) putString(KEY_BRAND_ID, brandId)
            }
            .apply()
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_EMAIL)
            .remove(KEY_NAME)
            // keep device_id + brand preference for re-login
            .apply()
    }

    companion object {
        private const val PREFS = "leadcapture_connect_session"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_NAME = "user_name"
        private const val KEY_BRAND_ID = "brand_id"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
