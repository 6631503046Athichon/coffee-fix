// Next.js instrumentation hook — runs once when the server process boots
// (stable in Next 15, no config flag needed). Used to start the weather
// auto-fetch scheduler so it lives on the always-on Railway server instead
// of in users' browsers.
export async function register(): Promise<void> {
  // Only in the Node.js runtime — never in the edge runtime or the build.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWeatherScheduler } = await import('./lib/weatherScheduler')
    startWeatherScheduler()
  }
}
