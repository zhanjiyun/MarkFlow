package com.markflow.editor

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter

/**
 * Tauri 2 Android plugin for SAF (Storage Access Framework) file access.
 *
 * Registered on the native side by the Rust plugin in `src-tauri/src/lib.rs`
 * (`android_saf::init`) via `register_android_plugin("com.markflow.editor", "FileAccessPlugin")`.
 *
 * Provides pickAndReadFile, writeFileViaUri, createNewFile, and saveFileAs
 * commands. File-picker flows use `startActivityForResult` + `@ActivityCallback`;
 * the result is dispatched by Tauri's PluginManager.
 */
@TauriPlugin
class FileAccessPlugin(private val activity: Activity) : Plugin(activity) {

    // ────────────────────────────────────────────────
    // pickAndReadFile — ACTION_OPEN_DOCUMENT
    // ────────────────────────────────────────────────

    @Command
    fun pickAndReadFile(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "text/*"
            putExtra(
                Intent.EXTRA_MIME_TYPES,
                arrayOf("text/markdown", "text/plain", "application/octet-stream")
            )
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
        }
        startActivityForResult(invoke, intent, "pickAndReadFileResult")
    }

    @ActivityCallback
    fun pickAndReadFileResult(invoke: Invoke, result: ActivityResult) {
        if (!isOk(result)) {
            invoke.resolve(cancelled())
            return
        }
        val uri = result.data?.data ?: run {
            invoke.resolve(cancelled())
            return
        }
        try {
            val contentResolver = activity.contentResolver
            takePersistablePermission(uri, readOnly = true)

            val content = contentResolver.openInputStream(uri)?.use { inputStream ->
                BufferedReader(InputStreamReader(inputStream, Charsets.UTF_8)).readText()
            } ?: ""

            invoke.resolve(JSObject().apply {
                put("uri", uri.toString())
                put("name", queryDisplayName(uri) ?: "untitled.md")
                put("content", content)
            })
        } catch (e: Exception) {
            invoke.reject("Failed to read file: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────
    // createNewFile — ACTION_CREATE_DOCUMENT
    // ────────────────────────────────────────────────

    @Command
    fun createNewFile(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "text/markdown"
            putExtra(Intent.EXTRA_TITLE, "untitled.md")
        }
        startActivityForResult(invoke, intent, "createNewFileResult")
    }

    @ActivityCallback
    fun createNewFileResult(invoke: Invoke, result: ActivityResult) {
        if (!isOk(result)) {
            invoke.resolve(cancelled())
            return
        }
        val uri = result.data?.data ?: run {
            invoke.resolve(cancelled())
            return
        }
        try {
            val contentResolver = activity.contentResolver
            takePersistablePermission(uri, readOnly = false)

            // Write empty content to initialise the file
            openForWrite(uri) { writer -> writer.write("") } ?: run {
                invoke.reject("Cannot open output stream for URI: $uri")
                return
            }

            invoke.resolve(JSObject().apply {
                put("uri", uri.toString())
                put("name", queryDisplayName(uri) ?: "untitled.md")
            })
        } catch (e: Exception) {
            invoke.reject("Failed to create file: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────
    // saveFileAs — ACTION_CREATE_DOCUMENT + write
    // ────────────────────────────────────────────────

    private var pendingSaveContent: String? = null

    @Command
    fun saveFileAs(invoke: Invoke) {
        val args = invoke.parseArgs(SaveFileAsArgs::class.java) ?: run {
            invoke.reject("Missing arguments")
            return
        }

        pendingSaveContent = args.content ?: ""

        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "text/markdown"
            putExtra(Intent.EXTRA_TITLE, args.suggestedName ?: "untitled.md")
        }
        startActivityForResult(invoke, intent, "saveFileAsResult")
    }

    @ActivityCallback
    fun saveFileAsResult(invoke: Invoke, result: ActivityResult) {
        if (!isOk(result)) {
            invoke.resolve(cancelled())
            return
        }
        val uri = result.data?.data ?: run {
            invoke.resolve(cancelled())
            return
        }
        try {
            val contentResolver = activity.contentResolver
            takePersistablePermission(uri, readOnly = false)

            val content = pendingSaveContent ?: ""
            pendingSaveContent = null

            openForWrite(uri) { writer -> writer.write(content) } ?: run {
                invoke.reject("Cannot open output stream for URI: $uri")
                return
            }

            invoke.resolve(JSObject().apply {
                put("uri", uri.toString())
                put("name", queryDisplayName(uri) ?: "untitled.md")
            })
        } catch (e: Exception) {
            invoke.reject("Failed to save file: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────
    // writeFileViaUri — write directly to existing URI
    // ────────────────────────────────────────────────

    @Command
    fun writeFileViaUri(invoke: Invoke) {
        val args = invoke.parseArgs(WriteFileArgs::class.java) ?: run {
            invoke.reject("Missing arguments")
            return
        }
        val uri = args.uri ?: run {
            invoke.reject("Missing URI")
            return
        }

        try {
            val parsedUri = Uri.parse(uri)
            takePersistablePermission(parsedUri, readOnly = false)

            openForWrite(parsedUri) { writer -> writer.write(args.content ?: "") } ?: run {
                invoke.reject("Cannot open output stream for URI: $uri")
                return
            }

            invoke.resolve(JSObject().apply { put("ok", true) })
        } catch (e: Exception) {
            invoke.reject("writeFileViaUri failed: ${e.message}")
        }
    }

    // ────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────

    private fun isOk(result: ActivityResult): Boolean =
        result.resultCode == Activity.RESULT_OK

    private fun cancelled(): JSObject = JSObject().apply { put("cancelled", true) }

    private fun queryDisplayName(uri: Uri): String? =
        activity.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIdx >= 0) cursor.getString(nameIdx) else null
        }

    private fun takePersistablePermission(uri: Uri, readOnly: Boolean) {
        try {
            val flags = if (readOnly) {
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            } else {
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            }
            activity.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            // Permission may already be held or not grantable
        }
    }

    private fun openForWrite(uri: Uri, block: (OutputStreamWriter) -> Unit): Boolean? {
        val stream = activity.contentResolver.openOutputStream(uri, "wt") ?: return null
        OutputStreamWriter(stream, Charsets.UTF_8).use { writer -> block(writer) }
        return true
    }
}

// ── Argument classes for invoke.parseArgs (Jackson-compatible plain classes) ──

@InvokeArg
class WriteFileArgs {
    var uri: String? = null
    var content: String? = null
}

@InvokeArg
class SaveFileAsArgs {
    var content: String? = null
    var suggestedName: String? = null
}