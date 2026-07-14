package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Slot nativo de conexão.
 *
 * isolationMode: HOST | SIDECAR | WORK_PROFILE | VIRTUAL
 * engineMode: NATIVE_HOST | NATIVE_SIDECAR | WORK_PROFILE | VIRTUAL
 */
@Entity(tableName = "app_clones")
data class AppClone(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val appType: String,
    val url: String = "",
    val colorHex: String,
    val createdAt: Long = System.currentTimeMillis(),
    val lastActiveAt: Long = System.currentTimeMillis(),
    val isPinned: Boolean = false,
    val zoomLevel: Int = 100,
    val isStopped: Boolean = false,
    val notificationsCount: Int = 0,
    val openingsCount: Int = 0,
    val groupName: String = "Geral",
    val memoryUsageMb: Int = 0,
    val cpuUsagePct: Int = 0,
    val engineMode: String = "NATIVE_HOST",
    val sandboxDirectory: String = "",
    val isApkImported: Boolean = false,
    val virtualApkSizeMb: Int = 0,
    val packageName: String = "com.whatsapp",
    val isolationMode: String = "HOST",
    val installState: String = "unknown",
    /** chave do sandbox virtual (filesDir/virtual_spaces/...) */
    val virtualSlotKey: String? = null,
    val poolIndex: Int = 0,
    val instanceId: String? = null,
    val bindingId: String? = null,
    val serverStatus: String? = null,
    val serverPhone: String? = null,
    val lastServerSyncAt: Long? = null,
    val localBound: Boolean = false
)
