import './global.css';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { loadEditorFonts } from './src/editor/assets';
import { EditorScreen } from './src/screens/EditorScreen';

export default function App() {
  // UI fonts: the Remix Icon glyph font + the app font. The caption fonts go
  // into Skia's own font provider instead (see src/editor/fonts.ts).
  const [uiFontsLoaded] = useFonts({
    remixicon: require('remixicon/fonts/remixicon.ttf'),
    'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
  });
  const [skiaFontsLoaded, setSkiaFontsLoaded] = useState(false);
  useEffect(() => {
    loadEditorFonts().then(() => setSkiaFontsLoaded(true));
  }, []);

  if (!uiFontsLoaded || !skiaFontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <EditorScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
