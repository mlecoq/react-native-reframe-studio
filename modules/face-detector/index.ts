import { requireNativeModule } from 'expo-modules-core';

/**
 * Still-image face detection, as a ~40-line local Expo Module — because the
 * best detector isn't the same on both platforms:
 *
 * - iOS: Apple's Vision framework. Built into the OS, nothing to install,
 *   and it runs on the simulator (Google's ML Kit pods don't).
 * - Android: Google ML Kit, the platform's standard on-device detector.
 *
 * Same idea as shipping apps do for barcode scanning; the JS side never
 * knows the difference.
 */

/** One detected face, as fractions of the image (x, y = top-left corner). */
export type DetectedFace = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const nativeModule = requireNativeModule('FaceDetector');

/** Detects the faces in an image file (a `file://` URI). */
export const detectFaces = (imageUri: string): Promise<DetectedFace[]> =>
  nativeModule.detect(imageUri);
