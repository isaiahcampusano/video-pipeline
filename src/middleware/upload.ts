import { mkdirSync } from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";

const uploadDir = path.join(config.tempDir, "uploads");
mkdirSync(uploadDir, { recursive: true });

export const videoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_request, _file, callback) => {
      callback(null, `${Date.now()}-${crypto.randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: 1,
  },
});
