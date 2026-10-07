package com.nirmaan.auditor.nativemodule

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.MimeTypeMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Nirman's own Android code, ported from apps/mobile's Capacitor plugins
 * (TextReaderPlugin, SharedFilesPlugin, HapticsPlugin) with the same logic,
 * plus where the Capacitor app keeps its database.
 */
class NirmanModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private var recognizer: TextRecognizer? = null

  /** The last share from another app, kept until the app takes it. */
  private var pendingShare: Map<String, Any>? = null

  override fun definition() = ModuleDefinition {
    Name("Nirman")

    Events("shared")

    /** Full path of a database file in the app's databases folder, where @capacitor-community/sqlite keeps it. */
    Function("databasePath") { name: String -> context.getDatabasePath(name).absolutePath }

    // --- TextReader -------------------------------------------------------------------------
    // Reads the text on a bill photo on the phone itself (Google ML Kit text recognition, model
    // bundled in the app), so no internet or API key is needed. Returns each line with its
    // position, so the app can rebuild the bill's rows.
    AsyncFunction("readText") { image: String, promise: Promise ->
      var data = image
      val comma = data.indexOf(',')
      if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1)
      val bitmap = try {
        val bytes = Base64.decode(data, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      } catch (e: IllegalArgumentException) {
        null
      }
      if (data.isEmpty() || bitmap == null) {
        promise.reject("ERR_PHOTO", "The photo could not be read", null)
        return@AsyncFunction
      }
      val reader = recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }
      reader
        .process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { block ->
            block.lines.mapNotNull { line ->
              val box = line.boundingBox ?: return@mapNotNull null
              mapOf("text" to line.text, "left" to box.left, "top" to box.top, "right" to box.right, "bottom" to box.bottom)
            }
          }
          promise.resolve(mapOf("lines" to lines, "text" to text.text))
        }
        .addOnFailureListener { e -> promise.reject("ERR_TEXT", e.message ?: "Text recognition failed", e) }
    }

    // --- Haptics ----------------------------------------------------------------------------
    // A short buzz when a button is pressed, using Android's own touch feedback (the same as
    // native apps), so it follows the phone's "Touch feedback" setting and needs no vibrate permission.
    AsyncFunction("haptic") { type: String ->
      val feedback = when (type) {
        "tick" -> HapticFeedbackConstants.CLOCK_TICK
        "confirm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
        "reject" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        else -> HapticFeedbackConstants.CONTEXT_CLICK
      }
      appContext.currentActivity?.window?.decorView?.performHapticFeedback(feedback)
      Unit
    }.runOnQueue(Queues.MAIN)

    // --- SharedFiles ------------------------------------------------------------------------
    // Receives photos and text shared to Nirman from other apps (e.g. a bill forwarded on
    // WhatsApp). Each photo is copied into the app's cache. A share is kept until the app takes
    // it, so a share that starts the app is not lost; "shared" says a new one arrived.

    /** The share that started or reached the app, once: `{ files: [{ path, mimeType }], text }`, or null. */
    Function("takeShared") {
      appContext.currentActivity?.let { activity ->
        if (handle(activity.intent)) {
          // Don't read the same share again if the activity is recreated.
          activity.intent = Intent(Intent.ACTION_MAIN)
        }
      }
      val share = pendingShare
      pendingShare = null
      share
    }

    OnNewIntent { intent ->
      if (handle(intent) && pendingShare != null) sendEvent("shared", emptyMap<String, Any>())
    }

    OnDestroy {
      recognizer?.close()
    }
  }

  private fun handle(intent: Intent?): Boolean {
    if (intent == null) return false
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return false

    val uris = ArrayList<Uri>()
    if (action == Intent.ACTION_SEND) {
      val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else legacyStream(intent)
      if (uri != null) uris.add(uri)
    } else {
      val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else legacyStreams(intent)
      if (list != null) uris.addAll(list)
    }

    val files = ArrayList<Map<String, String>>()
    val dir = File(context.cacheDir, "shared")
    dir.mkdirs()
    val stamp = System.currentTimeMillis()
    for ((i, uri) in uris.take(MAX_FILES).withIndex()) {
      try {
        var mimeType = context.contentResolver.getType(uri)
        val name = displayName(uri)
        if (mimeType == null && name != null) {
          val dot = name.lastIndexOf('.')
          if (dot > 0) mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(dot + 1).lowercase())
        }
        if (mimeType == null || !mimeType.startsWith("image/")) continue
        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
        val out = File(dir, "share_${stamp}_$i.${ext ?: "img"}")
        val input = context.contentResolver.openInputStream(uri) ?: continue
        input.use { stream -> FileOutputStream(out).use { stream.copyTo(it, 8192) } }
        files.add(mapOf("path" to out.absolutePath, "mimeType" to mimeType))
      } catch (e: Exception) {
        Log.e(TAG, "Could not read shared file $uri", e)
      }
    }

    val text = intent.getStringExtra(Intent.EXTRA_TEXT)
    if (files.isEmpty() && text.isNullOrBlank()) return true
    pendingShare = mapOf("files" to files, "text" to (text ?: ""))
    return true
  }

  private fun displayName(uri: Uri): String? {
    if (uri.scheme == "file") return uri.path?.let { File(it).name }
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) return cursor.getString(0)
      }
    } catch (e: Exception) {
      Log.w(TAG, "No name for $uri", e)
    }
    return null
  }

  @Suppress("DEPRECATION")
  private fun legacyStream(intent: Intent): Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun legacyStreams(intent: Intent): ArrayList<Uri>? = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)

  companion object {
    private const val TAG = "SharedFiles"
    private const val MAX_FILES = 10
  }
}
