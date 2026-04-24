import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.heitor.reader',
  appName: 'Heitor Reader',
  webDir: 'dist',
  server: {
    url: 'https://heitor-on.netlify.app',
    cleartext: false
  },
  plugins: {
    Browser: {
      presentationStyle: "popover"
    }
  }
};

export default config;
