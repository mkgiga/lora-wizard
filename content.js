/**
 * content script, for getting the booru tags from the image we copy and returning them to the sidepanel script.
 */

// listen for messages from the sidepanel script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received: ", message);

  if (message.message === "getTags") {
    const tags = getTags(
      {
      options: message.options || {
        rules: {
          // ignored tags (array of strings, automatically lowercased)
          blacklist: [],

          // tag categories to include
          include: {
            character: true,
            species: true,
            meta: false,
            artist: true,
            general: true,
            species: true,
          },

          // the minimum score a tag must have to be included
          minimumScore: 0,

          // the maximum number of tags to return (per category)
          limit: null,

          // the order in which the tags should be displayed if present
          formattingOrder: [
            "1boy",
            "1girl",
            "{copyright}",
            "{character}",
            "{species}",
            "{meta}",
            "{artist}",
            "{general}",
            "{species}",
          ],

          // allows to select a specific tag over another
          redundancyFilter: [["1girl, solo, 1girls"], ["1boy, solo, 1boys"]],

          /**
           * Different imageboards have different tag names for the same thing.
           * This dictionary allows you to specify several tags that should be translated to a single tag.
           */
          translationDictionary: {
            "big dom small sub": ["muscular uke"],
          },
        },
      },
      imageSrc: message.imageSrc,
    },
    );
    console.log("Tags fetched: ", tags);
    sendResponse(tags);
    console.log("Tags sent to sidepanel script");
  }
});

console.log("Content script loaded");

/**
 * @typedef {Object} TagScrapingResult
 * @property {Object} tags
 * @property {string[]} tags.character
 * @property {string[]} tags.species
 * @property {string[]} tags.meta
 * @property {string[]} tags.artist
 * @property {string[]} tags.general
 * @property {string[]} tags.species
 * @property {string[]} tags.copyright
 * @property {TagScrapingOptions} options
 * @property {string[]} imageSrc - the URL of the image being scraped
 */

/**
 * @typedef {Object} TagScrapingOptions
 * @property {Object} rules
 * @property {string[]} rules.blacklist
 * @property {Object} rules.include
 * @property {boolean} rules.include.character
 * @property {boolean} rules.include.species
 * @property {boolean} rules.include.meta
 * @property {boolean} rules.include.artist
 * @property {boolean} rules.include.general
 * @property {["{character}", "{species}", "{meta}", "{artist}", "{general}", "{species}"]} rules.formattingOrder
 * The order in which the tags should be displayed. The user may generalize tags that belong to a category by surrounding them with curly braces,
 * but they can also add specific tags anywhere in the list should they appear in the post.
 *
 * @property {number | null} [limit=null]
 */

/**
 * @param {TagScrapingOptions} options
 * @returns {TagScrapingResult}
 */
function getTags({
  /**
   * @typedef {typeof options} TagScraperOptions
   */
  options = {
    rules: {
      blacklist: [],
      include: {
        character: true,
        species: true,
        meta: true,
        artist: true,
        general: true,
        copyright: true,
      },
      /** @todo */
      minimumScore: 0,
      /** @todo */
      minimumCount: 0,
    },
    limit: null,
  },
  imageSrc,
}) {
  // where are we?
  const url = window.location.href;

  options.rules.blacklist = options.rules.blacklist.map((tag) =>
    tag.toLowerCase().trim()
  );

  if (url.match(/danbooru\.donmai\.us\/posts\/\d+/)) {
    return danbooru({ options, imageSrc, pageUrl: url });
  } else if (url.includes("e621")) {
    return danbooru({ options, imageSrc, pageUrl: url });
  }

  return {};
}

/**
 * The most popular image board by far
 * @param {TagScrapingOptions} options
 * @returns {TagScrapingResult}
 */
function danbooru({ options, imageSrc, pageUrl }) {
  const tags = {
    character: [],
    species: [],
    meta: [],
    artist: [],
    general: [],
    species: [],
    copyright: [],
  };

  const tagLists = {
    character: document.querySelectorAll("ul.character-tag-list a.search-tag"),
    meta: document.querySelectorAll("ul.meta-tag-list a.search-tag"),
    artist: document.querySelectorAll("ul.artist-tag-list a.search-tag"),
    general: document.querySelectorAll("ul.general-tag-list a.search-tag"),
    copyright: document.querySelectorAll("ul.copyright-tag-list a.search-tag"),
  };

  for (const category of [
    "character",
    "meta",
    "artist",
    "general",
    "copyright",
    "species",
  ]) {
    // danbooru doesn't have a species category
    if (!tagLists[category]) {
      continue;
    }

    for (const tag of tagLists[category]) {
      // limit is optional, but null by default
      if (typeof limit === "number" && tags[category].length >= options.limit) {
        break;
      }

      // <preferenial filtering>

      if (!options.rules.include[category]) {
        continue;
      }

      if (!options.rules.blacklist.includes(tag)) {
        tags[category].push(tag.textContent);
      }

      // </preferential filtering>
    }
  }

  // todo: unthumbnail
  // imageSrc = unthumbnail(imageSrc);
  
  return { tags, options, imageSrc, pageUrl };
}

/**
 * Furry image board
 * @param {TagScrapingOptions} options
 * @returns {TagScrapingResult}
 */
function e621({ options, imageSrc, pageUrl }) {
  const tags = {
    character: [],
    species: [],
    meta: [],
    artist: [],
    general: [],
    species: [],
    copyright: [],
  };

  return { tags, options, imageSrc, pageUrl };
}
function isThumbnail(imageSrc) {
  if (imageSrc.includes("danbooru") && imageSrc.includes("sample-") && imageSrc.endsWith(".jpg")) {
    return true;
  }

  return false;
}
function unthumbnail(imageSrc) {
  if (isThumbnail(imageSrc)) {
    if (imageSrc.includes("danbooru")) {
      return imageSrc.replace("sample-", "").replace(".jpg", ".png");
    }
  }

  return imageSrc;
}