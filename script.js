
/* ==========================================================
   MNM LEGAL ASSOCIATES
   GLOBAL WEBSITE JAVASCRIPT
   Justice, Integrity & Excellence
========================================================== */

"use strict";

(function () {

    /* ======================================================
       01. INITIALIZATION
    ====================================================== */

    function initializeWebsite() {

        initializeCopyright();
        initializeNavigation();
        initializeDisclaimer();
        initializeBackToTop();
        initializeActiveNavigation();
        initializeContactForms();
        initializeAccordions();
        initializeImages();
        initializeExternalLinks();

    }


    /* ======================================================
       02. AUTOMATIC COPYRIGHT YEAR
    ====================================================== */

    function initializeCopyright() {

        const currentYear = new Date().getFullYear();

        document.querySelectorAll(
            "#currentYear, #year, [data-current-year]"
        ).forEach(function (element) {

            element.textContent = currentYear;

        });

    }


    /* ======================================================
       03. RESPONSIVE NAVIGATION
    ====================================================== */

    function initializeNavigation() {

        const menuToggle = document.querySelector(
            "#menuToggle, .menu-toggle, .hamburger"
        );

        const navLinks = document.querySelector(
            "#navLinks, .nav-links"
        );

        if (!menuToggle || !navLinks) {
            return;
        }

        if (!navLinks.id) {
            navLinks.id = "mainNavigation";
        }

        menuToggle.setAttribute(
            "aria-controls",
            navLinks.id
        );

        if (menuToggle.tagName !== "BUTTON") {

            menuToggle.setAttribute("role", "button");
            menuToggle.setAttribute("tabindex", "0");

        }

        function isMenuOpen() {

            return (
                navLinks.classList.contains("open") ||
                navLinks.classList.contains("active")
            );

        }

        function updateMenu(open) {

            navLinks.classList.toggle("open", open);
            navLinks.classList.toggle("active", open);

            menuToggle.setAttribute(
                "aria-expanded",
                String(open)
            );

            menuToggle.setAttribute(
                "aria-label",
                open
                    ? "Close navigation menu"
                    : "Open navigation menu"
            );

            const icon = menuToggle.querySelector("i");

            if (icon) {

                icon.classList.toggle("fa-bars", !open);
                icon.classList.toggle("fa-xmark", open);

            }

        }

        function closeMenu() {
            updateMenu(false);
        }

        function toggleMenu(event) {

            event.preventDefault();

            updateMenu(!isMenuOpen());

        }

        closeMenu();

        menuToggle.addEventListener(
            "click",
            toggleMenu
        );

        if (menuToggle.tagName !== "BUTTON") {

            menuToggle.addEventListener(
                "keydown",
                function (event) {

                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {

                        toggleMenu(event);

                    }

                }
            );

        }

        navLinks.querySelectorAll("a").forEach(
            function (link) {

                link.addEventListener(
                    "click",
                    closeMenu
                );

            }
        );

        document.addEventListener(
            "click",
            function (event) {

                if (
                    isMenuOpen() &&
                    !navLinks.contains(event.target) &&
                    !menuToggle.contains(event.target)
                ) {

                    closeMenu();

                }

            }
        );

        document.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Escape" &&
                    isMenuOpen()
                ) {

                    closeMenu();
                    menuToggle.focus();

                }

            }
        );

        window.addEventListener(
            "resize",
            function () {

                if (
                    window.getComputedStyle(
                        menuToggle
                    ).display === "none"
                ) {

                    closeMenu();

                }

            },
            { passive: true }
        );

        window.addEventListener(
            "pageshow",
            closeMenu
        );

    }


    /* ======================================================
       04. LEGAL DISCLAIMER
    ====================================================== */

    function initializeDisclaimer() {

        const disclaimer = document.querySelector(
            "#disclaimer, #disclaimer-popup, .disclaimer-dialog"
        );

        if (!disclaimer) {
            return;
        }

        const storageKey =
            "mnmDisclaimerAcceptedV3";

        let accepted = false;

        try {

            accepted = (
                sessionStorage.getItem(storageKey)
                === "yes"
            );

        } catch (error) {

            accepted = false;

        }

        function saveAcceptance() {

            try {

                sessionStorage.setItem(
                    storageKey,
                    "yes"
                );

            } catch (error) {

                // Website remains usable if storage
                // is disabled by the browser.

            }

        }

        const isNativeDialog = (
            disclaimer.tagName === "DIALOG" &&
            typeof disclaimer.showModal === "function"
        );

        const agreeButton = disclaimer.querySelector(
            "#agreeBtn, #acceptDisclaimer, [data-disclaimer-accept]"
        );

        if (isNativeDialog) {

            if (!accepted && !disclaimer.open) {

                disclaimer.returnValue = "";

                disclaimer.showModal();

            }

            disclaimer.addEventListener(
                "cancel",
                function (event) {

                    event.preventDefault();

                }
            );

            disclaimer.addEventListener(
                "close",
                function () {

                    if (
                        disclaimer.returnValue === "accepted"
                    ) {

                        saveAcceptance();

                    }

                }
            );

            if (agreeButton) {

                agreeButton.addEventListener(
                    "click",
                    function (event) {

                        event.preventDefault();

                        saveAcceptance();

                        if (disclaimer.open) {

                            disclaimer.close("accepted");

                        }

                    }
                );

            }

        } else {

            disclaimer.hidden = accepted;

            if (accepted) {

                disclaimer.style.display = "none";

            } else {

                disclaimer.style.display = "flex";

            }

            if (agreeButton) {

                agreeButton.addEventListener(
                    "click",
                    function (event) {

                        event.preventDefault();

                        saveAcceptance();

                        disclaimer.hidden = true;
                        disclaimer.style.display = "none";

                    }
                );

            }

        }

    }


    /* ======================================================
       05. BACK TO TOP BUTTON
    ====================================================== */

    function initializeBackToTop() {

        const backToTop = document.querySelector(
            "#backToTop, .back-to-top"
        );

        if (!backToTop) {
            return;
        }

        let ticking = false;

        function updateButton() {

            backToTop.hidden = window.scrollY < 450;

            ticking = false;

        }

        window.addEventListener(
            "scroll",
            function () {

                if (!ticking) {

                    window.requestAnimationFrame(
                        updateButton
                    );

                    ticking = true;

                }

            },
            { passive: true }
        );

        updateButton();

        backToTop.addEventListener(
            "click",
            function () {

                const reduceMotion = window.matchMedia(
                    "(prefers-reduced-motion: reduce)"
                ).matches;

                window.scrollTo({

                    top: 0,

                    behavior: reduceMotion
                        ? "auto"
                        : "smooth"

                });

            }
        );

    }


    /* ======================================================
       06. ACTIVE NAVIGATION HIGHLIGHT
    ====================================================== */

    function initializeActiveNavigation() {

        const links = Array.from(
            document.querySelectorAll(
                ".nav-links a[href]"
            )
        );

        if (!links.length) {
            return;
        }

        function normalizePath(path) {

            return path.replace(
                /\/index\.html$/,
                "/"
            );

        }

        const currentPath = normalizePath(
            window.location.pathname
        );

        const sectionLinks = [];

        links.forEach(function (link) {

            let url;

            try {

                url = new URL(
                    link.href,
                    window.location.href
                );

            } catch (error) {

                return;

            }

            if (
                url.origin !== window.location.origin
            ) {

                return;

            }

            if (
                normalizePath(url.pathname)
                !== currentPath
            ) {

                return;

            }

            if (!url.hash) {

                link.setAttribute(
                    "aria-current",
                    "page"
                );

                return;

            }

            let sectionId;

            try {

                sectionId = decodeURIComponent(
                    url.hash.slice(1)
                );

            } catch (error) {

                return;

            }

            const section =
                document.getElementById(sectionId);

            if (section) {

                sectionLinks.push({

                    link: link,
                    section: section

                });

            }

        });

        if (!sectionLinks.length) {
            return;
        }

        let ticking = false;

        function updateActiveSection() {

            const header = document.querySelector(
                ".site-header, .navbar"
            );

            const headerHeight = header
                ? header.offsetHeight
                : 80;

            const offset = headerHeight + 80;

            let active = null;

            sectionLinks.forEach(function (item) {

                const position =
                    item.section.getBoundingClientRect();

                if (
                    position.top <= offset &&
                    position.bottom > offset
                ) {

                    active = item;

                }

            });

            sectionLinks.forEach(function (item) {

                if (item === active) {

                    item.link.setAttribute(
                        "aria-current",
                        "location"
                    );

                } else {

                    item.link.removeAttribute(
                        "aria-current"
                    );

                }

            });

            ticking = false;

        }

        window.addEventListener(
            "scroll",
            function () {

                if (!ticking) {

                    window.requestAnimationFrame(
                        updateActiveSection
                    );

                    ticking = true;

                }

            },
            { passive: true }
        );

        window.addEventListener(
            "resize",
            updateActiveSection,
            { passive: true }
        );

        updateActiveSection();

    }


    /* ======================================================
       07. CONTACT FORM VALIDATION

       Retains the existing FormSubmit email service.
       Does not store client information in localStorage.
    ====================================================== */

    function initializeContactForms() {

        const forms = document.querySelectorAll(
            "form.contact-form, .contact-form form"
        );

        forms.forEach(function (form) {

            const phone = form.querySelector(
                'input[type="tel"]'
            );

            const submitButton = form.querySelector(
                'button[type="submit"], input[type="submit"]'
            );

            let submitting = false;

            const originalButtonText = submitButton
                ? submitButton.textContent
                : "";

            const originalButtonValue = submitButton
                ? submitButton.value
                : "";

            if (phone) {

                function validatePhone() {

                    const value = phone.value.trim();

                    if (!value) {

                        phone.setCustomValidity("");
                        return;

                    }

                    const digits = value.replace(
                        /\D/g,
                        ""
                    );

                    const validCharacters =
                        /^\+?[\d\s().-]+$/.test(value);

                    const validLength = (
                        digits.length >= 10 &&
                        digits.length <= 15
                    );

                    if (
                        !validCharacters ||
                        !validLength
                    ) {

                        phone.setCustomValidity(
                            "Please enter a valid mobile number."
                        );

                    } else {

                        phone.setCustomValidity("");

                    }

                }

                phone.addEventListener(
                    "input",
                    validatePhone
                );

                phone.addEventListener(
                    "blur",
                    validatePhone
                );

                validatePhone();

            }

            form.addEventListener(
                "submit",
                function (event) {

                    if (submitting) {

                        event.preventDefault();
                        return;

                    }

                    if (!form.checkValidity()) {

                        event.preventDefault();
                        form.reportValidity();
                        return;

                    }

                    submitting = true;

                    if (submitButton) {

                        submitButton.disabled = true;

                        submitButton.setAttribute(
                            "aria-busy",
                            "true"
                        );

                        if (
                            submitButton.tagName === "INPUT"
                        ) {

                            submitButton.value =
                                "Submitting...";

                        } else {

                            submitButton.textContent =
                                "Submitting...";

                        }

                    }

                }
            );

            window.addEventListener(
                "pageshow",
                function () {

                    submitting = false;

                    if (submitButton) {

                        submitButton.disabled = false;

                        submitButton.removeAttribute(
                            "aria-busy"
                        );

                        if (
                            submitButton.tagName === "INPUT"
                        ) {

                            submitButton.value =
                                originalButtonValue;

                        } else {

                            submitButton.textContent =
                                originalButtonText;

                        }

                    }

                }
            );

        });

    }


    /* ======================================================
       08. FAQ AND EXPANDABLE CARDS

       Uses native HTML details and summary elements.
       Single-open mode is optional.
    ====================================================== */

    function initializeAccordions() {

        const groups = document.querySelectorAll(
            "[data-accordion='single']"
        );

        groups.forEach(function (group) {

            const items = group.querySelectorAll(
                "details"
            );

            items.forEach(function (item) {

                item.addEventListener(
                    "toggle",
                    function () {

                        if (!item.open) {
                            return;
                        }

                        items.forEach(
                            function (otherItem) {

                                if (otherItem !== item) {

                                    otherItem.open = false;

                                }

                            }
                        );

                    }
                );

            });

        });

    }


    /* ======================================================
       09. IMAGE ERROR HANDLING
    ====================================================== */

    function initializeImages() {

        const images = document.querySelectorAll(
            "img"
        );

        images.forEach(function (image) {

            function handleImageError() {

                if (
                    image.dataset.imageError === "true"
                ) {

                    return;

                }

                image.dataset.imageError = "true";

                const fallback =
                    document.createElement("span");

                fallback.className =
                    "image-fallback";

                fallback.setAttribute(
                    "role",
                    "img"
                );

                fallback.setAttribute(
                    "aria-label",
                    image.alt || "Image unavailable"
                );

                fallback.textContent =
                    image.alt || "Image unavailable";

                fallback.style.display = "grid";
                fallback.style.placeItems = "center";
                fallback.style.minHeight = "60px";
                fallback.style.padding = "12px";
                fallback.style.background = "#efede8";
                fallback.style.color = "#263345";
                fallback.style.fontSize = "12px";
                fallback.style.textAlign = "center";

                image.replaceWith(fallback);

            }

            image.addEventListener(
                "error",
                handleImageError,
                { once: true }
            );

            if (
                image.complete &&
                image.naturalWidth === 0
            ) {

                handleImageError();

            }

        });

    }


    /* ======================================================
       10. EXTERNAL LINK SAFETY
    ====================================================== */

    function initializeExternalLinks() {

        document.querySelectorAll(
            'a[target="_blank"]'
        ).forEach(function (link) {

            const values = new Set(
                (link.getAttribute("rel") || "")
                    .split(/\s+/)
                    .filter(Boolean)
            );

            values.delete("opener");
            values.add("noopener");
            values.add("noreferrer");

            link.setAttribute(
                "rel",
                Array.from(values).join(" ")
            );

        });

    }


    /* ======================================================
       11. START WEBSITE
    ====================================================== */

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            initializeWebsite,
            { once: true }
        );

    } else {

        initializeWebsite();

    }

})();


/* ==========================================================
   END OF GLOBAL WEBSITE JAVASCRIPT
   MNM LEGAL ASSOCIATES
========================================================== */
