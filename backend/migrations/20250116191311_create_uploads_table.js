export const up = function (knex) {
  return knex.schema.createTable("uploads", (table) => {
    table.increments("id").primary(); // Auto-incrementing ID
    table.string("file_url").notNullable(); // File URL
    table.string("file_type").notNullable(); // File type (image or video)
    table.timestamp("upload_date").notNullable().defaultTo(knex.fn.now()); // Upload timestamp
  });
};

export const down = function (knex) {
  return knex.schema.dropTable("uploads");
};
