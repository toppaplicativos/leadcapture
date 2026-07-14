package com.example.nativeapps

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast

object ClipboardHelper {
    fun copy(context: Context, label: String, text: String, toast: Boolean = true) {
        val appCtx = context.applicationContext
        val cm = appCtx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText(label, text))
        if (toast) {
            // Toast precisa da thread principal em alguns devices
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                Toast.makeText(appCtx, "Copiado: $text", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
