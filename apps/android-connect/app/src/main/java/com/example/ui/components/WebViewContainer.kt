package com.example.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.util.Log
import android.view.ViewGroup
import android.webkit.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.example.data.AppClone

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewContainer(
    clone: AppClone,
    onProgressChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    isMultiProfileActive: Boolean = true,
    onWebViewCreated: (WebView) -> Unit = {}
) {
    var isLoading by remember { mutableStateOf(true) }
    var progress by remember { mutableStateOf(0) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    Box(modifier = modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AndroidView(
            factory = { context ->
                try {
                    WebView(context).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )

                        // Enable multi-profile if supported and active
                        val isMultiProfileSupported = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
                        if (isMultiProfileSupported && isMultiProfileActive) {
                            try {
                                val profileStore = ProfileStore.getInstance()
                                val profile = profileStore.getOrCreateProfile("clone_space_${clone.id}")
                                WebViewCompat.setProfile(this, profile.name)
                                Log.d("WebViewContainer", "Profile successfully loaded for ID: ${clone.id}")
                            } catch (e: Throwable) {
                                Log.e("WebViewContainer", "Failed to set up isolated profile", e)
                            }
                        }

                        // Strict webview security and features configuration
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        settings.allowContentAccess = true
                        settings.allowFileAccess = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.javaScriptCanOpenWindowsAutomatically = true
                        
                        // Set modern viewport sizes
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        
                        try {
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        } catch (e: Throwable) {
                            Log.e("WebViewContainer", "Cannot set mixedContentMode", e)
                        }
                        settings.cacheMode = WebSettings.LOAD_DEFAULT

                        // Enable dynamic cookie synchronization
                        try {
                            val cookieManager = CookieManager.getInstance()
                            cookieManager.setAcceptCookie(true)
                            cookieManager.setAcceptThirdPartyCookies(this, true)
                        } catch (e: Throwable) {
                            Log.e("WebViewContainer", "Failed to configure CookieManager", e)
                        }

                        // Enable pinch to zoom
                        settings.setSupportZoom(true)
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false

                        // IMPORTANT: WhatsApp Web and other desktop versions require a desktop User-Agent to render QR and chat.
                        settings.userAgentString = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

                        // Set initial scale/zoom
                        setInitialScale(clone.zoomLevel)

                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                super.onProgressChanged(view, newProgress)
                                progress = newProgress
                                onProgressChange(newProgress)
                                if (newProgress >= 100) {
                                    isLoading = false
                                }
                            }

                            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                                try {
                                    Log.d("WebViewJS", "${consoleMessage?.message()} -- From line ${consoleMessage?.lineNumber()} of ${consoleMessage?.sourceId()}")
                                } catch (e: Throwable) {
                                    Log.e("WebViewJS", "Failed to parse log", e)
                                }
                                return true
                            }
                        }

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                isLoading = true
                                loadError = null
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                isLoading = false
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?
                            ) {
                                try {
                                    super.onReceivedError(view, request, error)
                                    // Skip subresource loading errors to avoid breaking valid chats
                                    if (request?.isForMainFrame == true) {
                                        loadError = error?.description?.toString() ?: "Erro de conexão"
                                    }
                                } catch (e: Throwable) {
                                    Log.e("WebViewContainer", "Error handling onReceivedError", e)
                                }
                            }
                        }

                        loadUrl(clone.url)
                        webViewRef = this
                        onWebViewCreated(this)
                    }
                } catch (e: Throwable) {
                    Log.e("WebViewContainer", "Critical failure during WebView construction", e)
                    // Return standard empty view to guarantee zero crashes if system lacks WebView packages
                    android.view.View(context).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                }
            },
            update = { webView ->
                try {
                    // Apply update to zoom scale dynamically if it changes
                    (webView as? WebView)?.setInitialScale(clone.zoomLevel)
                } catch (e: Throwable) {
                    Log.e("WebViewContainer", "Failed to apply zoom scale", e)
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Loading Linear Indicator
        if (isLoading && progress < 100) {
            LinearProgressIndicator(
                progress = { progress / 100f },
                modifier = Modifier.fillMaxWidth().height(3.dp).align(Alignment.TopCenter),
                color = Color(android.graphics.Color.parseColor(clone.colorHex)),
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
        }

        // Full Screen Loader for first init
        if (isLoading && progress < 25) {
            Box(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(android.graphics.Color.parseColor(clone.colorHex)))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Carregando ${clone.name}...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                }
            }
        }

        // Error Screen
        loadError?.let { errMsg ->
            Box(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Não foi possível carregar a sessão",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = errMsg,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        androidx.compose.material3.OutlinedButton(
                            onClick = { loadError = null }
                        ) {
                            Text("Ignorar")
                        }
                        androidx.compose.material3.Button(
                            onClick = {
                                loadError = null
                                webViewRef?.reload()
                            },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.onBackground,
                                contentColor = MaterialTheme.colorScheme.background
                            )
                        ) {
                            Text("Tentar Novamente")
                        }
                    }
                }
            }
        }
    }
}
