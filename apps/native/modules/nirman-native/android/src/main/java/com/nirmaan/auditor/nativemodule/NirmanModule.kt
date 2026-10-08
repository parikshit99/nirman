package com.nirmaan.auditor.nativemodule

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
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

    // --- First launch after 6.x -------------------------------------------------------------
    // The databases folder is outside what expo-file-system may touch, so these are done here.

    /**
     * The database file (and its -wal/-journal companions), the free space beside it, and whether the
     * Capacitor app has left files (its WebView folder), which means it had data on this phone.
     */
    Function("databaseInfo") { name: String ->
      val file = context.getDatabasePath(name)
      val dataDir = context.filesDir.parentFile
      mapOf(
        "exists" to file.exists(),
        "size" to companions(file).sumOf { it.length().toDouble() },
        "freeBytes" to (file.parentFile?.takeIf { it.exists() } ?: context.filesDir).usableSpace.toDouble(),
        "otherAppFiles" to (dataDir != null && File(dataDir, "app_webview").exists())
      )
    }

    /** Copies a database file and its companions to `to` (same folder); false if there was nothing to copy. */
    AsyncFunction("copyDatabase") { from: String, to: String ->
      val source = context.getDatabasePath(from)
      if (!source.exists()) return@AsyncFunction false
      val target = context.getDatabasePath(to)
      for (file in companions(source)) file.copyTo(File(target.path + file.path.removePrefix(source.path)), overwrite = true)
      true
    }

    /** Renames a database file and its companions to `to` (same folder), so a new one can start in its place. */
    Function("setDatabaseAside") { from: String, to: String ->
      val source = context.getDatabasePath(from)
      val target = context.getDatabasePath(to)
      for (file in companions(source)) file.renameTo(File(target.path + file.path.removePrefix(source.path)))
    }

    /** Whether a file in the databases folder exists. */
    Function("databaseExists") { name: String -> context.getDatabasePath(name).exists() }

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

    // --- Documents --------------------------------------------------------------------------
    // Each page of a PDF as a JPG (base64), drawn with Android's own PdfRenderer at `scale` times
    // the PDF's size so text stays sharp. The empty part below the last line is cut off, keeping a
    // margin, so a short list isn't mostly white. Used for the preview and for sharing as JPG.
    AsyncFunction("renderPdf") { path: String, scale: Double ->
      val pages = ArrayList<String>()
      ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { renderer ->
          for (i in 0 until renderer.pageCount) {
            renderer.openPage(i).use { page ->
              val bitmap = Bitmap.createBitmap(Math.ceil(page.width * scale).toInt(), Math.ceil(page.height * scale).toInt(), Bitmap.Config.ARGB_8888)
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val cropped = cropBlankBottom(bitmap)
              val out = ByteArrayOutputStream()
              cropped.compress(Bitmap.CompressFormat.JPEG, 90, out)
              pages.add(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
              if (cropped !== bitmap) cropped.recycle()
              bitmap.recycle()
            }
          }
        }
      }
      pages
    }

    // Android's share sheet for one or several files (written in the cache folder by the app):
    // save to Files, WhatsApp, email…
    AsyncFunction("shareFiles") { paths: List<String>, mimeTypes: List<String>, title: String ->
      val activity = appContext.currentActivity ?: throw IllegalStateException("The app is not in front")
      val authority = "${context.packageName}.FileSystemFileProvider"
      val uris = ArrayList<Uri>(paths.map { FileProvider.getUriForFile(context, authority, File(it)) })
      val type = if (mimeTypes.distinct().size == 1) mimeTypes[0] else "*/*"
      val intent = if (uris.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0]) else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
      intent.type = type
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      // Lets the receiving app read every file.
      val clip = ClipData.newRawUri(title, uris[0])
      for (uri in uris.drop(1)) clip.addItem(ClipData.Item(uri))
      intent.clipData = clip
      activity.startActivity(Intent.createChooser(intent, title))
      Unit
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

  /** Cuts the empty part of a page below its last line, keeping a margin; the page itself if there is little to cut. */
  private fun cropBlankBottom(bitmap: Bitmap): Bitmap {
    val width = bitmap.width
    val height = bitmap.height
    val row = IntArray(width)
    var last = 0
    var y = height - 1
    while (y >= 0 && last == 0) {
      bitmap.getPixels(row, 0, width, 0, y, width, 1)
      for (x in 0 until width step 2) {
        val p = row[x]
        if (Color.red(p) < 235 || Color.green(p) < 235 || Color.blue(p) < 235) {
          last = y
          break
        }
      }
      y--
    }
    val cropped = minOf(height, last + 60)
    if (last == 0 || cropped >= height * 0.95) return bitmap
    return Bitmap.createBitmap(bitmap, 0, 0, width, cropped)
  }

  /** A SQLite file and those that belong with it (write-ahead log, shared memory, rollback journal) that exist. */
  private fun companions(file: File): List<File> =
    listOf("", "-wal", "-shm", "-journal").map { File(file.path + it) }.filter { it.exists() }

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
