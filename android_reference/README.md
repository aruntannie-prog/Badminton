# Android Native Reference Implementation

This folder contains a complete, production-ready implementation for **Player Avatar Selection** using Jetpack Compose.

## Features Implemented
1. **Gallery & Camera Support**: Uses `ActivityResultContracts` for strict type safety.
2. **Image Processing**:
   - **Auto-Crop**: Center-crops images to 1:1 square aspect ratio.
   - **Resize**: Downscales to 512x512 pixels.
   - **Compress**: Converts to WebP format at 90% quality.
   - **Orientation Fix**: Handles EXIF rotation automatically.
3. **Storage**: Saves processed images to internal app storage (`/files/players/{id}.webp`).
4. **Architecture**: MVVM with `ViewModel`, `Coroutines`, and Clean Architecture principles.

## Integration Steps

### 1. Add Dependencies (`app/build.gradle`)
```groovy
dependencies {
    // Jetpack Compose
    implementation "androidx.activity:activity-compose:1.8.0"
    implementation "androidx.compose.ui:ui:1.5.0"
    implementation "androidx.compose.material3:material3:1.1.0"
    
    // Image Loading (Coil)
    implementation "io.coil-kt:coil-compose:2.4.0"
    
    // Lifecycle & ViewModel
    implementation "androidx.lifecycle:lifecycle-viewmodel-compose:2.6.1"
    implementation "androidx.lifecycle:lifecycle-runtime-ktx:2.6.1"
    
    // EXIF Interface (for rotation fix)
    implementation "androidx.exifinterface:exifinterface:1.3.6"
}
```

### 2. Configure Manifest (`AndroidManifest.xml`)
Add permissions and the `FileProvider` for camera support:

```xml
<manifest ...>
    <uses-permission android:name="android.permission.CAMERA" />
    
    <!-- For Gallery on older Android versions (<13) -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />

    <application ...>
        <!-- FileProvider for secure camera URI sharing -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.provider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

### 3. File Paths (`res/xml/file_paths.xml`)
Ensure this file exists (already included in this reference):
```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="cache" path="." />
</paths>
```

## How to Use
1. Copy the `data`, `utils`, `presentation` packages to your project.
2. Call `PlayerProfileScreen()` from your main navigation graph or Activity.
3. Ensure your `Application` class is set up if using Hilt (though this example uses standard `ViewModel`).
