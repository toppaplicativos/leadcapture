package com.example.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface AppCloneDao {
    @Query("SELECT * FROM app_clones ORDER BY isPinned DESC, lastActiveAt DESC, id DESC")
    fun getAllClones(): Flow<List<AppClone>>

    @Query("SELECT * FROM app_clones WHERE id = :id")
    fun getCloneById(id: Int): Flow<AppClone?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertClone(clone: AppClone): Long

    @Update
    suspend fun updateClone(clone: AppClone)

    @Delete
    suspend fun deleteClone(clone: AppClone)

    @Query("DELETE FROM app_clones WHERE id = :id")
    suspend fun deleteCloneById(id: Int)
}
