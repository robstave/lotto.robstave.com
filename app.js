(function () {
  "use strict";

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

  function initPickerPage() {
    const MAIN_COUNT = 5;
    const MAIN_MAX = 47;
    const MEGA_MAX = 27;
    const STORE_API_URL = "https://d2zi62cpjup4kp.cloudfront.net/api/entries";

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
    const API_URL = "https://d2zi62cpjup4kp.cloudfront.net/api/entries?limit=20";
    const statusEl = document.getElementById("status");
    const historyList = document.getElementById("history-list");
    const backBtn = document.getElementById("back-btn");

    if (!statusEl || !historyList || !backBtn) {
      console.error("History page markup is missing required elements.");
      return;
    }

    async function loadHistory() {
      try {
        const response = await fetch(API_URL, { cache: "no-store" });
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
        const card = document.createElement("article");
        card.className = "history-item";

        const heading = document.createElement("h3");
        heading.textContent = `${index + 1}. ${formatDate(entry.pickedAt)}`;
        card.appendChild(heading);

        const numbersWrap = document.createElement("div");
        numbersWrap.className = "numbers";
        (entry.picks || []).forEach((pick) => {
          const ball = document.createElement("span");
          ball.className = "number-ball";
          if (pick.IsSpecial) {
            ball.classList.add("mega-ball");
          }
          ball.textContent = pick.Number;
          numbersWrap.appendChild(ball);
        });
        card.appendChild(numbersWrap);

        if (entry.meta) {
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

        historyList.appendChild(card);
      });
    }

    backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    loadHistory();
  }
})();
