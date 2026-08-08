import CoreML
import ExpoModulesCore
import Vision

/**
 * iOS face detection with Apple's Vision framework — no ML Kit pod, works on
 * the simulator. Vision returns boxes normalized to the image with a
 * BOTTOM-left origin, so only the y axis needs flipping to match the
 * top-left convention the app (and ML Kit on Android) uses.
 */
public class FaceDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FaceDetector")

    AsyncFunction("detect") { (url: URL, promise: Promise) in
      let request = VNDetectFaceRectanglesRequest { request, error in
        if let error {
          promise.reject("ERR_FACE_DETECTION", "Vision failed: \((error as NSError).description)")
          return
        }
        let observations = request.results as? [VNFaceObservation] ?? []
        promise.resolve(observations.map { observation -> [String: Double] in
          let box = observation.boundingBox
          return [
            "x": box.origin.x,
            "y": 1 - box.origin.y - box.size.height,
            "width": box.size.width,
            "height": box.size.height,
          ]
        })
      }

      #if targetEnvironment(simulator)
        // The simulator has no Neural Engine; without forcing the CPU,
        // Vision's face detector can fail with an opaque inference error.
        if #available(iOS 17.0, *) {
          let cpu = MLComputeDevice.allComputeDevices.first { device in
            if case .cpu = device { return true }
            return false
          }
          if let cpu {
            request.setComputeDevice(cpu, for: .main)
          }
        } else {
          request.usesCPUOnly = true
        }
      #endif

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(url: url).perform([request])
        } catch {
          promise.reject("ERR_FACE_DETECTION", "Vision failed: \((error as NSError).description)")
        }
      }
    }
  }
}
