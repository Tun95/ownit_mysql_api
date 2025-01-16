export const up = function (knex) {
  return knex.schema.createTable("uploads", (table) => {
    table.increments("id").primary();
    table.string("file_url").notNullable();
    table.string("file_type").notNullable();
    table.timestamp("upload_date").notNullable().defaultTo(knex.fn.now());
  });
};

export const down = function (knex) {
  return knex.schema.dropTable("uploads");
};
