package com.example.badminton.presentation

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.badminton.data.Player
import com.example.badminton.utils.ImageUtils
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class PlayerUiState(
    val player: Player = Player(id = UUID.randomUUID().toString(), name = ""),
    val isLoading: Boolean = false,
    val error: String? = null
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    fun updateName(name: String) {
        _uiState.update { it.copy(player = it.player.copy(name = name)) }
    }

    fun handleImageSelection(uri: Uri?) {
        if (uri == null) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            // Generate ID if needed or use existing
            val playerId = _uiState.value.player.id
            
            val result = ImageUtils.processAndSaveImage(getApplication(), uri, playerId)
            
            result.fold(
                onSuccess = { path ->
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            player = it.player.copy(avatarPath = path),
                            error = null
                        ) 
                    }
                },
                onFailure = { error ->
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            error = "Failed to process image: ${error.localizedMessage}"
                        ) 
                    }
                }
            )
        }
    }
    
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
