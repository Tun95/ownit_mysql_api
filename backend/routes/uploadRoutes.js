import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import sharp from "sharp";
import db from "../db/knex.js";

const upload = multer();

const uploadSize = multer({
  limits: { fileSize: 100 * 1024 * 1024 },
});

const videoUpload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadRouter = express.Router();

//============================
// UPLOAD COMPRESSED IMAGE FILE
//============================
uploadRouter.post("/", upload.single("file"), async (req, res) => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Check file type
  const fileTypes = ["image/png", "image/jpg", "image/jpeg"];
  if (!fileTypes.includes(req.file.mimetype)) {
    return res.status(400).send({
      message: "Invalid file type. Only PNG, JPG, and JPEG are allowed.",
    });
  }

  try {
    const image = sharp(req.file.buffer);
    const metadata = await image.metadata();

    let compressedBuffer;

    if (metadata.width > 1000) {
      compressedBuffer = await image
        .resize({ width: 1000 })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      compressedBuffer = await image.webp({ quality: 80 }).toBuffer();
    }

    // Ensure the compressed image is under 500kb
    if (compressedBuffer.length > 500 * 1024) {
      return res.status(400).send({
        message: "Image is too large. Please upload an image under 500kb.",
      });
    }

    // Upload to Cloudinary
    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "image", format: "webp" },
          (error, result) => {
            if (result) {
              resolve(result);
            } else {
              reject(error);
            }
          }
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };
    const result = await streamUpload(compressedBuffer);

    // Optionally, apply transformations to serve optimized images
    const optimizedUrl = cloudinary.url(result.public_id, {
      transformation: [
        { width: "auto", dpr: "auto", crop: "scale" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    // Insert upload information into MySQL database
    await db("uploads").insert({
      file_url: result.secure_url,
      file_type: "image",
      upload_date: new Date(),
    });

    res.set("Cache-Control", "public, max-age=86400");
    res.send({ ...result, optimizedUrl });
  } catch (error) {
    res.status(500).send({ message: "Upload failed", error: error.message });
  }
});

//============================
// UPLOAD ORIGINAL IMAGE FILE
//============================
uploadRouter.post("/original", uploadSize.single("file"), async (req, res) => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Check file type
  const fileTypes = ["image/png", "image/jpg", "image/jpeg"];
  if (!fileTypes.includes(req.file.mimetype)) {
    return res.status(400).send({
      message: "Invalid file type. Only PNG, JPG, and JPEG are allowed.",
    });
  }

  try {
    // Upload to Cloudinary without resizing or conversion
    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "image" },
          (error, result) => {
            if (result) {
              resolve(result);
            } else {
              reject(error);
            }
          }
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };
    const result = await streamUpload(req.file.buffer);

    // Insert upload information into MySQL database
    await db("uploads").insert({
      file_url: result.secure_url,
      file_type: "image",
      upload_date: new Date(),
    });

    res.set("Cache-Control", "public, max-age=86400");
    res.send(result);
  } catch (error) {
    // Handle file size limit errors
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return res
        .status(400)
        .send({ message: "File size exceeds the 100MB limit." });
    }
    res.status(500).send({ message: "Upload failed", error: error.message });
  }
});

//============================
// UPLOAD ORIGINAL VIDEO FILE
//============================
uploadRouter.post("/video", videoUpload.single("file"), async (req, res) => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  // Check file type
  const fileTypes = ["video/mp4", "video/avi", "video/mkv"];
  if (!req.file || !fileTypes.includes(req.file.mimetype)) {
    return res.status(400).send({
      message: "Invalid file type. Only MP4, AVI, and MKV formats are allowed.",
    });
  }

  // Function to upload to Cloudinary
  const streamUpload = (buffer) => {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "video" },
        (error, result) => {
          if (result) {
            resolve(result);
          } else {
            reject(error);
          }
        }
      );
      streamifier.createReadStream(buffer).pipe(stream);
    });
  };

  try {
    const startTime = Date.now();
    const result = await streamUpload(req.file.buffer);
    const endTime = Date.now();
    console.log(`Upload duration: ${endTime - startTime} ms`);

    // Insert upload information into MySQL database
    await db("uploads").insert({
      file_url: result.secure_url,
      file_type: "video",
      upload_date: new Date(),
    });

    res.set("Cache-Control", "public, max-age=86400"); // Cache for 1 day
    res.send(result);
  } catch (error) {
    console.error("Upload error:", error);
    // Handle timeout errors specifically
    if (error.name === "TimeoutError") {
      return res.status(408).send({
        message: "Request Timeout. The server took too long to respond.",
      });
    }
    // Handle file size limit errors
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_FILE_SIZE"
    ) {
      return res
        .status(400)
        .send({ message: "File size exceeds the 10MB limit." });
    }
    res.status(500).send({ message: "Upload failed", error: error.message });
  }
});

//============================
// DELETE IMAGE MEDIA FILE
//============================
uploadRouter.delete("/delete/:public_id", async (req, res) => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const { public_id } = req.params;

  try {
    const result = await cloudinary.uploader.destroy(public_id, {
      invalidate: true,
      resource_type: "image",
    });

    // Optionally, remove the record from your MySQL database if needed
    await db("uploads")
      .where({
        file_url: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${public_id}`,
      })
      .del();

    res.status(200).send({ message: "Deletion successful", result });
  } catch (error) {
    res.status(500).send({ message: "Deletion failed", error: error.message });
  }
});

export default uploadRouter;
