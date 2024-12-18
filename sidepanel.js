import { html } from "./lib/html.js";

const windowEventListeners = {
  imagesEntry: {
    click: [],
  },
};

let settings = {
  "Adding images": [
    {
      id: "warnOnSmallImages",
      type: "checkbox",
      name: "Warn on small images",
      description:
        "Warn when an image is smaller than the preferred dimensions",
      value: true,
    },
    {
      id: "preferredMinImageWidth",
      type: "number",
      name: "Preferred minimum image width",
      description: "The preferred minimum width for images",
      value: 768,
    },
    {
      id: "preferredMinImageHeight",
      type: "number",
      name: "Preferred minimum image height",
      description: "The preferred minimum height for images",
      value: 768,
    },
  ],
  Tagging: [],
  Categories: [],
  Keybindings: [],
  Appearance: [],
  Saving: [],
};

let backups = {};

function main() {
  /**
   * Horizontal, wrapping flex container for image entries
   * @type {HTMLDivElement}
   */
  const entryList = document.querySelector("#image-entries");

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "addImage") {
      addImageEntries(entryList, false, { src: info.srcUrl, pageUrl: tab.url });
    }

    if (info.menuItemId === "addBooruImage") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        const imageSrc = info.srcUrl;
        console.log("Active tab for message:", activeTab);

        chrome.tabs.sendMessage(
          activeTab.id,
          { message: "getTags", imageSrc },
          (response) => {
            console.log("Response from content script:", response);
            onImportedTags(response);
          }
        );
      });
    }
  });

  document
    .querySelector("#btn-restore-all-recycled")
    .addEventListener("click", () => {
      const entries = document.querySelectorAll(
        "#recycle-bin-entries .image-entry"
      );

      entries.forEach((entry) => {
        console.log("Restoring entry: ", entry);
        const cloned = entry.cloneNode(true);
        entry.remove();

        const src = cloned.querySelector("img").src;
        const tags = cloned.querySelector("textarea").value.split(", ");

        const newEntry = createImageEntry({
          src,
          tags,
          target: entryList,
          calledByLoad: true,
        });

        entryList.appendChild(newEntry);
      });

      save();
    });

  document
    .querySelector("#btn-clear-recycle-bin")
    .addEventListener("click", () => {
      console.log("Clearing recycle bin...");
      const entries = document.querySelectorAll(
        "#recycle-bin-entries .image-entry"
      );

      entries.forEach((entry) => {
        console.log("Removing entry: ", entry);
        entry.remove();
      });

      save();
    });

  document.querySelector(".handle-button").addEventListener("click", () => {
    document.querySelector("#recycle-bin").toggleAttribute("active");
  });

  document.querySelector(".btn-save").addEventListener("click", save);

  // project import
  document
    .querySelector(".btn-load")
    .addEventListener("click", promptImportFiles);

  // project export
  document.querySelector(".btn-export").addEventListener("click", () => {
    download("exported");
  });

  // searching the main entry list
  document.querySelector("#txt-search").addEventListener("input", onSearch);

  document
    .querySelector("#btn-backup-current")
    .addEventListener("click", () => {
      const date = new Date().toLocaleString();

      const allEntries = document.querySelectorAll(
        "#image-entries .image-entry"
      ); // get all entries from the main list

      const images = [];
      const allCategories = document.querySelectorAll(".tag-category");
      const categories = [];
      const backup = {};

      allEntries.forEach((entry) => {
        const img = entry.querySelector("img").src;
        const tags = entry
          .querySelector("textarea")
          .value.split(", ")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "");
        const pageUrl = entry
          .querySelector("[page-url]")
          .getAttribute("page-url");

        images.push({ src: img, tags, pageUrl });
      });

      allCategories.forEach((category) => {
        const name = category.querySelector(".tag-category-name").textContent;
        const tags = category
          .querySelectorAll(".visual-tag-wrapper .visual-tag")
          .entries()
          .map(([i, tag]) => tag.textContent.trim())
          .filter((tag) => tag !== "");
        const emoji = category.querySelector(".emoji-icon").textContent;

        categories.push({ name, tags, emoji });
      });

      backup.images = images;
      backup.categories = categories;

      backups[date] = backup;

      const select = document.querySelector("#sel-backups");
      const option = document.createElement("option");

      option.value = date;
      option.textContent = date;
      option.selected = true;

      // associate the backup object with the option element
      option.backup = backup;

      select.appendChild(option);

      // set the <select> to focus on the new option
      select.value = date;

      save();
    });

  document
    .querySelector("#btn-restore-backup")
    .addEventListener("click", () => {
      const select = document.querySelector("#sel-backups");
      const date = select.value;
      const backup = backups[date];

      if (!backup) {
        return;
      }

      promptDialog({
        title: "Restore backup",
        message:
          "Are you sure you want to restore this backup? This will overwrite the current project.",
        options: [
          {
            text: "Yes",
            onclick: (e) => {
              const entries = document.querySelectorAll(
                "#image-entries .image-entry"
              );
              const categories = document.querySelectorAll(".tag-category");

              entries.forEach((entry) => entry.remove());
              categories.forEach((category) => category.remove());

              addImageEntries(
                document.querySelector("#image-entries"),
                true,
                ...backup.images
              );

              backup.categories.forEach((category) => {
                const tagCategory = createTagCategory(category);
                document
                  .querySelector(".tag-categories")
                  .appendChild(tagCategory);
              });

              save();
            },
          },

          {
            text: "No",
            onclick: (e) => {
              prompt.remove();
            },
          },
        ],
      });
    });

  document.querySelector("#btn-delete-backup").addEventListener("click", () => {
    const select = document.querySelector("#sel-backups");
    const date = select.value;

    if (backups[date]) {
      promptDialog({
        title: "Delete backup",
        message: "Are you sure you want to delete this backup?",
        options: [
          {
            text: "Yes",
            onclick: (e) => {
              delete backups[date];
              const opt = select.querySelector(`option[value="${date}"]`);
              murderElement(opt);
              save();
            },
          },
          {
            text: "No",
            onclick: (e) => {
              prompt.remove();
            },
          },
        ],
      });
    }
  });

  window.addEventListener("keydown", (e) => {
    // check if an element is edited
    const activeElement = document.activeElement;
    const isEditable = activeElement.isContentEditable;

    if (
      isEditable ||
      activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA"
    ) {
      return;
    }

    e.preventDefault();

    if (e.key === "s") {
      entryBackdropBlur(false);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "s") {
      entryBackdropBlur(true);
    }
  });

  window.addEventListener("blur", (e) => {
    entryBackdropBlur(true);
  });

  window.addEventListener("click", (e) => {
    if (e.ctrlKey) {
      const target = e.target;

      if (target.hasAttribute("[selectable]")) {
        const selectedContainers = getSelectedContainers();

        if (selectedContainers) {
          selectedContainers.removeAttribute("selected");
        }

        target.setAttribute("selected", "");
      }
    }
  });

  ///////////////////// BOTTOM BAR TABS  //////////////////////

  const tabs = document.querySelectorAll(".tab[for]");

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const tabs = document.querySelectorAll(".tab[for]");
      const targetId = tab.getAttribute("for");
      const targetElement = document.getElementById(targetId);

      for (const tab of tabs) {
        tab.removeAttribute("active");
        document
          .getElementById(tab.getAttribute("for"))
          ?.removeAttribute("active");
      }

      if (targetElement) {
        tab.setAttribute("active", "");
        targetElement.setAttribute("active", "");
      }
    });
  }

  const collapseButtons = document.querySelectorAll(".collapse-button");

  let updateCollapseButtonText = (button, container) => {
    if (container.hasAttribute("collapsed")) {
      button.textContent = "expand_more";
    } else {
      button.textContent = "expand_less";
    }
  };

  for (const button of collapseButtons) {
    const container = button.parentElement.parentElement;

    button.addEventListener("click", () => {
      if (container.hasAttribute("collapsed")) {
        container.removeAttribute("collapsed");
      } else {
        container.setAttribute("collapsed", "");
      }

      updateCollapseButtonText(button, container);
    });
  }

  const tagCategoriesContainer = document.querySelector(".tag-categories");
  const btnAddTagCategory = document.querySelector("#btn-add-category");

  btnAddTagCategory.addEventListener("click", () => {
    const tagCategory = createTagCategory({ name: "New Category", tags: [] });
    tagCategoriesContainer.appendChild(tagCategory);
  });

  function entryBackdropBlur(state = true) {
    const entries = document.querySelectorAll(".visual-tags");

    if (state) {
      entries.forEach((entry) => entry.removeAttribute("hidden"));
    } else {
      entries.forEach((entry) => entry.setAttribute("hidden", ""));
    }
  }

  const btnRunQuery = document.querySelector("#btn-run-query");
  const btnClearQuery = document.querySelector("#btn-clear-query");

  btnRunQuery.addEventListener("click", runQuery);
  btnClearQuery.addEventListener("click", clearQuery);

  initCommandPalette();

  load();

  const loop = setInterval(() => {
    syncImageAttributes();
    syncTagColors();
  }, 1000 / 60);

  // brute force update because i cba to do it properly
  const updateStatsFirstTime = () => {
    setTimeout(() => {
      updateStats();

      const projectStatsTags = document.querySelector("#project-stats-tags");
      const projectStatsEntries = document.querySelector(
        "#project-stats-entries"
      );
      const projectStatsImgAvg = document.querySelector(
        "#project-stats-tags-per-image"
      );

      if (
        projectStatsTags.textContent === "NaN" ||
        projectStatsEntries.textContent === "NaN" ||
        projectStatsImgAvg.textContent === "NaN"
      ) {
        updateStatsFirstTime();
      } else {
        console.log("Project stat counters initialized");
      }
    }, 10); // wait for the images to load
  };

  updateStatsFirstTime();
}

///////////////////// COMMAND QUERIES //////////////////////

function initCommandPalette() {
  const commandPalette = document.querySelector("#command-palette");
  const paletteCommands = commandPalette.querySelectorAll(".query-command");

  for (const qc of paletteCommands) {
    qc.addEventListener("click", () => {
      if (!qc.hasAttribute("disabled")) {
        const cloned = initQueryCommand(qc);
        const container = document.getElementById("query");

        if (cloned) {
          container.appendChild(cloned);
        } else {
          throw new Error("Invalid command");
        }
      }
    });
  }
}

function onSearch(e) {
  const text = e.target.value;

  const entries = document.querySelectorAll(".image-entry");
  let tags = text.split(", ").map((tag) => tag.trim());

  console.log(tags);

  tags = tags.filter((tag) => tag !== "");

  if (tags.length === 0) {
    entries.forEach((entry) => entry.removeAttribute("hidden"));
    return;
  } else {
    entries.forEach((entry) => entry.setAttribute("hidden", ""));
  }

  // first, hide all entries
  for (const entry of entries) {
    entry.setAttribute("hidden", "");
  }

  const or = ["||", " OR "];
  const and = ["&&", " AND "];

  for (const entry of entries) {
    const textarea = entry.querySelector("textarea");
    const entryTags = textarea.value.split(",").map((tag) => tag.trim());

    let show = false;

    for (const tag of tags) {
      if (tag.startsWith(or) || tag.startsWith(and)) {
        const operator = tag.startsWith(or) ? or : and;
        const tagList = tag.split(operator);

        if (operator === or) {
          show = tagList.some((t) => entryTags.includes(t));
        } else {
          show = tagList.every((t) => entryTags.includes(t));
        }
      } else {
        // if the tag contains the substring (even partially), show the entry
        show = entryTags.some((entryTag) =>
          entryTag.toLocaleLowerCase().includes(tag.toLowerCase())
        );
      }

      if (show) {
        entry.removeAttribute("hidden");
        break;
      }
    }

    if (!show) {
      entry.setAttribute("hidden", "");
    }

    if (tags.length === 0) {
      entry.setAttribute("hidden", "");
      entry.removeAttribute("hidden");
    }
  }
}

function getSelectedEntries() {
  return document.querySelectorAll("#image-entries .image-entry[selected]");
}

function initQueryCommand(element) {
  const id = element.id;

  // 1. Clone the element from the palette list
  const cloned = element.cloneNode(true);
  const topBar = cloned.querySelector(".query-component-top-bar");
  const wrappableTextInputs = cloned.querySelectorAll(".wrappable-text-input"); // span that wraps to the next line when it reaches the end of the container

  // make sure it has a run function even if it's empty
  cloned.run = () => {};

  // 2. Add close button since it should be removable outside of the palette
  if (!topBar.querySelector("button.btn-remove-command")) {
    const removeButton = html`
      <button class="btn-remove-command material-icons">close</button>
    `;

    removeButton.style.marginRight = "4rem";
    removeButton.style.marginLeft = "auto";

    removeButton.addEventListener("click", () => {
      cloned.remove();
    });

    topBar.appendChild(removeButton);
  }

  // 3. Initialize the command based on its id
  const commands = {
    // Selection operations

    "cmd-select-entries": () => {
      const withTagsInput = cloned.querySelector(
        "#txt-select-entries-containing-tags"
      );
      const withoutTagsInput = cloned.querySelector(
        "#txt-select-entries-not-containing-tags"
      );

      const withTags = withTagsInput.textContent
        .split(",")
        .map((tag) => tag.trim());
      const withoutTags = withoutTagsInput.textContent
        .split(",")
        .map((tag) => tag.trim());
      const allEntries = document.querySelectorAll(
        "#image-entries .image-entry"
      );

      // remove selected attribute from all entries
      document
        .querySelectorAll("#image-entries .image-entry[selected]")
        .forEach((entry) => entry.removeAttribute("selected"));

      for (const entry of allEntries) {
        let tags = entry
          .querySelector("textarea")
          .value.split(",")
          .map((tag) => tag.trim().toLowerCase().replace(/, $/, "").trim());

        // empty input = no tags to check for
        let hasTags = true;
        let doesNotHaveTags = true;

        if (withTags.length > 0) {
          hasTags = withTags.every((tag) => tags.includes(tag));
        }

        if (withoutTags.length > 0) {
          doesNotHaveTags = withoutTags.every((tag) => !tags.includes(tag));
        }

        if (hasTags && doesNotHaveTags) {
          entry.setAttribute("selected", "");
        }
      }
    },

    "cmd-deselect-entries": () => {
      const withTagsInput = cloned.querySelector(
        "#txt-deselect-entries-containing-tags"
      );
      const withoutTagsInput = cloned.querySelector(
        "#txt-deselect-entries-not-containing-tags"
      );

      const withTags = withTagsInput.textContent
        .split(",")
        .map((tag) => tag.trim());
      const withoutTags = withoutTagsInput.textContent
        .split(",")
        .map((tag) => tag.trim());
      const allEntries = document.querySelectorAll(
        "#image-entries .image-entry"
      );

      for (const entry of allEntries) {
        let tags = entry
          .querySelector("textarea")
          .value.split(",")
          .map((tag) => tag.trim().toLowerCase().replace(/, $/, "").trim());

        // empty input = no tags to check for
        let hasTags = true;
        let doesNotHaveTags = true;

        if (withTags.length > 0) {
          hasTags = withTags.every((tag) => tags.includes(tag));
        }

        if (withoutTags.length > 0) {
          doesNotHaveTags = withoutTags.every((tag) => !tags.includes(tag));
        }

        if (hasTags && doesNotHaveTags) {
          entry.removeAttribute("selected");
        }
      }
    },

    "cmd-add-entries": () => {},

    "cmd-remove-entries": () => {},

    // Tag operations

    "cmd-add-tags": () => {
      const selection = getSelectedEntries();
      const tagsInput = cloned.querySelector("#txt-add-tags"); // span that wraps (not text input)
      const selWhere = cloned.querySelector("#sel-add-tags-where");

      const selWhereValues = [
        "start",
        "end",
        "startRandomOrder",
        "endRandomOrder",
        "randomPositions",
      ];

      const chkPreserveFirst = cloned.querySelector(
        "#chk-add-tags-preserve-first-tag"
      );

      const selValue = selWhere.value;
      const tags = tagsInput.textContent.split(",").map((tag) => tag.trim());

      for (const entry of selection) {
        const textarea = entry.querySelector("textarea");
        const currentTags = textarea.value.split(",").map((tag) => tag.trim());

        switch (selValue) {
          case "start":
            textarea.value = tags.concat(currentTags).join(", ");
            break;
          case "end":
            textarea.value = currentTags.concat(tags).join(", ");
            break;
          case "startRandomOrder":
            textarea.value = tags
              .concat(currentTags)
              .sort(() => Math.random() - 0.5)
              .join(", ");
            break;
          case "endRandomOrder":
            textarea.value = currentTags
              .concat(tags)
              .sort(() => Math.random() - 0.5)
              .join(", ");
            break;
          case "randomPositions":
            const randomIndex = Math.floor(Math.random() * currentTags.length);
            currentTags.splice(randomIndex, 0, ...tags);
            textarea.value = currentTags.join(", ");
            break;
        }
      }
    },
    "cmd-remove-tags": () => {},
    "cmd-replace-tags": () => {},
    "cmd-shuffle-tags": () => {},
  };

  if (commands[id]) {
    cloned.run = commands[id];
  } else {
    throw new Error("Invalid command ID");
  }

  return cloned;
}

function getSelectedTagContainers() {
  return document.querySelector("[selectable][tag-container][selected]");
}

function runQuery(entries) {
  let container = document.querySelector("#query");
  let allEntries = Array.from(
    document.querySelectorAll("#image-entries .image-entry")
  );
  let selectedEntries = getSelectedEntries();

  const queries = container.children;

  for (const queryCommand of queries) {
    queryCommand.run();
  }
}

function clearQuery() {
  document.querySelector("#query").innerHTML = "";
}

const entrySelection = {
  get: () => {
    // return all if unspecified
    if (types.length === 0) {
      return document.querySelectorAll(".image-entry[selected]");
    }
  },
};

function addTagsToContainer(containerElement, ...tags) {
  if (!containerElement || !(containerElement instanceof HTMLElement)) {
    throw new Error("Invalid container element");
  }

  if (containerElement instanceof HTMLTextAreaElement) {
    for (const tag of tags) {
      containerElement.value += tag + ", ";
    }

    containerElement.value = containerElement.value.replace(/, $/, "");
  } else if (containerElement.classList.contains("visual-tags")) {
    for (const tag of tags) {
      const tagEl = createVisualTag({ text: tag });
      containerElement.appendChild(tagEl);
    }
  }

  save();
}

function createTagCategory({ name = "Category", tags = [], emoji = "" }) {
  const el = html`
    <div class="tag-category" name="${name}">
      <div class="tag-category-inner">
        <div class="tag-category-header">
          <h4 class="tag-category-name" contenteditable>${name}</h4>
          <div class="emoji-icon-wrapper">
            <button class="emoji-icon">${emoji}</button>
          </div>
        </div>
        <div class="visual-tags"></div>

        <div class="tag-category-order-actions">
          <button class="btn-category-up material-icons">arrow_upward</button>
          <button class="btn-category-down material-icons">
            arrow_downward
          </button>
        </div>

        <div class="tag-category-actions">
          <button class="btn-category-add-tag material-icons">add</button>
          <button class="btn-category-remove material-icons">delete</button>
          <button class="btn-category-clear-tags material-icons">
            clear_all
          </button>
        </div>
      </div>
    </div>
  `;

  el.querySelector(".btn-category-remove").addEventListener("click", () => {
    el.remove();
    save();
  });

  el.querySelector(".btn-category-clear-tags").addEventListener("click", () => {
    const tags = el.querySelectorAll(".visual-tag-wrapper");
    tags.forEach((tag) => tag.remove());
    save();
  });

  el.querySelector(".btn-category-add-tag").addEventListener("click", () => {
    const tag = createVisualTag({ text: "New Tag" });
    el.querySelector(".visual-tags").appendChild(tag);
    save();
  });

  const tagCategoriesContainer = document.querySelector(".tag-categories");

  el.querySelector(".btn-category-up").addEventListener("click", () => {
    const prev = el.previousElementSibling;
    if (prev) {
      tagCategoriesContainer.insertBefore(el, prev);
    }
    save();
  });

  el.querySelector(".btn-category-down").addEventListener("click", () => {
    const next = el.nextElementSibling;
    if (next) {
      tagCategoriesContainer.insertBefore(next, el);
    }
    save();
  });

  el.querySelector(".emoji-icon").addEventListener("click", () => {
    if (document.querySelector("emoji-picker")) {
      return;
    }

    const picker = html`<emoji-picker></emoji-picker>`;

    picker.addEventListener("emoji-click", (e) => {
      const emoji = e.detail.emoji.unicode;
      el.querySelector(".emoji-icon").textContent = emoji;
      save();
    });

    const onClickOutsideOfPicker = (e) => {
      if (e.target.closest("emoji-picker") || e.target.closest(".emoji-icon")) {
        return;
      }

      picker.remove();

      window.removeEventListener("click", onClickOutsideOfPicker);
    };

    window.addEventListener("click", onClickOutsideOfPicker);

    const rect = el.querySelector(".emoji-icon").getBoundingClientRect();
    let [x, y] = [rect.x + rect.width / 2, rect.y + rect.height / 2];

    picker.style.position = "absolute";
    picker.style.left = `${x}px`;
    picker.style.top = `${y}px`;

    document.body.appendChild(picker);

    // snap the picker to be within the viewport as a minimum
    let pickerRect = picker.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;
    let [px, py] = [x, y];

    if (pickerRect.right > innerWidth) {
      px = innerWidth - pickerRect.width;
    }

    if (pickerRect.bottom > innerHeight) {
      py = innerHeight - pickerRect.height;
    }

    picker.style.left = `${px}px`;
    picker.style.top = `${py}px`;
  });

  return el;
}

function randomEmoji() {
  const codePointRanges = [
    [0x1f600, 0x1f64f],
    [0x1f300, 0x1f5ff],
    [0x1f680, 0x1f6ff],
    [0x1f700, 0x1f77f],
    [0x1f780, 0x1f7ff],
    [0x1f800, 0x1f8ff],
    [0x1f900, 0x1f9ff],
    [0x1fa00, 0x1fa6f],
    [0x1fa70, 0x1faff],
    [0x2600, 0x26ff],
    [0x2700, 0x27bf],
    [0x2300, 0x23ff],
    [0x2b50, 0x2b55],
    [0x2000, 0x206f],
    [0x1f900, 0x1f9ff],
  ];

  const randomRange =
    codePointRanges[Math.floor(Math.random() * codePointRanges.length)];

  const randomCodePoint =
    Math.floor(Math.random() * (randomRange[1] - randomRange[0])) +
    randomRange[0];

  return String.fromCodePoint(randomCodePoint);
}

function updateStats() {
  const projectStatsTags = document.querySelector("#project-stats-tags");
  const projectStatsEntries = document.querySelector("#project-stats-entries");
  const projectStatsImgAvg = document.querySelector(
    "#project-stats-tags-per-image"
  );

  const entries = document.querySelectorAll(".image-entry");
  const textAreas = [];

  entries.forEach((entry) => {
    textAreas.push(entry.querySelector("textarea"));
  });

  const tags = textAreas
    .map((ta) => ta.value.split(",").map((tag) => tag.trim()))
    .filter((tag) => tag !== "")
    .flat();
  let uniqueTags = {};
  let uniqueTagCount = 0;
  for (const tag of tags) {
    if (tag === "") {
      continue;
    }
    if (!uniqueTags[tag]) {
      uniqueTags[tag] = true;
      uniqueTagCount++;
    }
  }

  function getImageEntryCountColor(count) {
    // 0 black
    // 5 red
    // 10 yellow
    // 20 green
    // 40 lime

    // interpolate between the colors
    // every new color is double the previous one
    const gradient = [0x000000, 0xff0000, 0xffff66, 0x009933, 0x00ff00];

    function hexToRgb(hex) {
      return {
        r: (hex >> 16) & 0xff,
        g: (hex >> 8) & 0xff,
        b: hex & 0xff,
      };
    }

    function rgbToHex({ r, g, b }) {
      return (r << 16) | (g << 8) | b;
    }

    function hexToCSSColor(hex) {
      return `#${hex.toString(16).padStart(6, "0")}`;
    }

    // interpolate between the colors
    // every new color is double the previous one
    const steps = gradient.length - 1;
    const step = Math.floor(count / steps);
    const remainder = count % steps;

    const startColor = hexToRgb(gradient[step]);
    const endColor = hexToRgb(gradient[step + 1]);

    const r = Math.floor(
      startColor.r + (endColor.r - startColor.r) * (remainder / steps)
    );

    const g = Math.floor(
      startColor.g + (endColor.g - startColor.g) * (remainder / steps)
    );

    const b = Math.floor(
      startColor.b + (endColor.b - startColor.b) * (remainder / steps)
    );

    return hexToCSSColor(rgbToHex({ r, g, b }));
  }

  projectStatsTags.textContent = `${uniqueTagCount}`;
  projectStatsEntries.textContent = `${entries.length}`;
  projectStatsEntries.style.color = getImageEntryCountColor(entries.length);
  projectStatsImgAvg.textContent = `${(tags.length / entries.length).toFixed(
    2
  )}`;
}

function addImageEntries(
  targetList = document.querySelector(".image-entries"),
  calledByLoad = false,
  ...entryInfos
) {
  const infos = [...entryInfos];

  console.log("Image entries getting added: ", infos);

  function addImageEntry(entryInfo, calledByLoad = false) {
    const src = entryInfo.src;
    const pageUrl = entryInfo.pageUrl;

    if (document.querySelector(`img[src="${src}"]`)) {
      return;
    }

    // in case of corrupted data, make sure tags is an array so at least when we save it, it's not undefined
    if (!entryInfo.tags) {
      entryInfo.tags = [];
    }

    const tags = entryInfo.tags.join(", ").replace(/, $/, "");

    const entry = createImageEntry({
      src,
      pageUrl,
      tags,
      target: targetList,
      calledByLoad,
    });

    targetList.appendChild(entry);

    save();
  }

  for (const info of infos) {
    addImageEntry(info, calledByLoad);
  }

  return targetList;
}

function onImportedTags({
  tags = {
    general: [],
    artist: [],
    species: [],
    character: [],
    meta: [],
    copyright: [],
  },
  options,
  imageSrc,
  pageUrl,
}) {
  const entry = document.querySelector(`img[src="${imageSrc}"]`);

  // flatten the tags
  const flattened = [];

  for (const key in tags) {
    flattened.push(...tags[key]);
  }

  console.log("Adding tags for image: ", imageSrc, " with tags: ", flattened);

  // doesn't exist, so let's add it
  if (!entry) {
    addImageEntries(document.querySelector(".image-entries"), false, {
      src: imageSrc,
      tags: flattened,
      pageUrl,
    });
  } else {
    // it exists, but we can still update the tags
    let textarea = entry.querySelector("textarea");
    if (!textarea) {
      textarea = entry.parentElement.querySelector("textarea");

      if (!textarea) {
        throw new Error("No textarea found");
      }

      let existingTags = textarea.value.split(", ").map((tag) => tag.trim());
      if (existingTags.length > 0) {
        existingTags.slice(0, -1); // remove the trailing comma
      }

      const newTags = flattened.filter((tag) => !existingTags.includes(tag));

      textarea.value += newTags.join(", ").replace(/, $/, "");
    }
  }

  save();
}

function removeImageEntries(
  targetList = document.querySelector(".image-entries"),
  ...srcs
) {
  const entries = targetList.querySelectorAll(".image-entry");

  for (const entry of entries) {
    const img = entry.querySelector("img");
    if (srcs.includes(img.src)) {
      entry.remove();
    }

    save();
  }

  return targetList;
}

function createVisualTag({ text = "" }) {
  const el = html`
    <div class="visual-tag-wrapper">
      <p class="visual-tag">${text}</p>
      <button class="btn-remove-tag material-icons">close</button>
    </div>
  `;

  el.updateColor = function () {
    const textContent = el.querySelector(".visual-tag").textContent;
    const hash = textContent
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    el.style.backgroundColor = `hsl(${hue}, 50%, 50%)`;
  };

  el.addEventListener("click", (e) => {
    // is this owned by a category container?
    const category = el.closest(".tag-category");

    if (category) {
      // yes? then we can select it

      if (e.ctrlKey) {
        el.toggleAttribute("selected");
      } else if (e.shiftKey) {
        const visualTags = el.parentElement.querySelectorAll(".visual-tag");
        const selectedTags = category.querySelectorAll(".visual-tag[selected]");
        const selectedTag = el;
        const selectedTagIndex = Array.from(visualTags).indexOf(selectedTag);
        const firstSelectedTag = selectedTags[0];
        const firstSelectedTagIndex =
          Array.from(visualTags).indexOf(firstSelectedTag);

        const range = [firstSelectedTagIndex, selectedTagIndex];

        if (range[0] > range[1]) {
          range.reverse();
        }

        for (let i = range[0]; i <= range[1]; i++) {
          visualTags[i].setAttribute("selected", "");
        }
      } else {
        const selectedTags = category.querySelectorAll(".visual-tag[selected]");
        selectedTags.forEach((tag) => {
          tag.removeAttribute("selected");
        });

        el.toggleAttribute("selected");
      }
    }

    const textEl = el.querySelector(".visual-tag");

    textEl.addEventListener("dblclick", (e) => {
      if (textEl.hasAttribute("contenteditable")) {
        return;
      } else {
        e.stopPropagation();

        textEl.setAttribute("contenteditable", "");

        textEl.focus();

        // select all text
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        textEl.addEventListener("blur", () => {
          textEl.removeAttribute("contenteditable");
          save();
        });

        textEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            textEl.blur();

            save();
          }
        });
      }
    });
  });

  el.querySelector(".btn-remove-tag").addEventListener("click", () => {
    el.remove();
    save();
  });

  return el;
}

function containerHasTag(containerElement, text = "") {
  let exists = false;

  if (!containerElement || !(containerElement instanceof HTMLElement)) {
    throw new Error("Invalid container element");
  }

  if (containerElement instanceof HTMLTextAreaElement) {
    exists = containerElement.value
      .split(",")
      .map((tag) => tag.trim())
      .includes(text);
  } else if (containerElement.classList.contains("visual-tags")) {
    const tags = containerElement.querySelectorAll(".visual-tag");

    for (const tag of tags) {
      if (tag.textContent === text) {
        exists = true;
        break;
      }
    }
  }

  return exists;
}

function createImageEntry({
  src = "",
  pageUrl = "",
  tags = ["mature male,", "solo,", "looking at viewer"],
  calledByLoad = false,
}) {
  const el = html`
    <div class="image-entry">
      <img src="${src}" title="${src}" page-url="${pageUrl}" />
      <textarea class="image-tags"></textarea>
      <button class="btn-remove-entry material-icons">delete</button>
      <span class="selection-indicator"></span>
      ${!calledByLoad
        ? (() => {
            return `
          <span class="image-entry-warning" hidden>
            <p>This image's dimensions are smaller than preferred.</p>
            <p>Are you sure you want to continue?</p>
            <div class="image-entry-warning-actions">
              <button class="btn-continue"><span class="material-icons">check</span><p>Yes</p></button>
              <button class="btn-cancel"><span class="material-icons">close</span><p>No</p></button>
            </div>
          </span>
        `;
          })()
        : ""}
    </div>
  `;

  const textArea = el.querySelector("textarea");

  if (!calledByLoad) {
    const warning = el.querySelector(".image-entry-warning");

    warning.querySelector(".btn-continue").addEventListener("click", () => {
      warning.setAttribute("hidden", "");
    });

    warning.querySelector(".btn-cancel").addEventListener("click", () => {
      el.remove();
      save();
    });
  }

  el.querySelector("img").addEventListener("load", (e) => {
    const img = e.target;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    if (!calledByLoad) {
      const warning = el.querySelector(".image-entry-warning");

      if (naturalWidth < 768 || naturalHeight < 768) {
        warning.removeAttribute("hidden");
      } else {
        warning.setAttribute("hidden", "");
      }
    }
  });

  textArea.value = tags;
  textArea.addEventListener("input", (e) => {
    e.stopPropagation();

    const value = textArea.value;

    updateStats();

    save();
  });

  // selecting the entry by clicking on the image
  el.querySelector("img").addEventListener("click", (e) => {
    const allEntries = document.querySelectorAll(".image-entry");

    if (e.ctrlKey) {
      // add to selection
      el.toggleAttribute("selected");
    } else if (e.shiftKey) {
      // add range to selection
      const selectedEntries = document.querySelectorAll(
        ".image-entry[selected]"
      );
      const selectedEntry = el;
      const selectedEntryIndex = Array.from(allEntries).indexOf(selectedEntry);
      const firstSelectedEntry = selectedEntries[0];
      const firstSelectedEntryIndex =
        Array.from(allEntries).indexOf(firstSelectedEntry);

      const range = [firstSelectedEntryIndex, selectedEntryIndex];

      if (range[0] > range[1]) {
        range.reverse();
      }

      for (let i = range[0]; i <= range[1]; i++) {
        allEntries[i].setAttribute("selected", "");
      }
    } else {
      // clear selection
      for (const entry of allEntries) {
        entry.removeAttribute("selected");
      }

      el.toggleAttribute("selected");
    }
  });

  /**
   *
   * @param {...string} tags
   * @returns
   */
  el.addTags = function (...tags) {
    if (arguments.length === 0) {
      return;
    }

    if (arguments[0] instanceof Array) {
      tags = arguments[0];
    } else if (arguments.length > 1) {
      const args = [...arguments];
      for (const arg of args) {
        tags.push(arg);
      }
    }

    save();
  };

  el.removeTags = function (tags = ["solo", "1girl", "looking at viewer"]) {
    const visualTags = el.querySelectorAll(".visual-tag-wrapper");
    visualTags.forEach((tag) => {
      const tagText = tag.querySelector(".visual-tag").textContent;
      if (tags.includes(tagText)) {
        tag.remove();
      }
    });

    save();
  };

  el.getPageUrl = function () {
    return el.querySelector("img").getAttribute("page-url");
  };

  let onClick = function (e) {
    const selectedTags = el.querySelectorAll(".visual-tag[selected]");
    const target = e.target;

    if (e.ctrlKey) {
      if (target.hasAttribute("selected")) {
        target.removeAttribute("selected");
      } else {
        target.setAttribute("selected", "");
      }
    } else if (e.shiftKey) {
      // todo: implement later
    } else {
      selectedTags.forEach((tag) => {
        tag.removeAttribute("selected");
      });

      if (target.hasAttribute("selected")) {
        target.removeAttribute("selected");
      } else {
        target.setAttribute("selected", "");
      }
    }
  };

  el.querySelector(".btn-remove-entry").addEventListener("click", () => {
    const recycleBin = document.getElementById("recycle-bin");

    // <ul id="recycle-bin-entries"></ul>
    const recycleBinEntries = document.getElementById("recycle-bin-entries");
    if (!recycleBin) {
      console.error("Recycle bin not found");
      return;
    } else {
      recycleBinEntries.appendChild(el);
      save();
    }
  });

  save();

  window.addEventListener("click", onClick);
  windowEventListeners.imagesEntry["click"].push(onClick);

  return el;
}

function save() {
  const entries = document.querySelectorAll(".image-entry");
  const images = [];

  const categoryEntries = document.querySelectorAll(".tag-category");
  const categories = [];

  entries.forEach((entry) => {
    const src = entry.querySelector("img").src;
    const pageUrl = entry.querySelector("img").getAttribute("page-url");
    const tags = entry
      .querySelector("textarea")
      .value.split(",")
      .map((tag) => tag.trim());

    images.push({ src, pageUrl, tags });
  });

  categoryEntries.forEach((category) => {
    const name = category.querySelector(".tag-category-name").textContent;
    const tags = category.querySelectorAll(".visual-tag");
    const emoji = category.querySelector(".emoji-icon").textContent;

    const tagsArray = [];

    tags.forEach((tag) => {
      tagsArray.push(tag.textContent);
    });

    categories.push({ name, tags: tagsArray, emoji });
  });

  let savedBackups = {};

  for (const date of Object.keys(backups)) {
    const backup = backups[date];
    const images = backup.images || [];
    const categories = backup.categories || [];

    const _images = [];
    const _categories = [];

    for (const _image of Object.values(images)) {
      const image = {
        src: _image.src,
        pageUrl: _image.pageUrl,
        tags: _image.tags,
      };

      _images.push(image);
    }

    for (const _category of Object.values(categories)) {
      const category = {
        name: _category.name,
        tags: _category.tags,
        emoji: _category.emoji,
      };

      _categories.push(category);
    }

    savedBackups[date] = { images: _images, categories: _categories };

    console.log("Saved backup: ", savedBackups, "...");
  }

  chrome.storage.local.set(
    { images, categories, backups: savedBackups },
    () => {
      console.log("Saved: ", { images, categories, backups: savedBackups });
    }
  );
}

function load() {
  let exit = false;

  chrome.storage.local.get("backups", (data) => {
    // if no backups object exists, create it
    if (!data.backups) {
      chrome.storage.local.set({ backups: {} }, () => {
        chrome.storage.local.get("backups", (data) => {
          backups = data.backups;
        });
      });
    } else {
      console.log("Backups found: ", data.backups);

      // load the backups
      backups = data.backups;

      const select = document.querySelector("#sel-backups");

      for (const date of Object.keys(backups)) {
        const backup = backups[date];

        const option = document.createElement("option");
        option.value = date;
        option.textContent = date;

        select.appendChild(option);
      }
    }
  });

  chrome.storage.local.get("categories", (data) => {
    const categories = data.categories;

    if (!categories) {
      console.log("No categories found, initializing...");

      chrome.storage.local.set({ categories: [] }, () => {
        chrome.storage.local.get("categories", (data) => {
          const container = document.querySelector(".tag-categories");

          for (const category of categories) {
            const tagCategory = createTagCategory({
              name: category.name,
              tags: category.tags,
              emoji: category.emoji,
            });
            container.appendChild(tagCategory);

            const tags = category.tags;
            for (const tag of tags) {
              const tagEl = createVisualTag({ text: tag });
              tagCategory.querySelector(".visual-tags").appendChild(tagEl);
            }
          }
        });
      });
    } else {
      const container = document.querySelector(".tag-categories");

      for (const category of categories) {
        console.log("Category: ", category);

        const tagCategory = createTagCategory(category);
        container.appendChild(tagCategory);

        const tags = category.tags;

        for (const tag of tags) {
          const tagEl = createVisualTag({ text: tag });
          tagCategory.querySelector(".visual-tags").appendChild(tagEl);
        }
      }
    }
  });

  if (exit) {
    return;
  }

  chrome.storage.local.get("images", (data) => {
    const images = data.images;
    exit = !images;

    if (!images) {
      chrome.storage.local.set({ images: [] }, () => {
        chrome.storage.local.get("images", (data) => {
          const container = document.querySelector(".image-entries");
          const images = data.images;

          for (const image of images) {
            addImageEntries(container, true, image);
          }
        });
      });
    }
  });

  if (exit) {
    return;
  }

  chrome.storage.local.get("images", (data) => {
    const container = document.querySelector(".image-entries");
    const images = data.images;

    for (const image of images) {
      addImageEntries(container, true, image);
    }
  });
}
async function download(filename = "exported.zip") {
  const entries = document.querySelectorAll(".image-entry");
  const zip = new JSZip();

  async function createImageAndTagFilePair(imageEntry) {
    const img = imageEntry.querySelector("img");
    const src = img.src;

    // Generate a unique filename using a hash
    const hash = src
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const fileName = hash.toString(16);

    // Get tags from the textarea
    const tags = imageEntry.querySelector("textarea").value.split(", ");
    const tagsString = tags.join(", ").replace(/, $/, "");

    // Create the text file for tags
    const tagsFile = new File([tagsString], `${fileName}.txt`, {
      type: "text/plain",
    });

    // Fetch and create the image file
    const imgFetched = await fetch(src);
    const imgBlob = await imgFetched.blob();
    const imgFile = new File([imgBlob], `${fileName}.png`, {
      type: "image/png",
    });

    return { imgFile, tagsFile, fileName };
  }

  for (const entry of entries) {
    try {
      const { imgFile, tagsFile, fileName } = await createImageAndTagFilePair(
        entry
      );

      // Add the image and tags file to the ZIP archive
      zip.file(`${fileName}.png`, imgFile);
      zip.file(`${fileName}.txt`, tagsFile);
    } catch (err) {
      console.error("Error creating files: ", err);
    }
  }

  // Generate the ZIP file
  zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename; // Ensure `filename` is a string
    a.click();

    URL.revokeObjectURL(url);
  });
}

/**
 * Open existing files on the user's filesystem,
 * or zip files containing images and tags.
 */
async function promptImportFiles() {

  /**
   * @type {FileSystemFileHandle[]}
   */
  const handle = await showOpenFilePicker();
  
  const zipFiles = [];
  const textFiles = {};
  const files = [];

  for await (const fileHandle of handle) {
    const file = await fileHandle.getFile();
    const fileName = file.name;
    const extension = fileName.split(".").pop();

    if (extension === "zip") {
      zipFiles.push(file);
    } else if (extension === "txt") {
      textFiles[fileName] = file;
    } else {
      files.push(file);
    }

    console.log("File: ", file);
  }

  // unpack the zip files

  for await (const zipFile of zipFiles) {
    const zip = await JSZip.loadAsync(zipFile);

    // regardless of the file type, we load them anyway
    // and put them in the files array
    for await (const file of Object.values(zip.files)) {
      const name = file.name;
      const extension = name.split(".").pop();

      if (extension === "txt") {
        const tags = await file.async("text");
        textFiles[name] = tags;
      } else {
        const blob = await file.async("blob");
        const url = URL.createObjectURL(blob);
        files.push({ name, url });
      }

      console.log("File: ", file);
    }

    console.log("Zip file loaded: ", zipFile);
  }

  // find pairs of files and tags.

  const pairs = [];

  for (const file of files) {
    console.log("Now finding pairs for: ", file);
    const name = file.name;
    const extension = name.split(".").pop();

    if (
      extension === "png" ||
      extension === "jpg" ||
      extension === "jpeg" ||
      extension === "webp"
    ) {
      let tagsFileName = name.replace(/\.(png|jpg|jpeg|webp)$/, ".txt");
      let tags = textFiles[tagsFileName];
      console.log("Tags file: ", tagsFileName, tags);
      pairs.push({ file: file.url, tags });
    }
  }

  // add the pairs to the image entries (only images for now)
  const imagePairs = [];

  for await (const pair of pairs) {
    const file = pair.file;
    const tags = pair.tags;

    /** @todo filter out images that already exist in the dataset so we don't get duplicates */

    const tagsText = tags || "";
    const tagsArray = tagsText.split(", ");

    imagePairs.push({ src: file, tags: tagsArray });
  }

  addImageEntries(document.querySelector(".image-entries"), ...imagePairs);
}

/**
 * Prompt the user to select a zip file to import
 */
async function openProjectDialog() {
  // first, confirm if the user wants to save the current project
  const prompt = promptDialog({
    title: "Save current project?",
    message: "Do you want to save the current project before importing?",

    options: [
      {
        text: "Yes",
        onclick: () => {
          save();
          prompt.remove();
        },
      },
      {
        text: "No",
        onclick: () => {
          prompt.remove();
        },
      },
    ],
  });

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.multiple = true;

  input.addEventListener("change", async (e) => {
    const files = e.target.files;
    const entries = [];

    for (const file of files) {
      const zip = await JSZip.loadAsync(file);
      const imageFiles = zip.file(/^.*\.png$/);
      const tagFiles = zip.file(/^.*\.txt$/);

      for (const imageFile of imageFiles) {
        const fileName = imageFile.name.replace(/\.png$/, "");
        const tagFile = tagFiles.find(
          (file) => file.name === `${fileName}.txt`
        );

        if (!tagFile) {
          // just add the image without empty tags
          entries.push({ src: imageFile.name, tags: [] });
          continue;
        }

        const tags = await tagFile.async("text");
        entries.push({
          src: imageFile.name,
          tags: tags.split(", ").map((tag) => tag.trim().replace(/, $/, "")),
        });
      }

      addImageEntries(document.querySelector(".image-entries"), ...entries);
    }
  });

  input.click();

  return input;
}

function syncImageAttributes() {
  const entries = document.querySelectorAll(".image-entry");

  for (const entry of entries) {
    const img = entry.querySelector("img");
    const tags = entry
      .querySelector("textarea")
      .value.split(", ")
      .filter((tag) => tag.trim() !== "");

    // set the tags attribute to have the same value as the text content
    entry.setAttribute("tags", tags.join(", ").replace(/, $/, "").trim());
  }
}

function syncTagColors() {
  const tagContainers = document.querySelectorAll(".visual-tag-wrapper");

  for (const tagContainer of tagContainers) {
    tagContainer.updateColor();
  }
}

/**
 * @todo Get tags by scraping a page
 * @param {string} src
 * @returns
 */
async function getTagsFromPage(src = "") {
  const markup = await fetch(src).then((res) => res.text());
  const parser = new DOMParser();

  return tags;
}

function promptDialog({
  title = "Warning",
  message = "Are you sure?",
  options = [
    {
      text: "Yes",
      onclick: (e) => {
        prompt.remove();
      },
    },
    {
      text: "No",
      onclick: (e) => {
        prompt.remove();
      },
    },
  ],
  defaultOption = "Yes",
}) {
  const prompt = html`
    <div class="prompt-dialog">
      <div class="prompt-inner">
        <div class="top-bar-transparent">
          <h3>${title}</h3>
          <button class="btn-close material-icons">close</button>
        </div>
        <div class="prompt-message">
          <p>${message}</p>
        </div>
        <div class="prompt-actions">
          ${options.map((option) => `<button>${option.text}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  const buttons = prompt.querySelectorAll("button");

  for (const btn of buttons) {
    if (btn.classList.contains("btn-close")) {
      btn.addEventListener("click", () => {
        prompt.remove();
      });
    } else {
      btn.addEventListener("click", (e) => {
        let shouldClose = true;

        const text = e.target.textContent;
        const option = options.find((opt) => opt.text === text);

        if (!option) {
          throw new Error("Option not found: ", text);
        }

        option.onclick.call(
          {
            prompt,
            preventClose: () => {
              shouldClose = false;
            },
          },
          e
        );

        if (shouldClose) {
          prompt.remove();
        }
      });
    }
  }

  document.body.appendChild(prompt);

  return prompt;
}

function backupCurrentProject() {
  const date = new Date().toLocaleString();

  const allEntries = document.querySelectorAll("#image-entries .image-entry"); // get all entries from the main list

  const images = [];
  const allCategories = document.querySelectorAll(".tag-category");
  const categories = [];
  const backup = {};

  allEntries.forEach((entry) => {
    const img = entry.querySelector("img").src;
    const tags = entry
      .querySelector("textarea")
      .value.split(", ")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "");
    const pageUrl = entry.querySelector("[page-url]").getAttribute("page-url");

    images.push({ src: img, tags, pageUrl });
  });

  allCategories.forEach((category) => {
    const name = category.querySelector(".tag-category-name").textContent;
    const tags = category
      .querySelectorAll(".visual-tag-wrapper .visual-tag")
      .entries()
      .map(([i, tag]) => tag.textContent.trim())
      .filter((tag) => tag !== "");
    const emoji = category.querySelector(".emoji-icon").textContent;

    categories.push({ name, tags, emoji });
  });

  backup.images = images;
  backup.categories = categories;

  backups[date] = backup;

  const select = document.querySelector("#sel-backups");
  const option = document.createElement("option");

  option.value = date;
  option.textContent = date;
  option.selected = true;

  // associate the backup object with the option element
  option.backup = backup;

  select.appendChild(option);

  // set the <select> to focus on the new option
  select.value = date;

  save();
}

/**
 * Animates the 'death' of an element, as if it died and became a ghost, floating up
 * and fading out.
 * @param {HTMLElement} element
 */
function murderElement(element, duration = 4000) {
  const rect = element.getBoundingClientRect();

  const container = html`<div></div>`;

  container.style.position = "absolute";
  container.style.top = `${rect.top}px`;
  container.style.left = `${rect.left}px`;
  container.style.width = `${rect.width}px`;
  container.style.height = `${rect.height}px`;

  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  container.style.display = "flex";
  container.style.margin = "0";
  container.style.padding = "0";
  container.style.outline = "none";
  container.style.border = "none";

  const cloned = element.cloneNode(true);

  cloned.style.position = "absolute";
  cloned.style.top = "0";
  cloned.style.left = "0";
  cloned.style.width = "100%";
  cloned.style.height = "100%";
  cloned.style.transition = "transform 0.5s, opacity 0.5s";
  cloned.style.pointerEvents = "none";
  cloned.style.zIndex = "9999";

  container.appendChild(cloned);

  document.body.appendChild(container);

  container.animate(
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(-100%)", opacity: 0 },
    ],
    {
      duration,
      easing: "linear",
      fill: "forwards",
    }
  ).onfinish = () => {
    container.remove();
  };

  element.remove();
}

document.addEventListener("DOMContentLoaded", main);
