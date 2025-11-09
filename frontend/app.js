(function () {
  "use strict";

  const GAME_CONFIGS = {
    superlotto: {
      id: "superlotto",
      name: "SuperLotto Plus",
      mainCount: 5,
      mainMax: 47,
      special: {
        label: "Mega",
        max: 27,
      },
    },
    fantasy5: {
      id: "fantasy5",
      name: "Fantasy 5",
      mainCount: 5,
      mainMax: 39,
      special: null,
    },
  };
  const DEFAULT_GAME_ID = "superlotto";
  const API_BASE_URL = "https://d2zi62cpjup4kp.cloudfront.net/api/entries";

  function getGameConfig(gameId) {
    if (!gameId || typeof gameId !== "string") {
      return GAME_CONFIGS[DEFAULT_GAME_ID];
    }
    const normalized = gameId.trim().toLowerCase();
    if (normalized in GAME_CONFIGS) {
      return GAME_CONFIGS[normalized];
    }
    return GAME_CONFIGS[DEFAULT_GAME_ID];
  }

  document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    if (!body) {
      return;
    }
    if (body.classList.contains("picker-page")) {
      initPickerPage();
    } else if (body.classList.contains("history-page")) {
      initHistoryPage();
    }
  });

  function createMysticBoard(svgElement) {
    if (!svgElement) {
      throw new Error("Mystic board SVG element is required");
    }

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();

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

    svg.attr("preserveAspectRatio", "xMidYMid meet");

    function size() {
      const rect = svgElement.getBoundingClientRect();
      const fallback =
        Number.parseFloat(svgElement.getAttribute("data-size")) ||
        Number.parseFloat(svgElement.getAttribute("width")) ||
        Number.parseFloat(svgElement.getAttribute("height")) ||
        120;
      const dimension =
        rect.width > 0
          ? rect.width
          : rect.height > 0
          ? rect.height
          : fallback;
      svg.attr("viewBox", `0 0 ${dimension} ${dimension}`);
      g.attr("transform", `translate(${dimension / 2},${dimension / 2})`);
      return dimension;
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

    function sanitizeSpecial(rawSpecial, fallbackLimit) {
      if (rawSpecial === null || rawSpecial === undefined) {
        return null;
      }

      const baseLimit =
        Number.isFinite(fallbackLimit) && fallbackLimit > 0 ? fallbackLimit : null;

      let valueCandidate;
      let limitCandidate = baseLimit;

      if (typeof rawSpecial === "object") {
        const source = rawSpecial;
        valueCandidate =
          source.value ?? source.number ?? source.n ?? source.pick ?? source;
        const possibleLimits = [source.max, source.limit, source.total];
        for (const option of possibleLimits) {
          const parsed = Number.parseInt(option, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            limitCandidate = parsed;
            break;
          }
        }
      } else {
        valueCandidate = rawSpecial;
      }

      const value = Number.parseInt(valueCandidate, 10);
      if (!Number.isFinite(value)) {
        return null;
      }

      if (!Number.isFinite(limitCandidate) || limitCandidate <= 0) {
        return null;
      }

      if (value < 1 || value > limitCandidate) {
        return null;
      }

      return { value, limit: limitCandidate };
    }

    function draw(totalPositions, picks, specialPick) {
      g.selectAll("*").remove();
      const w = size();

      const limit = Number.isFinite(totalPositions) && totalPositions > 0 ? totalPositions : null;
      const sanitized = Array.from(
        new Set(
          (Array.isArray(picks) ? picks : [])
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isFinite(value))
            .filter((value) => value >= 1 && (limit === null || value <= limit))
        )
      );

      const R = w * 0.5;
      const rNode = Math.max(2, w * 0.005);

      const special = sanitizeSpecial(specialPick, limit ?? totalPositions);
      const glowAllowance = Math.max(4, w * 0.01);
      const circlePadding = Math.max(1.2, w * 0.003);
      const specialOffset = glowAllowance + circlePadding;

      g.append("circle")
        .attr("r", R)
        .attr("fill", "none")
        .attr("stroke", "#1a1c2a")
        .attr("stroke-width", 1.2);

      if ((!limit || !sanitized.length) && !special) {
        return;
      }

      let verts = [];
      if (limit && sanitized.length) {
        const toAngle = (n) => ((n - 1) / limit) * Math.PI * 2 - Math.PI / 2;
        verts = sanitized
          .map((n) => ({ n, a: toAngle(n) }))
          .sort((a, b) => a.a - b.a);

        if (verts.length) {
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
      }

      if (special) {
        const specialAngle =
          ((special.value - 1) / special.limit) * Math.PI * 2 - Math.PI / 2;
        let specialRadius = Math.max(rNode * 1.8, w * 0.012);
        const maxSpecialRadius = Math.max(0, R - specialOffset);
        if (specialRadius > maxSpecialRadius) {
          specialRadius = maxSpecialRadius;
        }
        if (specialRadius > 0) {
          const specialOrbit = Math.max(R - (specialRadius + specialOffset), 0);
          const [sx, sy] = polarToXY(specialAngle, specialOrbit);
          g.append("circle")
            .attr("class", "special-node")
            .attr("cx", sx)
            .attr("cy", sy)
            .attr("r", specialRadius)
            .attr("fill", "#ff4d6d")
            .attr("stroke", "#ffffff")
            .attr("stroke-width", Math.max(1, w * 0.0025))
            .attr("opacity", 0.95)
            .attr("filter", "url(#glow)");
        }
      }
    }

    return { draw };
  }

  function initPickerPage() {
    const STORE_API_URL = API_BASE_URL;

    const instructionsEl = document.getElementById("instructions");
    const pickBtn = document.getElementById("pick-btn");
    const historyBtn = document.getElementById("history-btn");
    const storeBtn = document.getElementById("store-btn");
    const numbersDiv = document.getElementById("numbers");
    const catImg = document.querySelector(".cat-img");
    const board = document.getElementById("mystic-board");
    const gameToggle = document.getElementById("game-toggle");
    const gameButtons = gameToggle
      ? Array.from(gameToggle.querySelectorAll("[data-game]"))
      : [];
    const titleEl = document.getElementById("game-title");

    if (
      !instructionsEl ||
      !pickBtn ||
      !historyBtn ||
      !storeBtn ||
      !numbersDiv ||
      !catImg ||
      !board
    ) {
      console.error("Picker page markup is missing required elements.");
      return;
    }

    let currentGame = getGameConfig(DEFAULT_GAME_ID);
    let lastMain = [];
    let lastSpecial = null;

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

    const mystic = createMysticBoard(document.getElementById("mystic-board"));

    function resetCurrentPick() {
      lastMain = [];
      lastSpecial = null;
      numbersDiv.innerHTML = "";
      board.style.display = "none";
      storeBtn.disabled = true;
      storeBtn.textContent = "Store Pick";
      if (catImg) {
        catImg.style.animation = "";
      }
    }

    function updateGameUi() {
      const special = currentGame.special;
      if (titleEl) {
        titleEl.textContent = `${currentGame.name} Picker`;
      }
      const titleNode = document.querySelector("title");
      if (titleNode) {
        titleNode.textContent = `California Lottery Picker — ${currentGame.name}`;
      }
      instructionsEl.innerHTML = special
        ? `Pick <strong>${currentGame.mainCount} numbers</strong> between 1 and ${currentGame.mainMax} and <strong>1 ${special.label} number</strong> between 1 and ${special.max}.`
        : `Pick <strong>${currentGame.mainCount} numbers</strong> between 1 and ${currentGame.mainMax}.`;
      gameButtons.forEach((button) => {
        const buttonConfig = getGameConfig(button.dataset.game);
        const isActive = buttonConfig.id === currentGame.id;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function applyGameSelection(gameId) {
      const nextGame = getGameConfig(gameId);
      if (nextGame.id === currentGame.id) {
        return;
      }
      currentGame = nextGame;
      resetCurrentPick();
      updateGameUi();
    }

    if (gameButtons.length) {
      gameButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyGameSelection(button.dataset.game);
        });
      });
    }

    resetCurrentPick();
    updateGameUi();

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
        while (unique.size < currentGame.mainCount) {
          unique.add(randIntInclusive(1, currentGame.mainMax));
        }
        const arr = Array.from(unique).sort((a, b) => a - b);
        const specialConfig = currentGame.special;
        const specialValue = specialConfig
          ? randIntInclusive(1, specialConfig.max)
          : null;
        numbersDiv.innerHTML = "";
        arr.forEach((n) => {
          const ball = document.createElement("div");
          ball.className = "number-ball";
          ball.textContent = n;
          numbersDiv.appendChild(ball);
        });
        if (specialConfig && specialValue !== null) {
          const megaBall = document.createElement("div");
          megaBall.className = "number-ball mega-ball";
          megaBall.textContent = specialValue;
          numbersDiv.appendChild(megaBall);
        }
        lastMain = arr;
        lastSpecial = specialConfig ? specialValue : null;
        const specialDraw =
          specialConfig && specialValue !== null
            ? { value: specialValue, max: specialConfig.max }
            : null;
        mystic.draw(currentGame.mainMax, arr, specialDraw);
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
      const specialConfig = currentGame.special;
      if (
        lastMain.length !== currentGame.mainCount ||
        (specialConfig && lastSpecial === null)
      ) {
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
      if (specialConfig && lastSpecial !== null) {
        picks.push({
          Number: lastSpecial,
          IsSpecial: true,
          Name: null,
        });
      }
      const payload = {
        picks,
        pickedAt: new Date().toISOString(),
        game: currentGame.id,
      };
      // Attempt 1: Standard JSON POST (may trigger preflight)
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

      // Attempt 2: Simple request with text/plain to avoid preflight
      try {
        const resp2 = await fetchWithTimeout(STORE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!resp2.ok) {
          const text2 = await resp2.text().catch(() => "");
          console.error("StorePick fallback (text/plain) failed", {
            status: resp2.status,
            statusText: resp2.statusText,
            body: text2,
          });
          throw new Error(`Fallback failed with status ${resp2.status}`);
        }
        window.location.href = "history.html";
        return;
      } catch (err2) {
        console.warn("Second attempt failed (text/plain simple request)", err2);
      }

      // Attempt 3: no-cors opaque request (fire-and-forget). We can’t read the response, so we optimistically navigate.
      try {
        await fetch(STORE_API_URL, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
          },
          body: JSON.stringify(payload),
        });
        window.location.href = "history.html";
        return;
      } catch (err3) {
        console.error("Third attempt failed (no-cors)", err3);
      }

      alert(
        "Unable to store your pick right now. This may be a CORS or network configuration issue. Please try again later."
      );
      storeBtn.disabled = false;
      storeBtn.textContent = originalText;
    }

    pickBtn.addEventListener("click", generateNumbers);
    historyBtn.addEventListener("click", () => {
      window.location.href = "history.html";
    });
    storeBtn.addEventListener("click", storePick);

    window.addEventListener("resize", () => {
      if (lastMain.length) {
        const specialConfig = currentGame.special;
        const special =
          specialConfig && lastSpecial !== null
            ? { value: lastSpecial, max: specialConfig.max }
            : null;
        mystic.draw(currentGame.mainMax, lastMain, special);
      }
    });
  }

  function initHistoryPage() {
    const DEFAULT_HISTORY_LIMIT = 20;
    const DEFAULT_GAME_FILTER = "all";
    const statusEl = document.getElementById("status");
    const historyList = document.getElementById("history-list");
    const backBtn = document.getElementById("back-btn");
    const filterSelect = document.getElementById("game-filter");

    if (!statusEl || !historyList || !backBtn) {
      console.error("History page markup is missing required elements.");
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const rawGameParam = searchParams.get("game");
    const normalizedQueryParam =
      typeof rawGameParam === "string" ? rawGameParam.trim().toLowerCase() : null;
    let currentGameFilter = normalizeGameFilter(rawGameParam);

    if (filterSelect) {
      filterSelect.value = currentGameFilter;
    }

    function fetchWithTimeout(resource, options = {}, timeoutMs = 12000) {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), timeoutMs);
      const mergedOptions = {
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        ...options,
        signal: controller.signal,
      };
      return fetch(resource, mergedOptions).finally(() => clearTimeout(timerId));
    }

    function coerceBoolean(value) {
      if (value === null || value === undefined) {
        return false;
      }
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "number") {
        return value !== 0;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized) {
          return false;
        }
        if (["true", "1", "yes", "y"].includes(normalized)) {
          return true;
        }
        if (["false", "0", "no", "n"].includes(normalized)) {
          return false;
        }
        return Boolean(normalized);
      }
      return Boolean(value);
    }

    function getPlayedState(entry) {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const candidates = [
        "played",
        "Played",
        "isPlayed",
        "IsPlayed",
        "wasPlayed",
        "WasPlayed",
      ];
      for (const prop of candidates) {
        if (prop in entry) {
          return coerceBoolean(entry[prop]);
        }
      }
      const nested = [entry.meta, entry.metadata, entry.state, entry.details];
      for (const candidate of nested) {
        if (candidate && typeof candidate === "object") {
          if ("played" in candidate) {
            return coerceBoolean(candidate.played);
          }
          if ("Played" in candidate) {
            return coerceBoolean(candidate.Played);
          }
        }
      }
      return false;
    }

    function getEntryId(entry) {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const candidates = [
        entry.id,
        entry.ID,
        entry.entryId,
        entry.EntryId,
        entry.entryID,
        entry.key,
        entry.Key,
        entry.pk,
        entry.PK,
        entry.sk,
        entry.SK,
        entry.s3Key,
        entry.S3Key,
        entry.filename,
        entry.fileName,
        entry.name,
        entry.uri,
        entry.URL,
      ];
      for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) {
          continue;
        }
        const text = String(candidate).trim();
        if (text) {
          return text;
        }
      }
      if (typeof entry.location === "string" && entry.location.trim()) {
        return entry.location.trim();
      }
      return null;
    }

    function normalizeEntryId(entryId) {
      if (entryId === null || entryId === undefined) {
        return "";
      }

      const rawText = String(entryId).trim();
      if (!rawText) {
        return "";
      }

      let decoded = rawText;
      try {
        decoded = decodeURIComponent(rawText);
      } catch (err) {
        // Value may not actually be encoded; fall back to the raw text.
      }

      const trimmed = decoded.replace(/^\/+|\/+$/g, "");
      if (!trimmed) {
        return "";
      }

      const segments = trimmed
        .split("/")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

      if (!segments.length) {
        return "";
      }

      let normalizedSegments = segments;
      if (segments.length > 1 && segments[0].toLowerCase() === "entries") {
        normalizedSegments = segments.slice(1);
        if (!normalizedSegments.length) {
          normalizedSegments = segments;
        }
      }

      return normalizedSegments
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    }

    async function updatePlayedStateRequest(entryId, playedValue) {
      const normalizedId = normalizeEntryId(entryId);
      if (!normalizedId) {
        throw new Error("Missing or invalid entry identifier");
      }
      const targetUrl = `${API_BASE_URL}/${normalizedId}/played/${playedValue ? "true" : "false"}`;
      const response = await fetchWithTimeout(targetUrl, {
        method: "PUT",
        headers: {
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Request failed with status ${response.status}${body ? `: ${body}` : ""}`
        );
      }
    }

    function getFilterLabel(filter) {
      if (filter === DEFAULT_GAME_FILTER) {
        return "all games";
      }
      const config = GAME_CONFIGS[filter];
      return config ? config.name : "selected game";
    }

    function getFilterStatusLabel() {
      return currentGameFilter === DEFAULT_GAME_FILTER
        ? "recent picks"
        : `${getFilterLabel(currentGameFilter)} picks`;
    }

    function buildApiUrl() {
      const params = new URLSearchParams();
      params.set("limit", String(DEFAULT_HISTORY_LIMIT));
      if (currentGameFilter !== DEFAULT_GAME_FILTER) {
        params.set("game", currentGameFilter);
      }
      return `${API_BASE_URL}?${params.toString()}`;
    }

    function updateFilterHintInUrl(filter) {
      if (typeof window === "undefined" || !window.history || !window.location) {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (filter === DEFAULT_GAME_FILTER) {
        params.delete("game");
      } else {
        params.set("game", filter);
      }
      const search = params.toString();
      const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    }

    function normalizeGameFilter(value) {
      if (typeof value !== "string") {
        return DEFAULT_GAME_FILTER;
      }
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return DEFAULT_GAME_FILTER;
      }
      if (normalized === DEFAULT_GAME_FILTER) {
        return DEFAULT_GAME_FILTER;
      }
      if (Object.prototype.hasOwnProperty.call(GAME_CONFIGS, normalized)) {
        return normalized;
      }
      return DEFAULT_GAME_FILTER;
    }

    function setGameFilter(nextFilter) {
      const normalized = normalizeGameFilter(nextFilter);
      if (normalized === currentGameFilter) {
        if (filterSelect && filterSelect.value !== normalized) {
          filterSelect.value = normalized;
        }
        return;
      }
      currentGameFilter = normalized;
      if (filterSelect && filterSelect.value !== normalized) {
        filterSelect.value = normalized;
      }
      updateFilterHintInUrl(normalized);
      loadHistory();
    }

    if (normalizedQueryParam !== null && normalizedQueryParam !== currentGameFilter) {
      updateFilterHintInUrl(currentGameFilter);
    }

    async function loadHistory() {
      historyList.innerHTML = "";
      statusEl.textContent = `Loading ${getFilterStatusLabel()}...`;
      try {
        const response = await fetchWithTimeout(buildApiUrl(), {
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = await response.json();
        renderHistory(Array.isArray(data.items) ? data.items : []);
        return true;
      } catch (err) {
        statusEl.textContent = `Unable to load ${getFilterStatusLabel()} right now. Please try again later.`;
        console.error("Failed to load history", err);
        return false;
      }
    }

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

    function renderHistory(items) {
      historyList.innerHTML = "";
      if (!items.length) {
        statusEl.textContent =
          currentGameFilter === DEFAULT_GAME_FILTER
            ? "No previous picks have been recorded yet."
            : `No ${getFilterLabel(currentGameFilter)} picks have been recorded yet.`;
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
        const card = document.createElement("article");
        card.className = "history-item";

        const content = document.createElement("div");
        content.className = "history-content";
        card.appendChild(content);

        const gameConfig = getGameConfig(entry.game);
        card.dataset.game = gameConfig.id;

        const heading = document.createElement("h3");
        heading.textContent = `${index + 1}. ${formatDate(entry.pickedAt)}`;
        content.appendChild(heading);

        const numbersWrap = document.createElement("div");
        numbersWrap.className = "numbers";
        (entry.picks || []).forEach((pick) => {
          const ball = document.createElement("span");
          ball.className = "number-ball";
          if (pick.IsSpecial && gameConfig.special) {
            ball.classList.add("mega-ball");
          }
          ball.textContent = pick.Number;
          numbersWrap.appendChild(ball);
        });
        content.appendChild(numbersWrap);

        const metaRow = document.createElement("div");
        metaRow.className = "history-meta";

        const gameBadge = document.createElement("span");
        gameBadge.className = "history-game";
        gameBadge.textContent = gameConfig.name;
        gameBadge.dataset.game = gameConfig.id;
        metaRow.appendChild(gameBadge);

        const playedIndicator = document.createElement("span");
        playedIndicator.className = "history-played-state";
        metaRow.appendChild(playedIndicator);

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "button small history-played-toggle";
        metaRow.appendChild(toggleBtn);

        const entryId = getEntryId(entry);
        const initialPlayed = getPlayedState(entry);

        const applyPlayedUi = (value) => {
          const isPlayed = Boolean(value);
          playedIndicator.textContent = `Played: ${isPlayed ? "true" : "false"}`;
          playedIndicator.classList.toggle("is-true", isPlayed);
          playedIndicator.classList.toggle("is-false", !isPlayed);
          toggleBtn.textContent = isPlayed ? "Mark as unplayed" : "Mark as played";
          toggleBtn.setAttribute("aria-pressed", isPlayed ? "true" : "false");
        };

        applyPlayedUi(initialPlayed);

        if (!entryId) {
          toggleBtn.disabled = true;
          toggleBtn.textContent = "ID unavailable";
          toggleBtn.title = "Unable to update without an entry identifier.";
          toggleBtn.setAttribute("aria-disabled", "true");
        } else {
          toggleBtn.addEventListener("click", async () => {
            const current = getPlayedState(entry);
            const nextValue = !current;
            statusEl.textContent = "Updating entry...";
            toggleBtn.disabled = true;
            toggleBtn.textContent = "Updating...";
            toggleBtn.setAttribute("aria-busy", "true");
            try {
              await updatePlayedStateRequest(entryId, nextValue);
            } catch (err) {
              console.error("Failed to update played state", err);
              statusEl.textContent =
                "Unable to update the played state right now. Please try again later.";
              toggleBtn.disabled = false;
              toggleBtn.removeAttribute("aria-busy");
              toggleBtn.removeAttribute("aria-disabled");
              applyPlayedUi(current);
              return;
            }

            const reloadSucceeded = await loadHistory();
            if (reloadSucceeded) {
              return;
            }
            statusEl.textContent =
              "Played state updated, but the history view could not be refreshed. Please reload.";
            toggleBtn.disabled = false;
            toggleBtn.removeAttribute("aria-busy");
            toggleBtn.removeAttribute("aria-disabled");
            applyPlayedUi(nextValue);
          });
        }

        content.appendChild(metaRow);

        const vizWrapper = document.createElement("div");
        vizWrapper.className = "history-board-wrapper";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "history-board");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Mystic pick visualization");
        vizWrapper.appendChild(svg);
        card.appendChild(vizWrapper);

        historyList.appendChild(card);

        const mainNumbers = (entry.picks || [])
          .filter((pick) => !pick.IsSpecial)
          .map((pick) => pick.Number);
        const specialPick = (entry.picks || []).find((pick) => pick.IsSpecial);
        const special =
          specialPick && gameConfig.special
            ? { value: specialPick.Number, max: gameConfig.special.max }
            : null;
        try {
          const board = createMysticBoard(svg);
          const render = () => board.draw(gameConfig.mainMax, mainNumbers, special);
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(render);
          } else {
            render();
          }
        } catch (err) {
          console.error("Failed to render history board", err);
        }
      });
    }

    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    if (filterSelect) {
      filterSelect.addEventListener("change", (event) => {
        setGameFilter(event.target.value);
      });
    }

    loadHistory();
  }
})();
