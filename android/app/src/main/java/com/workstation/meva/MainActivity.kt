package com.workstation.meva

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var controlPanel: View
    private lateinit var btnStart: MaterialButton
    private lateinit var btnStop: MaterialButton
    private lateinit var btnOpen: MaterialButton
    private lateinit var statusDot: View
    private lateinit var statusPulse: View
    private lateinit var statusText: TextView
    private lateinit var statusMessage: TextView
    private lateinit var serverInfo: View
    private lateinit var uptimeText: TextView
    private lateinit var subtitle: TextView

    private val handler = Handler(Looper.getMainLooper())
    private var uptimeSeconds = 0L
    private var uptimeRunnable: Runnable? = null
    private var pulseAnimator: ObjectAnimator? = null
    private var currentStatus = ""

    companion object {
        const val SERVER_URL = "http://127.0.0.1:3002"
        const val HEALTH_URL = "$SERVER_URL/api/health"
        const val NOTIFICATION_PERMISSION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        controlPanel = findViewById(R.id.controlPanel)
        btnStart = findViewById(R.id.btnStart)
        btnStop = findViewById(R.id.btnStop)
        btnOpen = findViewById(R.id.btnOpen)
        statusDot = findViewById(R.id.statusDot)
        statusPulse = findViewById(R.id.statusPulse)
        statusText = findViewById(R.id.statusText)
        statusMessage = findViewById(R.id.statusMessage)
        serverInfo = findViewById(R.id.serverInfo)
        uptimeText = findViewById(R.id.uptimeText)
        subtitle = findViewById(R.id.subtitle)

        setupWebView()
        setupButtons()
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    override fun onPause() {
        super.onPause()
        stopUptimeCounter()
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportMultipleWindows(false)
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (view?.visibility == View.VISIBLE && request?.url?.toString()?.contains("127.0.0.1") == true) {
                    view.postDelayed({ view.reload() }, 2000)
                }
            }
        }

        webView.webChromeClient = WebChromeClient()
    }

    private fun setupButtons() {
        btnStart.setOnClickListener { startServer() }
        btnStop.setOnClickListener { stopServer() }
        btnOpen.setOnClickListener { openWorkstation() }

        // Button press animations
        listOf(btnStart, btnStop, btnOpen).forEach { btn ->
            btn.setOnTouchListener { v, event ->
                when (event.action) {
                    android.view.MotionEvent.ACTION_DOWN -> {
                        v.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
                    }
                    android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                        v.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                        v.performClick()
                    }
                }
                true
            }
        }
    }

    private fun startServer() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION
            )
        }

        render(NodeService.STATUS_STARTING, "Starting server...")
        subtitle.text = "Starting..."

        val intent = Intent(this, NodeService::class.java).apply {
            action = NodeService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }

        lifecycleScope.launch {
            val ok = waitForServer(120_000)
            if (ok) {
                render(NodeService.STATUS_RUNNING, "Server running on port ${NodeService.SERVER_PORT}")
                subtitle.text = "All systems operational"
                startUptimeCounter()
            } else {
                render(
                    NodeService.STATUS_ERROR,
                    "Server did not start. Check notification for details."
                )
                subtitle.text = "Connection failed"
            }
        }
    }

    private fun stopServer() {
        render("stopping", "Stopping server...")
        subtitle.text = "Shutting down..."

        val intent = Intent(this, NodeService::class.java).apply {
            action = NodeService.ACTION_STOP
        }
        startService(intent)

        lifecycleScope.launch {
            var waited = 0
            while (waited < 15_000) {
                delay(500)
                if (!isServerUp(500)) break
                waited += 500
            }
            stopUptimeCounter()
            uptimeSeconds = 0
            refreshStatus()
        }
    }

    private fun openWorkstation() {
        lifecycleScope.launch {
            btnOpen.isEnabled = false
            btnOpen.text = "Connecting..."

            val ok = waitForServer(10_000)
            if (ok) {
                showWorkstation()
            } else {
                render(NodeService.STATUS_ERROR, "Cannot reach server. Press Start first.")
                btnOpen.isEnabled = true
                btnOpen.text = "Open Workstation"
            }
        }
    }

    private fun showWorkstation() {
        controlPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl(SERVER_URL)
    }

    private fun refreshStatus() {
        val prefs = getSharedPreferences(NodeService.PREF_STATUS, MODE_PRIVATE)
        val saved = prefs.getString(NodeService.PREF_STATUS, NodeService.STATUS_STOPPED) ?: NodeService.STATUS_STOPPED
        val savedMsg = prefs.getString(NodeService.PREF_STATUS_MESSAGE, null)

        lifecycleScope.launch {
            val alive = isServerUp(1000)
            when {
                alive -> {
                    render(NodeService.STATUS_RUNNING, "Server running on port ${NodeService.SERVER_PORT}")
                    subtitle.text = "All systems operational"
                    serverInfo.visibility = View.VISIBLE
                    startUptimeCounter()
                }
                saved == NodeService.STATUS_RUNNING -> {
                    render(NodeService.STATUS_ERROR, "Server stopped unexpectedly.")
                    subtitle.text = "Connection lost"
                    stopUptimeCounter()
                }
                else -> {
                    render(saved, savedMsg ?: "Press Start Server to begin")
                    subtitle.text = "Server Control"
                    stopUptimeCounter()
                }
            }
        }
    }

    private fun render(status: String, message: String) {
        currentStatus = status
        val (label, color) = when (status) {
            NodeService.STATUS_RUNNING -> "Running" to Color.parseColor("#00E676")
            NodeService.STATUS_STARTING -> "Starting\u2026" to Color.parseColor("#FFC107")
            NodeService.STATUS_ERROR -> "Error" to Color.parseColor("#FF5252")
            else -> "Stopped" to Color.parseColor("#6B6F80")
        }

        statusText.text = label
        statusText.setTextColor(color)
        statusMessage.text = message

        // Update dot
        (statusDot.background as? GradientDrawable)?.setColor(color)
        (statusPulse.background as? GradientDrawable)?.setColor(color)

        // Pulse animation for running state
        if (status == NodeService.STATUS_RUNNING) {
            startPulseAnimation()
            serverInfo.visibility = View.VISIBLE
        } else {
            stopPulseAnimation()
            if (status != "stopping") serverInfo.visibility = View.GONE
        }

        // Button states
        btnOpen.isEnabled = status == NodeService.STATUS_RUNNING
        btnOpen.text = if (status == NodeService.STATUS_RUNNING) "Open Workstation" else "Open Workstation"
        btnStart.isEnabled = status != NodeService.STATUS_STARTING
        btnStop.isEnabled = status == NodeService.STATUS_RUNNING || status == NodeService.STATUS_STARTING
    }

    private fun startPulseAnimation() {
        stopPulseAnimation()
        pulseAnimator = ObjectAnimator.ofPropertyValuesHolder(
            statusPulse,
            PropertyValuesHolder.ofFloat("scaleX", 1f, 2.2f),
            PropertyValuesHolder.ofFloat("scaleY", 1f, 2.2f),
            PropertyValuesHolder.ofFloat("alpha", 0.6f, 0f)
        ).apply {
            duration = 1200
            repeatCount = ObjectAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun stopPulseAnimation() {
        pulseAnimator?.cancel()
        pulseAnimator = null
        statusPulse.scaleX = 1f
        statusPulse.scaleY = 1f
        statusPulse.alpha = 0.6f
    }

    private fun startUptimeCounter() {
        stopUptimeCounter()
        uptimeSeconds = 0
        uptimeRunnable = object : Runnable {
            override fun run() {
                uptimeSeconds++
                val h = uptimeSeconds / 3600
                val m = (uptimeSeconds % 3600) / 60
                val s = uptimeSeconds % 60
                uptimeText.text = when {
                    h > 0 -> String.format(Locale.US, "%dh %dm %ds", h, m, s)
                    m > 0 -> String.format(Locale.US, "%dm %ds", m, s)
                    else -> String.format(Locale.US, "%ds", s)
                }
                handler.postDelayed(this, 1000)
            }
        }
        handler.postDelayed(uptimeRunnable!!, 1000)
    }

    private fun stopUptimeCounter() {
        uptimeRunnable?.let { handler.removeCallbacks(it) }
        uptimeRunnable = null
    }

    private fun isServerUp(timeoutMs: Int): Boolean {
        return try {
            val client = URL(HEALTH_URL).openConnection() as HttpURLConnection
            client.connectTimeout = timeoutMs
            client.readTimeout = timeoutMs
            client.requestMethod = "GET"
            val code = client.responseCode
            client.disconnect()
            code == 200
        } catch (_: Exception) {
            false
        }
    }

    private suspend fun waitForServer(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (isServerUp(1000)) return true
            delay(1000)
        }
        return isServerUp(1000)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.visibility == View.VISIBLE) {
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                webView.stopLoading()
                webView.visibility = View.GONE
                controlPanel.visibility = View.VISIBLE
                refreshStatus()
            }
        } else {
            AlertDialog.Builder(this)
                .setTitle("Exit Workstation Meva?")
                .setMessage("The server will keep running in the background.")
                .setPositiveButton("Stop & Exit") { _, _ ->
                    stopServer()
                    finish()
                }
                .setNegativeButton("Keep Running") { _, _ ->
                    finish()
                }
                .setNeutralButton("Cancel", null)
                .show()
        }
    }

    override fun onDestroy() {
        stopUptimeCounter()
        stopPulseAnimation()
        webView.destroy()
        super.onDestroy()
    }
}
