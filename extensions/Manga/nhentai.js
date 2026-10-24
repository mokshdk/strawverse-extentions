/**
 * StrawVerse Extension - NHentai Manga Scraper
 *
 * DISCLAIMER: This extension is intended for research, educational,
 * and developer testing purposes only. It functions as a client-side parser
 * of publicly available web pages and APIs.
 */
const cheerio = require("cheerio");

const baseUrl = "https://nhentai.net";
const thumbCdn = "https://t.nhentai.net/galleries";
const imgCdn = "https://i.nhentai.net/galleries";

function extFromType(t) {
  if (t === "p") return "png";
  if (t === "w") return "webp";
  return "jpg";
}

function pickTitle(titleObj) {
  if (!titleObj) return "Unknown";
  return titleObj.english || titleObj.pretty || titleObj.japanese || "Unknown";
}

function tagsOfType(tags, type) {
  return (tags || []).filter((t) => t.type === type).map((t) => t.name);
}

function extractGalleryJson(html) {
  const m = html.match(/JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
  if (m) {
    try {
      return JSON.parse(JSON.parse(m[1]));
    } catch (_) {}
  }
  return null;
}

function parseListingCards(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("div.gallery").each((_, el) => {
    const href = $(el).find("a").first().attr("href") || "";
    const idMatch = href.match(/\/g\/(\d+)\//);
    if (!idMatch) return;

    const id = idMatch[1];
    const imgEl = $(el).find("img").first();
    const image = imgEl.attr("data-src") || imgEl.attr("src") || null;
    const title =
      $(el).find("div.caption").text().trim() || imgEl.attr("alt") || "Unknown";

    if (id && !results.some((r) => r.id === `nh-${id}`)) {
      results.push({ id: `nh-${id}`, title, image });
    }
  });

  return results;
}

function parseTotalPages($) {
  const lastHref = $("a.last").attr("href") || "";
  const m = lastHref.match(/page=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function latestManga(page = 1) {
  try {
    const { data } = await global.axios.get(`${baseUrl}/?page=${page}`);
    const $ = cheerio.load(data);
    const results = parseListingCards(data);
    const totalPages = parseTotalPages($);
    return {
      current_page: page,
      hasNextPage: totalPages ? page < totalPages : results.length > 0,
      results,
    };
  } catch (err) {
    throw err;
  }
}

async function searchManga(query, page = 1) {
  try {
    if (!query) return latestManga(page);
    const { data } = await global.axios.get(
      `${baseUrl}/search/?q=${encodeURIComponent(query)}&page=${page}`,
    );
    const $ = cheerio.load(data);
    const results = parseListingCards(data);
    const totalPages = parseTotalPages($);
    return {
      current_page: page,
      hasNextPage: totalPages ? page < totalPages : results.length > 0,
      results,
    };
  } catch (err) {
    throw err;
  }
}

async function fetchMangaInfo(mangaId) {
  try {
    const realId = mangaId.replace("nh-", "");
    const { data: html } = await global.axios.get(`${baseUrl}/g/${realId}/`);
    const $ = cheerio.load(html);
    const g = extractGalleryJson(html);

    if (g) {
      const genres = tagsOfType(g.tags, "tag");
      const artists = tagsOfType(g.tags, "artist");
      const parodies = tagsOfType(g.tags, "parody");
      const languages = tagsOfType(g.tags, "language");
      const categories = tagsOfType(g.tags, "category");

      const descParts = [
        parodies.length ? `Parody: ${parodies.join(", ")}` : null,
        languages.length ? `Language: ${languages.join(", ")}` : null,
        categories.length ? `Category: ${categories.join(", ")}` : null,
      ].filter(Boolean);

      return {
        id: mangaId,
        title: pickTitle(g.title),
        image: `${thumbCdn}/${g.media_id}/cover.${extFromType(g.images?.cover?.t)}`,
        description: descParts.join(" | ") || "",
        genres,
        author: artists.join(", ") || "",
        type: categories[0] || "Doujinshi",
        released: g.upload_date
          ? String(new Date(g.upload_date * 1000).getFullYear())
          : "",
        status: "Completed",
      };
    }

    const title =
      $("h1.title span.pretty, h1.title, h2.title").first().text().trim() ||
      "Unknown";
    const image =
      $("#cover img").attr("src") ||
      $("img[src*='t.nhentai.net']").first().attr("src") ||
      null;
    const genres = [];
    $("a[href*='/tag/'] .name").each((_, el) => {
      const name = $(el).text().trim();
      if (name) genres.push(name);
    });

    return {
      id: mangaId,
      title,
      image,
      description: "",
      genres,
      author: $("a[href*='/artist/'] .name").first().text().trim() || "",
      type: "Doujinshi",
      released: "",
      status: "Completed",
    };
  } catch (err) {
    throw err;
  }
}

async function fetchChapters(mangaId) {
  const realId = mangaId.replace("nh-", "");
  return {
    TotalPages: 1,
    total: 1,
    Chapters: [{ id: `nhch-${realId}`, number: 1, title: "Read" }],
  };
}

async function fetchChapterPages(chapterId) {
  try {
    const realId = chapterId.replace("nhch-", "");
    const { data: html } = await global.axios.get(`${baseUrl}/g/${realId}/`);
    const $ = cheerio.load(html);

    const firstImgSrc =
      $("#image-1").attr("src") ||
      $("#image-container img").first().attr("src") ||
      "";
    const mediaMatch = firstImgSrc.match(
      /galleries\/(\d+)\/\d+\.(jpg|png|webp)/,
    );

    if (mediaMatch) {
      const mediaId = mediaMatch[1];

      const pages = [];
      $(".thumbs a img, #thumbnail-container a img").each((_, img) => {
        const src = $(img).attr("src") || "";
        if (!src.includes("nhentai.net")) return;
        const full = src
          .replace("t.nhentai.net", "i.nhentai.net")
          .replace(/(\d+)t\.(jpg|png|webp)(\?.*)?$/, "$1.$2");
        if (full) pages.push({ page: pages.length + 1, img: full });
      });

      if (pages.length > 0) return pages;

      const totalPages =
        parseInt($("select.page-select option:last-child").val() || "0", 10) ||
        parseInt($("select option").last().val() || "0", 10) ||
        0;
      const ext = mediaMatch[2];
      if (totalPages > 0) {
        return Array.from({ length: totalPages }, (_, idx) => ({
          page: idx + 1,
          img: `${imgCdn}/${mediaId}/${idx + 1}.${ext}`,
        }));
      }
    }

    const { data: galleryHtml } = await global.axios.get(
      `${baseUrl}/g/${realId}/`,
    );
    const g = extractGalleryJson(galleryHtml);
    if (g?.media_id && g.images?.pages?.length > 0) {
      return g.images.pages.map((p, idx) => ({
        page: idx + 1,
        img: `${imgCdn}/${g.media_id}/${idx + 1}.${extFromType(p.t)}`,
      }));
    }

    return [];
  } catch (err) {
    return [];
  }
}

module.exports = {
  name: "nhentai",
  version: "1.0.0",
  baseUrl,
  headerRules: [
    {
      match: ["nhentai.net", "i.nhentai.net", "t.nhentai.net"],
      headers: {
        Referer: "https://nhentai.net/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    },
  ],
  subrequestHeaders: [
    {
      match: ["i.nhentai.net", "t.nhentai.net"],
      headers: {
        Referer: "https://nhentai.net/",
        Origin: "https://nhentai.net",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
    },
  ],
  domainAliases: {
    "i.nhentai.net": "nhentai.net",
    "t.nhentai.net": "nhentai.net",
  },
  bypassDomains: ["nhentai.net"],
  cookieDomains: ["nhentai.net", "t.nhentai.net", "i.nhentai.net"],
  latestManga,
  searchManga,
  fetchMangaInfo,
  fetchChapters,
  fetchChapterPages,
};
