import { state } from "./state.js";
import { renderWaveformRegions, bindWaveformEvents } from "./waveform.js";

// Video + waveform setup

export function loadVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.getElementById("video");

  video.src = url;
  video.load();

  if (state.wavesurfer) {
    state.wavesurfer.destroy();
    state.wavesurfer = null;
    state.regionsPlugin = null;
  }

  const WaveSurfer = window.WaveSurfer;
  state.wavesurfer = WaveSurfer.create({
    container: "#waveform",
    waveColor: "#aaa",
    progressColor: "#fff",
    height: 130,
    normalize: true,
    responsive: true,
    hideScrollbar: true,
    minPxPerSec: 100,
    interact: false,
  });

  state.wavesurfer.setMuted(true);

  state.wavesurfer.registerPlugin(
    WaveSurfer.Timeline.create({ timeInterval: 1 })
  );

  state.regionsPlugin = state.wavesurfer.registerPlugin(
    WaveSurfer.Regions.create()
  );

  state.wavesurfer.load(url);

  state.wavesurfer.on("ready", () => {
    if (state.subtitles.length > 0) {
      renderWaveformRegions(state.subtitles);
    }
    bindWaveformEvents();
  });

  video.addEventListener("pause", () => {
    if (state.wavesurfer) state.wavesurfer.pause();
  });

  video.addEventListener("play", () => {
    if (!state.wavesurfer) return;
    state.wavesurfer.seekTo(video.currentTime / video.duration);
    state.wavesurfer.play();
  });
}

export function attachTrackToVideo(vttText) {
  const video = document.getElementById("video");

  const oldTracks = video.querySelectorAll("track");
  oldTracks.forEach(t => t.remove());

  const blob = new Blob([vttText], { type: "text/vtt" });
  const blobUrl = URL.createObjectURL(blob);

  const track = document.createElement("track");
  track.kind = "subtitles";
  track.label = "Captions";
  track.srclang = "en";
  track.default = true;
  track.src = blobUrl;

  video.appendChild(track);
}

export function updateVideoTrack() {
  const vttText =
    "WEBVTT\n\n" +
    state.subtitles.map(cue =>
      `${cue.start} --> ${cue.end} position:${cue.position}% align:${cue.align}\n${cue.text}\n`
    ).join("\n");

  attachTrackToVideo(vttText);
}
