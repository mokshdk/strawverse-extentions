/**
 * StrawVerse Extension - Hiperdex Manga Scraper
 *
 * DISCLAIMER: This extension is intended for research, educational,
 * and developer testing purposes only. It functions as a client-side parser
 * of publicly available web pages and APIs.
 */
const baseUrl = "https://hiperdex.tv";
const AUTH_KEY = "yceqt7qgu004";

let cachedCookie = "";

function getHttpClient() {
  if (global.axios) {
    return global.axios;
  }
  try {
    return require("axios");
  } catch (_) {
    return null;
  }
}

async function ensureCookie() {
  if (cachedCookie) return cachedCookie;
  const client = getHttpClient();
  if (!client) return "";

  try {
    const res = await client.get(`${baseUrl}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      timeout: 10000,
    });
    const setCookie = res?.headers?.["set-cookie"] || [];
    if (Array.isArray(setCookie) && setCookie.length > 0) {
      cachedCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
  } catch (err) {
    if (err.response?.headers?.["set-cookie"]) {
      const setCookie = err.response.headers["set-cookie"];
      cachedCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
  }
  return cachedCookie;
}

async function queryTrpc(procedure, input) {
  const client = getHttpClient();
  if (!client) throw new Error("HTTP client unavailable");

  const cookie = await ensureCookie();
  const inputParam = encodeURIComponent(JSON.stringify({ 0: { json: input } }));
  const url = `${baseUrl}/api/trpc/${procedure}?batch=1&input=${inputParam}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "x-cfg-auth": AUTH_KEY,
    Referer: `${baseUrl}/`,
    Origin: `${baseUrl}`,
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  const res = await client.get(url, { headers, timeout: 15000 });
  const rawData = res.data;
  if (Array.isArray(rawData) && rawData[0]?.result?.data?.json !== undefined) {
    return rawData[0].result.data.json;
  }
  if (rawData?.result?.data?.json !== undefined) {
    return rawData.result.data.json;
  }
  throw new Error("Unexpected tRPC response structure from Hiperdex");
}

async function latestManga(page = 1) {
  try {
    const data = await queryTrpc("recommendations.latestChapters", {
      limit: 20,
      page: page,
    });

    const items = Array.isArray(data) ? data : [];
    const results = items
      .filter((item) => item?.seriesSlug && item?.seriesTitle)
      .map((item) => ({
        id: item.seriesSlug,
        title: item.seriesTitle,
        image: item.seriesCoverUrl || null,
      }));

    return {
      current_page: page,
      hasNextPage: results.length >= 20,
      results: results,
    };
  } catch (err) {
    // Fallback: search query with empty string
    try {
      const offset = (page - 1) * 20;
      const searchData = await queryTrpc("search.query", {
        q: "",
        limit: 20,
        offset: offset,
      });
      const hits = Array.isArray(searchData?.hits) ? searchData.hits : [];
      const results = hits.map((hit) => ({
        id: hit.slug,
        title: hit.title,
        image: hit.coverUrl || null,
      }));
      return {
        current_page: page,
        hasNextPage: results.length >= 20,
        results: results,
      };
    } catch (_) {
      return {
        current_page: page,
        hasNextPage: false,
        results: [],
      };
    }
  }
}

async function searchManga(query, page = 1) {
  try {
    const qTrim = (query || "").trim();
    if (!qTrim) {
      return await latestManga(page);
    }

    const offset = (page - 1) * 20;
    const data = await queryTrpc("search.query", {
      q: qTrim,
      limit: 20,
      offset: offset,
    });

    const hits = Array.isArray(data?.hits) ? data.hits : [];
    const results = hits.map((hit) => ({
      id: hit.slug,
      title: hit.title,
      image: hit.coverUrl || null,
    }));

    const totalHits = data?.totalHits || results.length;
    return {
      current_page: page,
      hasNextPage: offset + results.length < totalHits,
      results: results,
    };
  } catch (err) {
    return {
      current_page: page,
      hasNextPage: false,
      results: [],
    };
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const slug = String(mangaId || "").trim();
    const series = await queryTrpc("series.bySlugWithGenres", { slug });

    if (!series || !series.title) {
      throw new Error(`Series not found for slug: ${slug}`);
    }

    const authorList = Array.isArray(series.authors)
      ? series.authors.join(", ")
      : series.authors || "";
    const artistList = Array.isArray(series.artists)
      ? series.artists.join(", ")
      : series.artists || "";
    const combinedAuthors = [authorList, artistList]
      .filter(Boolean)
      .join(" / ");

    return {
      id: series.slug || slug,
      title: series.title,
      image: series.coverUrl || null,
      description: series.synopsis || "",
      genres: Array.isArray(series.genres) ? series.genres : [],
      author: combinedAuthors || authorList || "",
      type: series.type || "Manhwa",
      released: series.year ? String(series.year) : "",
      status: series.status || "Ongoing",
    };
  } catch (err) {
    throw err;
  }
}

async function fetchChapters(mangaId) {
  try {
    const slug = String(mangaId || "").trim();
    const series = await queryTrpc("series.bySlugWithGenres", { slug });
    if (!series || !series.id) {
      return { TotalPages: 1, total: 0, Chapters: [] };
    }

    const rawChapters = await queryTrpc("series.chapters", {
      seriesId: series.id,
    });

    const chapterList = Array.isArray(rawChapters) ? rawChapters : [];

    const chapters = chapterList.map((ch) => {
      const num =
        typeof ch.number === "number" ? ch.number : parseFloat(ch.number) || 0;
      return {
        id: `${slug}:${num}:${ch.id}`,
        number: num,
        title: ch.title ? `Chapter ${num} - ${ch.title}` : `Chapter ${num}`,
      };
    });

    return {
      TotalPages: 1,
      total: chapters.length,
      Chapters: chapters,
    };
  } catch (err) {
    return { TotalPages: 1, total: 0, Chapters: [] };
  }
}

async function fetchChapterPages(chapterId) {
  try {
    let seriesSlug = "";
    let chapterNumber = 1;
    let chId = 0;

    if (chapterId && chapterId.includes(":")) {
      const parts = chapterId.split(":");
      seriesSlug = parts[0];
      chapterNumber = parseFloat(parts[1]) || 1;
      chId = parseInt(parts[2], 10) || 0;
    } else {
      seriesSlug = String(chapterId || "").trim();
    }

    const pagesData = await queryTrpc("reader.chapterPages", {
      seriesSlug: seriesSlug,
      chapterNumber: chapterNumber,
      chapterId: chId,
    });

    const items = Array.isArray(pagesData) ? pagesData : [];

    const pages = items
      .map((p, idx) => ({
        page: p.pageOrder || idx + 1,
        img: p.webpUrl || p.avifUrl || p.url || null,
      }))
      .filter((p) => p.img);

    return pages;
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "hiperdex",
  version: "1.0.1",
  baseUrl,
  headerRules: [
    {
      match: ["hiperdex.tv", "hiperdex.com"],
      headers: { Referer: "https://hiperdex.tv/" },
    },
    {
      match: [
        "r2d2storage.com",
        "cloud-7.r2d2storage.com",
        "i1.r2d2storage.com",
      ],
      headers: { Referer: "https://hiperdex.tv/" },
    },
  ],
  subrequestHeaders: [
    {
      match: ["r2d2storage.com"],
      headers: { Referer: "https://hiperdex.tv/" },
    },
  ],
  bypassDomains: ["hiperdex.tv", "hiperdex.com", "r2d2storage.com"],
  cookieDomains: ["hiperdex.tv", "hiperdex.com"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
