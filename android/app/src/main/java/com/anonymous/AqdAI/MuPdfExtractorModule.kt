package com.anonymous.AqdAI

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.artifex.mupdf.fitz.Document
import android.util.Log
import java.io.File

class MuPdfExtractorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "MuPdfExtractorModule"

    @ReactMethod
    fun extractText(path: String, promise: Promise) {
        try {
            Log.d("MuPdfExtractor", "Opening PDF at path: $path")
            val file = File(path)
            if (!file.exists()) {
                Log.e("MuPdfExtractor", "File does not exist at: $path")
                promise.reject("FILE_NOT_FOUND", "File does not exist at: $path")
                return
            }
            val doc = Document.openDocument(path)
            val pageCount = doc.countPages()
            val sb = StringBuilder()
            for (i in 0 until pageCount) {
                val page = doc.loadPage(i)
                val htmlBytes = page.textAsHtml()
                val text = String(htmlBytes, Charsets.UTF_8)
                sb.append(text).append("\n")
                page.destroy()
            }
            doc.destroy()
            promise.resolve(sb.toString())
        } catch (e: Exception) {
            Log.e("MuPdfExtractor", "Extraction error", e)
            promise.reject("MuPDF_ERROR", e)
        }
    }
}
