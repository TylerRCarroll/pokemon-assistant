import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the same web build (vite build --mode android) with all game data bundled.
const config: CapacitorConfig = {
  appId: 'io.github.tylerrcarroll.pokeplanner',
  appName: 'PokéPlanner',
  webDir: 'dist',
};

export default config;
