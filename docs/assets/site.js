/* The phone menu. The button says whether the menu is open (aria-expanded); Escape, a tap outside
   or choosing a link closes it, and focus goes back to the button when it was closed from the keyboard. */
(function () {
  var btn = document.querySelector(".menu-btn");
  var nav = document.getElementById("site-nav");
  if (!btn || !nav) return;
  function set(open, refocus) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    nav.classList.toggle("open", open);
    if (!open && refocus) btn.focus();
  }
  btn.addEventListener("click", function () { set(btn.getAttribute("aria-expanded") !== "true"); });
  nav.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) set(false, true);
  });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !btn.contains(e.target)) set(false);
  });
  // back on a wide screen the links are always shown: never leave a stale open state behind
  var wide = window.matchMedia("(min-width: 761px)");
  (wide.addEventListener ? wide.addEventListener.bind(wide, "change") : wide.addListener.bind(wide))(function () { set(false); });
})();

/* Download links.
   Release assets carry the version in their names (AutoStream-2.14.1-windows-x64-setup.exe), so a
   fixed /releases/latest/download/<name> link would break on the next release. Every download
   link in the HTML therefore points at the releases page, which always works, and this asks
   GitHub for the latest release once per visit and swaps in the exact file, its size and the
   version. If the request fails (offline, rate limit), the links stay as they were. */
(function () {
  var REPO = "hardikneeravsharma/AutoStream";
  var MATCH = {
    "win-setup": /-windows-x64-setup\.exe$/,
    "win-zip": /-windows-x64\.zip$/,
    "mac-arm": /-macos-arm64\.dmg$/,
    "mac-intel": /-macos-x86_64\.dmg$/
  };
  var links = document.querySelectorAll("[data-asset]");
  var versions = document.querySelectorAll("[data-version]");
  if (!links.length && !versions.length) return;

  function mb(bytes) { return Math.round(bytes / 1048576) + " MB"; }

  function apply(rel) {
    var tag = (rel.tag_name || "").replace(/^v/, "");
    versions.forEach(function (el) { el.textContent = tag; });
    links.forEach(function (a) {
      var re = MATCH[a.getAttribute("data-asset")];
      var asset = re && rel.assets.filter(function (x) { return re.test(x.name); })[0];
      if (!asset) return;
      a.href = asset.browser_download_url;
      var size = a.querySelector("[data-size]");
      if (size) size.textContent = mb(asset.size);
      var sum = rel.assets.filter(function (x) { return x.name === asset.name + ".sha256"; })[0];
      var sumLink = document.querySelector('[data-sum="' + a.getAttribute("data-asset") + '"]');
      if (sum && sumLink) { sumLink.href = sum.browser_download_url; sumLink.hidden = false; }
    });
  }

  var KEY = "autostream-latest";
  try {
    var cached = sessionStorage.getItem(KEY);
    if (cached) { apply(JSON.parse(cached)); return; }
  } catch (e) { /* private mode: just fetch */ }

  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (rel) {
      var slim = { tag_name: rel.tag_name, assets: rel.assets.map(function (x) {
        return { name: x.name, size: x.size, browser_download_url: x.browser_download_url }; }) };
      try { sessionStorage.setItem(KEY, JSON.stringify(slim)); } catch (e) {}
      apply(slim);
    })
    .catch(function () { /* the releases page links stay */ });
})();

/* The videos.
   Every example on the page is a short silent loop of real output. Ones below the fold carry
   their file in data-src and get it only when they come near the screen, so the first visit
   does not download forty megabytes it may never show. A loop plays only while it is on screen
   and in a visible tab panel. With reduced motion asked for, nothing plays by itself: each
   video gets its controls instead. */
(function () {
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var vids = Array.prototype.slice.call(document.querySelectorAll("video[data-loop]"));
  if (!vids.length) return;

  function load(v) {
    if (v.getAttribute("data-src") && !v.getAttribute("src")) {
      v.src = v.getAttribute("data-src");
      v.load();
    }
  }
  function shown(v) { return !v.closest("[hidden]"); }
  function play(v) {
    if (still || !shown(v)) return;
    load(v);
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* autoplay refused: the poster stays, controls appear */ v.controls = true; });
  }

  vids.forEach(function (v) {
    v.muted = true;
    // preload none first, so giving it its file downloads nothing until it is pressed
    if (still) { v.removeAttribute("autoplay"); v.pause(); v.controls = true; v.preload = "none"; load(v); }
  });

  if (!("IntersectionObserver" in window)) { vids.forEach(function (v) { load(v); play(v); }); return; }

  var near = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { load(e.target); near.unobserve(e.target); } });
  }, { rootMargin: "400px 0px" });
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      e.target._inView = e.isIntersecting;
      if (e.isIntersecting) play(e.target); else e.target.pause();
    });
  }, { threshold: 0.25 });
  vids.forEach(function (v) { if (!still) near.observe(v); seen.observe(v); });

  // Tabs: one panel at a time; leaving a panel pauses its loops, opening one starts them.
  document.querySelectorAll("[role=tablist]").forEach(function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll("[role=tab]"));
    function choose(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        panel.hidden = !on;
        panel.querySelectorAll("video[data-loop]").forEach(function (v) {
          if (on) { load(v); if (v._inView !== false) play(v); } else v.pause();
        });
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { choose(t, false); });
      t.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (n) { e.preventDefault(); choose(tabs[(i + n + tabs.length) % tabs.length], true); }
      });
    });
  });

  // The hero: light the stage that is playing, and fill its bar as it plays. The highlight's
  // captions are the real lines from that stream, drawn here rather than burned in, so they can be
  // shown in English or in Hinglish.
  var reel = document.getElementById("showreel");
  var stages = document.querySelectorAll(".stages li");
  var cap = document.querySelector(".showreel .cap");
  var lines = cap ? Array.prototype.slice.call(document.querySelectorAll(".showreel [data-line]")).map(function (el) {
    var at2 = el.getAttribute("data-at").split(",").map(parseFloat);
    return { a: at2[0], b: at2[1], en: el.getAttribute("data-en"), hi: el.getAttribute("data-hi") };
  }) : [];
  var lang = "en";
  var shownLine = null;
  function caption(t) {
    var line = null;
    lines.forEach(function (l) { if (t >= l.a && t < l.b) line = l; });
    var text = line ? line[lang] : "";
    if (text !== shownLine) { cap.textContent = text; cap.hidden = !text; shownLine = text; }
  }
  document.querySelectorAll(".caplang button").forEach(function (b, _, all) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-lang");
      all.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      shownLine = null;
      if (cap && reel) caption(reel.currentTime);
    });
  });
  if (reel && stages.length) {
    var at = (reel.getAttribute("data-stages") || "").split(",").map(parseFloat);
    var tick = function () {
      var t = reel.currentTime, d = reel.duration || at[at.length - 1];
      stages.forEach(function (li, i) {
        var a = at[i], b = i + 1 < at.length ? at[i + 1] : d;
        var on = t >= a && t < b;
        li.classList.toggle("on", on);
        li.classList.toggle("done", t >= b);
        if (on) li.style.setProperty("--p", Math.min(100, (t - a) / (b - a) * 100).toFixed(1) + "%");
      });
      if (cap) caption(t);
      if (!reel.paused) requestAnimationFrame(tick);
    };
    reel.addEventListener("play", function () { requestAnimationFrame(tick); });
    reel.addEventListener("seeked", tick);
    reel.addEventListener("timeupdate", function () { if (reel.paused) tick(); });
  }
})();

/* Screenshots too detailed to read in place open full size. Without scripts, or without <dialog>,
   the link still opens the image itself. */
(function () {
  var links = document.querySelectorAll("a.zoom");
  if (!links.length || typeof HTMLDialogElement !== "function") return;
  var dlg = document.createElement("dialog");
  dlg.className = "lightbox";
  dlg.innerHTML = '<form method="dialog"><button class="lb-close" aria-label="Close">Close</button></form><img alt="">';
  document.body.appendChild(dlg);
  var img = dlg.querySelector("img");
  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var src = a.querySelector("img");
      img.src = a.getAttribute("href");
      img.alt = src ? src.alt : "";
      dlg.showModal();
    });
  });
  // a click on the dark surround closes it, as does Escape (the dialog's own behaviour)
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();
