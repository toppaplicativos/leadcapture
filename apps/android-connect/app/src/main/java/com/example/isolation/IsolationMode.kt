package com.example.isolation

/**
 * Modos de isolamento de slots nativos.
 *
 * HOST     — package oficial no perfil principal (1 install / package)
 * SIDECAR  — package alternativo (APK clone sideload com outro packageName)
 * WORK_PROFILE — segundo perfil Android (quando disponível)
 * VIRTUAL  — pool virtual: multiplica slots mapeando packages descobertos + filas
 */
enum class IsolationMode(val wire: String) {
    HOST("HOST"),
    SIDECAR("SIDECAR"),
    WORK_PROFILE("WORK_PROFILE"),
    VIRTUAL("VIRTUAL");

    companion object {
        fun fromWire(raw: String?): IsolationMode {
            return entries.find { it.wire.equals(raw, ignoreCase = true) } ?: HOST
        }
    }
}

enum class EngineMode(val wire: String) {
    NATIVE_HOST("NATIVE_HOST"),
    NATIVE_SIDECAR("NATIVE_SIDECAR"),
    WORK_PROFILE("WORK_PROFILE"),
    VIRTUAL("VIRTUAL");

    companion object {
        fun fromWire(raw: String?): EngineMode {
            return entries.find { it.wire.equals(raw, ignoreCase = true) } ?: NATIVE_HOST
        }

        fun forIsolation(mode: IsolationMode): EngineMode = when (mode) {
            IsolationMode.HOST -> NATIVE_HOST
            IsolationMode.SIDECAR -> NATIVE_SIDECAR
            IsolationMode.WORK_PROFILE -> WORK_PROFILE
            IsolationMode.VIRTUAL -> VIRTUAL
        }
    }
}
