import { state } from "./state.js";
import { vttToMS, computeVTTDuration, formatTimeVTT } from "./vtt.js";
import { renderSubs } from "./subsTable.js";
import { updateVideoTrack } from "./video.js";
import { selectSection } from "./selection.js";

// Waveform regions + access list + sync

export function renderWaveformRegions(entries, focusIndex = null) {
  if (!state.wavesurfer || !state.regionsPlugin) return;

  state.regionsPlugin.clearRegions();

  entries.forEach((cue, i) => {
    const displayText = "#" + (i + 1) + "\t" + cue.text;
    const start = vttToMS(cue.start) / 1000;
    const end = vttToMS(cue.end) / 1000;

    const region = state.regionsPlugin.addRegion({
      id: "sub_" + i,
      start,
      end,
      drag: true,
      resize: true,
      content: displayText,
      color: i === state.selectedIndex ? "rgba(50,150,255,0.4)" : "rgba(100,100,100,0.2)",
    });

    region.data = { index: i };

    if (region.element) {
      region.element.setAttribute("data-region-id", "sub_" + i);
      region.element.setAttribute("role", "button");
      region.element.setAttribute("aria-label", `Subtitle region ${i + 1}: ${cue.text}`);

      region.element.onkeydown = null;
      region.element.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          selectSection(i, start);
          e.preventDefault();
        }
      });
    }

    region.on("dblclick", (e) => {
      let seekTime = region.start;
      if (e && state.wavesurfer) {
        const bbox = state.wavesurfer.getWrapper().getBoundingClientRect();
        const x = e.clientX - bbox.left;
        const duration = state.wavesurfer.getDuration();
        const pxPerSec = bbox.width / duration;
        let clickTime = x / pxPerSec;
        if (clickTime < region.start) clickTime = region.start;
        if (clickTime > region.end) clickTime = region.end;
        seekTime = clickTime;
      }
      selectSection(i, seekTime);
    });
  });

  renderRegionAccessList(entries, focusIndex);
}

export function renderRegionAccessList(entries, focusIndex = null) {
  const list = document.getElementById("region-access-list");
  list.innerHTML = "";

  entries.forEach((cue, i) => {
    const li = document.createElement("li");
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `Subtitle region ${i + 1}: ${cue.text}`);

    li.addEventListener("focus", () => {
      if (state.wavesurfer && state.wavesurfer.getDuration()) {
        const startSec = vttToMS(cue.start) / 1000;
        state.wavesurfer.seekTo(startSec / state.wavesurfer.getDuration());
        // Sync video currentTime as well
        const video = document.getElementById("video");
        if (video && video.duration) {
          video.currentTime = startSec;
        }
        // Only focus the region element when the access list item is focused
        if (state.regionsPlugin) {
          const region = state.regionsPlugin.getRegions().find(r => r.data?.index === i);
          if (region && region.element && typeof region.element.focus === "function") {
            region.element.focus();
          }
        }
      }
    });

    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        selectSection(i, vttToMS(cue.start) / 1000);
        setTimeout(() => {
          // Focus the corresponding text input in the table
          const textInput = document.querySelector(`.text-input[data-index="${i}"]`);
          if (textInput) textInput.focus();
        }, 0);
        e.preventDefault();
      }
    });

    li.addEventListener("click", () => {
      selectSection(i, vttToMS(cue.start) / 1000);
    });

    li.textContent = `#${i + 1} ${cue.text}`;
    list.appendChild(li);
  });

  // Only restore focus if the access list itself had focus before
  if (
    focusIndex !== null &&
    document.activeElement === list &&
    list.children[focusIndex]
  ) {
    list.children[focusIndex].focus();
  }
}

export function bindWaveformEvents() {
  if (!state.wavesurfer || !state.regionsPlugin) return;

  state.regionsPlugin.on("region-updated", (region) => {
    const idx = region.data?.index;
    if (typeof idx === "number" && state.subtitles[idx]) {
      state.subtitles[idx].start = formatTimeVTT(region.start);
      state.subtitles[idx].end = formatTimeVTT(region.end);
      state.subtitles[idx].duration = computeVTTDuration(state.subtitles[idx].start, state.subtitles[idx].end);

      renderSubs(state.subtitles);
      renderWaveformRegions(state.subtitles);
      updateVideoTrack();
    }
  });
}
