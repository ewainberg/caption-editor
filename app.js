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

    // Register timeline plugin
    wavesurfer.registerPlugin(
        WaveSurfer.Timeline.create({
            timeInterval: 1,
        })
    );

    // register regions plugin explicitly and keep a reference
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
        const start = vttToMS(cue.start) / 1000;
        const end   = vttToMS(cue.end) / 1000;

        const region = regionsPlugin.addRegion({
            id: "sub_" + i,
            start,
            end,
            drag: true,
            resize: true,
            color: "rgba(0, 150, 255, 0.3)"
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

    const video = document.getElementById("video");
    video.addEventListener('timeupdate', () => {
        if (!wavesurfer) return;
        const ratio = video.currentTime / video.duration;
        wavesurfer.seekTo(ratio);
    });
}


/* --------------------------------------------------
   Row Interaction
-------------------------------------------------- */

function onRowClick(index) {
    highlightRow(index);

    if (!regionsPlugin) return;

    const regions = regionsPlugin.getRegions();
    const region = regions.find(r => r.data && r.data.index === index);

    if (region) {
        const video = document.getElementById("video");

        const wasPlaying = !video.paused;

        video.currentTime = region.start;

        if (wasPlaying) {
            video.play();
        }
    }
}


function highlightRow(i) {
    const rows = document.querySelectorAll("#subs-body tr");
    rows.forEach(r => r.classList.remove("active-row"));
    if (rows[i]) rows[i].classList.add("active-row");
}