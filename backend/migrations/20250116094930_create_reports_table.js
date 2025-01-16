export const up = function (knex) {
  return knex.schema.createTable("reports", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("(UUID())"));
    table.string("schoolName").notNullable();
    table.string("slug").unique();
    table.text("images"); 
    table.string("video");
    table
      .enu("status", ["pending", "approved", "disapproved"])
      .defaultTo("pending");
    table.string("schoolLocation");
    table.text("issueType"); 
    table.text("description");
    table.text("comment");
    table.uuid("userId").references("id").inTable("users").onDelete("CASCADE");
    table.enu("privacyPreference", ["public", "anonymous"]).defaultTo("public");
    table.timestamps(true, true);
  });
};

export const down = function (knex) {
  return knex.schema.dropTable("reports");
};
