const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const app = express();
const PORT = 3000;

let DESTINATION_PATH = null;
const skippedFiles = new Set();

const log = (...a) => console.log(new Date().toISOString(), ...a);

app.use(express.json());
app.use(express.static("public"));

/* =======================
   LIST DRIVES (WINDOWS)
======================= */
app.get("/api/drives", (req, res) => {
  try {
    const output = execSync("wmic logicaldisk get name").toString();
    const drives = output
      .split("\n")
      .map((l) => l.trim())
      .filter((d) => /^[A-Z]:$/.test(d));

    res.json(drives);
  } catch (e) {
    res.status(500).send("Failed to list drives");
  }
});

/* =======================
   LIST FOLDERS
======================= */
app.get("/api/folders", (req, res) => {
  const base = req.query.path;
  if (!base || !fs.existsSync(base)) return res.json([]);

  const folders = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  res.json(folders);
});

/* =======================
   CREATE FOLDER
======================= */
app.post("/api/create-folder", (req, res) => {
  const { path: base, name } = req.body;
  if (!base || !name) return res.status(400).send("Invalid");

  const full = path.join(base, name);
  fs.mkdirSync(full, { recursive: true });
  log("📁 Folder created:", full);
  res.send("OK");
});

/* =======================
   SET DESTINATION
======================= */
app.post("/set-path", (req, res) => {
  const { path: p } = req.body;
  if (!p || !fs.existsSync(p)) {
    log("❌ Invalid path:", p);
    return res.status(400).send("Invalid path");
  }
  DESTINATION_PATH = p;
  log("✅ Upload path set:", DESTINATION_PATH);
  res.send("OK");
});

/* =======================
   MULTER CONFIG
======================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const relativeDir = path.dirname(file.originalname);
    const dest =
      relativeDir === "."
        ? DESTINATION_PATH
        : path.join(DESTINATION_PATH, relativeDir);

    // ✅ create only if NOT root destination
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    cb(null, dest);
  },
  filename: (req, file, cb) => {
    log("📥 Uploading:", file.originalname);
    cb(null, path.basename(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const full = path.join(
    DESTINATION_PATH,
    path.dirname(file.originalname),
    file.originalname
  );
  if (fs.existsSync(full)) {
    skippedFiles.add(file.originalname);
    log("⏭️ Skipped:", file.originalname);
    return cb(null, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: Infinity, files: Infinity },
}).any();

/* =======================
   UPLOAD
======================= */
app.post("/upload", (req, res) => {
  skippedFiles.clear();
  log("🚀 Upload started");

  upload(req, res, (err) => {
    if (err) {
      log("❌ Upload error:", err.message);
      return res.status(500).send(err.message);
    }
    log("✅ Upload complete");
    res.json({
      uploaded: req.files.length,
      skipped: skippedFiles.size,
      skippedFiles: [...skippedFiles],
    });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  log(`Server running at http://0.0.0.0:${PORT}`);
});
