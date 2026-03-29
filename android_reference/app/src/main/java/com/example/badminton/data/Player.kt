package com.example.badminton.data

/**
 * Player Entity.
 * Stores only the path to the avatar image, not the image itself.
 */
data class Player(
    val id: String,
    val name: String,
    val avatarPath: String? = null // Path: /files/players/{id}.webp
)
