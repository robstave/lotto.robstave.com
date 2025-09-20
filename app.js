(function () {
  "use strict";

  const API_ROOT = "https://d2zi62cpjup4kp.cloudfront.net/api/";
  const STORE_API_URL = `${API_ROOT}entries`;
  const HISTORY_API_URL = `${STORE_API_URL}?limit=20`;

  document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    if (!body) {
      return;
    }
    if (body.classList.contains("picker-page")) {
      initPickerPage();
    } else if (body.classList.contains("history-page")) {
      initHistoryPage();
    } else if (body.classList.contains("detail-page")) {
      initDetailPage();
    }
  });

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    try {
      return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return date.toLocaleString();
    }
  }

  function extractEntryKey(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    if (typeof entry.key === "string" && entry.key.trim()) {
      return entry.key.trim();
    }
    if (typeof entry.Key === "string" && entry.Key.trim()) {
      return entry.Key.trim();
    }
    if (entry.item) {
      return extractEntryKey(entry.item);
    }
    return null;
  }

  function normalizeKey(rawKey) {
    if (typeof rawKey !== "string") {
      return null;
    }
    const trimmed = rawKey.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== "." && segment !== "..")
      .join("/");
  }

  function buildEntryRequestUrl(rawKey) {
    const normalized = normalizeKey(rawKey);
    if (!normalized) {
      return null;
    }
    let path = normalized;
    if (path.slice(0, 4).toLowerCase() === "api/") {
      path = path.slice(4);
    }
    if (path.slice(0, 8).toLowerCase() !== "entries/") {
      path = `entries/${path}`;
    }
    return `${API_ROOT}${path}`;
  }

  function createEntryCard(entry, options = {}) {
    const { index = null, headingText, onDetails, showKey = false } = options;

    const card = document.createElement("article");
    card.className = "history-item";

    const heading = document.createElement("h3");
    const formattedDate = formatDate(entry && entry.pickedAt);
    if (typeof headingText === "string" && headingText.trim()) {
      heading.textContent = headingText.trim();
    } else if (typeof index === "number") {
      heading.textContent = `${index + 1}. ${formattedDate || "Unknown time"}`;
    } else if (formattedDate) {
      heading.textContent = `Picked ${formattedDate}`;
    } else {
      heading.textContent = "Pick details";
    }
    card.appendChild(heading);

    const numbersWrap = document.createElement("div");
    numbersWrap.className = "numbers";
    const picks = Array.isArray(entry && entry.picks) ? entry.picks : [];
    if (picks.length) {
      picks.forEach((pick) => {
        const ball = document.createElement("span");
        ball.className = "number-ball";
        if (pick && pick.IsSpecial) {
          ball.classList.add("mega-ball");
        }
        ball.textContent = pick && pick.Number !== undefined ? pick.Number : "?";
        numbersWrap.appendChild(ball);
      });
    } else {
      const empty = document.createElement("span");
      empty.className = "meta";
      empty.textContent = "No numbers recorded for this pick.";
      numbersWrap.appendChild(empty);
    }
    card.appendChild(numbersWrap);

    if (entry && entry.meta) {
      const metaParts = [];
      if (entry.meta.sourceIp) {
        metaParts.push(`from ${entry.meta.sourceIp}`);
      }
      if (entry.meta.userAgent) {
        metaParts.push(`via ${entry.meta.userAgent}`);
      }
      if (metaParts.length) {
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = `Picked ${metaParts.join(" ")}`;
        card.appendChild(meta);
      }
    }

    if (showKey) {
      const entryKey = extractEntryKey(entry);
      if (entryKey) {
        const keyEl = document.createElement("div");
        keyEl.className = "meta";
        keyEl.textContent = `Storage key: ${entryKey}`;
        card.appendChild(keyEl);
      }
    }

    if (typeof onDetails === "function") {
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.className = "button secondary";
      const entryKey = extractEntryKey(entry);
      if (entryKey) {
        detailsBtn.textContent = "Details";
        detailsBtn.addEventListener("click", () => onDetails(entryKey));
      } else {
        detailsBtn.textContent = "Details Unavailable";
        detailsBtn.disabled = true;
        detailsBtn.setAttribute("aria-disabled", "true");
        detailsBtn.title = "This entry does not include a stored key.";
      }
      actions.appendChild(detailsBtn);
      card.appendChild(actions);
    }

    return card;
  }

  function initPickerPage() {
    const MAIN_COUNT = 5;
    const MAIN_MAX = 47;
    const MEGA_MAX = 27;

    const instructionsEl = document.getElementById("instructions");
    const pickBtn = document.getElementById("pick-btn");
    const historyBtn = document.getElementById("history-btn");
    const storeBtn = document.getElementById("store-btn");
    const numbersDiv = document.getElementById("numbers");
    const catImg = document.querySelector(".cat-img");
    const board = document.getElementById("mystic-board");

    if (!instructionsEl || !pickBtn || !historyBtn || !storeBtn || !numbersDiv || !catImg || !board) {
      console.error("Picker page markup is missing required elements.");
      return;
    }

    let lastMain = [];
    let lastMega = null;

    instructionsEl.innerHTML = `Pick <strong>${MAIN_COUNT} numbers</strong> between 1 and ${MAIN_MAX} and <strong>1 Mega number</strong> between 1 and ${MEGA_MAX}.`;

    function fetchWithTimeout(resource, options = {}, timeoutMs = 12000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(resource, {
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        ...options,
      }).finally(() => clearTimeout(id));
    }

    function randIntInclusive(min, max) {
      const range = max - min + 1;
      const buf = new Uint32Array(1);
      let x;
      do {
        crypto.getRandomValues(buf);
        x = buf[0] % range;
      } while (buf[0] - x > 0xffffffff - (0xffffffff % range));
      return min + x;
    }

    function spawnSparkles(count = 8) {
      const container = document.getElementById("sparkle-container");
      if (!container) {
        return;
      }
      for (let i = 0; i < count; i++) {
        const spark = document.createElement("div");
        spark.className = "sparkle";
        const size = Math.random() * 8 + 4;
        spark.style.width = `${size}px`;
        spark.style.height = `${size}px`;
        spark.style.left = `${Math.random() * 100}%`;
        spark.style.top = `${Math.random() * 100}%`;
        container.appendChild(spark);
        setTimeout(() => {
          if (spark.parentElement) {
            spark.parentElement.removeChild(spark);
          }
        }, 1500);
      }
    }

    const mystic = createMystic();

    function generateNumbers() {
      pickBtn.disabled = true;
      storeBtn.disabled = true;
      storeBtn.textContent = "Store Pick";
      numbersDiv.innerHTML = "";
      catImg.style.animation = "spin 1.5s linear";
      let iteration = 0;
      const sparkleInterval = setInterval(() => {
        spawnSparkles(5);
      }, 150);
      const interval = setInterval(() => {
        const unique = new Set();
        while (unique.size < MAIN_COUNT) {
          unique.add(randIntInclusive(1, MAIN_MAX));
        }
        const arr = Array.from(unique).sort((a, b) => a - b);
        const mega = randIntInclusive(1, MEGA_MAX);
        numbersDiv.innerHTML = "";
        arr.forEach((n) => {
          const ball = document.createElement("div");
          ball.className = "number-ball";
          ball.textContent = n;
          numbersDiv.appendChild(ball);
        });
        const megaBall = document.createElement("div");
        megaBall.className = "number-ball mega-ball";
        megaBall.textContent = mega;
        numbersDiv.appendChild(megaBall);
        lastMain = arr;
        lastMega = mega;
        mystic.draw(MAIN_MAX, arr);
        if (iteration === 0) {
          board.style.display = "block";
        }
        iteration += 1;
        if (iteration >= 20) {
          clearInterval(interval);
          clearInterval(sparkleInterval);
          pickBtn.disabled = false;
          storeBtn.disabled = false;
          catImg.style.animation = "";
        }
      }, 100);
    }

    async function storePick() {
      if (!lastMain.length || lastMega === null) {
        alert("Generate a pick before storing it.");
        return;
      }
      const originalText = storeBtn.textContent;
      storeBtn.disabled = true;
      storeBtn.textContent = "Saving...";
      const picks = lastMain.map((number) => ({
        Number: number,
        IsSpecial: false,
        Name: null,
      }));
      picks.push({
        Number: lastMega,
        IsSpecial: true,
        Name: null,
      });
      const payload = {
        picks,
        pickedAt: new Date().toISOString(),
      };
      try {
        const resp = await fetchWithTimeout(STORE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          console.error("StorePick failed", {
            status: resp.status,
            statusText: resp.statusText,
            body: text,
          });
          if (resp.status === 415 || resp.status === 400) {
            throw new Error("Server rejected JSON; trying fallback");
          }
          throw new Error(`Request failed with status ${resp.status}`);
        }
        window.location.href = "history.html";
        return;
      } catch (err) {
        console.warn("First attempt failed (likely CORS/preflight)", err);
      }
      try {
        const resp2 = await fetchWithTimeout(STORE_API_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!resp2.ok) {
          const text2 = await resp2.text().catch(() => "");
          console.error("StorePick fallback failed", {
            status: resp2.status,
            statusText: resp2.statusText,
            body: text2,
          });
          throw new Error(`Fallback failed with status ${resp2.status}`);
        }
        window.location.href = "history.html";
      } catch (finalErr) {
        console.error("Unable to store pick after fallback", finalErr);
        alert(
          "Unable to store your pick right now. This may be a CORS or network configuration issue. Please try again later."
        );
        storeBtn.disabled = false;
        storeBtn.textContent = originalText;
      }
    }

    pickBtn.addEventListener("click", generateNumbers);
    historyBtn.addEventListener("click", () => {
      window.location.href = "history.html";
    });
    storeBtn.addEventListener("click", storePick);

    window.addEventListener("resize", () => {
      if (lastMain.length) {
        mystic.draw(MAIN_MAX, lastMain);
      }
    });

    function createMystic() {
      const svg = d3.select("#mystic-board");
      const g = svg.append("g");
      const defs = svg.append("defs");

      const glow = defs.append("filter").attr("id", "glow");
      glow
        .append("feGaussianBlur")
        .attr("stdDeviation", 3)
        .attr("result", "coloredBlur");
      const feMerge = glow.append("feMerge");
      feMerge.append("feMergeNode").attr("in", "coloredBlur");
      feMerge.append("feMergeNode").attr("in", "SourceGraphic");

      const grad = defs
        .append("linearGradient")
        .attr("id", "gradStroke")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", "#c9b5ff");
      grad.append("stop").attr("offset", "50%").attr("stop-color", "#a88bff");
      grad
        .append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#e0d7ff");

      function size() {
        const w = document.getElementById("mystic-board").clientWidth;
        svg.attr("viewBox", `0 0 ${w} ${w}`);
        g.attr("transform", `translate(${w / 2},${w / 2})`);
        return w;
      }

      function polarToXY(angle, r) {
        return [Math.cos(angle) * r, Math.sin(angle) * r];
      }

      function starOrder(k) {
        const step = Math.max(2, Math.floor(k / 2));
        const order = [];
        let i = 0;
        for (let n = 0; n < k; n++) {
          order.push(i);
          i = (i + step) % k;
        }
        return order;
      }

      function draw(totalPositions, picks) {
        const w = size();
        g.selectAll("*").remove();

        const R = w * 0.5;
        const rNode = Math.max(2, w * 0.006);

        g.append("circle")
          .attr("r", R)
          .attr("fill", "none")
          .attr("stroke", "#1a1c2a")
          .attr("stroke-width", 1.2);

        const toAngle = (n) => ((n - 1) / totalPositions) * Math.PI * 2 - Math.PI / 2;
        const verts = picks
          .map((n) => ({ n, a: toAngle(n) }))
          .sort((a, b) => a.a - b.a);

        const order = starOrder(verts.length);

        const path = d3.path();
        const first = polarToXY(verts[order[0]].a, R);
        path.moveTo(first[0], first[1]);
        for (let i = 1; i < order.length; i++) {
          const p = polarToXY(verts[order[i]].a, R);
          path.lineTo(p[0], p[1]);
        }
        path.closePath();

        const chord = g
          .append("path")
          .attr("class", "chord")
          .attr("d", path.toString())
          .attr("fill", "none")
          .attr("stroke", "url(#gradStroke)")
          .attr("stroke-width", Math.max(1.5, w * 0.004))
          .attr("filter", "url(#glow)")
          .attr("stroke-linejoin", "round");

        const length = chord.node().getTotalLength();
        chord
          .attr("stroke-dasharray", length)
          .attr("stroke-dashoffset", length)
          .transition()
          .duration(1200)
          .ease(d3.easeCubicOut)
          .attr("stroke-dashoffset", 0);

        g.selectAll(".node")
          .data(verts)
          .enter()
          .append("circle")
          .attr("class", "node")
          .attr("cx", (d) => polarToXY(d.a, R)[0])
          .attr("cy", (d) => polarToXY(d.a, R)[1])
          .attr("r", rNode)
          .attr("fill", "#ffd8ff")
          .attr("opacity", 0.85)
          .attr("filter", "url(#glow)");
      }

      return { draw };
    }
  }

  function initHistoryPage() {
    const statusEl = document.getElementById("status");
    const historyList = document.getElementById("history-list");
    const backBtn = document.getElementById("back-btn");

    if (!statusEl || !historyList || !backBtn) {
      console.error("History page markup is missing required elements.");
      return;
    }

    async function loadHistory() {
      try {
        const response = await fetch(HISTORY_API_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        renderHistory(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        statusEl.textContent = "Unable to load picks right now. Please try again later.";
        console.error("Failed to load history", err);
      }
    }

    function renderHistory(items) {
      historyList.innerHTML = "";
      if (!items.length) {
        statusEl.textContent = "No previous picks have been recorded yet.";
        return;
      }
      statusEl.textContent = "";
      const sorted = [...items].sort((a, b) => {
        const timeA = new Date(a.pickedAt).getTime();
        const timeB = new Date(b.pickedAt).getTime();
        if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
          return 0;
        }
        return timeB - timeA;
      });

      sorted.forEach((entry, index) => {
        const card = createEntryCard(entry, {
          index,
          onDetails: (entryKey) => {
            const detailUrl = new URL("details.html", window.location.href);
            detailUrl.searchParams.set("key", entryKey);
            window.location.href = detailUrl.toString();
          },
        });
        historyList.appendChild(card);
      });
    }

    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    loadHistory();
  }

  function initDetailPage() {
    const statusEl = document.getElementById("status");
    const detailContainer = document.getElementById("entry-detail");
    const historyBtn = document.getElementById("history-back-btn");
    const homeBtn = document.getElementById("home-btn");
    const rawLink = document.getElementById("raw-link");

    if (!statusEl || !detailContainer || !historyBtn || !homeBtn) {
      console.error("Detail page markup is missing required elements.");
      return;
    }

    historyBtn.addEventListener("click", () => {
      window.location.href = "history.html";
    });

    homeBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    const params = new URLSearchParams(window.location.search);
    const rawKey = params.get("key");
    const requestUrl = buildEntryRequestUrl(rawKey || "");

    if (!rawKey) {
      statusEl.textContent = "No entry key was provided.";
      return;
    }

    if (!requestUrl) {
      statusEl.textContent = "The entry key provided is invalid.";
      return;
    }

    async function loadEntryDetails() {
      statusEl.textContent = "Loading entry details...";
      detailContainer.innerHTML = "";
      try {
        const response = await fetch(requestUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        const entry = data && typeof data === "object" && data.item ? data.item : data;
        if (!entry || typeof entry !== "object") {
          throw new Error("Entry payload was not in the expected format.");
        }
        const headingText = entry.pickedAt
          ? `Picked ${formatDate(entry.pickedAt)}`
          : "Pick details";
        const card = createEntryCard(entry, {
          headingText,
          showKey: true,
        });
        detailContainer.appendChild(card);
        statusEl.textContent = "";
        if (rawLink) {
          rawLink.href = requestUrl;
          rawLink.classList.remove("hidden");
        }
      } catch (err) {
        console.error("Failed to load entry details", err);
        statusEl.textContent =
          "Unable to load entry details right now. Please try again later.";
        if (rawLink) {
          rawLink.classList.add("hidden");
        }
      }
    }

    loadEntryDetails();
  }
})();
