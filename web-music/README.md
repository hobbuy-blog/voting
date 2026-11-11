# CL Player

A local audio player that runs in the browser, with a 10-band parametric equalizer. Audio files are read from the device and played in place; nothing is uploaded. It can be installed as a PWA and used offline.

## Features

### Playback
- Plays files through the browser's built-in decoders (`HTMLAudioElement` routed into the Web Audio API). Supported formats therefore depend on the browser. The codec list at the bottom of the **Playback Config** tab shows what the current browser reports as playable.
- Recognized extensions: `mp3 m4a aac ogg oga opus flac wav weba webm aif aiff aifc caf mka ac3 eac3 amr 3gp mp4 wma ape wv mpga mp2`.
- Controls: play/pause, previous/next, seek, volume. `Space` toggles play/pause.
- **Shuffle** cycles through: off → album shuffle → all shuffle.
  - Album shuffle plays the tracks of the current album once each in random order. When the album is finished, playback continues with the next album in the playlist, again in random track order (it stops at the end of the playlist unless repeat is on). Each individually added file without an album tag is treated as its own one-track album.
  - All shuffle plays every track once in random order. With repeat off, playback stops after the last track; with repeat all, the order is reshuffled. The previous button steps back through the played history.
- **Repeat** cycles through: off → album repeat → all repeat → single-track repeat. Album repeat loops the current album; with shuffle on, the album's tracks are reshuffled on each pass.
- The current track's title, artist/album, and cover art are read from its tags and shown in the player.

### Library
- **Add Files** and **Add Folder** (subfolders included). Drag and drop is also accepted.
- Tracks are grouped into folders in the playlist. Each group, and the playlist as a whole, can be collapsed. A group can be removed with its close button.
- Grouping rules:
  - A track with an album tag is grouped as `Album (Year)`. Album names are compared ignoring case, full/half-width, and extra spaces. A track without a year tag takes the most common year of its album.
  - If one album name carries several years, it is split only when track/disc numbers collide between the years (treated as separate releases); otherwise it stays one group.
  - Tracks without an album tag are grouped by their folder path. Individually added tracks without tags go under "(Individual files)".
  - Within a group, tracks are ordered by disc number and track number.
- Tags and cover art are read with [jsmediatags](https://github.com/aadsm/jsmediatags): ID3 (MP3), MP4/M4A, and FLAC. For WAV and AIFF, an embedded ID3 chunk is extracted and read. Ogg/Opus tags are not read.

### Equalizer
- 10 bands. Per band: on/off, filter type (Peak, LShelf, HShelf, LPF, HPF, Notch, BPF), frequency (10–22000 Hz), gain (±15 dB), and Q (0.1–18).
- Preamp (±15 dB), a master EQ on/off switch, and a graph of the combined frequency response.
- Signal path: media element → preamp → enabled bands in series → output. Q has no effect on shelf filters (Web Audio specification).
- **Presets**: Flat, Bright, Exciting, Mellow, Relax, Vocal. Built-in presets are not overwritten; an edited built-in preset is marked with `*`.
- **Custom 1–5**: editable and renamable. Changes are saved to the selected slot automatically. **Save to…** copies the current settings into a slot.
- **Edit lock**: bands, preamp, preset name, and Save to… are locked by default to prevent accidental changes while scrolling. Press the lock button to edit. Selecting a preset is allowed while locked.
- Numeric fields select their contents on focus.

#### Built-in presets

Bands not listed are disabled or at 0 dB. All presets use a preamp of 0 dB. Bands 1–6 are enabled; bands 7–10 are disabled.

##### Flat
All bands at 0 dB.

##### Bright
60 Hz low shelf +3 dB; 2.5 kHz peak +6 dB (Q 2).

![Bright](./image/eq-bright.jpg)

##### Exciting
60 Hz low shelf +10 dB; 6.3 kHz peak +6 dB (Q 0.5); 16 kHz peak +9 dB (Q 0.5).

![Exciting](./image/eq-exciting.jpg)

##### Mellow
400 Hz peak +1 dB (Q 1); 1 kHz peak +2 dB (Q 0.7); 2.5 kHz peak −1 dB; 6.3 kHz peak −2 dB (Q 0.5).

![Mellow](./image/eq-mellow.jpg)

##### Relax
60 Hz low shelf +3 dB; 400 Hz peak −3 dB (Q 0.7); 2.5 kHz peak +3 dB (Q 1); 16 kHz high shelf +6 dB.

![Relax](./image/eq-relax.jpg)

##### Vocal
400 Hz peak +3 dB (Q 0.6); 1 kHz peak +3 dB (Q 0.6); 16 kHz high shelf −3 dB.

![Vocal](./image/eq-vocal.jpg)

### Interface
- Two tabs, **Playlist** and **Playback Config**, above a fixed player bar. The Playlist tab fills the space above the tabs; the Playback Config tab (equalizer and codec list) scrolls as a page.
- Light/dark follows the OS and can be switched with the theme button.

#### Playlist tab
The add/clear buttons, the theme button, and the playlist. Tracks are shown in collapsible groups.

![Playlist](./image/main-main.PNG)

#### Playback Config tab
The equalizer and the codec list.

![PlaybackConfig](./image/main-eq.PNG)

## Stored data

Everything is stored in the browser on the device.

| Location | Contents |
|---|---|
| `localStorage` (key `mp`) | All settings: volume, shuffle/repeat, theme, tab, collapse state, working EQ, Custom presets, playlist order, last track and position |
| Cookie `mp` (1 year) | Fallback copy of the settings, without playlist order, Custom presets, and collapse state |
| IndexedDB (`mp`) | One record per track: name, folder/album group, and file handle (where supported) |
| Cache Storage | The app files and the two external resources listed below |

Clearing site data in the browser, or removing the installed app, deletes all of the above.

### Remembering files
- **Chromium-based browsers** (Chrome, Edge, Android): file handles are saved via the File System Access API. After a restart, the playlist is restored and a track can be played again after the browser's read-permission prompt.
- **Safari / iOS / iPadOS** and other browsers without that API: only the track list is kept. Files must be added again to play them. Adding the same file again restores it to its group.

## Files

All files sit in the repository root.

| File | Purpose |
|---|---|
| `index.html` | The application (HTML, CSS, and JavaScript in one file) |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Service worker (offline cache) |
| `icon-192.png`, `icon-512.png` | Manifest icons |
| `icon-maskable-512.png` | Maskable manifest icon |
| `apple-touch-icon.png`, `apple-touch-icon-120.png`, `-152.png`, `-167.png` | iOS/iPadOS home screen icons |
| `favicon-32.png` | Browser tab icon |

All paths are relative, so the app works from a project subpath (`https://<user>.github.io/<repo>/`) as well as a custom domain.

## Deployment (GitHub Pages)

1. Put all files in the repository root and commit.
2. In **Settings → Pages**, select the branch and the root folder as the source.
3. Open the published HTTPS URL.

Installing:
- **Safari (iOS/iPadOS)**: Share → Add to Home Screen.
- **Chrome / Edge**: the install button in the address bar.

## Offline use

On the first visit, `sw.js` stores the app files in the cache. It also fetches two external resources and stores them:

- the Material Symbols icon font (Google Fonts)
- jsmediatags 3.9.5 (cdnjs)

After that, the app opens without a connection. Cached files are served first and refreshed in the background, so an updated version is picked up on the following launch.

To force clients to refresh the cache after changing any file, increase the version in `sw.js`:

```js
const V="cl-player-v4";
```

If the app is opened offline before the first caching has finished, the icon font and tag/cover-art reading are unavailable until the resources have been cached once.

## Limitations

- DRM-protected files cannot be played.
- Playable formats depend on the browser. Formats such as WMA and APE are generally not supported.
- Cover art and tags for Ogg/Opus files are not read.
- On iOS/iPadOS the audio session is set to `playback` so that output continues in the background and is not muted by the silent switch. Because the equalizer routes audio through Web Audio, background behavior still depends on the OS.
- The page disables pinch zoom (`maximum-scale=1`) to prevent focus zoom on input fields in iOS.
- The equalizer is a parametric EQ built from Web Audio biquad filters. It does not reproduce the processing of any specific hardware or software equalizer.

## Third-party resources

| Resource | Use | Source |
|---|---|---|
| Material Symbols Rounded | Interface icons | Google Fonts |
| jsmediatags 3.9.5 | Tag and cover art reading | cdnjs |
