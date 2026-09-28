(function () {
  // One shared lightbox for every `a[data-lightbox]` on the page. Without JS
  // the anchor simply opens the full-size image, so nothing is lost.
  var dlg = document.getElementById("lightbox");
  if (!dlg || typeof dlg.showModal !== "function") return;

  var cap = dlg.querySelector(".lightbox__caption");
  // The <img> is created here rather than in markup so the page never ships
  // an empty src attribute.
  var img = document.createElement("img");
  img.className = "lightbox__img";
  img.alt = ""; // set to the caption on open
  cap.parentNode.insertBefore(img, cap);
  var closeBtn = dlg.querySelector(".lightbox__close");
  var opener = null;

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-lightbox]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    opener = a;
    img.src = a.href;
    img.alt = a.getAttribute("data-caption") || "";
    cap.textContent = a.getAttribute("data-caption") || "";
    dlg.showModal();
    document.documentElement.classList.add("has-lightbox");
  });

  function close() {
    if (dlg.open) dlg.close();
  }

  closeBtn.addEventListener("click", close);
  // Click on the backdrop (the dialog itself, outside the figure) closes.
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) close();
  });
  dlg.addEventListener("close", function () {
    img.removeAttribute("src");
    document.documentElement.classList.remove("has-lightbox");
    if (opener) opener.focus();
    opener = null;
  });
})();
