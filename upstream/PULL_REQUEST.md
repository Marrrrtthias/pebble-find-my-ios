# iOS: post a notification while Find My Phone is ringing

Fixes #<issue number>

## What and why

On iOS, ringing the phone from the watch, through the built-in Find My Phone plugin, posts no
notification. The only notification path is the critical alert, which needs an entitlement the
app doesn't have. Android shows "Finding your phone" / "Ringing from your watch" while ringing.

This change posts a plain notification with the same title and body when `PhoneSoundPlayer.ios`
starts the audio player. `cleanUp()` removes it together with the critical alert, so it
disappears when ringing stops: via the `stop` action, the 60 s timeout, or the end of a source
subscription.

## Design notes and trade-offs

- **No sound on the notification.** The alarm is already playing, as with the silent Android
  channel. `AppDelegate.willPresent` already shows notifications while the app is in the
  foreground.
- **Only on the audio-player path.** The critical-alert path already posts its own notification,
  so it isn't duplicated there.
- **Not time-sensitive.** That interruption level needs the time-sensitive entitlement, which
  the app doesn't have.
- **No "Stop" action yet.** That needs a notification category plus routing from
  `IOSDelegate.userNotificationCenterDidReceiveResponse` into libpebble3. I kept this PR minimal
  and can follow up if you want it.

## Testing

- [ ] Built and ran on an iPhone (iOS <version>) with a Pebble Time 2
- [ ] Ring from the watch → notification appears (app in foreground, in background, phone locked)
- [ ] `stop` action / 60 s timeout → notification is removed
- [ ] Phone muted → alarm still plays, notification shown

## AI disclosure

This change was drafted with an AI assistant (Claude Code). I reviewed the code and understand
it, and I tested it as described above.
