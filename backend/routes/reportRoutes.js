import express from "express";
import expressAsyncHandler from "express-async-handler";
import { isAuth, isAdmin } from "../utils.js";
import ReportModel from "../models/reportModel.js";

const reportRouter = express.Router();

//====================
// Create a new report
//====================
reportRouter.post(
  "/",
  isAuth,
  expressAsyncHandler(async (req, res) => {
    try {
      // Check if the user's account is verified
      if (!req.user.isAccountVerified) {
        return res.status(403).json({
          message:
            "Your account is not verified. Please verify your account to create a report.",
        });
      }

      const reportData = {
        ...req.body,
        userId: req.user.id,
        privacyPreference: req.body.privacyPreference || "public",
      };
      // console.log("Report data to insert:", reportData);

      const report = await ReportModel.createReport(reportData);
      res.status(201).json(report);
    } catch (error) {
      console.error("Error during report creation:", error);
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Approve/Disapprove Reports
//=================
reportRouter.put(
  "/update-status",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const { reportIds, action } = req.body;

    if (!reportIds || !Array.isArray(reportIds) || !action) {
      return res.status(400).json({
        message: "Invalid request. Please provide report IDs and action.",
      });
    }

    if (!["approve", "disapprove"].includes(action)) {
      return res
        .status(400)
        .json({ message: 'Invalid action. Use "approve" or "disapprove".' });
    }

    try {
      const result = await ReportModel.updateStatus(reportIds, action);

      res.status(200).json({
        message: `${result.length} reports were successfully ${
          action === "approve" ? "approved" : "disapproved"
        }.`,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  })
);

//====================
// Fetch latest 10 reports
//====================
reportRouter.get(
  "/",
  expressAsyncHandler(async (req, res) => {
    try {
      const reports = await ReportModel.getLatestReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//=================
// Filter reports
//=================
reportRouter.get(
  "/filters",
  expressAsyncHandler(async (req, res) => {
    const { query } = req;

    const filters = {
      searchQuery: query.searchQuery || "all",
      status: query.status || "all",
      issueType: query.issueType || "all",
      privacyPreference: query.privacyPreference || "all",
    };
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;

    try {
      const { reports, countReports, pages } = await ReportModel.filterReports(
        filters,
        page,
        limit
      );

      res.send({ reports, countReports, page, pages });
    } catch (error) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  })
);

//====================
// Backend route for exporting all reports
//====================
reportRouter.get(
  "/export",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const { searchQuery, status, issueType, privacyPreference } = req.query;

      const filters = {
        searchQuery: searchQuery || "all",
        status: status || "all",
        issueType: issueType || "all",
        privacyPreference: privacyPreference || "all",
      };

      const reports = await ReportModel.filterReports(filters, 1, 10000); // Retrieve all records without pagination

      res.json({ reports: reports.reports });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data for export" });
    }
  })
);

//====================
// Fetch a report by ID
//====================
reportRouter.get(
  "/:id",
  expressAsyncHandler(async (req, res) => {
    try {
      const report = await ReportModel.getReportById(req.params.id);
      if (report) {
        res.json(report);
      } else {
        res.status(404).json({ message: "Report not found" });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//====================
// Fetch a report by slug
//====================
reportRouter.get(
  "/slug/:slug",
  expressAsyncHandler(async (req, res) => {
    try {
      const report = await ReportModel.getReportBySlug(req.params.slug);
      if (report) {
        res.json(report);
      } else {
        res.status(404).json({ message: "Report not found" });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//====================
// Update an existing report
//====================
reportRouter.put(
  "/:id",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const reportId = req.params.id;

      // Find the report by ID and update it with the request body
      const updatedReport = await ReportModel.updateReport(reportId, req.body);

      if (!updatedReport) {
        return res.status(404).json({ message: "Report not found" });
      }

      res.status(200).json(updatedReport);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//====================
// Approve a report
//====================
reportRouter.put(
  "/:id/approve",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const report = await ReportModel.getReportById(req.params.id);
      if (report) {
        if (report.status === "approved") {
          return res
            .status(400)
            .json({ message: "Report is already approved" });
        }
        report.status = "approved";
        const updatedReport = await ReportModel.updateReport(
          req.params.id,
          report
        );
        res.json(updatedReport);
      } else {
        res.status(404).json({ message: "Report not found" });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//====================
// Disapprove a report
//====================
reportRouter.put(
  "/:id/disapprove",
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const report = await ReportModel.getReportById(req.params.id);
      if (report) {
        if (report.status === "disapproved") {
          return res
            .status(400)
            .json({ message: "Report is already disapproved" });
        }
        report.status = "disapproved";
        const updatedReport = await ReportModel.updateReport(
          req.params.id,
          report
        );
        res.json(updatedReport);
      } else {
        res.status(404).json({ message: "Report not found" });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

//==================
// Delete a report
//==================
reportRouter.delete(
  "/:id",
  //   isAuth,
  //   isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      const result = await ReportModel.deleteReport(req.params.id);
      if (result) {
        res.json({ message: "Report deleted successfully" });
      } else {
        res.status(404).json({ message: "Report not found" });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  })
);

export default reportRouter;
