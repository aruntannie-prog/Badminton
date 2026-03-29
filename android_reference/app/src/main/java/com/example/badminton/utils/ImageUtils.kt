package com.example.badminton.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
// import android.graphics.ImageDecoder // API 28+
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import kotlin.math.min

object ImageUtils {

    private const val TARGET_SIZE = 512
    private const val COMPRESSION_QUALITY = 90

    /**
     * Processes the selected image URI:
     * 1. Loads image (handling orientation)
     * 2. Crops to 1:1 Square
     * 3. Resizes to 512x512
     * 4. Compresses to WebP
     * 5. Saves to internal storage
     *
     * @return The absolute path of the saved file
     */
    suspend fun processAndSaveImage(context: Context, uri: Uri, playerId: String): Result<String> {
        return withContext(Dispatchers.IO) {
            try {
                // 1. Load Bitmap with correct orientation
                val originalBitmap = loadBitmapFromUri(context, uri) 
                    ?: return@withContext Result.failure(Exception("Failed to load image"))

                // 2. Crop to Square (Center Crop)
                val squaredBitmap = cropToSquare(originalBitmap)

                // 3. Resize to 512x512
                val resizedBitmap = Bitmap.createScaledBitmap(squaredBitmap, TARGET_SIZE, TARGET_SIZE, true)
                
                // Release intermediate bitmaps
                if (originalBitmap != squaredBitmap && !originalBitmap.isRecycled) originalBitmap.recycle()
                if (squaredBitmap != resizedBitmap && !squaredBitmap.isRecycled) squaredBitmap.recycle()

                // 4. Save to Internal Storage
                val savedPath = saveToInternalStorage(context, resizedBitmap, playerId)
                
                // Release final bitmap
                if (!resizedBitmap.isRecycled) resizedBitmap.recycle()

                Result.success(savedPath)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    private fun loadBitmapFromUri(context: Context, uri: Uri): Bitmap? {
        val contentResolver = context.contentResolver
        
        // Open InputStream for Bitmap decoding
        var inputStream: InputStream? = contentResolver.openInputStream(uri)
        val bitmap = BitmapFactory.decodeStream(inputStream)
        inputStream?.close()
        
        if (bitmap == null) return null

        // Handle Orientation (EXIF)
        inputStream = contentResolver.openInputStream(uri)
        if (inputStream != null) {
            val exif = ExifInterface(inputStream)
            val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            inputStream.close()
            return rotateBitmap(bitmap, orientation)
        }
        return bitmap
    }

    private fun rotateBitmap(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            else -> return bitmap
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun cropToSquare(bitmap: Bitmap): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        val newDimension = min(width, height)
        val x = (width - newDimension) / 2
        val y = (height - newDimension) / 2
        
        return Bitmap.createBitmap(bitmap, x, y, newDimension, newDimension)
    }

    private fun saveToInternalStorage(context: Context, bitmap: Bitmap, playerId: String): String {
        // Create directory: /files/players/
        val directory = File(context.filesDir, "players")
        if (!directory.exists()) {
            directory.mkdirs()
        }

        // File path: /files/players/{playerId}.webp
        val file = File(directory, "${playerId}.webp")
        
        FileOutputStream(file).use { out ->
            val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Bitmap.CompressFormat.WEBP_LOSSY
            } else {
                Bitmap.CompressFormat.WEBP
            }
            bitmap.compress(format, COMPRESSION_QUALITY, out)
        }
        
        return file.absolutePath
    }
}
