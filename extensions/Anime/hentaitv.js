/**
 * StrawVerse Extension - Hentai.tv Anime Scraper
 *
 * DISCLAIMER: This extension is intended for research, educational,
 * and developer testing purposes only. It functions as a client-side parser
 * of publicly available web pages and APIs.
 */
const crypto = require("crypto");

const baseUrl = "https://hentai.tv";

function getHttpClient() {
  if (global.axios) return global.axios;
  try {
    return require("axios");
  } catch (_) {
    return null;
  }
}

function solvePoW(challenge) {
  let n = 0;
  while (n < 10000000) {
    const hexN = n.toString(16);
    const hash = crypto.createHash("sha256").update(challenge + hexN).digest();
    if (hash[0] === 0) return hexN;
    n++;
  }
  return null;
}

function generateFingerprint() {
  const data = {
    t: 1200,
    mm: [
      [120, 200, 100],
      [160, 240, 250],
      [210, 280, 420],
      [270, 320, 600],
    ],
    tm: [],
    cl: [[270, 320, 750]],
    kp: [],
    sc: [],
    i: 1,
    mc: 4,
    tc: 0,
    cc: 1,
    kc: 0,
    b: {
      sw: 1920,
      sh: 1080,
      aw: 1920,
      ah: 1040,
      cd: 24,
      pd: 24,
      tz: -330,
      hc: 8,
      dm: 8,
      pl: "Linux x86_64",
      lang: "en-US",
      langs: "en-US,en",
      dpr: 1,
      ww: 1920,
      wh: 950,
      touch: false,
      pdf: true,
      fonts: 10,
    },
  };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return baseUrl + url;
  return url;
}

async function resolveNhplayerStream(embedUrl) {
  const client = getHttpClient();
  if (!client) throw new Error("HTTP client unavailable");

  const r1 = await client.get(embedUrl, {
    headers: {
      Referer: "https://hentai.tv/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  });

  const mPlayer = r1.data.match(/data-id=\"(\/player\.php\?[^\"]+)\"/);
  if (!mPlayer) throw new Error("player.php link not found in embed page");
  const playerUrl = "https://nhplayer.com" + mPlayer[1];

  let cookie = "";
  const setCookie1 = r1.headers?.["set-cookie"];
  if (setCookie1) {
    cookie = (Array.isArray(setCookie1) ? setCookie1 : [setCookie1])
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  const r2 = await client.get(playerUrl, {
    headers: {
      Referer: embedUrl,
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  });

  const setCookie2 = r2.headers?.["set-cookie"];
  if (setCookie2) {
    const c2 = (Array.isArray(setCookie2) ? setCookie2 : [setCookie2])
      .map((c) => c.split(";")[0])
      .join("; ");
    cookie = cookie ? `${cookie}; ${c2}` : c2;
  }

  const mpV = r2.data.match(/window\._pV\s*=\s*(\{.*?\});/);
  if (!mpV) throw new Error("_pV not found in player.php");
  const pV = eval("(" + mpV[1] + ")");

  let subtitleUrl = null;
  const mSub = playerUrl.match(/[?&]s=([a-zA-Z0-9+/=]+)/);
  if (mSub) {
    try {
      const decoded = Buffer.from(mSub[1], "base64").toString("utf8");
      if (decoded.startsWith("http")) subtitleUrl = decoded;
    } catch (_) {}
  }

  const mCore = r2.data.match(/src=\"(player-core-v2\.php\?[^\"]+)\"/);
  if (!mCore) throw new Error("player-core-v2.php not found");
  const coreUrl = "https://nhplayer.com/" + mCore[1];

  const r3 = await client.get(coreUrl, {
    headers: {
      Referer: playerUrl,
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  });

  const mAd = r3.data.match(
    /var\s+[a-zA-Z0-9_$]+\s*=\s*'([0-9a-f]{8}\.[0-9a-f]{16})'/,
  );
  const mYEp = r3.data.match(/var\s+[a-zA-Z0-9_$]+\s*=\s*'([0-9a-f]{16})'/);
  if (!mAd || !mYEp)
    throw new Error("Server challenge tokens not found in core script");
  const sc = mAd[1];
  const rid = mYEp[1];

  const fnMatches = [...r3.data.matchAll(/getElementById\('([^']+)'\)/g)].map(
    (m) => m[1],
  );
  if (fnMatches.length < 5)
    throw new Error("Insufficient challenge element IDs");
  const [id1, id2, id3, id4, id5] = fnMatches;

  const mE1 =
    r2.data.match(
      new RegExp(
        `<span[^>]+id=[\"']${id1}[\"'][^>]+data-[a-zA-Z0-9]+=\"([a-f0-9]{8})\"`,
      ),
    ) ||
    r2.data.match(
      new RegExp(
        `data-[a-zA-Z0-9]+=\"([a-f0-9]{8})\"[^>]+id=[\"']${id1}[\"']`,
      ),
    );
  const mE2 =
    r2.data.match(
      new RegExp(`<input[^>]+id=[\"']${id2}[\"'][^>]+value=\"([a-f0-9]{8})\"`),
    ) ||
    r2.data.match(
      new RegExp(`value=\"([a-f0-9]{8})\"[^>]+id=[\"']${id2}[\"']`),
    );
  const mE3 =
    r2.data.match(
      new RegExp(
        `<div[^>]+id=[\"']${id3}[\"'][^>]+data-[a-zA-Z0-9]+=\"([a-f0-9]{8})\"`,
      ),
    ) ||
    r2.data.match(
      new RegExp(
        `data-[a-zA-Z0-9]+=\"([a-f0-9]{8})\"[^>]+id=[\"']${id3}[\"']`,
      ),
    );
  const mE4 = r2.data.match(
    new RegExp(
      `<template[^>]+id=[\"']${id4}[\"'][^>]*>\\s*<p>([a-f0-9]{8})<\\/p>`,
    ),
  );
  const mE5 =
    r2.data.match(
      new RegExp(
        `<span[^>]+id=[\"']${id5}[\"'][^>]+data-[a-zA-Z0-9]+=\"(\\d+)\"`,
      ),
    ) ||
    r2.data.match(
      new RegExp(`data-[a-zA-Z0-9]+=\"(\\d+)\"[^>]+id=[\"']${id5}[\"']`),
    );

  if (!mE1 || !mE2 || !mE3 || !mE4 || !mE5) {
    throw new Error("Failed to extract DOM challenge parts from player.php");
  }

  const p1 = mE1[1],
    p2 = mE2[1],
    p3 = mE3[1],
    p4 = mE4[1],
    ts = mE5[1];
  const pow = solvePoW(p1 + p2 + p3 + p4 + ts);
  if (!pow) throw new Error("PoW computation failed");

  await new Promise((r) => setTimeout(r, 750));

  const params = new URLSearchParams({
    vid: pV.vid,
    c: pV.ct || "",
    p1,
    p2,
    p3,
    p4,
    t: ts,
    sc,
    rid,
    fp: generateFingerprint(),
    df: "",
    pow,
    pid: pV.pid || "",
    st: pV.st || "",
  });

  const apiRes = await client.get(
    "https://nhplayer.com/get-video-url-v2.php?" + params.toString(),
    {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: playerUrl,
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 15000,
    },
  );

  const rawUrl = apiRes.data?.url;
  if (!rawUrl) throw new Error("No video URL returned from nhplayer API");

  return {
    url: rawUrl,
    subtitle: subtitleUrl,
  };
}

async function SearchAnime(query, page = 1) {
  try {
    const qTrim = (query || "").trim();
    if (!qTrim) {
      return await fetchRecentEpisodes({ page });
    }

    const client = getHttpClient();
    if (!client) throw new Error("HTTP client unavailable");

    const res = await client.get(
      `${baseUrl}/api/search?q=${encodeURIComponent(qTrim)}&limit=20`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      },
    );

    const videos = Array.isArray(res.data?.videos) ? res.data.videos : [];
    const seenSeries = new Set();
    const results = [];

    for (const v of videos) {
      const sId = v.titleSlug || v.slug;
      if (!sId || seenSeries.has(sId)) continue;
      seenSeries.add(sId);
      results.push({
        id: sId,
        title: v.title || sId,
        image: normalizeUrl(v.cover || v.thumb || v.featureImage),
      });
    }

    return {
      currentPage: page,
      hasNextPage: false,
      totalPages: 1,
      results,
    };
  } catch (err) {
    return {
      currentPage: page,
      hasNextPage: false,
      totalPages: 0,
      results: [],
    };
  }
}

async function fetchRecentEpisodes(filters = {}) {
  try {
    const page = filters?.page || 1;
    const client = getHttpClient();
    if (!client) throw new Error("HTTP client unavailable");

    const res = await client.get(`${baseUrl}/api/browse?page=${page}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    const videos = Array.isArray(res.data?.videos) ? res.data.videos : [];
    const totalPages =
      typeof res.data?.pages === "number" ? res.data.pages : 1;
    const seenSeries = new Set();
    const results = [];

    for (const v of videos) {
      const sId = v.titleSlug || v.slug;
      if (!sId || seenSeries.has(sId)) continue;
      seenSeries.add(sId);
      results.push({
        id: sId,
        title: v.title || sId,
        image: normalizeUrl(v.cover || v.thumb || v.featureImage),
      });
    }

    return {
      currentPage: page,
      hasNextPage: page < totalPages,
      totalPages: totalPages,
      results,
    };
  } catch (err) {
    return { currentPage: 1, hasNextPage: false, totalPages: 0, results: [] };
  }
}

async function AnimeInfo(id) {
  try {
    const client = getHttpClient();
    if (!client) throw new Error("HTTP client unavailable");

    const cleanId = String(id || "")
      .trim()
      .replace(/^\/hentai\//, "")
      .replace(/\/$/, "");
    const res = await client.get(`${baseUrl}/hentai/${cleanId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 12000,
    });

    const html = res.data;
    const chunks = [];
    const r = /self\.__next_f\.push\(\[1,\"(.*?)\"\]\)/g;
    let m;
    while ((m = r.exec(html)) !== null) {
      try {
        chunks.push(JSON.parse('"' + m[1] + '"'));
      } catch (_) {
        chunks.push(m[1]);
      }
    }
    const full = chunks.join("");

    let title = cleanId;
    let image = null;
    let description = "";
    let genres = [];
    let status = "Completed";

    const mVideo = full.match(/\"video\":(\{.*?\})/);
    if (mVideo) {
      try {
        const v = JSON.parse(mVideo[1]);
        if (v.title) title = v.title;
        if (v.cover || v.featureImage)
          image = normalizeUrl(v.cover || v.featureImage);
        if (v.description) description = v.description;
        if (Array.isArray(v.tags)) genres = v.tags;
      } catch (_) {}
    }

    if (!image) {
      const mPoster = html.match(/class=\"poster-img\"[^>]+src=\"([^\"]+)\"/);
      if (mPoster) image = normalizeUrl(mPoster[1]);
    }

    return {
      id: cleanId,
      title: title,
      image: image,
      description: description,
      genres: genres,
      status: status,
    };
  } catch (err) {
    return {
      id: id,
      title: id,
      image: null,
      description: "",
      genres: [],
      status: "Unknown",
    };
  }
}

async function fetchEpisode(id, page = 1) {
  try {
    const client = getHttpClient();
    if (!client) throw new Error("HTTP client unavailable");

    const cleanId = String(id || "")
      .trim()
      .replace(/^\/hentai\//, "")
      .replace(/\/$/, "");

    const searchRes = await client.get(
      `${baseUrl}/api/search?q=${encodeURIComponent(cleanId.replace(/-/g, " "))}&limit=20`,
      {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        timeout: 10000,
      },
    );

    const videos = Array.isArray(searchRes.data?.videos)
      ? searchRes.data.videos
      : [];
    const matchingVideos = videos.filter(
      (v) =>
        (v.titleSlug && v.titleSlug === cleanId) ||
        (v.slug && v.slug.startsWith(cleanId)),
    );

    let episodes = [];
    if (matchingVideos.length > 0) {
      matchingVideos.sort((a, b) => (a.ep || 0) - (b.ep || 0));
      episodes = matchingVideos.map((v) => ({
        id: v.slug || v.id,
        number: typeof v.ep === "number" ? v.ep : parseFloat(v.ep) || 1,
        title: v.ep ? `Episode ${v.ep}` : v.title,
        duration: v.duration || "Unknown",
        embedUrl: v.embedUrl || null,
      }));
    } else {
      episodes = [
        {
          id: cleanId,
          number: 1,
          title: "Episode 1",
          duration: "Unknown",
        },
      ];
    }

    return {
      episodes,
      totalPages: 1,
      total: episodes.length,
      currentPage: 1,
    };
  } catch (err) {
    return { episodes: [], totalPages: 0, total: 0, currentPage: page };
  }
}

async function fetchEpisodeSources(episodeId, category = null) {
  try {
    const client = getHttpClient();
    if (!client) throw new Error("HTTP client unavailable");

    const cleanEp = String(episodeId || "")
      .trim()
      .replace(/^\/hentai\//, "")
      .replace(/\/$/, "");

    let embedUrl = null;
    const res = await client.get(`${baseUrl}/hentai/${cleanEp}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 12000,
    });

    const mIframe = res.data.match(
      /<iframe[^>]+src=\"(https:\/\/nhplayer\.com\/v\/[^\"]+)\"/,
    );
    if (mIframe) {
      embedUrl = mIframe[1];
    } else {
      const mEmbed = res.data.match(
        /\"embedUrl\":\s*\"(https:\/\/nhplayer\.com\/v\/[^\"]+)\"/,
      );
      if (mEmbed) embedUrl = mEmbed[1];
    }

    if (!embedUrl) {
      throw new Error(
        `Could not locate nhplayer embed URL for episode: ${cleanEp}`,
      );
    }

    const resolved = await resolveNhplayerStream(embedUrl);

    const subtitles = [];
    if (resolved.subtitle) {
      subtitles.push({
        url: resolved.subtitle,
        lang: "English",
      });
    }

    return {
      sources: [
        {
          name: "NHPlayer MP4",
          url: resolved.url,
          quality: "1080p",
          isM3U8: false,
          headers: {
            Referer: "https://nhplayer.com/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          isUnresolved: false,
        },
      ],
      subtitles: subtitles,
    };
  } catch (err) {
    console.error("fetchEpisodeSources error:", err.message);
    return { sources: [], subtitles: [] };
  }
}

module.exports = {
  name: "hentaitv",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["hentai.tv"],
      headers: { Referer: "https://hentai.tv/" },
    },
    {
      match: ["nhplayer.com"],
      headers: { Referer: "https://nhplayer.com/" },
    },
    {
      match: ["r2.1hanime.com", "1hanime.com"],
      headers: { Referer: "https://nhplayer.com/" },
    },
  ],
  subrequestHeaders: [
    {
      match: ["nhplayer.com", "1hanime.com"],
      headers: { Referer: "https://nhplayer.com/" },
    },
  ],
  bypassDomains: ["hentai.tv", "nhplayer.com", "1hanime.com"],
  cookieDomains: ["hentai.tv", "nhplayer.com"],
  SearchAnime,
  AnimeInfo,
  fetchEpisode,
  fetchEpisodeSources,
  fetchRecentEpisodes,
};
