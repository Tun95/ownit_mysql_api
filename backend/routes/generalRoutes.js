import express from "express";
import expressAsyncHandler from "express-async-handler";
import { isAuth, isAdmin } from "../utils.js";
import db from "../db/knex.js";

const generalRouter = express.Router();

//===========
// SUMMARY
//===========
generalRouter.get(
  "/summary",
  // isAuth,
  // isAdmin,
  expressAsyncHandler(async (req, res) => {
    try {
      // Total registered users
      const totalUsersCount = await db("users").count("id as count");
      const totalUsers = totalUsersCount[0].count;

      // Total reports
      const totalReportsCount = await db("reports").count("id as count");
      const totalReports = totalReportsCount[0].count;

      // Breakdown of report statuses
      const approvedReportsCount = await db("reports")
        .where("status", "approved")
        .count("id as count");
      const pendingReportsCount = await db("reports")
        .where("status", "pending")
        .count("id as count");
      const disapprovedReportsCount = await db("reports")
        .where("status", "disapproved")
        .count("id as count");

      // Last 10 days (from today back)
      const last10Days = Array.from({ length: 10 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i); // Move back by i days
        return date.toISOString().split("T")[0]; // Format date to 'YYYY-MM-DD'
      }).reverse(); // Reverse to have the latest day at the end

      // Last 10 days registered users
      const last10DaysUsers = await db("users")
        .select(db.raw("DATE(created_at) as date"))
        .count("id as totalUsers")
        .whereRaw(
          `DATE(created_at) IN (${last10Days.map(() => "?").join(",")})`,
          last10Days
        )
        .groupByRaw("DATE(created_at)")
        .orderBy("date", "asc");

      // Last 10 days reports
      const last10DaysReports = await db("reports")
        .select(db.raw("DATE(created_at) as date"))
        .count("id as totalReports")
        .whereRaw(
          `DATE(created_at) IN (${last10Days.map(() => "?").join(",")})`,
          last10Days
        )
        .groupByRaw("DATE(created_at)")
        .orderBy("date", "asc");

      // Log to check results
      console.log("Last 10 days users:", last10DaysUsers);
      console.log("Last 10 days reports:", last10DaysReports);

      // Normalize date format to 'YYYY-MM-DD'
      const normalizeDate = (date) =>
        new Date(date).toISOString().split("T")[0];

      // Generate zero data for missing days in the last 10 days
      const resultsWithZeroData = last10Days.map((date) => ({
        date,
        totalUsers: 0,
        totalReports: 0,
      }));

      // Merge results with users and reports data
      const mergedResults = last10Days.map((date) => {
        const normalizedDate = normalizeDate(date);

        const usersData = last10DaysUsers.find(
          (user) => normalizeDate(user.date) === normalizedDate
        ) || { totalUsers: 0 };

        const reportsData = last10DaysReports.find(
          (report) => normalizeDate(report.date) === normalizedDate
        ) || { totalReports: 0 };

        return {
          date: normalizedDate,
          totalUsers: usersData.totalUsers,
          totalReports: reportsData.totalReports,
        };
      });

      // Log final merged results to debug
      console.log("Merged results:", mergedResults);

      // Ensure that every day in last10Days is accounted for
      const finalResults = mergedResults.map((result) => {
        const zeroData = resultsWithZeroData.find(
          (item) => item.date === result.date
        );
        return zeroData ? { ...zeroData, ...result } : result;
      });

      res.send({
        totalUsers,
        totalReports,
        reportStatusCounts: {
          approved: approvedReportsCount[0].count,
          pending: pendingReportsCount[0].count,
          disapproved: disapprovedReportsCount[0].count,
        },
        last10DaysData: finalResults,
      });
    } catch (error) {
      console.error("Error fetching summary:", error);
      res.status(500).send({ message: "Internal server error" });
    }
  })
);

export default generalRouter;
