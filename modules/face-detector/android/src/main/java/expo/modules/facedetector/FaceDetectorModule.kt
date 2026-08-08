package expo.modules.facedetector

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android face detection with Google ML Kit. Boxes come back in image
 * pixels; they are normalized here so the JS side gets the same top-left
 * fractions Apple Vision produces on iOS.
 */
class FaceDetectorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FaceDetector")

    AsyncFunction("detect") { url: String, promise: Promise ->
      val context = appContext.reactContext
        ?: return@AsyncFunction promise.reject(CodedException("ERR_FACE_DETECTION", "No context", null))
      val image = InputImage.fromFilePath(context, Uri.parse(url))
      val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .build()
      val width = image.width.toDouble()
      val height = image.height.toDouble()
      FaceDetection.getClient(options).process(image)
        .addOnSuccessListener { faces ->
          promise.resolve(faces.map { face ->
            mapOf(
              "x" to face.boundingBox.left / width,
              "y" to face.boundingBox.top / height,
              "width" to face.boundingBox.width() / width,
              "height" to face.boundingBox.height() / height,
            )
          })
        }
        .addOnFailureListener { error ->
          promise.reject(CodedException("ERR_FACE_DETECTION", error.message, error))
        }
    }
  }
}
