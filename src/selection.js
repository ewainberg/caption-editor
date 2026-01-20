import { state } from "./state.js";
import { renderWaveformRegions } from "./waveform.js";

export function highlightRow(i) {
  const rows = document.querySelectorAll("#subs-body tr");
  rows.forEach(r => r.classList.remove("active-row"));
  if (rows[i]) rows[i].classList.add("active-row");
}

export function selectSection(index, seekTime) {
  state.selectedIndex = index;
  highlightRow(index);
  renderWaveformRegions(state.subtitles, index);

  if (typeof seekTime === "number") {
    const video = document.getElementById("video");
    const wasPlaying = !video.paused;

    video.currentTime = seekTime;

    if (state.wavesurfer && video.duration) {
      state.wavesurfer.seekTo(seekTime / video.duration);
    }

    if (wasPlaying) {
      video.play();
    } else {
      video.pause();
    }
  }
}
