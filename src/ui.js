import { state } from "./state.js";
import { loadVideo, attachTrackToVideo, updateVideoTrack } from "./video.js";
import { parseVTT, vttToMS, formatVTTTime } from "./vtt.js";
import { renderSubs } from "./subsTable.js";
import { renderWaveformRegions } from "./waveform.js";
import { selectSection } from "./selection.js";

export function initApp() {
  // Video file input
  document.getElementById("video-input").addEventListener("change", (e) => {
    if (e.target.files[0]) loadVideo(e.target.files[0]);
  });

  // Subtitle VTT input
  document.getElementById("sub-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;

      state.subtitles = parseVTT(text);

      attachTrackToVideo(text);
      renderSubs(state.subtitles);
      renderWaveformRegions(state.subtitles);
    };
    reader.readAsText(file);
  });

  // For testing: load defaults on startup
  const defaultVideoPath = "test.mp4";
  const defaultVttPath = "test.vtt";

  fetch(defaultVideoPath)
    .then(r => r.blob())
    .then(blob => {
      loadVideo(new File([blob], defaultVideoPath, { type: "video/mp4" }));
    });

  fetch(defaultVttPath)
    .then(r => r.text())
    .then(text => {
      state.subtitles = parseVTT(text);
      attachTrackToVideo(text);
      renderSubs(state.subtitles);
      renderWaveformRegions(state.subtitles);
    });

  // Mouse wheel seeking on waveform
  const waveform = document.getElementById("waveform");
  waveform.addEventListener("wheel", (e) => {
    e.preventDefault();
    const video = document.getElementById("video");
    if (!video.duration) return;

    const delta = e.deltaY < 0 ? 1 : -1;
    let newTime = video.currentTime + delta * 0.2;
    newTime = Math.max(0, Math.min(video.duration, newTime));
    video.currentTime = newTime;

    if (state.wavesurfer) {
      state.wavesurfer.seekTo(newTime / video.duration);
    }
  }, { passive: false });

  // Seek buttons
  const seekLeftBtn = document.getElementById("seek-left");
  const seekRightBtn = document.getElementById("seek-right");

  seekLeftBtn.addEventListener("click", () => seekBy(-1));
  seekRightBtn.addEventListener("click", () => seekBy(1));

  function seekBy(deltaSeconds) {
    const video = document.getElementById("video");
    if (!video.duration) return;

    let newTime = video.currentTime + deltaSeconds;
    newTime = Math.max(0, Math.min(video.duration, newTime));
    video.currentTime = newTime;

    if (state.wavesurfer && video.duration) {
      state.wavesurfer.seekTo(newTime / video.duration);
    }

    if (video.paused) {
      video.play();
      setTimeout(() => video.pause(), 50);
    }
  }

  // Play/Pause button logic
  const video = document.getElementById("video");
  const playPauseBtn = document.getElementById("play-pause-btn");
  if (video && playPauseBtn) {
    const updateBtn = () => { playPauseBtn.textContent = video.paused ? "▶️" : "⏸️"; };

    playPauseBtn.addEventListener("click", () => {
      if (video.paused) video.play();
      else video.pause();
      updateBtn();
    });

    video.addEventListener("play", updateBtn);
    video.addEventListener("pause", updateBtn);
    updateBtn();

    // Hide native controls (as in original)
    video.removeAttribute("controls");
  }

  // Play Current Section
  const playCurrentBtn = document.getElementById("play-current");
  let stopAtEndHandler = null;

  playCurrentBtn.addEventListener("click", () => {
    if (state.selectedIndex < 0 || !state.subtitles[state.selectedIndex]) return;
    const cue = state.subtitles[state.selectedIndex];
    const start = vttToMS(cue.start) / 1000;
    const end = vttToMS(cue.end) / 1000;

    const video = document.getElementById("video");

    if (stopAtEndHandler) {
      cancelAnimationFrame(stopAtEndHandler);
      stopAtEndHandler = null;
    }

    video.currentTime = start;

    if (state.wavesurfer && video.duration) {
      state.wavesurfer.seekTo(start / video.duration);
    }

    video.play();

    function checkEnd() {
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
        stopAtEndHandler = null;
      } else {
        stopAtEndHandler = requestAnimationFrame(checkEnd);
      }
    }
    stopAtEndHandler = requestAnimationFrame(checkEnd);
  });

  // Insert cue
  const insertBtn = document.getElementById("insert");
  insertBtn.addEventListener("click", () => {
    const video = document.getElementById("video");
    if (!video) return;

    const currentTime = video.currentTime;
    const defaultDuration = 1.0;

    let insertAt = 0;
    let newStart = 0;

    if (state.selectedIndex !== -1 && state.subtitles[state.selectedIndex]) {
      const cue = state.subtitles[state.selectedIndex];
      newStart = vttToMS(cue.end) / 1000;
      insertAt = state.selectedIndex + 1;
    } else {
      const insideIndex = state.subtitles.findIndex(cue => {
        const s = vttToMS(cue.start) / 1000;
        const e = vttToMS(cue.end) / 1000;
        return currentTime >= s && currentTime <= e;
      });

      if (insideIndex !== -1) {
        const cue = state.subtitles[insideIndex];
        newStart = vttToMS(cue.end) / 1000;
        insertAt = insideIndex + 1;
      } else {
        newStart = currentTime;

        insertAt = state.subtitles.findIndex(
          cue => vttToMS(cue.start) / 1000 > currentTime
        );
        if (insertAt === -1) insertAt = state.subtitles.length;
      }
    }

    const newEnd = Math.min(newStart + defaultDuration, video.duration);

    const newCue = {
      index: 0,
      id: null,
      start: formatVTTTime(newStart),
      end: formatVTTTime(newEnd),
      duration: (newEnd - newStart).toFixed(3),
      text: "",
      position: 50,
      align: "center",
    };

    const nextCue = state.subtitles[insertAt];
    if (nextCue) {
      const nextStart = vttToMS(nextCue.start) / 1000;
      const nextEnd = vttToMS(nextCue.end) / 1000;

      if (nextStart < newEnd) {
        const trimmedStart = newEnd;

        if (trimmedStart >= nextEnd) {
          state.subtitles.splice(insertAt, 1);
        } else {
          nextCue.start = formatVTTTime(trimmedStart);
          nextCue.duration = (nextEnd - trimmedStart).toFixed(3);
        }
      }
    }

    state.subtitles.splice(insertAt, 0, newCue);
    state.subtitles.forEach((cue, i) => cue.index = i + 1);

    renderSubs(state.subtitles);
    renderWaveformRegions(state.subtitles);
    updateVideoTrack();
    selectSection(insertAt);
  });

  // Delete cue
  const deleteBtn = document.getElementById("delete");
  deleteBtn.addEventListener("click", () => {
    if (state.selectedIndex < 0 || !state.subtitles[state.selectedIndex]) return;

    state.subtitles.splice(state.selectedIndex, 1);
    state.subtitles.forEach((cue, i) => cue.index = i + 1);

    state.selectedIndex = -1;

    renderSubs(state.subtitles);
    renderWaveformRegions(state.subtitles);
    updateVideoTrack();
  });
}
