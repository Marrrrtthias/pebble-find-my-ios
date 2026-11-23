# iOS: no notification while Find My Phone is ringing (Android has one)

## What happens

When a watchapp rings the phone through the built-in Find My Phone plugin
(`00000000-0000-0000-0001-000000000008`, action `ring`), the iPhone plays the alarm sound, but
the Pebble app posts no notification. Nothing appears on the lock screen or in Notification
Center.

On Android, `PhoneSoundPlayer.android.kt` shows a notification while ringing: "Finding your
phone" / "Ringing from your watch", with a Stop button.

## Why

In `PhoneSoundPlayer.ios.kt` the only notification is the critical alert, posted when the media
volume is below `MIN_AUDIBLE_VOLUME`. That path needs the critical-alerts entitlement, which
`iosApp.entitlements` doesn't include. So `checkCriticalAlertsEnabled` is always false, and the
normal `AVAudioPlayer` path never posts anything.

## Why a notification would help

- It explains why the phone suddenly plays an alarm, and that the watch caused it.
- It matches Android.
- Automations can react to it. For example, a Shortcuts automation that triggers on a
  notification from the Pebble app can raise the volume when the phone is found ringing too
  quietly. Today there is nothing to trigger on from the watch, short of an internet service.

## Suggested change

Post a plain, silent notification with the same title and body as Android when the audio player
starts, and remove it in `cleanUp()` together with the critical one. This is about 20 lines in
`PhoneSoundPlayer.ios.kt`; a patch is attached.

Possible follow-up: a "Stop" notification action, as on Android. This needs a category and
routing the action from `IOSDelegate.userNotificationCenterDidReceiveResponse` to the plugin, so
I left it out of the minimal change.

## Environment

- Pebble Time 2, current firmware
- iPhone, iOS <version>, Pebble app <version>
- Reproduced with the "Dashboard (Plugin Demo)" app and with a small watchapp that calls
  `Pebble.invokeAction({ plugin: "00000000-0000-0000-0001-000000000008", action: "ring", args: {} })`
