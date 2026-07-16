"use strict";

const select = (selector, scope = document) => scope.querySelector(selector);
const selectAll = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function initNavigation() {
  const header = select("[data-header]");
  const menuButton = select("[data-menu-button]");
  const navigation = select("[data-navigation]");
  const sectionNavigation = select("[data-section-nav]");

  if (!header || !menuButton || !navigation) return;

  const menuIcon = select("span", menuButton);
  const closeMenu = () => {
    navigation.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation");
    if (menuIcon) menuIcon.textContent = "\u2630";
  };

  const openMenu = () => {
    navigation.classList.add("is-open");
    document.body.classList.add("nav-open");
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "Close navigation");
    if (menuIcon) menuIcon.textContent = "\u00d7";
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    if (isOpen) closeMenu();
    else openMenu();
  });

  selectAll("a", navigation).forEach((link) => link.addEventListener("click", closeMenu));
  selectAll('a[href="#"]', navigation).forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      closeMenu();
      menuButton.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });

  const sectionNavLinks = sectionNavigation
    ? selectAll('a[href^="#"]', sectionNavigation)
    : [];
  const navLinks = sectionNavLinks;
  const sectionsById = new Map();

  navLinks.forEach((link) => {
    const section = select(link.getAttribute("href"));
    if (section) sectionsById.set(section.id, section);
  });

  const sections = [...sectionsById.values()].sort((a, b) => a.offsetTop - b.offsetTop);
  let scrollFrame;

  const updateHeader = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);

    const activationLine = header.offsetHeight + 72;
    let currentSection = null;

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= activationLine && rect.bottom > header.offsetHeight) {
        currentSection = section;
      }
    });

    if (sectionNavigation) {
      sectionNavigation.classList.toggle("is-visible", Boolean(currentSection));
    }

    navLinks.forEach((link) => {
      const isCurrent = currentSection && link.hash === `#${currentSection.id}`;
      link.classList.toggle("is-active", Boolean(isCurrent));
      if (isCurrent) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });

    scrollFrame = undefined;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateHeader);
    },
    { passive: true },
  );

  updateHeader();
}

function initFigureDialog() {
  const dialog = select("[data-figure-dialog]");
  const dialogImage = select("[data-dialog-image]");
  const dialogTitle = select("#figure-dialog-title");
  const closeButton = select("[data-dialog-close]");
  const dialogCanvas = select(".dialog-canvas", dialog);
  const openButtons = selectAll("[data-lightbox]");

  if (
    !dialog ||
    !dialogImage ||
    !dialogTitle ||
    !closeButton ||
    !dialogCanvas ||
    !openButtons.length
  ) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeSource;
  let dialogAnimation;
  let openRequest = 0;

  const getZoomTransform = (sourceRect, targetRect) => {
    const scale = Math.max(
      0.18,
      Math.min(
        0.72,
        sourceRect.width / targetRect.width,
        sourceRect.height / targetRect.height,
      ),
    );
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    return `translate(${sourceCenterX - targetCenterX}px, ${
      sourceCenterY - targetCenterY
    }px) scale(${scale})`;
  };

  const getReturnTransform = (sourceRect, targetRect) => {
    const scaleX = Math.max(0.01, sourceRect.width / targetRect.width);
    const scaleY = Math.max(0.01, sourceRect.height / targetRect.height);
    const sourceCenterX = sourceRect.left + sourceRect.width / 2;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    return `translate(${sourceCenterX - targetCenterX}px, ${
      sourceCenterY - targetCenterY
    }px) scale(${scaleX}, ${scaleY})`;
  };

  const runDialogAnimation = (keyframes, options, preserveFinalFrame = false) => {
    if (reducedMotion.matches || typeof dialog.animate !== "function") {
      return Promise.resolve();
    }

    dialogAnimation?.cancel();
    const animation = dialog.animate(keyframes, { ...options, fill: "both" });
    dialogAnimation = animation;

    return animation.finished.catch(() => undefined).then(() => {
      if (dialogAnimation === animation && !preserveFinalFrame) {
        animation.cancel();
        dialogAnimation = undefined;
      }
    });
  };

  const finishClose = () => {
    dialog.classList.remove("is-closing");

    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");

    dialogAnimation?.cancel();
    dialogAnimation = undefined;
  };

  const closeDialog = async () => {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;

    openRequest += 1;
    dialog.classList.add("is-closing");

    if (reducedMotion.matches) {
      finishClose();
      return;
    }

    const targetRect = dialog.getBoundingClientRect();
    const sourceRect = activeSource?.isConnected
      ? activeSource.getBoundingClientRect()
      : targetRect;
    const style = getComputedStyle(dialog);

    await runDialogAnimation(
      [
        { opacity: style.opacity, transform: style.transform },
        { opacity: 1, transform: getReturnTransform(sourceRect, targetRect) },
      ],
      { duration: 320, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
      true,
    );

    finishClose();
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const request = ++openRequest;
      const sourceImage = select("img", button);
      const sourceRect = sourceImage?.getBoundingClientRect();
      activeSource = sourceImage;
      dialogAnimation?.cancel();
      dialogAnimation = undefined;
      dialog.classList.remove("is-closing");
      dialogImage.src = button.dataset.lightbox;
      dialogImage.alt = button.dataset.lightboxAlt || "Full-resolution project figure";
      dialogTitle.textContent = button.dataset.lightboxAlt || "Full-resolution figure";

      if (sourceImage) {
        dialogImage.width = Number(sourceImage.getAttribute("width"));
        dialogImage.height = Number(sourceImage.getAttribute("height"));
      }

      await Promise.race([
        dialogImage.decode().catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, 120)),
      ]);

      if (request !== openRequest) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");

      if (sourceRect) {
        const targetRect = dialog.getBoundingClientRect();
        await runDialogAnimation(
          [
            {
              opacity: 1,
              transform: getZoomTransform(sourceRect, targetRect),
            },
            { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
          ],
          { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      }
    });
  });

  closeButton.addEventListener("click", closeDialog);
  dialogCanvas.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
  dialog.addEventListener("close", () => {
    dialogAnimation?.cancel();
    dialogAnimation = undefined;
    activeSource = undefined;
    dialog.classList.remove("is-closing");
    dialogImage.removeAttribute("src");
    dialogImage.alt = "";
  });
}

function initTaskVideo() {
  const video = select("[data-task-video-player]");
  const buttons = selectAll("[data-task-video-src]");

  if (!video || !buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("is-active")) return;

      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      video.pause();
      video.src = button.dataset.taskVideoSrc;
      video.setAttribute("aria-label", button.dataset.videoLabel || button.textContent.trim());
      video.load();
    });
  });

  buttons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === 0));
  });
}

function initSimulatorVideo() {
  const video = select("[data-simulator-video-player]");
  const buttons = selectAll("[data-simulator-video-src]");

  if (!video || !buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("is-active")) return;

      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      video.pause();
      video.src = button.dataset.simulatorVideoSrc;
      video.setAttribute("aria-label", button.dataset.videoLabel || button.textContent.trim());
      video.load();
    });
  });

  buttons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === 0));
  });
}

function initPromptScrollIndicator() {
  const scroller = select(".prompt-selector");
  const indicator = select(".prompt-scroll-indicator");
  const thumb = indicator ? select("span", indicator) : null;

  if (!scroller || !indicator || !thumb) return;

  let scrollFrame;

  const updateIndicator = () => {
    scrollFrame = undefined;

    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    const hasOverflow = maxScroll > 1;
    indicator.hidden = !hasOverflow;

    if (!hasOverflow) {
      thumb.style.setProperty("--scroll-progress", "0%");
      thumb.style.setProperty("--scroll-thumb-width", "100%");
      return;
    }

    const thumbWidth = Math.min(100, Math.max(18, (scroller.clientWidth / scroller.scrollWidth) * 100));
    const progress = (scroller.scrollLeft / maxScroll) * (100 - thumbWidth);

    thumb.style.setProperty("--scroll-progress", `${progress}%`);
    thumb.style.setProperty("--scroll-thumb-width", `${thumbWidth}%`);
  };

  const requestUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateIndicator);
  };

  scroller.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);

  if ("ResizeObserver" in window) {
    new ResizeObserver(requestUpdate).observe(scroller);
  }

  requestUpdate();
}

initNavigation();
initTaskVideo();
initSimulatorVideo();
initPromptScrollIndicator();
initFigureDialog();
