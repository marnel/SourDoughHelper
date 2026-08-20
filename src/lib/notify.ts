/**
 * Alerts when a timer runs out.
 *
 * Worth being clear about the limits, because they shape the design:
 *
 * A web app with no server cannot wake a phone that has fully closed it —
 * that needs Web Push, which needs a backend. What *does* work reliably is
 * everything short of that:
 *
 *   - Foreground: sound, vibration and an in-app alert.
 *   - Backgrounded but alive: a system notification via the service worker.
 *   - Fully closed: nothing fires at the moment, but because timers are stored
 *     as wall-clock timestamps, reopening the app immediately shows what came
 *     due while you were away.
 *
 * On iOS, notifications only work at all once the app has been added to the
 * home screen. `canNotify()` reflects that.
 */

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notifyState(): NotifyState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifyState
}

export function canNotify(): boolean {
  return notifyState() === 'granted'
}

export async function requestNotifyPermission(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    return result as NotifyState
  } catch {
    return notifyState()
  }
}

/** True on iOS Safari outside of an installed home-screen app. */
export function needsInstallForAlerts(): boolean {
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (!isIos) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return !standalone
}

export async function showNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  if (!canNotify()) return
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    requireInteraction: true,
  }
  try {
    // Going through the service worker is required on Android Chrome and is
    // more durable everywhere else.
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, options)
  } catch {
    /* nothing more we can do */
  }
}

export function vibrate(pattern: number[] = [200, 100, 200, 100, 400]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

let ctx: AudioContext | null = null

/**
 * A short three-note chime, synthesised so there is no audio asset to load and
 * it works offline. Must be triggered from a page that has had a user
 * interaction at some point, which the "enable alerts" tap provides.
 */
export function chime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    ;[880, 1108.73, 1318.51].forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = now + i * 0.18
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.22, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(at)
      osc.stop(at + 0.55)
    })
  } catch {
    /* audio blocked — the notification and vibration still fire */
  }
}

/** Unlock audio on the first user gesture so later chimes are not blocked. */
export function primeAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    void ctx.resume()
  } catch {
    /* ignore */
  }
}

/**
 * Ask the browser to keep the screen on while a short timer runs down, so a
 * "stretch and fold in 30 minutes" alert is not missed to a locked phone.
 * Returns a release function.
 */
export async function keepAwake(): Promise<() => void> {
  type Sentinel = { release: () => Promise<void> }
  type WakeLock = { request: (type: 'screen') => Promise<Sentinel> }
  const wakeLock = (navigator as unknown as { wakeLock?: WakeLock }).wakeLock
  if (!wakeLock) return () => {}
  try {
    const sentinel = await wakeLock.request('screen')
    return () => void sentinel.release()
  } catch {
    return () => {}
  }
}
