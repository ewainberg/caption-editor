let wavesurfer = null;
let regionsPlugin = null;
let subtitles = [];

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
        height: 200,
        normalize: true,
        responsive: true,
        hideScrollbar: true,
        minPxPerSec: 100,
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

        tr.innerHTML = `
            <td>${e.index}</td>
            <td>${e.start}</td>
            <td>${e.end}</td>
            <td>${e.duration}</td>
            <td>${e.text}</td>
        `;

        tr.addEventListener("click", () => onRowClick(i));
        body.appendChild(tr);
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
            color: "rgb(51, 4, 4, 0.3)",
            content: displayText,
        });

        region.data = { index: i };
    });
}


/* --------------------------------------------------
   Waveform Event Binding
-------------------------------------------------- */

function bindWaveformEvents() {
    if (!wavesurfer || !regionsPlugin) return;

    regionsPlugin.on('region-clicked', (region) => {
        const video = document.getElementById("video");
        video.currentTime = region.start;
        video.play();
        highlightRow(region.data?.index ?? 0);
    });

    // Listen for region updates (drag/resize)
    regionsPlugin.on('region-updated', (region) => {
        const idx = region.data?.index;
        if (typeof idx === "number" && subtitles[idx]) {
            // Update subtitle start/end times
            const start = region.start;
            const end = region.end;

            // Format to VTT time (hh:mm:ss.mmm)
            subtitles[idx].start = formatTimeVTT(start);
            subtitles[idx].end = formatTimeVTT(end);
            subtitles[idx].duration = computeVTTDuration(subtitles[idx].start, subtitles[idx].end);

            renderSubs(subtitles);
            updateVideoTrack();

            // If this region is currently selected in the editor, update the editor fields
            const editor = document.getElementById("editor");
            if (editor.dataset.index == idx) {
                // Only update if the editor is showing this cue
                document.getElementById("edit-text").value = subtitles[idx].text;
            }
        }
    });

    const video = document.getElementById("video");
    video.addEventListener('timeupdate', () => {
        if (!wavesurfer) return;
        const ratio = video.currentTime / video.duration;
        wavesurfer.seekTo(ratio);

        const regions = regionsPlugin.getRegions();
        const currentRegion = regions.find(r =>
            video.currentTime >= r.start && video.currentTime < r.end
        );
        if (currentRegion && typeof currentRegion.data?.index === "number") {
            highlightRow(currentRegion.data.index);
        } else {
            // Only clear highlight if video is playing
            if (!video.paused) {
                highlightRow(-1);
            }
        }
    });
}

// Helper to format seconds to VTT time string
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


/* --------------------------------------------------
   VTT Regeneration (after edits)
-------------------------------------------------- */

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

    const editor = document.getElementById("editor");
    if (i >= 0 && subtitles[i]) {
        editor.dataset.index = i;
        document.getElementById("edit-text").value = subtitles[i].text;
    } else {
        editor.dataset.index = "";
        document.getElementById("edit-text").value = "";
    }
}
