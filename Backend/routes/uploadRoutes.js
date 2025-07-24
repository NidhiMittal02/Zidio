import express from "express";
import multer from "multer";
import ExcelRecord from "../models/ExcelRecord.js";
import checkAuth from "../middlewares/auth.js";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { safeHandler } from "../middlewares/safeHandler.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

router.post(
  "/upload",
  checkAuth("user"),
  upload.single("file"),
  safeHandler(async (req, res) => {
    try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      
      const record = await ExcelRecord.create({
        data: jsonData,
        uploadedBy: req.user.id,
        fileName: req.file.originalname,
      });
    console.log("record:", record);
      res.status(201).json({ message: "File uploaded and processed", record });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
);


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
router.get(
  "/download/:id",
  safeHandler(async (req, res) => {
    try {
      const record = await ExcelRecord.findById(req.params.id);
      if (!record) return res.status(404).json({ error: "File not found" });
      const jsonData = record.data;
      if (!jsonData || jsonData.length === 0) {
        return res.status(400).json({ error: "No data to export" });
      }
      const worksheet = XLSX.utils.json_to_sheet(jsonData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const tempFilePath = path.join(
        __dirname,
        `../tem/${record.fileName || "export"}.xlsx`
      );
      XLSX.writeFile(workbook, tempFilePath);
      res.download(tempFilePath, (err) => {
        if (err) {
          console.error("Download error:", err);
          return res.status(500).json({ error: "Failed to download file" });
        }
        fs.unlinkSync(tempFilePath);
      });
    } catch (err) {
      console.error("Error:", err);
      res.status(500).json({ error: err.message });
    }
  })
);

router.get(
  "/file/:id",
  safeHandler(async (req, res) => {
    const file = await ExcelRecord.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    res.json({
      id: file._id,
      fileName: file.fileName,
      data: file.data,
      uploadedAt: file.uploadedAt,
    });
  })
);


router.get(
  "/myfiles/:id",
  safeHandler(async (req, res) => {
    try {
      const userId = req.params.id;
      const records = await ExcelRecord.find({ uploadedBy: userId })
        .sort({ uploadedAt: -1 })
        .select("data uploadedAt fileName");

      if (!records || records.length === 0) {
        return res.status(404).json({ error: "No files found" });
      }

      res.status(200).json(records);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
);

router.post(
  "/files/:id",
  safeHandler(async (req, res) => {
    const record = await ExcelRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: "File not found" });
    }

    const deletedFileName = record.fileName;
    await ExcelRecord.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "File deleted successfully",
      deletedFileName,
    });
  })
);


export default router;
