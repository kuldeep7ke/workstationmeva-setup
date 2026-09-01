package com.workstation.meva

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.res.AssetManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream

class NodeService : Service() {

    companion object {
        const val TAG = "NodeService"
        const val ACTION_START = "com.workstation.meva.START"
        const val ACTION_STOP = "com.workstation.meva.STOP"
        const val CHANNEL_ID = "meva_server_channel"
        const val NOTIFICATION_ID = 1

        const val PREF_STATUS = "server_status"
        const val PREF_STATUS_MESSAGE = "server_status_message"

        const val STATUS_STOPPED = "stopped"
        const val STATUS_STARTING = "starting"
        const val STATUS_RUNNING = "running"
        const val STATUS_ERROR = "error"

        const val SERVER_PORT = 3002
    }

    private var nodeProcess: Process? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isRunning = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startNode()
            ACTION_STOP -> stopNode()
        }
        return START_NOT_STICKY
    }

    private fun setStatus(status: String, message: String) {
        getSharedPreferences(PREF_STATUS, MODE_PRIVATE).edit()
            .putString(PREF_STATUS, status)
            .putString(PREF_STATUS_MESSAGE, message)
            .apply()
    }

    private fun extractAssets() {
        val assetsDir = File(filesDir, "server")
        val extractedMarker = File(filesDir, "server/extracted-v$packageInfoVersionCode")
        if (assetsDir.exists() && extractedMarker.exists() && File(assetsDir, "dist/index.js").exists()) return

        updateNotification("Extracting app files...")
        setStatus(STATUS_STARTING, "Extracting app files...")
        extractAssetDir("server", filesDir)
        extractAssetDir("frontend", filesDir)
        extractAssetDir("node", filesDir)
        extractedMarker.createNewFile()

        // Make node binary executable
        val arch = System.getProperty("os.arch") ?: "arm64"
        val nodeBin = File(filesDir, if (arch.contains("64")) "node/bin/node-arm64" else "node/bin/node-armv7l")
        if (nodeBin.exists()) {
            makeExecutable(nodeBin)
        }
    }

    private val packageInfoVersionCode: Int
        get() = try {
            packageManager.getPackageInfo(packageName, 0).versionCode
        } catch (e: Exception) {
            0
        }

    private fun makeExecutable(file: File) {
        // Method 1: Java API
        if (file.setExecutable(true, false)) {
            Log.d(TAG, "setExecutable OK: ${file.absolutePath}")
            return
        }
        // Method 2: chmod via shell (fallback)
        try {
            val pb = ProcessBuilder("sh", "-c", "chmod +x ${file.absolutePath}")
            pb.redirectErrorStream(true)
            val p = pb.start()
            p.waitFor()
            if (file.canExecute()) {
                Log.d(TAG, "chmod OK: ${file.absolutePath}")
                return
            }
        } catch (e: Exception) {
            Log.w(TAG, "chmod fallback failed: ${e.message}")
        }
        // Method 3: copy to cache dir with execute bit (last resort)
        try {
            val tmp = File(cacheDir, file.name)
            file.copyTo(tmp, overwrite = true)
            tmp.setExecutable(true, false)
            if (tmp.canExecute()) {
                tmp.copyTo(file, overwrite = true)
                file.setExecutable(true, false)
                Log.d(TAG, "cache-copy OK: ${file.absolutePath}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "All executable methods failed for ${file.name}: ${e.message}")
        }
    }

    private fun extractAssetDir(assetPath: String, targetDir: File) {
        val assetManager = assets
        try {
            val files = assetManager.list(assetPath) ?: return
            if (files.isEmpty()) {
                // It's a file — copy it
                val outFile = File(targetDir, assetPath)
                outFile.parentFile?.mkdirs()
                assetManager.open(assetPath).use { input ->
                    FileOutputStream(outFile).use { output ->
                        input.copyTo(output)
                    }
                }
            } else {
                // It's a directory — recurse
                val outDir = File(targetDir, assetPath)
                outDir.mkdirs()
                for (file in files) {
                    extractAssetDir("$assetPath/$file", targetDir)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract $assetPath", e)
        }
    }

    private fun startNode() {
        if (isRunning) return

        startForeground(NOTIFICATION_ID, buildNotification("Starting server..."))
        setStatus(STATUS_STARTING, "Starting server...")

        scope.launch {
            try {
                extractAssets()

                val arch = System.getProperty("os.arch") ?: "arm64"
                val nodeBin = File(filesDir, if (arch.contains("64")) "node/bin/node-arm64" else "node/bin/node-armv7l")
                val serverScript = File(filesDir, "server/dist/index.js")
                val workDir = File(filesDir, "server")

                if (!nodeBin.exists()) {
                    val msg = "Node binary missing: ${nodeBin.absolutePath}"
                    Log.e(TAG, msg)
                    setStatus(STATUS_ERROR, msg)
                    updateNotification("Node binary missing")
                    stopSelf()
                    return@launch
                }

                // Ensure binary is executable (safety net)
                if (!nodeBin.canExecute()) {
                    makeExecutable(nodeBin)
                    Log.d(TAG, "Re-executable check: canExecute=${nodeBin.canExecute()}")
                }

                if (!serverScript.exists()) {
                    val msg = "Server bundle missing: ${serverScript.absolutePath}"
                    Log.e(TAG, msg)
                    setStatus(STATUS_ERROR, msg)
                    updateNotification("Server bundle missing")
                    stopSelf()
                    return@launch
                }

                val envVars = mutableMapOf(
                    "NODE_ENV" to "production",
                    "PORT" to SERVER_PORT.toString(),
                    "HOME" to filesDir.absolutePath,
                    "NODE_PATH" to File(workDir, "node_modules").absolutePath,
                    "ANDROID" to "true"
                )

                val processBuilder = ProcessBuilder(
                    nodeBin.absolutePath, serverScript.absolutePath
                ).apply {
                    directory(workDir)
                    environment().putAll(envVars)
                    redirectErrorStream(true)
                }

                nodeProcess = processBuilder.start()
                isRunning = true

                setStatus(STATUS_RUNNING, "Server running on port $SERVER_PORT")
                updateNotification("Server running on port $SERVER_PORT")

                // Read stdout+stderr (redirectErrorStream merges them)
                val reader = nodeProcess!!.inputStream.bufferedReader()
                while (isActive) {
                    val line = reader.readLine() ?: break
                    Log.d(TAG, line)
                }

                // Process exited — check exit code
                val exitCode = nodeProcess?.waitFor() ?: -1
                Log.e(TAG, "Node process exited with code $exitCode")
                isRunning = false
                setStatus(STATUS_ERROR, "Server stopped (exit code $exitCode)")
                updateNotification("Server stopped (exit $exitCode)")
                stopSelf()
            } catch (e: Exception) {
                Log.e(TAG, "Node failed to start", e)
                isRunning = false
                setStatus(STATUS_ERROR, "Server failed: ${e.message}")
                updateNotification("Server failed: ${e.message}")
                stopSelf()
            }
        }
    }

    private fun stopNode() {
        nodeProcess?.destroy()
        nodeProcess = null
        isRunning = false
        setStatus(STATUS_STOPPED, "Server stopped")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Workstation Meva Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows the server status"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Workstation Meva")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    override fun onDestroy() {
        scope.cancel()
        nodeProcess?.destroy()
        super.onDestroy()
    }
}
