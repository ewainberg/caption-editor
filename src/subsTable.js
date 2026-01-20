import { state } from "./state.js";
import { vttToMS, computeVTTDuration } from "./vtt.js";
import { renderWaveformRegions } from "./waveform.js";
import { updateVideoTrack } from "./video.js";
import { selectSection } from "./selection.js";

// Subtitle table rendering + editing handlers

export function renderSubs(entries) {
  const body = document.getElementById("subs-body");
  body.innerHTML = "";

  entries.forEach((e, i) => {
    const tr = document.createElement("tr");
    tr.dataset.index = String(i);
    if (i === state.selectedIndex) tr.classList.add("active-row");

    tr.innerHTML = `
      <td>${e.index}</td>
      <td><input type="text" class="start-input" value="${e.start}" data-index="${i}" style="width:90px"></td>
      <td><input type="text" class="end-input" value="${e.end}" data-index="${i}" style="width:90px"></td>
      <td>${e.duration}</td>
      <td>
        <input type="text" class="text-input" value="${e.text.replace(/"/g, "&quot;")}" data-index="${i}" style="width:98%; font-size:18px">
      </td>
      <td style="text-align:center;">
        <button class="align-btn" data-pos="0" data-align="start" data-index="${i}" ${e.position === 0 ? 'style="font-weight:bold"' : ""}>L</button>
        <button class="align-btn" data-pos="50" data-align="center" data-index="${i}" ${e.position === 50 ? 'style="font-weight:bold"' : ""}>C</button>
        <button class="align-btn" data-pos="100" data-align="end" data-index="${i}" ${e.position === 100 ? 'style="font-weight:bold"' : ""}>R</button>
      </td>
    `;

    tr.addEventListener("click", () => {
      selectSection(i);
    });

    tr.addEventListener("dblclick", () => {
      const start = vttToMS(e.start) / 1000;
      const video = document.getElementById("video");
      video.currentTime = start;
      if (state.wavesurfer && video.duration) {
        state.wavesurfer.seekTo(start / video.duration);
      }
    });

    body.appendChild(tr);
  });

  // Start/end input changes
  body.querySelectorAll(".start-input, .end-input").forEach(input => {
    input.addEventListener("change", () => {
      const idx = parseInt(input.dataset.index, 10);
      const cue = state.subtitles[idx];
      let newStart = cue.start;
      let newEnd = cue.end;

      if (input.classList.contains("start-input")) {
        newStart = input.value;
      } else {
        newEnd = input.value;
      }

      const errorDiv = document.getElementById("subs-error");
      if (vttToMS(newStart) >= vttToMS(newEnd)) {
        input.classList.add("input-error");
        errorDiv.textContent = "Start time must be less than end time.";
        input.focus();
        return;
      } else {
        input.classList.remove("input-error");
        errorDiv.textContent = "";
      }

      cue.start = newStart;
      cue.end = newEnd;
      cue.duration = computeVTTDuration(cue.start, cue.end);

      renderSubs(state.subtitles);
      renderWaveformRegions(state.subtitles);
      updateVideoTrack();
    });
  });

  // Text input autosave
  body.querySelectorAll(".text-input").forEach(input => {
    input.addEventListener("blur", () => {
      const idx = parseInt(input.dataset.index, 10);
      const cue = state.subtitles[idx];
      const newText = input.value.trim();
      if (cue.text !== newText) {
        cue.text = newText;
        renderSubs(state.subtitles);
        renderWaveformRegions(state.subtitles);
        updateVideoTrack();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
  });

  // Align buttons
  body.querySelectorAll(".align-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      const pos = parseInt(btn.dataset.pos, 10);
      const align = btn.dataset.align;
      state.subtitles[idx].position = pos;
      state.subtitles[idx].align = align;
      renderSubs(state.subtitles);
      renderWaveformRegions(state.subtitles);
      updateVideoTrack();
    });
  });
}
