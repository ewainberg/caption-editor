let wavesurfer = null;
let regionsPlugin = null;
let subtitles = [];
let selectedIndex = -1;

/* --------------------------------------------------
   Video Loading
-------------------------------------------------- */

function loadVideo(file) {
    const url = URL.createObjectURL(file);
    const video = document.getElementById("video");

    video.src = url;
    video.load();

    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
        regionsPlugin = null;
    }

    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#aaa',
        progressColor: '#fff',
        height: 130,
        normalize: true,
        responsive: true,
        hideScrollbar: true,
        minPxPerSec: 100,
        interact: false,
    });
    wavesurfer.setMuted(true);

    wavesurfer.registerPlugin(
        WaveSurfer.Timeline.create({ timeInterval: 1 })
    );

    regionsPlugin = wavesurfer.registerPlugin(
        WaveSurfer.Regions.create()
    );

    wavesurfer.load(url);

    wavesurfer.on('ready', () => {
        if (subtitles.length > 0) {
            renderWaveformRegions(subtitles);
        }
        bindWaveformEvents();
    });

    video.addEventListener('pause', () => {
        if (wavesurfer) wavesurfer.pause();
    });

    video.addEventListener('play', () => {
        if (!wavesurfer) return;
        wavesurfer.seekTo(video.currentTime / video.duration);
        wavesurfer.play();
    });
}

document.getElementById("video-input").addEventListener("change", (e) => {
    if (e.target.files[0]) loadVideo(e.target.files[0]);
});


/* --------------------------------------------------
   Subtitle Loading (VTT)
-------------------------------------------------- */

document.getElementById("sub-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target.result;

        subtitles = parseVTT(text);

        attachTrackToVideo(text);
        renderSubs(subtitles);
        renderWaveformRegions(subtitles);

        // Show editor but clear fields
        const editor = document.getElementById("editor");
        editor.style.display = "flex";
        editor.dataset.index = "";
        document.getElementById("edit-text").value = "";
    };
    reader.readAsText(file);
});

function attachTrackToVideo(vttText) {
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


/* --------------------------------------------------
   VTT Parsing
-------------------------------------------------- */

function parseVTT(data) {
    const lines = data.split(/\r?\n/);
    const out = [];
    let i = 0;

    if (lines[i]?.includes("WEBVTT")) i++;

    while (i < lines.length) {
        let line = lines[i].trim();
        if (!line) { i++; continue; }
        if (line.startsWith("NOTE")) {
            while (lines[++i]?.trim() !== "") {}
            continue;
        }

        let cueId = null;
        if (!line.includes("-->")) {
            cueId = line;
            line = lines[++i]?.trim();
        }

        if (!line?.includes("-->")) { i++; continue; }

        const [start, end] = line.split("-->").map(s => s.trim());
        i++;

        let text = "";
        while (lines[i]?.trim()) text += lines[i++] + "\n";
        text = text.trim();
        i++;

        out.push({
            index: out.length + 1,
            id: cueId,
            start,
            end,
            duration: computeVTTDuration(start, end),
            text
        });
    }

    return out;
}

function vttToMS(t) {
    const parts = t.split(":");
    if (parts.length === 3) {
        const [h, m, s] = parts;
        return h * 3600000 + m * 60000 + s * 1000;
    }
    if (parts.length === 2) {
        const [m, s] = parts;
        return m * 60000 + s * 1000;
    }
    return 0;
}

function computeVTTDuration(start, end) {
    return ((vttToMS(end) - vttToMS(start)) / 1000).toFixed(3);
}


/* --------------------------------------------------
   Subtitle Table Rendering
-------------------------------------------------- */

function renderSubs(entries) {
    const body = document.getElementById("subs-body");
    body.innerHTML = "";

    entries.forEach((e, i) => {
        const tr = document.createElement("tr");
        tr.dataset.index = i;
        if (i === selectedIndex) tr.classList.add("active-row");

        tr.innerHTML = `
            <td>${e.index}</td>
            <td><input type="text" class="start-input" value="${e.start}" data-index="${i}" style="width:90px"></td>
            <td><input type="text" class="end-input" value="${e.end}" data-index="${i}" style="width:90px"></td>
            <td>${e.duration}</td>
            <td>${e.text}</td>
        `;

        tr.addEventListener("click", () => {
            selectSection(i);
        });

        tr.addEventListener("dblclick", () => {
            const start = vttToMS(e.start) / 1000;
            const video = document.getElementById("video");
            video.currentTime = start;
            if (wavesurfer && video.duration) {
                wavesurfer.seekTo(start / video.duration);
            }
        });

        body.appendChild(tr);
    });

    // Add listeners for start/end input changes
    body.querySelectorAll(".start-input, .end-input").forEach(input => {
        input.addEventListener("change", (e) => {
            const idx = parseInt(input.dataset.index);
            const cue = subtitles[idx];
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

            renderSubs(subtitles);
            renderWaveformRegions(subtitles);
            updateVideoTrack();
        });
    });
}


/* --------------------------------------------------
   Waveform Region Rendering
-------------------------------------------------- */

function renderWaveformRegions(entries) {
    if (!wavesurfer || !regionsPlugin) return;

    regionsPlugin.clearRegions();

    entries.forEach((cue, i) => {
        const displayText = "#" + (i + 1) + "\t" + cue.text;
        const start = vttToMS(cue.start) / 1000;
        const end   = vttToMS(cue.end) / 1000;

        const region = regionsPlugin.addRegion({
            id: "sub_" + i,
            start,
            end,
            drag: true,
            resize: true,
            content: displayText,
            color: i === selectedIndex ? "rgba(50,150,255,0.4)" : "rgba(100,100,100,0.2)"
        });

        region.data = { index: i };

        region.on("dblclick", (e) => {
            console.log("double click fired!", region);

            // Calculate the time at the double-click position
            let seekTime = region.start;
            if (e && wavesurfer) {
                const bbox = wavesurfer.getWrapper().getBoundingClientRect();
                const x = e.clientX - bbox.left;
                const duration = wavesurfer.getDuration();
                const pxPerSec = bbox.width / duration;
                let clickTime = x / pxPerSec;
                if (clickTime < region.start) clickTime = region.start;
                if (clickTime > region.end) clickTime = region.end;
                seekTime = clickTime;
            }
            selectSection(i, seekTime);
        });
    });
}


/* --------------------------------------------------
   Waveform Event Binding
-------------------------------------------------- */

function bindWaveformEvents() {
    if (!wavesurfer || !regionsPlugin) return;
    regionsPlugin.on('region-updated', (region) => {
        console.log("Region updated:", region);
        const idx = region.data?.index;
        if (typeof idx === "number" && subtitles[idx]) {
            subtitles[idx].start = formatTimeVTT(region.start);
            subtitles[idx].end = formatTimeVTT(region.end);
            subtitles[idx].duration = computeVTTDuration(subtitles[idx].start, subtitles[idx].end);
            renderSubs(subtitles);
            renderWaveformRegions(subtitles);
            updateVideoTrack();
        }
    });
}

function formatTimeVTT(seconds) {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSeconds = Math.floor(seconds);
    const s = totalSeconds % 60;
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);
    return (
        String(h).padStart(2, "0") + ":" +
        String(m).padStart(2, "0") + ":" +
        String(s).padStart(2, "0") + "." +
        String(ms).padStart(3, "0")
    );
}


/* --------------------------------------------------
   Row Interaction + Editing
-------------------------------------------------- */

function onRowClick(index) {
    highlightRow(index);

    const editor = document.getElementById("editor");
    editor.style.display = "flex";
    editor.dataset.index = index;

    const cue = subtitles[index];

    document.getElementById("edit-text").value = cue.text;

    const regions = regionsPlugin.getRegions();
    const region = regions.find(r => r.data && r.data.index === index);

    if (region) {
        const video = document.getElementById("video");
        const wasPlaying = !video.paused;
        video.currentTime = region.start;
        if (wasPlaying) video.play();
    }
}

document.getElementById("save-edit").addEventListener("click", () => {
    const editor = document.getElementById("editor");
    const index = parseInt(editor.dataset.index);

    const newText = document.getElementById("edit-text").value.trim();

    subtitles[index].text = newText;

    renderSubs(subtitles);
    renderWaveformRegions(subtitles);
    updateVideoTrack();

});

document.getElementById("cancel-edit").addEventListener("click", () => {
    document.getElementById("editor").style.display = "none";
});


// Refresh VTT (after updates)
function updateVideoTrack() {
    const vttText =
        "WEBVTT\n\n" +
        subtitles.map(cue =>
            `${cue.start} --> ${cue.end}\n${cue.text}\n`
        ).join("\n");

    attachTrackToVideo(vttText);
}


/* --------------------------------------------------
   Row Highlight
-------------------------------------------------- */

function highlightRow(i) {
    const rows = document.querySelectorAll("#subs-body tr");
    rows.forEach(r => r.classList.remove("active-row"));
    if (rows[i]) rows[i].classList.add("active-row");
}

function selectSection(index, seekTime) {
    selectedIndex = index;
    highlightRow(index);
    renderWaveformRegions(subtitles);

    // Only seek if seekTime is provided (from region double-click)
    if (typeof seekTime === "number") {
        const video = document.getElementById("video");
        // Remember play state to avoid confusion
        const wasPlaying = !video.paused;

        video.currentTime = seekTime;

        if (wavesurfer && video.duration) {
            wavesurfer.seekTo(seekTime / video.duration);
        }

        if (wasPlaying) {
            video.play();
        } else {
            video.pause();
        }
    }
    const editor = document.getElementById("editor");
    editor.style.display = "flex";
    editor.dataset.index = index;
    document.getElementById("edit-text").value = subtitles[index].text;
}

// For testing purposes, load default video and subtitles on startup
window.addEventListener("DOMContentLoaded", () => {
    const defaultVideoPath = "test.mp4";
    const defaultVttPath = "test.vtt";

    fetch(defaultVideoPath)
        .then(response => response.blob())
        .then(blob => {
            loadVideo(new File([blob], defaultVideoPath, { type: "video/mp4" }));
        });

    fetch(defaultVttPath)
        .then(response => response.text())
        .then(text => {
            subtitles = parseVTT(text);
            attachTrackToVideo(text);
            renderSubs(subtitles);
            renderWaveformRegions(subtitles);

            const editor = document.getElementById("editor");
            editor.style.display = "flex";
            editor.dataset.index = "";
            document.getElementById("edit-text").value = "";
        });

    // Add mouse wheel seeking on waveform
    const waveform = document.getElementById("waveform");
    waveform.addEventListener("wheel", (e) => {
        e.preventDefault();
        const video = document.getElementById("video");
        if (!video.duration) return;

        const delta = e.deltaY < 0 ? 1 : -1;
        let newTime = video.currentTime + delta * 0.2;
        newTime = Math.max(0, Math.min(video.duration, newTime));
        video.currentTime = newTime;

        // Sync waveform playhead
        if (wavesurfer) {
            wavesurfer.seekTo(newTime / video.duration);
        }
    }, { passive: false });

    // Play/Pause button logic
    const video = document.getElementById("video");
    const playPauseBtn = document.getElementById("play-pause-btn");
    if (!video || !playPauseBtn) return;

    function updateBtn() {
        playPauseBtn.textContent = video.paused ? "▶️" : "⏸️";
    }

    playPauseBtn.addEventListener("click", () => {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
        updateBtn();
    });

    video.addEventListener("play", updateBtn);
    video.addEventListener("pause", updateBtn);
    updateBtn();

    // Play Current Section Button
    const playCurrentBtn = document.getElementById("play-current");
    let stopAtEndHandler = null;

    playCurrentBtn.addEventListener("click", () => {
        if (selectedIndex < 0 || !subtitles[selectedIndex]) return;
        const cue = subtitles[selectedIndex];
        const start = vttToMS(cue.start) / 1000;
        const end = vttToMS(cue.end) / 1000;

        const video = document.getElementById("video");

        if (stopAtEndHandler) {
            cancelAnimationFrame(stopAtEndHandler);
            stopAtEndHandler = null;
        }

        // Always start at the section's start
        video.currentTime = start;

        // Sync waveform immediately
        if (wavesurfer && video.duration) {
            wavesurfer.seekTo(start / video.duration);
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

    // Insert Button logic
    const insertBtn = document.getElementById("insert");
    insertBtn.addEventListener("click", () => {
        const video = document.getElementById("video");
        if (!video) return;

        const currentTime = video.currentTime;
        const defaultDuration = 1.0;

        function formatVTTTime(sec) {
            const ms = Math.floor((sec % 1) * 1000);
            const totalSeconds = Math.floor(sec);
            const s = totalSeconds % 60;
            const m = Math.floor((totalSeconds / 60) % 60);
            const h = Math.floor(totalSeconds / 3600);
            return (
                String(h).padStart(2, "0") + ":" +
                String(m).padStart(2, "0") + ":" +
                String(s).padStart(2, "0") + "." +
                String(ms).padStart(3, "0")
            );
        }

        let insertAt = 0;
        let newStart = 0;

        if (selectedIndex !== -1 && subtitles[selectedIndex]) {
            const cue = subtitles[selectedIndex];
            newStart = vttToMS(cue.end) / 1000;
            insertAt = selectedIndex + 1;
        }

        else {
            // Find the cue that the playhead is inside
            const insideIndex = subtitles.findIndex(cue => {
                const s = vttToMS(cue.start) / 1000;
                const e = vttToMS(cue.end) / 1000;
                return currentTime >= s && currentTime <= e;
            });

            if (insideIndex !== -1) {
                // Inside a cue, insert after it
                const cue = subtitles[insideIndex];
                newStart = vttToMS(cue.end) / 1000;
                insertAt = insideIndex + 1;
            } else {
                // Playhead in a gap, insert at playhead position
                newStart = currentTime;

                insertAt = subtitles.findIndex(
                    cue => vttToMS(cue.start) / 1000 > currentTime
                );
                if (insertAt === -1) insertAt = subtitles.length;
            }
        }

        const newEnd = Math.min(newStart + defaultDuration, video.duration);

        const newCue = {
            index: 0,
            id: null,
            start: formatVTTTime(newStart),
            end: formatVTTTime(newEnd),
            duration: (newEnd - newStart).toFixed(3),
            text: ""
        };

        const nextCue = subtitles[insertAt];

        if (nextCue) {
            const nextStart = vttToMS(nextCue.start) / 1000;
            const nextEnd   = vttToMS(nextCue.end)   / 1000;

            if (nextStart < newEnd) {
                const trimmedStart = newEnd;

                if (trimmedStart >= nextEnd) {
                    subtitles.splice(insertAt, 1);
                } else {
                    nextCue.start = formatVTTTime(trimmedStart);
                    nextCue.duration = (nextEnd - trimmedStart).toFixed(3);
                }
            }
        }

        subtitles.splice(insertAt, 0, newCue);
        subtitles.forEach((cue, i) => cue.index = i + 1);

        renderSubs(subtitles);
        renderWaveformRegions(subtitles);
        updateVideoTrack();
        selectSection(insertAt);
    });


    const deleteBtn = document.getElementById("delete");
    deleteBtn.addEventListener("click", () => {
        if (selectedIndex < 0 || !subtitles[selectedIndex]) return;

        subtitles.splice(selectedIndex, 1);

        subtitles.forEach((cue, i) => cue.index = i + 1);

        selectedIndex = -1;

        renderSubs(subtitles);
        renderWaveformRegions(subtitles);
        updateVideoTrack();

        document.getElementById("editor").style.display = "none";
    });

    document.getElementById("video").removeAttribute("controls");
});
