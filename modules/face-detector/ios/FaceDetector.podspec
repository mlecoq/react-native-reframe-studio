Pod::Spec.new do |s|
  s.name           = 'FaceDetector'
  s.version        = '1.0.0'
  s.summary        = 'Still-image face detection via Apple Vision'
  s.description    = 'Local Expo module: face detection without ML Kit on iOS.'
  s.author         = 'react-native-privacy-studio contributors'
  s.homepage       = 'https://github.com/mlecoq/react-native-privacy-studio'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
