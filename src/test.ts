import { Constraint, Table, type Migration } from "./migrations";

const testMigration = {
  id: "test-migration001",
  up: () => {
    return new Table("test_table1")
      .addField("id", "int", Constraint.PRIMARY_KEY)
      .addField("name", "text", Constraint.NOT_NULL)
      .create();
  },
  down: () => {
    return new Table("test_table1").drop();
  },
};

const migrations: Migration[] = [testMigration];

migrations.forEach((migration) => {
  console.group(migration.id);
  console.log(`Running migration #${migration.id}`);
  console.log("up query:");
  console.log(migration.up());
  console.log("-------");
  console.log("down query:");
  console.log(migration.down());
  console.groupEnd();
});
