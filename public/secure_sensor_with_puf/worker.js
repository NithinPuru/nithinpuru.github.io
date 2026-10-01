// Runs the model off the main thread: the page posts a request, this posts the result back.
importScripts("model.js" + self.location.search);
self.onmessage = e => {
  const m = e.data;
  try { self.postMessage(handleRequest(m, p => self.postMessage({ type: "progress", name: m.name, p }), true)); }
  catch (err) { self.postMessage({ type: "error", message: String((err && err.stack) || err) }); }
};
