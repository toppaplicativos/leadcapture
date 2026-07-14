package com.example.data

import kotlinx.coroutines.flow.Flow

class AppCloneRepository(private val appCloneDao: AppCloneDao) {
    val allClones: Flow<List<AppClone>> = appCloneDao.getAllClones()

    fun getCloneById(id: Int): Flow<AppClone?> {
        return appCloneDao.getCloneById(id)
    }

    suspend fun insert(clone: AppClone): Long {
        return appCloneDao.insertClone(clone)
    }

    suspend fun update(clone: AppClone) {
        appCloneDao.updateClone(clone)
    }

    suspend fun delete(clone: AppClone) {
        appCloneDao.deleteClone(clone)
    }

    suspend fun deleteById(id: Int) {
        appCloneDao.deleteCloneById(id)
    }
}
