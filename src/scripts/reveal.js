(function () {
  // The `.js` root class is added synchronously in `<head>` (Layout.astro) so
  // reveal-hidden content never flashes visible before the script runs.
  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Stagger the reveal delay for siblings inside one group.
  function assignStagger(root) {
    var groups = root.querySelectorAll("[data-reveal-group]");
    groups.forEach(function (group) {
      var items = group.querySelectorAll("[data-reveal]");
      items.forEach(function (item, i) {
        item.style.setProperty("--rd", Math.min(i * 60, 420) + "ms");
      });
    });
  }

  var targets = document.querySelectorAll("[data-reveal]");
  var sections = document.querySelectorAll(".section");
  assignStagger(document);

  var hasIO = "IntersectionObserver" in window;

  if (reduce || !hasIO) {
    // No reveal motion: everything is visible immediately. (The scroll-spy
    // below still runs, so the nav keeps tracking the current section.)
    targets.forEach(function (el) {
      el.classList.add("is-in");
    });
    sections.forEach(function (el) {
      el.classList.add("is-in");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          en.target.classList.toggle("is-in", en.isIntersecting);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach(function (el) {
      io.observe(el);
    });
    sections.forEach(function (el) {
      io.observe(el);
    });
  }
  if (!hasIO) return;

  // Nav active state via scroll-spy.
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  var spies = navLinks
    .map(function (link) {
      return document.querySelector(link.hash);
    })
    .filter(Boolean);

  // Pinout signal bus: span the bus between the first and last pins, then
  // move the probe (and the charged fill) to whichever pin is active.
  var pinout = document.querySelector(".pinout");
  var pins = pinout ? Array.prototype.slice.call(pinout.querySelectorAll("a[data-nav]")) : [];
  var busTop = 0, busH = 0, lastPin = null;
  function pinCenter(a) {
    return a.offsetTop + a.offsetHeight / 2;
  }
  function layoutBus() {
    if (!pins.length || !pinout.offsetParent) return;
    busTop = pinCenter(pins[0]);
    busH = pinCenter(pins[pins.length - 1]) - busTop;
    pinout.style.setProperty("--bus-top", busTop + "px");
    pinout.style.setProperty("--bus-h", busH + "px");
    if (lastPin) moveProbe(lastPin, false);
  }
  function moveProbe(a, ping) {
    lastPin = a;
    if (!busH) return;
    var y = pinCenter(a) - busTop;
    pinout.style.setProperty("--probe", y + "px");
    pinout.style.setProperty("--fill", (y / busH).toFixed(4));
    var p = ping && pinout.querySelector(".pinout__ping");
    if (p) {
      p.classList.remove("is-on");
      void p.offsetWidth; // restart the ping animation
      p.classList.add("is-on");
    }
  }
  if (pins.length) {
    layoutBus();
    window.addEventListener("resize", layoutBus);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBus);
  }

  function setActive(id) {
    navLinks.forEach(function (link) {
      var active = link.hash === "#" + id;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "true");
        if (pinout && pinout.contains(link) && link !== lastPin) moveProbe(link, true);
        // Keep the active link visible in the horizontally scrolling strip.
        var strip = link.parentElement;
        if (strip && strip.scrollWidth > strip.clientWidth) {
          var left = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2;
          strip.scrollTo({ left: left, behavior: reduce ? "auto" : "smooth" });
        }
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  var spy = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) setActive(en.target.id);
      });
    },
    { rootMargin: "-35% 0px -55% 0px" }
  );
  spies.forEach(function (s) {
    spy.observe(s);
  });

  if (spies.length && document.querySelector("#about")) setActive("about");
})();
