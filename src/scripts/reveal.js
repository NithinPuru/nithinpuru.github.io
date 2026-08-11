(function () {
  var docEl = document.documentElement;
  docEl.classList.add("js");

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

  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) {
      el.classList.add("is-in");
    });
    sections.forEach(function (el) {
      el.classList.add("is-in");
    });
    return;
  }

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

  // Nav active state via scroll-spy.
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  var spies = navLinks
    .map(function (link) {
      return document.querySelector(link.hash);
    })
    .filter(Boolean);

  function setActive(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.hash === "#" + id);
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
