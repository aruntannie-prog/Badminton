package com.example.badminton.utils

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object CameraUtils {
    
    // NOTE: You must define this authority in AndroidManifest.xml
    // <provider
    //    android:name="androidx.core.content.FileProvider"
    //    android:authorities="${applicationId}.provider"
    //    ... />
    private const val AUTHORITY_SUFFIX = ".provider"

    fun createTempPictureUri(context: Context): Uri {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val imageFileName = "JPEG_" + timeStamp + "_"
        
        // Use cache directory for temp camera files
        val storageDir = context.cacheDir
        
        val image = File.createTempFile(
            imageFileName,  /* prefix */
            ".jpg",         /* suffix */
            storageDir      /* directory */
        )

        return FileProvider.getUriForFile(
            context,
            "${context.packageName}$AUTHORITY_SUFFIX",
            image
        )
    }
}
