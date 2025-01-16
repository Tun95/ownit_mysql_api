import db from "../db/knex.js";
import slugify from "slugify";
import { v4 as uuidv4 } from "uuid";
const ReportModel = {};

// Function to create a new report
ReportModel.createReport = async (reportData) => {
  try {
    // Generate a slug from the school name
    const slug = slugify(reportData.schoolName, {
      lower: true,
      remove: null,
    });

    // Generate a new UUID for the report
    const id = uuidv4();

    // Insert the report data into the database with the generated UUID
    await db("reports").insert({
      id: id,
      schoolName: reportData.schoolName,
      slug: slug,
      images: reportData.images.join(","),
      video: reportData.video,
      status: reportData.status || "pending",
      schoolLocation: reportData.schoolLocation,
      issueType: reportData.issueType.join(","),
      description: reportData.description,
      comment: reportData.comment,
      userId: reportData.userId,
      privacyPreference: reportData.privacyPreference || "public",
    });

    // console.log("Insert ID:", id);

    // Retrieve the newly created report by its ID
    const createdReport = await db("reports").where({ id: id }).first();

    // Verify the createdReport is valid
    if (!createdReport) {
      throw new Error("Failed to retrieve created report");
    }

    // Handle duplicate slug generation
    await ReportModel.generateUniqueSlug(id, createdReport.schoolName);

    return createdReport;
  } catch (error) {
    console.error("Error creating report:", error.message);
    throw new Error("Error creating report: " + error.message);
  }
};

// Generate unique slug if there are duplicates
ReportModel.generateUniqueSlug = async (id, schoolName) => {
  let baseSlug = slugify(schoolName, { lower: true, remove: null });

  const existingReport = await db("reports").where({ slug: baseSlug }).first();

  if (existingReport) {
    let counter = 1;
    // Check for the next available slug by appending a counter
    while (
      await db("reports")
        .where({ slug: `${baseSlug}-${counter}` })
        .first()
    ) {
      counter++;
    }
    // Update with unique slug
    await db("reports")
      .where({ id: id.toString() }) 
      .update({
        slug: `${baseSlug}-${counter}`,
      });
  } else {
    // If no duplicate, update the report with the base slug
    await db("reports").where({ id: id.toString() }).update({
      slug: baseSlug,
    });
  }
};

// Function to update the status of reports
ReportModel.updateStatus = async (reportIds, action) => {
  try {
    const newStatus = action === "approve" ? "approved" : "disapproved";
    await db("reports").whereIn("id", reportIds).update({ status: newStatus });

    const updatedReports = await db("reports").whereIn("id", reportIds);
    return updatedReports;
  } catch (error) {
    throw new Error("Error updating status: " + error.message);
  }
};

// Function to fetch latest reports
ReportModel.getLatestReports = async () => {
  try {
    const reports = await db("reports")
      .select("*")
      .orderBy("created_at", "desc")
      .limit(10);

    return reports;
  } catch (error) {
    throw new Error("Error fetching latest reports: " + error.message);
  }
};

// Function to filter reports based on query parameters
ReportModel.filterReports = async (filters, page = 1, limit = 10) => {
  try {
    const query = db("reports").select("*").orderBy("created_at", "desc");

    // Apply filters dynamically based on query
    if (filters.searchQuery && filters.searchQuery !== "all") {
      query.where("schoolName", "like", `%${filters.searchQuery}%`);
    }
    if (filters.status && filters.status !== "all") {
      query.whereIn("status", filters.status.split(","));
    }
    if (filters.issueType && filters.issueType !== "all") {
      query.whereRaw("FIND_IN_SET(?, issueType)", filters.issueType.split(","));
    }
    if (filters.privacyPreference && filters.privacyPreference !== "all") {
      query.whereIn("privacyPreference", filters.privacyPreference.split(","));
    }

    const offset = (page - 1) * limit;
    const reports = await query.limit(limit).offset(offset);

    // Get the count of reports for pagination with applied filters
    const countQuery = db("reports").count("id as count");

    // Apply the same filters to the count query
    if (filters.searchQuery && filters.searchQuery !== "all") {
      countQuery.where("schoolName", "like", `%${filters.searchQuery}%`);
    }
    if (filters.status && filters.status !== "all") {
      countQuery.whereIn("status", filters.status.split(","));
    }
    if (filters.issueType && filters.issueType !== "all") {
      countQuery.whereRaw(
        "FIND_IN_SET(?, issueType)",
        filters.issueType.split(",")
      );
    }
    if (filters.privacyPreference && filters.privacyPreference !== "all") {
      countQuery.whereIn(
        "privacyPreference",
        filters.privacyPreference.split(",")
      );
    }

    const [{ count }] = await countQuery;

    // Calculate the total number of pages
    const pages = Math.ceil(count / limit);

    return { reports, countReports: count, page, pages };
  } catch (error) {
    throw new Error("Error filtering reports: " + error.message);
  }
};

// Function to get a report by ID
ReportModel.getReportById = async (id) => {
  try {
    const report = await db("reports").where("id", id).first();
    return report;
  } catch (error) {
    throw new Error("Error fetching report by ID: " + error.message);
  }
};

// Function to get a report by slug
ReportModel.getReportBySlug = async (slug) => {
  try {
    const report = await db("reports").where("slug", slug).first();
    return report;
  } catch (error) {
    throw new Error("Error fetching report by slug: " + error.message);
  }
};

// Function to update a report
ReportModel.updateReport = async (id, reportData) => {
  try {
    await db("reports").where("id", id).update(reportData);
    const updatedReport = await db("reports").where("id", id).first();
    return updatedReport;
  } catch (error) {
    throw new Error("Error updating report: " + error.message);
  }
};

// Function to delete a report
ReportModel.deleteReport = async (id) => {
  try {
    const result = await db("reports").where("id", id).del();
    return result;
  } catch (error) {
    throw new Error("Error deleting report: " + error.message);
  }
};

export default ReportModel;
