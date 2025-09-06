    const $ = (id) => document.getElementById(id);
    alert("Hi")
    const state = {
      seeds: [],     // { title, artist, itunesId? }
      playlist: []   // { title, artist, reason, matchScore, artworkUrl, previewUrl, itunesUrl }
    };

    // --- iTunes search (no key needed) ---
    async function searchItunes(term) {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicTrack&limit=8`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('iTunes search failed');
      const data = await res.json();
      return (data.results || []).map(r => ({
        title: r.trackName,
        artist: r.artistName,
        itunesId: r.trackId,
        artworkUrl: r.artworkUrl100,
        previewUrl: r.previewUrl || null,
        itunesUrl: r.trackViewUrl || null
      }));
    }

    function artwork600(url100) {
      if (!url100) return null;
      // Typically you can replace 100x100 with 600x600 for higher-res artwork.
      return url100.replace(/(\\d{2,4})x\\1bb/, '600x600bb');
    }

    function renderSearch(results) {
      const container = $('searchResults');
      container.innerHTML = '';
      if (results.length === 0) {
        container.textContent = 'No results.';
        return;
      }
      const list = document.createElement('ol');
      results.forEach((r, idx) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = 'Add';
        btn.onclick = () => addSeed(r);
        li.appendChild(btn);

        const img = document.createElement('img');
        img.src = r.artworkUrl;
        img.alt = 'cover';
        img.width = 50;
        img.height = 50;
        li.appendChild(img);

        const text = document.createElement('span');
        text.textContent = ` ${r.title} — ${r.artist}`;
        li.appendChild(text);

        list.appendChild(li);
      });
      container.appendChild(list);
    }

    function renderSeeds() {
      const ol = $('seedsList');
      ol.innerHTML = '';
      state.seeds.forEach((s, i) => {
        const li = document.createElement('li');
        li.textContent = `${s.title} — ${s.artist} `;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.onclick = () => {
          state.seeds.splice(i, 1);
          renderSeeds();
        };
        li.appendChild(rm);
        ol.appendChild(li);
      });
    }

    function addSeed(track) {
      // Dedup by title+artist
      const key = (t) => `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
      if (state.seeds.some(s => key(s) === key(track))) return;
      state.seeds.push({ title: track.title, artist: track.artist, itunesId: track.itunesId || null });
      renderSeeds();
    }

    async function enrichTrackWithItunes(track) {
      // Use iTunes to grab artwork/preview/link for a given "title + artist"
      const q = `${track.title} ${track.artist}`;
      const results = await searchItunes(q);
      const best = results[0];
      if (!best) return { ...track, artworkUrl: null, previewUrl: null, itunesUrl: null };
      return {
        ...track,
        artworkUrl: artwork600(best.artworkUrl),
        previewUrl: best.previewUrl,
        itunesUrl: best.itunesUrl
      };
    }

    function renderPlaylist() {
      const ol = $('playlist');
      ol.innerHTML = '';
      state.playlist.forEach((t, i) => {
        const li = document.createElement('li');

        if (t.artworkUrl) {
          const img = document.createElement('img');
          img.src = t.artworkUrl;
          img.alt = 'cover';
          img.width = 100;
          img.height = 100;
          li.appendChild(img);
        }

        const header = document.createElement('div');
        header.textContent = `${t.title} — ${t.artist}  (match: ${t.matchScore ?? '—'})`;
        li.appendChild(header);

        if (t.reason) {
          const p = document.createElement('p');
          p.textContent = t.reason;
          li.appendChild(p);
        }

        if (t.previewUrl) {
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = t.previewUrl;
          li.appendChild(audio);
        }

        if (t.itunesUrl) {
          const a = document.createElement('a');
          a.href = t.itunesUrl;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Open in Apple Music / iTunes';
          li.appendChild(document.createElement('br'));
          li.appendChild(a);
        }

        ol.appendChild(li);
      });

      $('exportJsonBtn').disabled = state.playlist.length === 0;
      $('exportM3UBtn').disabled = state.playlist.length === 0;
    }

    function downloadFile(filename, contents) {
      const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    $('exportJsonBtn').onclick = () => {
      downloadFile('playlist.json', JSON.stringify(state.playlist, null, 2));
    };

    $('exportM3UBtn').onclick = () => {
      const lines = ['#EXTM3U'];
      state.playlist.forEach(t => {
        const duration = -1; // unknown
        lines.push(`#EXTINF:${duration},${t.artist} - ${t.title}`);
        lines.push(t.previewUrl || t.itunesUrl || `${t.artist} - ${t.title}`);
      });
      downloadFile('playlist.m3u', lines.join('\\n'));
    };

    // --- AI call via local proxy /ai ---
    async function generatePlaylist() {
      if (state.seeds.length === 0) {
        alert('Add at least one seed song first.');
        return;
      }
      const howMany = parseInt($('howMany').value, 10) || 15;
      const vibe = $('vibe').value.trim();

      $('status').textContent = 'Asking AI for suggestions...';
      $('generateBtn').disabled = true;

      try {
        const res = await fetch('http://localhost:3000/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seedTracks: state.seeds, howMany, vibe })
        });
        if (!res.ok) throw new Error('AI request failed');
        const ai = await res.json();
        // ai.tracks: [{title, artist, reason, matchScore}]
        const enriched = await Promise.all(ai.tracks.map(enrichTrackWithItunes));
        state.playlist = enriched;
        renderPlaylist();
        $('status').textContent = 'Done.';
      } catch (err) {
        console.error(err);
        $('status').textContent = 'Something went wrong. Check the console.';
      } finally {
        $('generateBtn').disabled = false;
      }
    }

    // --- wire up UI ---
    $('searchBtn').onclick = async () => {
      const term = $('searchBox').value.trim();
      if (!term) return;
      $('searchResults').textContent = 'Searching...';
      try {
        const results = await searchItunes(term);
        renderSearch(results);
      } catch (e) {
        console.error(e);
        $('searchResults').textContent = 'Search failed.';
      }
    };
    $('generateBtn').onclick = generatePlaylist;